---
name: manage-account-contact
description: Create or update a customer account or a contact person. Use when the salesperson adds a new customer organization, adds or updates a contact (name, title, phone, email), or links a contact to an account ("add a new hospital account", "Dr. Lisa is the new head of cardiology, add her under Royal London", "update the phone for...". Resolves the parent account, confirms, then writes to the standard Dataverse account and contact tables.
---

# Skill: Manage accounts and contacts

When this skill is activated:

1. Decide whether the user means an **account** (organization) or a **contact** (person),
   and whether to **create** or **update**.
2. Account → table `account`: `name`, `telephone1` (phone), `emailaddress1` (email),
   `industrycode` (industry), `address1_line1` (address), `description` (notes).
3. Contact → table `contact`: `fullname`, `jobtitle` (title), `telephone1` (phone),
   `emailaddress1` (email), parent account via `_parentcustomerid_value`
   (bind `parentcustomerid_account@odata.bind` = `/accounts(<id>)`).
4. For a contact, resolve the **parent account** by querying `account` by `name`.
   If ambiguous, ask; if none, offer to create the account first.
5. Show a one-line draft and confirm.
6. On confirmation, create/update via the Dataverse tool.

## Guidelines
- For updates, send only changed fields and match the existing record first by name.
- Keep notes/extra context in `description` (account).
- Ownership defaults to the current user; never set `_ownerid_value`.

## Examples
**Example 1: New contact under an account**
- User: "Dr. Lisa Chen is the new cardiology head at Royal London — phone 020-7188-7188."
- Behavior: resolve account "Royal London", create contact { fullname:"Lisa Chen",
  jobtitle:"Head of Cardiology", telephone1:"020-7188-7188", parent=Royal London }.
  Confirm, then write.

**Example 2: New account**
- User: "新增一个客户：上海瑞金医院，电话 021-64370045。"
- Behavior: create account { name:"上海瑞金医院", telephone1:"021-64370045" }. Confirm,
  then write.

## Notes
If the user adds a customer and a deal in the same message, treat them as separate
intents: create the account first, then hand the deal to the manage-opportunity skill.
