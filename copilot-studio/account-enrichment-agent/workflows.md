# Account Enrichment Workflows

This file records the Studio workflow configuration for the Account Enrichment
Agent. The workflows keep orchestration simple and let the agent perform the
Dataverse read, the freshness check, the web research, the public-field updates,
and the description snapshot write.

## Workflow 1: Account Enrichment - Account Changed

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
- The workflow is published and ready in Studio.
- The `description` column is intentionally not in the trigger columns, so the
  agent rewriting its own snapshot block does not re-trigger the workflow.

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
  "selectionPolicy": "Use the Microsoft Dataverse MCP Server to find active accounts. Prioritize accounts with no AI enrichment block in their description, accounts whose enrichment block Updated timestamp is older than 30 days, and accounts missing key public fields such as websiteurl, telephone1, or address. Skip accounts whose enrichment block was updated in the last 7 days. For each account, update missing or clearly superseded public master fields and refresh the description enrichment block."
}
```

Notes:
- The workflow is published and ready in Studio.
- Keep `maxAccounts` conservative until runtime quality and Copilot credit usage
  are measured.

## Follow-up hardening

- `websiteurl` is now surfaced in the app `Account` abstraction and shown on the
  account detail page. The enrichment block in `description` is rendered as a
  dedicated Public Intelligence card.
- Add a manual refresh workflow later if the app needs an explicit `Refresh`
  button on the account page.
