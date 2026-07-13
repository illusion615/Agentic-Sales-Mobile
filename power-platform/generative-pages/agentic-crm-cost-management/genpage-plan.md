# genpage-plan.md — Agentic CRM Cost Management

> **Plan status: APPROVED**
> Planner: `genpage-planner` (CREATE flow, v1)
> Date: 2026-07-13
> Working directory: `power-platform/generative-pages/agentic-crm-cost-management/`

---

## Approved v2 Amendment — Interactive Distribution Analyzer

The fixed operation-total distribution chart is replaced by one interactive analyzer.

### Selectable dimension
- **Operation type** — group by `biz_operationtype`.
- **User** — group by stable `crf5c_userid`, display `crf5c_username`, and show the top users for the selected metric.

### Selectable metric
- Total credits
- Highest consumption
- Lowest consumption
- Average consumption
- Median consumption
- Share of total cost
- Operation count

Max/min/average/median prefer `sole` single-operation samples; shared allocated rows are excluded from those distribution statistics when clean samples exist. Total credits and share of total include every measured row so accounting totals remain exact.

Selecting any bar filters the Agent Log grid by the current dimension. Switching dimension clears the previous cross-filter; switching metric preserves the current dimension and updates ranking/labels interactively.

### User attribution architecture
- Added `crf5c_userid` (Entra object ID snapshot) and `crf5c_username` (display-name snapshot) to `crf5c_agentlog` in `AgenticSalesMobileSolution`.
- Every new chat-turn and standalone AI operation writes both fields from Power Apps host context.
- Existing rows are backfilled from Dataverse Owner → systemuser → Entra object ID/full name.

---

## Approved v3 Amendment — Three Linked Cost Charts

The analytics area uses the supplied finance-dashboard screenshot only as a visual reference (rounded white cards, soft purple data colors, clear legends, generous spacing), not as a data source.

1. **Daily comparison trend** — smooth stacked operation-type areas for each day in the selected period, plus a dashed total-cost curve for the immediately preceding equal-length period. Missing days are zero-filled. Selecting a day filters Agent Log to that calendar date.
2. **Operation cost share donut** — selected-period total credits classified by operation type, with center total and clickable slices/legend items. Selecting a category filters Agent Log by operation type.
3. **Total + candlestick columns** — total-cost columns by operation type (or user), overlaid with per-operation min/max whiskers, average dots, and median markers on a right-hand statistical axis. Dimension and ranking metric remain selectable. Selecting a column filters Agent Log by the active dimension.

All three charts share one `AnalysisFilter`; selecting another chart replaces the previous drilldown, and the clear-filter control restores the full Agent Log list. `All time` has no prior-period curve because no equal preceding range exists.

---

## Approved v4 Amendment — Shared Trend/Donut Panel and Legend

Daily Credit Trend and Operation Cost Share remain two independent interactive charts but are rendered inside one Fluent Card panel. They consume one shared operation-category model (top six operation types plus a deterministic `Other` group), so the same operation type always uses the same color in stacked areas, donut slices, and the single shared legend beneath both charts.

The shared legend is interactive and filters Agent Log. Selecting `Other` filters to all underlying long-tail operation types. The prior-period dashed-line key appears in the same legend but is informational rather than a category filter.

---

## Approved v5 Amendment — Unified Crossfilter Data Pipeline

Every chart and Agent Log consume the same filtered current-period dataset:

`raw current-period rows → date / operation / user filter → trend + donut + column/candlestick + Agent Log`

- Operation filter applies to all three charts and Agent Log; `Other` expands to its member operation types.
- User filter applies to all three charts and Agent Log.
- Date filter applies to all three charts and Agent Log.
- Prior-period trend rows receive the same operation/user filter. For a date drilldown, the dashed comparison applies the aligned day position in the prior equal-length period.
- Operation colors use the full-period base taxonomy and stable color indices, so filtering cannot reassign a category to a different color.
- Selecting another chart replaces the current single crossfilter; clearing restores the full selected-period dataset.

