/**
 * Code generation from a DDD Studio export document via Google ADK + Gemini (Vertex AI, ADC).
 * Design remains the source of truth; code is a projection of the JSON model.
 */
import { z } from "zod";
import { config } from "../config";
import type { DomainExportDocument } from "../domain/export";
import { ensureVertexAdc } from "./google-adc";
import { AiError, runStructuredAgent } from "./run-agent";

export const CODE_GENERATORS = {
  "gemini-adk": {
    id: "gemini-adk" as const,
    name: "Gemini ADK Codegen",
    description: "Generate source files from the domain export JSON via Google ADK 2.x + Gemini on Vertex AI (ADC).",
  },
  mock: {
    id: "mock" as const,
    name: "Studio Sketch Codegen",
    description: "Offline deterministic TypeScript stubs from the export (demos / CI / no API key).",
  },
} as const;

export type CodeGeneratorId = keyof typeof CODE_GENERATORS;

export type CodegenFile = {
  path: string;
  language: string;
  description: string;
  content: string;
};

export type CodegenResult = {
  stack: string;
  packageName: string;
  summary: string;
  files: CodegenFile[];
};

export type CodegenOptions = {
  stack?: string;
  packageName?: string;
  includeTests?: boolean;
  scope?: "full" | "commands" | "events" | "read-models" | "sagas";
};


function slugify(name: string): string {
  return (
    name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "domain"
  );
}

