import type { ZodObject, ZodRawShape } from "zod";
import { config } from "../config";

export class AiError extends Error {
  constructor(
    message: string,
    /** HTTP status the API should answer with. */
    readonly status = 502,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Pull a JSON object out of model text, tolerating code fences and prose around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next candidate */
    }
  }
  throw new AiError("The model did not return valid JSON");
}

/**
 * Run a single-turn ADK LlmAgent whose reply is constrained to `outputSchema` and return the
 * parsed JSON. ADK is imported lazily: it is large, and the server should boot instantly and
 * work offline without ever loading it.
 *
 * Credentials must already be configured (see `ensureVertexAdc`).
 */
export async function runStructuredAgent(opts: {
  name: string;
  instruction: string;
  outputSchema: ZodObject<ZodRawShape>;
  prompt: string;
}): Promise<unknown> {
  const { LlmAgent, InMemoryRunner, isFinalResponse } = await import("@google/adk");

  const agent = new LlmAgent({
    name: opts.name,
    model: config.geminiModel,
    instruction: opts.instruction,
    outputSchema: opts.outputSchema,
  });
  const runner = new InMemoryRunner({ agent, appName: `ddd-studio-${opts.name}` });

  let finalText = "";
  try {
    for await (const event of runner.runEphemeral({
      userId: "ddd-studio",
      newMessage: { role: "user", parts: [{ text: opts.prompt }] },
    })) {
      if (event.errorCode || event.errorMessage) {
        throw new AiError(`Gemini returned an error: ${event.errorMessage ?? event.errorCode}`);
      }
      if (isFinalResponse(event)) {
        const text = (event.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (text) finalText = text;
      }
    }
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!finalText) throw new AiError("Gemini returned an empty response");
  return extractJson(finalText);
}
