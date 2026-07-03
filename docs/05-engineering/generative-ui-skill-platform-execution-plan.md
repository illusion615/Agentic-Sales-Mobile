# Generative UI + Skill Platform — Execution Plan

> Trackable, task-level breakdown for the "metadata- and skill-driven" solution.
> **Source of truth (design):** Study-Room article `posts/agentic-sales-mobile-generative-ui/index.html`
> (topic `agentic-crm`). This file is the *delivery tracker*; the article is the *rationale*.
>
> **Goal:** adding a standard business entity (e.g. service work order) becomes
> "sync Dataverse schema + author/attach a Business Skill SOP" — **zero edits** to the
> Copilot panel / renderer / form components. CRUD capability is derived from Dataverse
> metadata; skills store business SOPs that can be shared across Copilot Studio and the
> Code App runtime.

---

## How to use this tracker

- Update the **Status** box of each task as work proceeds.
- A phase is **Done** only when every task is `[x]` **and** its Exit Criteria pass.
- Keep this file in sync with the article: if scope changes here, reflect it there (and vice versa).
- Do not start a phase until its **Depends on** phase is Done (phases are behavior-preserving and ordered).

### Status legend

| Box | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done (acceptance met) |
| `[!]` | Blocked (note the blocker) |

### Owners

| Role | Name |
|---|---|
| Tech lead | _TBD_ |
| Frontend | _TBD_ |
| Dataverse / Platform | _TBD_ |
| QA / Eval | _TBD_ |

---

## Architecture targets (reference)

New code-side infrastructure introduced by this plan:

| New artifact | Responsibility |
|---|---|
| `src/lib/entity-descriptor.ts` | `resolveEntityDescriptor(table)` — merge DV metadata ⊕ skill UX manifest into one descriptor (cached). |
| `src/lib/skill-loader.ts` | Runtime loader: read Business Skill metadata/instructions from the chosen path (P3-T4) → validate → cache + invalidate. |
| `src/lib/runtime-capability-adapter.ts` | Allowlisted runtime capabilities that SOPs may use: Dataverse read/write, Calendar, Knowledge Agent, etc. |
| `src/components/generic-record-list.tsx` | Descriptor-driven list card (replaces entity branches in `dynamic-data-renderer.tsx`). |
| `src/components/generic-form-card.tsx` | Descriptor-driven draft form (replaces 8 per-entity branches in `form-card.tsx`). |
| `src/pages/generic-detail.tsx` | Descriptor-driven read-only detail fallback (opt-in bespoke overrides remain). |
| Official Dataverse Business skills | SOP registry as data (Name + Description + Markdown Instructions). Storage decision: [`business-skills-sop-storage.md`](business-skills-sop-storage.md). |
| Business Skills maker page (More > Business skills) | Business-admin maintenance of SOP skills. |

Existing files to refactor (demolish hard-coded entity coupling):
`src/lib/copilot-agent.ts` (buildRecordList), `src/components/dynamic-data-renderer.tsx`,
`src/components/form-card.tsx`, `src/lib/function-registry.ts`, `src/lib/function-executor.ts`.

---

## Phase 0 — Extract descriptors (behavior-preserving)

**Goal:** make the four existing entities' implicit display rules explicit as
`EntityDescriptor` data objects; components still render the same, but read from descriptors.
**Depends on:** none. **De-risking:** proves the descriptor schema covers today's behavior.

| ID | Task | Deliverable / files | Acceptance | Status |
|---|---|---|---|---|
| P0-T1 | Define `EntityDescriptor` + `FieldDescriptor` types (fields, list columns, form groups, primary/secondary, icon, nav, fuzzy key, formatter) | `src/lib/entity-descriptor.ts` (types only) | Types compile; reviewed against all 4 entities' current behavior | `[ ]` |
| P0-T2 | Author descriptors for account / contact / opportunity / activity by reading current renderer + form constants | `src/lib/descriptors/*.ts` | Each descriptor reproduces current `fieldDisplayNames` / `priorityColumns` / nav / form layout | `[ ]` |
| P0-T3 | Add Zod schema for `EntityDescriptor`; validate the 4 descriptors at build | `entity-descriptor.ts` + unit test | `pnpm test` green; invalid descriptor fails fast | `[ ]` |
| P0-T4 | Snapshot tests of current list + form output for the 4 entities (regression baseline) | `src/__tests__/descriptor-baseline.test.ts` | Snapshots captured from current code before any wiring | `[ ]` |

**Exit criteria:** 4 descriptors exist and validate; regression snapshots captured; **no UI change shipped**.

---

## Phase 1 — Route the list through descriptors

