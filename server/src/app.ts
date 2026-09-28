import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { config } from "./config";
import type { Store } from "./domain/store";
import { logger } from "./logger";
import { errorHandler, notFound } from "./routes/http";
import { apiRouter } from "./routes";

export function createApp(store: Store): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/healthz" },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  // Same-origin by default (Vite proxies /api in dev; the server serves the built client in production).
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "5mb" }));

  app.use("/api", apiRouter(store));
  app.use("/api", notFound);

  // Serve the built client (npm run build) with SPA fallback.
  const indexHtml = path.join(config.clientDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => (req.method === "GET" ? res.sendFile(indexHtml) : next()));
  }

  app.use(errorHandler);
  return app;
}
