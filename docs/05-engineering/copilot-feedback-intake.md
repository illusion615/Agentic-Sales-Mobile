# Copilot Feedback Intake v1

**Status:** Approved for implementation  
**Date:** 2026-07-14  
**Scope:** User feedback collection in Dataverse. GitHub synchronization is deferred.

## 1. Business outcome

A signed-in user can tell Copilot about a product bug or improvement request, review an editable structured draft, attach screenshots, explicitly confirm submission, and later see the saved feedback and its processing state. No browser-side external API call and no GitHub credential is involved.

## 2. End-to-end flow

1. A high-precision deterministic gate recognizes an explicit app-feedback prefix (`Bug:`, `Feature request:`, `问题反馈：`, etc.) before the sales Frame. A non-prefixed message qualifies only when it names this app/system and contains a bug or improvement signal.
2. The gate creates a `draftFeedback` intent from user-stated facts. Ambiguous normal sales/customer feedback remains in the sales Frame pipeline.
3. Runtime renders a blocking Feedback confirmation card.
4. User edits the draft and confirms.
5. App creates one `biz_appfeedback` row in Dataverse.
6. Image attachments are stored as Dataverse Notes (`annotation`) related to that feedback row.
7. Card becomes submitted and the feedback appears in My Feedback.
8. Future GitHub sync updates the same row; it never changes the collection contract.

## 3. Trust boundary

- The LLM may propose a draft but cannot write data.
- Only the confirmation button creates the Dataverse row.
- Repository owner/name and GitHub credentials are not accepted from the user or model.
- v1 stores no full conversation transcript, tenant ID, object ID, CRM GUID, access token, or full diagnostics dump.
- Screenshot upload accepts images only. Other composer files stay in chat but aren't attached to feedback.
- The Dataverse row owner is the authoritative submitter identity.

## 4. Data dictionary — App Feedback

| App field | Dataverse column | Type | Required | Purpose |
|---|---|---:|:---:|---|
| id | `biz_appfeedbackid` | GUID | system | Record identity |
| title | `biz_title` | Text 200 | yes | Primary name and issue summary |
| type | `biz_feedbacktype` | Text 30 | yes | Canonical `bug` or `enhancement` |
| description | `biz_description` | Multiline 10000 | yes | Actual behavior/problem or requested change |
| expectedOutcome | `biz_expectedoutcome` | Multiline 5000 | no | Expected behavior/user outcome |
| reproductionSteps | `biz_reproductionsteps` | Multiline 10000 | no | Reproduction steps for bugs |
| currentPage | `biz_currentpage` | Text 300 | no | Product page context, no record IDs |
| appVersion | `biz_appversion` | Text 30 | yes | Release version |
| buildId | `biz_buildid` | Text 100 | yes | Build fingerprint |
| locale | `biz_locale` | Text 20 | yes | Selected app locale |
| device | `biz_device` | Text 200 | no | Coarse device model |
| os | `biz_os` | Text 100 | no | Operating system |
| browser | `biz_browser` | Text 100 | no | Browser/WebView |
| source | `biz_source` | Text 30 | yes | Canonical `copilot` or `manual` |
| status | `biz_submissionstatus` | Text 30 | yes | `collected`, future `submitting/submitted/failed/duplicate` |
| clientRequestId | `biz_clientrequestid` | Text 100 | yes | Idempotency/correlation key |
| submittedOn | `biz_submittedon` | DateTime | yes | User-confirmation time |
| githubIssueNumber | `biz_githubissuenumber` | Integer | no | Reserved for future sync |
| githubIssueUrl | `biz_githubissueurl` | URL/Text 500 | no | Reserved for future sync |
| syncError | `biz_syncerror` | Multiline 4000 | no | Explicit future sync error |
| owner | system Owner | Lookup | system | Submitter and row-level security |
| screenshots | Notes relationship | File notes | no | Image screenshots, separate from row |

The table is user-owned and Notes-enabled. `clientRequestId` is generated once per card and carried through retries.

## 5. UI contract

### Feedback card

Editable fields:
- Type: Bug / Improvement
- Title
- Description
- Expected outcome
- Reproduction steps (bug only)
- Screenshot preview/count

Actions:
- Cancel: no row is created; queue advances.
- Submit: create row, upload screenshots, then mark card submitted.
- If row create fails, card stays pending with a visible error.
- If one screenshot upload fails after row creation, record remains collected and card reports the partial attachment failure.

### My Feedback

Displays the current user's records, newest first:
- type, title, status, submitted time
- screenshot count when available
- future GitHub link when populated

## 6. Reliability

- React Query invalidates `app-feedback-list` after create.
- Dataverse create uses a unique `clientRequestId` read-back filter because hosted Code Apps can return HTTP 204 with no body.
- Attachment blobs stay in memory only until confirmation; chat history stores metadata only.
- No external fallback hides a Dataverse failure.

## 7. Test plan

1. Unit tests validate the deterministic gate, Frame fallback schema, draft mapping, safe diagnostics, query mapping, and screenshot assignment.
2. `pnpm test:dataverse:feedback` runs an authenticated reversible smoke test: create feedback, verify current-owner filtering, create and verify an image Note, then delete and verify cleanup in `finally`.
3. Authenticated UI verification uses the VS Code integrated browser, which already carries the shared Microsoft session. For Code App host behavior, `pnpm test:publish` builds and pushes once, extracts the fresh cache-keyed play URL from CLI output, and saves it in `.test-runtime/latest-play-url.txt`; the browser opens that generated URL automatically rather than asking a person to copy or manage `sourcetime`.
4. The hosted UI check verifies that an explicit screenshot-backed bug opens the feedback card without a Frame call. Final release acceptance reuses the same generated URL only after unit and reversible Dataverse gates pass.
