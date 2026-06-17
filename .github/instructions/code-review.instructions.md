---
applyTo: "docs/06-reviews/**"
description: "L2 project-specific review standard for Agentic Sales Mobile. Read this in full whenever the boss says 开始架构审查 / 代码审查 / 文档审查 / code review / architecture review. Pairs with L1 skill code-review-framework (method) and L3 /memories/repo/review-baselines.md (trend baseline)."
---

# Code / Architecture / Documentation Review Standard — Agentic Sales Mobile (L2)

> **Role in the 3-tier model.** L1 (`~/.copilot/skills/code-review-framework`) = method (9 dimensions, ABCD, red-line mechanism, flow). **This file (L2)** = THIS project's stack-specific rubrics, thresholds, anti-patterns, scope, and report contract. L3 (`/memories/repo/review-baselines.md`) = current scale numbers + trend.
>
> **Trigger contract.** When the boss says any of {开始架构审查, 代码审查, 文档审查, code review, architecture review, 健康检查, review}, do NOT improvise. Execute the fixed pipeline in §6 using the scopes (§1), rubrics (§3), thresholds (§4), and report contract (§5) below. If this file or L3 is missing, say so and stop — do not free-style.

---

## 1. Three review tracks (run all three unless boss scopes down)

The boss directive: a review covers **code + architecture + documentation**, each with its own strategy.

| Track | Question it answers | Scope (paths) | Granularity |
|---|---|---|---|
| **A. Code** | Is each file/function correct, safe, maintainable? | `apps/sales-copilot/src/**` (excl `__tests__`, `__mocks__`, `generated/**` data, `components/ui/**` vendored shadcn) | File / function |
| **B. Architecture** | Is the system as a whole structurally sound? Layers, boundaries, contracts, god-objects, trend. | `apps/sales-copilot/src/**` (incl `generated/services` adapters) + `copilot-studio/**` (agents designed-as-code) | Module / layer / system |
| **C. Documentation** | Do docs match the code? Are they discoverable and current? | `docs/**`, `.github/instructions/**`, `.github/copilot-instructions.md`, `copilot-studio/{instructions,skills,agents}`, `/memories/repo/*` | Doc-vs-code consistency |

**Per-track strategy:**
- **A. Code** — bottom-up. Sample the largest + most-churned files first (see L3 largest-files list), then spot-check handlers/adapters for the silent-drop and enum-case anti-patterns (§4). Mechanical, high-frequency.
- **B. Architecture** — top-down. Verify the canonical data-flow (§2) is not bypassed, no layer is skipped, no god-object grows unchecked, every L2 invariant (§2) holds. Compare scale to L3 baseline for trend red-lines.
- **C. Documentation** — diff-driven. For every code area changed since last review, confirm its owning doc/instruction/trap card was updated (bidirectional sync rule). Flag docs describing removed patterns.

---

## 2. Architecture invariants (the "should look like" baseline for dimension 1)

**Canonical layering & data flow** (UI → data). A review FAILS dimension 1 if any arrow is bypassed:

```
pages/ (route screens; each sets page context)
  → contexts/copilot-context.tsx (orchestration glue: sendMessage, query invalidation)
    → lib/frame.ts (intent classify) → lib/orchestrator.ts (DAG plan)
      → lib/intent-queue-runtime.ts → lib/function-executor.ts
        → lib/function-registry.ts → lib/functions/*-handlers.ts (business logic)
          → generated/services/*-service.ts (Dataverse adapter: toDv/fromDv, FIELD_MAP)
            → @microsoft/power-apps SDK → Dataverse
```

