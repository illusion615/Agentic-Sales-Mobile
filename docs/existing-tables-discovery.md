# Existing Tables Discovery — Sales Copilot Mobile CRM
## Task: existing-tables-discovery
**App:** Sales Copilot Mobile  
**Date:** 2025-05-01  
**Scope:** Account, Opportunity, Activity, AgentLog

---

## Understanding

The Sales Copilot Mobile app needs four data entities. The goal of this discovery is to determine, for each entity, whether a standard Dataverse OOB (out-of-the-box) table, a Dynamics 365 table, or a SharePoint list already exists with a compatible schema — so the team can **reuse instead of reinvent**, and only create net-new custom tables where nothing suitable exists.

---

## 1. Account Table

### Standard Dataverse OOB Table: `account`

| Property | Detail |
|---|---|
| **Logical name** | `account` |
| **Display name** | Account |
| **Schema prefix** | (core — no publisher prefix needed) |
| **Primary key** | `accountid` (GUID) |
| **Primary name** | `name` |
| **Availability** | Every Dataverse/D365 environment — always present |

#### Key Columns Available OOB

| Column | Logical Name | Type | CRM Relevance |
|---|---|---|---|
| Account Name | `name` | Text | ✅ Required |
| Account Number | `accountnumber` | Text | ✅ |
| Phone | `telephone1` | Phone | ✅ |
| Email | `emailaddress1` | Email | ✅ |
| Website | `websiteurl` | URL | ✅ |
| Industry | `industrycode` | OptionSet | ✅ |
| Annual Revenue | `revenue` | Currency | ✅ |
| Employees | `numberofemployees` | Integer | ✅ |
| Address (full) | `address1_*` | Compound | ✅ |
| Parent Account | `parentaccountid` | Lookup(account) | ✅ Hierarchy |
| Owner | `ownerid` | Owner | ✅ |
| Description | `description` | Memo | ✅ |
| Status | `statecode` / `statuscode` | State/Status | ✅ |
| Created On | `createdon` | DateTime | ✅ |
| Modified On | `modifiedon` | DateTime | ✅ |

#### SharePoint Equivalent
SharePoint has no native Account table. Teams/SharePoint lists can approximate it, but lack relational lookups, currency handling, and auditing that Dataverse provides natively.

#### ✅ Verdict: **REUSE — Standard Dataverse `account` table**
- Zero setup cost; already provisioned in every Dataverse environment.
- Power Apps, Power Automate, and Copilot connectors have first-class `account` bindings.
- Add app-specific columns with the `scm_` publisher prefix if needed (e.g., `scm_mobilepriority`).

---

## 2. Opportunity Table

### Standard Dataverse OOB Table: `opportunity`

| Property | Detail |
|---|---|
| **Logical name** | `opportunity` |
| **Display name** | Opportunity |
| **Schema prefix** | (core) |
| **Primary key** | `opportunityid` (GUID) |
| **Primary name** | `name` |
| **Availability** | Every Dataverse environment (Sales module) |

#### Key Columns Available OOB

| Column | Logical Name | Type | CRM Relevance |
|---|---|---|---|
| Opportunity Name | `name` | Text | ✅ Required |
| Account | `parentaccountid` | Lookup(account) | ✅ |
| Contact | `parentcontactid` | Lookup(contact) | ✅ |
| Customer | `customerid` | Customer (poly) | ✅ |
| Est. Revenue | `estimatedvalue` | Currency | ✅ |
| Est. Close Date | `estimatedclosedate` | Date | ✅ |
| Probability | `closeprobability` | Integer (%) | ✅ |
| Sales Stage | `salesstage` | OptionSet | ✅ |
| Pipeline Phase | `stepname` | Text | ✅ |
| Actual Revenue | `actualvalue` | Currency | ✅ |
| Actual Close Date | `actualclosedate` | Date | ✅ |
| Owner | `ownerid` | Owner | ✅ |
| Description | `description` | Memo | ✅ |
| Status | `statecode` / `statuscode` | State/Status | ✅ |
| Source | `leadsourcecode` | OptionSet | ✅ |
| Created On | `createdon` | DateTime | ✅ |
| Modified On | `modifiedon` | DateTime | ✅ |

#### SharePoint Equivalent
SharePoint lists can hold opportunity-like data but cannot enforce currency fields, rollup calculations, or the polymorphic Customer lookup that ties to both Account and Contact.

#### ✅ Verdict: **REUSE — Standard Dataverse `opportunity` table**
- Native relationship to `account` and `contact` already wired.
- Built-in pipeline/stage OptionSet values align with standard sales processes.
- Copilot for Sales and Sales Insights features plug in directly to this table.
- Add app-specific columns with `scm_` prefix as needed (e.g., `scm_mobilelaststep`).

