import { FastifyInstance } from "fastify";
import { prisma } from "../../utils/prisma.js";
import { cacheGet, cacheSet } from "../../utils/redis.js";
import { authenticate } from "../../middleware/authenticate.js";

export default async function creditRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // GET /api/credits/balance
  app.get("/balance", async (req, reply) => {
    const userId = (req as any).user.id;
    const cacheKey = `credits:${userId}`;
    const cached = await cacheGet<number>(cacheKey);
    if (cached !== null) return reply.send({ credits: cached });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsBalance: true } });
    await cacheSet(cacheKey, user.creditsBalance, 30);
    return reply.send({ credits: user.creditsBalance });
  });

  // GET /api/credits/transactions
  app.get("/transactions", async (req, reply) => {
    const userId = (req as any).user.id;
    const { type, limit = "50", offset = "0" } = req.query as any;

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: { url: { select: { url: true } } },
    });

    return reply.send(transactions);
  });
}
