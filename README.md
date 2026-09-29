# DDD Studio

An IDE for **Domain-Driven Design**: bounded contexts, a domain model designer, a context map, event storming, a ubiquitous-language glossary, database reverse-engineering, and **Gemini-assisted domain design and code generation**.

Node.js only — one TypeScript codebase in two folders:

```
ddd-studio/
├─ server/   Express 5 API (TypeScript). Persistence, validation, introspection, Gemini agents.
└─ client/   React 19 + Vite UI (TypeScript, Tailwind 4).
```

## Quick start

Requires **Node 22+** (developed on 24).

```bash
npm install
npm run dev          # API on :8080, UI on http://localhost:5173 (the UI proxies /api)
```

Production-style, single process on http://localhost:8080:

```bash
npm run build        # builds client/dist and server/dist
npm start            # the server also serves the built client
```

Other scripts: `npm run typecheck`, `npm test` (server tests, fully offline).

## Configuration

Set environment variables or copy `server/.env.example` to `server/.env` (real environment variables win).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | API port |
| `DDD_DATA_DIR` | `server/data` | Where `workspace.json` is stored |
| `GOOGLE_CLOUD_PROJECT` | from your ADC | Vertex AI project |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex AI region |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model used for design and codegen |
| `DDD_AI_OFFLINE` | off | `1` forces the offline sketch designer/codegen |
| `CORS_ORIGIN` | none | Only if the UI is hosted on a different origin |
| `CLIENT_DIST` | `client/dist` | Built UI served by the API |

## Gemini (Vertex AI + Application Default Credentials)

No API keys. Authenticate once and go:

```bash
gcloud auth application-default login
# optional: gcloud auth application-default set-quota-project <project>   (or set GOOGLE_CLOUD_PROJECT)
npm run dev
```

In a service context use `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json` or workload identity.

Two designers / generators share one contract, and the UI always tells you which one ran:

| | Live | Offline fallback |
|---|---|---|
| Design | **Gemini ADK Designer** (`gemini-adk`) | **Studio Sketch Designer** (`mock`) |
| Code | **Gemini ADK Codegen** | **Studio Sketch Codegen** (TypeScript stubs only) |

- The sketch path is used only when credentials are not usable; the API returns `fallbackReason` and the UI shows a banner and a warning toast. **A failed live call is never silently replaced by the sketch** — you get the real error.
- The design contract is one Zod schema (`server/src/ai/design-schema.ts`), used to constrain Gemini's output, to validate it, and served as JSON Schema at `GET /api/ai/domain-design-schema`. Invalid elements/relationships/terms are dropped and reported (`dropped`) rather than failing the whole design.
- **AI design → preview → apply.** *Generate design* shows the proposal; *Apply to map* applies that exact proposal (no second model call). Applying merges into your workspace: existing contexts/elements with the same name are reused, and your project name is kept.
- Strategic relationships (customer-supplier, anti-corruption, …) may name bounded contexts; they are attached to a representative element in each context.
- **Codegen** consumes the versioned export (`GET /api/workspace/export`) and returns `files[]` (downloaded as a JSON bundle). Exports over 200k characters are refused with advice to narrow the scope, rather than truncated.

## Modeling workflow

A new workspace is **blank**. The first screen lets you name the project, add the first bounded context, ask Gemini for a starting point, or (optionally) load the sample Commerce Platform.

1. **Contexts** — *Add context* on the Domain map. The **Context map** tab shows only contexts and their strategic relationships (the only view with edge labels).
2. **Domain designer** — add aggregates, roots, entities, value objects, repositories, services, resources by clicking or **dragging them from the palette onto the canvas**, then draw relationships by dragging (see below). Each bounded context is drawn as a boundary around its elements.
3. **Event storming** — commands, events, policies, actors, sagas, handlers and read models live on their own board; select a sticky to highlight its publisher/listener chain.
4. **Glossary** — ubiquitous language per context.
5. **Validate** — marking an element `validated` runs model rules (an aggregate needs exactly one root and documented invariants, etc.); `GET /api/model/validate` reports everything. A rejected edit changes nothing.
6. **Export / generate** — *Export JSON*, or *Generate code*.