**Goal:** `buildRecordList` + list rendering become descriptor-driven; remove the
function-name `switch` and `detectEntityType` field-sniffing. **Depends on:** P0.

| ID | Task | Deliverable / files | Acceptance | Status |
|---|---|---|---|---|
| P1-T1 | Carry an explicit `entity` tag in the agent payload (stop inferring from field shapes) | `copilot-agent.ts`, agent response type | Payload includes entity key; no reliance on `detectEntityType` | `[ ]` |
| P1-T2 | Rewrite `buildRecordList` to map rows via descriptor (title/subtitle/meta from descriptor fields) | `copilot-agent.ts` | Removes the `fnName === 'queryAccounts' …` switch | `[ ]` |
| P1-T3 | Build `GenericRecordList` consuming a descriptor; port icon/format/badge/nav from descriptor | `components/generic-record-list.tsx` | Renders all 4 entities from descriptors | `[ ]` |
| P1-T4 | Swap `dynamic-data-renderer.tsx` to delegate array rendering to `GenericRecordList`; delete entity branches/`detectEntityType` | `dynamic-data-renderer.tsx` | Entity-specific branches removed; baseline snapshots pass | `[ ]` |
| P1-T5 | Verify in browser (Power Apps) — query each entity, lists identical to before | — | Visual parity for 4 entities; no console errors | `[ ]` |

**Exit criteria:** lists render via descriptors only; P0 snapshots unchanged; entity branches in renderer = 0.

---

## Phase 2 — Route the form through descriptors

**Goal:** `form-card.tsx`'s 8 per-entity field-layout branches become field assembly
from the descriptor; static create hooks become a generic create via a service registry.
**Depends on:** P1.

| ID | Task | Deliverable / files | Acceptance | Status |
|---|---|---|---|---|
| P2-T1 | Build `GenericFormCard` assembling `EditableField`s from descriptor field set + groups | `components/generic-form-card.tsx` | Reuses existing `EditableField`; supports text/select/date/textarea/number | `[ ]` |
| P2-T2 | Introduce a service registry (`table → create/update`) to replace static `useCreateActivity` etc. | `src/lib/service-registry.ts` | Generic create/update resolves by table; cache invalidation preserved | `[ ]` |
| P2-T3 | Replace `form-card.tsx` per-entity branches + icons with descriptor-driven rendering | `form-card.tsx` | 8 branches removed; draft-confirm + save semantics identical | `[ ]` |
| P2-T4 | Preserve required-field hints, attachments-on-activity, account "last contacted" touch behaviors via descriptor flags | descriptors + `generic-form-card.tsx` | Existing special behaviors still fire | `[ ]` |
| P2-T5 | Browser verification — draft/create/update each entity end-to-end | — | All 4 entities create/update correctly; no regressions | `[ ]` |

**Exit criteria:** forms render + save via descriptors only; per-entity branches in `form-card.tsx` = 0; E2E create/update green.

---

## Phase 3 — Business Skills as SOP data + runtime loader

**Goal:** use official Dataverse Business skills as the SOP registry,
compatible with `copilot-studio/skills/*.SKILL.md`. **Depends on:** P2.

> **Validation-first:** execute the spike sequence S1–S5 in [`business-skills-sop-storage.md`](business-skills-sop-storage.md) §6 (each with a go/no-go gate) before refactoring the local pipeline. Touch project scaffolding (data source / unbound-action connection) only to validate; full pipeline refactor waits for design sign-off.

### 3A — Dataverse schema

| ID | Task | Deliverable | Acceptance | Status |
|---|---|---|---|---|
| P3-T1 | Adopt official Dataverse Business skills as SOP storage (`Name` + `Description` + Markdown `Instructions`); no custom skill table | [`business-skills-sop-storage.md`](business-skills-sop-storage.md) | Reviewed; compatible with existing `copilot-studio/skills/*.SKILL.md` | `[x]` |
| P3-T2 | Enable/verify official Business skills path: Dataverse MCP server enabled, **Power Apps > More > Business skills** visible, upload `.SKILL.md` works | Environment check + uploaded skills | **Done (boss):** all 5 `.SKILL.md` uploaded to DV Business skills | `[x]` |
| P3-T3 | Add current SOP skills to solution as **Business skill** objects | Solution contents | **Done (boss):** `log-sales-activity`, `manage-account-contact`, `manage-opportunity`, `plan-and-recommend`, `query-and-report` added to solution | `[x]` |
| P3-T4 | Spike: confirm how the Code App reads Business skills at runtime | Decision note | **Done:** `skills` data source added via npm Power Apps CLI; Local Play runtime read confirmed 5 active skills. See [`business-skills-sop-storage.md`](business-skills-sop-storage.md) §4.5 / §6.1 | `[x]` |

