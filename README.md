# DDD Studio

An IDE for **Domain-Driven Design**: bounded contexts, domain model elements, UML relationships, event storming, and schema reverse-engineering.

## Run locally

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API on PORT (default from env)
pnpm --filter @workspace/ddd-studio run dev   # UI
```

Required env for the API: `PORT`, and optionally `DATABASE_URL` for persistence.

---

## Modeling workflow

Follow these steps from empty workspace through to a domain API surface.

### 1. Create bounded contexts

1. Open **Domain map** (home).
2. Click **Add context**.
3. Enter:
   - **Name** — e.g. `Orders`, `Inventory`, `Payments`
   - **Purpose** — the business capability this boundary owns
   - **Boundary color** — visual identity on the map
4. Save. Repeat for each strategic boundary.

**Context map view:** switch to the **Context map** tab. You see only contexts (no aggregates/entities). Relationships between contexts appear with **text labels** (the only place labels are drawn).

To link two contexts:

1. Ensure each context has at least one model element (step 2).
2. Click **Link contexts**.
3. Choose from-context, relationship type, to-context, and a label such as `Customer-Supplier`, `ACL`, or `Shared Kernel`.
4. Save. The edge is labeled on the Context map only.

---

### 2. Design the domain model (Domain designer)

1. Open the **Domain designer** tab.
2. Use the **left palette** (or **Add model element**) to add:
   - Aggregate / Aggregate root
   - Entity / Value object
   - Repository / Domain service / Resource (API) / Read model
3. Assign each element to a bounded context.
4. Optionally set methods (e.g. `place()`, `cancel()`) and status (`draft` → `validated`).

#### UML relationships (no text labels)

In the designer, edges use **UML symbols only** so the canvas stays readable:

| Type | Symbol | Meaning |
|------|--------|---------|
| Composition / Owns | ◆——▷ | Strong has-a; owner controls lifecycle |
| Aggregation | ◇——▷ | Shared has-a |
| Generalization / Specialization | ——△ | Is-a |
| Uses / Subscribes | ····▷ | Dependency / reaction |
| Publishes / Invokes / Exposed-by | ——▶ | Emits, calls, or surfaces |

**How to connect:**

1. In the palette, click a UML relationship type (e.g. **Composition** for Aggregate has-a Root).
2. Click the **source** element, then the **target** element.
3. Or use **Connect (form)** to pick source, type, and target from lists.

Example: Aggregate **Order** composition → Aggregate root **OrderRoot**.

---

### 3. Event storming (separate tab)

1. Open the **Event storming** tab.
2. Events, commands, policies, and actors live **only** on this board (they are filtered out of the Domain designer).
3. Use the palette or **Add event sticky** to place:
   - **Domain event** (orange) — something that happened
   - **Command** (blue) — intent to change state
   - **Policy** (violet) — “when X then Y”
   - **Actor** (green) — person or external system
4. Select a sticky in the inspector to refine name, description, and status.
5. Link storm elements to domain model via the same relationship API if needed (e.g. command **uses** aggregate, root **publishes** event).

---

### 4. Inspect and refine

- Click any node, context, or sticky to open the **inspector**.
- Edit name, description, methods, tags, status.
- Delete obsolete relationships from the inspector list.
- Use context filters and search to focus a large map.

---

### 5. Schema connections (reverse engineering)

1. Go to **Schema connections** in the sidebar.
2. **Add connection** — PostgreSQL, MySQL, Oracle, or Db2.
3. Enter host, database, credentials.
4. **Introspect schema** to discover tables and foreign keys.
5. Use discoveries as candidates for resources, aggregates, and relationships on the domain map.

---

### 6. Domain API surface

1. Mark service/resource nodes that represent published capabilities (kind **resource** or **service**).
2. Relate them with **exposed-by** / **invokes** to aggregates and application services.
3. Align resource names with tables from schema introspection where useful.
4. Validate language in the inspector (`validated` status).
5. The OpenAPI-backed API (`/api/...`) already exposes CRUD for contexts, nodes, and relationships — treat the living model as the contract for downstream code generation or gateway design.

Typical path:

```
Bounded context
  → Aggregate + Aggregate root (composition)
  → Commands / Domain events (event storming)
  → Repository + Domain service
  → Resource / Domain API (exposed-by)
  → Schema connection (optional reverse map)
