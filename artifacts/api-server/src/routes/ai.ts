import { Router, type IRouter } from "express";
import { generateDomainDesign } from "../ai/domain-designer-agent";
import { applyAiDomainDesign, type AiDomainDesign } from "./ddd";

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

    const { design, source, model } = await generateDomainDesign(prompt);

    let workspace = null;
    if (apply) {
      workspace = applyAiDomainDesign(design as AiDomainDesign, mode);
    }

    res.json({
      ok: true,
      source,
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

/** Return the JSON Schema document used to constrain Gemini output (for clients / docs). */
router.get("/ai/domain-design-schema", (_req, res): void => {
  res.json({
    title: "DDDDomainDesign",
    description: "Schema used as Gemini structured output for multi-context DDD design",
    schemaPath: "lib/api-spec/schemas/ddd-domain-design.schema.json",
    required: ["projectName", "boundedContexts"],
    note: "boundedContexts is a list of strategic boundaries; elements and relationships fill the designer.",
  });
});

export default router;
