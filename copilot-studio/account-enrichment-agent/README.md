# Account Enrichment Agent

This directory documents the standalone Copilot Studio agent that keeps a CRM
account's public master data current and maintains a short public intelligence
snapshot inside the account description. It is a background enrichment agent,
not the main interactive sales assistant.

## Studio resources created

Environment: `Wells Dev` (`efcd2d46-3d9e-e31a-a9d8-5481ddae951c`)

Agent:
- Name: `Account Enrichment Agent`
- Agent id: `e5a322da-dcc6-4ebc-ab60-3e901e4e418e`
- Model: `Claude Sonnet 4.6`
- Knowledge: `Search all websites` enabled
- Tools: `Microsoft Dataverse MCP Server`
- The agent uses the MCP server to read the account row, update public
  master-data fields, and rewrite a managed enrichment block inside the account
  `description`. It writes to the `account` table only.

Workflows:
- `Account Enrichment - Account Changed`
  - Workflow id: `117c83dd-820e-c794-f0df-7a37b80dd886`
  - Status: published in Copilot Studio
  - Trigger: Microsoft Dataverse `When a row is added, modified or deleted`
  - Table: `Accounts`
  - Change type: `Added or Modified`
  - Scope: `Organization`
  - Select columns: `name,websiteurl,address1_city,address1_country,industrycode,telephone1,emailaddress1`
  - Filter rows: `statecode eq 0`
  - Action: call `Account Enrichment Agent`
- `Account Enrichment - Weekly Batch`
  - Workflow id: `b41241e1-51f4-c125-af07-23250e20685d`
  - Status: published in Copilot Studio
  - Trigger: `Recurrence`
  - Schedule: every 1 week, Monday, UTC 01:00
  - Action: call `Account Enrichment Agent`

Publication note: both workflows published and Studio showed `Your flow is ready
to go`. The agent instructions and the `Microsoft Dataverse MCP Server` tool are
present on the agent page. The agent publish command remained on `Publishing...`
during the session, so refresh the agent page and confirm the publish status has
settled before a production run.

## What the agent enriches

Everything lands on the `account` row. There are two kinds of output:

1. Public master-data fields, updated in place from official or high-confidence
   public sources.
2. A public intelligence snapshot, written as a managed text block inside the
   account `description` field, including recent news and announcements (tenders
   and procurement notices, budgets, expansion, equipment, partnerships, and
   leadership changes) that help sales mine opportunities.

The agent does not use the `crf5c_businessinsights` table. That table remains for
the app's own in-product insights and is intentionally not touched here.

## Public master fields updated

Standard `account` fields, updated from official or high-confidence sources:

- `websiteurl`: official website URL.
- `telephone1`: main public phone number.
- `emailaddress1`: main public or general contact email.
- `address1_line1`, `address1_city`, `address1_stateorprovince`,
  `address1_country`, `address1_postalcode`: official registered or HQ address.
- `industrycode`: mapped to the closest existing Dataverse industry option-set
  value. If no option is a reasonable match, `industrycode` is left unchanged and
  the public industry is noted inside the description snapshot instead.

Update rules:
- Empty fields are filled.
- A non-empty field is refreshed only when an official source clearly supersedes
  the current value.
- `name`, owner, and state/status are never changed.
- Every field change is logged in the description snapshot `Field updates`
  section, as old to new, so the change is auditable and a human can revert it.

## Intelligence snapshot in `description`

The snapshot is a single managed block delimited by exact markers:

```text
[AI-ENRICHMENT:START]
...
[AI-ENRICHMENT:END]
```

- Text outside the markers is preserved. It may be salesperson notes. Only the
  content between the markers is replaced on each run. If no block exists yet, one
  is appended.
- The block is human-readable text in the output language, kept roughly under
  1500 characters.
- Sections in order: Profile, Industry trends, News & announcements, Risks,
  Sales angles, Next actions, Field updates, Sources, Updated (UTC, valid about
  30 days). The News & announcements section is a dated, sourced list focused on
  opportunity mining (tenders/procurement, budgets, expansion, equipment,
  partnerships, leadership changes).
- Freshness is read from the `Updated` timestamp inside the block. If it is less
  than 7 days old and `forceRefresh` is not true, the run is skipped. No separate
  freshness table or field is needed.

## Safety rules

- Treat web findings as public signals, not CRM truth.
- Do not invent revenue, procurement status, installed base, decision makers, or
  buying intent.
- Never overwrite salesperson notes; only the managed block is rewritten.
- Do not overwrite a non-empty public field unless an official source clearly
  supersedes it, and always log the change.
- Skip or downgrade confidence when entity matching is weak.
- Skip the run if the snapshot was refreshed in the last 7 days, unless
  `forceRefresh` is true.
- Do not scrape paywalled or login-only content.
- Do not store private personal data from public pages unless it is clearly
  business contact information needed for sales context.

## App visibility

The account detail page shows the enriched fields directly:

- Phone, email, address, industry, and the official website appear in the
  Contact Info card (website is a clickable link).
- The description enrichment block is rendered as a dedicated Public Intelligence
  card with the `[AI-ENRICHMENT:...]` markers stripped, while any human-entered
  notes stay in the Notes card.

The app `Account` abstraction now maps `website` to the Dataverse `websiteurl`
field (`generated/models/account-model.ts`, `AccountEntityModel.ts`, and
`services/account-service.ts`), and the account detail page both displays and
edits it.

## File map

- `instructions.md`: exact agent instructions used in Copilot Studio, plus the
  description snapshot format.
- `workflows.md`: exact workflow configuration and trigger messages.
- `test-script.md`: manual validation cases for Studio and Dataverse.