```

---

## UI overview

| Tab / area | What you see | Labels on edges? |
|------------|--------------|------------------|
| **Domain designer** | Aggregates, entities, services, UML links | No — UML markers only |
| **Context map** | Bounded contexts + inter-context links | Yes |
| **Event storming** | Commands, events, policies, actors | N/A (stickies) |
| **Schema connections** | DB profiles + introspection | — |
| **Workspace settings** | Grid / snap preferences | — |

---

## API surface (backend)

| Resource | Endpoints |
|----------|-----------|
| Workspace snapshot | `GET /api/workspace` |
| Bounded contexts | `GET/POST /api/bounded-contexts`, `PATCH/DELETE /api/bounded-contexts/:id` |
| Domain nodes | `GET/POST /api/domain-nodes`, `PATCH/DELETE /api/domain-nodes/:id` |
| Relationships | `GET/POST /api/relationships`, `DELETE /api/relationships/:id` |
| Schema connections | `GET/POST /api/schema-connections`, `POST .../:id/introspect` |
| Health | `GET /api/healthz` |

---

## Design choices (this branch)

- **Context map** is a first-class tab: contexts only, with labeled inter-context relationships.
- **Designer** supports palette drag/click for elements and click-to-connect UML relationships.
- **Event storming** is isolated so storm stickies do not clutter the structural domain topology.
- Relationship **text labels are omitted on the designer** (UML symbols carry the meaning); labels appear on the **Context map** only.

---

## Advanced modeling (implemented gaps)

| Capability | How it works |
|------------|----------------|
| **Invariants** | Aggregates / roots / sagas / ACLs store `invariants[]`. Marking status `validated` runs structural checks (e.g. aggregate must compose exactly one root). `GET /api/model/validate` and `POST /api/domain-nodes/:id/validate-invariants`. |
| **Ubiquitous language** | **Glossary** page + `GET/POST/PATCH/DELETE /api/glossary`. Terms scoped to a context with aliases. |
| **Formal context-map types** | Relationship types: `shared-kernel`, `customer-supplier`, `conformist`, `anti-corruption`, `open-host-service`, `published-language`, `partnership`, `separate-ways`. Labels auto-fill when empty. |
| **Versioned domain events** | Events carry `eventVersion`, `eventPayloadSchema` (JSON Schema or prose), `eventCompatibility`. |
| **Saga / process manager** | Node kinds `saga` and `process-manager`; validation warns if no `compensate()`. |
| **Anti-corruption layer** | Node kind `anti-corruption-layer` plus relationship type `anti-corruption`. |
| **Persistence** | Workspace JSON at `data/workspace.json` (or `DDD_DATA_DIR`). Survives API restarts. |

---

## AI capability — two named designers

DDD Studio is a **design IDE**. AI proposes strategic and tactical models for the canvas; it does **not** generate application code.

Both designers use the same contract:

- **JSON Schema:** `lib/api-spec/schemas/ddd-domain-design.schema.json`
- **Root shape:** `projectName` + **`boundedContexts` (list)** + optional `elements`, `relationships`, `glossary`

| Designer | ID | When it runs | Role |
|----------|-----|--------------|------|
| **Gemini ADK Designer** | `gemini-adk` | `GOOGLE_GENAI_API_KEY` or `GEMINI_API_KEY` set (and `@google/adk` installed) | Live model via **Google ADK 2.x** + Gemini structured JSON (`outputSchema`) |
| **Studio Sketch Designer** | `mock` | No key, ADK missing, or forced offline | Deterministic multi-context sketch for demos, CI, and local exploration |

Both paths are intentional and first-class: live design when you have Gemini; sketch design when you do not.

### API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ai/designers` | List named designers |
| `GET /api/ai/domain-design-schema` | Schema metadata |
| `POST /api/ai/generate-domain` | Run a designer; optionally apply to the workspace |

