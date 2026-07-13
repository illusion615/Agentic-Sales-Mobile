import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Spinner,
  Text,
  createTableColumn,
  makeStyles,
  shorthands,
  tokens,
  type TableColumnDefinition,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  ClockRegular,
  CopyRegular,
  DataTrendingRegular,
  FilterDismissRegular,
  MoneyRegular,
  SearchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import * as d3 from "d3";
import type { GeneratedComponentProps, crf5c_agentlog, msdyn_aievent } from "./RuntimeTypes";

type RangeKey = "7d" | "30d" | "90d" | "all";
type SortDirection = "ascending" | "descending";
type SortState = { sortColumn: string | number; sortDirection: SortDirection };
type AnalysisDimension = "operation" | "user";
type AgentLogGroupBy = "none" | "user" | "agent" | "operation";
type CreditMeter = "copilot" | "aiBuilder" | "currency";
type CostSettings = {
  currencySymbol: string;
  aiBuilderUnitCost: number;
  copilotUnitCost: number;
};
type FilterSource = "trend" | "donut" | "distribution" | "legend";
type AnalysisFilter = {
  dimension: AnalysisDimension | "date";
  key: string;
  label: string;
  source: FilterSource;
  members?: string[];
} | null;

type CostRow = {
  id: string;
  timestamp: Date | null;
  agentName: string;
  logName: string;
  sessionId: string;
  queryText: string;
  sourceDescription: string;
  userId: string;
  userName: string;
  aiBuilderCredits: number | null;
  copilotCredits: number | null;
  /** Selected meter projected into existing analytics functions. */
  credits: number | null;
  operationType: string;
  operationIndex: number | null;
  allocationMethod: string;
};

type PageState = {
  rows: CostRow[];
  previousRows: CostRow[];
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
};

type AiEventRecord = {
  id: string;
  title: string;
  configuration: string;
  aiBuilderCredits: number | null;
  copilotCredits: number | null;
  copilotFeature: string;
  billingUnits: number | null;
  processingDate: Date | null;
  status: "Processed" | "Failed" | "Processing" | "Unknown";
  source: string;
  dataType: string;
  automationName: string;
  partnerSource: string;
  approvalId: string;
  quickTest: string;
};

type AiEventContentState = {
  loading: boolean;
  input: string;
  inputTruncated: boolean;
  output: string;
  error: string | null;
};

type DetailState = {
  rowId: string | null;
  loading: boolean;
  sourceDescription: string;
  traceCount: number | null;
  aiEvents: AiEventRecord[];
  aiEventError: string | null;
  error: string | null;
};

type AgentLogGroup = {
  key: string;
  label: string;
  rows: CostRow[];
  totalCredits: number;
  pendingCount: number;
};

type VisibleAgentLogGroup = AgentLogGroup & { visibleRows: CostRow[] };

type OperationTotal = { operationType: string; credits: number; count: number };
type SharedOperationCategory = { key: string; label: string; credits: number; count: number; members: string[]; colorIndex: number };
type DailyPoint = { date: Date; values: Record<string, number>; total: number; previousTotal: number };
type PeriodBounds = {
  currentStart: Date | null;
  previousStart: Date | null;
  previousEnd: Date | null;
  days: number | null;
};
type DistributionBucket = {
  key: string;
  label: string;
  total: number;
  max: number;
  min: number;
  average: number;
  median: number;
  share: number;
  count: number;
  cleanSampleCount: number;
};

type Finding = {
  id: string;
  intent: "success" | "info" | "warning" | "error";
  title: string;
  body: string;
};

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const AGENT_LOG_GROUP_OPTIONS: Array<{ key: AgentLogGroupBy; label: string }> = [
  { key: "none", label: "None" },
  { key: "user", label: "User" },
  { key: "agent", label: "Agent" },
  { key: "operation", label: "Operation type" },
];

const CREDIT_METER_OPTIONS: Array<{ key: CreditMeter; label: string; shortLabel: string }> = [
  { key: "copilot", label: "Copilot Credits", shortLabel: "Copilot" },
  { key: "aiBuilder", label: "AI Builder Credits", shortLabel: "AI Builder" },
  { key: "currency", label: "Currency (unified cost)", shortLabel: "Currency" },
];

const COST_SETTINGS_STORAGE_KEY = "agentic-crm-cost-settings";
const DEFAULT_COST_SETTINGS: CostSettings = {
  currencySymbol: "$",
  aiBuilderUnitCost: 0.0005,
  copilotUnitCost: 0.01,
};

function loadCostSettings(): CostSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(COST_SETTINGS_STORAGE_KEY) : null;
    if (!raw) return DEFAULT_COST_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CostSettings>;
    const currencySymbol = typeof parsed.currencySymbol === "string" && parsed.currencySymbol.trim().length > 0
      ? parsed.currencySymbol.slice(0, 6)
      : DEFAULT_COST_SETTINGS.currencySymbol;
    const aiBuilderUnitCost = typeof parsed.aiBuilderUnitCost === "number" && Number.isFinite(parsed.aiBuilderUnitCost) && parsed.aiBuilderUnitCost >= 0
      ? parsed.aiBuilderUnitCost
      : DEFAULT_COST_SETTINGS.aiBuilderUnitCost;
    const copilotUnitCost = typeof parsed.copilotUnitCost === "number" && Number.isFinite(parsed.copilotUnitCost) && parsed.copilotUnitCost >= 0
      ? parsed.copilotUnitCost
      : DEFAULT_COST_SETTINGS.copilotUnitCost;
    return { currencySymbol, aiBuilderUnitCost, copilotUnitCost };
  } catch {
    return DEFAULT_COST_SETTINGS;
  }
}

function saveCostSettings(settings: CostSettings): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(COST_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore persistence failures (private mode / disabled storage).
  }
}

const PAGE_SIZE = 50;
const CHART_COLORS = d3.schemeTableau10;
const TRACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const useStyles = makeStyles({
  root: {
    position: "relative",
    contain: "layout",
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "96rem",
    marginRight: "auto",
    marginLeft: "auto",
    paddingTop: tokens.spacingVerticalXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
    "@media (max-width: 700px)": {
      paddingTop: tokens.spacingVerticalL,
      paddingRight: tokens.spacingHorizontalM,
      paddingLeft: tokens.spacingHorizontalM,
    },
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: "16rem",
  },
  eyebrow: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  rangeGroup: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 720px)": {
      gridTemplateColumns: "1fr",
    },
  },
  settingsField: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  settingsHint: {
    color: tokens.colorNeutralForeground3,
  },
  settingsActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  lastUpdated: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 980px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
    "@media (max-width: 520px)": {
      gridTemplateColumns: "1fr",
    },
  },
  kpiCard: {
    minHeight: "8.5rem",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  kpiIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2.25rem",
    height: "2.25rem",
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
  },
  kpiContent: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
  },
  kpiValue: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: "tabular-nums",
  },
  kpiHint: {
    color: tokens.colorNeutralForeground3,
  },
  combinedChartGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.65fr) minmax(20rem, 1fr)",
    alignItems: "start",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 1000px)": {
      gridTemplateColumns: "1fr",
    },
  },
  chartSection: {
    minWidth: 0,
  },
  chartSectionDonut: {
    minWidth: 0,
    paddingLeft: tokens.spacingHorizontalL,
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorNeutralStroke2,
    "@media (max-width: 1000px)": {
      paddingTop: tokens.spacingVerticalL,
      paddingLeft: 0,
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: tokens.colorNeutralStroke2,
      borderLeftWidth: 0,
    },
  },
  chartSectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    marginBottom: tokens.spacingVerticalS,
  },
  sharedLegend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  sharedLegendSwatch: {
    display: "inline-block",
    marginRight: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  sectionCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    overflow: "hidden",
  },
  sectionBody: {
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
  },
  sectionSubtitle: {
    color: tokens.colorNeutralForeground3,
  },
  analysisToolbar: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  controlRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  controlLabel: {
    minWidth: "4.5rem",
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
  },
  controlGroup: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "wrap",
  },
  analysisCaption: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalS,
  },
  chartWrap: {
    position: "relative",
    width: "100%",
    minHeight: "17rem",
  },
  chartSvg: {
    display: "block",
    width: "100%",
    height: "auto",
    minHeight: "16rem",
    overflow: "visible",
  },
  chartLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalS,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  legendSwatch: {
    width: "0.65rem",
    height: "0.65rem",
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
  },
  legendSwatch0: { backgroundColor: "#4e79a7" },
  legendSwatch1: { backgroundColor: "#f28e2c" },
  legendSwatch2: { backgroundColor: "#e15759" },
  legendSwatch3: { backgroundColor: "#76b7b2" },
  legendSwatch4: { backgroundColor: "#59a14f" },
  legendSwatch5: { backgroundColor: "#edc949" },
  legendSwatch6: { backgroundColor: "#af7aa1" },
  legendSwatch7: { backgroundColor: "#ff9da7" },
  legendSwatch8: { backgroundColor: "#9c755f" },
  legendSwatch9: { backgroundColor: "#bab0ab" },
  chartReadout: {
    minHeight: "1.5rem",
    marginTop: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground2,
  },
  findings: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalM,
    "@media (max-width: 900px)": {
      gridTemplateColumns: "1fr",
    },
  },
  findingBar: {
    height: "100%",
  },
  concentration: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    marginTop: tokens.spacingVerticalM,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalM,
  },
  searchGroup: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  exportNotice: {
    marginBottom: tokens.spacingVerticalM,
  },
  exportManual: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
  },
  exportTextarea: {
    width: "100%",
    minHeight: "160px",
    boxSizing: "border-box",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    padding: tokens.spacingVerticalS,
    resize: "vertical",
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  agentLogControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
    marginBottom: tokens.spacingVerticalM,
  },
  groupControl: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  groupSection: {
    minWidth: 0,
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTopLeftRadius: tokens.borderRadiusMedium,
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  groupTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  groupFacts: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground3,
  },
  searchInput: {
    minWidth: "18rem",
    "@media (max-width: 520px)": {
      minWidth: "100%",
      width: "100%",
    },
  },
  gridScroll: {
    overflowX: "auto",
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  rankingTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  rankingHeader: {
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    textAlign: "left",
    whiteSpace: "nowrap",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  rankingHeaderNumeric: {
    textAlign: "right",
  },
  rankingCell: {
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke3,
  },
  rankingCellNumeric: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  rankingCellNowrap: {
    whiteSpace: "nowrap",
  },
  queryCell: {
    display: "block",
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  gridCellClip: {
    minWidth: 0,
    overflow: "hidden",
  },
  clickableGridRow: {
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: "-2px",
    },
  },
  detailInlineRow: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  detailInlineCell: {
    width: "100% !important",
    minWidth: "100% !important",
    maxWidth: "none !important",
    flexBasis: "100% !important",
    flexGrow: "1 !important",
    flexShrink: "0 !important",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    overflow: "visible",
  },
  numericCell: {
    display: "block",
    width: "100%",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  paginationButtons: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
  },
  detailPanel: {
    marginTop: 0,
    width: "100%",
    minWidth: 0,
    flexGrow: 1,
    boxSizing: "border-box",
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 700px)": {
      gridTemplateColumns: "1fr",
    },
  },
  detailValue: {
    color: tokens.colorNeutralForeground2,
    overflowWrap: "anywhere",
  },
  aiEventSection: {
    marginTop: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  aiEventSectionHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: "wrap",
  },
  aiEventList: {
    display: "grid",
    gap: tokens.spacingVerticalS,
  },
  aiEventItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  aiEventMain: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    flexGrow: 1,
  },
  aiEventFacts: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground3,
  },
  aiEventLink: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    paddingTop: tokens.spacingVerticalXS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    textDecorationLine: "none",
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorBrandStroke1),
    ":hover": {
      color: tokens.colorBrandForeground2,
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  aiEventExpanded: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
    "@media (max-width: 900px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
    "@media (max-width: 600px)": {
      gridTemplateColumns: "1fr",
    },
  },
  aiEventField: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  aiEventFieldLabel: {
    color: tokens.colorNeutralForeground3,
  },
  aiEventFieldValue: {
    color: tokens.colorNeutralForeground1,
    overflowWrap: "anywhere",
  },
  aiEventContentGrid: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalS,
    "@media (max-width: 800px)": {
      gridTemplateColumns: "1fr",
    },
  },
  aiEventContentPanel: {
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
  },
  aiEventContentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  aiEventContent: {
    maxHeight: "22rem",
    marginTop: 0,
    marginBottom: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    overflowY: "auto",
    color: tokens.colorNeutralForeground1,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  empty: {
    display: "flex",
    minHeight: "12rem",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
  },
  skeletonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalL,
    "@media (max-width: 980px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
});

