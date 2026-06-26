import { buildApp } from "./app.js";
import { logger } from "./utils/logger.js";
import { startWorkers } from "./workers/index.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

async function main() {
  const app = await buildApp();

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info(`API server running on port ${PORT}`);

  // Start BullMQ workers
  await startWorkers();
  logger.info("Background workers started");

  const shutdown = async () => {
    logger.info("Shutting down...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