```http
POST /api/ai/generate-domain
Content-Type: application/json

{
  "prompt": "SaaS billing with subscriptions, invoices, and dunning",
  "apply": true,
  "mode": "merge"
}
```

Response includes `source` (`gemini-adk` | `mock`), `designer: { id, name, description }`, and `design` JSON.

### UI

Domain map toolbar → **AI design** → **Preview JSON** or **Generate & apply to map**.

### Auth (Gemini ADK Designer only)

```bash
export GOOGLE_GENAI_API_KEY=your_key   # or GEMINI_API_KEY
export GEMINI_MODEL=gemini-2.5-flash   # optional
pnpm --filter @workspace/api-server add @google/adk@^2.0.0
```

### Implementation

- Agent: `artifacts/api-server/src/ai/domain-designer-agent.ts`
- Schema prompt: `artifacts/api-server/src/ai/domain-design-schema.ts`
- Routes: `artifacts/api-server/src/routes/ai.ts`
- Apply: `applyAiDomainDesign()` in `ddd.ts`

---

## Event storming chains, sagas & CQRS (design)

### Process links (event storming)
| Type | Meaning |
|------|---------|
| `triggers` | Command (or policy) causes a domain event |
| `reacts-to` | Policy / saga / handler listens to an event |
| `publishes` / `subscribes` | Aggregate publish / subscriber listen |
| `orchestrates` | **Orchestration saga**: central coordinator drives steps |
| `choreographs` | **Choreography**: peers react via events only (no central boss) |
| `projects-to` | Event updates a **CQRS read model** |
| `handles` | Command/query handler executes a command or query |

Select a sticky on the **Event storming** tab to highlight the publisher/listener chain (timeline layout).

### Saga styles
- **Orchestration** — one saga/process-manager issues commands and tracks state (`sagaStyle: orchestration`).
- **Choreography** — local policies `reacts-to` events and issue the next command (`sagaStyle: choreography`).

### CQRS (design model)
| Kind | CQRS side |
|------|-----------|
| `command`, `command-handler` | write |
| `query-handler`, `read-model` | read |
| `projects-to` edge | event → read model projection |

Validation: exactly one `handles` edge per command; query handlers must not sit on the command side.

---

## Export JSON + Gemini codegen

Design is the source of truth. Code is a **projection** of the export document.

### Export

| Endpoint | Purpose |
|----------|---------|
| `GET /api/workspace/export` | Stable versioned JSON (`schemaVersion`, contexts, elements, relationships, glossary, processChains, cqrs, sagas) |

UI: toolbar **Export JSON** downloads the file.

### Code generation

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ai/generate-code` | Consume export JSON → source files via ADK / sketch |
| `GET /api/ai/code-generators` | List **Gemini ADK Codegen** and **Studio Sketch Codegen** |

Body (optional fields):

```json
{
  "stack": "typescript-express",
  "packageName": "my-domain",
  "scope": "full",
  "includeTests": false
}
```

If `export` is omitted, the live workspace is exported automatically.

| Generator | When |
|-----------|------|
| **Gemini ADK Codegen** | `GOOGLE_GENAI_API_KEY` / `GEMINI_API_KEY` set |
| **Studio Sketch Codegen** | Offline deterministic TypeScript stubs from the export |

UI: toolbar **Generate code** → choose stack/scope → download codegen JSON bundle (`files[]` with path + content).

Flow: **Design → Export JSON → Generate code with Gemini**.

