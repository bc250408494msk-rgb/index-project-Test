import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";

const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  projectId: z.string().uuid(),
  status: z.enum(["active", "paused", "completed"]).optional(),
});

export default async function campaignRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (req, reply) => {
    const userId = (req as any).user.id;
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(campaigns);
  });

  app.post("/", async (req, reply) => {
    const userId = (req as any).user.id;
    const body = campaignSchema.parse(req.body);
    const project = await prisma.project.findFirst({ where: { id: body.projectId, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const campaign = await prisma.campaign.create({ data: { ...body, userId } });
    return reply.status(201).send(campaign);
  });

  app.get("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, userId }, include: { project: true } });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    return reply.send(campaign);
  });

  app.put("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const body = campaignSchema.partial().parse(req.body);
    const campaign = await prisma.campaign.findFirst({ where: { id, userId } });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    const updated = await prisma.campaign.update({ where: { id }, data: body });
    return reply.send(updated);
  });

  app.delete("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, userId } });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    await prisma.campaign.delete({ where: { id } });
    return reply.send({ message: "Campaign deleted" });
  });
}