**Invariants (each is a check; cite file:line as evidence):**
1. **Registry is the authoritative I/O contract** for LLM-backed skills: each declares `responseFormat` (required) + `outputSchema` (Zod). Callers must NOT re-cast/guess shapes. Parse failure → `agentError('parse','executor')`.
2. **Adapters never read `dv.<col>name`** — choice labels via `dvChoice()`, lookup names via `dvLookupName('_<col>_value')` (SDK does not project FormattedValue).
3. **No silent field drop at EITHER layer** — a writable field must exist in BOTH the handler arg→change whitelist AND the adapter `toDv()`. Audit both.
4. **LLM-supplied enum/string filters must normalize** case + Chinese aliases (`normalizeStage`, `STAGE_ALIASES`) before compare.
5. **Query-key convention is strict**: single = `['<entity>', id]`, list = `['<entity>-list']`; writes go through `invalidateRelatedQueries`.
6. **Security = trust platform trimming.** No client-side `ownerid === userId` filter, no `adminMode` flag. Differentiated access is by Dataverse security-role level, not UI.
7. **Every silent recovery is observable** — fallback/retry/default must `console.warn('[tag]')` + thread a boolean+reason to `PipelineResult` + show a Frame Inspector chip. A recovery must never look like a clean run.
8. **LLM transport is text mode + client-side Zod** (NOT AI Builder JSON output — that schema is unusable here).
9. **Markdown is unified on `markdown-content.tsx`** — never revive `markdown-renderer.tsx`.
10. **Copilot Studio agents are designed-as-code** under `copilot-studio/`; logic changes update local design docs FIRST, then the portal.

> Full anti-pattern corpus = `/memories/repo/traps.md` (CLASS BUG cards). Treat each "CLASS BUG" there as a named anti-pattern to scan for during track A/B.

---

## 3. Nine-dimension rubrics — specialized for React + Power Apps Code App + Copilot Studio

Grade each **A** (none) / **B** (log, fix when convenient) / **C** (fix within 2 sessions) / **D** (stop features, fix now). Cite `file:line` evidence per grade.

1. **Architecture consistency** — A: data-flow (§2) intact, no layer skipped, no cross-layer direct call (e.g. page → adapter), all 10 invariants hold. C: a page/component calls a service adapter directly bypassing handlers, or an invariant is violated in 1 module. D: an invariant is violated systemically (e.g. multiple handlers re-cast LLM output).
2. **Code duplication** — A: shared logic in `lib/` utils or a single component. C: same ≥15-line block in 3+ files (e.g. per-page page-context wiring copy-pasted). D: core pipeline step reimplemented per-entity.
3. **Naming & readability** — A: handlers `draft*/update*/query*` convention honored; adapters `toDv/fromDv`; functions self-documenting. C: mixed conventions a new dev would trip on.
4. **Error handling & robustness** — A: `agentError(kind, stage)` used; no swallowed catch; SDK calls guarded. C: a silent `catch {}` that hides a write failure (the activityparty-direct-create class). D: failure shows success toast.
5. **Testability** — A: pure handlers unit-tested (`__tests__`), enum-normalizers covered. C: new handler/adapter with writable fields has no test. D: untestable coupling (logic only reachable through full LLM pipeline). Note CLI test workaround: `npx vitest run --pool=forks --environment=node --no-isolate <file>`.
6. **Performance & resources** — A: context-registration hooks use signature-stable deps + ref; no setState→re-render loops; date-fns subpath imports. C: a `useEffect`/registration with array dep rebuilt each render. D: main-thread monopoly (the `useRegisterDockChips` loop class) or build-breaking barrel import.
7. **Security & data integrity** — A: platform trimming trusted; multibyte flow payloads B64-wrapped; no client-side owner filter as security. C: new client-side data filter dressed as security. D: ownership/isolation logic moved client-side.
8. **Design system & component reuse** — A: shared components reused (form-card MultiContactSelector, markdown-content, kpi-card); Tailwind-first, inline `style` only for dynamic values. C: a component pattern duplicated under a new name. D: parallel rendering systems.
9. **Documentation health** — A: `docs/**`, instructions, traps.md, contracts.md all match code; Copilot Studio local design files in sync with portal. C: doc describes a removed pattern, or new pattern lacks doc/trap coverage. D: instruction actively contradicts code.

---

## 4. Red lines (any → action stated in flow §6)

