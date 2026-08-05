import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Tab,
  TabList,
  Text,
  Divider,
  Textarea,
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowUndoRegular,
  BookQuestionMarkRegular,
  CheckmarkCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DismissCircleRegular,
  HistoryRegular,
  LightbulbRegular,
  PlayRegular,
  SaveRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import type {
  GeneratedComponentProps,
  TableRegistrations,
  crf5c_prompttemplate,
  crf5c_promptrevision,
  crf5c_promptrun,
  crf5c_promptcase,
} from "./RuntimeTypes";

// ---------------------------------------------------------------- contracts

/** Key of the catalogued prompt that reviews other prompts. */
const OPTIMIZER_KEY = "promptOptimizer.suggest";
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const POLL_MS = 3000;
const POLL_LIMIT = 60;

type TabId = "edit" | "history" | "runs" | "replay" | "cases" | "optimize";

interface PromptCase {
  id: string;
  app: string;
  key: string;
  name: string;
  variables: string;
  expectation: string;
  checkType: string;
  notes: string;
  enabled: boolean;
}

interface CaseResult {
  caseId: string;
  name: string;
  verdict: Verdict;
  detail: string;
  output: string;
}

interface Template {
  id: string;
  app: string;
  key: string;
  body: string;
  description: string;
  variables: string;
  responseFormat: string;
  modelTier: string;
  contractVersion: number;
  version: number;
  published: boolean;
}

interface Revision {
  id: string;
  version: number;
  body: string;
  notes: string;
  author: string;
  createdOn: string;
}

interface Run {
  id: string;
  name: string;
  key: string;
  source: string;
  status: string;
  label: string;
  variables: string;
  output: string;
  error: string;
  candidateBody: string;
  baselineRunId: string;
  /** What was actually sent, as far as the log retained it. */
  promptText: string;
  createdOn: string;
}

/** Trimmed shape for the cross-prompt usage charts — counts only, no financials. */
interface UsageRun {
  app: string;
  key: string;
  attribution: "exact" | "inferred" | "unattributed";
  day: string;
}

interface PromptUsage {
  total: number;
  byDay: Record<string, number>;
}

// ------------------------------------------------------------------ helpers

/**
 * Same substitution the app uses. Unknown placeholders are LEFT IN PLACE and
 * reported, so a replay never silently sends a prompt with a hole in it.
 */
function renderTemplate(
  body: string,
  variables: Record<string, string>,
): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const text = body.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      if (unresolved.indexOf(name) < 0) unresolved.push(name);
      return match;
    }
    return value;
  });
  return { text, unresolved };
}

/** Metadata key carrying the recorded user turn — never a body placeholder. */
const USER_TURN_KEY = "__user";
const GUIDE_SEEN_KEY = "promptStudio.guideSeen.v1";

/**
 * The page follows the language the model-driven app is being used in.
 *
 * Translations are held next to the English at each call site rather than in a
 * key table: this page is a single file, and a key table's real cost is that
 * the key and the text drift apart over time. Adding a language means widening
 * `pick`, not restructuring the page.
 */
type Lang = "en" | "zh";

const LANG_KEY = "promptStudio.lang.v1";

function hostLang(): Lang {
  try {
    const tag =
      document.documentElement.getAttribute("lang") ||
      window.navigator.language ||
      "en";
    return /^zh/i.test(tag) ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** Follows the app's language unless the reader has chosen otherwise. */
function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* fall through to the host language */
  }
  return hostLang();
}

let currentLang: Lang = initialLang();

/** English is the fallback, so an untranslated string still reads correctly. */
const t = (en: string, zh: string): string => (currentLang === "zh" ? zh : en);

/**
 * Rebuilds what the app actually sends: the rendered system prompt plus the
 * recorded user turn, serialized the same way (`role: content`, newline joined).
 * Replaying only the system half would compare against a different call.
 */
function buildCall(
  body: string,
  variables: Record<string, string>,
): { text: string; unresolved: string[] } {
  const rendered = renderTemplate(body, variables);
  const userTurn = variables[USER_TURN_KEY];
  const text = userTurn
    ? `system: ${rendered.text}\nuser: ${userTurn}`
    : `user: ${rendered.text}`;
  return { text, unresolved: rendered.unresolved };
}

function placeholdersOf(body: string): string[] {
  const found: string[] = [];
  let match = PLACEHOLDER.exec(body);
  while (match) {
    if (found.indexOf(match[1]) < 0) found.push(match[1]);
    match = PLACEHOLDER.exec(body);
  }
  PLACEHOLDER.lastIndex = 0;
  return found;
}

/** The prompt API answers `{ text }`; older paths nest it. Fall back to raw. */
function unwrapOutput(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as {
      text?: string;
      predictionOutput?: { text?: string };
      ResponsePayload?: string;
    };
    if (typeof parsed.text === "string") return parsed.text;
    if (parsed.predictionOutput && typeof parsed.predictionOutput.text === "string") {
      return parsed.predictionOutput.text;
    }
    if (typeof parsed.ResponsePayload === "string") return unwrapOutput(parsed.ResponsePayload);
    return raw;
  } catch {
    return raw;
  }
}

function parseVariables(json: string): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    Object.keys(parsed).forEach((name) => {
      const value = parsed[name];
      out[name] = typeof value === "string" ? value : JSON.stringify(value);
    });
    return out;
  } catch {
    return {};
  }
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function clip(text: string, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Local calendar day, so buckets line up with how the user reads a date. */
function dayKey(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function lastDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() - i);
    days.push(dayKey(day.toISOString()));
  }
  return days;
}

function dayLabel(day: string): string {
  const parts = day.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : day;
}

/** GitHub contribution-graph palette: empty plus four discrete intensity levels. */
function heatColor(value: number, peak: number): string {
  if (!value || !peak) return "#ebedf0";
  const ratio = value / peak;
  if (ratio <= 0.25) return "#9be9a8";
  if (ratio <= 0.5) return "#40c463";
  if (ratio <= 0.75) return "#30a14e";
  return "#216e39";
}

/** Cheap, order-aware line comparison — enough to see what moved. */
function compareOutputs(before: string, after: string) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const shared = new Set(a);
  let changedLines = 0;
  b.forEach((line) => {
    if (!shared.has(line)) changedLines += 1;
  });
  return {
    charDelta: after.length - before.length,
    lineDelta: b.length - a.length,
    changedLines,
    identical: before === after,
  };
}

// -------------------------------------------------------------------- styles

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("12px"),
    ...shorthands.padding("16px"),
    height: "100%",
    boxSizing: "border-box",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  header: { display: "flex", alignItems: "center", ...shorthands.gap("12px"), flexWrap: "wrap" },
  grow: { flexGrow: 1 },
  split: { display: "flex", ...shorthands.gap("12px"), minHeight: "0", flexGrow: 1 },
  list: {
    width: "300px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("8px"),
    ...shorthands.padding("12px"),
    overflowY: "auto",
  },
  listItem: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("2px"),
    ...shorthands.padding("8px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    cursor: "pointer",
    textAlign: "left",
    backgroundColor: "transparent",
    ...shorthands.border("1px", "solid", "transparent"),
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  listItemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ...shorthands.border("1px", "solid", tokens.colorBrandStroke1),
  },
  detail: {
    flexGrow: 1,
    minWidth: "0",
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("12px"),
    ...shorthands.padding("12px"),
    overflowY: "auto",
  },
  row: { display: "flex", alignItems: "center", ...shorthands.gap("8px"), flexWrap: "wrap" },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  bodyEditor: {
    width: "100%",
    "& textarea": {
      minHeight: "420px",
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
    },
  },
  panelPair: { display: "flex", ...shorthands.gap("12px"), alignItems: "stretch", flexWrap: "wrap" },
  panel: {
    flexGrow: 1,
    flexBasis: "320px",
    minWidth: "0",
    ...shorthands.padding("10px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  pre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    maxHeight: "360px",
    overflowY: "auto",
    ...shorthands.margin("0"),
  },
  runRow: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    ...shorthands.padding("6px", "8px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    cursor: "pointer",
    ...shorthands.border("1px", "solid", "transparent"),
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  runRowActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ...shorthands.border("1px", "solid", tokens.colorBrandStroke1),
  },
  muted: { color: tokens.colorNeutralForeground3 },
  overview: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    ...shorthands.gap("10px"),
    ...shorthands.padding("12px"),
  },
  kpis: { display: "flex", ...shorthands.gap("20px"), flexWrap: "wrap" },
  kpi: { display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  heatScroll: {
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: "240px",
    ...shorthands.padding("0", "0", "4px", "0"),
  },
  heatRow: { display: "flex", alignItems: "center", ...shorthands.gap("3px") },
  heatLabel: {
    width: "210px",
    flexShrink: 0,
    whiteSpace: "nowrap",
    overflowX: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
    ...shorthands.padding("0", "6px", "0", "0"),
  },
  heatCell: {
    width: "14px",
    height: "14px",
    flexShrink: 0,
    ...shorthands.borderRadius("0"),
    ...shorthands.border("1px", "solid", "rgba(27, 31, 36, 0.06)"),
    boxSizing: "border-box",
  },
  heatAxis: {
    width: "14px",
    flexShrink: 0,
    fontSize: "9px",
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  heatLegend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    ...shorthands.gap("3px"),
    ...shorthands.padding("4px", "0", "0"),
  },
  caseRow: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    ...shorthands.padding("4px", "0"),
  },
  controlDivider: { height: "20px", flexGrow: 0 },
  runDetail: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("8px"),
    ...shorthands.padding("8px", "0", "12px", "22px"),
  },
  guideGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    ...shorthands.gap("12px"),
    alignItems: "start",
  },
  guideList: {
    ...shorthands.margin("4px", "0", "0", "0"),
    ...shorthands.padding("0", "0", "0", "18px"),
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("6px"),
  },
});

