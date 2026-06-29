import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";

const projectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export default async function projectRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // GET /api/projects
  app.get("/", async (req, reply) => {
    const userId = (req as any).user.id;
    const [projects, indexedCounts] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { urls: true } } },
      }),
      prisma.url.groupBy({
        by: ["projectId"],
        where: { userId, status: "indexed", projectId: { not: null } },
        _count: { id: true },
      }),
    ]);
    const indexedMap = Object.fromEntries(indexedCounts.map((r) => [r.projectId, r._count.id]));
    return reply.send(
      projects.map((p) => ({ ...p, urlCount: p._count.urls, indexedCount: indexedMap[p.id] ?? 0 }))
    );
  });

  // POST /api/projects
  app.post("/", async (req, reply) => {
    const userId = (req as any).user.id;
    const body = projectSchema.parse(req.body);
    const project = await prisma.project.create({ data: { ...body, userId } });
    return reply.status(201).send(project);
  });

  // GET /api/projects/:id
  app.get("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return reply.send(project);
  });

  // PUT /api/projects/:id
  app.put("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const body = projectSchema.partial().parse(req.body);
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const updated = await prisma.project.update({ where: { id }, data: body });
    return reply.send(updated);
  });

  // DELETE /api/projects/:id
  app.delete("/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });
    await prisma.project.delete({ where: { id } });
    return reply.send({ message: "Project deleted" });
  });

  // GET /api/projects/:id/stats
  app.get("/:id/stats", async (req, reply) => {
    const userId = (req as any).user.id;
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const [total, indexed, failed, refunded] = await Promise.all([
      prisma.url.count({ where: { projectId: id } }),
      prisma.url.count({ where: { projectId: id, status: "indexed" } }),
      prisma.url.count({ where: { projectId: id, status: { in: ["health_failed", "not_indexed"] } } }),
      prisma.url.count({ where: { projectId: id, status: "refunded" } }),
    ]);

    return reply.send({ total, indexed, failed, refunded, pending: total - indexed - failed - refunded });
  });
}
