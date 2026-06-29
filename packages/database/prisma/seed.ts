import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Default system settings
  const settings = [
    { key: "refund_window_days", value: "10", description: "Days before auto-refund if URL not indexed" },
    { key: "retry_window_days", value: "7", description: "Days before auto-retry of unindexed URL" },
    { key: "low_credit_default", value: "5", description: "Default low-credit alert threshold" },
    { key: "max_urls_per_batch", value: "500", description: "Max URLs per submission batch" },
    { key: "health_check_timeout_ms", value: "10000", description: "Health check HTTP timeout in ms" },
    { key: "malware_check_enabled", value: "true", description: "Enable Google Safe Browsing malware check" },
    { key: "verification_method", value: "isindexed", description: "Primary verification method: google_cse or isindexed" },
    { key: "indexnow_enabled", value: "true", description: "Enable IndexNow signal for Bing" },
    { key: "double_verify_indexed", value: "true", description: "Require 2 consecutive positive results before marking indexed" },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value, description: setting.description },
    });
  }

  // Default admin user
  const adminEmail = process.env.ADMIN_EMAIL || "admin@indexmenow.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123!";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const apiKey = createHash("sha256").update(`admin-api-key-${Date.now()}`).digest("hex");

    await prisma.user.create({
      data: {
        username: "admin",
        email: adminEmail,
        passwordHash,
        apiKey,
        role: "admin",
        emailVerified: true,
        creditsBalance: 9999,
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  }

  console.log("Seed completed.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
