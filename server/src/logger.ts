import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "res.headers['set-cookie']"],
  ...(config.isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});
