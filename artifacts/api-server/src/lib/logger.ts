import pino from "pino";

const pretty = process.env.PINO_PRETTY === "true";

// Keep the default logger worker-free for StackBlitz/WebContainers.
// Pretty transport can still be enabled explicitly in environments that support it.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
