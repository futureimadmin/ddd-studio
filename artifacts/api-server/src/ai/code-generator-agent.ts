/**
 * Gemini ADK 2.x code generation from a DDD Studio export document.
 * Design remains the source of truth; code is a projection of the JSON model.
 */
import type { DomainExportDocument } from "../routes/ddd";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const CODE_GENERATORS = {
  "gemini-adk": {
    id: "gemini-adk" as const,
    name: "Gemini ADK Codegen",
    description: "Generate source files from the domain export JSON via Google ADK 2.x + Gemini.",
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

function hasGeminiCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      (process.env.GOOGLE_GENAI_USE_VERTEXAI === "TRUE" && process.env.GOOGLE_CLOUD_PROJECT),
  );
}

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

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

function normalizeCodegen(raw: unknown, fallback: CodegenResult): CodegenResult {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const filesRaw = Array.isArray(o.files) ? o.files : fallback.files;
  const files: CodegenFile[] = filesRaw
    .filter((f): f is Record<string, unknown> => f && typeof f === "object")
    .map((f) => ({
      path: typeof f.path === "string" ? f.path : "src/unknown.ts",
      language: typeof f.language === "string" ? f.language : "typescript",
      description: typeof f.description === "string" ? f.description : "",
      content: typeof f.content === "string" ? f.content : "",
    }))
    .filter((f) => f.content);
  if (!files.length) return fallback;
  return {
    stack: typeof o.stack === "string" ? o.stack : fallback.stack,
    packageName: typeof o.packageName === "string" ? o.packageName : fallback.packageName,
    summary: typeof o.summary === "string" ? o.summary : fallback.summary,
    files,
  };
}

const CODEGEN_OUTPUT_SCHEMA = {
  type: "OBJECT",
  properties: {
    stack: { type: "STRING" },
    packageName: { type: "STRING" },
    summary: { type: "STRING" },
    files: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          path: { type: "STRING" },
          language: { type: "STRING" },
          description: { type: "STRING" },
          content: { type: "STRING" },
        },
        required: ["path", "language", "content"],
      },
    },
  },
  required: ["stack", "packageName", "summary", "files"],
};

export async function generateCodeFromExport(
  doc: DomainExportDocument,
  options: CodegenOptions = {},
): Promise<{
  result: CodegenResult;
  source: CodeGeneratorId;
  generator: (typeof CODE_GENERATORS)[CodeGeneratorId];
  model?: string;
}> {
  const sketch = mockCodegen(doc, options);

  if (!hasGeminiCredentials()) {
    return { result: sketch, source: "mock", generator: CODE_GENERATORS.mock };
  }

  try {
    // Dynamic import so the server boots without ADK installed
    const adk = await import("@google/adk");
    const { LlmAgent, InMemoryRunner, InMemorySessionService } = adk as {
      LlmAgent: new (cfg: Record<string, unknown>) => { name: string };
      InMemoryRunner: new (cfg: Record<string, unknown>) => {
        runAsync: (args: Record<string, unknown>) => AsyncIterable<{ content?: { parts?: { text?: string }[] }; partial?: boolean }>;
      };
      InMemorySessionService: new () => {
        createSession: (args: Record<string, unknown>) => Promise<{ id: string; userId: string; state?: Record<string, unknown> }>;
      };
    };

    const stack = options.stack || "typescript-express";
    const packageName = options.packageName || slugify(doc.projectName);
    const scope = options.scope || "full";

    const agent = new LlmAgent({
      name: "ddd_code_generator",
      model: MODEL,
      description: "Generate application source files from a DDD Studio domain export JSON.",
      instruction: `You generate source code from a Domain-Driven Design export JSON.
Rules:
- The export JSON is the source of truth. Do not invent bounded contexts, aggregates, commands, or events that are not in the document.
- Emit a JSON object matching the output schema: stack, packageName, summary, files[{path, language, description, content}].
- Prefer clean ${stack} code with one file per command, event, handler, aggregate, saga, policy, or read model as appropriate.
- Scope: ${scope}. Package name: ${packageName}.
- Include brief comments referencing design names (not essay-length docs).
- For sagas, respect sagaStyle orchestration vs choreography.
- For CQRS, command handlers write; query handlers only read projections.
- Return ONLY valid JSON for the schema.`,
      outputSchema: CODEGEN_OUTPUT_SCHEMA,
      outputKey: "codegen_result",
    });

    const sessionService = new InMemorySessionService();
    const session = await sessionService.createSession({
      appName: "ddd-studio-codegen",
      userId: "studio",
      state: {},
    });

    const runner = new InMemoryRunner({
      agent,
      appName: "ddd-studio-codegen",
      sessionService,
    });

    const exportJson = JSON.stringify(doc, null, 2).slice(0, 120_000);
    const message = {
      role: "user" as const,
      parts: [
        {
          text: `Generate ${stack} source files for package "${packageName}" (scope=${scope}) from this DDD Studio export JSON.\n\n${exportJson}`,
        },
      ],
    };

    let lastText = "";
    for await (const event of runner.runAsync({
      userId: session.userId,
      sessionId: session.id,
      newMessage: message,
    })) {
      const parts = event.content?.parts;
      if (!parts) continue;
      const chunk = parts.map((p) => p.text).filter(Boolean).join("");
      if (chunk && !event.partial) lastText = chunk;
      else if (chunk) lastText += chunk;
    }

    const stateResult = session.state?.codegen_result;
    const raw = stateResult ?? extractJsonObject(lastText);
    const result = normalizeCodegen(raw, sketch);

    return {
      result,
      source: "gemini-adk",
      generator: CODE_GENERATORS["gemini-adk"],
      model: MODEL,
    };
  } catch (err) {
    console.error("[ai/generate-code] ADK failed, using sketch codegen", err);
    return {
      result: {
        ...sketch,
        summary: `${sketch.summary} (ADK fallback: ${err instanceof Error ? err.message : "error"})`,
      },
      source: "mock",
      generator: CODE_GENERATORS.mock,
    };
  }
}