## The diagram canvas

The canvas is built for diagrams that stay readable as they grow.

| You want to | Do this |
|---|---|
| Move an element | Drag it. It snaps to a 16 px grid and can never land on another element; a drop that would collide (or make two contexts overlap) slides to the nearest free spot, and says so. Positions are saved automatically. |
| Move a whole context | Drag the title strip of its boundary. |
| Move an element to another context | Select it and change *Belongs to* in the inspector. It is re-placed beside its new context. (Dragging never lets two contexts overlap, so this is the way to move between them.) |
| Connect two elements | Drag from the small dot that appears on an element and drop anywhere on another element. The relationship type is chosen from the two element kinds (aggregate → root is *composition*, root → event is *publishes*, command → event is *triggers*, …). Pick a type in the palette first to override it for the next connections. |
| Change, label, reverse or delete a relationship | Click the line, then use the inspector (or press Delete). |
| Link two contexts | On the **Context map**, drag from one context to another (defaults to *customer–supplier*). |
| Add an element in place | Drag a kind from the palette onto the canvas. |
| Clean everything up | **Tidy layout** re-arranges the whole board. |
| Focus | Choosing a context or searching dims everything else instead of hiding it, so the layout never shifts. |

How it keeps the picture clean:

- **Orthogonal routing** — every relationship is a line of horizontal and vertical segments, the equivalent of PlantUML's `skinparam linetype ortho`, but aware of the elements: lines leave and enter an element square through a port, **route around any element in the way**, take as few bends as possible, give parallel relationships their own lanes, and avoid crossing where a reasonable detour exists. The router is a grid-based A* search (`client/src/diagram/router.ts`); moving one element only re-routes the lines attached to it.
- **Automatic layout** — layered (Sugiyama-style) placement inside each bounded context, long chains folded into compact rows, contexts arranged as a landscape block, and always enough clearance between elements for lines to pass (`client/src/diagram/layout.ts`). New elements land beside their own context; a new AI-generated or imported context is placed as a block to the right of what is already there. Existing elements are never moved by that.
- **Labels** only appear on the context map and event board, and are placed along their own line where they do not cover another label or an element.

Model rules and relationship types (including CQRS `handles`/`projects-to` and saga `orchestrates`/`choreographs`) are described by the types in `server/src/domain/model.ts`.

### UML notation used on the palette and the canvas

| Relationship | Line | Arrowhead |
|---|---|---|
| Composition / Owns | solid | filled diamond at the source, open arrow at the target |
| Aggregation | solid | hollow diamond at the source, open arrow at the target |
| Generalization | solid | hollow triangle ("is-a") |
| Specialization / Realization | dashed | hollow triangle ("implements") |
| Uses, Subscribes | dashed | open arrow |
| Publishes, Invokes, Exposed by, and the process types | solid | filled arrow |
| Customer-Supplier, Conformist, Anti-corruption, Open Host Service, Published Language | fine dashed | filled arrow, plus a short acronym (SK, C→S, CF, ACL, OHS, PL, P, SW) since these context-mapping patterns look alike on the wire and are told apart by name |

**Generalization sets (AND / OR / XOR).** When two or more Generalization/Specialization arrows share one superclass, that superclass can carry a constraint saying whether an instance may be more than one subtype at once: **AND** (overlapping), **OR** (at least one applies) or **XOR** (exactly one, disjoint). This is a property of the *superclass element*, not a connection between two elements, so it is set from that element's inspector (the field appears once it has two or more incoming Generalization/Specialization arrows) and shown as a small badge on its card. The palette's "Generalization set" section explains the three symbols; it isn't a draggable connection type.

### Logical vs Physical entities

