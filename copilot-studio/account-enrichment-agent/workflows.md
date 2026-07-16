# Account Enrichment Workflows

This file records the Studio workflow configuration for the Account Enrichment
Agent. The workflows keep orchestration simple and let the agent perform the
Dataverse read, the freshness check, the web research, the public-field updates,
the plain-text profile update, and the Marketing Insight upsert.

The app refresh button does not use either workflow. It calls the classic
Support Agent and persists that separate `fields + marketingInsight` contract.
Only the weekly workflow below is active; keeping the field-trigger workflow off
prevents two enrichment writers from racing after an on-demand account update.

## Workflow 1: Account Enrichment - Account Changed

**Status: inactive. Historical configuration only; do not enable.**

Studio URL:
`https://copilotstudio.preview.microsoft.com/environments/efcd2d46-3d9e-e31a-a9d8-5481ddae951c/flows/117c83dd-820e-c794-f0df-7a37b80dd886`

Trigger:
- Type: Connector
- Connector: Microsoft Dataverse
- Trigger: `When a row is added, modified or deleted`
- Connection: `wellszhang@D365DemoTSCE49940039.OnMicrosoft.com`
- Change type: `Added or Modified`
- Table name: `Accounts`
- Scope: `Organization`
- Select columns: `name,websiteurl,address1_city,address1_country,industrycode,telephone1,emailaddress1`
- Filter rows: `statecode eq 0`

Action:
- Type: Agent
- Agent: `Account Enrichment Agent`
- Output: `Text response`
- Message:

```text
Run account enrichment for this Dataverse account change. Use outputLanguage zh-Hans unless the payload says otherwise.

Trigger payload JSON:
{
  "triggerMode": "accountChanged",
  "accountId": "@{triggerOutputs()?['body/accountid']}",
  "accountName": "@{triggerOutputs()?['body/name']}",
  "website": "@{triggerOutputs()?['body/websiteurl']}",
  "city": "@{triggerOutputs()?['body/address1_city']}",
  "country": "@{triggerOutputs()?['body/address1_country']}",
  "industry": "@{triggerOutputs()?['body/industrycode']}",
  "ownerId": "@{triggerOutputs()?['body/_ownerid_value']}",
  "forceRefresh": false
}
```

Notes:
- The selected columns are deliberately narrow. System-only account updates should
  not trigger enrichment.
- This workflow was intentionally deactivated after the app gained an on-demand
  refresh path. Enabling it would cause the app's account update to invoke a
  second agent and overwrite or duplicate the just-saved enrichment.
- The `description` column is intentionally not in the historical trigger
  columns. The workflow remains inactive regardless.

## Workflow 2: Account Enrichment - Weekly Batch

Studio URL:
`https://copilotstudio.preview.microsoft.com/environments/efcd2d46-3d9e-e31a-a9d8-5481ddae951c/flows/b41241e1-51f4-c125-af07-23250e20685d`

Trigger:
- Type: Recurrence
- Frequency: `Week`
- Interval: `1`
- Days: `Monday`
- At these hours: `1`
- At these minutes: `0`
- Time zone: `(UTC) Coordinated Universal Time`

Action:
- Type: Agent
- Agent: `Account Enrichment Agent`
- Output: `Text response`
- Message:

```text
Run scheduled account enrichment batch.

Trigger payload JSON:
{
  "triggerMode": "scheduledBatch",
  "outputLanguage": "zh-Hans",
  "forceRefresh": false,
  "maxAccounts": 25,
  "selectionPolicy": "Use the Microsoft Dataverse MCP Server to find active accounts. Prioritize accounts with no crf5c_aisummary row where crf5c_entityid equals accountid and biz_type equals marketing, accounts whose matching row is expired, and accounts missing key public fields such as websiteurl, telephone1, or address. Skip accounts whose matching marketing row was generated in the last 7 days. For each account, update missing or clearly superseded public master fields, write a concise plain-text profile to account.description, and upsert the canonical Marketing Insight row."
}
```

Notes:
- The workflow is published and ready in Studio.
- Runtime and Designer graph prompt copies were synchronized and read back on
  `2026-07-15T00:39:44Z`; no legacy description-block instruction remains.
- Recent successful scheduled runs: `2026-07-06T01:00:41Z` and
  `2026-07-13T01:00:43Z`.
- Keep `maxAccounts` conservative until runtime quality and Copilot credit usage
  are measured.

## Contract guard

- Do not add a manual workflow for the app. The account-detail refresh button
  already uses the classic Support Agent through the app's connector.
- Do not restore description marker blocks. Both triggers share the same
  persistence semantics: profile in `account.description`, Marketing Insight in
  `crf5c_aisummary`.
