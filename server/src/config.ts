import path from "node:path";

/** server/ — the same directory whether running from src/ (tsx) or dist/ (bundle). */
export const serverRoot = path.resolve(import.meta.dirname, "..");

// Load server/.env if present. Variables that are already set in the environment win.
try {
  process.loadEnvFile(path.join(serverRoot, ".env"));
} catch {
  /* no .env file — fine */
}

const truthy = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
const first = (...values: Array<string | undefined>) => values.find((v) => v && v.trim())?.trim();

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid PORT value: "${raw}"`);
  return port;
}

export const config = {
  port: parsePort(process.env.PORT),
  isProduction: process.env.NODE_ENV === "production",
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** Where workspace.json lives. Defaults to server/data regardless of the working directory. */
  dataDir: path.resolve(process.env.DDD_DATA_DIR || path.join(serverRoot, "data")),
  /** Built client, served by the API in production. */
  clientDist: path.resolve(process.env.CLIENT_DIST || path.join(serverRoot, "..", "client", "dist")),
  corsOrigin: first(process.env.CORS_ORIGIN),
  aiOffline: truthy(process.env.DDD_AI_OFFLINE),
  geminiModel: first(process.env.GEMINI_MODEL) ?? "gemini-2.5-flash",
  googleCloudProject: first(process.env.GOOGLE_CLOUD_PROJECT, process.env.GCLOUD_PROJECT, process.env.GCP_PROJECT),
  googleCloudLocation: first(process.env.GOOGLE_CLOUD_LOCATION, process.env.VERTEX_LOCATION) ?? "us-central1",
};
