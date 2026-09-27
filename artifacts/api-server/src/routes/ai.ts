import { Router, type IRouter } from "express";
import { generateDomainDesign } from "../ai/domain-designer-agent";
import { generateCodeFromExport, CODE_GENERATORS } from "../ai/code-generator-agent";
import { applyAiDomainDesign, buildDomainExport, type AiDomainDesign } from "./ddd";

const router: IRouter = Router();

/**
 * POST /api/ai/generate-domain
 * Body: { prompt: string, apply?: boolean, mode?: "merge" | "replace" }
 *
 * Uses Google ADK 2.x + Gemini with the DDD domain design JSON schema.
 * When apply=true, materializes contexts/elements/relationships/glossary into the designer.
 */
router.post("/ai/generate-domain", async (req, res): Promise<void> => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }
    const apply = Boolean(req.body?.apply);
    const mode = req.body?.mode === "replace" ? "replace" : "merge";

    const { design, source, designer, model } = await generateDomainDesign(prompt);

    let workspace = null;
    if (apply) {
      workspace = applyAiDomainDesign(design as AiDomainDesign, mode);
    }

    res.json({
      ok: true,
      source,
      designer,
      model: model ?? null,
      design,
      applied: apply,
      workspace,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    console.error("[ai/generate-domain]", err);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/ai/generate-code
 * Body: {
 *   stack?: string,
 *   packageName?: string,
 *   includeTests?: boolean,
 *   scope?: "full" | "commands" | "events" | "read-models" | "sagas",
 *   export?: object  // optional; defaults to live workspace export
 * }
 *
 * Consumes the stable domain export JSON and produces source files via Gemini ADK 2.x
 * (or Studio Sketch Codegen offline).
 */
router.post("/ai/generate-code", async (req, res): Promise<void> => {
  try {
    const options = {
      stack: typeof req.body?.stack === "string" ? req.body.stack : "typescript-express",
      packageName: typeof req.body?.packageName === "string" ? req.body.packageName : undefined,
      includeTests: Boolean(req.body?.includeTests),
      scope:
        req.body?.scope === "commands" ||
        req.body?.scope === "events" ||
        req.body?.scope === "read-models" ||
        req.body?.scope === "sagas"
          ? req.body.scope
          : ("full" as const),
    };

    const doc =
      req.body?.export && typeof req.body.export === "object"
        ? (req.body.export as ReturnType<typeof buildDomainExport>)
        : buildDomainExport();

    if (!doc.elements?.length && !doc.boundedContexts?.length) {
      res.status(400).json({ error: "Export is empty — design a model first" });
      return;
    }

    const { result, source, generator, model } = await generateCodeFromExport(doc, options);

    res.json({
      ok: true,
      source,
      generator,
      model: model ?? null,
      exportMeta: {
        schemaVersion: doc.schemaVersion,
        exportedAt: doc.exportedAt,
        projectName: doc.projectName,
        stats: doc.stats,
      },
      codegen: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Code generation failed";
    console.error("[ai/generate-code]", err);
    res.status(500).json({ error: message });
  }
});

/** ADC / Vertex readiness for design + codegen */
router.get("/ai/auth-status", async (_req, res): Promise<void> => {
  try {
    const { ensureVertexAdc } = await import("../ai/google-adc");
    const status = await ensureVertexAdc();
    res.json({
      ok: status.ready,
      mode: status.mode,
      project: status.project ?? null,
      location: status.location ?? null,
      reason: status.reason ?? null,
      hint: status.ready
        ? "Vertex AI via Application Default Credentials"
        : "Run: gcloud auth application-default login && export GOOGLE_CLOUD_PROJECT=...",
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "auth status failed",
    });
  }
});

/** Named designers available for domain design */
router.get("/ai/designers", (_req, res): void => {
  res.json({
    designers: [
      {
        id: "gemini-adk",
        name: "Gemini ADK Designer",
        description:
          "Live multi-context DDD model via Google ADK 2.x + Gemini on Vertex AI (Application Default Credentials).",
        requiresApiKey: false,
        requiresAdc: true,
      },
      {
        id: "mock",
        name: "Studio Sketch Designer",
        description:
          "Offline deterministic sketch for demos, CI, and keyless local work.",
        requiresApiKey: false,
      },
    ],
  });
});

/** Named code generators */
router.get("/ai/code-generators", (_req, res): void => {
  res.json({
    generators: Object.values(CODE_GENERATORS).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      requiresApiKey: false,
      requiresAdc: g.id === "gemini-adk",
    })),
  });
});

/** Return the JSON Schema document used to constrain Gemini design output (for clients / docs). */
router.get("/ai/domain-design-schema", (_req, res): void => {
  res.json({
    name: "ddd-domain-design",
    description:
      "Multi bounded-context DDD design document (boundedContexts list + elements + relationships + glossary).",
    schemaPath: "lib/api-spec/schemas/ddd-domain-design.schema.json",
  });
});

export default router;
