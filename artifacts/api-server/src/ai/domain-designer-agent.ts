/**
 * DDD Studio design agent powered by Google ADK 2.x + Gemini.
 * Produces structured DomainDesign JSON for the designer canvas.
 *
 * @google/adk is loaded dynamically so the API can still boot without
 * node_modules present (mock path works offline).
 */
import {
  DDD_DOMAIN_DESIGN_SCHEMA,
  DESIGNER_SYSTEM_INSTRUCTION,
  type DomainDesign,
} from "./domain-design-schema";
import { ensureVertexAdc } from "./google-adc";

const APP_NAME = "ddd-studio-designer";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Deterministic offline design when ADC is unavailable (local demos / DDD_AI_OFFLINE). */
export function mockDomainDesign(prompt: string): DomainDesign {
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "domain";
  return {
    projectName: `AI design: ${slug}`,
    summary: `Mock design derived from: "${prompt.slice(0, 160)}". Configure ADC (gcloud auth application-default login + GOOGLE_CLOUD_PROJECT) for live Gemini via Vertex.`,
    boundedContexts: [
      {
        key: "core",
        name: "Core Domain",
        purpose: "Primary business capability inferred from the prompt.",
        color: "#e87554",
      },
      {
        key: "supporting",
        name: "Supporting",
        purpose: "Supporting capability that feeds the core domain.",
        color: "#55b7a8",
      },
    ],
    elements: [
      {
        key: "core-aggregate",
        contextKey: "core",
        kind: "aggregate",
        name: "PrimaryAggregate",
        description: "Consistency boundary for the core use case.",
        methods: ["execute()", "cancel()"],
        invariants: ["Must remain consistent within a single transaction"],
        tags: ["core"],
        x: 28,
        y: 32,
      },
      {
        key: "core-root",
        contextKey: "core",
        kind: "aggregate-root",
        name: "PrimaryRoot",
        description: "Guards invariants and publishes events.",
        methods: ["assertInvariants()", "publishEvents()"],
        invariants: ["Only the root may publish domain events"],
        x: 40,
        y: 48,
      },
      {
        key: "core-cmd",
        contextKey: "core",
        kind: "command",
        name: "StartPrimaryFlow",
        description: "User/system intent to start the core flow.",
        x: 18,
        y: 18,
      },
      {
        key: "core-evt",
        contextKey: "core",
        kind: "domain-event",
        name: "PrimaryFlowStarted",
        description: "Fact that the core flow started.",
        eventVersion: "1.0.0",
        eventCompatibility: "backward",
        eventPayloadSchema:
          '{"type":"object","required":["id","occurredAt"],"properties":{"id":{"type":"string"},"occurredAt":{"type":"string","format":"date-time"}}}',
        x: 58,
        y: 22,
      },
      {
        key: "core-repo",
        contextKey: "core",
        kind: "repository",
        name: "PrimaryRepository",
        description: "Persistence port for the aggregate.",
        methods: ["findById()", "save()"],
        x: 24,
        y: 68,
      },
      {
        key: "support-svc",
        contextKey: "supporting",
        kind: "service",
        name: "SupportService",
        description: "Reacts to core events.",
        methods: ["onPrimaryFlowStarted()"],
        x: 72,
        y: 40,
      },
    ],
    relationships: [
      { sourceKey: "core-cmd", targetKey: "core-aggregate", type: "uses", label: "targets" },
      { sourceKey: "core-aggregate", targetKey: "core-root", type: "composition", label: "contains" },
      { sourceKey: "core-root", targetKey: "core-evt", type: "publishes", label: "publishes" },
      { sourceKey: "support-svc", targetKey: "core-evt", type: "subscribes", label: "reacts" },
      {
        sourceKey: "core-evt",
        targetKey: "support-svc",
        type: "customer-supplier",
        label: "Customer-Supplier",
      },
    ],
    glossary: [
      {
        term: "PrimaryAggregate",
        definition:
          "Transactional boundary for the main business operation described in the prompt.",
        contextKey: "core",
        aliases: ["Core aggregate"],
      },
    ],
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
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model response was not valid JSON");
  }
}

