/**
 * Gemini on Vertex AI using Application Default Credentials (ADC) — no API keys.
 *
 * Local:   gcloud auth application-default login   +  GOOGLE_CLOUD_PROJECT=<project>
 * Runtime: GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json, or workload identity on GCP
 * Offline: DDD_AI_OFFLINE=1 forces the deterministic "Studio Sketch" designer/codegen
 */
import { config } from "../config";

export type AdcStatus = {
  ready: boolean;
  mode: "vertex-adc" | "offline";
  project?: string;
  location?: string;
  /** Why the offline sketch is being used (only when `ready` is false). */
  reason?: string;
};

const FAILURE_TTL_MS = 10_000;
let ready: AdcStatus | null = null;
let failed: { at: number; status: AdcStatus } | null = null;

export function resetAdcCache(): void {
  ready = null;
  failed = null;
}

function offline(reason: string, extra: Partial<AdcStatus> = {}): AdcStatus {
  const status: AdcStatus = { ready: false, mode: "offline", reason, ...extra };
  failed = { at: Date.now(), status };
  return status;
}

/**
 * Verifies that ADC can mint a token and that a project is known, then points the GenAI SDK
 * at Vertex. A success is cached; a failure is re-checked after a few seconds so that running
 * `gcloud auth application-default login` takes effect without restarting the server.
 */
export async function ensureVertexAdc(): Promise<AdcStatus> {
  if (config.aiOffline) return { ready: false, mode: "offline", reason: "DDD_AI_OFFLINE is set" };
  if (ready) return ready;
  if (failed && Date.now() - failed.at < FAILURE_TTL_MS) return failed.status;

  const location = config.googleCloudLocation;
  let project = config.googleCloudProject;

  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    // Fails fast on revoked / expired user credentials instead of at the first model call.
    await client.getAccessToken();
    if (!project) project = (await auth.getProjectId().catch(() => undefined)) || undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return offline(
      `Application Default Credentials are not usable (${message}). Run "gcloud auth application-default login" or set GOOGLE_APPLICATION_CREDENTIALS.`,
      { location },
    );
  }

  if (!project) {
    return offline(
      "Credentials found, but no project. Set GOOGLE_CLOUD_PROJECT (or run 'gcloud auth application-default set-quota-project <id>').",
      { location },
    );
  }

  // The GenAI SDK (used by ADK) reads these to choose Vertex + ADC over an API key.
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "TRUE";
  process.env.GOOGLE_CLOUD_PROJECT = project;
  process.env.GOOGLE_CLOUD_LOCATION = location;

  failed = null;
  ready = { ready: true, mode: "vertex-adc", project, location };
  return ready;
}
