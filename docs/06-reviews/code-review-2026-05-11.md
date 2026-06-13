# Sales Copilot Mobile - Architecture & Code Review Report

**Review Date:** May 11, 2026  
**Reviewer:** AI Architect  
**Codebase Version:** v1.0.0  
**Overall Health Score:** 72/100

---

## Executive Summary

The Sales Copilot Mobile application is a feature-rich React TypeScript application with strong UI/UX implementation. However, several architectural concerns require immediate attention:

| Area | Score | Status |
|------|-------|--------|
| Architecture Consistency | 6/10 | ⚠️ Warning |
| Large File Maintenance | 4/10 | 🔴 Critical |
| Component Duplication | 5/10 | ⚠️ Warning |
| Type Safety | 8/10 | ✅ Good |
| UI/UX Quality | 9/10 | ✅ Good |

---

## 1. Architecture Consistency Analysis

### 1.1 Data Layer Inconsistencies

**Finding: Mixed Data Fetching Patterns**

The codebase exhibits inconsistent data fetching approaches:

| File | Pattern Used | Issue |
|------|--------------|-------|
| `home.tsx` | Direct hook calls with inline filtering | Business logic in UI |
| `activity-capture.tsx` | `useMemo` for filtering | Better separation |
| `visit-log.tsx` | Inline callback filtering | Inconsistent with other pages |
| `settings-panel.tsx` | Mixed localStorage + React Query | Dual state management |

**Specific Example (home.tsx:464-466):**
```typescript
// BAD: Business logic embedded in component
const activityRelatedInsights = useMemo(() => {
  return businessInsights.filter((insight: BusinessInsight) => isActivityRelatedInsightUtil(insight));
}, [businessInsights]);
```

**Recommendation:** Create dedicated hooks like `useActivityRelatedInsights()` in `/hooks/` folder.

### 1.2 Business Logic Placement

**Finding: Business logic scattered across UI components**

| Location | Lines | Business Logic Found |
|----------|-------|---------------------|
| `home.tsx` | 487-663 | KPI calculations (176 lines!) |
| `activity-capture.tsx` | 210-290 | Opportunity analysis |
| `visit-log.tsx` | 270-380 | Data extraction logic |
| `settings-panel.tsx` | 260-380 | Config persistence logic |

**Impact:** 
- Difficult to test business rules independently
- Code duplication risk when same logic needed elsewhere
- UI components become bloated

**Recommendation:** Extract to dedicated service files:
```
src/services/
├── kpi-calculator.ts      # Extract from home.tsx
├── opportunity-analyzer.ts # Extract from activity-capture.tsx
├── visit-extractor.ts     # Extract from visit-log.tsx
└── settings-manager.ts    # Extract from settings-panel.tsx
```

### 1.3 UI/UX Pattern Inconsistencies

| Pattern | Used In | Different Implementation In |
|---------|---------|----------------------------|
| Loading states | `home.tsx` (spinner) | `visit-log.tsx` (skeleton) |
| Error handling | `activity-capture.tsx` (toast) | `settings-panel.tsx` (inline) |
| Empty states | `accounts.tsx` (Empty component) | `opportunities.tsx` (inline text) |
| Navigation back | Some use `navigate(-1)` | Others use hardcoded routes |

---

## 2. Large File Maintenance Issues

### 2.1 Critical Files Requiring Refactoring

| File | Lines | Complexity | Priority |
|------|-------|------------|----------|
| `home.tsx` | **3,370** | Extreme | 🔴 P0 |
| `settings-panel.tsx` | **1,239** | Very High | 🔴 P0 |
| `kpi-card.tsx` | **1,179** | High | 🟡 P1 |
| `copilot-context.tsx` | **1,146** | High | 🟡 P1 |
| `visit-log.tsx` | **1,044** | High | 🟡 P1 |
| `i18n.ts` | **1,547** | Very High | 🔴 P0 |

### 2.2 Detailed Analysis: home.tsx (3,370 lines)

**Problem:** This file is a monolithic component containing:

1. **7 Sub-components** (lines 57-316)
   - `DateTimeClock` (41 lines)
   - `HomeHeaderWidgetDisplay` (91 lines)
   - `QuickActionChip` (16 lines)
   - `StageProgress` (20 lines)
   - `StageCard` (36 lines)
   - Helper functions scattered throughout

2. **Massive KPI Calculation** (lines 487-663)
   - 176 lines of business logic
   - Should be in a separate `useKPIData()` hook