// ---------------------------------------------------------------- data access

type DataApi = GeneratedComponentProps["dataApi"];
type TableName = keyof TableRegistrations & string;

async function queryAll<K extends TableName>(
  dataApi: DataApi,
  table: K,
  options: QueryTableOptions,
  maxPages: number,
): Promise<TableRegistrations[K][]> {
  let result = await dataApi.queryTable(table, options);
  const rows = result.rows.slice();
  let pages = 1;
  while (result.hasMoreRows && result.loadMoreRows && pages < maxPages) {
    result = await result.loadMoreRows();
    rows.push(...result.rows);
    pages += 1;
  }
  return rows;
}

function toTemplate(row: crf5c_prompttemplate): Template {
  return {
    id: String(row.crf5c_prompttemplateid),
    app: String(row.crf5c_app ?? "unscoped"),
    key: String(row.crf5c_name ?? ""),
    body: String(row.crf5c_body ?? ""),
    description: String(row.crf5c_description ?? ""),
    variables: String(row.crf5c_variables ?? ""),
    responseFormat: String(row.crf5c_responseformat ?? ""),
    modelTier: String(row.crf5c_modeltier ?? ""),
    contractVersion: Number(row.crf5c_contractversion ?? 0),
    version: Number(row.crf5c_promptversion ?? 0),
    published: Boolean(row.crf5c_ispublished),
  };
}

function toRevision(row: crf5c_promptrevision): Revision {
  return {
    id: String(row.crf5c_promptrevisionid),
    version: Number(row.crf5c_promptversion ?? 0),
    body: String(row.crf5c_body ?? ""),
    notes: String(row.crf5c_notes ?? ""),
    author: String(row.crf5c_author ?? ""),
    createdOn: String((row as unknown as { createdon?: string }).createdon ?? ""),
  };
}

function toRun(row: crf5c_promptrun): Run {
  return {
    id: String(row.crf5c_promptrunid),
    name: String(row.crf5c_name ?? ""),
    key: String(row.crf5c_promptkey ?? ""),
    source: String(row.crf5c_source ?? ""),
    status: String(row.crf5c_status ?? ""),
    label: String(row.crf5c_label ?? ""),
    variables: String(row.crf5c_variables ?? ""),
    output: String(row.crf5c_output ?? ""),
    error: String(row.crf5c_error ?? ""),
    candidateBody: String(row.crf5c_candidatebody ?? ""),
    baselineRunId: String(row.crf5c_baselinerunid ?? ""),
    promptText: String(row.crf5c_renderedprompt ?? ""),
    createdOn: String((row as unknown as { createdon?: string }).createdon ?? ""),
  };
}

function toCase(row: crf5c_promptcase): PromptCase {
  return {
    id: String(row.crf5c_promptcaseid),
    app: String(row.crf5c_app ?? ""),
    key: String(row.crf5c_promptkey ?? ""),
    name: String(row.crf5c_name ?? ""),
    variables: String(row.crf5c_variables ?? ""),
    expectation: String(row.crf5c_expectation ?? ""),
    checkType: String(row.crf5c_checktype ?? "contains"),
    notes: String(row.crf5c_notes ?? ""),
    // Generated as a 0/1 two-option enum rather than a boolean.
    enabled: Number(row.crf5c_enabled) !== 0,
  };
}

/** Single-quote escaping for OData string literals. */
const odata = (value: string) => value.replace(/'/g, "''");

const TEMPLATE_COLUMNS = [
  "crf5c_prompttemplateid",
  "crf5c_app",
  "crf5c_name",
  "crf5c_body",
  "crf5c_description",
  "crf5c_variables",
  "crf5c_responseformat",
  "crf5c_modeltier",
  "crf5c_contractversion",
  "crf5c_promptversion",
  "crf5c_ispublished",
];

const REVISION_COLUMNS = [
  "crf5c_promptrevisionid",
  "crf5c_app",
  "crf5c_promptkey",
  "crf5c_promptversion",
  "crf5c_body",
  "crf5c_notes",
  "crf5c_author",
  "createdon",
];

const RUN_COLUMNS = [
  "crf5c_renderedprompt",
  "crf5c_promptrunid",
  "crf5c_app",
  "crf5c_name",
  "crf5c_promptkey",
  "crf5c_source",
  "crf5c_status",
  "crf5c_label",
  "crf5c_variables",
  "crf5c_output",
  "crf5c_error",
  "crf5c_candidatebody",
  "crf5c_baselinerunid",
  "createdon",
];

const CASE_COLUMNS = [
  "crf5c_promptcaseid",
  "crf5c_app",
  "crf5c_name",
  "crf5c_promptkey",
  "crf5c_variables",
  "crf5c_expectation",
  "crf5c_checktype",
  "crf5c_notes",
  "crf5c_enabled",
];

/**
 * Usage is read from the platform's OWN AI Event log rather than from a second
 * record written by the app. That log already holds every call's time, cost,
 * model and output; the only thing it lacked was which catalogued prompt
 * produced it, and the app now names that in the trace marker it already
 * prepends. So there is no shadow table to keep in sync and no row written per
 * call.
 */
const USAGE_COLUMNS = [
  "msdyn_aieventid",
  "createdon",
  "msdyn_datainfo",
];

const TRACE_MARKER_RE =
  /\[\[trace:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s+project:([A-Za-z0-9._-]+))?(?:\s+app:([A-Za-z0-9._-]+))?(?:\s+prompt:([A-Za-z0-9._-]+))?\]\]/i;

/** Enough of a body to identify it, ignoring whitespace differences. */
const fingerprint = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 80).toLowerCase();

/**
 * Attributes a logged call to a prompt. The marker is authoritative; matching
 * the stored prompt text against the catalogue is the fallback that makes calls
 * recorded before the marker carried a key still countable.
 */
/**
 * The AI Event stores the prompt inside a JSON envelope
 * (`{"prompt_20text":"…"}`) that is itself cut off at 4000 characters, so a
 * long prompt never yields parseable JSON. Reading the field textually is what
 * keeps the biggest prompts — the ones most worth measuring — attributable.
 */
