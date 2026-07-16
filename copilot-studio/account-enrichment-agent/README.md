# Account Enrichment Agent

This directory documents the standalone Copilot Studio agent that keeps a CRM
account's public master data current on a weekly schedule. It stores a concise
profile in `account.description` and upserts the same Marketing Insight record
the app uses in `crf5c_aisummary` (`biz_type = marketing`). It is a background
agent, not the main interactive sales assistant.

## Architecture boundary

This agent is **not** called by the account-detail refresh button. The app's
on-demand path calls the single classic `Agentic CRM Mobile Support Agent`
resolved from the `copilot_studio_agent_name` Setting; that agent returns
`fields + marketingInsight`, and the app validates and persists the result.

This standalone agent owns only background automation (currently the weekly
batch workflow) and writes through its Dataverse MCP tool. Do not point the app
at this `cliagent-1.0.0` agent, add an `account_enrichment_agent` app setting, or
copy its compact workflow status response into the app-facing parser contract.

## Studio resources created

Environment: `Wells Dev` (`efcd2d46-3d9e-e31a-a9d8-5481ddae951c`)

Agent:
- Name: `Account Enrichment Agent`
- Agent id: `e5a322da-dcc6-4ebc-ab60-3e901e4e418e`
- Model: `Claude Sonnet 4.6`
- Knowledge: `Search all websites` enabled
- Tools: `Microsoft Dataverse MCP Server`
- Last verified publication: `2026-07-15T00:29:22Z`
- The agent uses the MCP server to read account and AI Summary rows, update
  public master-data fields and the plain-text account profile, and upsert one
  account Marketing Insight row.

Workflows:
- `Account Enrichment - Account Changed`
  - Workflow id: `117c83dd-820e-c794-f0df-7a37b80dd886`
  - Status: inactive (retained only as historical configuration; do not enable,
    because field-triggered writes race the app's on-demand result)
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

There are two canonical persistence targets:

1. `account`: public master-data fields plus a concise plain-text profile in
  `description`.
2. `crf5c_aisummary`: ready-to-render Marketing Insight Markdown with
  `crf5c_entitytype = account`, `biz_type = marketing`, and a 30-day expiry.

The agent does not use the `crf5c_businessinsights` table and does not create a
parallel snapshot format inside `account.description`.

## Public master fields updated

Standard `account` fields, updated from official or high-confidence sources:

- `websiteurl`: official website URL.
- `telephone1`: main public phone number.
- `emailaddress1`: main public or general contact email.
- `address1_line1`, `address1_city`, `address1_stateorprovince`,
  `address1_country`, `address1_postalcode`: official registered or HQ address.
- `industrycode`: mapped to the closest existing Dataverse industry option-set
  value. If no option is a reasonable match, `industrycode` is left unchanged and
  the public industry may be noted in Marketing Insight instead.

Update rules:
- Empty fields are filled.
- A non-empty field is refreshed only when an official source clearly supersedes
  the current value.
- `name`, owner, and state/status are never changed.

## Profile and Marketing Insight

- `account.description` is fully owned by enrichment and contains only a
  concise 2-4 sentence plain-text profile. Legacy `[AI-ENRICHMENT]` blocks are
  not produced.
- Marketing Insight is stored as Markdown in `crf5c_aisummary.crf5c_summary`.
  It contains industry trends, dated news and announcements, risks, and
  clickable HTTPS sources. Sales angles and next actions remain the Sales
  Insight layer's responsibility.
- Freshness is read from the matching Marketing Insight row's
  `crf5c_generatedon` / `crf5c_expireson`, not parsed from prose.

## Safety rules

- Treat web findings as public signals, not CRM truth.
- Do not invent revenue, procurement status, installed base, decision makers, or
  buying intent.
- Do not put source lists, Markdown, or change logs in `account.description`.
- Do not overwrite a non-empty public field unless an official source clearly
  supersedes it.
- Skip or downgrade confidence when entity matching is weak.
- Skip the run if the Marketing Insight row was refreshed in the last 7 days, unless
  `forceRefresh` is true.
- Do not scrape paywalled or login-only content.
- Do not store private personal data from public pages unless it is clearly
  business contact information needed for sales context.

## App visibility

The account detail page shows the enriched fields directly:

- Phone, email, address, industry, and the official website appear in the
  account header (website is a clickable link).
- The description profile is shown in the account header. Marketing Insight is
  rendered through the shared Markdown renderer from the `crf5c_aisummary` row.

The app `Account` abstraction now maps `website` to the Dataverse `websiteurl`
field (`generated/models/account-model.ts`, `AccountEntityModel.ts`, and
`services/account-service.ts`), and the account detail page both displays and
edits it.

## File map

- `instructions.md`: exact agent instructions used in Copilot Studio.
- `workflows.md`: exact workflow configuration and trigger messages.
- `test-script.md`: manual validation cases for Studio and Dataverse.
