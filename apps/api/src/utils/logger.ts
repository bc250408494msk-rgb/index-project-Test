import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: isDev ? "debug" : "info",
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" } }
    : undefined,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, userId: req.user?.id }),
    err: pino.stdSerializers.err,
  },
});
