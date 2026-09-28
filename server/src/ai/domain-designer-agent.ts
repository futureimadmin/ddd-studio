/**
 * DDD Studio design agent: Google ADK + Gemini (Vertex AI, Application Default Credentials)
 * produces a structured multi-context domain design for the canvas.
 */
import { config } from "../config";
import { DESIGNER_SYSTEM_INSTRUCTION, DomainDesignSchema, parseDomainDesign, type DomainDesign } from "./design-schema";
import { ensureVertexAdc } from "./google-adc";
import { runStructuredAgent } from "./run-agent";

/** Named AI designers — both are first-class design paths. */
export const AI_DESIGNERS = {
  "gemini-adk": {
    id: "gemini-adk" as const,
    name: "Gemini ADK Designer",
    description: "Live multi-context DDD model via Google ADK + Gemini on Vertex AI (Application Default Credentials).",
  },
  mock: {
    id: "mock" as const,
    name: "Studio Sketch Designer",
    description: "Offline deterministic sketch of contexts, aggregates, events, and glossary for demos and CI.",
  },
} as const;

export type AiDesignerId = keyof typeof AI_DESIGNERS;

export type DesignResult = {
  design: DomainDesign;
  source: AiDesignerId;
  designer: (typeof AI_DESIGNERS)[AiDesignerId];
  model?: string;
  /** Set when the sketch designer ran instead of Gemini, explaining why. */
  fallbackReason?: string;
  /** Parts of the model output that did not conform and were left out. */
  dropped: string[];
};

/** Deterministic offline design used when Vertex ADC is unavailable (or DDD_AI_OFFLINE=1). */
export function mockDomainDesign(prompt: string): DomainDesign {
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "domain";
  return {
    projectName: `AI design: ${slug}`,
    summary: `Sketch design derived from: "${prompt.slice(0, 160)}". Configure Application Default Credentials for live Gemini via Vertex.`,
    boundedContexts: [
      { key: "core", name: "Core Domain", purpose: "Primary business capability inferred from the prompt.", color: "#e87554" },
      { key: "supporting", name: "Supporting", purpose: "Supporting capability that feeds the core domain.", color: "#55b7a8" },
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
      },
      {
        key: "core-root",
        contextKey: "core",
        kind: "aggregate-root",
        name: "PrimaryRoot",
        description: "Guards invariants and publishes events.",
        methods: ["assertInvariants()", "publishEvents()"],
        invariants: ["Only the root may publish domain events"],
      },
      { key: "core-cmd", contextKey: "core", kind: "command", name: "StartPrimaryFlow", description: "User/system intent to start the core flow." },
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
      },
      { key: "core-repo", contextKey: "core", kind: "repository", name: "PrimaryRepository", description: "Persistence port for the aggregate.", methods: ["findById()", "save()"] },
      { key: "support-svc", contextKey: "supporting", kind: "service", name: "SupportService", description: "Reacts to core events.", methods: ["onPrimaryFlowStarted()"] },
    ],
    relationships: [
      { sourceKey: "core-cmd", targetKey: "core-aggregate", type: "uses", label: "targets" },
      { sourceKey: "core-aggregate", targetKey: "core-root", type: "composition", label: "contains" },
      { sourceKey: "core-root", targetKey: "core-evt", type: "publishes", label: "publishes" },
      { sourceKey: "support-svc", targetKey: "core-evt", type: "subscribes", label: "reacts" },
      { sourceKey: "core-evt", targetKey: "support-svc", type: "customer-supplier", label: "Customer-Supplier" },
    ],
    glossary: [
      {
        term: "PrimaryAggregate",
        definition: "Transactional boundary for the main business operation described in the prompt.",
        contextKey: "core",
        aliases: ["Core aggregate"],
      },
    ],
  };
}

function sketch(prompt: string, reason: string): DesignResult {
  return { design: mockDomainDesign(prompt), source: "mock", designer: AI_DESIGNERS.mock, fallbackReason: reason, dropped: [] };
}

/**
 * Design with Gemini when credentials are ready; otherwise fall back to the sketch designer and
 * say why. A *failed live call* is not masked — it throws so the caller can show the real error.
 */
export async function generateDomainDesign(prompt: string): Promise<DesignResult> {
  const userPrompt = prompt.trim();
  if (!userPrompt) throw new Error("prompt is required");

  const adc = await ensureVertexAdc();
  if (!adc.ready) return sketch(userPrompt, adc.reason ?? "Vertex AI credentials are not available");

  const raw = await runStructuredAgent({
    name: "ddd_domain_designer",
    instruction: DESIGNER_SYSTEM_INSTRUCTION,
    outputSchema: DomainDesignSchema,
    prompt: `Design a Domain-Driven Design model for the following problem. Return only schema-compliant JSON.\n\n---\n${userPrompt}\n---`,
  });
  const { design, dropped } = parseDomainDesign(raw);
  return { design, source: "gemini-adk", designer: AI_DESIGNERS["gemini-adk"], model: config.geminiModel, dropped };
}
