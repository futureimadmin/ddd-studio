import { createApp } from "./app";
import { config } from "./config";
import { createStore } from "./domain/store";
import { logger } from "./logger";

const store = createStore({
  dataDir: config.dataDir,
  log: {
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (err, msg) => logger.error({ err }, msg),
  },
});

const server = createApp(store).listen(config.port, () => {
  logger.info({ port: config.port, data: store.dataFile }, "DDD Studio server listening");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  logger.error({ err }, err.code === "EADDRINUSE" ? `Port ${config.port} is already in use` : "Server error");
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