### 3B — Frontend loader + executor

| ID | Task | Deliverable / files | Acceptance | Status |
|---|---|---|---|---|
| P3-T5 | Add `skills` (logical `skill`) as a read-only data source, then `skill-loader.ts`: read `name`/`description`/`body` (active `statecode`) → validate → cache + invalidate | `src/lib/skill-loader.ts` + generated `skills` service | **Done:** bad/malformed skill skipped, inactive skipped, cache + force reload tested; 4 unit tests pass | `[x]` |
| P3-T6 | Runtime capability adapter — give the local pipeline WorkIQ (calendar) via the unbound Custom API `McpExecuteWorkIQTask` (+ poll `McpGetWorkIQTaskStatus`); approval loop maps to draft-confirm UI. Signatures in [`business-skills-sop-storage.md`](business-skills-sop-storage.md) §5; validate via spikes S3/S4 | adapter module | **Partial:** Custom API discovery + submit/status protocol work; no terminal `final_response` yet, so do not wire UI | `[~]` |
| P3-T7 | Feed SOP metadata (`name` + `description`) to Frame/Orchestrator for routing, then retrieve full instructions only when needed | `function-registry.ts`, `copilot-agent.ts` | Routing uses metadata first; instructions are loaded lazily | `[ ]` |
| P3-T8 | Execute SOP by following Markdown instructions with existing intent queue / confirm-before-write semantics | `function-executor.ts`, queue integration | Existing five SOP skills behave consistently with Copilot Studio versions | `[ ]` |
| P3-T9 | Sync/export tooling: `.SKILL.md` ↔ Business skills row/object, with source hash conflict detection | script / workflow | Local file and environment skill can round-trip without losing name/description/instructions | `[ ]` |

### 3C — Guardrails (security — all required)

| ID | Task | Acceptance | Status |
|---|---|---|---|
| P3-T10 | Business skill sharing/visibility/RBAC: only approved owners/co-owners edit; organization visibility used deliberately; audit/solution ALM confirmed | Non-admin cannot edit shared SOPs; solution packaging works | `[ ]` |
| P3-T11 | Capability allowlist: SOP can only invoke runtime capabilities that Code App exposes (Dataverse, Calendar, Knowledge Agent, etc.) | Arbitrary tool/table/action request refused or escalated safely | `[ ]` |
| P3-T12 | Confirm platform data trimming still applies (security roles + `_ownerid_value`) | Misconfigured skill cannot exceed user's data permissions | `[ ]` |
| P3-T13 | Load-time validation + safe degradation verified with a deliberately broken SOP | App loads; bad SOP skipped + warned | `[ ]` |

**Exit criteria:** SOP skills are sourced from official Business skills, existing `.SKILL.md` files round-trip, guardrails pass, and Copilot Studio / Code App can share the same process definitions.

---

## Phase 4 — Hydrate metadata + align the backend + generic detail page

**Goal:** descriptor field facts hydrate from runtime `getEntityMetadata`; backend Copilot
Studio skills derive from the skill table; add a generic read-only detail fallback.
**Depends on:** P3.

| ID | Task | Deliverable / files | Acceptance | Status |
|---|---|---|---|---|
| P4-T1 | Hydrate descriptor field type/options/labels/required from `getEntityMetadata` (cached) instead of codegen literals | `entity-descriptor.ts` | Choice/label/required come from DV metadata at runtime | `[ ]` |
| P4-T2 | Metadata cache + invalidation strategy (long TTL; manual refresh hook) | `entity-descriptor.ts` | First-render latency acceptable; cache verified | `[ ]` |
| P4-T3 | Localization fallback (`UserLocalizedLabel`) when a choice lacks zh label | `entity-descriptor.ts` | No raw key/English leaks when label missing | `[ ]` |
| P4-T4 | Keep backend Copilot Studio agent and the shared Business skills aligned (single source = official Business skills) to kill two-brain drift | `copilot-studio/` | Backend agent reads the same Business skills; no manual dup | `[ ]` |
| P4-T5 | `GenericDetailPage` descriptor-driven read-only fallback + route resolution | `pages/generic-detail.tsx`, router | New entity gets a detail view out of the box | `[ ]` |
| P4-T6 | Bespoke detail pages remain as opt-in overrides (registry of overrides) | router/override map | Existing rich pages still used where defined | `[ ]` |

**Exit criteria:** metadata-driven facts at runtime; backend skills auto-derived; generic detail fallback works; bespoke overrides intact.

---

## Phase 5 — MDA maintenance + testing + work-order pilot (acceptance)

**Goal:** business admins maintain skills via a model-driven app with a test page; prove
the whole thing with a brand-new entity (work order) at **zero** component edits.
**Depends on:** P4.