---

## Approved v6 Amendment — Preserve Source Chart Context

Each filter carries a source (`trend`, `donut`, `distribution`, or `legend`). The initiating chart retains the full selected-period dataset and only highlights the chosen day/category, while sibling charts and Agent Log consume the crossfiltered dataset.

- Trend source: full timeline stays visible; selected day is highlighted; donut, column/candlestick, and Agent Log filter to that day.
- Donut source: full donut stays visible; selected slice is highlighted; trend, column/candlestick, and Agent Log filter to that operation category.
- Distribution source: full column/candlestick context stays visible; selected column is highlighted; trend, donut, and Agent Log filter to the selected operation/user.
- Shared-legend source has no single source chart, so all charts filter while the complete legend remains available.
- Zero-current-credit trend days are not drilldown targets, preventing an all-empty dashboard state.

---

## Approved v7 Amendment — Remove Redundant Rank-by Control

The distribution chart already renders all core metrics at once: total cost (column height), min/max (whisker), average (dot), and median (marker). The separate `Rank by` selector is removed to avoid duplicate control logic.

- Columns are now always sorted by total cost descending.
- The chart keeps the existing `Group by` toggle (`Operation type` / `User`).
- Share and operation count remain available in hover/accessible labels.
- Crossfilter behavior remains unchanged: selecting a column still filters sibling charts and Agent Log.

---

## Approved v8 Amendment — Agent Log to AI Event Drill-through

Agent Log row expansion now resolves and displays the exact related `msdyn_aievent` records using the trace GUIDs stored in `biz_aieventtracelist`.

- `msdyn_aievent` is registered as a second read-only page data source.
- Related events load only when a user expands an Agent Log row; the page does not preload AI Event data for the full grid.
- Correlation uses an exact trace marker search against `msdyn_datainfo`; malformed trace metadata is handled without breaking the row detail panel.
- Each result shows processing status, credits consumed, source, processing time, and available event/configuration labels.
- `View details` expands a read-only detail grid inside the current page. The default `msdyn_aievent` model-driven form route ignores an existing record ID and opens a New AI Event form, so it is not used for drill-through.
- Input (`msdyn_datainfo`) and Output (`msdyn_output`) load only after `View details` is selected, so large payloads are not fetched for the entire Agent Log grid.
- Input parsing supports both complete JSON and the incomplete JSON fragment produced when Dataverse truncates `msdyn_datainfo` at its field limit. Internal trace correlation markers are removed before display.
- Truncated inputs show an explicit warning and explain that only the stored prefix is available; Output is formatted as readable JSON when applicable and otherwise shown as text.

---

## Approved v9 Amendment — Agent Log Grouping and Inline Expansion

Agent Log supports four grouping modes: `None`, `User`, `Agent`, and `Operation type`.

- Each active group shows the full filtered record count, pending-credit count when applicable, and summed measured credits.
- Groups are ordered by total credits descending, then label; records retain the active column sort and existing 50-record pagination.
- The dedicated `Details` column is removed. Each record row is clickable and keyboard-expandable with Enter/Space.
- Only one Agent Log row is expanded at a time. Its linked AI Events panel is inserted immediately after that row inside its current group and spans the full grid width.
- Selecting a different grouping mode resets pagination and closes any open Agent Log/AI Event details, preventing stale expansion state from moving between groups.
- Linked-event summaries and Input/Output retain their existing two-level lazy-loading behavior.

---

## Approved v10 Amendment — Dual Credit Meters

Copilot Credits and AI Builder Credits are separate billing currencies and must never be summed or presented as one generic credit value.