function normalizeDesign(raw: unknown): DomainDesign {
  if (!raw || typeof raw !== "object") throw new Error("Empty design");
  const d = raw as Record<string, unknown>;
  if (typeof d.projectName !== "string" || !Array.isArray(d.boundedContexts)) {
    throw new Error("Design must include projectName and boundedContexts[]");
  }
  return {
    projectName: d.projectName,
    summary: typeof d.summary === "string" ? d.summary : undefined,
    boundedContexts: d.boundedContexts as DomainDesign["boundedContexts"],
    elements: Array.isArray(d.elements) ? (d.elements as DomainDesign["elements"]) : [],
    relationships: Array.isArray(d.relationships)
      ? (d.relationships as DomainDesign["relationships"])
      : [],
    glossary: Array.isArray(d.glossary) ? (d.glossary as DomainDesign["glossary"]) : [],
  };
}

/**
 * Run the ADK LlmAgent with structured output schema against Gemini.
 * Falls back to mockDomainDesign when credentials are missing.
 */
/** Named AI designers — both are first-class design paths */
export const AI_DESIGNERS = {
  "gemini-adk": {
    id: "gemini-adk" as const,
    name: "Gemini ADK Designer",
    description:
      "Live multi-context DDD model via Google ADK 2.x + Gemini on Vertex AI (Application Default Credentials).",
  },
  mock: {
    id: "mock" as const,
    name: "Studio Sketch Designer",
    description:
      "Offline deterministic sketch of contexts, aggregates, events, and glossary for demos and CI.",
  },
} as const;

export type AiDesignerId = keyof typeof AI_DESIGNERS;

export async function generateDomainDesign(prompt: string): Promise<{
  design: DomainDesign;
  source: AiDesignerId;
  designer: (typeof AI_DESIGNERS)[AiDesignerId];
  model?: string;
}> {
  const userPrompt = prompt.trim();
  if (!userPrompt) throw new Error("prompt is required");

  const adc = await ensureVertexAdc();
  if (!adc.ready) {
    console.warn("[ai/design] Vertex ADC not ready — sketch designer:", adc.reason);
    return { design: mockDomainDesign(userPrompt), source: "mock", designer: AI_DESIGNERS.mock };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adk: any;
  try {
    adk = await import("@google/adk");
  } catch (err) {
    console.error("[ai] @google/adk not installed — using mock design", err);
    return { design: mockDomainDesign(userPrompt), source: "mock", designer: AI_DESIGNERS.mock };
  }

  const { LlmAgent, Runner, InMemoryRunner, InMemorySessionService } = adk;
  const RunnerCtor = Runner ?? InMemoryRunner;

  const agent = new LlmAgent({
    name: "ddd_domain_designer",
    model: MODEL,
    description:
      "Produces a multi-context DDD design model as structured JSON for the designer.",
    instruction: DESIGNER_SYSTEM_INSTRUCTION,
    outputSchema: DDD_DOMAIN_DESIGN_SCHEMA,
    outputKey: "domain_design",
  });

  const sessionService = new InMemorySessionService();
  const runner = new RunnerCtor({
    appName: APP_NAME,
    agent,
    sessionService,
  });

  const session = await sessionService.createSession({
    appName: APP_NAME,
    userId: "ddd-studio",
  });

  const message = {
    role: "user" as const,
    parts: [
      {
        text: `Design a Domain-Driven Design model for the following problem. Return only schema-compliant JSON.\n\n---\n${userPrompt}\n---`,
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
    const chunk = parts.map((p: { text?: string }) => p.text).filter(Boolean).join("");
    if (chunk && !event.partial) lastText = chunk;
    else if (chunk) lastText += chunk;
  }

  const stateDesign = session.state?.domain_design;
  const raw = stateDesign ?? extractJsonObject(lastText);
  const design = normalizeDesign(typeof raw === "string" ? extractJsonObject(raw) : raw);

  return { design, source: "gemini-adk", designer: AI_DESIGNERS["gemini-adk"], model: MODEL };
}
