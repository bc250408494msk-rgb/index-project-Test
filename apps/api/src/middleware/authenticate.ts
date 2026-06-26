import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../utils/prisma.js";
import { createHash } from "crypto";

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function authenticateOptional(req: FastifyRequest, _reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    // Optional — no error if not authenticated
  }
}

export async function apiKeyAuth(req: FastifyRequest, reply: FastifyReply) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    reply.status(401).send({ error: "API key required (X-API-KEY header)" });
    return;
  }

  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const keyRecord = await prisma.apiKey.findFirst({
    where: { keyHash, isActive: true },
    include: { user: true },
  });

  if (!keyRecord || !keyRecord.user.isActive) {
    reply.status(401).send({ error: "Invalid or inactive API key" });
    return;
  }

  // Update usage
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
  });

  (req as any).user = { id: keyRecord.user.id, role: keyRecord.user.role, email: keyRecord.user.email };
}
