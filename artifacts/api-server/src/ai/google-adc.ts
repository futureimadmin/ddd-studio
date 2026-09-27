/**
 * Configure Google Gemini / ADK to use Application Default Credentials (ADC)
 * via Vertex AI. Design and codegen must not depend on API keys.
 *
 * Setup (local):
 *   gcloud auth application-default login
 *   export GOOGLE_CLOUD_PROJECT=your-project
 *   export GOOGLE_CLOUD_LOCATION=us-central1   # optional
 *
 * Setup (runtime / CI):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
 *   # or workload identity / metadata server on GCP
 *
 * Force offline sketch designers/codegen:
 *   export DDD_AI_OFFLINE=1
 */
import { existsSync } from "node:fs";

export type AdcStatus = {
  ready: boolean;
  mode: "vertex-adc" | "offline";
  project?: string;
  location?: string;
  reason?: string;
};

let cached: AdcStatus | null = null;

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const n = v.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

/**
 * Prefer Vertex + ADC. Do not require GOOGLE_GENAI_API_KEY / GEMINI_API_KEY.
 */
export async function ensureVertexAdc(): Promise<AdcStatus> {
  if (cached) return cached;

  if (truthy(process.env.DDD_AI_OFFLINE)) {
    cached = { ready: false, mode: "offline", reason: "DDD_AI_OFFLINE is set" };
    return cached;
  }

  // Always target Vertex so google-genai / ADK use ADC instead of API keys.
  if (!process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "TRUE";
  }
  if (!process.env.GOOGLE_GENAI_USE_ENTERPRISE && process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    process.env.GOOGLE_GENAI_USE_ENTERPRISE = process.env.GOOGLE_GENAI_USE_VERTEXAI;
  }

  const location =
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.GCLOUD_LOCATION ||
    process.env.VERTEX_LOCATION ||
    "us-central1";
  process.env.GOOGLE_CLOUD_LOCATION = location;

  let project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_PROJECT_ID;

  try {
    const authMod = await import("google-auth-library");
    const { GoogleAuth } = authMod as {
      GoogleAuth: new (opts?: Record<string, unknown>) => {
        getClient: () => Promise<unknown>;
        getProjectId: () => Promise<string | undefined>;
      };
    };
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    await auth.getClient();
    if (!project) {
      try {
        project = (await auth.getProjectId()) || undefined;
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    const hasCredFile =
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) &&
      existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!);
    const onGcp = Boolean(
      process.env.K_SERVICE ||
        process.env.GKE_CLUSTER_NAME ||
        process.env.GAE_ENV ||
        process.env.GOOGLE_CLOUD_PROJECT,
    );

    if (!hasCredFile && !onGcp && !project) {
      const message = err instanceof Error ? err.message : String(err);
      cached = {
        ready: false,
        mode: "offline",
        reason: `ADC not available (${message}). Run: gcloud auth application-default login && export GOOGLE_CLOUD_PROJECT=...`,
      };
      return cached;
    }
  }

  if (project) {
    process.env.GOOGLE_CLOUD_PROJECT = project;
  }

  if (!project) {
    cached = {
      ready: false,
      mode: "offline",
      location,
      reason:
        "GOOGLE_CLOUD_PROJECT is required for Vertex AI with ADC. Set the env var or use credentials that include project_id.",
    };
    return cached;
  }

  cached = {
    ready: true,
    mode: "vertex-adc",
    project,
    location,
  };
  return cached;
}

export function resetAdcCache(): void {
  cached = null;
}
