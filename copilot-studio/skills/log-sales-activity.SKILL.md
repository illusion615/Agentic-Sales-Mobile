---
name: log-sales-activity
description: Record a sales activity that happened or is planned — a customer visit, phone call, meeting, or email. Use whenever the salesperson describes a touchpoint with a customer ("I visited...", "called Dr. Lisa", "met with...", "schedule a visit next Tuesday"). Extracts a specific title, type, account, contact, date, and notes, confirms with the user, then writes to the correct native Dataverse activity table (appointment / phonecall / email).
---

# Skill: Log a sales activity

When this skill is activated:

1. Identify the activity **type**: visit/meeting → `appointment`, call → `phonecall`,
   email → `email`.
2. Build a **specific `subject`** (title): include customer + topic + product, e.g.
   "Royal London Hospital - BeneVision N22 Demo". Never use a generic title.
3. Extract `description` (notes/result), `scheduledstart` (ISO date; resolve "yesterday",
   "下周三", etc. against today), and the regarding record (account or opportunity).
4. Set `statecode`: past activity → 1 (completed); future activity → 0 (open/planned).
5. Resolve the customer name to an account (or opportunity) record by querying
   `account` by `name` (or `crf5c_opportunity1` by `crf5c_name`). If ambiguous, ask the
   user to pick; if none, ask whether to create it or skip the link.
6. **Future activities (`statecode` = 0) — check the calendar.** Before confirming a
   time, use the **Work IQ Calendar** tool to check the user's (and any named
   attendees') availability for that slot. If the slot is busy, say so and offer the
   nearest free alternatives. If the user gave no specific time, recommend 2–3 best
   open slots and let them pick.
7. Show a one-line draft of what will be written and ask for confirmation. For a
   future activity, include the calendar event in the draft (time + attendees) and
   the availability result.
8. On confirmation, create the record via the Dataverse tool, binding the regarding
   record with `regardingobjectid_opportunity@odata.bind` or
   `regardingobjectid_account@odata.bind`. **For a future activity, ALSO create the
   matching Work IQ Calendar event** (same subject, start time, attendees). A past
   activity (`statecode` = 1) writes only to Dataverse — never create a calendar
   event for something that already happened.

## Guidelines
- Ownership defaults to the current user; do not set `_ownerid_value`.
- If the user mentions a deal/opportunity in the same breath, that is a *separate*
  intent — hand it to the manage-opportunity skill after the activity is logged.
- Put any valuable context that does not fit a field into `description`.

## Examples
**Example 1: Past visit**
- User: "Logged a visit to Royal London yesterday, discussed the N22 with Dr. Lisa."
- Behavior: type=appointment, subject="Royal London Hospital - BeneVision N22 Discussion",
  scheduledstart=yesterday, statecode=1, regarding=account(Royal London). Confirm, then write.

**Example 2: Planned call**
- User: "提醒我下周三给协和医院打个电话跟进招标。"
- Behavior: type=phonecall, subject="协和医院 - 招标跟进电话", scheduledstart=next Wed,
  statecode=0, regarding=account(协和医院). Check the user's calendar for that time via
  Work IQ Calendar; if busy, offer alternatives. Confirm, then write the Dataverse
  record AND create the matching calendar event.

**Example 3: Future visit, no fixed time**
- User: "帮我下周安排一次去 Royal London 的拜访。"
- Behavior: type=appointment, subject="Royal London Hospital - 拜访", statecode=0,
  regarding=account(Royal London). No time given → use Work IQ Calendar to read the
  user's free/busy next week, propose 2–3 best slots, let the user pick, then write
  the Dataverse record AND create the calendar event.

## Notes
List activities by querying `appointment`, `phonecall`, and `email` together and
merging by `scheduledstart` descending.