- AI Builder Credits remain sourced from `msdyn_aievent.msdyn_creditconsumed` and stored in Agent Log `biz_creditsconsumed` (integer).
- Copilot Credits are sourced from `msdyn_aievent.msdyn_eventdata.messageConsumption.consumption` and stored in new Agent Log `biz_copilotcreditsconsumed` (decimal, precision 4).
- `messageConsumption.featureName` and `units` identify the Copilot billing feature and metered units for each AI Event.
- The matcher Flow polls the exact trace-correlated AI Events, accumulates both meters independently, and applies the operation divisor to both fields.
- The page defaults to Copilot Credits and provides a global Copilot / AI Builder meter selector. All KPIs, charts, findings, rankings, group totals, sorting, and Agent Log credit labels consume only the selected meter.
- Linked AI Event summaries show both values explicitly (for example, `0.4 Copilot Credits` and `0 AI Builder Credits`).
- Historical Agent Logs are backfilled with explicit zeroes for the meter that was not billed, so zero consumption is not mistaken for a pending match.
- The nested inline detail panel must use the entire full-width DataGrid detail cell; content-width shrinking is prohibited.

---

## Approved v11 Amendment — Currency Meter and Cost Settings

Users want ONE tracking dimension rather than juggling two credit currencies. Currency is a legitimate unified view because money is additive across credit types — this does not violate the "never sum raw credits" rule, since it converts each credit type to a common monetary unit first.

- A third meter, `currency`, is added next to Copilot and AI Builder. In this mode every KPI, chart, ranking, group total, and grid cell converts consumed credits into a single monetary amount: `cost = aiBuilderCredits × aiBuilderUnitCost + copilotCredits × copilotUnitCost`. A row is only "pending" when BOTH credit types are null; otherwise a missing type contributes 0.
- A `CostSettings` model (`currencySymbol`, `aiBuilderUnitCost`, `copilotUnitCost`) is user-editable via an inline Settings panel (gear toggle in the header, not a modal — mountNode constraint) and persisted to `localStorage` (`agentic-crm-cost-settings`). Defaults: `$`, AI Builder `0.0005`, Copilot `0.01` (from Microsoft pay-as-you-go reference rates).
- Editing a unit cost live-recomputes all views; "Reset to defaults" restores the reference rates. Invalid/blank numeric input is ignored (the draft string still shows so typing decimals is smooth).
- Meter-aware formatting is threaded through the shared charts via a `format` closure + `noun` ("cost" vs "credits"); `creditMeterLabel` returns "Cost" for currency. Currency amounts render as `<symbol><value>` with 2–4 fraction digits.
- The per-event AI Event detail continues to show RAW Copilot / AI Builder credits (billing evidence) and is never currency-converted.

---

## Approved v12 Amendment — Owner-Based User Attribution and Trend Autoscale

Two refinements: user attribution must follow the Dataverse owner system field, and the daily trend must scale to the data.

- **User attribution follows owner.** The native player often cannot resolve the signing user at write time, so `crf5c_userid` / `crf5c_username` are left null and the dashboard showed "Unattributed user". The Dataverse **owner** system field is always correct, so user identity is derived from owner.
  - The genpage `dataApi.queryTable` contract CANNOT select `ownerid` / `owneridname` / readonly lookup-name fields (for example `createdbyname`) — including any of them in the select throws and the whole page fails to load. So the fix lives in the data layer, not the page read.
  - The matcher Flow (`AI Cost - Backfill Credits`) is extended: after updating credits it does `Get_Owner_User` (get the systemuser by `_ownerid_value`) then `Update_AgentLog_User`, stamping `crf5c_userid` = the owner's `azureactivedirectoryobjectid` (Entra object ID, matching the app's own format) and `crf5c_username` = the owner's `fullname`. This is appended AFTER the credit update so it can never block credit backfill.
  - Existing rows are backfilled the same way (owner systemuser → Entra object ID + fullname). The page keeps reading `crf5c_username` / `crf5c_userid`, now always populated from owner.
- **Trend Y-axis autoscale.** The daily trend domain floored at `1`, flattening small-magnitude series (per-day currency cents, fractional Copilot credits). It now scales to the actual data max (`dataMaxY > 0 ? dataMaxY : 1`) and the axis tick labels use the meter-aware formatter.

