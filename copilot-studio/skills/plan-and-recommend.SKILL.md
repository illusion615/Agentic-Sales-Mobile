---
name: plan-and-recommend
description: Suggest a sales plan or next actions for a day or week, or recommend who to follow up with. Use when the salesperson asks "what should I focus on today", "plan my week", "who should I follow up with", "给我今天排个计划". Reads the current user's opportunities and recent activities, then proposes a prioritized, actionable plan — and offers to create the activities for confirmed items.
---

# Skill: Plan and recommend next actions

When this skill is activated:

1. Read the current user's open opportunities (`crf5c_opportunity1`, stage not
   won/lost) and recent activities (`appointment`/`phonecall`/`email`).
2. Prioritize by signal: deals closing soon (`crf5c_expectedclosedate`), high amount,
   low/declining confidence, accounts with no recent activity, named blockers.
3. Produce a short prioritized plan for the requested horizon (today / this week):
   each item = who, why now, and the suggested action (call / visit / proposal).
4. Offer to turn any item into a scheduled activity — if the user accepts, use the
   **Work IQ Calendar** tool to read the free/busy of the user (and any other
   attendees), recommend the 2–3 best open time slots, and let the user pick. Then
   hand it to the log-sales-activity skill (type, subject, date, regarding) and
   confirm before writing — which creates both the Dataverse activity and the
   matching calendar event.

## Guidelines
- Keep the plan to the few highest-impact items, not an exhaustive dump.
- Tie each recommendation to a concrete CRM fact (close date, confidence, last contact).
- When recommending *when* to do a scheduled item, base the suggested time on the
  user's and attendees' calendar availability (Work IQ Calendar), not a guess.
- Do not create any records as part of planning — only when the user confirms an item.

## Examples
**Example 1: Daily plan**
- User: "今天我该重点做什么？"
- Behavior: pull open deals + recent activity, propose 3 priorities (e.g. "协和招标本周
  截止 → 今天约谈判会议"), ask which to schedule.

**Example 2: Follow-up recommendation**
- User: "Who haven't I contacted in a while?"
- Behavior: find accounts/deals with no recent activity, list them with the last contact
  date, suggest a follow-up call for each.

## Notes
This skill recommends and schedules; it never closes or modifies deal fields itself —
that belongs to manage-opportunity.
