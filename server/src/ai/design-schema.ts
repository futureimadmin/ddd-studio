/**
 * The structured document Gemini must produce for "AI domain design".
 *
 * One Zod schema serves three purposes: it constrains the model's output (ADK accepts a Zod
 * object as `outputSchema`), it validates whatever comes back, and it documents the contract
 * (`GET /api/ai/domain-design-schema` serves it as JSON Schema).
 */
import { z } from "zod";
import { EVENT_COMPATIBILITY, NODE_KINDS, RELATION_TYPES, isContextMapType } from "../domain/model";

const slug = z.string().min(1).describe("Stable lowercase-hyphenated key, unique within the document");

const ContextSchema = z.object({
  key: slug.describe("Slug used to link elements, e.g. orders"),
  name: z.string().min(1),
  purpose: z.string().describe("Business capability this boundary owns"),
  color: z.string().describe("Hex colour such as #e87554"),
});

const ElementSchema = z.object({
  key: slug,
  contextKey: z.string().min(1).describe("key of the bounded context this element lives in"),
  kind: z.enum(NODE_KINDS),
  name: z.string().min(1),
  description: z.string().optional(),
  methods: z.array(z.string()).optional(),
  invariants: z.array(z.string()).optional().describe("Business rules in plain language (aggregates)"),
  eventVersion: z.string().optional().describe("semver, domain events only"),
  eventPayloadSchema: z.string().optional().describe("JSON Schema or prose, domain events only"),
  eventCompatibility: z.enum(EVENT_COMPATIBILITY).optional(),
  tags: z.array(z.string()).optional(),
});

const RelationshipSchema = z.object({
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  type: z.enum(RELATION_TYPES),
  label: z.string().optional(),
});

const GlossarySchema = z.object({
  term: z.string().min(1),
  definition: z.string(),
  contextKey: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

/** What the model is asked to produce. */
export const DomainDesignSchema = z.object({
  projectName: z.string().min(1).describe("Short product / workspace name"),
  summary: z.string().optional().describe("Design rationale in one paragraph"),
  boundedContexts: z.array(ContextSchema).min(1),
  elements: z.array(ElementSchema).optional(),
  relationships: z.array(RelationshipSchema).optional(),
  glossary: z.array(GlossarySchema).optional(),
});

export type DomainDesign = z.infer<typeof DomainDesignSchema>;

export type ParsedDesign = { design: DomainDesign; dropped: string[] };

/**
 * Validate model output leniently: the document itself must be sound, but individual
 * elements / relationships / terms that do not conform (or point at unknown keys) are dropped
 * and reported instead of failing the whole design.
 */
export function parseDomainDesign(raw: unknown): ParsedDesign {
  const shell = DomainDesignSchema.pick({ projectName: true, summary: true }).extend({
    boundedContexts: z.array(z.unknown()),
    elements: z.array(z.unknown()).optional(),
    relationships: z.array(z.unknown()).optional(),
    glossary: z.array(z.unknown()).optional(),
  });
  const top = shell.safeParse(raw);
  if (!top.success) throw new Error(`Design is not a valid document: ${z.prettifyError(top.error)}`);

  const dropped: string[] = [];
  const pick = <S extends z.ZodTypeAny>(schema: S, items: unknown[] | undefined, label: string): Array<z.infer<S>> => {
    const out: Array<z.infer<S>> = [];
    (items ?? []).forEach((item, index) => {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else dropped.push(`${label}[${index}]: ${r.error.issues[0]?.message ?? "invalid"}`);
    });
    return out;
  };

  const boundedContexts = pick(ContextSchema, top.data.boundedContexts, "boundedContexts");
  if (!boundedContexts.length) throw new Error("Design has no valid bounded contexts");
  const contextKeys = new Set(boundedContexts.map((c) => c.key));

  const elements = pick(ElementSchema, top.data.elements, "elements").filter((el) => {
    const ok = contextKeys.has(el.contextKey);
    if (!ok) dropped.push(`element "${el.key}": unknown contextKey "${el.contextKey}"`);
    return ok;
  });
  const elementKeys = new Set(elements.map((e) => e.key));

  // A strategic (context-map) relationship is between two bounded contexts. The model naturally
  // names the contexts themselves, so resolve a context key to a representative element inside it.
  const representative = (contextKey: string): string | undefined => {
    const inContext = elements.filter((e) => e.contextKey === contextKey);
    return (inContext.find((e) => e.kind === "aggregate-root") ?? inContext.find((e) => e.kind === "aggregate") ?? inContext[0])?.key;
  };
  const endpoint = (key: string, type: string): string | undefined => {
    if (elementKeys.has(key)) return key;
    return contextKeys.has(key) && isContextMapType(type) ? representative(key) : undefined;
  };

  const relationships = pick(RelationshipSchema, top.data.relationships, "relationships").flatMap((rel) => {
    const sourceKey = endpoint(rel.sourceKey, rel.type);
    const targetKey = endpoint(rel.targetKey, rel.type);
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      dropped.push(`relationship ${rel.sourceKey} -> ${rel.targetKey}: unknown element key`);
      return [];
    }
    return [{ ...rel, sourceKey, targetKey }];
  });
  const glossary = pick(GlossarySchema, top.data.glossary, "glossary");

  return {
    design: { projectName: top.data.projectName, summary: top.data.summary, boundedContexts, elements, relationships, glossary },
    dropped,
  };
}

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
8. Do not output canvas positions; the studio lays the diagram out itself.
9. Do NOT generate application source code, classes, or frameworks — only the design model.
10. Keys must be unique stable slugs (lowercase, hyphenated); every contextKey / sourceKey / targetKey must reference an existing key.
11. Relationships BETWEEN two bounded contexts (customer-supplier, anti-corruption, shared-kernel, conformist, open-host-service, published-language, partnership, separate-ways) may use the bounded contexts' own keys as sourceKey / targetKey. Every other relationship must connect element keys.`;