function promptTextOf(dataInfo: string): string {
  if (!dataInfo) return "";
  try {
    const parsed = JSON.parse(dataInfo) as { prompt_20text?: string };
    if (typeof parsed.prompt_20text === "string") return parsed.prompt_20text;
  } catch {
    /* truncated envelope — fall through to the textual read */
  }
  const marker = '"prompt_20text":"';
  const at = dataInfo.indexOf(marker);
  if (at < 0) return dataInfo;
  return dataInfo
    .slice(at + marker.length)
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function attributeCall(
  promptText: string,
  prints: Array<{ app: string; key: string; print: string }>,
): Pick<UsageRun, "app" | "key" | "attribution"> {
  const marked = promptText.match(TRACE_MARKER_RE);
  if (marked && marked[3] && marked[4]) {
    return { app: marked[3], key: marked[4], attribution: "exact" };
  }
  if (marked && marked[4]) {
    const candidates = prints.filter((item) => item.key === marked[4]);
    if (candidates.length === 1) {
      return { app: candidates[0].app, key: candidates[0].key, attribution: "inferred" };
    }
  }
  // Anchored at the start: a prompt that QUOTES another body (the optimizer
  // embeds the body under review) would otherwise be credited to it.
  let text = promptText.replace(TRACE_MARKER_RE, "");
  const nl = text.indexOf("\n");
  if (nl >= 0) text = text.slice(nl + 1);
  if (text.indexOf("system: ") === 0) text = text.slice(8);
  const head = text.replace(/\s+/g, " ").trim().toLowerCase();
  const hits = prints.filter((p) => p.print.length > 24 && head.indexOf(p.print) === 0);
  return hits.length === 1
    ? { app: hits[0].app, key: hits[0].key, attribution: "inferred" }
    : { app: "", key: "", attribution: "unattributed" };
}

/**
 * Correlation id for a run the studio initiates. It is prefixed to the prompt
 * text so it survives the 4000-character truncation of the AI Event log and can
 * be joined to the platform's cost record without a second per-call log.
 */
function newTraceId(): string {
  const cryptoRef = (window as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") return cryptoRef.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const traced = (traceId: string, app: string, promptKey: string, text: string) =>
  `[[trace:${traceId} project:agentic-crm app:${app} prompt:${promptKey}]] (internal correlation id — ignore this line)\n${text}`;

/**
 * Creates a run and returns its id. `createRow` is documented as returning the
 * new Guid but does not reliably do so at runtime, so the id is recovered by
 * looking the row up on its unique name when the return value is unusable.
 */
async function createRunAndResolveId(
  dataApi: DataApi,
  row: Partial<crf5c_promptrun> & { crf5c_name: string },
): Promise<string> {
  const created = await dataApi.createRow("crf5c_promptrun", row);
  if (typeof created === "string" && created.length > 20) return created;
  if (created && typeof created === "object") {
    const asRow = created as Record<string, unknown>;
    const direct = asRow.crf5c_promptrunid ?? asRow.id ?? asRow.rowId;
    if (typeof direct === "string" && direct.length > 20) return direct;
  }
  const found = await queryAll(
    dataApi,
    "crf5c_promptrun",
    {
      select: ["crf5c_promptrunid"],
      filter: `crf5c_name eq '${row.crf5c_name.replace(/'/g, "''")}'`,
      orderBy: "createdon desc",
      pageSize: 1,
    },
    1,
  );
  if (found[0]) return String(found[0].crf5c_promptrunid);
  throw new Error("The run row was created but could not be located.");
}

/**
 * Grades one output against a case's ground truth.
 *
 * The deterministic modes are the point. A structured answer can be checked by
 * comparison — exactly, instantly, for free — and only genuinely open-ended
 * prose needs a model to judge it. Reaching for the judge everywhere would make
 * the score slower, dearer and less trustworthy than the thing it measures.
 */
function readPath(value: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = value;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    const index = Number(part);
    current = Array.isArray(current) && !isNaN(index)
      ? current[index]
      : (current as Record<string, unknown>)[part];
  }
  return current;
}

type Verdict = "pass" | "fail" | "manual";

function gradeOutput(
  output: string,
  expectation: string,
  checkType: string,
): { verdict: Verdict; detail: string } {
  const text = output.trim();
  const truth = expectation.trim();
  if (!truth) return { verdict: "manual", detail: "No expectation recorded." };
  if (checkType === "judge") return { verdict: "manual", detail: "Needs a reviewer." };

  if (checkType === "regex") {
    try {
      return new RegExp(truth, "i").test(text)
        ? { verdict: "pass", detail: "Pattern matched." }
        : { verdict: "fail", detail: `Pattern did not match: ${truth}` };
    } catch (e) {
      return { verdict: "manual", detail: `Invalid pattern: ${(e as Error).message}` };
    }
  }

  if (checkType === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { verdict: "fail", detail: "Output is not valid JSON." };
    }
    let expected: Record<string, unknown>;
    try {
      expected = JSON.parse(truth) as Record<string, unknown>;
    } catch (e) {
      return { verdict: "manual", detail: `Expectation is not valid JSON: ${(e as Error).message}` };
    }
    const misses: string[] = [];
    Object.keys(expected).forEach((path) => {
      const actual = readPath(parsed, path);
      // Compared as text so 1 and "1" agree; cases assert shape, not types.
      if (String(actual) !== String(expected[path])) {
        misses.push(`${path}: expected ${String(expected[path])}, got ${String(actual)}`);
      }
    });
    return misses.length
      ? { verdict: "fail", detail: misses.join(" · ") }
      : { verdict: "pass", detail: `${Object.keys(expected).length} assertion(s) held.` };
  }

  const lines = truth.split("\n").map((l) => l.trim()).filter(Boolean);
  const haystack = text.toLowerCase();
  const missing = lines.filter((line) => haystack.indexOf(line.toLowerCase()) < 0);
  return missing.length
    ? { verdict: "fail", detail: `Missing: ${missing.join(" · ")}` }
    : { verdict: "pass", detail: `${lines.length} phrase(s) present.` };
}

/**
 * Recovers the variables a logged call was rendered with, by inverting the
 * template against the stored prompt text. The literal segments between
 * placeholders act as anchors, so nothing has to be stored alongside the
 * platform log for a past call to be replayable.
 *
 * Returns null when the text cannot be inverted — most often because the log
 * truncates at 4000 characters and a long body never appears in full. A caller
 * must treat that as "not replayable", never as "no variables".
 */
function recoverVariables(body: string, rendered: string): Record<string, string> | null {
  const names: string[] = [];
  const literals: string[] = [];
  let last = 0;
  const re = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
  let m = re.exec(body);
  while (m) {
    literals.push(body.slice(last, m.index));
    names.push(m[1]);
    last = m.index + m[0].length;
    m = re.exec(body);
  }
  literals.push(body.slice(last));

  // Strip the correlation line and the role prefix the app serializes.
  let text = rendered.replace(TRACE_MARKER_RE, "");
  const nl = text.indexOf("\n");
  if (nl >= 0) text = text.slice(nl + 1);
  if (text.indexOf("system: ") === 0) text = text.slice(8);

  const userAt = text.lastIndexOf("\nuser: ");
  const userValue = userAt >= 0 ? text.slice(userAt + 7) : "";
  if (userAt >= 0) text = text.slice(0, userAt);

  if (text.indexOf(literals[0]) !== 0) return null;
  let cursor = literals[0].length;
  const values: Record<string, string> = {};
  for (let i = 0; i < names.length; i += 1) {
    const next = literals[i + 1];
    if (next === "") {
      values[names[i]] = text.slice(cursor);
      cursor = text.length;
      break;
    }
    const at = text.indexOf(next, cursor);
    if (at < 0) return null;
    values[names[i]] = text.slice(cursor, at);
    cursor = at + next.length;
  }
  if (userValue) values[USER_TURN_KEY] = userValue;
  return values;
}

// ------------------------------------------------------------------ component

const GeneratedComponent = (props: GeneratedComponentProps) => {
  const styles = useStyles();
  const { dataApi } = props;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<string>("");
  // Identity is the row, not the key: two apps may both define `frame.classify`.
  const [selectedId, setSelectedId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("edit");

  const [draftBody, setDraftBody] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [observed, setObserved] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [busy, setBusy] = useState<string>("");

  const [usage, setUsage] = useState<UsageRun[]>([]);
  const [usageDays, setUsageDays] = useState(14);
  const [usageOpen, setUsageOpen] = useState(true);
  const [sortByCalls, setSortByCalls] = useState(false);
  // Re-renders the page when the reader switches language.
  const [, setLang] = useState<Lang>(currentLang);
  // Open on a first visit only; after that the header button recalls it.
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return window.localStorage.getItem(GUIDE_SEEN_KEY) !== "1";
    } catch {
      return false;
    }
  });

  const [replayRun, setReplayRun] = useState<Run | null>(null);
  const [cases, setCases] = useState<PromptCase[]>([]);
  const [caseResults, setCaseResults] = useState<CaseResult[]>([]);
  const [evalProgress, setEvalProgress] = useState("");
  const [suggestion, setSuggestion] = useState<{
    diagnosis: string;
    findings: Array<{ issue?: string; evidence?: string; change?: string; impact?: string }>;
    revisedBody: string;
    raw: string;
  } | null>(null);
  const [optimizeGoal, setOptimizeGoal] = useState("");

  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const selected = useMemo(
    () => templates.filter((t) => t.id === selectedId)[0],
    [templates, selectedId],
  );

  const apps = useMemo(() => {
    const seen: string[] = [];
    templates.forEach((t) => {
      if (seen.indexOf(t.app) < 0) seen.push(t.app);
    });
    return seen.sort();
  }, [templates]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await queryAll(
        dataApi,
        "crf5c_prompttemplate",
        { select: TEMPLATE_COLUMNS, orderBy: "crf5c_name asc", pageSize: 100 },
        5,
      );
      const mapped = rows.map(toTemplate);
      setTemplates(mapped);
      setSelectedId((current) => current || (mapped[0] ? mapped[0].id : ""));
      setAppFilter((current) => current || (mapped[0] ? mapped[0].app : ""));
    } catch (e) {
      setError(`Could not load prompts: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [dataApi]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  /** Cross-prompt usage, derived from the platform's AI Event log. */
  const loadUsage = useCallback(async (
    days: number,
    prints: Array<{ app: string; key: string; print: string }>,
  ) => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    try {
      const rows = await queryAll(
        dataApi,
        "msdyn_aievent",
        {
          select: USAGE_COLUMNS,
          filter: `createdon ge ${since.toISOString()}`,
          orderBy: "createdon desc",
          pageSize: 500,
        },
        12,
      );
      setUsage(
        rows.map((row) => {
          const raw = row as unknown as Record<string, unknown>;
          const promptText = promptTextOf(String(raw.msdyn_datainfo ?? ""));
          const attribution = attributeCall(promptText, prints);
          return {
            ...attribution,
            day: dayKey(String(raw.createdon ?? "")),
          };
        }),
      );
    } catch (e) {
      setError(`Could not load usage: ${(e as Error).message}`);
    }
  }, [dataApi]);

  const bodyPrints = useMemo(
    () => templates.map((t) => ({ app: t.app, key: t.key, print: fingerprint(t.body) })),
    [templates],
  );

  useEffect(() => { void loadUsage(usageDays, bodyPrints); }, [loadUsage, usageDays, bodyPrints]);

  const days = useMemo(() => lastDays(usageDays), [usageDays]);

  const activeApp = appFilter || apps[0] || "";
  const appUsage = useMemo(
    () => usage.filter((run) => run.app === activeApp && !!run.key),
    [usage, activeApp],
  );

  const usageByPrompt = useMemo(() => {
    const map: Record<string, PromptUsage> = {};
    appUsage.forEach((run) => {
      if (!run.key) return;
      const entry =
        map[run.key] ??
        { total: 0, byDay: {} };
      entry.total += 1;
      entry.byDay[run.day] = (entry.byDay[run.day] ?? 0) + 1;
      map[run.key] = entry;
    });
    return map;
  }, [appUsage]);

  const usageTotals = useMemo(() => {
    const byDay: Record<string, number> = {};
    let exact = 0;
    let inferred = 0;
    appUsage.forEach((run) => {
      byDay[run.day] = (byDay[run.day] ?? 0) + 1;
      if (run.attribution === "exact") exact += 1;
      if (run.attribution === "inferred") inferred += 1;
    });
    const peak = days.reduce((max, day) => Math.max(max, byDay[day] ?? 0), 0);
    return {
      byDay,
      peak,
      total: appUsage.length,
      exact,
      inferred,
      prompts: Object.keys(usageByPrompt).length,
    };
  }, [appUsage, days, usageByPrompt]);

  /** Busiest prompts first — the heatmap is a ranking as much as a calendar. */
  const heatmapRows = useMemo(
    () =>
      Object.keys(usageByPrompt)
        .map((key) => ({ key, usage: usageByPrompt[key] }))
        .sort((a, b) => b.usage.total - a.usage.total)
        .slice(0, 15),
    [usageByPrompt],
  );

  const cellValue = useCallback(
    (row: PromptUsage, day: string) =>
      row.byDay[day] ?? 0,
    [],
  );

  const peakCell = useMemo(
    () =>
      heatmapRows.reduce(
        (max, row) => days.reduce((inner, day) => Math.max(inner, cellValue(row.usage, day)), max),
        0,
      ),
    [heatmapRows, days, cellValue],
  );

  // Editing state follows the selected prompt.
  useEffect(() => {
    setDraftBody(selected ? selected.body : "");
    setDraftNotes("");
    setSuggestion(null);
    setReplayRun(null);
    setSelectedRunId("");
  }, [selected]);

  const loadHistory = useCallback(async (app: string, key: string) => {
    if (!key) return;
    const scope = `crf5c_promptkey eq '${key}' and crf5c_app eq '${app}'`;
    try {
      const [revisionRows, runRows] = await Promise.all([
        queryAll(
          dataApi,
          "crf5c_promptrevision",
          {
            select: REVISION_COLUMNS,
            filter: scope,
            orderBy: "crf5c_promptversion desc",
            pageSize: 50,
          },
          2,
        ),
        queryAll(
          dataApi,
          "crf5c_promptrun",
          {
            select: RUN_COLUMNS,
            filter: scope,
            orderBy: "createdon desc",
            pageSize: 50,
          },
          2,
        ),
      ]);
      setRevisions(revisionRows.map(toRevision));
      setRuns(runRows.map(toRun));
    } catch (e) {
      setError(`Could not load history: ${(e as Error).message}`);
    }
  }, [dataApi]);

  useEffect(() => {
    if (selected) void loadHistory(selected.app, selected.key);
    else {
      setRevisions([]);
      setRuns([]);
    }
  }, [selected, loadHistory]);

  /**
   * Real executions of the selected prompt, read from the same platform log the
   * charts count. Reading a second source here is what made the tab disagree
   * with the heatmap.
   */
  const loadObserved = useCallback(async (template: Template, days: number) => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const print = fingerprint(template.body);
    try {
      const rows = await queryAll(
        dataApi,
        "msdyn_aievent",
        {
          select: ["msdyn_aieventid", "createdon", "msdyn_datainfo", "msdyn_output", "msdyn_eventdata"],
          filter: `createdon ge ${since.toISOString()}`,
          orderBy: "createdon desc",
          pageSize: 500,
        },
        6,
      );
      const mine: Run[] = [];
      rows.forEach((row) => {
        const raw = row as unknown as Record<string, unknown>;
        const promptText = promptTextOf(String(raw.msdyn_datainfo ?? ""));
        const attribution = attributeCall(promptText, [
          { app: template.app, key: template.key, print },
        ]);
        if (attribution.app !== template.app || attribution.key !== template.key) return;
        const recovered = recoverVariables(template.body, promptText);
        let model = "";
        try {
          model = String((JSON.parse(String(raw.msdyn_eventdata ?? "{}")) as { llmModelName?: string }).llmModelName ?? "");
        } catch {
          /* label is cosmetic */
        }
        mine.push({
          id: String(raw.msdyn_aieventid),
          name: "",
          key: template.key,
          source: "live",
          status: "succeeded",
          label: model,
          variables: recovered ? JSON.stringify(recovered) : "",
          output: String(raw.msdyn_output ?? ""),
          error: "",
          candidateBody: "",
          baselineRunId: "",
          promptText,
          createdOn: String(raw.createdon ?? ""),
        });
      });
      setObserved(mine);
    } catch (e) {
      setError(`Could not load executions: ${(e as Error).message}`);
    }
  }, [dataApi]);

  useEffect(() => {
    if (selected) void loadObserved(selected, usageDays);
    else setObserved([]);
  }, [selected, usageDays, loadObserved]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = templates.filter((t) => {
      if (appFilter && t.app !== appFilter) return false;
      if (!needle) return true;
      return (
        t.key.toLowerCase().indexOf(needle) >= 0 ||
        t.description.toLowerCase().indexOf(needle) >= 0
      );
    });
    if (!sortByCalls) return matches;
    return matches
      .slice()
      .sort((a, b) => (usageByPrompt[b.key]?.total ?? 0) - (usageByPrompt[a.key]?.total ?? 0));
  }, [templates, search, appFilter, sortByCalls, usageByPrompt]);

  const liveRuns = observed;
  const dirty = !!selected && draftBody !== selected.body;

  /** Saves the current body as a new version, keeping the previous one as a revision. */
  const handleSave = useCallback(async () => {
    if (!selected || !dirty) return;
    setSaving(true);
    setError("");
    try {
      await dataApi.createRow("crf5c_promptrevision", {
        crf5c_name: `${selected.key} v${selected.version}`,
        crf5c_app: selected.app,
        crf5c_promptkey: selected.key,
        crf5c_promptversion: selected.version,
        crf5c_body: selected.body,
        crf5c_notes: draftNotes,
      });
      const nextVersion = selected.version + 1;
      await dataApi.updateRow("crf5c_prompttemplate", selected.id, {
        crf5c_body: draftBody,
        crf5c_promptversion: nextVersion,
        crf5c_notes: draftNotes,
      });
      setTemplates((current) =>
        current.map((t) =>
          t.id === selected.id ? { ...t, body: draftBody, version: nextVersion } : t,
        ),
      );
      setDraftNotes("");
      setNotice(`Saved as v${nextVersion}. The previous body is kept in History.`);
      void loadHistory(selected.app, selected.key);
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [dataApi, selected, dirty, draftBody, draftNotes, loadHistory]);

  const handleRestore = useCallback((revision: Revision) => {
    setDraftBody(revision.body);
    setDraftNotes(`Restored from v${revision.version}`);
    setTab("edit");
    setNotice(`v${revision.version} loaded into the editor — review it, then Save to publish.`);
  }, []);

  /** Waits for the runner flow to finish a queued row. */
  const pollRun = useCallback(async (id: string): Promise<Run | null> => {
    for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (cancelled.current) return null;
      const row = await dataApi.retrieveRow("crf5c_promptrun", { id, select: RUN_COLUMNS });
      const run = toRun(row);
      if (run.status === "succeeded" || run.status === "failed") return run;
    }
    return null;
  }, [dataApi]);

  const loadCases = useCallback(async (app: string, key: string) => {
    if (!app || !key) {
      setCases([]);
      return;
    }
    try {
      const rows = await queryAll(
        dataApi,
        "crf5c_promptcase",
        {
          select: CASE_COLUMNS,
          filter: `crf5c_app eq '${odata(app)}' and crf5c_promptkey eq '${odata(key)}'`,
          orderBy: "crf5c_name asc",
          pageSize: 100,
        },
        2,
      );
      setCases(rows.map(toCase));
    } catch (e) {
      setError(`Could not load cases: ${(e as Error).message}`);
    }
  }, [dataApi]);

  useEffect(() => {
    void loadCases(selected ? selected.app : "", selected ? selected.key : "");
    setCaseResults([]);
  }, [loadCases, selected]);

  /**
   * Scores a body against every enabled case. One case is anecdote; the set is
   * the measurement, and re-running the whole set is what catches the classic
   * failure of prompt tuning — fixing one case while silently breaking another.
   */
  const runEvaluation = useCallback(async (body: string, tag: string) => {
    if (!selected) return;
    const active = cases.filter((c) => c.enabled);
    if (!active.length) {
      setError("No enabled cases for this prompt yet — save one from a real run first.");
      return;
    }
    setBusy("evaluate");
    setError("");
    setCaseResults([]);
    const results: CaseResult[] = [];
    try {
      for (let i = 0; i < active.length; i += 1) {
        if (cancelled.current) return;
        const item = active[i];
        setEvalProgress(`${i + 1} / ${active.length} · ${item.name}`);
        const rendered = buildCall(body, parseVariables(item.variables));
        const traceId = newTraceId();
        const id = await createRunAndResolveId(dataApi, {
          crf5c_name: `eval ${selected.key} ${tag} ${new Date().toISOString()} ${i}`,
          crf5c_app: selected.app,
          crf5c_promptkey: selected.key,
          crf5c_promptversion: selected.version,
          crf5c_source: "eval",
          crf5c_status: "queued",
          crf5c_label: `${tag} · ${item.name}`,
          crf5c_variables: item.variables,
          crf5c_candidatebody: body,
          crf5c_renderedprompt: traced(traceId, selected.app, selected.key, rendered.text),
          crf5c_traceid: traceId,
        });
        const done = await pollRun(id);
        const output = done ? unwrapOutput(done.output) : "";
        const graded = done && done.status === "succeeded"
          ? gradeOutput(output, item.expectation, item.checkType)
          : { verdict: "fail" as Verdict, detail: done ? done.error || "Run failed." : "Timed out." };
        results.push({
          caseId: item.id,
          name: item.name,
          verdict: graded.verdict,
          detail: graded.detail,
          output,
        });
        setCaseResults(results.slice());
      }
    } catch (e) {
      setError(`Evaluation stopped: ${(e as Error).message}`);
    } finally {
      setEvalProgress("");
      setBusy("");
    }
  }, [dataApi, selected, cases, pollRun]);

  const saveRunAsCase = useCallback(async (run: Run) => {
    if (!selected) return;
    setBusy("case");
    setError("");
    try {
      const output = unwrapOutput(run.output).trim();
      let checkType = "contains";
      let expectation = output.slice(0, 4000);
      try {
        // A structured answer is checkable by comparison, so default to that.
        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          checkType = "json";
          const seed: Record<string, unknown> = {};
          Object.keys(parsed).slice(0, 6).forEach((k) => {
            const v = (parsed as Record<string, unknown>)[k];
            if (v === null || typeof v !== "object") seed[k] = v;
          });
          expectation = JSON.stringify(seed, null, 2);
        }
      } catch {
        /* free text stays a contains check */
      }
      await dataApi.createRow("crf5c_promptcase", {
        crf5c_name: `${run.label || selected.key} ${new Date().toISOString().slice(0, 16)}`,
        crf5c_app: selected.app,
        crf5c_promptkey: selected.key,
        crf5c_variables: run.variables,
        crf5c_expectation: expectation,
        crf5c_checktype: checkType,
        crf5c_enabled: 1 as crf5c_promptcase["crf5c_enabled"],
        crf5c_notes: "Captured from a recorded run. Edit the expectation to assert only what must hold.",
      });
      await loadCases(selected.app, selected.key);
      setNotice(
        `Saved as a ${checkType} case. Open Cases and trim the expectation to what genuinely must hold — a snapshot of one answer is too strict.`,
      );
      setTab("cases");
    } catch (e) {
      setError(`Could not save the case: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }, [dataApi, selected, loadCases]);

  const score = useMemo(() => {
    const graded = caseResults.filter((r) => r.verdict !== "manual");
    const passed = graded.filter((r) => r.verdict === "pass").length;
    return {
      graded: graded.length,
      passed,
      manual: caseResults.filter((r) => r.verdict === "manual").length,
      pct: graded.length ? Math.round((passed / graded.length) * 100) : 0,
    };
  }, [caseResults]);

  const handleReplay = useCallback(async (baseline: Run) => {
    if (!selected) return;
    if (!baseline.variables) {
      setError(
        "This execution cannot be replayed. The platform's AI Event log stores the prompt in a 4000-character system column that Microsoft does not allow to be lengthened, so a long prompt is cut off before its variables can be recovered. Build a case on the Accuracy tab — case variables are stored in full.",
      );
      return;
    }
    setBusy("replay");
    setError("");
    setReplayRun(null);
    try {
      const variables = parseVariables(baseline.variables);
      const rendered = buildCall(draftBody, variables);
      const traceId = newTraceId();
      const runName = `replay ${selected.key} ${new Date().toISOString()}`;
      const id = await createRunAndResolveId(dataApi, {
        crf5c_name: runName,
        crf5c_app: selected.app,
        crf5c_promptkey: selected.key,
        crf5c_promptversion: selected.version,
        crf5c_source: "replay",
        crf5c_status: "queued",
        crf5c_label: baseline.label,
        crf5c_variables: baseline.variables,
        crf5c_candidatebody: draftBody,
        crf5c_renderedprompt: traced(traceId, selected.app, selected.key, rendered.text),
        crf5c_traceid: traceId,
        crf5c_baselinerunid: baseline.id,
      });
      if (rendered.unresolved.length) {
        setNotice(
          `Replay queued, but these variables had no recorded value: ${rendered.unresolved.join(", ")}`,
        );
      }
      const done = await pollRun(id);
      if (done) setReplayRun(done);
      else setError("The replay did not finish in time — check the run row later.");
    } catch (e) {
      setError(`Replay failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }, [dataApi, selected, draftBody, pollRun]);

  const handleOptimize = useCallback(async () => {
    if (!selected) return;
    const optimizer = templates.filter(
      (t) => t.key === OPTIMIZER_KEY && t.app === selected.app,
    )[0];
    if (!optimizer) {
      setError(`"${OPTIMIZER_KEY}" is not in the ${selected.app} catalog.`);
      return;
    }
    const samples = liveRuns.filter((r) => r.status === "succeeded").slice(0, 5);
    if (!samples.length) {
      setError("No successful live runs recorded for this prompt yet — use it in the app first.");
      return;
    }
    setBusy("optimize");
    setError("");
    setSuggestion(null);
    try {
      const runsBlock = samples
        .map((run, index) => {
          const variables = parseVariables(run.variables);
          const inputs = Object.keys(variables)
            .map((name) => {
              const shown = name === USER_TURN_KEY ? "user message" : name;
              return `  ${shown}: ${clip(variables[name], 1200)}`;
            })
            .join("\n");
          return [
            `## Run ${index + 1} — ${formatWhen(run.createdOn)} (${run.label || "unlabelled"})`,
            "Inputs:",
            inputs || "  (none)",
            "Model output:",
            clip(unwrapOutput(run.output), 2500),
          ].join("\n");
        })
        .join("\n\n");

      const rendered = renderTemplate(optimizer.body, {
        goal: optimizeGoal.trim() || "General quality: correctness, groundedness and consistency of the output.",
        promptKey: selected.key,
        variables: placeholdersOf(selected.body).join(", ") || "(none)",
        currentBody: draftBody,
        runs: runsBlock,
      });

      const traceId = newTraceId();
      const id = await createRunAndResolveId(dataApi, {
        crf5c_name: `suggest ${selected.key} ${new Date().toISOString()}`,
        crf5c_app: selected.app,
        crf5c_promptkey: selected.key,
        crf5c_promptversion: selected.version,
        crf5c_source: "suggest",
        crf5c_status: "queued",
        crf5c_label: "Prompt Studio optimizer",
        crf5c_candidatebody: draftBody,
        crf5c_renderedprompt: traced(traceId, selected.app, OPTIMIZER_KEY, rendered.text),
        crf5c_traceid: traceId,
      });

      const done = await pollRun(id);
      if (!done) {
        setError("The suggestion did not finish in time — check the run row later.");
        return;
      }
      if (done.status === "failed") {
        setError(`Suggestion failed: ${clip(done.error, 400)}`);
        return;
      }
      const text = unwrapOutput(done.output);
      try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        const parsed = JSON.parse(text.slice(start, end + 1)) as {
          diagnosis?: string;
          findings?: Array<{ issue?: string; evidence?: string; change?: string; impact?: string }>;
          revisedBody?: string;
        };
        setSuggestion({
          diagnosis: parsed.diagnosis ?? "",
          findings: parsed.findings ?? [],
          revisedBody: parsed.revisedBody ?? "",
          raw: text,
        });
      } catch {
        setSuggestion({ diagnosis: "", findings: [], revisedBody: "", raw: text });
      }
    } catch (e) {
      setError(`Optimization failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }, [dataApi, selected, templates, liveRuns, optimizeGoal, draftBody, pollRun]);

  const selectedRun = useMemo(
    () => runs.filter((r) => r.id === selectedRunId)[0],
    [runs, selectedRunId],
  );

  // ------------------------------------------------------------------ render

  /**
 * Opens on a first visit and stays recallable from the header. A guide that can
 * only be seen once is a guide nobody re-reads when they finally need it.
 */
  const renderGuide = () => (
    <Card className={styles.overview}>
      <div className={styles.row}>
        <Text weight="semibold" size={400}>{t("Getting started", "使用指引")}</Text>
        <div className={styles.grow} />
        <Button size="small" appearance="subtle" onClick={() => setGuideOpen(false)}>
          {t("Close", "关闭")}
        </Button>
      </div>

      <Text size={200}>
        {t(
          "Every instruction the Sales Copilot sends to the model lives here, in Dataverse — not in the app's code. Editing a prompt on this page changes how the assistant behaves, without a release.",
          "销售助手发给模型的每一条指令都存放在这里（Dataverse），而不是写死在应用代码里。在本页修改提示词，就能改变助手的行为，无需发版。",
        )}
      </Text>

      <div className={styles.guideGrid}>
        <div className={styles.panel}>
          <Text weight="semibold">{t("Improving a prompt", "如何调优提示词")}</Text>
          <Text size={200} className={styles.muted}>
            {t("Work from evidence, not from a hunch. The loop is:", "凭证据判断，而不是凭感觉。流程如下：")}
          </Text>
          <ol className={styles.guideList}>
            <li>
              <Text size={200}>
                <b>{t("Usage", "用量")}</b>
                {t(
                  " — see which prompts actually run and what they cost. A cheap prompt called hundreds of times a day matters more than an expensive one called twice.",
                  " —— 看清哪些提示词真正在跑、各花多少。每天被调用几百次的便宜提示词，比一天只调两次的贵提示词更值得优化。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Runs", "调用记录")}</b>
                {t(
                  " — open real executions and read what the model was sent and what it answered. Find one where the answer was wrong.",
                  " —— 展开真实调用，看清当时发给模型的内容和它的回答，找出一次答错的。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Save as case", "存为案例")}</b>
                {t(
                  " — record that situation as a graded example. Then trim the expectation to what genuinely must hold: a snapshot of one whole answer is too strict and will fail on harmless rewording.",
                  " —— 把这个场景固化成可判分的基准。存完请把「期望」裁剪到真正必须成立的部分：整段答案的快照过于严苛，模型换个说法就会误判为失败。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Edit", "编辑")}</b>
                {t(
                  " — change the wording. Say what to do rather than what not to do, and keep the output shape untouched.",
                  " —— 修改措辞。写「该做什么」而不是「不该做什么」，并且不要改动输出结构。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Accuracy", "准确性")}</b>
                {t(
                  " — score the edited prompt against the saved one over the same cases. The number to trust is the difference, and that every case which already passed still passes.",
                  " —— 在同一组案例上，给「改动后」和「已保存」两个版本分别打分。真正有意义的是两者的差值，以及原本通过的案例是否依然通过。",
                )}
              </Text>
            </li>
          </ol>
          <Text size={200} className={styles.muted}>
            {t(
              "The point of the case set is not the score. It is that fixing one situation can quietly break another, and re-running every case is what catches it.",
              "案例集的价值不在那个百分比，而在于：修好一个场景，往往会悄悄弄坏另一个；每次都重跑全部案例，才拦得住这种回归。",
            )}
          </Text>
        </div>

        <div className={styles.panel}>
          <Text weight="semibold">{t("Versions and rollback", "版本与回滚")}</Text>
          <ul className={styles.guideList}>
            <li>
              <Text size={200}>
                <b>{t("Save", "保存")}</b>
                {t(
                  " stores the previous wording as a revision and raises the prompt version. Nothing is overwritten, so no edit is a one-way door.",
                  " 会把改动前的内容存为一个历史版本，并将版本号加一。旧内容不会被覆盖，所以任何一次修改都不是单向门。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("History", "历史版本")}</b>
                {t(
                  " lists every earlier version. “Load into editor” brings one back; saving it creates a new version on top, so the trail stays intact.",
                  " 列出全部历史版本。「载入编辑器」可取回任意一版；保存后会在最新版之上再加一版，历史链条始终完整。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Published", "已发布")}</b>
                {t(
                  " controls whether the app uses your edit at all. Turn it off and the assistant falls back to the wording that shipped with the code — the fastest way out of a bad edit.",
                  " 决定应用是否采用你的修改。关掉它，助手就退回随代码发布的原始措辞 —— 这是改砸之后最快的退路。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Contract version", "契约版本")}</b>
                {t(
                  " is different, and you should not need to touch it. It marks the output shape the app's parser expects; changing that needs a code change, so an edit that alters it is refused rather than allowed to break the app.",
                  " 是另一回事，正常情况下你不需要碰它。它标记应用解析器所期望的输出结构；改动它需要同步改代码，因此违反契约的修改会被直接拒绝，而不是放任它把应用搞坏。",
                )}
              </Text>
            </li>
          </ul>
        </div>

        <div className={styles.panel}>
          <Text weight="semibold">{t("Terms you will meet", "会遇到的术语")}</Text>
          <ul className={styles.guideList}>
            <li>
              <Text size={200}>
                <b>{"{{variable}}"}</b>
                {t(
                  " — a slot the app fills at call time (the user's message, the page they are on). Leave the names alone; an unknown name is rejected.",
                  " —— 由应用在调用时填入的占位符（用户说的话、当前所在页面等）。请勿改动这些名称，未知名称会被拒绝。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Accuracy", "准确性")}</b>
                {t(
                  " — the share of your graded cases that passed. Cases needing a human verdict are excluded from the total rather than counted as passes.",
                  " —— 你的案例集中通过的比例。需要人工判定的案例会被排除在分母之外，而不是当作通过来虚抬数字。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Unattributed", "未归属")}</b>
                {t(
                  " — calls the platform logged that no prompt here explains, such as the Copilot Studio agent. Shown honestly instead of being hidden.",
                  " —— 平台记录到、但本页任何提示词都无法解释的调用，例如 Copilot Studio 智能体。如实显示，而不是藏起来。",
                )}
              </Text>
            </li>
            <li>
              <Text size={200}>
                <b>{t("Not replayable", "不可重跑")}</b>
                {t(
                  " — the platform keeps only the first 4000 characters of a prompt, so a long one cannot be re-run from its log. Evaluate those through cases, whose inputs are stored in full.",
                  " —— 平台只保留提示词的前 4000 个字符，因此长提示词无法从日志重跑。这类请通过案例来评测，案例的输入是完整保存的。",
                )}
              </Text>
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );

  const renderOverview = () => {
    const trendWidth = 260;
    const trendHeight = 36;
    const step = days.length > 1 ? trendWidth / (days.length - 1) : trendWidth;
    const points = days
      .map((day, index) => {
        const value = usageTotals.byDay[day] ?? 0;
        const y = usageTotals.peak
          ? trendHeight - (value / usageTotals.peak) * (trendHeight - 4) - 2
          : trendHeight - 2;
        return `${(index * step).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return (
      <Card className={styles.overview}>
        <div className={styles.row}>
          <Text weight="semibold">{t("Usage", "用量")}</Text>
          <Text size={200} className={styles.muted}>
            {t(
              `prompt calls for ${activeApp || "the current app"}; financial totals live in Cost Dashboard`,
              `${activeApp || "当前应用"} 的提示词调用；财务总额请查看 Cost Dashboard`,
            )}
          </Text>
          <div className={styles.grow} />
          <Text size={200} className={styles.muted}>{t("Period", "周期")}</Text>
          {[7, 14, 30].map((option) => (
            <Button
              key={option}
              size="small"
              appearance={usageDays === option ? "primary" : "subtle"}
              onClick={() => setUsageDays(option)}
            >
              {option}d
            </Button>
          ))}
          <Divider vertical className={styles.controlDivider} />
          <Button
            size="small"
            appearance="subtle"
            onClick={() => setUsageOpen((open) => !open)}
          >
            {usageOpen ? t("Hide", "收起") : t("Show", "展开")}
          </Button>
        </div>

        {usageOpen ? (
          <Fragment>
            <div className={styles.kpis}>
              <div className={styles.kpi}>
                <Text size={600} weight="semibold">{usageTotals.total}</Text>
                <Text size={200} className={styles.muted}>{t("calls", "次调用")}</Text>
              </div>
              <div className={styles.kpi}>
                <Text size={600} weight="semibold">{usageTotals.prompts}</Text>
                <Text size={200} className={styles.muted}>{t("prompts used", "个提示词")}</Text>
              </div>
              <div className={styles.kpi}>
                <Text size={600} weight="semibold">{usageTotals.inferred}</Text>
                <Text size={200} className={styles.muted}>{t("historically inferred", "历史推断归属")}</Text>
              </div>
              <div className={styles.kpi}>
                <svg width={trendWidth} height={trendHeight} role="img" aria-label="Daily call volume">
                  <polyline
                    points={points}
                    fill="none"
                    stroke={tokens.colorBrandStroke1}
                    strokeWidth="2"
                  />
                </svg>
                <Text size={200} className={styles.muted}>
                  {t("daily calls", "每日调用")} · {t("peak", "峰值")} {usageTotals.peak}
                </Text>
              </div>
            </div>

            <div className={styles.panelPair}>
              <div className={styles.panel}>
                <Text weight="semibold">{t("Attribution quality", "归属质量")}</Text>
                <Text size={200} className={styles.muted}>
                  {t(
                    `${usageTotals.exact} exact · ${usageTotals.inferred} inferred from legacy prompt text`,
                    `${usageTotals.exact} 条精确归属 · ${usageTotals.inferred} 条根据历史提示词正文推断`,
                  )}
                </Text>
              </div>
            </div>

            {heatmapRows.length === 0 ? (
              <Text size={200} className={styles.muted}>
                {t("No calls recorded in this period yet — use the app and they appear here.", "该周期内还没有调用记录 —— 使用应用后就会出现在这里。")}
              </Text>
            ) : (
              <div className={styles.heatScroll}>
                <Text size={200} className={styles.muted}>
                  {t(
                    "One row per prompt, one column per day — darker means more calls.",
                    "每行一个提示词，每列一天，颜色越深表示调用越多。",
                  )}
                </Text>
                {heatmapRows.map((row) => (
                  <div key={row.key} className={styles.heatRow}>
                    <Text
                      size={200}
                      className={styles.heatLabel}
                      title={row.key}
                      onClick={() => {
                        const match = templates.filter(
                          (t) => t.key === row.key && (!appFilter || t.app === appFilter),
                        )[0];
                        if (match) setSelectedId(match.id);
                      }}
                    >
                      {row.key}
                    </Text>
                    {days.map((day) => {
                      const value = cellValue(row.usage, day);
                      const shown = value ? String(value) : "";
                      return (
                        <div
                          key={day}
                          className={styles.heatCell}
                          title={`${row.key} · ${day} · ${shown || 0} calls`}
                          style={{ backgroundColor: heatColor(value, peakCell) }}
                        />
                      );
                    })}
                    <Text size={200} className={styles.muted}>
                      &nbsp;
                      {row.usage.total}
                    </Text>
                  </div>
                ))}
                <div className={styles.heatRow}>
                  <span className={styles.heatLabel} />
                  {days.map((day, index) => (
                    <div key={day} className={styles.heatAxis}>
                      {index === 0 || index === days.length - 1 || index % 7 === 0
                        ? dayLabel(day)
                        : ""}
                    </div>
                  ))}
                </div>
                <div className={styles.heatLegend}>
                  <Text size={100} className={styles.muted}>{t("Less", "少")}</Text>
                  {[0, 0.2, 0.45, 0.7, 1].map((level) => (
                    <span
                      key={level}
                      className={styles.heatCell}
                      style={{ backgroundColor: heatColor(level, 1) }}
                    />
                  ))}
                  <Text size={100} className={styles.muted}>{t("More", "多")}</Text>
                </div>
              </div>
            )}
          </Fragment>
        ) : null}
      </Card>
    );
  };

  const renderList = () => (
    <Card className={styles.list}>
      <Input
        value={search}
        onChange={(_, data) => setSearch(data.value)}
        placeholder="Search prompts"
        contentBefore={<SearchRegular />}
      />
      {apps.length > 1 ? (
        <Dropdown
          value={appFilter || "All apps"}
          selectedOptions={[appFilter]}
          onOptionSelect={(_, data) => setAppFilter(String(data.optionValue ?? ""))}
        >
          <Option value="">All apps</Option>
          {apps.map((app) => (
            <Option key={app} value={app}>{app}</Option>
          ))}
        </Dropdown>
      ) : null}
      <div className={styles.row}>
        <Text size={200} className={styles.muted}>
          {filtered.length} of {templates.length}
        </Text>
        <div className={styles.grow} />
        <Button size="small" appearance="subtle" onClick={() => setSortByCalls((on) => !on)}>
          {sortByCalls ? t("By calls", "按调用量") : t("By name", "按名称")}
        </Button>
      </div>
      {filtered.map((template) => {
        const stats = usageByPrompt[template.key];
        return (
          <button
            key={template.id}
            type="button"
            className={
              template.id === selectedId
                ? `${styles.listItem} ${styles.listItemActive}`
                : styles.listItem
            }
            onClick={() => setSelectedId(template.id)}
          >
            <Text weight="semibold" size={300}>{template.key}</Text>
            <div className={styles.row}>
              {apps.length > 1 ? (
                <Badge appearance="filled" color="brand" size="small">{template.app}</Badge>
              ) : null}
              <Badge
                appearance="tint"
                color={template.published ? "success" : "informative"}
                size="small"
              >
                {template.published ? t("Published", "已发布") : t("Draft", "草稿")}
              </Badge>
              <Text size={200} className={styles.muted}>v{template.version}</Text>
              <div className={styles.grow} />
              <Text size={200} className={styles.muted}>
                {stats ? `${stats.total} call${stats.total === 1 ? "" : "s"}` : "unused"}
              </Text>
            </div>
          </button>
        );
      })}
    </Card>
  );

  const renderEdit = () => {
    if (!selected) return null;
    const declared = placeholdersOf(draftBody);
    return (
      <Fragment>
        <div className={styles.row}>
          <Text size={200} className={styles.muted}>Variables in this body:</Text>
          {declared.length ? (
            declared.map((name) => (
              <Badge key={name} appearance="outline" size="small">{name}</Badge>
            ))
          ) : (
            <Text size={200} className={styles.muted}>none</Text>
          )}
        </div>
        <Textarea
          className={styles.bodyEditor}
          value={draftBody}
          onChange={(_, data) => setDraftBody(data.value)}
          resize="vertical"
        />
        <Input
          value={draftNotes}
          onChange={(_, data) => setDraftNotes(data.value)}
          placeholder="What are you changing, and why? (saved with the version)"
        />
        <div className={styles.row}>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : `Save as v${selected.version + 1}`}
          </Button>
          <Button
            icon={<ArrowUndoRegular />}
            disabled={!dirty || saving}
            onClick={() => setDraftBody(selected.body)}
          >
            {t("Discard changes", "放弃修改")}
          </Button>
          {dirty ? (
            <Text size={200} className={styles.muted}>
              {draftBody.length - selected.body.length >= 0 ? "+" : ""}
              {draftBody.length - selected.body.length} characters
            </Text>
          ) : null}
        </div>
      </Fragment>
    );
  };

  const renderHistory = () => (
    <Fragment>
      {revisions.length === 0 ? (
        <Text className={styles.muted}>No earlier versions yet — the first save creates one.</Text>
      ) : null}
      {revisions.map((revision) => (
        <div key={revision.id} className={styles.panel}>
          <div className={styles.row}>
            <Text weight="semibold">v{revision.version}</Text>
            <Text size={200} className={styles.muted}>{formatWhen(revision.createdOn)}</Text>
            <div className={styles.grow} />
            <Button
              size="small"
              icon={<ArrowUndoRegular />}
              onClick={() => handleRestore(revision)}
            >
              {t("Load into editor", "载入编辑器")}
            </Button>
          </div>
          {revision.notes ? <Text size={200}>{revision.notes}</Text> : null}
          <pre className={styles.pre}>{clip(revision.body, 2000)}</pre>
        </div>
      ))}
    </Fragment>
  );

  const renderCases = () => (
    <Fragment>
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>{t("Does the edit make it more correct?", "这次修改是否更准确了？")}</MessageBarTitle>
          A replay shows that the answer changed; only a graded case set shows whether it
          improved — and whether the cases that already worked still do.
        </MessageBarBody>
      </MessageBar>

      <div className={styles.row}>
        <Button
          appearance="primary"
          icon={busy === "evaluate" ? <Spinner size="tiny" /> : <CheckmarkCircleRegular />}
          disabled={busy === "evaluate" || !cases.length}
          onClick={() => void runEvaluation(draftBody, "candidate")}
        >
          {t("Score the edited prompt", "给改动后的版本打分")}
        </Button>
        <Button
          appearance="secondary"
          disabled={busy === "evaluate" || !cases.length || !selected}
          onClick={() => selected && void runEvaluation(selected.body, "saved")}
        >
          {t("Score the saved prompt", "给已保存的版本打分")}
        </Button>
        <Text size={200} className={styles.muted}>
          {evalProgress || `${cases.filter((c) => c.enabled).length} enabled case(s)`}
        </Text>
      </div>

      {caseResults.length ? (
        <div className={styles.row}>
          <Text size={600} weight="semibold">
            {score.graded ? `${score.pct}%` : "—"}
          </Text>
          <Text size={200} className={styles.muted}>
            {score.passed}/{score.graded} passed
            {score.manual ? ` · ${score.manual} need a reviewer` : ""}
          </Text>
        </div>
      ) : null}

      {caseResults.map((result) => (
        <Card key={result.caseId} className={styles.overview}>
          <div className={styles.row}>
            <Badge
              appearance="tint"
              size="small"
              color={
                result.verdict === "pass"
                  ? "success"
                  : result.verdict === "fail"
                    ? "danger"
                    : "warning"
              }
            >
              {result.verdict}
            </Badge>
            <Text weight="semibold" size={300}>{result.name}</Text>
          </div>
          <Text size={200} className={styles.muted}>{result.detail}</Text>
          {result.verdict !== "pass" ? (
            <pre className={styles.pre}>{clip(result.output, 900) || "(no output)"}</pre>
          ) : null}
        </Card>
      ))}

      {cases.length === 0 ? (
        <Text size={200} className={styles.muted}>
{t("No cases yet. Open Runs, find an execution whose answer you can judge, and use \u201cSave as case\u201d \u2014 cases grown from real traffic beat invented ones.", "还没有案例。打开「调用记录」，找一条你能判断对错的真实调用，点「存为案例」—— 从真实流量长出来的案例，远胜凭空编造的。")}
        </Text>
      ) : (
        <Fragment>
          <Text weight="semibold">Case set</Text>
          {cases.map((item) => (
            <div key={item.id} className={styles.caseRow}>
              <Badge appearance="outline" size="small">{item.checkType}</Badge>
              <Text size={200}>{item.name}</Text>
              <div className={styles.grow} />
              {!item.enabled ? (
                <Text size={200} className={styles.muted}>disabled</Text>
              ) : null}
            </div>
          ))}
        </Fragment>
      )}
    </Fragment>
  );

  const renderRuns = () => (
    <Fragment>
      <Text size={200} className={styles.muted}>
        {liveRuns.length} execution(s) in the last {usageDays} days, from the platform AI Event log.
        {t("Select one to see what was sent and what came back.", "点击任意一条可展开，查看当时发送的内容与返回的结果。")}
      </Text>
      {liveRuns.map((run) => {
        const open = run.id === selectedRunId;
        const variables = open ? parseVariables(run.variables) : {};
        return (
          <Fragment key={run.id}>
            <div
              role="button"
              tabIndex={0}
              className={open ? `${styles.runRow} ${styles.runRowActive}` : styles.runRow}
              onClick={() => setSelectedRunId(open ? "" : run.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedRunId(open ? "" : run.id);
              }}
            >
              {open ? <ChevronDownRegular /> : <ChevronRightRegular />}
              {run.status === "succeeded" ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}
              <Text size={200}>{formatWhen(run.createdOn)}</Text>
              <Badge appearance="outline" size="small">{run.label || "—"}</Badge>
              {!run.variables ? (
                <Badge appearance="tint" color="warning" size="small" title="Microsoft's AI Event log caps the stored prompt at 4000 characters, so this call's variables cannot be recovered">
                  {t("not replayable", "不可重跑")}
                </Badge>
              ) : null}
              <div className={styles.grow} />
              <Text size={200} className={styles.muted}>{clip(unwrapOutput(run.output), 70)}</Text>
            </div>

            {open ? (
              <div className={styles.runDetail}>
                <div className={styles.panelPair}>
                  <div className={styles.panel}>
                    <Text weight="semibold">
                      {Object.keys(variables).length ? "Recovered variables" : "Prompt as sent"}
                    </Text>
                    <pre className={styles.pre}>
                      {Object.keys(variables).length
                        ? Object.keys(variables)
                            .map((name) =>
                              `${name === USER_TURN_KEY ? "user message" : name}:\n${variables[name]}`,
                            )
                            .join("\n\n")
                        : run.promptText || "(nothing recorded)"}
                    </pre>
                  </div>
                  <div className={styles.panel}>
                    <Text weight="semibold">{t("Output", "输出")}</Text>
                    <pre className={styles.pre}>{unwrapOutput(run.output) || run.error || "(empty)"}</pre>
                  </div>
                </div>
                {Object.keys(variables).length && run.promptText ? (
                  <details>
                    <summary>
                      <Text size={200} className={styles.muted}>Prompt as sent</Text>
                    </summary>
                    <pre className={styles.pre}>{run.promptText}</pre>
                  </details>
                ) : null}
                <div className={styles.row}>
                  <Button
                    size="small"
                    icon={busy === "case" ? <Spinner size="tiny" /> : <CheckmarkCircleRegular />}
                    disabled={busy === "case"}
                    onClick={() => void saveRunAsCase(run)}
                  >
                    {t("Save as case", "存为案例")}
                  </Button>
                  <Text size={200} className={styles.muted}>
                    {t("Turns this execution into a graded example, so future edits have to keep answering it correctly.", "把这次调用固化为可判分的基准，之后每次修改都必须继续答对它。")}
                  </Text>
                </div>
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </Fragment>
  );

  const renderReplay = () => {
    const baseline = selectedRun && selectedRun.source === "live" ? selectedRun : liveRuns[0];
    const comparison =
      baseline && replayRun
        ? compareOutputs(unwrapOutput(baseline.output), unwrapOutput(replayRun.output))
        : null;
    return (
      <Fragment>
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>
            {t("Pick a real execution, then run the body you are editing against exactly the same inputs.", "选一条真实调用，用你正在编辑的内容，对完全相同的输入重跑一次。")}
            {t("Nothing in production changes — the replay is its own run.", "不影响线上任何东西 —— 重跑是一次独立的调用。")}
          </MessageBarBody>
        </MessageBar>
        <div className={styles.row}>
          <Dropdown
            value={baseline ? `${formatWhen(baseline.createdOn)} · ${baseline.label || "—"}` : "No runs yet"}
            selectedOptions={baseline ? [baseline.id] : []}
            onOptionSelect={(_, data) => setSelectedRunId(String(data.optionValue))}
            disabled={!liveRuns.length}
          >
            {liveRuns.map((run) => (
              <Option key={run.id} value={run.id}>
                {`${formatWhen(run.createdOn)} · ${run.label || "—"}`}
              </Option>
            ))}
          </Dropdown>
          <Button
            appearance="primary"
            icon={busy === "replay" ? <Spinner size="tiny" /> : <PlayRegular />}
            disabled={!baseline || busy === "replay"}
            onClick={() => baseline && void handleReplay(baseline)}
          >
            {busy === "replay" ? "Running…" : "Replay with the edited body"}
          </Button>
          {dirty ? null : (
            <Text size={200} className={styles.muted}>
              {t("The editor matches the saved body — the replay will reproduce the same prompt.", "编辑器内容与已保存版本一致 —— 重跑将得到同样的提示词。")}
            </Text>
          )}
        </div>
        {comparison ? (
          <MessageBar intent={comparison.identical ? "warning" : "success"} layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>
                {comparison.identical ? "Identical output" : "Output changed"}
              </MessageBarTitle>
              {comparison.changedLines} changed line(s), {comparison.charDelta >= 0 ? "+" : ""}
              {comparison.charDelta} characters, {comparison.lineDelta >= 0 ? "+" : ""}
              {comparison.lineDelta} lines.
            </MessageBarBody>
          </MessageBar>
        ) : null}
        <div className={styles.panelPair}>
          <div className={styles.panel}>
            <Text weight="semibold">Before — recorded output</Text>
            <pre className={styles.pre}>{baseline ? unwrapOutput(baseline.output) : "—"}</pre>
          </div>
          <div className={styles.panel}>
            <Text weight="semibold">After — edited body</Text>
            <pre className={styles.pre}>
              {replayRun ? unwrapOutput(replayRun.output) || replayRun.error : "—"}
            </pre>
          </div>
        </div>
      </Fragment>
    );
  };

  const renderOptimize = () => (
    <Fragment>
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody>
          {t(
            "The reviewer reads this prompt together with its own recent executions and proposes a concrete revision. It only ever suggests — nothing is saved until you review and save it.",
            "评审会同时阅读这条提示词及其最近的真实调用，并给出具体的修改稿。它只负责建议 —— 在你审阅并保存之前，不会改动任何内容。",
          )}
        </MessageBarBody>
      </MessageBar>
      <Input
        value={optimizeGoal}
        onChange={(_, data) => setOptimizeGoal(data.value)}
        placeholder="What do you want to improve? (optional, e.g. it keeps splitting one request into two intents)"
      />
      <div className={styles.row}>
        <Button
          appearance="primary"
          icon={busy === "optimize" ? <Spinner size="tiny" /> : <LightbulbRegular />}
          disabled={busy === "optimize"}
          onClick={() => void handleOptimize()}
        >
          {busy === "optimize" ? "Reviewing…" : "Review against recent runs"}
        </Button>
        <Text size={200} className={styles.muted}>
          {t("Uses up to 5 successful executions.", "最多参考 5 次成功的调用。")}
        </Text>
      </div>
      {suggestion ? (
        <Fragment>
          {suggestion.diagnosis ? (
            <div className={styles.panel}>
              <Text weight="semibold">Diagnosis</Text>
              <Text as="p">{suggestion.diagnosis}</Text>
            </div>
          ) : null}
          {suggestion.findings.map((finding, index) => (
            <div key={index} className={styles.panel}>
              <div className={styles.row}>
                <Badge
                  appearance="tint"
                  size="small"
                  color={finding.impact === "high" ? "danger" : finding.impact === "medium" ? "warning" : "informative"}
                >
                  {finding.impact || "note"}
                </Badge>
                <Text weight="semibold">{finding.issue}</Text>
              </div>
              {finding.evidence ? (
                <Text size={200} className={styles.muted}>Evidence: {finding.evidence}</Text>
              ) : null}
              {finding.change ? <Text as="p">{finding.change}</Text> : null}
            </div>
          ))}
          {suggestion.revisedBody ? (
            <div className={styles.panel}>
              <div className={styles.row}>
                <Text weight="semibold">Proposed body</Text>
                <div className={styles.grow} />
                <Button
                  size="small"
                  appearance="primary"
                  onClick={() => {
                    setDraftBody(suggestion.revisedBody);
                    setDraftNotes("Applied optimizer suggestion");
                    setTab("edit");
                    setNotice("Proposed body loaded into the editor — review it, then Save.");
                  }}
                >
                  {t("Load into editor", "载入编辑器")}
                </Button>
              </div>
              <pre className={styles.pre}>{suggestion.revisedBody}</pre>
            </div>
          ) : null}
          {!suggestion.diagnosis && !suggestion.findings.length && !suggestion.revisedBody ? (
            <div className={styles.panel}>
              <Text weight="semibold">Raw response</Text>
              <pre className={styles.pre}>{suggestion.raw}</pre>
            </div>
          ) : null}
        </Fragment>
      ) : null}
    </Fragment>
  );

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <Text weight="semibold" size={500}>{t("Prompt Studio", "提示词工作室")}</Text>
        <Text size={200} className={styles.muted}>
          {t("Edit, version and improve the prompts the Sales Copilot runs on.", "编辑、版本管理并持续优化销售助手所使用的提示词。")}
        </Text>
        <div className={styles.grow} />
        <Button
          size="small"
          appearance="subtle"
          onClick={() => {
            const next: Lang = currentLang === "zh" ? "en" : "zh";
            currentLang = next;
            try {
              window.localStorage.setItem(LANG_KEY, next);
            } catch {
              /* the choice simply will not persist */
            }
            setLang(next);
          }}
        >
          {currentLang === "zh" ? "EN" : "中文"}
        </Button>
        <Button
          appearance={guideOpen ? "primary" : "secondary"}
          icon={<BookQuestionMarkRegular />}
          onClick={() => {
            const next = !guideOpen;
            setGuideOpen(next);
            try {
              window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
            } catch {
              /* a blocked storage must not break the page */
            }
          }}
        >
          {t("Guide", "指引")}
        </Button>
        <Tooltip content="Reload prompts and history" relationship="label">
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void loadTemplates();
              if (selected) void loadHistory(selected.app, selected.key);
            }}
          />
        </Tooltip>
      </div>

      {guideOpen ? renderGuide() : null}

      {error ? (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{t("Something went wrong", "出错了")}</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {notice ? (
        <MessageBar intent="success" layout="multiline" onClick={() => setNotice("")}>
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      ) : null}

      {loading ? (
        <Spinner label="Loading prompts…" />
      ) : (
        <Fragment>
          {renderOverview()}
          <div className={styles.split}>
            {renderList()}
          <Card className={styles.detail}>
            {selected ? (
              <Fragment>
                <div className={styles.row}>
                  {apps.length > 1 ? (
                    <Badge appearance="filled" color="brand">{selected.app}</Badge>
                  ) : null}
                  <Text weight="semibold" size={400}>{selected.key}</Text>
                  <Badge appearance="tint" color={selected.published ? "success" : "informative"}>
                    {selected.published ? t("Published", "已发布") : t("Draft", "草稿")}
                  </Badge>
                  {/* Two different version numbers sit here, so both say what they count. */}
                  <Badge appearance="outline" title="Prompt version — increases on every save">
                    prompt v{selected.version}
                  </Badge>
                  <Badge appearance="outline" title="Response format the app parses">
                    {selected.responseFormat || "text"}
                  </Badge>
                  <Badge appearance="outline" title="Output contract the app's parser expects — changing it needs a code change">
                    contract v{selected.contractVersion}
                  </Badge>
                </div>
                {selected.description ? (
                  <Text size={200} className={styles.muted}>{selected.description}</Text>
                ) : null}

                <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as TabId)}>
                  <Tab value="edit" icon={<SaveRegular />}>{t("Edit", "编辑")}</Tab>
                  <Tab value="history" icon={<HistoryRegular />}>{t("History", "历史版本")} ({revisions.length})</Tab>
                  <Tab value="runs" icon={<PlayRegular />}>{t("Runs", "调用记录")} ({liveRuns.length})</Tab>
                  <Tab value="replay" icon={<ArrowClockwiseRegular />}>{t("Replay", "重跑")}</Tab>
                  <Tab value="cases" icon={<CheckmarkCircleRegular />}>{t("Accuracy", "准确性")} ({cases.length})</Tab>
                  <Tab value="optimize" icon={<LightbulbRegular />}>{t("Optimize", "AI 建议")}</Tab>
                </TabList>

                {tab === "edit" ? renderEdit() : null}
                {tab === "history" ? renderHistory() : null}
                {tab === "runs" ? renderRuns() : null}
                {tab === "replay" ? renderReplay() : null}
                {tab === "cases" ? renderCases() : null}
                {tab === "optimize" ? renderOptimize() : null}
              </Fragment>
            ) : (
              <Text>Select a prompt on the left.</Text>
            )}
            </Card>
          </div>
        </Fragment>
      )}
    </main>
  );
};

export default GeneratedComponent;