| Red line | Threshold (set per real file distribution at 2026-06-13 baseline) | Action |
|---|---|---|
| **File bloat — TSX (component/page)** | warn ≥ 500 lines · hard ≥ 800 lines → split plan required | New file crossing hard limit blocks merge until split plan logged. **Grandfathered debt** (already over at baseline: copilot-context, home, kpi-card, copilot-agent, form-card, copilot-panel, intent-queue-runtime) is logged, not blocking — but must not grow >10%. |
| **File bloat — TS (logic module)** | warn ≥ 600 lines · hard ≥ 900 lines | same as above. `i18n.ts` is a translation **data file → exempt** from bloat (judge by key count, not lines). |
| **God-object** | a single file owning ≥3 unrelated responsibilities (e.g. `copilot-context.tsx` 3337L = orchestration + invalidation + queue-build + ack-copy) | Dimension 1 = C minimum; propose extraction. |
| **Duplication** | same logic block (≥15 lines) in 3+ files | Must extract. |
| **Coverage** | new handler/adapter touching writable fields with no `__tests__` | Dimension 5 = C; add test before next feature. |
| **Silent-drop** | any writable/LLM-settable field missing from handler whitelist OR adapter `toDv` | Dimension 4 = D; fix now (this is a recurring CLASS BUG). |
| **D-grade** | any dimension = D | STOP feature work; next session is remediation-only. |
| **Trend** | src_total/pages/components/generated grew ≥25% since L3 baseline, OR any dimension dropped a grade vs last report | Trigger a full review; record in report §trend. |

---

## 5. Report contract (fixed output — no improvisation)

- **Format**: Progressive-Disclosure HTML article (boss-facing doc standard — NOT markdown). Match the Study-Room style already used in `docs/02-architecture/*.html` and `docs/06-reviews/*.html` (warm gradient bg, frosted topbar, numbered sections, accordions for reference detail, dark/light toggle, mermaid for any non-trivial flow/state diagram — verify it renders in-browser before claiming done).
- **Location**: `docs/06-reviews/`
- **Filename**: `code-review-<YYYY-MM-DD>.html` (periodic) / `architecture-review-<YYYY-MM-DD>.html` (architecture-focused) / `<track>-review-<YYYY-MM-DD>.html` (scoped).
- **Required sections** (in order):
  1. **Scope & type** — which tracks (A/B/C), trigger reason, previous review link.
  2. **Scale snapshot** — table comparing current vs L3 baseline: src_total, components, pages, lib, generated, total lines, largest-files list with deltas.
  3. **Nine-dimension scorecard** — grade + `file:line` evidence per dimension, per track.
  4. **Red-line check** — each row of §4 ticked pass/fail with evidence.
  5. **Findings** — problem-led (each opens with the user-facing/maintenance scenario it breaks, then the architecture cause, per writing-rigor memory), grouped by severity.
  6. **Action items** — P0 (next session) / P1 (≤2 sessions) / P2 (when convenient), each with file + concrete fix.
  7. **Baseline update** — the new numbers to write back to L3.
- **After writing the report**: update `/memories/repo/review-baselines.md` (L3) with new counts + "Last full review report" link. Present P0/P1 to boss for prioritization before any remediation.

---

## 6. Fixed pipeline (what "开始审查" executes)

```
1. Read L2 (this file) + L3 (review-baselines.md) + traps.md + contracts.md.
2. Confirm/scope tracks with boss only if ambiguous; default = all three (A/B/C).
3. Collect scale (src counts + largest files) → compare L3 baseline → compute trend red-lines.
4. Track A (code): sample largest/most-churned files; scan for §2/§4 anti-patterns.
5. Track B (architecture): walk the §2 data-flow; verify each of 10 invariants; flag god-objects/bypasses.
6. Track C (docs): diff code-changed areas vs their owning doc/instruction/trap; flag drift.
7. Grade 9 dimensions (ABCD) with file:line evidence; run §4 red-line check.
8. Write the §5 HTML report into docs/06-reviews/.
9. Update L3 baseline; surface P0/P1 to boss. D-grade or P0 → stop features.
```

Severity discipline: ABCD grades and red-line actions are defined in L1; this file only supplies the project-specific evidence criteria above. Do not invent new severities.