function normalizeRow(row: crf5c_agentlog): CostRow {
  const aiBuilderCredits = toNullableNumber(row.biz_creditsconsumed);
  const copilotCredits = toNullableNumber(row.biz_copilotcreditsconsumed);
  // User attribution reads crf5c_userid / crf5c_username, which a server-side
  // Flow keeps populated from the Dataverse owner system field (the native
  // player cannot resolve the signing user at write time, but the record owner
  // is always correct).
  return {
    id: String(row.crf5c_agentlogid || ""),
    timestamp: toDate(row.crf5c_timestamp),
    agentName: toText(row.crf5c_agentname, "Unknown agent"),
    logName: toText(row.crf5c_logname, "—"),
    sessionId: toText(row.crf5c_sessionid, "—"),
    queryText: toText(row.crf5c_querytext, "—"),
    sourceDescription: toText(row.crf5c_sourcedescription, "—"),
    userId: toText(row.crf5c_userid, "unattributed"),
    userName: toText(row.crf5c_username, "Unattributed user"),
    aiBuilderCredits,
    copilotCredits,
    credits: aiBuilderCredits,
    operationType: toText(row.biz_operationtype, "(unassigned)"),
    operationIndex: toNullableNumber(row.biz_operationindex),
    allocationMethod: toText(row.biz_allocationmethod, "—"),
  };
}

function meterValueForRow(row: CostRow, meter: CreditMeter, settings: CostSettings): number | null {
  if (meter === "copilot") return row.copilotCredits;
  if (meter === "aiBuilder") return row.aiBuilderCredits;
  // Currency unifies both credit types into one additive monetary amount.
  if (row.aiBuilderCredits === null && row.copilotCredits === null) return null;
  return (row.aiBuilderCredits ?? 0) * settings.aiBuilderUnitCost + (row.copilotCredits ?? 0) * settings.copilotUnitCost;
}

function projectCreditMeter(rows: CostRow[], meter: CreditMeter, settings: CostSettings): CostRow[] {
  return rows.map((row) => ({
    ...row,
    credits: meterValueForRow(row, meter, settings),
  }));
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function getPeriodBounds(range: RangeKey): PeriodBounds {
  const option = RANGE_OPTIONS.find((item) => item.key === range);
  if (!option || option.days === null) {
    return { currentStart: null, previousStart: null, previousEnd: null, days: null };
  }
  const currentStart = new Date();
  currentStart.setHours(0, 0, 0, 0);
  currentStart.setDate(currentStart.getDate() - (option.days - 1));
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - option.days);
  return { currentStart, previousStart, previousEnd, days: option.days };
}

function buildCurrentFilter(bounds: PeriodBounds): string | undefined {
  return bounds.currentStart ? `crf5c_timestamp ge ${bounds.currentStart.toISOString()}` : undefined;
}

function buildPreviousFilter(bounds: PeriodBounds): string | undefined {
  return bounds.previousStart && bounds.previousEnd
    ? `crf5c_timestamp ge ${bounds.previousStart.toISOString()} and crf5c_timestamp lt ${bounds.previousEnd.toISOString()}`
    : undefined;
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

async function queryCostRows(dataApi: GeneratedComponentProps["dataApi"], filter?: string): Promise<CostRow[]> {
  const options = {
    select: [
      "crf5c_agentlogid",
      "crf5c_timestamp",
      "crf5c_agentname",
      "crf5c_logname",
      "crf5c_sessionid",
      "crf5c_querytext",
      "crf5c_sourcedescription",
      "crf5c_userid",
      "crf5c_username",
      "biz_creditsconsumed",
      "biz_copilotcreditsconsumed",
      "biz_operationtype",
      "biz_operationindex",
      "biz_allocationmethod",
    ],
    orderBy: "crf5c_timestamp desc",
    pageSize: 500,
    ...(filter ? { filter } : {}),
  };
  let result = await dataApi.queryTable("crf5c_agentlog", options);
  const records: crf5c_agentlog[] = [...result.rows];
  while (result.hasMoreRows && result.loadMoreRows) {
    result = await result.loadMoreRows();
    records.push(...result.rows);
  }
  return records.map(normalizeRow);
}

function emptyDetailState(): DetailState {
  return {
    rowId: null,
    loading: false,
    sourceDescription: "",
    traceCount: null,
    aiEvents: [],
    aiEventError: null,
    error: null,
  };
}

function parseTraceIds(value: unknown): string[] | null {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value) as { traces?: unknown };
    if (!Array.isArray(parsed.traces)) return null;
    return Array.from(new Set(
      parsed.traces
        .filter((trace): trace is string => typeof trace === "string" && TRACE_ID_PATTERN.test(trace))
        .map((trace) => trace.toLowerCase()),
    ));
  } catch {
    return null;
  }
}

function aiEventStatus(value: unknown): AiEventRecord["status"] {
  if (value === 0) return "Processed";
  if (value === 1) return "Failed";
  if (value === 2) return "Processing";
  return "Unknown";
}

function aiEventSource(value: unknown): string {
  if (value === 0) return "Power Automate";
  if (value === 1) return "Power Apps";
  if (value === 2) return "API";
  if (value === 3) return "Copilot Studio";
  return "Unknown source";
}

function parseMessageConsumption(value: unknown): { credits: number | null; feature: string; units: number | null } {
  if (typeof value !== "string" || value.trim().length === 0) return { credits: null, feature: "—", units: null };
  try {
    const eventData = JSON.parse(value) as { messageConsumption?: { consumption?: unknown; featureName?: unknown; units?: unknown } };
    const consumption = eventData.messageConsumption;
    return {
      credits: toNullableNumber(consumption?.consumption),
      feature: toText(consumption?.featureName, "—"),
      units: toNullableNumber(consumption?.units),
    };
  } catch {
    return { credits: null, feature: "—", units: null };
  }
}

function normalizeAiEvent(row: msdyn_aievent): AiEventRecord {
  const messageConsumption = parseMessageConsumption(row.msdyn_eventdata);
  return {
    id: String(row.msdyn_aieventid || ""),
    title: toText(row.msdyn_aimodelidname, toText(row.msdyn_name, "AI Event")),
    configuration: toText(row.msdyn_aiconfigurationidname, "No configuration name"),
    aiBuilderCredits: toNullableNumber(row.msdyn_creditconsumed),
    copilotCredits: messageConsumption.credits,
    copilotFeature: messageConsumption.feature,
    billingUnits: messageConsumption.units,
    processingDate: toDate(row.msdyn_processingdate),
    status: aiEventStatus(row.msdyn_processingstatus),
    source: aiEventSource(row.msdyn_consumptionsource),
    dataType: toText(row.msdyn_datatype, "—"),
    automationName: toText(row.msdyn_automationname, "—"),
    partnerSource: toText(row.msdyn_partnersource, "—"),
    approvalId: toText(row.msdyn_approvalid, "—"),
    quickTest: row.msdyn_quicktest === 1 ? "Yes" : row.msdyn_quicktest === 0 ? "No" : "—",
  };
}

async function queryRelatedAiEvents(
  dataApi: GeneratedComponentProps["dataApi"],
  traceIds: string[],
): Promise<AiEventRecord[]> {
  if (traceIds.length === 0) return [];
  const filter = traceIds.map((traceId) => `contains(msdyn_datainfo,'${traceId}')`).join(" or ");
  const options = {
    select: [
      "msdyn_aieventid",
      "msdyn_name",
      "msdyn_creditconsumed",
      "msdyn_eventdata",
      "msdyn_processingdate",
      "msdyn_processingstatus",
      "msdyn_consumptionsource",
      "msdyn_datatype",
      "msdyn_automationname",
      "msdyn_partnersource",
      "msdyn_approvalid",
      "msdyn_quicktest",
      "_msdyn_aiconfigurationid_value",
      "_msdyn_aimodelid_value",
    ],
    filter,
    orderBy: "msdyn_processingdate desc",
    pageSize: 100,
  };
  let result = await dataApi.queryTable("msdyn_aievent", options);
  const records: msdyn_aievent[] = [...result.rows];
  while (result.hasMoreRows && result.loadMoreRows) {
    result = await result.loadMoreRows();
    records.push(...result.rows);
  }
  return records
    .map(normalizeAiEvent)
    .filter((event, index, events) => !!event.id && events.findIndex((candidate) => candidate.id === event.id) === index);
}

function stripInternalTrace(value: string): string {
  return value
    .replace(/\[\[trace:[0-9a-f-]{36}\]\]\s*(?:\(internal correlation id[^\n]*\))?\s*/gi, "")
    .trim();
}