function pascal(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Deterministic offline codegen from export JSON. */
export function mockCodegen(doc: DomainExportDocument, options: CodegenOptions = {}): CodegenResult {
  const stack = options.stack || "typescript-express";
  const packageName = options.packageName || slugify(doc.projectName) || "domain";
  const scope = options.scope || "full";
  const files: CodegenFile[] = [];

  files.push({
    path: `src/domain/types.ts`,
    language: "typescript",
    description: "Shared domain primitives derived from the export.",
    content: `/** Generated from DDD Studio export ${doc.schemaVersion} @ ${doc.exportedAt} */
export type DomainId = string;

export interface DomainEventBase {
  eventName: string;
  eventVersion: string;
  occurredAt: string;
  aggregateId: string;
}
`,
  });

  const contexts = doc.boundedContexts;
  for (const ctx of contexts) {
    const ctxSlug = slugify(ctx.name);
    const elements = doc.elements.filter((e) => e.contextId === ctx.id);

    if (scope === "full" || scope === "commands") {
      for (const cmd of elements.filter((e) => e.kind === "command")) {
        const name = pascal(cmd.name);
        files.push({
          path: `src/${ctxSlug}/commands/${name}.ts`,
          language: "typescript",
          description: `Command ${cmd.name} in ${ctx.name}`,
          content: `/** Command: ${cmd.name}
 * ${cmd.description || "Intent to change state."}
 * Context: ${ctx.name}
 */
export type ${name}Command = {
  type: "${cmd.name}";
  payload: Record<string, unknown>;
};

export function assert${name}(cmd: ${name}Command): void {
  if (cmd.type !== "${cmd.name}") throw new Error("Invalid command type");
}
`,
        });
      }
      for (const h of elements.filter((e) => e.kind === "command-handler")) {
        const name = pascal(h.name);
        const handles = doc.cqrs.commandHandlers.find((x) => x.id === h.id)?.handlesCommandIds ?? [];
        const cmdNames = handles
          .map((id) => doc.elements.find((e) => e.id === id)?.name)
          .filter(Boolean);
        files.push({
          path: `src/${ctxSlug}/handlers/${name}.ts`,
          language: "typescript",
          description: `CQRS command handler ${h.name}`,
          content: `/** Command handler: ${h.name}
 * ${h.description || ""}
 * Handles: ${cmdNames.join(", ") || "(wire via handles edge)"}
 * Methods: ${(h.methods || []).join(", ") || "handle()"}
 */
export async function ${name.charAt(0).toLowerCase() + name.slice(1)}(command: { type: string; payload: Record<string, unknown> }): Promise<void> {
  // Load aggregate → apply → persist → raise domain events (design projection).
  void command;
  throw new Error("Not implemented — generated stub from DDD Studio export");
}
`,
        });
      }
    }

    if (scope === "full" || scope === "events") {
      for (const ev of elements.filter((e) => e.kind === "domain-event")) {
        const name = pascal(ev.name);
        files.push({
          path: `src/${ctxSlug}/events/${name}.ts`,
          language: "typescript",
          description: `Domain event ${ev.name}`,
          content: `/** Domain event: ${ev.name}
 * ${ev.description || ""}
 * Version: ${ev.eventVersion || "1.0.0"} · compatibility: ${ev.eventCompatibility || "backward"}
 */
export type ${name}Event = {
  eventName: "${ev.name}";
  eventVersion: "${ev.eventVersion || "1.0.0"}";
  occurredAt: string;
  aggregateId: string;
  payload: ${ev.eventPayloadSchema?.trim().startsWith("{") ? "Record<string, unknown> /* schema: see export */" : "Record<string, unknown>"};
};

export function ${name.charAt(0).toLowerCase() + name.slice(1)}(aggregateId: string, payload: Record<string, unknown>): ${name}Event {
  return {
    eventName: "${ev.name}",
    eventVersion: "${ev.eventVersion || "1.0.0"}",
    occurredAt: new Date().toISOString(),
    aggregateId,
    payload,
  };
}
`,
        });
      }
    }

    if (scope === "full" || scope === "read-models") {
      for (const rm of elements.filter((e) => e.kind === "read-model")) {
        const name = pascal(rm.name);
        const from = doc.cqrs.readModels.find((x) => x.id === rm.id)?.projectedFromEventIds ?? [];
        const eventNames = from.map((id) => doc.elements.find((e) => e.id === id)?.name).filter(Boolean);
        files.push({
          path: `src/${ctxSlug}/read-models/${name}.ts`,
          language: "typescript",
          description: `CQRS read model ${rm.name}`,
          content: `/** Read model: ${rm.name}
 * Projects from: ${eventNames.join(", ") || "(projects-to edges)"}
 */
export type ${name} = {
  id: string;
  // Projection fields — refine from event payload schemas in the export
  updatedAt: string;
};

export function project${name}(event: { eventName: string; payload: Record<string, unknown> }): Partial<${name}> {
  void event;
  return { updatedAt: new Date().toISOString() };
}
`,
        });
      }
      for (const q of elements.filter((e) => e.kind === "query-handler")) {
        const name = pascal(q.name);
        files.push({
          path: `src/${ctxSlug}/queries/${name}.ts`,
          language: "typescript",
          description: `CQRS query handler ${q.name}`,
          content: `/** Query handler: ${q.name}
 * ${q.description || "Read-only — must not mutate aggregates."}
 */
export async function ${name.charAt(0).toLowerCase() + name.slice(1)}(_query: Record<string, unknown>): Promise<unknown[]> {
  // Load from read model only
  return [];
}
`,
        });
      }
    }

    if (scope === "full" || scope === "sagas") {
      for (const sg of elements.filter((e) => e.kind === "saga" || e.kind === "process-manager")) {
        const name = pascal(sg.name);
        const style = sg.sagaStyle || "orchestration";
        files.push({
          path: `src/${ctxSlug}/sagas/${name}.ts`,
          language: "typescript",
          description: `Saga ${sg.name} (${style})`,
          content: `/** Saga / process manager: ${sg.name}
 * Style: ${style}
 * ${sg.description || ""}
 * Methods: ${(sg.methods || []).join(", ")}
 * Invariants: ${(sg.invariants || []).join("; ")}
 */
export type ${name}State = {
  processId: string;
  status: "started" | "compensating" | "completed" | "failed";
};

export async function onEvent_${name}(event: { eventName: string; payload: Record<string, unknown> }, state: ${name}State): Promise<${name}State> {
  // ${style === "orchestration" ? "Central coordinator: issue next command based on event." : "Choreography peer: local reaction only."}
  void event;
  return state;
}

export async function compensate_${name}(state: ${name}State): Promise<void> {
  void state;
}
`,
        });
      }
      for (const pol of elements.filter((e) => e.kind === "policy")) {
        const name = pascal(pol.name);
        files.push({
          path: `src/${ctxSlug}/policies/${name}.ts`,
          language: "typescript",
          description: `Policy ${pol.name}`,
          content: `/** Policy: ${pol.name}
 * ${pol.description || "Whenever event X, then command Y."}
 */
export function evaluate${name}(event: { eventName: string }): { type: string; payload: Record<string, unknown> } | null {
  void event;
  return null;
}
`,
        });
      }
    }

    // Aggregates (full scope)
    if (scope === "full") {
      for (const agg of elements.filter((e) => e.kind === "aggregate" || e.kind === "aggregate-root")) {
        const name = pascal(agg.name);
        files.push({
          path: `src/${ctxSlug}/aggregates/${name}.ts`,
          language: "typescript",
          description: `Aggregate ${agg.name}`,
          content: `/** Aggregate: ${agg.name}
 * ${agg.description || ""}
 * Invariants: ${(agg.invariants || []).join("; ") || "(none documented)"}
 * Methods: ${(agg.methods || []).join(", ")}
 */
export class ${name} {
  constructor(public readonly id: string) {}

  assertInvariants(): void {
    // ${(agg.invariants || []).map((i) => `// - ${i}`).join("\n    ") || "// document invariants in the designer"}
  }
}
`,
        });
      }
    }
  }

  files.push({
    path: "README.generated.md",
    language: "markdown",
    description: "Codegen notes",
    content: `# Generated from DDD Studio

- **Project:** ${doc.projectName}
- **Export schema:** ${doc.schemaVersion}
- **Exported at:** ${doc.exportedAt}
- **Stack:** ${stack}
- **Package:** ${packageName}
- **Scope:** ${scope}
- **Contexts:** ${doc.stats.contexts}, **elements:** ${doc.stats.nodes}, **relationships:** ${doc.stats.relationships}

This is a **projection** of the design model. Refine stubs; keep the designer as source of truth and re-export to regenerate.

## CQRS summary
- Commands: ${doc.cqrs.commands.map((c) => c.name).join(", ") || "—"}
- Command handlers: ${doc.cqrs.commandHandlers.map((c) => c.name).join(", ") || "—"}
- Read models: ${doc.cqrs.readModels.map((c) => c.name).join(", ") || "—"}
- Query handlers: ${doc.cqrs.queries.map((c) => c.name).join(", ") || "—"}

## Sagas
- Orchestration: ${doc.sagas.orchestration.map((s) => s.name).join(", ") || "—"}
- Choreography: ${doc.sagas.choreography.map((s) => s.name).join(", ") || "—"}
`,
  });

  if (options.includeTests) {
    files.push({
      path: "src/domain/types.test.ts",
      language: "typescript",
      description: "Smoke test placeholder",
      content: `import { describe, it, expect } from "vitest";

describe("domain export projection", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
`,
    });
  }

  return {
    stack,
    packageName,
    summary: `Sketch codegen: ${files.length} files for "${doc.projectName}" (${stack}, scope=${scope}).`,
    files,
  };
}

const CodegenResultSchema = z.object({
  stack: z.string(),
  packageName: z.string(),
  summary: z.string(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).describe("Relative path using forward slashes"),
        language: z.string(),
        description: z.string().optional(),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

/** Reject absolute paths and traversal in model-supplied file paths. */
function safePath(p: string): string | null {
  const normalized = p.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  return normalized;
}

function instructionFor(stack: string, packageName: string, scope: string): string {
  return `You generate source code from a Domain-Driven Design export JSON.
Rules:
- The export JSON is the source of truth. Do not invent bounded contexts, aggregates, commands, or events that are not in the document.
- Emit a JSON object matching the output schema: stack, packageName, summary, files[{path, language, description, content}].
- Prefer clean ${stack} code with one file per command, event, handler, aggregate, saga, policy, or read model as appropriate.
- Scope: ${scope}. Package name: ${packageName}.
- File paths must be relative (no leading slash, no "..").
- Include brief comments referencing design names (not essay-length docs).
- For sagas, respect sagaStyle orchestration vs choreography.
- For CQRS, command handlers write; query handlers only read projections.
- Return ONLY valid JSON for the schema.`;
}

/** The export is sent whole, or refused: silently truncating JSON would make the model invent the rest. */
const MAX_EXPORT_CHARS = 200_000;

export type CodegenOutcome = {
  result: CodegenResult;
  source: CodeGeneratorId;
  generator: (typeof CODE_GENERATORS)[CodeGeneratorId];
  model?: string;
  /** Set when the sketch generator ran instead of Gemini, explaining why. */
  fallbackReason?: string;
};

/**
 * Generate with Gemini when credentials are ready; otherwise emit the deterministic sketch and say
 * why. A failed live call is not masked — it throws so the caller can show the real error.
 */
export async function generateCodeFromExport(doc: DomainExportDocument, options: CodegenOptions = {}): Promise<CodegenOutcome> {
  const adc = await ensureVertexAdc();
  if (!adc.ready) {
    return {
      result: mockCodegen(doc, options),
      source: "mock",
      generator: CODE_GENERATORS.mock,
      fallbackReason: adc.reason ?? "Vertex AI credentials are not available",
    };
  }

  const stack = options.stack || "typescript-express";
  const packageName = options.packageName || slugify(doc.projectName);
  const scope = options.scope || "full";

  const exportJson = JSON.stringify(doc, null, 2);
  if (exportJson.length > MAX_EXPORT_CHARS) {
    throw new AiError(
      `The domain export is ${exportJson.length} characters, over the ${MAX_EXPORT_CHARS} limit. Generate code for a narrower scope (commands, events, read-models or sagas).`,
      413,
    );
  }

  const raw = await runStructuredAgent({
    name: "ddd_code_generator",
    instruction: instructionFor(stack, packageName, scope),
    outputSchema: CodegenResultSchema,
    prompt: `Generate ${stack} source files for package "${packageName}" (scope=${scope}) from this DDD Studio export JSON.\n\n${exportJson}`,
  });

  const parsed = CodegenResultSchema.safeParse(raw);
  if (!parsed.success) throw new AiError(`Gemini returned code in an unexpected shape: ${z.prettifyError(parsed.error)}`);

  const files: CodegenFile[] = [];
  for (const file of parsed.data.files) {
    const path = safePath(file.path);
    if (path) files.push({ path, language: file.language, description: file.description ?? "", content: file.content });
  }
  if (!files.length) throw new AiError("Gemini returned no usable files");

  return {
    result: { stack: parsed.data.stack, packageName: parsed.data.packageName, summary: parsed.data.summary, files },
    source: "gemini-adk",
    generator: CODE_GENERATORS["gemini-adk"],
    model: config.geminiModel,
  };
}
