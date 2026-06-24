---
name: manage-opportunity
description: Create or update a sales opportunity (deal). Use when the salesperson identifies a new deal, gives a deal amount, sets a close date, moves a stage, updates confidence, or notes a blocker ("create a 250k opportunity closing in July", "move the Royal London deal to negotiation", "drop confidence to 40"). Maps spoken amounts to integers, resolves the linked account, confirms, then writes to the custom Dataverse table crf5c_opportunity1.
---

# Skill: Create or update an opportunity

When this skill is activated:

1. Decide **create** vs **update**: if the user names an existing deal, update it;
   otherwise create.
2. Extract fields into the `crf5c_opportunity1` table:
   - `crf5c_name` — deal name (specific: customer + product/project).
   - `crf5c_totalamount` — integer amount. Convert: `250k`→250000, `50万`→500000,
     `1.5M`→1500000.
   - `crf5c_stage` — one of prospecting / qualification / proposal / negotiation /
     won / lost.
   - `crf5c_confidence` — 0–100.
   - `crf5c_expectedclosedate` — ISO `YYYY-MM-DD` (resolve "end of July" etc.).
   - `crf5c_lastaction`, `crf5c_blocker` — short text when mentioned.
3. Resolve the linked **account**: query `account` by `name`. If ambiguous, ask the
   user to pick; if none, offer to create it first. Bind with
   `biz_Account@odata.bind` = `/accounts(<accountId>)`.
4. Show a one-line draft (name, amount, stage, close date, account) and confirm.
5. On confirmation, create/update via the Dataverse tool.

## Guidelines
- For an update, only send the changed fields.
- If this opportunity follows from an activity just logged, reuse that activity's
  account instead of re-asking.
- "at risk" = confidence 0–49; "active/pipeline" = stage not won/lost.

## Examples
**Example 1: Create**
- User: "Royal London is interested — open a 250k deal for the N22, closing end of July."
- Behavior: create crf5c_opportunity1 { crf5c_name:"Royal London Hospital - BeneVision N22",
  crf5c_totalamount:250000, crf5c_stage:"proposal", crf5c_expectedclosedate:"2026-07-31",
  account=Royal London }. Confirm, then write.

**Example 2: Update**
- User: "把协和的单子推进到谈判阶段，信心降到 60。"
- Behavior: update matched opportunity { crf5c_stage:"negotiation", crf5c_confidence:60 }.
  Confirm, then write.

## Notes
Ownership defaults to the current user. Never overwrite `_ownerid_value`.