---

## 1. User Requirement

Create a generative page named **"Agentic CRM Cost Management"** for users to analyze and manage AI costs accumulated by the Agentic Sales Mobile system.

### Functional scope (v1 — read-only)
| # | Requirement |
|---|---|
| R1 | Summary KPIs: total credits consumed, average credits per operation, count of pending/unmatched records (biz_creditsconsumed IS NULL), total operation count |
| R2 | Time-range filter: Last 7 days / Last 30 days / Last 90 days / All time (applied globally to every widget on the page) |
| R3 | Daily credit trend chart (D3 line chart, x = date, y = credits, stacked by operation type) |
| R4 | Operation-type cost distribution chart (D3 horizontal bar chart, sorted desc by total credits, labeled with %) |
| R5 | High-cost operation ranking table: top-N rows by biz_creditsconsumed, with concentration metric (top-10 share of total) |
| R6 | Searchable, sortable, column-resizable Agent Log data grid with all key fields visible |
| R7 | Computed management findings panel: (a) missing-credit records, (b) high-cost outliers (>2 SD above mean), (c) operation-type concentration (top-1 type > 60% of total = warning) |
| R8 | Manual refresh button; page-level last-refreshed timestamp |
| R9 | Clear loading skeleton, error callout, and empty-state illustrations for every data region |
| R10 | **Read-only for v1**: no bulk delete, no record creation, no new Dataverse table or column |
| R11 | Never expose raw trace GUID payloads (biz_aieventtracelist content) prominently in the default UI; keep detailed trace JSON behind an expand/detail action only |

---

## 2. Environment / App / Solution

| Property | Value |
|---|---|
| PAC CLI version | 2.9.3 |
| Node version | 22.22.3 (LTS) |
| Auth profile | Wells Dev |
| Org URL | https://org1cd97ca4.crm.dynamics.com/ |
| Target model-driven app | Sales Copilot Admin Center |
| App ID | 755e21a1-324d-f111-bec7-7ced8d3c7b0f |
| App unique name | biz_SalesCopilotAdminCenter |
| Solution | AgenticSalesMobileSolution |
| Enabled language | en-US only |

---

## 3. Pages Table

