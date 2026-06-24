---
name: query-and-report
description: Find, list, summarize, analyze, or report on CRM data. Use for any question that reads existing records — "show my opportunities closing this month", "which deals are at risk", "list today's visits", "summarize the Royal London account", "how is my pipeline". Queries the relevant Dataverse tables filtered to the current user, then answers with numbers first and a short supporting list or analysis.
---

# Skill: Query, report, and analyze

When this skill is activated:

1. Identify the target entity and filters from the question.
2. Query the right table(s) via the Dataverse tool, always scoped to the current user
   (`_ownerid_value` = current user):
   - Accounts → `account`; Contacts → `contact`;
   - Opportunities → `crf5c_opportunity1`;
   - Activities → `appointment` + `phonecall` + `email` (merge, sort by `scheduledstart` desc).
3. Apply filters:
   - "closing this month / by date" → `crf5c_expectedclosedate` range.
   - "at risk" → `crf5c_confidence` 0–49. "active/pipeline" → `crf5c_stage` not won/lost.
   - "today / this week" → date range on `scheduledstart`.
   - "completed" → `statecode` = 1; "open/planned" → `statecode` = 0.
4. Answer **numbers first** (count, total amount), then a short list (top items) or a
   brief analysis / coaching note.

## Guidelines
- If a previous query in this conversation already returned the data needed to answer a
  follow-up about the *same* records, reuse it instead of re-querying.
- For a multi-section report request, gather each section's data, then present one
  combined, structured answer — it is one intent, not several.
- Never fabricate records or totals; only report what the tool returns.

## Examples
**Example 1: Pipeline report**
- User: "How's my pipeline this quarter?"
- Behavior: query crf5c_opportunity1 (owner=me, stage not won/lost), report total
  amount + count, then list top deals by amount with stage and close date.

**Example 2: At-risk deals**
- User: "哪些单子有风险？"
- Behavior: query crf5c_opportunity1 where crf5c_confidence < 50, list name, amount,
  confidence, blocker; add a one-line coaching suggestion.

## Notes
Keep output mobile-friendly: a headline number, then a compact list.