function decodeJsonStringFragment(value: string): string {
  let fragment = value;
  while (fragment.endsWith("\\")) fragment = fragment.slice(0, -1);
  try {
    return JSON.parse(`"${fragment}"`) as string;
  } catch {
    return fragment
      .replace(/\\u([0-9a-f]{4})/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function extractAiEventInput(value: unknown): { text: string; truncated: boolean } {
  if (typeof value !== "string" || value.trim().length === 0) return { text: "No input captured.", truncated: false };
  try {
    const parsed = JSON.parse(value) as { prompt_20text?: unknown };
    if (typeof parsed.prompt_20text === "string") {
      return { text: stripInternalTrace(parsed.prompt_20text) || "No input captured.", truncated: false };
    }
  } catch {
    // Dataverse truncates long msdyn_datainfo values at 4,000 characters, so
    // otherwise-valid JSON may be missing its closing quote and brace.
  }

  const promptPrefix = '"prompt_20text":"';
  const promptStart = value.indexOf(promptPrefix);
  if (promptStart < 0) return { text: stripInternalTrace(value) || "No input captured.", truncated: false };
  let fragment = value.slice(promptStart + promptPrefix.length);
  const complete = fragment.endsWith('"}');
  if (complete) fragment = fragment.slice(0, -2);
  return {
    text: stripInternalTrace(decodeJsonStringFragment(fragment)) || "No input captured.",
    truncated: !complete,
  };
}

function formatAiEventOutput(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "No output captured.";
  const text = value.trim();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function queryAiEventContent(
  dataApi: GeneratedComponentProps["dataApi"],
  eventId: string,
): Promise<{ input: string; inputTruncated: boolean; output: string }> {
  const record = await dataApi.retrieveRow("msdyn_aievent", {
    id: eventId,
    select: ["msdyn_datainfo", "msdyn_output"],
  });
  const input = extractAiEventInput(record.msdyn_datainfo);
  return {
    input: input.text,
    inputTruncated: input.truncated,
    output: formatAiEventOutput(record.msdyn_output),
  };
}

function formatCredits(value: number | null): string {
  if (value === null) return "Pending";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function creditMeterLabel(meter: CreditMeter): string {
  if (meter === "copilot") return "Copilot Credits";
  if (meter === "aiBuilder") return "AI Builder Credits";
  return "Cost";
}

function creditMeterNoun(meter: CreditMeter): string {
  return meter === "currency" ? "cost" : "credits";
}

function formatMeterValue(value: number | null, meter: CreditMeter, settings: CostSettings): string {
  if (value === null) return "Pending";
  if (meter === "currency") {
    const amount = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
    return `${settings.currencySymbol}${amount}`;
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function formatTimestamp(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}

function aggregateOperations(rows: CostRow[]): OperationTotal[] {
  const grouped = new Map<string, OperationTotal>();
  rows.forEach((row) => {
    const key = row.operationType;
    const current = grouped.get(key) || { operationType: key, credits: 0, count: 0 };
    current.count += 1;
    current.credits += row.credits || 0;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.credits - a.credits || b.count - a.count);
}

function buildSharedOperationCategories(rows: CostRow[], limit = 6): SharedOperationCategory[] {
  const operations = aggregateOperations(rows);
  const top = operations.slice(0, limit).map((item, index) => ({
    key: item.operationType,
    label: item.operationType,
    credits: item.credits,
    count: item.count,
    members: [item.operationType],
    colorIndex: index,
  }));
  const remaining = operations.slice(limit);
  if (remaining.length === 0) return top;
  return [
    ...top,
    {
      key: "Other",
      label: "Other",
      credits: d3.sum(remaining, (item) => item.credits),
      count: d3.sum(remaining, (item) => item.count),
      members: remaining.map((item) => item.operationType),
      colorIndex: top.length,
    },
  ];
}

function projectSharedCategories(base: SharedOperationCategory[], rows: CostRow[]): SharedOperationCategory[] {
  return base.map((category) => {
    const matching = rows.filter((row) => category.members.includes(row.operationType));
    return {
      ...category,
      credits: d3.sum(matching, (row) => row.credits || 0),
      count: matching.length,
    };
  });
}

function isOperationCategorySelected(filter: AnalysisFilter, category: SharedOperationCategory): boolean {
  if (filter?.dimension !== "operation") return false;
  if (filter.key === category.key) return true;
  if (category.members.includes(filter.key)) return true;
  return !!filter.members?.some((member) => category.members.includes(member));
}

function filterCostRows(
  rows: CostRow[],
  filter: AnalysisFilter,
  bounds: PeriodBounds,
  previousPeriod: boolean,
): CostRow[] {
  if (!filter) return rows;
  if (filter.dimension === "operation") {
    const members = filter.members || [filter.key];
    return rows.filter((row) => members.includes(row.operationType));
  }
  if (filter.dimension === "user") {
    return rows.filter((row) => row.userId === filter.key);
  }
  if (!bounds.currentStart) return rows.filter((row) => !!row.timestamp && dateKey(row.timestamp) === filter.key);

  const selectedCurrentDate = new Date(`${filter.key}T00:00:00`);
  if (Number.isNaN(selectedCurrentDate.getTime())) return rows;
  let targetDate = selectedCurrentDate;
  if (previousPeriod && bounds.previousStart) {
    const dayOffset = Math.round((selectedCurrentDate.getTime() - bounds.currentStart.getTime()) / 86400000);
    targetDate = new Date(bounds.previousStart);
    targetDate.setDate(targetDate.getDate() + dayOffset);
  }
  const targetKey = dateKey(targetDate);
  return rows.filter((row) => !!row.timestamp && dateKey(row.timestamp) === targetKey);
}

function buildDistribution(rows: CostRow[], dimension: AnalysisDimension, totalCredits: number): DistributionBucket[] {
  const grouped = d3.group(rows, (row) => dimension === "operation" ? row.operationType : row.userId);
  const buckets: DistributionBucket[] = [];

  grouped.forEach((groupRows, key) => {
    const measured = groupRows.filter((row) => row.credits !== null);
    const total = d3.sum(measured, (row) => row.credits as number);
    // Distribution stats (min/max/average/median) describe ACTUAL consumption of
    // the currently selected credit meter, so they must exclude rows that did not
    // consume it (credits === 0 — for example an AI Builder-billed turn while the
    // Copilot meter is selected). Including those collapses the minimum to a
    // misleading 0. Total and share keep every measured row so cost accounting
    // stays exact.
    const consuming = measured.filter((row) => (row.credits as number) > 0);
    const consumingCredits = consuming.map((row) => row.credits as number);
    // Statistical samples prefer clean single-operation turns; shared rows stay
    // in total/share so total cost accounting stays exact.
    const soleCredits = consuming
      .filter((row) => row.allocationMethod === "sole")
      .map((row) => row.credits as number);
    const samples = soleCredits.length > 0 ? soleCredits : consumingCredits;
    const label = dimension === "operation"
      ? groupRows[0]?.operationType || "(unassigned)"
      : groupRows[0]?.userName || "Unattributed user";

    buckets.push({
      key,
      label,
      total,
      max: d3.max(samples) || 0,
      min: d3.min(samples) || 0,
      average: d3.mean(samples) || 0,
      median: d3.median(samples) || 0,
      share: totalCredits > 0 ? total / totalCredits : 0,
      count: groupRows.length,
      cleanSampleCount: soleCredits.length,
    });
  });

  return buckets;
}

function aggregateDailyValues(rows: CostRow[], topTypes: string[]): Map<string, { values: Record<string, number>; total: number }> {
  const grouped = new Map<string, { values: Record<string, number>; total: number }>();
  rows.forEach((row) => {
    if (!row.timestamp || row.credits === null) return;
    const day = new Date(row.timestamp);
    day.setHours(0, 0, 0, 0);
    const key = dateKey(day);
    const operationType = topTypes.includes(row.operationType) ? row.operationType : "Other";
    const point = grouped.get(key) || { values: {}, total: 0 };
    point.values[operationType] = (point.values[operationType] || 0) + row.credits;
    point.total += row.credits;
    grouped.set(key, point);
  });
  return grouped;
}

function buildComparisonDaily(
  currentRows: CostRow[],
  previousRows: CostRow[],
  topTypes: string[],
  bounds: PeriodBounds,
): DailyPoint[] {
  const current = aggregateDailyValues(currentRows, topTypes);
  const previous = aggregateDailyValues(previousRows, topTypes);

  if (bounds.days && bounds.currentStart && bounds.previousStart) {
    return Array.from({ length: bounds.days }, (_unused, index) => {
      const currentDate = new Date(bounds.currentStart as Date);
      currentDate.setDate(currentDate.getDate() + index);
      const previousDate = new Date(bounds.previousStart as Date);
      previousDate.setDate(previousDate.getDate() + index);
      const currentPoint = current.get(dateKey(currentDate));
      const previousPoint = previous.get(dateKey(previousDate));
      return {
        date: currentDate,
        values: currentPoint?.values || {},
        total: currentPoint?.total || 0,
        previousTotal: previousPoint?.total || 0,
      };
    });
  }

  return Array.from(current.entries())
    .map(([key, point]) => ({ date: new Date(`${key}T00:00:00`), values: point.values, total: point.total, previousTotal: 0 }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function computeFindings(rows: CostRow[], operations: OperationTotal[], totalCredits: number, format: (value: number | null) => string, noun: string): Finding[] {
  if (rows.length === 0) {
    return [{ id: "empty", intent: "info", title: "No cost records", body: "No Agent Log records were found for this period." }];
  }

  const findings: Finding[] = [];
  const pending = rows.filter((row) => row.credits === null).length;
  const pendingRate = pending / rows.length;
  findings.push({
    id: "pending",
    intent: pendingRate > 0.2 ? "error" : pendingRate >= 0.05 ? "warning" : pending > 0 ? "info" : "success",
    title: pending === 0 ? "Credit matching is complete" : `${pending} operation${pending === 1 ? "" : "s"} awaiting credits`,
    body: pending === 0
      ? "Every operation in this period has matched AI Event credit data."
      : `${Math.round(pendingRate * 100)}% of operations have not yet been matched to AI Event credits.`,
  });

  const credits = rows.map((row) => row.credits).filter((value): value is number => value !== null);
  const mean = d3.mean(credits) || 0;
  const deviation = d3.deviation(credits) || 0;
  const threshold = mean + 2 * deviation;
  const outliers = deviation > 0 ? credits.filter((value) => value > threshold) : [];
  findings.push({
    id: "outliers",
    intent: outliers.length > 0 ? "warning" : "success",
    title: outliers.length > 0 ? `${outliers.length} high-cost outlier${outliers.length === 1 ? "" : "s"}` : "No statistical cost outliers",
    body: outliers.length > 0
      ? `The highest outlier consumed ${format(d3.max(outliers) || 0)} ${noun}; the review threshold is ${format(threshold)}.`
      : "No operation exceeds two standard deviations above the period average.",
  });

  const top = operations[0];
  const share = top && totalCredits > 0 ? top.credits / totalCredits : 0;
  findings.push({
    id: "concentration",
    intent: share > 0.6 ? "warning" : "success",
    title: share > 0.6 ? "Cost concentration needs review" : "Cost mix is diversified",
    body: top
      ? `${top.operationType} accounts for ${Math.round(share * 100)}% of measured ${noun} in this period.`
      : "No measured operation-type costs are available.",
  });

  return findings;
}

function KpiCard(props: {
  icon: JSX.Element;
  title: string;
  value: string;
  hint: string;
  badge?: { text: string; color: "informative" | "warning" | "danger" | "success" };
}) {
  const styles = useStyles();
  return (
    <Card className={styles.kpiCard} aria-label={`${props.title}: ${props.value}`}>
      <CardHeader
        image={<span className={styles.kpiIcon} aria-hidden="true">{props.icon}</span>}
        header={<Text weight="semibold">{props.title}</Text>}
        action={props.badge ? <Badge color={props.badge.color}>{props.badge.text}</Badge> : undefined}
      />
      <div className={styles.kpiContent}>
        <Text className={styles.kpiValue}>{props.value}</Text>
        <Text size={200} className={styles.kpiHint}>{props.hint}</Text>
      </div>
    </Card>
  );
}

function LoadingDashboard() {
  const styles = useStyles();
  return (
    <div className={styles.skeletonGrid} aria-label="Loading AI cost data">
      {[0, 1, 2, 3].map((item) => (
        <Skeleton key={item}>
          <SkeletonItem shape="rectangle" size={128} />
        </Skeleton>
      ))}
    </div>
  );
}

function CreditTrendChart(props: {
  rows: CostRow[];
  previousRows: CostRow[];
  categories: SharedOperationCategory[];
  range: RangeKey;
  selectedDate: string | null;
  onSelectDate: (date: Date) => void;
  format: (value: number | null) => string;
  noun: string;
}) {
  const styles = useStyles();
  const [activeDay, setActiveDay] = useState<DailyPoint | null>(null);
  const topTypes = props.categories.filter((item) => item.key !== "Other").map((item) => item.key);
  const bounds = useMemo(() => getPeriodBounds(props.range), [props.range]);
  const daily = useMemo(
    () => buildComparisonDaily(props.rows, props.previousRows, topTypes, bounds),
    [props.rows, props.previousRows, topTypes.join("|"), props.range],
  );
  const seriesKeys = props.categories.map((item) => item.key);

  if (daily.length === 0 || (d3.sum(daily, (point) => point.total) === 0 && d3.sum(daily, (point) => point.previousTotal) === 0)) {
    return <div className={styles.empty}><DataTrendingRegular fontSize={28} /><Text>{`No measured ${props.noun} for this period.`}</Text></div>;
  }

  const width = 760;
  const height = 260;
  const margin = { top: 20, right: 20, bottom: 42, left: 56 };
  const x = d3.scaleTime()
    .domain(d3.extent(daily, (point) => point.date) as [Date, Date])
    .range([margin.left, width - margin.right]);
  const stackInput = daily.map((point) => {
    const item: Record<string, number | Date> = { date: point.date };
    seriesKeys.forEach((key) => { item[key] = point.values[key] || 0; });
    return item;
  });
  const stack = d3.stack<Record<string, number | Date>>().keys(seriesKeys).value((item, key) => Number(item[key]) || 0);
  const layers = stack(stackInput);
  const dataMaxY = Math.max(
    d3.max(layers, (layer) => d3.max(layer, (entry) => entry[1])) || 0,
    d3.max(daily, (point) => point.previousTotal) || 0,
  );
  // Scale the axis to the actual data range so small-magnitude series (for
  // example per-day currency costs of a few cents, or fractional Copilot
  // credits) still reveal their shape instead of being flattened against a
  // fixed floor. Fall back to 1 only when there is genuinely no measured value.
  const maxY = dataMaxY > 0 ? dataMaxY : 1;
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([height - margin.bottom, margin.top]);
  const area = d3.area<d3.SeriesPoint<Record<string, number | Date>>>()
    .x((entry) => x(entry.data.date as Date))
    .y0((entry) => y(entry[0]))
    .y1((entry) => y(entry[1]))
    .curve(d3.curveMonotoneX);
  const previousLine = d3.line<DailyPoint>()
    .x((point) => x(point.date))
    .y((point) => y(point.previousTotal))
    .curve(d3.curveMonotoneX);
  // On short ranges, time-scale interpolation can emit multiple ticks within
  // the same calendar day (for example Jul 12 at 00:00 and 12:00), producing
  // duplicate labels. Use the actual daily buckets until the series is dense.
  const xTicks = daily.length <= 7 ? daily.map((point) => point.date) : x.ticks(6);
  const yTicks = y.ticks(5);
  const hitWidth = Math.max(16, (width - margin.left - margin.right) / Math.max(daily.length, 1));

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily credit trend across ${daily.length} day${daily.length === 1 ? "" : "s"}`}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={tokens.colorNeutralStroke2} />
            <text x={margin.left - 10} y={y(tick) + 4} textAnchor="end" fill={tokens.colorNeutralForeground3} fontSize="11">{props.format(tick)}</text>
          </g>
        ))}
        {layers.map((layer, index) => (
          <path
            key={layer.key}
            d={area(layer) || undefined}
            fill={CHART_COLORS[(props.categories.find((item) => item.key === layer.key)?.colorIndex ?? index) % CHART_COLORS.length]}
            fillOpacity={0.72}
            stroke={CHART_COLORS[(props.categories.find((item) => item.key === layer.key)?.colorIndex ?? index) % CHART_COLORS.length]}
            strokeWidth={1.5}
          >
            <title>{layer.key}</title>
          </path>
        ))}
        {bounds.days && (
          <path
            d={previousLine(daily) || undefined}
            fill="none"
            stroke={tokens.colorNeutralForeground3}
            strokeWidth={2}
            strokeDasharray="7 6"
            aria-label="Previous period total credit curve"
          />
        )}
        {xTicks.map((tick) => (
          <text key={tick.toISOString()} x={x(tick)} y={height - 14} textAnchor="middle" fill={tokens.colorNeutralForeground3} fontSize="11">{formatShortDate(tick)}</text>
        ))}
        {daily.map((point) => (
          <rect
            key={point.date.toISOString()}
            x={x(point.date) - hitWidth / 2}
            y={margin.top}
            width={hitWidth}
            height={height - margin.top - margin.bottom}
            fill={props.selectedDate === dateKey(point.date) ? tokens.colorBrandBackground2 : "transparent"}
            fillOpacity={props.selectedDate === dateKey(point.date) ? 0.35 : 1}
            tabIndex={point.total > 0 ? 0 : -1}
            role="button"
            aria-label={`${formatShortDate(point.date)}: ${props.format(point.total)} current ${props.noun}${bounds.days ? `, ${props.format(point.previousTotal)} previous-period ${props.noun}` : ""}${point.total === 0 ? ", no drilldown data" : ""}${props.selectedDate === dateKey(point.date) ? ", selected" : ""}`}
            onMouseEnter={() => setActiveDay(point)}
            onMouseLeave={() => setActiveDay(null)}
            onFocus={() => setActiveDay(point)}
            onBlur={() => setActiveDay(null)}
            onClick={() => { if (point.total > 0) props.onSelectDate(point.date); }}
            onKeyDown={(event) => {
              if (point.total > 0 && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                props.onSelectDate(point.date);
              }
            }}
          />
        ))}
      </svg>
      <div className={styles.chartReadout} aria-live="polite">
        <Text size={200}>
          {activeDay
            ? `${formatShortDate(activeDay.date)} · ${props.format(activeDay.total)} current ${props.noun}${bounds.days ? ` · ${props.format(activeDay.previousTotal)} previous-period ${props.noun}` : ""}`
            : bounds.days ? "Focus, hover, or select a day to compare and drill down." : "Prior-period comparison is unavailable for All time. Select a day to drill down."}
        </Text>
      </div>
    </div>
  );
}

function CostDonutChart(props: {
  categories: SharedOperationCategory[];
  totalCredits: number;
  selected: AnalysisFilter;
  onSelect: (filter: AnalysisFilter) => void;
  format: (value: number | null) => string;
  noun: string;
}) {
  const styles = useStyles();
  const data = props.categories.filter((item) => item.credits > 0);

  if (data.length === 0 || props.totalCredits === 0) {
    return <div className={styles.empty}><MoneyRegular fontSize={28} /><Text>No measured operation costs.</Text></div>;
  }

  const width = 420;
  const height = 300;
  const centerX = 210;
  const centerY = 140;
  const pie = d3.pie<SharedOperationCategory>().sort(null).value((item) => item.credits);
  const arcs = pie(data);
  const arc = d3.arc<d3.PieArcDatum<SharedOperationCategory>>().innerRadius(70).outerRadius(112).cornerRadius(5).padAngle(0.02);

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Total credit share by operation type">
        <g transform={`translate(${centerX},${centerY})`}>
          {arcs.map((slice) => {
            const selected = props.selected?.source === "donut" && isOperationCategorySelected(props.selected, slice.data);
            const share = props.totalCredits > 0 ? slice.data.credits / props.totalCredits : 0;
            return (
              <path
                key={slice.data.key}
                d={arc(slice) || undefined}
                fill={CHART_COLORS[slice.data.colorIndex % CHART_COLORS.length]}
                opacity={selected || props.selected === null || props.selected.dimension !== "operation" ? 1 : 0.35}
                stroke={tokens.colorNeutralBackground1}
                strokeWidth={2}
                role="button"
                tabIndex={0}
                aria-label={`${slice.data.label}: ${props.format(slice.data.credits)} ${props.noun}, ${Math.round(share * 100)} percent${selected ? ", selected" : ""}`}
                onClick={() => props.onSelect(selected ? null : { dimension: "operation", key: slice.data.key, label: slice.data.label, source: "donut", members: slice.data.members })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    props.onSelect(selected ? null : { dimension: "operation", key: slice.data.key, label: slice.data.label, source: "donut", members: slice.data.members });
                  }
                }}
              >
                <title>{`${slice.data.label}: ${props.format(slice.data.credits)} ${props.noun} (${Math.round(share * 100)}%)`}</title>
              </path>
            );
          })}
          <text textAnchor="middle" y={-8} fill={tokens.colorNeutralForeground3} fontSize="12">Selected-period cost</text>
          <text textAnchor="middle" y={18} fill={tokens.colorNeutralForeground1} fontSize="24" fontWeight="700">{props.format(props.totalCredits)}</text>
          <text textAnchor="middle" y={38} fill={tokens.colorNeutralForeground3} fontSize="11">{props.noun}</text>
        </g>
      </svg>
      <div className={styles.analysisCaption}><Text size={200}>Select a segment to drill into matching Agent Log records.</Text></div>
    </div>
  );
}

function SharedOperationLegend(props: {
  categories: SharedOperationCategory[];
  totalCredits: number;
  hasPreviousPeriod: boolean;
  selected: AnalysisFilter;
  onSelect: (filter: AnalysisFilter) => void;
}) {
  const styles = useStyles();
  return (
    <div className={styles.sharedLegend} aria-label="Shared operation type legend">
      {props.categories.filter((item) => item.credits > 0).map((item) => {
        const selected = isOperationCategorySelected(props.selected, item);
        const share = props.totalCredits > 0 ? item.credits / props.totalCredits : 0;
        return (
          <Button
            key={item.key}
            size="small"
            appearance={selected ? "secondary" : "subtle"}
            aria-pressed={selected}
            aria-label={`${selected ? "Clear" : "Filter by"} ${item.label}, ${Math.round(share * 100)} percent of cost`}
            onClick={() => props.onSelect(selected ? null : { dimension: "operation", key: item.key, label: item.label, source: "legend", members: item.members })}
          >
            <svg className={styles.sharedLegendSwatch} width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill={CHART_COLORS[item.colorIndex % CHART_COLORS.length]} /></svg>
            {item.label} · {Math.round(share * 100)}%
          </Button>
        );
      })}
      {props.hasPreviousPeriod && (
        <span className={styles.legendItem}>
          <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={tokens.colorNeutralForeground3} strokeWidth="2" strokeDasharray="5 4" /></svg>
          <Text size={200}>Previous period total</Text>
        </span>
      )}
    </div>
  );
}

function BarCandlestickChart(props: {
  rows: CostRow[];
  totalCredits: number;
  operationCategories: SharedOperationCategory[];
  dimension: AnalysisDimension;
  selected: AnalysisFilter;
  onDimensionChange: (dimension: AnalysisDimension) => void;
  onSelect: (filter: AnalysisFilter) => void;
  format: (value: number | null) => string;
  noun: string;
}) {
  const styles = useStyles();
  // The chart already draws every statistic simultaneously (total column plus
  // min/max/average/median candlestick), so there is no metric to "pick". Columns
  // are sorted by total cost — the most meaningful ordering for a cost view — and
  // capped at the ten largest so the axis stays readable.
  const data = buildDistribution(props.rows, props.dimension, props.totalCredits)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const width = 940;
  const height = 410;
  const margin = { top: 42, right: 64, bottom: 112, left: 58 };
  const x = d3.scaleBand<string>()
    .domain(data.map((item) => item.key))
    .range([margin.left, width - margin.right])
    .padding(0.3);
  const maxTotal = d3.max(data, (item) => item.total) || 1;
  const maxStat = d3.max(data, (item) => item.max) || 1;
  const yTotal = d3.scaleLinear().domain([0, maxTotal]).nice().range([height - margin.bottom, margin.top]);
  const yStat = d3.scaleLinear().domain([0, maxStat]).nice().range([height - margin.bottom, margin.top]);
  const totalTicks = yTotal.ticks(5);
  const statTicks = yStat.ticks(5);

  return (
    <div>
      <div className={styles.analysisToolbar}>
        <div className={styles.controlRow}>
          <Text size={200} className={styles.controlLabel}>Group by</Text>
          <div className={styles.controlGroup} role="group" aria-label="Cost analysis dimension">
            <Button size="small" appearance={props.dimension === "operation" ? "primary" : "secondary"} aria-pressed={props.dimension === "operation"} onClick={() => props.onDimensionChange("operation")}>Operation type</Button>
            <Button size="small" appearance={props.dimension === "user" ? "primary" : "secondary"} aria-pressed={props.dimension === "user"} onClick={() => props.onDimensionChange("user")}>User</Button>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className={styles.empty}><MoneyRegular fontSize={28} /><Text>No cost distribution data for this period.</Text></div>
      ) : (
        <div className={styles.chartWrap}>
          <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Total ${props.noun} with per-operation minimum, maximum, average, and median by ${props.dimension === "operation" ? "operation type" : "user"}, sorted by total cost`}>
            {totalTicks.map((tick) => (
              <g key={`total-${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={yTotal(tick)} y2={yTotal(tick)} stroke={tokens.colorNeutralStroke2} />
                <text x={margin.left - 9} y={yTotal(tick) + 4} textAnchor="end" fill={tokens.colorNeutralForeground3} fontSize="11">{tick}</text>
              </g>
            ))}
            <text x={margin.left} y={18} fill={tokens.colorNeutralForeground3} fontSize="11">{`Total ${props.noun}`}</text>
            <text x={width - margin.right} y={18} textAnchor="end" fill={tokens.colorNeutralForeground3} fontSize="11">{`Per-operation ${props.noun}`}</text>
            {statTicks.map((tick) => (
              <text key={`stat-${tick}`} x={width - margin.right + 8} y={yStat(tick) + 4} fill={tokens.colorNeutralForeground3} fontSize="10">{tick}</text>
            ))}
            {data.map((item, index) => {
              const xStart = x(item.key) || 0;
              const bandWidth = x.bandwidth();
              const center = xStart + bandWidth / 2;
              const selected = props.selected?.source === "distribution" && props.selected.dimension === props.dimension && props.selected.key === item.key;
              const operationCategory = props.dimension === "operation"
                ? props.operationCategories.find((category) => category.members.includes(item.key))
                : undefined;
              const colorIndex = operationCategory?.colorIndex ?? index;
              return (
                <g
                  key={item.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.label}: total ${props.format(item.total)} ${props.noun}, ${Math.round(item.share * 100)} percent of cost, ${item.count} operations, average ${props.format(item.average)}, median ${props.format(item.median)}${selected ? ", selected" : ""}`}
                  onClick={() => props.onSelect(selected ? null : { dimension: props.dimension, key: item.key, label: item.label, source: "distribution" })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onSelect(selected ? null : { dimension: props.dimension, key: item.key, label: item.label, source: "distribution" });
                    }
                  }}
                >
                  <rect
                    x={xStart}
                    y={yTotal(item.total)}
                    width={bandWidth}
                    height={height - margin.bottom - yTotal(item.total)}
                    rx={7}
                    fill={CHART_COLORS[colorIndex % CHART_COLORS.length]}
                    fillOpacity={selected || props.selected === null || props.selected.dimension !== props.dimension ? 0.6 : 0.22}
                  />
                  <line x1={center} x2={center} y1={yStat(item.max)} y2={yStat(item.min)} stroke={tokens.colorNeutralForeground1} strokeWidth={2.2} />
                  <line x1={center - 9} x2={center + 9} y1={yStat(item.max)} y2={yStat(item.max)} stroke={tokens.colorNeutralForeground1} strokeWidth={2.2} />
                  <line x1={center - 9} x2={center + 9} y1={yStat(item.min)} y2={yStat(item.min)} stroke={tokens.colorNeutralForeground1} strokeWidth={2.2} />
                  <circle cx={center} cy={yStat(item.average)} r={5} fill={tokens.colorBrandBackground} stroke={tokens.colorNeutralBackground1} strokeWidth={2} />
                  <line x1={center - 12} x2={center + 12} y1={yStat(item.median)} y2={yStat(item.median)} stroke={tokens.colorPaletteDarkOrangeForeground1} strokeWidth={3.5} />
                  <text x={center} y={Math.max(30, yTotal(item.total) - 8)} textAnchor="middle" fill={tokens.colorNeutralForeground1} fontSize="10" fontWeight="600">{props.format(item.total)}</text>
                  <text transform={`translate(${center},${height - margin.bottom + 20}) rotate(-36)`} textAnchor="end" fill={tokens.colorNeutralForeground2} fontSize="11">{item.label}</text>
                  <title>{`${item.label} — total ${props.format(item.total)}; max ${props.format(item.max)}; min ${props.format(item.min)}; average ${props.format(item.average)}; median ${props.format(item.median)}; share ${Math.round(item.share * 100)}%; count ${item.count}`}</title>
                </g>
              );
            })}
          </svg>
          <div className={styles.chartLegend} aria-label="Column and candlestick legend">
            <span className={styles.legendItem}><svg width="16" height="12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2" fill="#8064e8" opacity="0.6" /></svg><Text size={200}>{`Total ${props.noun} (left axis)`}</Text></span>
            <span className={styles.legendItem}><svg width="16" height="14" aria-hidden="true"><line x1="8" x2="8" y1="1" y2="13" stroke="#242424" strokeWidth="2" /><line x1="3" x2="13" y1="1" y2="1" stroke="#242424" strokeWidth="2" /><line x1="3" x2="13" y1="13" y2="13" stroke="#242424" strokeWidth="2" /></svg><Text size={200}>Min–max (right axis)</Text></span>
            <span className={styles.legendItem}><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#0f6cbd" /></svg><Text size={200}>Average</Text></span>
            <span className={styles.legendItem}><svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" stroke="#ca5010" strokeWidth="4" /></svg><Text size={200}>Median</Text></span>
          </div>
          <Text size={200} className={styles.analysisCaption}>
            Columns show total measured cost; candlesticks show sole-operation min/max, average, and median where available. Share and operation count appear on hover.
            {props.dimension === "user" ? " Showing the ten highest-cost users." : " Select a column to filter the Agent Log grid."}
          </Text>
        </div>
      )}
    </div>
  );
}

function compareNullableNumbers(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareDates(a: Date | null, b: Date | null): number {
  return (a?.getTime() || 0) - (b?.getTime() || 0);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function agentLogGroupIdentity(row: CostRow, groupBy: AgentLogGroupBy): { key: string; label: string } {
  if (groupBy === "user") return { key: row.userId, label: row.userName };
  if (groupBy === "agent") return { key: row.agentName.toLocaleLowerCase(), label: row.agentName };
  if (groupBy === "operation") return { key: row.operationType.toLocaleLowerCase(), label: row.operationType };
  return { key: "all", label: "All Agent Log records" };
}

function buildAgentLogGroups(rows: CostRow[], groupBy: AgentLogGroupBy): AgentLogGroup[] {
  const groups = new Map<string, AgentLogGroup>();
  rows.forEach((row) => {
    const identity = agentLogGroupIdentity(row, groupBy);
    const group = groups.get(identity.key) || {
      key: identity.key,
      label: identity.label,
      rows: [],
      totalCredits: 0,
      pendingCount: 0,
    };
    group.rows.push(row);
    group.totalCredits += row.credits || 0;
    if (row.credits === null) group.pendingCount += 1;
    groups.set(identity.key, group);
  });
  const result = Array.from(groups.values());
  if (groupBy === "none") return result;
  return result.sort((a, b) => b.totalCredits - a.totalCredits || compareText(a.label, b.label));
}

function paginateAgentLogGroups(groups: AgentLogGroup[], start: number, end: number): VisibleAgentLogGroup[] {
  const visible: VisibleAgentLogGroup[] = [];
  let offset = 0;
  groups.forEach((group) => {
    const groupStart = offset;
    const groupEnd = offset + group.rows.length;
    const sliceStart = Math.max(start, groupStart) - groupStart;
    const sliceEnd = Math.min(end, groupEnd) - groupStart;
    if (sliceStart < sliceEnd) {
      visible.push({ ...group, visibleRows: group.rows.slice(sliceStart, sliceEnd) });
    }
    offset = groupEnd;
  });
  return visible;
}

function tableCell(value: string, delimiter: string): string {
  let cell = value ?? "";
  // Neutralize CSV / Excel formula injection — query text is untrusted content.
  if (/^[=+\-@\t\r]/.test(cell)) cell = "'" + cell;
  if (cell.includes(delimiter) || /["\r\n]/.test(cell)) cell = '"' + cell.replace(/"/g, '""') + '"';
  return cell;
}

// Full-fidelity Agent Log export: every dimension plus BOTH raw credit meters and
// the settings-derived cost, so a user can pivot/aggregate freely in Excel. A tab
// delimiter pastes straight into Excel columns.
function buildAgentLogTable(rows: CostRow[], settings: CostSettings, delimiter: string): string {
  const headers = [
    "Timestamp",
    "Agent",
    "User",
    "User ID",
    "Operation type",
    "Operation index",
    "Allocation",
    "Turn / operation ID",
    "Session ID",
    "Query / description",
    "Source description",
    "AI Builder Credits",
    "Copilot Credits",
    `Cost (${settings.currencySymbol})`,
  ];
  const body = rows.map((row) => {
    const hasCost = row.aiBuilderCredits !== null || row.copilotCredits !== null;
    const cost = (row.aiBuilderCredits ?? 0) * settings.aiBuilderUnitCost + (row.copilotCredits ?? 0) * settings.copilotUnitCost;
    return [
      row.timestamp ? row.timestamp.toISOString() : "",
      row.agentName,
      row.userName,
      row.userId,
      row.operationType,
      row.operationIndex === null ? "" : String(row.operationIndex),
      row.allocationMethod,
      row.logName,
      row.sessionId,
      row.queryText,
      row.sourceDescription,
      row.aiBuilderCredits === null ? "" : String(row.aiBuilderCredits),
      row.copilotCredits === null ? "" : String(row.copilotCredits),
      hasCost ? cost.toFixed(4) : "",
    ].map((cell) => tableCell(cell, delimiter)).join(delimiter);
  });
  return [headers.map((cell) => tableCell(cell, delimiter)).join(delimiter), ...body].join("\r\n");
}

function buildGridColumns(meter: CreditMeter, settings: CostSettings): TableColumnDefinition<CostRow>[] {
  return [
    createTableColumn<CostRow>({
      columnId: "timestamp",
      compare: (a, b) => compareDates(a.timestamp, b.timestamp),
      renderHeaderCell: () => "Timestamp",
      renderCell: (item) => formatTimestamp(item.timestamp),
    }),
    createTableColumn<CostRow>({
      columnId: "agentName",
      compare: (a, b) => compareText(a.agentName, b.agentName),
      renderHeaderCell: () => "Agent",
      renderCell: (item) => item.agentName,
    }),
    createTableColumn<CostRow>({
      columnId: "userName",
      compare: (a, b) => compareText(a.userName, b.userName),
      renderHeaderCell: () => "User",
      renderCell: (item) => item.userName,
    }),
    createTableColumn<CostRow>({
      columnId: "operationType",
      compare: (a, b) => compareText(a.operationType, b.operationType),
      renderHeaderCell: () => "Operation type",
      renderCell: (item) => item.operationType,
    }),
    createTableColumn<CostRow>({
      columnId: "logName",
      compare: (a, b) => compareText(a.logName, b.logName),
      renderHeaderCell: () => "Turn / operation ID",
      renderCell: (item) => item.logName,
    }),
    createTableColumn<CostRow>({
      columnId: "queryText",
      compare: (a, b) => compareText(a.queryText, b.queryText),
      renderHeaderCell: () => "Query / description",
      renderCell: (item) => <span title={item.queryText}>{item.queryText}</span>,
    }),
    createTableColumn<CostRow>({
      columnId: "credits",
      compare: (a, b) => compareNullableNumbers(a.credits, b.credits),
      renderHeaderCell: () => creditMeterLabel(meter),
      renderCell: (item) => formatMeterValue(item.credits, meter, settings),
    }),
    createTableColumn<CostRow>({
      columnId: "allocationMethod",
      compare: (a, b) => compareText(a.allocationMethod, b.allocationMethod),
      renderHeaderCell: () => "Allocation",
      renderCell: (item) => item.allocationMethod,
    }),
  ];
}

function AgentLogInlineDetails(props: {
  detailState: DetailState;
  expandedAiEventId: string | null;
  aiEventContentById: Record<string, AiEventContentState>;
  onToggleAiEventDetails: (eventId: string) => void;
}) {
  const styles = useStyles();
  const { detailState } = props;

  if (detailState.loading) {
    return <div className={styles.detailPanel}><Spinner size="small" label="Loading operation and linked AI Event details" /></div>;
  }
  if (detailState.error) {
    return <div className={styles.detailPanel}><MessageBar intent="error"><MessageBarBody>{detailState.error}</MessageBarBody></MessageBar></div>;
  }

  return (
    <div className={styles.detailPanel} aria-live="polite">
      <div className={styles.detailGrid}>
        <div>
          <Text weight="semibold">Source description</Text>
          <div className={styles.detailValue}>{detailState.sourceDescription}</div>
        </div>
        <div>
          <Text weight="semibold">AI Event correlation</Text>
          <div className={styles.detailValue}>
            {detailState.traceCount === null
              ? "Trace metadata could not be read"
              : `${detailState.traceCount} correlation trace${detailState.traceCount === 1 ? "" : "s"}`} · raw trace IDs are hidden
          </div>
        </div>
      </div>

      <section className={styles.aiEventSection} aria-label="Linked AI Event records">
        <div className={styles.aiEventSectionHeader}>
          <Text as="h3" size={400} weight="semibold">Linked AI Events</Text>
          <Text size={200} className={styles.sectionSubtitle}>
            {detailState.aiEvents.length} matched record{detailState.aiEvents.length === 1 ? "" : "s"}
          </Text>
        </div>

        {detailState.aiEventError ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Linked AI Events could not be loaded</MessageBarTitle>
              {detailState.aiEventError}
            </MessageBarBody>
          </MessageBar>
        ) : detailState.aiEvents.length === 0 ? (
          <Text size={200} className={styles.sectionSubtitle}>
            {detailState.traceCount === 0
              ? "This Agent Log record has no AI Event correlation metadata."
              : "No matching AI Event records were found. Matching may still be processing."}
          </Text>
        ) : (
          <div className={styles.aiEventList}>
            {detailState.aiEvents.map((event) => (
              <div key={event.id} className={styles.aiEventItem}>
                <div className={styles.aiEventMain}>
                  <Text weight="semibold">{event.title}</Text>
                  <Text size={200} className={styles.sectionSubtitle}>{event.configuration}</Text>
                  <div className={styles.aiEventFacts}>
                    <Badge color={event.status === "Failed" ? "danger" : event.status === "Processing" ? "warning" : event.status === "Processed" ? "success" : "informative"}>{event.status}</Badge>
                    {event.copilotCredits !== null && <Text size={200}>{formatCredits(event.copilotCredits)} Copilot Credits</Text>}
                    {event.aiBuilderCredits !== null && <Text size={200}>{formatCredits(event.aiBuilderCredits)} AI Builder Credits</Text>}
                    <Text size={200}>{event.source}</Text>
                    <Text size={200}>{formatTimestamp(event.processingDate)}</Text>
                  </div>
                </div>
                <Button
                  className={styles.aiEventLink}
                  appearance="transparent"
                  size="small"
                  aria-expanded={props.expandedAiEventId === event.id}
                  aria-label={`${props.expandedAiEventId === event.id ? "Hide" : "View"} AI Event details for ${event.title}`}
                  onClick={() => props.onToggleAiEventDetails(event.id)}
                >
                  {props.expandedAiEventId === event.id ? "Hide details" : "View details"}
                </Button>
                {props.expandedAiEventId === event.id && (
                  <div className={styles.aiEventExpanded} aria-label={`AI Event record details for ${event.title}`}>
                    {[
                      ["AI Event ID", event.id],
                      ["Status", event.status],
                      ["Copilot Credits", event.copilotCredits === null ? "Not billed on this meter" : formatCredits(event.copilotCredits)],
                      ["AI Builder Credits", event.aiBuilderCredits === null ? "Not billed on this meter" : formatCredits(event.aiBuilderCredits)],
                      ["Copilot billing feature", event.copilotFeature],
                      ["Billing units", event.billingUnits === null ? "—" : formatCredits(event.billingUnits)],
                      ["Processing time", formatTimestamp(event.processingDate)],
                      ["Consumption source", event.source],
                      ["Data type", event.dataType],
                      ["Automation name", event.automationName],
                      ["Partner source", event.partnerSource],
                      ["Approval ID", event.approvalId],
                      ["Quick test", event.quickTest],
                      ["Model", event.title],
                      ["Configuration", event.configuration],
                    ].map(([label, value]) => (
                      <div key={label} className={styles.aiEventField}>
                        <Text size={200} className={styles.aiEventFieldLabel}>{label}</Text>
                        <Text size={200} weight="semibold" className={styles.aiEventFieldValue}>{value}</Text>
                      </div>
                    ))}
                    <div className={styles.aiEventContentGrid}>
                      {props.aiEventContentById[event.id]?.loading ? (
                        <Spinner size="small" label="Loading AI Event input and output" />
                      ) : props.aiEventContentById[event.id]?.error ? (
                        <MessageBar intent="warning">
                          <MessageBarBody>
                            <MessageBarTitle>Input and output could not be loaded</MessageBarTitle>
                            {props.aiEventContentById[event.id].error}
                          </MessageBarBody>
                        </MessageBar>
                      ) : (
                        <>
                          <section className={styles.aiEventContentPanel} aria-label="AI Event input">
                            <div className={styles.aiEventContentHeader}>
                              <Text weight="semibold">Input</Text>
                              {props.aiEventContentById[event.id]?.inputTruncated
                                ? <Badge color="warning">Truncated by Dataverse</Badge>
                                : <Text size={200} className={styles.sectionSubtitle}>Prompt sent to the AI model</Text>}
                            </div>
                            <pre className={styles.aiEventContent}>{props.aiEventContentById[event.id]?.input || "No input captured."}</pre>
                            {props.aiEventContentById[event.id]?.inputTruncated && (
                              <div className={styles.aiEventContentHeader}>
                                <Text size={200} className={styles.sectionSubtitle}>The stored Input reached the AI Event field limit, so only the available prefix is shown.</Text>
                              </div>
                            )}
                          </section>
                          <section className={styles.aiEventContentPanel} aria-label="AI Event output">
                            <div className={styles.aiEventContentHeader}>
                              <Text weight="semibold">Output</Text>
                              <Text size={200} className={styles.sectionSubtitle}>Response returned by the AI model</Text>
                            </div>
                            <pre className={styles.aiEventContent}>{props.aiEventContentById[event.id]?.output || "No output captured."}</pre>
                          </section>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HighCostTable(props: { rows: CostRow[]; totalCredits: number; meter: CreditMeter; settings: CostSettings }) {
  const styles = useStyles();
  const topRows = props.rows
    .filter((row) => row.credits !== null)
    .sort((a, b) => (b.credits || 0) - (a.credits || 0))
    .slice(0, 10);
  const topCredits = d3.sum(topRows, (row) => row.credits || 0);
  const share = props.totalCredits > 0 ? topCredits / props.totalCredits : 0;

  if (topRows.length === 0) {
    return <div className={styles.empty}><MoneyRegular fontSize={28} /><Text>No measured operations in this period.</Text></div>;
  }

  return (
    <>
      <div className={styles.gridScroll}>
        <table className={styles.rankingTable}>
          <thead>
            <tr>
              {["Rank", "Operation type", "Turn / operation ID", creditMeterLabel(props.meter), "Allocation", "Timestamp"].map((heading) => (
                <th key={heading} className={`${styles.rankingHeader} ${heading === creditMeterLabel(props.meter) || heading === "Rank" ? styles.rankingHeaderNumeric : ""}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topRows.map((row, index) => (
              <tr key={row.id}>
                <td className={`${styles.rankingCell} ${styles.rankingCellNumeric}`}>{index + 1}</td>
                <td className={styles.rankingCell}>{row.operationType}</td>
                <td className={styles.rankingCell}>{row.logName}</td>
                <td className={`${styles.rankingCell} ${styles.rankingCellNumeric}`}>{formatMeterValue(row.credits, props.meter, props.settings)}</td>
                <td className={styles.rankingCell}>{row.allocationMethod}</td>
                <td className={`${styles.rankingCell} ${styles.rankingCellNowrap}`}>{formatTimestamp(row.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.concentration}>
        <Text size={200}>Top 10 operations account for {Math.round(share * 100)}% of measured {creditMeterNoun(props.meter)}.</Text>
        <Badge color={share > 0.75 ? "danger" : share > 0.5 ? "warning" : "informative"}>{formatMeterValue(topCredits, props.meter, props.settings)}{props.meter === "currency" ? "" : ` ${creditMeterLabel(props.meter)}`}</Badge>
      </div>
    </>
  );
}

const GeneratedComponent = (props: GeneratedComponentProps) => {
  const styles = useStyles();
  const [range, setRange] = useState<RangeKey>("7d");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pageState, setPageState] = useState<PageState>({ rows: [], previousRows: [], loading: true, error: null, lastRefreshed: null });
  const [search, setSearch] = useState("");
  const [creditMeter, setCreditMeter] = useState<CreditMeter>("copilot");
  const [agentLogGroupBy, setAgentLogGroupBy] = useState<AgentLogGroupBy>("none");
  const [analysisDimension, setAnalysisDimension] = useState<AnalysisDimension>("operation");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ sortColumn: "timestamp", sortDirection: "descending" });
  const [detailState, setDetailState] = useState<DetailState>(emptyDetailState);
  const [expandedAiEventId, setExpandedAiEventId] = useState<string | null>(null);
  const [aiEventContentById, setAiEventContentById] = useState<Record<string, AiEventContentState>>({});
  const [costSettings, setCostSettings] = useState<CostSettings>(loadCostSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [symbolDraft, setSymbolDraft] = useState(costSettings.currencySymbol);
  const [aiBuilderCostDraft, setAiBuilderCostDraft] = useState(String(costSettings.aiBuilderUnitCost));
  const [copilotCostDraft, setCopilotCostDraft] = useState(String(costSettings.copilotUnitCost));
  const [exportNotice, setExportNotice] = useState<{ kind: "copied" | "manual"; count: number; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bounds = getPeriodBounds(range);
        const [rows, previousRows] = await Promise.all([
          queryCostRows(props.dataApi, buildCurrentFilter(bounds)),
          bounds.days ? queryCostRows(props.dataApi, buildPreviousFilter(bounds)) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setPageState({ rows, previousRows, loading: false, error: null, lastRefreshed: new Date() });
        }
      } catch (error) {
        if (!cancelled) {
          setPageState({
            rows: [],
            previousRows: [],
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load Agent Log cost data.",
            lastRefreshed: null,
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // dataApi is supplied by the host and can change object identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setPageState((current) => ({ ...current, loading: true, error: null }));
        setRefreshKey((key) => key + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const currentRows = useMemo(() => projectCreditMeter(pageState.rows, creditMeter, costSettings), [pageState.rows, creditMeter, costSettings]);
  const previousRows = useMemo(() => projectCreditMeter(pageState.previousRows, creditMeter, costSettings), [pageState.previousRows, creditMeter, costSettings]);
  const formatMeter = useMemo(
    () => (value: number | null) => formatMeterValue(value, creditMeter, costSettings),
    [creditMeter, costSettings],
  );
  const meterNoun = creditMeterNoun(creditMeter);
  const totalCredits = useMemo(() => d3.sum(currentRows, (row) => row.credits || 0), [currentRows]);
  const measuredRows = useMemo(() => currentRows.filter((row) => row.credits !== null), [currentRows]);
  const averageCredits = measuredRows.length > 0 ? totalCredits / measuredRows.length : null;
  const pendingCount = currentRows.length - measuredRows.length;
  const operationTotals = useMemo(() => aggregateOperations(currentRows), [currentRows]);
  const periodBounds = useMemo(() => getPeriodBounds(range), [range]);
  const baseOperationCategories = useMemo(() => buildSharedOperationCategories(currentRows, 6), [currentRows]);
  const crossfilteredRows = useMemo(
    () => filterCostRows(currentRows, analysisFilter, periodBounds, false),
    [currentRows, analysisFilter, periodBounds],
  );
  const crossfilteredPreviousRows = useMemo(
    () => filterCostRows(previousRows, analysisFilter, periodBounds, true),
    [previousRows, analysisFilter, periodBounds],
  );
  const trendRows = analysisFilter?.source === "trend" ? currentRows : crossfilteredRows;
  const trendPreviousRows = analysisFilter?.source === "trend" ? previousRows : crossfilteredPreviousRows;
  const donutRows = analysisFilter?.source === "donut" ? currentRows : crossfilteredRows;
  const distributionRows = analysisFilter?.source === "distribution" ? currentRows : crossfilteredRows;
  const donutTotalCredits = useMemo(() => d3.sum(donutRows, (row) => row.credits || 0), [donutRows]);
  const distributionTotalCredits = useMemo(() => d3.sum(distributionRows, (row) => row.credits || 0), [distributionRows]);
  const trendOperationCategories = useMemo(
    () => projectSharedCategories(baseOperationCategories, trendRows),
    [baseOperationCategories, trendRows],
  );
  const donutOperationCategories = useMemo(
    () => projectSharedCategories(baseOperationCategories, donutRows),
    [baseOperationCategories, donutRows],
  );
  const findings = useMemo(() => computeFindings(currentRows, operationTotals, totalCredits, formatMeter, meterNoun), [currentRows, operationTotals, totalCredits, formatMeter, meterNoun]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return crossfilteredRows.filter((row) => {
      if (!query) return true;
      return [row.logName, row.queryText, row.operationType, row.agentName, row.userName, row.sessionId]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [crossfilteredRows, search]);

  const sortedRows = useMemo(() => {
    const direction = sortState.sortDirection === "ascending" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      let value = 0;
      switch (sortState.sortColumn) {
        case "timestamp": value = compareDates(a.timestamp, b.timestamp); break;
        case "agentName": value = compareText(a.agentName, b.agentName); break;
        case "userName": value = compareText(a.userName, b.userName); break;
        case "operationType": value = compareText(a.operationType, b.operationType); break;
        case "logName": value = compareText(a.logName, b.logName); break;
        case "queryText": value = compareText(a.queryText, b.queryText); break;
        case "credits": value = compareNullableNumbers(a.credits, b.credits); break;
        case "allocationMethod": value = compareText(a.allocationMethod, b.allocationMethod); break;
        default: value = 0;
      }
      return value * direction;
    });
  }, [filteredRows, sortState]);

  const agentLogGroups = useMemo(
    () => buildAgentLogGroups(sortedRows, agentLogGroupBy),
    [sortedRows, agentLogGroupBy],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(pageNumber, totalPages);
  const visibleAgentLogGroups = useMemo(
    () => paginateAgentLogGroups(agentLogGroups, (safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [agentLogGroups, safePage],
  );

  const handleRangeChange = (nextRange: RangeKey) => {
    setRange(nextRange);
    setPageNumber(1);
    setAnalysisFilter(null);
    setDetailState(emptyDetailState());
    setExpandedAiEventId(null);
    setAiEventContentById({});
    setPageState((current) => ({ ...current, loading: true, error: null }));
  };

  const handleRefresh = () => {
    setPageState((current) => ({ ...current, loading: true, error: null }));
    setRefreshKey((key) => key + 1);
  };

  const handleCreditMeterChange = (nextMeter: CreditMeter) => {
    setCreditMeter(nextMeter);
    setAnalysisFilter(null);
    setPageNumber(1);
    setDetailState(emptyDetailState());
    setExpandedAiEventId(null);
    setAiEventContentById({});
  };

  const commitCostSettings = (next: CostSettings) => {
    setCostSettings(next);
    saveCostSettings(next);
  };

  const handleToggleSettings = () => {
    setSettingsOpen((open) => {
      const next = !open;
      if (next) {
        setSymbolDraft(costSettings.currencySymbol);
        setAiBuilderCostDraft(String(costSettings.aiBuilderUnitCost));
        setCopilotCostDraft(String(costSettings.copilotUnitCost));
      }
      return next;
    });
  };

  const handleSymbolChange = (value: string) => {
    setSymbolDraft(value);
    const symbol = value.slice(0, 6);
    commitCostSettings({ ...costSettings, currencySymbol: symbol.trim().length > 0 ? symbol : "$" });
  };

  const handleAiBuilderCostChange = (value: string) => {
    setAiBuilderCostDraft(value);
    const parsed = Number(value);
    if (value.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0) {
      commitCostSettings({ ...costSettings, aiBuilderUnitCost: parsed });
    }
  };

  const handleCopilotCostChange = (value: string) => {
    setCopilotCostDraft(value);
    const parsed = Number(value);
    if (value.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0) {
      commitCostSettings({ ...costSettings, copilotUnitCost: parsed });
    }
  };

  const handleResetSettings = () => {
    setSymbolDraft(DEFAULT_COST_SETTINGS.currencySymbol);
    setAiBuilderCostDraft(String(DEFAULT_COST_SETTINGS.aiBuilderUnitCost));
    setCopilotCostDraft(String(DEFAULT_COST_SETTINGS.copilotUnitCost));
    commitCostSettings(DEFAULT_COST_SETTINGS);
  };

  const handleExportCsv = async () => {
    if (sortedRows.length === 0) return;
    // The Power Apps host sandbox blocks file downloads, so deliver an
    // Excel-ready tab-separated table through the clipboard (tabs paste straight
    // into columns). Fall back to a manual-copy panel if clipboard is blocked.
    const table = buildAgentLogTable(sortedRows, costSettings, "\t");
    try {
      await navigator.clipboard.writeText(table);
      setExportNotice({ kind: "copied", count: sortedRows.length, text: "" });
    } catch {
      setExportNotice({ kind: "manual", count: sortedRows.length, text: table });
    }
  };

  const handleAgentLogGroupChange = (nextGroupBy: AgentLogGroupBy) => {
    setAgentLogGroupBy(nextGroupBy);
    setPageNumber(1);
    setDetailState(emptyDetailState());
    setExpandedAiEventId(null);
    setAiEventContentById({});
  };

  const handleToggleDetail = async (row: CostRow) => {
    if (detailState.rowId === row.id) {
      setDetailState(emptyDetailState());
      setExpandedAiEventId(null);
      setAiEventContentById({});
      return;
    }
    setExpandedAiEventId(null);
    setAiEventContentById({});
    setDetailState({
      rowId: row.id,
      loading: true,
      sourceDescription: row.sourceDescription,
      traceCount: null,
      aiEvents: [],
      aiEventError: null,
      error: null,
    });
    try {
      const detail = await props.dataApi.retrieveRow("crf5c_agentlog", {
        id: row.id,
        select: ["crf5c_sourcedescription", "biz_aieventtracelist"],
      });
      const traceIds = parseTraceIds(detail.biz_aieventtracelist);
      if (traceIds === null) {
        setDetailState((current) => current.rowId === row.id ? {
          rowId: row.id,
          loading: false,
          sourceDescription: toText(detail.crf5c_sourcedescription, row.sourceDescription),
          traceCount: null,
          aiEvents: [],
          aiEventError: "AI Event trace metadata is malformed.",
          error: null,
        } : current);
        return;
      }

      let aiEvents: AiEventRecord[] = [];
      let aiEventError: string | null = null;
      try {
        aiEvents = await queryRelatedAiEvents(props.dataApi, traceIds);
      } catch (error) {
        aiEventError = error instanceof Error ? error.message : "Unable to load linked AI Event records.";
      }
      setDetailState((current) => current.rowId === row.id ? {
        rowId: row.id,
        loading: false,
        sourceDescription: toText(detail.crf5c_sourcedescription, row.sourceDescription),
        traceCount: traceIds.length,
        aiEvents,
        aiEventError,
        error: null,
      } : current);
    } catch (error) {
      setDetailState((current) => current.rowId === row.id ? {
        rowId: row.id,
        loading: false,
        sourceDescription: row.sourceDescription,
        traceCount: null,
        aiEvents: [],
        aiEventError: null,
        error: error instanceof Error ? error.message : "Unable to load operation details.",
      } : current);
    }
  };

  const handleToggleAiEventDetails = async (eventId: string) => {
    if (expandedAiEventId === eventId) {
      setExpandedAiEventId(null);
      return;
    }
    setExpandedAiEventId(eventId);
    if (aiEventContentById[eventId]) return;

    setAiEventContentById((current) => ({
      ...current,
      [eventId]: { loading: true, input: "", inputTruncated: false, output: "", error: null },
    }));
    try {
      const content = await queryAiEventContent(props.dataApi, eventId);
      setAiEventContentById((current) => ({
        ...current,
        [eventId]: { loading: false, ...content, error: null },
      }));
    } catch (error) {
      setAiEventContentById((current) => ({
        ...current,
        [eventId]: {
          loading: false,
          input: "",
          inputTruncated: false,
          output: "",
          error: error instanceof Error ? error.message : "Unable to load AI Event input and output.",
        },
      }));
    }
  };

  const gridColumns = useMemo(() => {
    const columns = buildGridColumns(creditMeter, costSettings);
    // The column used for grouping is redundant in the rows — its value is
    // already shown on each group header — so hide it while that grouping is active.
    const groupedColumnId =
      agentLogGroupBy === "user" ? "userName"
      : agentLogGroupBy === "agent" ? "agentName"
      : agentLogGroupBy === "operation" ? "operationType"
      : null;
    return groupedColumnId ? columns.filter((column) => column.columnId !== groupedColumnId) : columns;
  }, [creditMeter, costSettings, agentLogGroupBy]);
  const columnSizingOptions = {
    timestamp: { defaultWidth: 170, minWidth: 145 },
    agentName: { defaultWidth: 140, minWidth: 110 },
    userName: { defaultWidth: 150, minWidth: 120 },
    operationType: { defaultWidth: 210, minWidth: 150 },
    logName: { defaultWidth: 190, minWidth: 140 },
    queryText: { defaultWidth: 320, minWidth: 200 },
    credits: { defaultWidth: 95, minWidth: 80 },
    allocationMethod: { defaultWidth: 110, minWidth: 90 },
  };

  return (
    <main className={styles.root}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <Text size={200} className={styles.eyebrow}>Agentic CRM governance</Text>
            <Text as="h1" size={800} weight="semibold">Agentic CRM Cost Management</Text>
            <Text className={styles.sectionSubtitle}>Track Copilot Credits, AI Builder Credits, or a unified currency cost — without mixing raw billing units.</Text>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.rangeGroup} role="group" aria-label="Credit meter">
              {CREDIT_METER_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  size="small"
                  appearance={creditMeter === option.key ? "primary" : "subtle"}
                  aria-pressed={creditMeter === option.key}
                  title={option.label}
                  onClick={() => handleCreditMeterChange(option.key)}
                >
                  {option.shortLabel}
                </Button>
              ))}
            </div>
            <div className={styles.rangeGroup} role="group" aria-label="Cost analysis period">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  size="small"
                  appearance={range === option.key ? "primary" : "subtle"}
                  aria-pressed={range === option.key}
                  onClick={() => handleRangeChange(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button appearance="secondary" icon={pageState.loading ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />} disabled={pageState.loading} onClick={handleRefresh}>
              Refresh
            </Button>
            <Button appearance={settingsOpen ? "primary" : "secondary"} icon={<SettingsRegular />} aria-pressed={settingsOpen} onClick={handleToggleSettings}>
              Settings
            </Button>
            <Text size={200} className={styles.lastUpdated}>
              {pageState.lastRefreshed ? `Updated ${pageState.lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not refreshed"}
            </Text>
          </div>
        </header>

        {settingsOpen && (
          <Card className={styles.sectionCard} aria-label="Cost settings">
            <CardHeader
              header={<Text as="h2" size={500} weight="semibold">Cost settings</Text>}
              description={<Text size={200} className={styles.sectionSubtitle}>Set the money value of one credit so the Currency meter can express Copilot and AI Builder consumption in a single unit.</Text>}
            />
            <div className={styles.sectionBody}>
              <div className={styles.settingsGrid}>
                <label className={styles.settingsField}>
                  <Text size={200} weight="semibold">Currency symbol</Text>
                  <Input value={symbolDraft} maxLength={6} onChange={(_, data) => handleSymbolChange(data.value)} />
                  <Text size={200} className={styles.settingsHint}>Shown before every converted amount.</Text>
                </label>
                <label className={styles.settingsField}>
                  <Text size={200} weight="semibold">AI Builder credit unit cost</Text>
                  <Input type="number" min={0} step={0.0001} value={aiBuilderCostDraft} contentBefore={<Text size={200}>{costSettings.currencySymbol}</Text>} onChange={(_, data) => handleAiBuilderCostChange(data.value)} />
                  <Text size={200} className={styles.settingsHint}>Money per 1 AI Builder credit.</Text>
                </label>
                <label className={styles.settingsField}>
                  <Text size={200} weight="semibold">Copilot credit unit cost</Text>
                  <Input type="number" min={0} step={0.001} value={copilotCostDraft} contentBefore={<Text size={200}>{costSettings.currencySymbol}</Text>} onChange={(_, data) => handleCopilotCostChange(data.value)} />
                  <Text size={200} className={styles.settingsHint}>Money per 1 Copilot credit.</Text>
                </label>
              </div>
              <div className={styles.settingsActions}>
                <Text size={200} className={styles.settingsHint}>Reference: 1 Copilot credit ≈ $0.01 (pay-as-you-go); AI Builder ≈ $0.0005 per credit. Adjust to match your agreement.</Text>
                <Button size="small" appearance="secondary" onClick={handleResetSettings}>Reset to defaults</Button>
              </div>
            </div>
          </Card>
        )}

        {pageState.error && (
          <MessageBar intent="error" role="alert">
            <MessageBarBody>
              <MessageBarTitle>AI cost data could not be loaded</MessageBarTitle>
              {pageState.error}
            </MessageBarBody>
            <Button appearance="transparent" onClick={handleRefresh}>Try again</Button>
          </MessageBar>
        )}

        {pageState.loading ? (
          <LoadingDashboard />
        ) : (
          <>
            <section className={styles.kpiGrid} aria-label="AI cost key performance indicators">
              <KpiCard icon={<MoneyRegular />} title={`Total ${creditMeterLabel(creditMeter)}`} value={formatMeter(totalCredits)} hint={`${measuredRows.length} measured operations`} />
              <KpiCard icon={<DataTrendingRegular />} title={`Average ${creditMeterLabel(creditMeter)} / operation`} value={averageCredits === null ? "—" : formatMeter(averageCredits)} hint="Selected meter only" />
              <KpiCard
                icon={<ClockRegular />}
                title="Pending credit matches"
                value={String(pendingCount)}
                hint={currentRows.length > 0 ? `${Math.round((pendingCount / currentRows.length) * 100)}% of operations · ${creditMeterLabel(creditMeter)}` : "No operations"}
                badge={pendingCount > 0 ? { text: "Review", color: "warning" } : { text: "Complete", color: "success" }}
              />
              <KpiCard icon={<CheckmarkCircleRegular />} title="Operation count" value={String(currentRows.length)} hint={`Selected period · ${range === "all" ? "all time" : range}`} />
            </section>

            <Card className={styles.sectionCard} aria-label="Credit trend and operation cost share">
              <CardHeader header={<Text as="h2" size={500} weight="semibold">Credit overview and operation mix</Text>} description={<Text size={200} className={styles.sectionSubtitle}>{creditMeterLabel(creditMeter)} · daily trend and total-cost share use one consistent operation color legend</Text>} />
              <div className={styles.sectionBody}>
                <div className={styles.combinedChartGrid}>
                  <section className={styles.chartSection} aria-labelledby="daily-trend-title">
                    <div className={styles.chartSectionHeader}>
                      <Text id="daily-trend-title" as="h3" size={400} weight="semibold">Daily credit trend</Text>
                      <Text size={200} className={styles.sectionSubtitle}>Current-period operation mix with prior equal-length period comparison</Text>
                    </div>
                  <CreditTrendChart
                      rows={trendRows}
                      previousRows={trendPreviousRows}
                      categories={trendOperationCategories}
                    range={range}
                      format={formatMeter}
                      noun={meterNoun}
                      selectedDate={analysisFilter?.source === "trend" && analysisFilter.dimension === "date" ? analysisFilter.key : null}
                    onSelectDate={(date) => {
                      const key = dateKey(date);
                      setAnalysisFilter(analysisFilter?.dimension === "date" && analysisFilter.key === key ? null : { dimension: "date", key, label: formatShortDate(date), source: "trend" });
                      setPageNumber(1);
                    }}
                  />
                  </section>
                  <section className={styles.chartSectionDonut} aria-labelledby="operation-share-title">
                    <div className={styles.chartSectionHeader}>
                      <Text id="operation-share-title" as="h3" size={400} weight="semibold">Operation cost share</Text>
                      <Text size={200} className={styles.sectionSubtitle}>{`Selected-period total ${meterNoun} classified by operation type`}</Text>
                    </div>
                  <CostDonutChart
                      categories={donutOperationCategories}
                      totalCredits={donutTotalCredits}
                      format={formatMeter}
                      noun={meterNoun}
                    selected={analysisFilter}
                    onSelect={(filter) => {
                      setAnalysisFilter(filter);
                      setPageNumber(1);
                    }}
                  />
                  </section>
                </div>
                <SharedOperationLegend
                  categories={baseOperationCategories}
                  totalCredits={totalCredits}
                  hasPreviousPeriod={range !== "all"}
                  selected={analysisFilter}
                  onSelect={(filter) => {
                    setAnalysisFilter(filter);
                    setPageNumber(1);
                  }}
                />
              </div>
            </Card>

            <Card className={styles.sectionCard}>
              <CardHeader header={<Text as="h2" size={500} weight="semibold">Cost range and distribution</Text>} description={<Text size={200} className={styles.sectionSubtitle}>Total-cost columns overlaid with per-operation min/max, average, and median</Text>} />
              <div className={styles.sectionBody}>
                <BarCandlestickChart
                  rows={distributionRows}
                  totalCredits={distributionTotalCredits}
                  operationCategories={baseOperationCategories}
                  dimension={analysisDimension}
                  format={formatMeter}
                  noun={meterNoun}
                  selected={analysisFilter}
                  onDimensionChange={(dimension) => {
                    setAnalysisDimension(dimension);
                    setAnalysisFilter(null);
                    setPageNumber(1);
                  }}
                  onSelect={(filter) => {
                    setAnalysisFilter(filter);
                    setPageNumber(1);
                  }}
                />
              </div>
            </Card>

            <section aria-labelledby="findings-title">
              <Text id="findings-title" as="h2" size={500} weight="semibold">Management findings</Text>
              <div className={styles.findings}>
                {findings.map((finding) => (
                  <MessageBar key={finding.id} intent={finding.intent} className={styles.findingBar}>
                    <MessageBarBody>
                      <MessageBarTitle>{finding.title}</MessageBarTitle>
                      {finding.body}
                    </MessageBarBody>
                  </MessageBar>
                ))}
              </div>
            </section>

            <Card className={styles.sectionCard}>
              <CardHeader header={<Text as="h2" size={500} weight="semibold">High-cost operations</Text>} description={<Text size={200} className={styles.sectionSubtitle}>Operations with the largest measured credit consumption</Text>} />
              <div className={styles.sectionBody}>
                <HighCostTable rows={currentRows} totalCredits={totalCredits} meter={creditMeter} settings={costSettings} />
              </div>
            </Card>

            <Card className={styles.sectionCard}>
              <CardHeader header={<Text as="h2" size={500} weight="semibold">Agent Log</Text>} description={<Text size={200} className={styles.sectionSubtitle}>Search, sort, inspect, and reconcile AI operations</Text>} />
              <div className={styles.sectionBody}>
                <div className={styles.toolbar}>
                  <div className={styles.searchGroup}>
                    <Input
                      className={styles.searchInput}
                      contentBefore={<SearchRegular />}
                      value={search}
                      placeholder="Search user, agent, operation, ID, or query"
                      aria-label="Search Agent Log"
                      onChange={(_event, data) => { setSearch(data.value); setPageNumber(1); }}
                    />
                    {analysisFilter && (
                      <Button appearance="secondary" icon={<FilterDismissRegular />} onClick={() => { setAnalysisFilter(null); setPageNumber(1); }}>
                        Clear {analysisFilter.label}
                      </Button>
                    )}
                  </div>
                  <div className={styles.toolbarRight}>
                    <Text size={200} className={styles.sectionSubtitle}>{sortedRows.length} result{sortedRows.length === 1 ? "" : "s"}</Text>
                    <Button
                      size="small"
                      appearance="secondary"
                      icon={<CopyRegular />}
                      disabled={sortedRows.length === 0}
                      onClick={() => { void handleExportCsv(); }}
                      title="Copy the filtered Agent Log (all columns) to the clipboard, ready to paste into Excel"
                    >
                      Copy for Excel
                    </Button>
                  </div>
                </div>

                {exportNotice?.kind === "copied" && (
                  <MessageBar intent="success" className={styles.exportNotice}>
                    <MessageBarBody>
                      Copied {exportNotice.count} row{exportNotice.count === 1 ? "" : "s"} with every column to the clipboard — paste (Ctrl / ⌘ + V) into Excel to analyze.
                    </MessageBarBody>
                    <Button appearance="transparent" onClick={() => setExportNotice(null)}>Dismiss</Button>
                  </MessageBar>
                )}
                {exportNotice?.kind === "manual" && (
                  <div className={styles.exportManual}>
                    <Text size={200}>Clipboard access was blocked. Select all the text below, copy it, then paste into Excel:</Text>
                    <textarea
                      className={styles.exportTextarea}
                      readOnly
                      value={exportNotice.text}
                      aria-label="Agent Log export data"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <div>
                      <Button size="small" appearance="secondary" onClick={() => setExportNotice(null)}>Close</Button>
                    </div>
                  </div>
                )}

                <div className={styles.agentLogControls}>
                  <div className={styles.groupControl}>
                    <Text size={200} weight="semibold">Group by</Text>
                    <div className={styles.controlGroup} role="group" aria-label="Agent Log grouping">
                      {AGENT_LOG_GROUP_OPTIONS.map((option) => (
                        <Button
                          key={option.key}
                          size="small"
                          appearance={agentLogGroupBy === option.key ? "primary" : "subtle"}
                          aria-pressed={agentLogGroupBy === option.key}
                          onClick={() => handleAgentLogGroupChange(option.key)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Text size={200} className={styles.sectionSubtitle}>Select a record row to inspect its linked AI Events.</Text>
                </div>

                {sortedRows.length === 0 ? (
                  <div className={styles.empty}>
                    <SearchRegular fontSize={28} />
                    <Text weight="semibold">No Agent Log records match</Text>
                    <Text size={200}>Adjust the period, search text, or operation filter.</Text>
                  </div>
                ) : (
                  <>
                    <div className={styles.groupList}>
                      {visibleAgentLogGroups.map((group) => (
                        <section key={group.key} className={styles.groupSection} aria-label={`${group.label} Agent Log group`}>
                          {agentLogGroupBy !== "none" && (
                            <div className={styles.groupHeader}>
                              <div className={styles.groupTitle}>
                                <Text weight="semibold">{group.label}</Text>
                                <Text size={200} className={styles.sectionSubtitle}>{AGENT_LOG_GROUP_OPTIONS.find((option) => option.key === agentLogGroupBy)?.label}</Text>
                              </div>
                              <div className={styles.groupFacts}>
                                <Badge color="informative">{formatMeter(group.totalCredits)}{creditMeter === "currency" ? "" : ` ${creditMeterLabel(creditMeter)}`}</Badge>
                                <Text size={200}>{group.rows.length} record{group.rows.length === 1 ? "" : "s"}</Text>
                                {group.pendingCount > 0 && <Text size={200}>{group.pendingCount} pending</Text>}
                              </div>
                            </div>
                          )}
                          <div className={styles.gridScroll}>
                            <DataGrid
                              items={group.visibleRows}
                              columns={gridColumns}
                              sortable
                              resizableColumns
                              columnSizingOptions={columnSizingOptions}
                              sortState={sortState}
                              onSortChange={(_event, data) => setSortState(data as SortState)}
                              getRowId={(item) => item.id}
                              aria-label={`${group.label} AI cost Agent Log records`}
                            >
                              <DataGridHeader>
                                <DataGridRow>
                                  {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                                </DataGridRow>
                              </DataGridHeader>
                              <DataGridBody<CostRow>>
                                {({ item, rowId }) => (
                                  <Fragment key={rowId}>
                                    <DataGridRow<CostRow>
                                      className={styles.clickableGridRow}
                                      tabIndex={0}
                                      aria-expanded={detailState.rowId === item.id}
                                      aria-label={`${detailState.rowId === item.id ? "Collapse" : "Expand"} ${item.logName}`}
                                      onClick={() => { void handleToggleDetail(item); }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          void handleToggleDetail(item);
                                        }
                                      }}
                                    >
                                      {({ columnId, renderCell }) => (
                                        <DataGridCell className={columnId === "queryText" || columnId === "logName" || columnId === "operationType" || columnId === "userName" ? styles.gridCellClip : undefined}>
                                          {columnId === "queryText" ? <span className={styles.queryCell} title={item.queryText}>{item.queryText}</span>
                                            : columnId === "logName" ? <span className={styles.queryCell} title={item.logName}>{item.logName}</span>
                                            : columnId === "operationType" ? <span className={styles.queryCell} title={item.operationType}>{item.operationType}</span>
                                            : columnId === "userName" ? <span className={styles.queryCell} title={item.userName}>{item.userName}</span>
                                            : columnId === "credits" ? <span className={styles.numericCell}>{renderCell(item)}</span>
                                            : renderCell(item)}
                                        </DataGridCell>
                                      )}
                                    </DataGridRow>
                                    {detailState.rowId === item.id && (
                                      <DataGridRow<CostRow> className={styles.detailInlineRow} aria-label={`Details for ${item.logName}`}>
                                        {({ columnId }) => columnId === "timestamp" ? (
                                          <DataGridCell className={styles.detailInlineCell} focusMode="group">
                                            <AgentLogInlineDetails
                                              detailState={detailState}
                                              expandedAiEventId={expandedAiEventId}
                                              aiEventContentById={aiEventContentById}
                                              onToggleAiEventDetails={(eventId) => { void handleToggleAiEventDetails(eventId); }}
                                            />
                                          </DataGridCell>
                                        ) : null}
                                      </DataGridRow>
                                    )}
                                  </Fragment>
                                )}
                              </DataGridBody>
                            </DataGrid>
                          </div>
                        </section>
                      ))}
                    </div>

                    <div className={styles.pagination}>
                      <Text size={200}>Page {safePage} of {totalPages} · rows {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sortedRows.length)}</Text>
                      <div className={styles.paginationButtons}>
                        <Button size="small" disabled={safePage <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))}>Previous</Button>
                        <Button size="small" disabled={safePage >= totalPages} onClick={() => setPageNumber((page) => Math.min(totalPages, page + 1))}>Next</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
};

export default GeneratedComponent;