3. **Copilot Integration** (lines 795-951)
   - 156 lines of connection management
   - Duplicated in other pages

4. **Multiple useEffect blocks** (15+ effects)
   - Hard to track side effects
   - Risk of infinite loops (evidenced by refs: `loadedConvRef`, `lastSavedRef`)

**Refactoring Plan:**
```
pages/home/
├── index.tsx              # Main orchestrator (< 200 lines)
├── components/
│   ├── date-time-clock.tsx
│   ├── header-widget.tsx
│   ├── quick-action-chip.tsx
│   ├── stage-card.tsx
│   └── chat-panel.tsx
├── hooks/
│   ├── use-kpi-data.ts
│   └── use-copilot-connection.ts
└── utils/
    └── kpi-calculations.ts
```

### 2.3 Detailed Analysis: settings-panel.tsx (1,239 lines)

**Problem:** Single component managing 15+ different settings categories:

| Category | Lines | Extractable? |
|----------|-------|-------------|
| Profile Section | 677-688 | ✅ Yes |
| General Settings | 691-730 | ✅ Yes |
| Style Settings | 732-828 | ✅ Yes |
| AI Assistant Config | 830-993 | ✅ Yes |
| Agent Configuration | 995-1100+ | ✅ Yes |
| Voice Settings | 1100-1200+ | ✅ Yes |

**State Management Explosion:**
```typescript
// 30+ useState calls in one component!
const [locale, setLocaleState] = useState<Locale>(getLocale);
const [isDark, setIsDark] = useState(true);
const [selectedVoice, setSelectedVoiceState] = useState(getSelectedVoice);
// ... 27 more state variables
```

**Refactoring Plan:**
```
components/settings/
├── settings-panel.tsx     # Shell with routing (< 100 lines)
├── sections/
│   ├── profile-section.tsx
│   ├── general-section.tsx
│   ├── style-section.tsx
│   ├── ai-config-section.tsx
│   ├── agent-config-section.tsx
│   └── voice-section.tsx
└── hooks/
    └── use-settings-state.ts  # Consolidated state management
```

### 2.4 Detailed Analysis: i18n.ts (1,547 lines)

**Problem:** Monolithic translation file mixing:
- Translation strings
- Type definitions
- Voice configuration
- LLM configuration utilities
- Theme utilities

**Refactoring Plan:**
```
lib/i18n/
├── index.ts           # Re-exports
├── translations.ts    # All translation strings
├── types.ts           # Type definitions
├── voice-config.ts    # Voice-related utilities
├── llm-config.ts      # LLM configuration
└── theme-config.ts    # Theme utilities
```

---

## 3. Component Design & Duplication Issues

### 3.1 Duplicated Patterns

#### Pattern 1: Loading States (5 different implementations)

| File | Implementation |
|------|---------------|
| `home.tsx:1780` | `<Loader2 className="animate-spin" />` |
| `activity-capture.tsx:412` | Full-screen centered loader |
| `visit-log.tsx:678` | Skeleton cards |
| `settings-panel.tsx` | No loading state |
| `account-detail.tsx` | Inline spinner |

**Recommendation:** Create `<LoadingState variant="page|inline|skeleton" />`

#### Pattern 2: Empty States (4 different implementations)

| File | Implementation |
|------|---------------|
| `accounts.tsx` | Uses `<Empty>` component |
| `opportunities.tsx` | Inline "No opportunities" text |
| `activities.tsx` | `<Empty>` with custom icon |
| `contacts.tsx` | Different empty message style |

**Recommendation:** Standardize on `<Empty>` compound component everywhere.

#### Pattern 3: Page Headers (6+ variations)

| File | Header Pattern |
|------|---------------|
| `home.tsx` | Custom glass header with settings |
| `account-detail.tsx` | Back button + title + actions |
| `activity-capture.tsx` | Back button + title |
| `settings.tsx` | Custom close button |
| `code-review.tsx` | Back + title + refresh/copy |

**Recommendation:** Create `<PageHeader variant="default|detail|modal" />`

#### Pattern 4: Card Wrappers (Multiple styles)

```typescript
// Pattern A: glass-card (home.tsx, kpi-card.tsx)
<div className="glass-card rounded-xl p-4">

// Pattern B: Card component (account-detail.tsx)
<Card className="...">

// Pattern C: inline styles (visit-log.tsx)
<div className="bg-card border border-border rounded-lg p-3">
```

### 3.2 Recommended Shared Components

Create these in `components/shared/`:

```typescript
// 1. PageHeader.tsx
export function PageHeader({ 
  title, 
  subtitle, 
  onBack, 
  actions 
}: PageHeaderProps) {...}

// 2. LoadingState.tsx
export function LoadingState({ 
  variant: 'page' | 'inline' | 'skeleton' 
}: LoadingStateProps) {...}

// 3. DataCard.tsx - unified card wrapper
export function DataCard({ 
  variant: 'glass' | 'solid' | 'outline',
  children 
}: DataCardProps) {...}

// 4. ListItem.tsx - unified list item
export function ListItem({ 
  icon, 
  title, 
  subtitle, 
  rightElement,
  onClick 
}: ListItemProps) {...}
```

### 3.3 Form Handling Duplication

| File | Form Pattern |
|------|-------------|
| `activity-capture.tsx` | Manual useState per field |
| `visit-log.tsx` | Manual useState per field |
| `data-import.tsx` | Manual useState per field |
| `settings-panel.tsx` | 30+ useState calls |

**None use react-hook-form consistently despite it being available.**

**Recommendation:** Standardize on react-hook-form + zod for all forms.

---

## 4. Specific Code Issues

### 4.1 Ref-based Loop Prevention (Anti-pattern)

**File:** `home.tsx` (lines 419-422)
```typescript
// FIX: Refs to prevent infinite loop in conversation load/save
const loadedConvRef = useRef<string | null>(null);
const lastSavedRef = useRef<string>('');
```

**Problem:** Using refs to prevent infinite loops indicates structural issues with useEffect dependencies. This is a code smell.

**Solution:** Refactor to use proper effect separation or React Query's mutation patterns.

### 4.2 Inline Type Assertions

**File:** `activity-capture.tsx` (lines 330-340)
```typescript
stageKey: (stageKeyMap[oppAnalysis.stage || 'prospecting'] || 'StageKey0') 
  as 'StageKey0' | 'StageKey1' | 'StageKey2' | 'StageKey3' | 'StageKey4' | 'StageKey5',
```

**Problem:** Type assertions bypass TypeScript's safety checks.

**Solution:** Create properly typed mapping functions.

### 4.3 Magic Strings

| File | Line | Magic String |
|------|------|-------------|
| `home.tsx` | Multiple | `'StageKey0'`, `'StageKey1'`, etc. |
| `activity-capture.tsx` | 90 | `'client-visit'` |
| `visit-log.tsx` | 65 | `'in-person'`, `'phone'`, etc. |

**Solution:** Use generated enum types from data model consistently.

---

## 5. Actionable Recommendations

### Priority 0 (This Week)

1. **Split `home.tsx`** - Extract KPI calculations, chat panel, and sub-components
2. **Split `settings-panel.tsx`** - Create section components with shared state hook
3. **Split `i18n.ts`** - Separate translations, voice config, and utilities

### Priority 1 (Next Sprint)

4. **Create shared component library** - `PageHeader`, `LoadingState`, `DataCard`, `ListItem`
5. **Standardize form handling** - Migrate all forms to react-hook-form
6. **Extract business logic** - Create service files for KPI, opportunity analysis, etc.

### Priority 2 (Backlog)

7. **Add unit tests** - Start with extracted services and hooks
8. **Document component patterns** - Create Storybook or component documentation
9. **Performance audit** - Add React.memo, useMemo where needed

---

## 6. File-by-File Recommendations

| File | Action | Effort |
|------|--------|--------|
| `home.tsx` | Split into 8+ files | 3 days |
| `settings-panel.tsx` | Split into 7+ files | 2 days |
| `i18n.ts` | Split into 6+ files | 1 day |
| `kpi-card.tsx` | Extract logic, simplify | 1 day |
| `copilot-context.tsx` | Extract connection logic | 1 day |
| `visit-log.tsx` | Align patterns, extract logic | 0.5 day |
| `activity-capture.tsx` | Align patterns, extract logic | 0.5 day |

**Total Estimated Effort:** 9 developer days

---

## Appendix: Metrics Summary

```
Total Source Files: 165
Total Lines of Code: ~40,000
Largest File: home.tsx (3,370 lines)
Average File Size: 242 lines
Files Over 500 Lines: 15
Files Over 1000 Lines: 6

Component Types:
- Pages: 22
- UI Components: 75
- Custom Components: 20
- Hooks: 15
- Services: 8
- Generated Code: 45
```

---

*Report generated by AI Architect on May 11, 2026*
