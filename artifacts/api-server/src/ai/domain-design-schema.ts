/**
 * Gemini / ADK output schema for a full DDD design (design-time only).
 * Mirrors lib/api-spec/schemas/ddd-domain-design.schema.json
 * Uses plain Schema shape compatible with @google/genai Type.OBJECT without importing the package at build time.
 */

const NODE_KINDS = [
  "aggregate",
  "aggregate-root",
  "entity",
  "value-object",
  "domain-event",
  "command",
  "policy",
  "actor",
  "read-model",
  "repository",
  "service",
  "resource",
  "anti-corruption-layer",
  "saga",
  "process-manager",
] as const;

const RELATION_TYPES = [
  "uses",
  "aggregation",
  "composition",
  "generalization",
  "specialization",
  "publishes",
  "subscribes",
  "owns",
  "invokes",
  "exposed-by",
  "shared-kernel",
  "customer-supplier",
  "conformist",
  "anti-corruption",
  "open-host-service",
  "published-language",
  "partnership",
  "separate-ways",
] as const;

/** Google GenAI Schema-compatible object (type: "OBJECT" string form). */
export const DDD_DOMAIN_DESIGN_SCHEMA = {
  type: "OBJECT",
  properties: {
    projectName: {
      type: "STRING",
      description: "Short product / workspace name",
    },
    summary: {
      type: "STRING",
      description: "Design rationale in one paragraph",
    },
    boundedContexts: {
      type: "ARRAY",
      description: "List of bounded contexts",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING", description: "Slug e.g. orders" },
          name: { type: "STRING" },
          purpose: { type: "STRING" },
          color: { type: "STRING", description: "Hex color e.g. #e87554" },
        },
        required: ["key", "name", "purpose", "color"],
      },
    },
    elements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          contextKey: { type: "STRING" },
          kind: { type: "STRING", format: "enum", enum: [...NODE_KINDS] },
          name: { type: "STRING" },
          description: { type: "STRING" },
          methods: { type: "ARRAY", items: { type: "STRING" } },
          invariants: { type: "ARRAY", items: { type: "STRING" } },
          eventVersion: { type: "STRING" },
          eventPayloadSchema: { type: "STRING" },
          eventCompatibility: {
            type: "STRING",
            format: "enum",
            enum: ["backward", "forward", "full", "none"],
          },
          tags: { type: "ARRAY", items: { type: "STRING" } },
          x: { type: "NUMBER" },
          y: { type: "NUMBER" },
        },
        required: ["key", "contextKey", "kind", "name"],
      },
    },
    relationships: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sourceKey: { type: "STRING" },
          targetKey: { type: "STRING" },
          type: { type: "STRING", format: "enum", enum: [...RELATION_TYPES] },
          label: { type: "STRING" },
        },
        required: ["sourceKey", "targetKey", "type"],
      },
    },
    glossary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" },
          contextKey: { type: "STRING" },
          aliases: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["term", "definition"],
      },
    },
  },
  required: ["projectName", "boundedContexts"],
} as const;

export type DomainDesignElement = {
  key: string;
  contextKey: string;
  kind: (typeof NODE_KINDS)[number];
  name: string;
  description?: string;
  methods?: string[];
  invariants?: string[];
  eventVersion?: string;
  eventPayloadSchema?: string;
  eventCompatibility?: "backward" | "forward" | "full" | "none";
  tags?: string[];
  x?: number;
  y?: number;
};

export type DomainDesignRelationship = {
  sourceKey: string;
  targetKey: string;
  type: (typeof RELATION_TYPES)[number];
  label?: string;
};

export type DomainDesignGlossaryTerm = {
  term: string;
  definition: string;
  contextKey?: string | null;
  aliases?: string[];
};

export type DomainDesign = {
  projectName: string;
  summary?: string;
  boundedContexts: Array<{
    key: string;
    name: string;
    purpose: string;
    color: string;
  }>;
  elements?: DomainDesignElement[];
  relationships?: DomainDesignRelationship[];
  glossary?: DomainDesignGlossaryTerm[];
};

export const DESIGNER_SYSTEM_INSTRUCTION = `You are a senior Domain-Driven Design facilitator inside DDD Studio — a **design IDE**, not a coding IDE.

Your job is to propose a clear strategic and tactical domain model from the user's problem description.

Rules:
1. Output MUST be a single JSON object matching the provided schema (boundedContexts is a list).
2. Prefer 2–5 bounded contexts with clear purposes; avoid anemic "Utils" contexts.
3. Inside each context, propose aggregates, aggregate-roots (linked with composition), repositories, domain events, commands, and where useful sagas / anti-corruption-layers.
4. Use relationship types intentionally:
   - composition/owns for aggregate → root
   - publishes/subscribes for events
   - customer-supplier, anti-corruption, shared-kernel for inter-context strategy
5. Domain events should include eventVersion (semver) and a short eventPayloadSchema (JSON Schema or prose).
6. Aggregates should list invariants (business rules in plain language).
7. Glossary terms must use the ubiquitous language of each context.
8. Place elements with x/y between 10 and 90 so the canvas is readable.
9. Do NOT generate application source code, classes, or frameworks — only the design model.
10. Keys must be unique stable slugs (lowercase, hyphenated).`;
