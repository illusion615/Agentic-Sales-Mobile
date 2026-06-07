# `pac code add-data-source` removes existing `shared_logicflows` connector entry from `dataSourcesInfo.ts`

## Describe the issue

When running `pac code add-data-source --apiId dataverse --table <any_table>` to add a new Dataverse table, the CLI regenerates `dataSourcesInfo.ts` and removes the existing `powerappsflow_llm` connector entry (type `shared_logicflows` / Power Automate flow).

The connector entry in `power.config.json` `connectionReferences` is **not** affected — only `dataSourcesInfo.ts` loses the entry.

## Steps to Reproduce

1. Have a Code App with a Power Automate flow connector (`shared_logicflows`) already configured:
   - `power.config.json` `connectionReferences` contains an entry with `"id": "/providers/Microsoft.PowerApps/apis/shared_logicflows"` and `"dataSources": ["powerappsflow_llm"]`
   - `dataSourcesInfo.ts` contains a `powerappsflow_llm` entry with `"dataSourceType": "Connector"`
2. Run any `add-data-source` command to add a Dataverse table:
   ```bash
   pac code add-data-source --apiId dataverse --table systemuser
   ```
3. Inspect `dataSourcesInfo.ts` — the `powerappsflow_llm` entry has been removed.
4. `power.config.json` `connectionReferences` still contains the `shared_logicflows` entry (unchanged).

This is reproducible on every run. We tested 3 consecutive runs — each time the entry was removed.

## Observed behavior

1. **`powerappsflow_llm` entry removed from `dataSourcesInfo.ts`**: The CLI regenerates the file and omits the connector entry. `pac code list-connection-references --solutionId <id>` does not list `shared_logicflows` — only Dataverse, Copilot Studio, and Calendar connectors appear. Querying the `connectionreference` Dataverse entity filtered by `connectorid like '%logicflows%'` also returns 0 results.

2. **`pac code add-data-source --apiId shared_logicflows` fails**: Attempting to re-add the flow connector via CLI returns `"Invalid URI format"`:
   ```
   pac code add-data-source --apiId shared_logicflows --connectionRef <guid> --solutionId <guid>
   → Error: Invalid URI format.
   ```

3. **`src/generated/index.ts` rewritten with invalid syntax**: The CLI appends `export * as` statements using kebab-case file names as identifiers (e.g., `export * as account-model from './models/account-model'`), which are not valid TypeScript identifiers.

4. **Entry order in `dataSourcesInfo.ts` changes non-deterministically** on each run.

## Context

- The `shared_logicflows` connector was set up during the project's initial data source configuration (commit `f7a7a3b`: "phase4: pre-migration checkpoint - data source names updated, pac-generated files added"). `power.config.json` `connectionReferences` was populated with the flow binding (including `workflowDetails`), and `dataSourcesInfo.ts` was created with the `powerappsflow_llm` connector entry.
- Generated service/model files and schema were added in commit `3ce1971`.
- Between initial setup and this issue, `dataSourcesInfo.ts` was only modified via incremental edits (adding/renaming Dataverse table entries). No `pac code add-data-source` was run during that period.
- The issue surfaced when `add-data-source` was run for the first time after the flow connector was already present, triggering a full regeneration of `dataSourcesInfo.ts`.

## Environment information

- **PAC CLI**: 1.52.1+gcca51f4 (.NET 9.0.3)
- **@microsoft/power-apps**: 1.1.3
- **@microsoft/power-apps-vite**: 1.0.2
- **Node.js**: 22.22.3 (macOS ARM64)
- **OS**: macOS 15 (Apple Silicon)

## Current workaround

After every `pac code add-data-source` invocation:
1. Restore the `powerappsflow_llm` block in `dataSourcesInfo.ts` from version control.
2. Restore `src/generated/index.ts` from version control (to fix invalid identifiers).
3. Verify `power.config.json` `connectionReferences` still contains the `shared_logicflows` entry.