| Page filename | Display name | Data mode | Entity creation | Primary table | Auth context |
|---|---|---|---|---|---|
| `agentic-crm-cost-management.tsx` | Agentic CRM Cost Management | `dataverse` | **Not required** | `crf5c_agentlog` | Inherited from model-driven app (user's session) |

---

## 4. Data Source

### 4.1 Table

**Logical name:** `crf5c_agentlog`
**Display name:** Agent Log
**Entity set:** `crf5c_agentlogs`

No new tables or columns are to be created. All columns listed below must already exist (boss-confirmed live as of 2026-07-12).

### 4.2 Required columns

| Logical name | Display name | Type | Usage |
|---|---|---|---|
| `crf5c_agentlogid` | Agent Log (PK) | UniqueIdentifier | Row identity |
| `crf5c_timestamp` | Timestamp | DateTime | Date filtering, trend x-axis |
| `crf5c_agentname` | Agent Name | SingleLine.Text | Filtering, grid display |
| `crf5c_logname` | Log Name | SingleLine.Text | Turn identifier (grid display) |
| `crf5c_sessionid` | Session ID | SingleLine.Text | Correlation to conversation |
| `crf5c_querytext` | Query Text | SingleLine.Text | Grid display |
| `crf5c_sourcedescription` | Source Description | Memo | Detail view only |
| `biz_creditsconsumed` | Credits Consumed | Integer | KPIs, charts, ranking; NULL = pending |
| `biz_operationtype` | Operation Type | SingleLine.Text | Chart grouping, distribution |
| `biz_operationindex` | Operation Index | Integer | Multi-op ordering within a turn |
| `biz_allocationmethod` | Allocation Method | SingleLine.Text | Grid display (`sole` / `shared`) |
| `biz_aieventtracelist` | AI Event Trace List | Memo | Detail-only (never default-visible) |
| `createdon` | Created On | DateTime | Fallback sort key |
| `_ownerid_value` | Owner | Lookup | User-scoped filtering (optional v1) |

### 4.3 Fetch strategy

- Use `$select` to request only the columns above — no wildcard selects.
- Apply `$filter=crf5c_timestamp ge <windowStart>` for time-range filters.
- Default sort: `$orderby=crf5c_timestamp desc`.
- Use `props.dataApi.queryTable("crf5c_agentlog", { select, filter, orderBy, pageSize })` with the exact signatures generated in `RuntimeTypes.ts`.
- Follow `DataTable.rows`, `hasMoreRows`, and `loadMoreRows()` until all rows for the selected period are loaded; compute KPIs client-side from the same consistent row set.
- Do not import repository-generated Dataverse services and do not use unsupported `$apply`/aggregate options.

---

## 5. Detailed Per-Page Specification

### 5.1 Page identity

```
Route (model-app custom page): /custom-pages/agentic-crm-cost-management
Component file: agentic-crm-cost-management.tsx
Theme provider: inherited from the model-driven app host; do not add a nested FluentProvider
```

### 5.2 Layout structure

```
┌─────────────────────────────────────────────────────────┐
│ Page header bar                                         │
│  Title: "AI Cost Management"  [Last refreshed: 14:32]  │
│  [7d] [30d] [90d] [All]                    [↺ Refresh]  │
├──────────────┬──────────────┬──────────────┬────────────┤
│ KPI tile     │ KPI tile     │ KPI tile     │ KPI tile   │
│ Total        │ Avg/Op       │ Pending      │ Op Count   │
│ Credits      │ Credits      │ (no credits) │            │
├──────────────┴──────────────┼──────────────┴────────────┤
│ Daily Credit Trend          │ Operation Distribution     │
│ (D3 line, stacked area)     │ (D3 horizontal bar)        │
├─────────────────────────────┴────────────────────────────┤
│ Management Findings (amber callout strip, collapsible)  │
├──────────────────────────────────────────────────────────┤
│ High-Cost Operations (ranking mini-table, top 10)       │
├──────────────────────────────────────────────────────────┤
│ Agent Log Grid (full-width, resizable columns)          │
└──────────────────────────────────────────────────────────┘
```

### 5.3 KPI tiles (R1)

Four `Card` components using `CardHeader` + large numeric text (Fluent Body1Strong / Display).

| Tile | Computation | Null handling |
|---|---|---|
| Total Credits | `SUM(biz_creditsconsumed)` for rows in window where not null | Show "—" if no data |
| Avg Credits / Op | `Total / COUNT(rows where biz_creditsconsumed IS NOT NULL)` | Show "—" if zero ops |
| Pending Records | `COUNT(rows where biz_creditsconsumed IS NULL)` | Show 0 |
| Operation Count | `COUNT(*)` | Show 0 |

Pending tile uses `Badge` color `warning` when count > 0.

### 5.4 Time-range filter (R2)

`ToggleButton` group (Fluent `ButtonGroup`): **7d / 30d / 90d / All**. Selected state visually highlighted. Changing the filter:
1. Updates `windowStart` state (Date | null for All).
2. Re-runs all Dataverse queries via React state/query invalidation.
3. Resets chart zoom/scroll.

### 5.5 Daily credit trend chart (R3)

**Component:** `CreditTrendChart.tsx` (internal sub-component)
**Library:** D3 v7 (imported via `import * as d3 from 'd3'`)
**Chart type:** Stacked area / line chart
- X-axis: calendar days within the selected window (UTC day bins).
- Y-axis: cumulative credits (integer; auto-domain with nice rounding).
- Series: one colored area per `biz_operationtype` value found in the data.
- Tooltip: on hover shows date + per-type credits breakdown.
- Data: aggregate client-side from fetched rows (`d3.rollup` by day × operation type).
- Responsive: use `ResizeObserver` hook to recompute SVG viewBox on container width change.
- Empty state: "No data for selected period" centered in the chart bounds.

### 5.6 Operation-type distribution chart (R4)

**Component:** `OperationDistributionChart.tsx`
**Library:** D3 v7
**Chart type:** Horizontal bar chart (sorted descending by total credits)
- Each bar = one `biz_operationtype` bucket.
- Label at right end of bar: "N cr (X%)".
- Color palette: 8-color Fluent categorical scale; cycle if more.
- Click on a bar: filters the Agent Log grid to that operation type (cross-filter).
- Null-operation rows grouped as `"(unassigned)"`.

### 5.7 High-cost operation ranking (R5)

**Component:** Fluent `DataGrid` (compact density), top-10 rows sorted by `biz_creditsconsumed` DESC.

Columns:
| # | Field | Display |
|---|---|---|
| 1 | Rank | 1–10 (computed) |
| 2 | `biz_operationtype` | Operation Type |
| 3 | `crf5c_logname` | Turn ID |
| 4 | `biz_creditsconsumed` | Credits |
| 5 | `biz_allocationmethod` | Allocation |
| 6 | `crf5c_timestamp` | Timestamp |

Below the table: concentration chip — "Top 10 ops = **X%** of total credits" (amber `Badge` if > 50%, red if > 75%).

### 5.8 Management findings (R7)

Collapsible `MessageBar` / `Accordion` strip at top of lower section. Three finding categories computed client-side:

| ID | Rule | Display |
|---|---|---|
| F1 | Missing credits | `COUNT(biz_creditsconsumed IS NULL)` rows → "N operations have not yet been matched to AI Event credits." Severity: info if < 5%, warning if 5–20%, error if > 20% of total ops |
| F2 | High-cost outliers | Rows with `biz_creditsconsumed > mean + 2×stddev` → "N operations are statistical outliers (>2σ above mean). Highest: X credits." Severity: warning |
| F3 | Concentration | If top operation type accounts for > 60% of total credits → "Operation type '<X>' accounts for Y% of all AI credits — consider reviewing frequency." Severity: warning |

When all three findings are clear: green "No issues found" summary chip.

### 5.9 Agent Log grid (R6)

**Component:** Fluent `DataGrid` with `useTableColumnSizing_unstable` (column-resizable).

Default visible columns:
| Column | Field | Sortable | Width |
|---|---|---|---|
| Timestamp | `crf5c_timestamp` | ✓ | 160px |
| Agent | `crf5c_agentname` | ✓ | 140px |
| Operation Type | `biz_operationtype` | ✓ | 200px |
| Turn ID | `crf5c_logname` | ✓ | 160px |
| Query | `crf5c_querytext` | — | 280px flex |
| Credits | `biz_creditsconsumed` | ✓ | 90px right-align |
| Allocation | `biz_allocationmethod` | ✓ | 100px |
| Index | `biz_operationindex` | ✓ | 70px right-align |

Search bar above the grid: client-side filter on `crf5c_logname`, `crf5c_querytext`, `biz_operationtype`, `crf5c_agentname` (case-insensitive substring).

Row detail disclosure: a dedicated icon button toggles an in-page detail row showing `crf5c_sourcedescription` and a redacted trace summary (trace count only by default). Raw `biz_aieventtracelist` is not rendered in v1 — **raw trace GUIDs are never visible in the page UI** (R11).

Grid pagination: 50 rows per page (Fluent `TablePagination`).

Cross-filter: when a bar in the distribution chart is clicked, the grid filters to that operation type. A "Clear filter" chip appears near the search bar.

### 5.10 Loading / error / empty states (R9)

| Region | Loading | Error | Empty |
|---|---|---|---|
| KPI tiles | `Skeleton` rect per tile | `MessageBar` intent="error" with retry | "—" value display |
| Trend chart | `Skeleton` rect (chart bounds) | Inline error text | SVG "No data" text |
| Distribution chart | `Skeleton` rect | Inline error text | "No operations logged" |
| Ranking table | `Skeleton` rows (3) | `MessageBar` | "No operations in period" |
| Grid | `Spinner` centered | `MessageBar` with retry | `EmptyState` illustration + "No agent log records" |

### 5.11 Refresh (R8)

`Button` with `ArrowClockwiseRegular` icon, placed top-right of the header bar.
- On click: re-fetch all queries; show `Spinner` micro-indicator on the button during fetch.
- After successful refresh: update "Last refreshed" label to current local time (format: `HH:mm`).
- Keyboard shortcut: `Ctrl+R` / `Cmd+R` triggers refresh (prevent default).

---

## 6. Interactions

| # | Trigger | Behavior |
|---|---|---|
| I1 | Time-range filter change | Invalidate + re-fetch all data; recalculate findings; reset grid to page 1; clear cross-filter |
| I2 | Distribution bar click | Apply operation-type cross-filter to grid; highlight selected bar; show "Filtered: X" chip |
| I3 | "Clear filter" chip click | Remove cross-filter; restore all grid rows; deselect bar |
| I4 | Grid column header click | Toggle sort asc/desc on that column (client-side sort of fetched rows) |
| I5 | Grid column drag resize | Column widths persist via local state (not localStorage in v1) |
| I6 | Grid search input | Debounce 200ms; client-side filter; shows result count "N results" |
| I7 | Grid row detail toggle | Reveal source description and trace count only; never render raw trace GUIDs |
| I8 | Refresh button | Re-fetch; spinner; update last-refreshed timestamp |
| I9 | Findings accordion toggle | Expand/collapse individual finding items |
| I10 | Trend chart hover | Tooltip with day + per-type credit breakdown |

---

## 7. Responsive & Accessibility Requirements

### Responsive

| Breakpoint | Layout change |
|---|---|
| ≥ 1200px (desktop) | Full two-column chart row; full grid |
| 900–1199px (tablet) | Charts stack vertically; grid scrolls horizontally |
| < 900px (narrow) | Single-column layout; KPI tiles wrap 2×2; charts full-width |

Use Fluent `makeStyles` tokens for breakpoints — no hard-coded `px` in media queries; use `tokens.spacingHorizontalXXL` etc.

### Accessibility

- All interactive elements keyboard-navigable (Tab order: filter buttons → refresh → charts → findings → ranking → grid).
- Chart SVG elements include `role="img"` with `aria-label` describing the chart and current data summary.
- Trend chart tooltip keyboard-accessible via focus on SVG data points (invisible focus targets `<rect>` with tabindex=0).
- Grid follows Fluent `DataGrid` ARIA pattern (role="grid", row/cell roles, aria-sort on sortable headers).
- Color is never the sole differentiator — operation-type bars also have distinct text labels.
- All text meets WCAG AA contrast on both light and dark themes.
- `prefers-reduced-motion`: D3 transitions gated behind `window.matchMedia('(prefers-reduced-motion: reduce)')`.
- Error states use `role="alert"` so screen readers announce them.

---

## 8. Tech Stack & Sample Guidance

### Dependencies (generative page runtime)

| Package | Role | Version constraint |
|---|---|---|
| `react` | UI framework | 17.0.2 |
| `@fluentui/react-components` | Fluent UI V9 | ^9.54.0 |
| `@fluentui/react-icons` | Fluent icons | 2.0.326 |
| `d3` | Charts | ^7.8.5 |
| Dataverse RuntimeTypes | Typed DataAPI contract | generated by PAC CLI |

### Dataverse read pattern

Use only the environment-specific `RuntimeTypes.ts` generated by `pac model genpage generate-types` and the host-provided `props.dataApi`. The deployed page is independent from the Code App repository runtime and must not import any file outside its working directory.

### D3 responsive SVG pattern

```tsx
const svgRef = useRef<SVGSVGElement>(null);
const containerRef = useRef<HTMLDivElement>(null);
const [width, setWidth] = useState(600);

useEffect(() => {
  const ro = new ResizeObserver(entries => {
    setWidth(entries[0].contentRect.width);
  });
  if (containerRef.current) ro.observe(containerRef.current);
  return () => ro.disconnect();
}, []);
```

### Model-apps plugin rules alignment

- The page is a **read-only analytics page** — no mutations, no navigation side-effects.
- Uses only the Dataverse `crf5c_agentlog` table registered by the page upload's `--data-sources` argument.
- No new custom connectors, no external network calls (enforced by Code App CSP `connect-src 'none'`).
- All data access goes through the host-provided `props.dataApi` contract.
- No browser `localStorage` mutations that would conflict with model-driven app state.
- No `window.location` manipulation; the page is embedded as a custom page within the model-driven app shell.

---

## 9. Risks & Constraints

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| RC1 | `crf5c_agentlog` data sparsity — only 2 live rows as of 2026-07-12, most biz_ fields null | Medium | All KPI tiles, charts, and findings must handle zero/null gracefully; empty states required; pending-count tile is a primary signal |
| RC2 | `biz_aieventtracelist` is a Memo field holding large JSON; loading it for all rows may be slow | Medium | Exclude `biz_aieventtracelist` from the list query `$select`; fetch it only on individual row expand (lazy single-row fetch by PK) |
| RC3 | Operation-type taxonomy is client-computed strings (e.g. `create.activity.visit`); no Dataverse option-set | Low | Group by raw string value; treat any unseen value as a distinct series; show label as-is |
| RC4 | D3 is a feature-specific generative page dependency | Low | Include `d3` and `@types/d3` only in this page's local manifest; PAC transpiles the page for the supported runtime |
| RC5 | The page must be attached and published in the target app sitemap | Medium | Use `pac model genpage upload --add-to-sitemap`; PAC handles page registration and app publishing |
| RC6 | Agent Log access follows Dataverse security roles | Low | The page inherits the model-driven app user's Dataverse read permissions; surface an actionable error state on access denial |
| RC7 | `biz_creditsconsumed` is Integer; D3 domains and mean/stddev must treat null as absent (not zero) | Low | Filter nulls before all statistical computations |
| RC8 | Code App CSP `connect-src 'none'` blocks all external fetches | N/A | Already mitigated — all data via `getClient` SDK; no external CDN assets |

---

## 10. Explicit Approved Plan Decision

**APPROVED.** This plan authorises generation of exactly **one** generative page:

| Decision point | Value |
|---|---|
| Page filename | `agentic-crm-cost-management.tsx` |
| Display name | Agentic CRM Cost Management |
| Target app | Sales Copilot Admin Center (`biz_SalesCopilotAdminCenter`) |
| Solution | AgenticSalesMobileSolution |
| Data mode | `dataverse` |
| Primary table | `crf5c_agentlog` |
| Entity creation | **None** — existing table and columns only |
| Scope | Read-only analytics (v1); no bulk operations, no new persistence |
| Tech stack | React 17 + Fluent UI V9 + D3 v7 + Dataverse RuntimeTypes |
| Trace payload | Never render raw trace GUIDs; show trace count only in row details |
| Next step | Page code generation (`genpage-generate`) — not part of this plan |

---

## Summary

This plan defines a single, self-contained read-only analytics page for the Sales Copilot Admin Center. It reads the existing `crf5c_agentlog` table (with boss-added `biz_*` cost columns) and renders four KPI tiles, a daily credit trend line chart, an operation-type distribution bar chart, a high-cost ranking table, a findings advisory panel, and a full searchable/sortable/resizable Agent Log grid. All features are implemented within the Code App CSP sandbox using Dataverse `getClient` SDK — no external network calls. Trace GUIDs remain hidden by default. The page is responsive (three breakpoints) and WCAG AA accessible.

**No blockers.** The table and all required columns exist. The app and solution are confirmed active. D3 is the only dependency that must be added to `package.json` before code generation.
