import { prisma } from "../../utils/prisma.js";
import { cacheDel } from "../../utils/redis.js";
import { emailService } from "../../services/emailService.js";
import { logger } from "../../utils/logger.js";

export async function deductCredit(userId: string, urlId: string, description: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    if (user.creditsBalance < 1) throw new Error("Insufficient credits");

    await tx.user.update({ where: { id: userId }, data: { creditsBalance: { decrement: 1 } } });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: "charge",
        amount: -1,
        balanceBefore: user.creditsBalance,
        balanceAfter: user.creditsBalance - 1,
        description,
        urlId,
      },
    });
    await tx.url.update({ where: { id: urlId }, data: { creditCharged: true } });
  });

  await cacheDel(`credits:${userId}`);

  // Check low credit alert
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (updated.creditsBalance <= updated.lowCreditThreshold && updated.notifyOnLowCredits) {
    await emailService.sendLowCredits(updated.email, updated.creditsBalance);
    await prisma.notification.create({
      data: {
        userId,
        type: "low_credits",
        title: "Low Credit Balance",
        message: `Your credit balance has dropped to ${updated.creditsBalance}.`,
      },
    });
  }
}

export async function refundCredit(userId: string, urlId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });

    await tx.user.update({ where: { id: userId }, data: { creditsBalance: { increment: 1 } } });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: "auto_refund",
        amount: 1,
        balanceBefore: user.creditsBalance,
        balanceAfter: user.creditsBalance + 1,
        description: "Auto-refund: URL not indexed after 10 days",
        urlId,
      },
    });
    await tx.url.update({
      where: { id: urlId },
      data: { creditRefunded: true, refundedAt: new Date(), status: "refunded" },
    });
  });

  await cacheDel(`credits:${userId}`);
}

export async function adminGrantCredits(adminId: string, targetUserId: string, amount: number, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: targetUserId } });
    const newBalance = user.creditsBalance + amount;

    if (newBalance < 0) {
      throw new Error(`Deduction of ${Math.abs(amount)} would result in negative balance (current: ${user.creditsBalance})`);
    }

    await tx.user.update({ where: { id: targetUserId }, data: { creditsBalance: { increment: amount } } });
    await tx.creditTransaction.create({
      data: {
        userId: targetUserId,
        type: amount > 0 ? "admin_grant" : "admin_deduct",
        amount,
        balanceBefore: user.creditsBalance,
        balanceAfter: newBalance,
        description: reason,
        performedBy: adminId,
      },
    });
  });

  await cacheDel(`credits:${targetUserId}`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
  if (user.notifyOnCreditsGranted) {
    await emailService.sendCreditsGranted(user.email, amount, user.creditsBalance, reason);
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: "credits_granted",
        title: amount > 0 ? "Credits Added" : "Credits Deducted",
        message: `${Math.abs(amount)} credit(s) have been ${amount > 0 ? "added to" : "removed from"} your account. Reason: ${reason}`,
      },
    });
  }

  logger.info({ adminId, targetUserId, amount, reason }, "Admin credit adjustment");
}