An Entity is **Logical** by default (a concept in the model, nothing more). Marking it **Physical**, from its inspector, lets you pick one specific table discovered by a [schema connection](#schema-connections-reverse-engineering) — the Entity then carries a small database badge naming that `schema.table`. Removing or renaming the underlying connection has no special handling beyond the safety net below; deleting the connection resets any Entity that pointed at one of its tables back to Logical rather than leaving a dangling reference.

## Schema connections (reverse engineering)

Supports **PostgreSQL, MySQL, Oracle** out of the box and **IBM Db2** with an optional driver.

1. *Add connection*, then *Introspect schema* — the server connects with a read-only session and reads tables, columns, primary keys and foreign keys.
2. Tick the tables you want and *Import as draft elements* into a bounded context: each table becomes a `needs-review` entity, foreign keys become relationships. Re-importing reuses existing elements.

Notes:
- **Passwords are held in server memory only** for the session and are never written to `workspace.json` or logs. After a server restart you are asked for the password again.
- Oracle uses the pure-JavaScript "thin" driver (no Instant Client); it reads the connecting user's own schema, and `Database` is the service name.
- Db2 needs IBM's native driver, which is a heavier install: `npm install ibm_db -w server`. Without it, Db2 introspection reports how to enable it. (The Db2 queries are untested against a real Db2.)
- The server connects to whatever host you enter. It is designed as a local/trusted developer tool — do not expose it to untrusted users.

## Data and persistence

The workspace is stored at `server/data/workspace.json` (or `DDD_DATA_DIR`), written atomically. An unreadable file is moved aside as `workspace.json.corrupt-<time>` instead of being overwritten. *Settings → Start over* can clear the workspace or load the sample. Element positions are stored with the workspace; files saved by older versions (which used percentages) are re-laid-out automatically the first time they are opened.

To start again from a blank workspace, use *Settings → Start over → Clear workspace*, or stop the server and delete `server/data/workspace.json`.

## API

All routes are under `/api`. Request bodies are validated with Zod; errors are `{ "error": "…" }` (model-rule failures also carry `issues`).

| Area | Endpoints |
|---|---|
| Health | `GET /healthz` |
| Workspace | `GET/PATCH /workspace`, `PUT /workspace/layout` (save positions), `POST /workspace/reset`, `GET /workspace/export`, `GET /model/validate` |
| Contexts | `GET/POST /bounded-contexts`, `PATCH/DELETE /bounded-contexts/:id` |
| Elements | `GET/POST /domain-nodes`, `PATCH/DELETE /domain-nodes/:id`, `POST /domain-nodes/:id/validate-invariants` |
| Relationships | `GET/POST /relationships`, `PATCH/DELETE /relationships/:id` (PATCH changes type or label, or reverses by swapping source and target) |
| Glossary | `GET/POST /glossary`, `PATCH/DELETE /glossary/:id` |
| Connections | `GET/POST /schema-connections`, `DELETE /schema-connections/:id`, `POST …/:id/introspect`, `GET …/:id/snapshot`, `POST …/:id/import` |
| AI | `GET /ai/auth-status`, `GET /ai/designers`, `GET /ai/code-generators`, `GET /ai/domain-design-schema`, `POST /ai/generate-domain`, `POST /ai/apply-domain`, `POST /ai/generate-code` |

## Code map

- `server/src/domain/` — `model.ts` (single source of truth: Zod schemas + types), `store.ts` (state + persistence), `validation.ts`, `export.ts`, `apply-design.ts`, `import-schema.ts`, `seed.ts`
- `server/src/routes/` — `model.routes.ts`, `connections.routes.ts`, `ai.routes.ts`, shared `http.ts`
- `server/src/introspect/` — one small reader per engine plus the shared snapshot builder
- `server/src/ai/` — ADC check, ADK runner, designer, code generator, design schema
- `client/src/lib/api.ts` — typed API layer. Types are imported from the server's model (type-only), so client and server cannot drift.
- `client/src/diagram/` — the diagram engine, free of React and the DOM: `router.ts` (orthogonal routing, label placement), `layout.ts` (layout and placement), `relations.ts` (UML notation and default relationship types)
- `client/src/components/diagram-canvas.tsx`, `diagram-parts.tsx` — the interactive canvas (React Flow for pan/zoom/drag/connect) and its cards, boundaries and edges
- `client/src/pages/`, `client/src/components/` — Domain map, Glossary, Connections, Settings, palette
- `server/test/`, `client/test/` — `npm test` runs both. Server: the API end to end plus the Postgres introspection SQL against a real in-process Postgres (PGlite). Client: the router (including "an element in the way", lane separation, randomised property tests and a performance budget) and the layout engine.