### 5A — MDA + testing

| ID | Task | Deliverable | Acceptance | Status |
|---|---|---|---|---|
| P5-T1 | Maintain SOP skills via the official **Business skills** maker page (create/edit/deactivate/share) | Business skills in solution | Admin can add/edit/disable SOP skills | `[ ]` |
| P5-T2 | Lightweight test page: enter an utterance → call existing Power Automate Flow / AI Builder prompt → show matched skill + extracted params (no write) | Custom page / PCF | Frame dry-run returns skill + params; read-only | `[ ]` |
| P5-T3 | (Second wave) end-to-end test: embedded canvas/PCF runs draft → confirm → persist | PCF / canvas | Full round-trip in test harness | `[ ]` |
| P5-T4 | RBAC + solution packaging for cross-env (dev/test/prod) movement | solution | Skill rows + MDA export/import cleanly | `[ ]` |

### 5B — Work-order pilot (the acceptance test)

| ID | Task | Acceptance | Status |
|---|---|---|---|
| P5-T5 | Sync work-order Dataverse table (`incident` or `crf5c_workorder`) + run data-source codegen | Generated layer present | `[ ]` |
| P5-T6 | Author a work-order SOP as a **Business skill** (Markdown instructions); CRUD on the new table is derived from metadata, not authored per-op | Business skill only; no new handler code for standard ops | `[ ]` |
| P5-T7 | In chat: query / create / update a work order → list card + draft form appear automatically | Lists + forms generated; correct controls per field type | `[ ]` |
| P5-T8 | **Confirm zero edits** to `copilot-panel.tsx`, `dynamic-data-renderer.tsx`, `form-card.tsx`, `function-registry.ts` for the pilot | `git diff` touches none of these for the work-order add | `[ ]` |
| P5-T9 | Browser self-validation: app loads, send message → response, no console errors, changed feature works | Pre-release checklist green | `[ ]` |

**Exit criteria (project Definition of Done):** a new standard entity is added by
**(1)** Dataverse schema sync + codegen and **(2)** skill-table rows + UX manifest —
with **zero** edits to panel/renderer/form/registry components, business-admin
maintainable via the MDA, and validated end-to-end in the browser.

---

## Cross-cutting checklists

### Security (must hold at every phase touching skills/data)
- [ ] Official Business Skill sharing/visibility restricts editing to approved owners/co-owners.
- [ ] Runtime capability adapter allowlists what SOPs may invoke; unsupported tools/actions fail safely.
- [ ] Dataverse security roles + `_ownerid_value` trimming still bound every read/write.
- [ ] Skill metadata/instructions are validated on load; bad SOPs skipped + warned, never fatal.

### Quality gates per phase
- [ ] `pnpm test` (vitest) green; new unit tests for new infra.
- [ ] Behavior-preserving phases: P0 regression snapshots unchanged.
- [ ] Browser self-test before declaring done (load → message → response → no console errors).
- [ ] Build discipline respected (`tsc -b` cold compile may take 50–90 min — never kill; Node 22 LTS; push does not rebuild).

### Documentation sync
- [ ] Keep the Study-Room article (`agentic-sales-mobile-generative-ui`) aligned with any scope change here.
- [ ] Update repo memory (`/memories/repo/project-facts.md`) when new infra files land.

---

## Risk register (from the report — track mitigations as tasks)

| Risk | Mitigation (task ref) |
|---|---|
| Type-safety erosion (runtime descriptors vs compile-time unions) | P0-T3, P3-T9 (Zod + codegen typed) |
| Metadata fetch latency | P4-T2 (cache + prefetch) |
| Polymorphic / lookup fields (activity family; work-order lookups) | reuse fuzzy-match cascade; descriptor declares lookup target |
| Option-set localization gaps | P4-T3 (UserLocalizedLabel fallback) |
| Function-calling accuracy with generic descriptions | keep human one-line purpose in `description` |
| Skill-table misconfiguration | P3-T13, P5-T2 (Zod + dry-run before enable) |
| Skill-table permission abuse | P3-T10/T11/T12 (RBAC + allowlist + trimming) |
| Two-brain drift (frontend vs Copilot Studio) | P4-T4 (derive backend from the table) |

---

## Residual manual work (honest boundary — NOT eliminated)

- Data-source codegen is a human-triggered build step (`npx power-apps`).
- UX intent (list columns, primary/secondary, nav, fuzzy key) is authored as a skill-table row (data, not code).
- Bespoke rich detail pages and special validation beyond DV required-level remain opt-in code.
- Official Dataverse **Business skills** are Preview (not production) — this custom table is the production path now; map the prose fields onto Business skills if/when they reach GA.
