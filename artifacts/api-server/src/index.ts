import app from "./app";
import { logger } from "./lib/logger";

// StackBlitz commonly exposes the web preview through PORT=5173. The API must not
// inherit that generic PORT or it collides with Vite. Replit/production can set API_PORT.
const rawPort = process.env["API_PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid API_PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
server.on("error", (err) => {
  logger.error({ err, port }, "Error listening on API port");
  process.exit(1);
});