---

## 3. Activity Table

### Standard Dataverse OOB Table Hierarchy: `activitypointer` + subtypes

Dataverse models activities as a **polymorphic hierarchy**:

```
activitypointer  (abstract base — logical name: activitypointer)
  ├── phonecall        (Phone Call)
  ├── email            (Email)
  ├── task             (Task)
  ├── appointment      (Appointment)
  ├── socialactivity   (Social Activity)
  ├── letter           (Letter)
  └── fax              (Fax)
```

| Property | Detail |
|---|---|
| **Base logical name** | `activitypointer` |
| **Primary key** | `activityid` (GUID, shared across all subtypes) |
| **Primary name** | `subject` |
| **Availability** | Every Dataverse environment |

#### Key Columns on `activitypointer` (inherited by all subtypes)

| Column | Logical Name | Type | CRM Relevance |
|---|---|---|---|
| Subject | `subject` | Text | ✅ Required |
| Description | `description` | Memo | ✅ |
| Regarding | `regardingobjectid` | Polymorphic Lookup | ✅ Links to Account/Opportunity/Contact |
| Activity Type | `activitytypecode` | OptionSet | ✅ Auto-set per subtype |
| Owner | `ownerid` | Owner | ✅ |
| Priority | `prioritycode` | OptionSet | ✅ |
| Scheduled Start | `scheduledstart` | DateTime | ✅ |
| Scheduled End | `scheduledend` | DateTime | ✅ |
| Actual Start | `actualstart` | DateTime | ✅ |
| Actual End | `actualend` | DateTime | ✅ |
| Duration | `actualdurationminutes` | Integer | ✅ |
| Status | `statecode` / `statuscode` | State/Status | ✅ |
| Created On | `createdon` | DateTime | ✅ |

#### Mobile App Recommendation for Activity

For a **mobile CRM app**, the recommended pattern is:

| Use Case | Recommended Table | Reason |
|---|---|---|
| Log a phone call | `phonecall` | Native dialer integration, call duration |
| Schedule a meeting | `appointment` | Calendar sync (Teams/Outlook) |
| Create a to-do | `task` | Simple checklist with due date |
| Generic activity | `activitypointer` (read-only view) | Unified timeline across all types |

#### SharePoint Equivalent
SharePoint has no activity hierarchy. A flat list can approximate tasks but cannot link to multiple entity types polymorphically or sync with Outlook/Teams calendar natively.

#### ✅ Verdict: **REUSE — Standard Dataverse `activitypointer` + subtypes**
- The `regardingobjectid` field creates the unified timeline on Accounts and Opportunities automatically.
- Power Apps `Timeline` control binds directly to activitypointer.
- For the mobile app, surface `task`, `phonecall`, and `appointment` as the primary three activity types; use `activitypointer` for the unified list/timeline view.
- Add app-specific columns with `scm_` prefix if needed (e.g., `scm_aisuggested` flag).

---

## 4. AgentLog Table

### Standard Dataverse / SharePoint: **No OOB Equivalent Found**

Extensive search of:
- Dataverse standard tables (400+ OOB tables in D365 CE/Sales)
- Microsoft Copilot Studio audit tables
- Azure AI / Cognitive Services Dataverse connectors
- SharePoint template lists

**None provide a purpose-built AI agent interaction log** with the combination of:
- Session tracking
- LLM model metadata (model name, token count, latency)
- Bidirectional payload capture (input/output)
- Polymorphic "regarding" link to CRM entities
- Mobile agent action type classification

The closest existing options and why they fall short:

| Candidate | Why Insufficient |
|---|---|
| `msdyn_aiodtrainingboundingbox` | Azure AI Object Detection training metadata — unrelated |
| `msdyn_aibfeedbackloop` | Copilot Studio conversation feedback — no payload/token fields |
| `msdyn_conversationtranscript` | Stores full chat transcripts, not structured agent action logs |
| `audit` (Dataverse Audit Log) | System-level row change audit only — no AI semantics |
| SharePoint list | No schema enforcement, no GUID relationships, no token/latency fields |

#### ❌ Verdict: **CREATE NEW — Custom `scm_agentlog` table required**

Recommended schema for the new custom table:

