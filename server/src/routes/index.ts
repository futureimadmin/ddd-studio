import { Router, type IRouter } from "express";
import type { Store } from "../domain/store";
import { aiRoutes } from "./ai.routes";
import { connectionRoutes } from "./connections.routes";
import { modelRoutes } from "./model.routes";

export function apiRouter(store: Store): IRouter {
  const router = Router();
  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok", persistence: { file: store.dataFile } });
  });
  router.use(modelRoutes(store));
  router.use(connectionRoutes(store));
  router.use(aiRoutes(store));
  return router;
}
