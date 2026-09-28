/** Gemini-assisted design and code generation. */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { CODE_GENERATORS, generateCodeFromExport } from "../ai/code-generator-agent";
import { DomainDesignSchema, parseDomainDesign } from "../ai/design-schema";
import { AI_DESIGNERS, generateDomainDesign } from "../ai/domain-designer-agent";
import { ensureVertexAdc } from "../ai/google-adc";
import { applyDesign } from "../domain/apply-design";
import { buildDomainExport, type DomainExportDocument } from "../domain/export";
import type { Store } from "../domain/store";
import { HttpError, parse } from "./http";

const ModeSchema = z.enum(["merge", "replace"]).default("merge");

const GenerateDomainBody = z.object({
  prompt: z.string().trim().min(1, "prompt is required").max(8000, "prompt is too long (8000 characters max)"),
  apply: z.boolean().default(false),
  mode: ModeSchema,
});

const ApplyDomainBody = z.object({ design: z.unknown(), mode: ModeSchema });

const GenerateCodeBody = z.object({
  stack: z.string().trim().min(1).max(80).default("typescript-express"),
  packageName: z.string().trim().min(1).max(120).optional(),
  includeTests: z.boolean().default(false),
  scope: z.enum(["full", "commands", "events", "read-models", "sagas"]).default("full"),
  /** Optional: generate from a specific export instead of the live workspace. */
  export: z.custom<DomainExportDocument>((v) => !!v && typeof v === "object" && Array.isArray((v as { elements?: unknown }).elements), {
    message: "export must be a DDD Studio export document",
  }).optional(),
});

export function aiRoutes(store: Store): IRouter {
  const router = Router();

  router.get("/ai/auth-status", async (_req, res) => {
    const status = await ensureVertexAdc();
    res.json({
      ok: status.ready,
      mode: status.mode,
      project: status.project ?? null,
      location: status.location ?? null,
      reason: status.reason ?? null,
    });
  });

  router.get("/ai/designers", (_req, res) => {
    res.json({ designers: Object.values(AI_DESIGNERS) });
  });

  router.get("/ai/code-generators", (_req, res) => {
    res.json({ generators: Object.values(CODE_GENERATORS) });
  });

  /** The JSON Schema that constrains Gemini's design output. */
  router.get("/ai/domain-design-schema", (_req, res) => {
    res.json(z.toJSONSchema(DomainDesignSchema));
  });

  router.post("/ai/generate-domain", async (req, res) => {
    const { prompt, apply, mode } = parse(GenerateDomainBody, req.body);
    const outcome = await generateDomainDesign(prompt);
    const applyResult = apply ? applyDesign(store, outcome.design, mode) : null;
    res.json({
      ok: true,
      source: outcome.source,
      designer: outcome.designer,
      model: outcome.model ?? null,
      fallbackReason: outcome.fallbackReason ?? null,
      dropped: outcome.dropped,
      design: outcome.design,
      applied: apply,
      applyResult,
      workspace: apply ? store.snapshot() : null,
    });
  });

  /** Apply a design the user has already previewed — without asking the model again. */
  router.post("/ai/apply-domain", (req, res) => {
    const { design, mode } = parse(ApplyDomainBody, req.body);
    let parsed;
    try {
      parsed = parseDomainDesign(design);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Invalid design");
    }
    const applyResult = applyDesign(store, parsed.design, mode);
    res.json({ ok: true, applied: true, dropped: parsed.dropped, applyResult, workspace: store.snapshot() });
  });

  router.post("/ai/generate-code", async (req, res) => {
    const { export: supplied, ...options } = parse(GenerateCodeBody, req.body);
    store.refreshCounts();
    const doc = supplied ?? buildDomainExport(store.state);
    if (!doc.elements.length && !doc.boundedContexts.length) {
      throw new HttpError(400, "The model is empty — design something first");
    }
    const outcome = await generateCodeFromExport(doc, options);
    res.json({
      ok: true,
      source: outcome.source,
      generator: outcome.generator,
      model: outcome.model ?? null,
      fallbackReason: outcome.fallbackReason ?? null,
      exportMeta: {
        schemaVersion: doc.schemaVersion,
        exportedAt: doc.exportedAt,
        projectName: doc.projectName,
        stats: doc.stats,
      },
      codegen: outcome.result,
    });
  });

  return router;
}