| Column | Logical Name | Type | Purpose |
|---|---|---|---|
| Agent Log ID | `scm_agentlogid` | GUID (PK) | Primary key |
| Session ID | `scm_sessionid` | Text(100) | Groups related actions in one user session |
| Agent Name | `scm_agentname` | Text(100) | Identifies which AI agent acted |
| User | `scm_userid` | Lookup(systemuser) | Who triggered the agent |
| Regarding Account | `scm_regardingaccountid` | Lookup(account) | Context entity — account |
| Regarding Opportunity | `scm_regardingopportunityid` | Lookup(opportunity) | Context entity — opportunity |
| Action Type | `scm_actiontype` | OptionSet | e.g. Summarize, Draft, Recommend, Search |
| Input Payload | `scm_inputpayload` | Memo (JSON) | Prompt / input sent to model |
| Output Payload | `scm_outputpayload` | Memo (JSON) | Response received from model |
| Model Name | `scm_modelname` | Text(100) | e.g. gpt-4o, phi-3-mini |
| Token Count | `scm_tokencount` | Integer | Total tokens consumed |
| Latency (ms) | `scm_latencyms` | Integer | Round-trip latency in milliseconds |
| Success | `scm_issuccess` | Boolean | Did the agent action succeed? |
| Error Message | `scm_errormessage` | Memo | Error detail if failed |
| Created On | `createdon` | DateTime (OOB) | Auto-set by Dataverse |
| Owner | `ownerid` | Owner (OOB) | Auto-set to creating user |

**OptionSet values for `scm_actiontype`:**
- 100000000 = Summarize
- 100000001 = DraftEmail
- 100000002 = Recommend
- 100000003 = Search
- 100000004 = AnswerQuestion
- 100000005 = DataUpdate
- 100000006 = Escalate

---

## 5. Summary Decision Matrix

| Entity | OOB Dataverse Table | SharePoint Equivalent | Decision | Action Required |
|---|---|---|---|---|
| **Account** | ✅ `account` — full schema match | ⚠️ Approximation only | **REUSE OOB** | Add `scm_` custom columns if needed |
| **Opportunity** | ✅ `opportunity` — full schema match | ⚠️ Approximation only | **REUSE OOB** | Add `scm_` custom columns if needed |
| **Activity** | ✅ `activitypointer` + subtypes — full match | ❌ No equivalent | **REUSE OOB** | Use `task`, `phonecall`, `appointment` subtypes; add `scm_` columns if needed |
| **AgentLog** | ❌ No OOB equivalent found | ❌ No equivalent | **CREATE NEW** | Build `scm_agentlog` custom table (schema defined above) |

---

## 6. Recommended Architecture

```
Dataverse Environment
│
├── account              (OOB — reuse as-is + scm_ extensions)
│     └── ← parentaccountid (self-referential hierarchy)
│
├── contact              (OOB — reuse, linked to account)
│
├── opportunity          (OOB — reuse as-is + scm_ extensions)
│     ├── → parentaccountid  (FK to account)
│     └── → parentcontactid  (FK to contact)
│
├── activitypointer      (OOB — unified timeline view)
│     ├── task           (OOB subtype — to-dos, follow-ups)
│     ├── phonecall      (OOB subtype — call logs)
│     └── appointment    (OOB subtype — meetings)
│           └── → regardingobjectid (poly FK → account | opportunity | contact)
│
└── scm_agentlog         (NEW CUSTOM — AI agent interaction log)
      ├── → scm_userid              (FK → systemuser)
      ├── → scm_regardingaccountid  (FK → account)
      └── → scm_regardingopportunityid (FK → opportunity)
```

---

## 7. Implementation Priorities

| Priority | Task | Effort |
|---|---|---|
| P0 | Register publisher prefix `scm` in Dataverse solution | 30 min |
| P0 | Create Dataverse solution `SalesCopilotMobile` | 30 min |
| P0 | Add existing OOB tables to solution (account, opportunity, activitypointer, task, phonecall, appointment) | 1 hr |
| P1 | Create `scm_agentlog` custom table with full schema | 2 hrs |
| P1 | Add `scm_` extension columns to account, opportunity, activity subtypes if gaps found | 1 hr |
| P2 | Configure table security roles for mobile app users | 1 hr |
| P2 | Configure mobile-optimized views/forms for each table | 2 hrs |

---

## 8. Key Risks & Considerations

| Risk | Mitigation |
|---|---|
| Environment may not have Dynamics 365 Sales license — `opportunity` table may be absent | Verify environment type; if Sales not licensed, `opportunity` must be created as a custom `scm_opportunity` table |
| `activitypointer` requires special handling in Power Apps (not directly editable) | Use individual subtype forms (task, phonecall) for create/edit; use Timeline control for read |
| `scm_agentlog` payloads may contain PII in `inputpayload`/`outputpayload` | Apply column-level security on payload fields; consider encryption or external blob storage for large payloads |
| Token/latency metrics could generate high row volumes over time | Implement a Dataverse retention policy or archive job for `scm_agentlog` rows older than 90 days |

