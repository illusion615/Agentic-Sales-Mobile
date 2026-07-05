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

## B. Dataverse row-change workflow

Workflow: `Account Enrichment - Account Changed`

Steps:
1. Open an active `account` row in Dataverse. Put a short human note in
   `description`, for example `Met the CFO in Q2`.
2. Change one trigger column, for example `websiteurl` or `address1_city`.
3. Wait for the workflow run.
4. Re-open the account row.

Expected:
- Public master fields such as `websiteurl`, `telephone1`, `emailaddress1`, and
  address fields are filled when they were empty, or refreshed only from an
  official source.
- `industrycode` is set only when a Dataverse option matches; otherwise the
  public industry appears inside the description block.
- The `description` field now contains a managed block delimited by
  `[AI-ENRICHMENT:START]` and `[AI-ENRICHMENT:END]`.
- The human note `Met the CFO in Q2` is still present, outside the markers.
- The block includes the sections Profile, Industry trends, Signals, Risks,
  Sales angles, Next actions, Field updates, Sources, and Updated.
- The `Field updates` section lists every field the run changed, as old to new.
- `name`, owner, and status are unchanged.

## C. Weekly workflow smoke test

Workflow: `Account Enrichment - Weekly Batch`

Steps:
1. Use the workflow Test command in Studio.
2. Let it run with the configured weekly-batch message.
3. Inspect run history and a few affected account rows.

Expected:
- The agent processes at most 25 active accounts.
- Accounts whose enrichment block `Updated` timestamp is under 7 days old are
  skipped.
- Each processed account has its public fields updated and its description block
  refreshed.

## D. Freshness and note-safety checks

- Re-run test A with `forceRefresh: false` immediately after a successful run.
  Expected: the run is skipped because the block `Updated` timestamp is under
  7 days old.
- Confirm any text outside the `[AI-ENRICHMENT:START]` / `[AI-ENRICHMENT:END]`
  markers is never modified across runs.

## E. Regression checks

- Trigger columns do not include `description` or system-only fields, so the
  agent rewriting its own snapshot does not re-trigger the row-change workflow.
- Published workflows show `Your flow is ready to go`.
- Agent tools include `Microsoft Dataverse MCP Server` and `Search all websites`.
- The agent does not write to `crf5c_businessinsights`, `contact`,
  `crf5c_opportunity1`, or activity tables.
