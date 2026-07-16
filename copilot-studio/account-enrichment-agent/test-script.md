# Account Enrichment Agent Test Script

Run these checks after the agent publish status settles in Copilot Studio.

## A. Agent direct test

Open `Account Enrichment Agent` in Preview and send:

```text
Run account enrichment for this manual test.

Trigger payload JSON:
{
  "triggerMode": "manualRefresh",
  "accountName": "Royal London Hospital",
  "city": "London",
  "country": "United Kingdom",
  "outputLanguage": "zh-Hans",
  "forceRefresh": true
}
```

Expected:
- The agent uses public web search and the Microsoft Dataverse MCP Server.
- The agent does not ask for a salesperson confirmation because this is a
  background enrichment job.
- If the account cannot be resolved strongly, it skips or returns a low
  confidence result instead of writing speculative data.
- For a successful run, `account.description` contains only a concise profile
  and one matching `crf5c_aisummary` row has `biz_type = marketing`.

## B. Dataverse row-change workflow guard

Workflow: `Account Enrichment - Account Changed`

Expected:
- The workflow remains inactive.
- Updating an account through the app does not start this workflow.
- On-demand refresh produces exactly one write path: Support Agent response →
  app validation → account and Marketing Insight persistence.

## C. Weekly workflow smoke test

Workflow: `Account Enrichment - Weekly Batch`

Steps:
1. Use the workflow Test command in Studio.
2. Let it run with the configured weekly-batch message.
3. Inspect run history and a few affected account rows.

Expected:
- The agent processes at most 25 active accounts.
- Accounts whose Marketing Insight `crf5c_generatedon` is under 7 days old are
  skipped.
- Each processed account has its public fields/profile updated and its canonical
  Marketing Insight row created or updated.

## D. Freshness and note-safety checks

- Re-run test A with `forceRefresh: false` immediately after a successful run.
  Expected: the run is skipped because the matching Marketing Insight row is
  under 7 days old.
- Confirm `account.description` contains no `[AI-ENRICHMENT]` marker, Markdown
  source list, or field-change log.

## E. Regression checks

- `Account Enrichment - Account Changed` is inactive.
- `Account Enrichment - Weekly Batch` is published and ready.
- Agent tools include `Microsoft Dataverse MCP Server` and `Search all websites`.
- The agent writes only to `account` and `crf5c_aisummary`; it does not write to
  `crf5c_businessinsights`, `contact`, `crf5c_opportunity1`, or activity tables.
- Re-running the batch updates the same `(accountid, biz_type=marketing)` row and
  never creates a duplicate Marketing Insight row.
