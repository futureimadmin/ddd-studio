import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { AiError } from "../ai/run-agent";
import { IntrospectionError } from "../introspect";
import { logger } from "../logger";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Validate request data against a schema; a failure becomes a 400 that names every problem. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new HttpError(400, z.prettifyError(result.error), {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export const param = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : (value ?? ""));

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }
  if (err instanceof AiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof IntrospectionError) {
    const status = err.code === "unsupported" ? 501 : err.code === "timeout" ? 504 : 502;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }
  // body-parser problems (malformed JSON, payload too large)
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status < 500) {
    res.status(status).json({ error: err.type === "entity.too.large" ? "Request body too large" : "Malformed request" });
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
};
