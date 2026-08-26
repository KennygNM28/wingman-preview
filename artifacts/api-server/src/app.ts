import express, { type RequestHandler } from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

// Vercel's serverless TypeScript bundler can resolve a conflicting Express
// Application type in this pnpm workspace. The runtime object returned by
// express() is correct, so keep middleware wiring runtime-typed here.
const app: any = express();
const pinoHttp = pinoHttpModule as unknown as (options: any) => RequestHandler;

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
