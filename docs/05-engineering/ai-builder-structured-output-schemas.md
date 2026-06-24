# AI Builder 结构化输出 Schema 约定

> 目的：把门户里两个结构化 AI Builder custom prompt 的输出 schema 与客户端 Zod 校验对齐，
> 消除 100% 必然发生的 json/dag → text 回退重试，使每个用户消息的 LLM 调用从 4 次降回 2 次。
>
> 客户端校验位置：
> - Frame：`src/lib/frame.ts` → `FrameResultSchema`
> - Orchestrator：`src/lib/dag-schema.ts` → `DagPlanSchema` / `SingleIntentSchema`
>
> 客户端有大量 `preprocess` 容错（relatesTo 多形态、confidence 字符串、dependsOn 逗号串等），
> 但 schema 应约定**最干净的理想形态**，让结构化输出直接产出它；容错逻辑作为兜底保留不动。

---

## 1) Frame prompt（responseFormat = `json`）

GUID: `msdyn_aibdptcustomprompt124202362324ambbd51cc43b914f54958cd773f856a323`

顶层必须是一个对象，含 `intents` 数组（≥1）。这是当前服务端 schema 缺失 `intents` 导致每次失败的根因。

### JSON Schema（粘到门户的结构化输出定义）

```json
{
  "type": "object",
  "properties": {
    "intents": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "salesObject": {
            "type": "string",
            "enum": ["Account", "Contact", "Opportunity", "Activity", "Product", "None"]
          },
          "cognitiveTask": {
            "type": "string",
            "enum": ["Log", "Plan", "Find", "Update", "Recommend", "Analyze", "Knowledge", "Report", "Chat"]
          },
          "temporal": {
            "type": "string",
            "enum": ["past", "future", "none"]
          },
          "summary": { "type": "string" },
          "relatesTo": {
            "type": "array",
            "items": { "type": "integer" }
          },
          "userFacingLabel": {
            "type": "object",
            "properties": {
              "zh": { "type": "string" },
              "en": { "type": "string" }
            },
            "required": ["zh", "en"]
          }
        },
        "required": ["salesObject", "cognitiveTask", "temporal", "summary", "relatesTo"]
      }
    },
    "explicitNames": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "enum": ["account", "contact", "opportunity", "product"] },
          "text": { "type": "string" }
        },
        "required": ["kind", "text"]
      }
    },
    "contextSufficient": { "type": "boolean" },
    "reasoning": { "type": "string" },
    "confidence": { "type": "integer", "minimum": 0, "maximum": 100 }
  },
  "required": ["intents", "confidence"]
}
```

### 字段约定要点（务必在 prompt 指令里同步强调）

- `intents`：**永远是数组**，单意图也是 1 个元素。
- `relatesTo`：**0 基整数数组**，指向同数组里其它 intent 的下标（依赖关系）。
  - 必须输出纯整数 `[0]`，不要 `[{"item":0}]` / `["0"]`（客户端能容错但不要依赖）。
  - 无依赖时输出 `[]`。
- `temporal`：Log 用 `past`，Plan/Update 未来用 `future`，Find/Analyze 等用 `none`。
- `summary`：一句话描述该意图（用于 UI 即时反馈，要业务化、具体）。
- `userFacingLabel`：可选；`{zh, en}`，zh ≤8 字 / en ≤4 词的短标签。
- `confidence`：0–100 **整数**（不要字符串）。
- `explicitNames`：用户在消息里点名的实体（如 "King's Hospital"）。
- `boundEntities`：**不要让模型输出**——它由前端注入页面绑定实体，模型产出会被忽略。

### 单意图示例输出

```json
{
  "intents": [
    {
      "salesObject": "Activity",
      "cognitiveTask": "Plan",
      "temporal": "future",
      "summary": "Plan a product-introduction meeting with King's Hospital next Wednesday",
      "relatesTo": [],
      "userFacingLabel": { "zh": "约会议", "en": "Plan meeting" }
    }
  ],
  "explicitNames": [{ "kind": "account", "text": "King's Hospital" }],
  "contextSufficient": false,
  "reasoning": "User wants to schedule a future meeting tied to an account.",
  "confidence": 90
}
```

### 多意图示例（带依赖）

```json
{
  "intents": [
    {
      "salesObject": "Activity", "cognitiveTask": "Log", "temporal": "past",
      "summary": "Log today's visit to Royal London Hospital", "relatesTo": [],
      "userFacingLabel": { "zh": "记录拜访", "en": "Log visit" }
    },
    {
      "salesObject": "Opportunity", "cognitiveTask": "Plan", "temporal": "future",
      "summary": "Draft a new opportunity from the interest expressed", "relatesTo": [0],
      "userFacingLabel": { "zh": "新建商机", "en": "Draft opportunity" }
    }
  ],
  "explicitNames": [{ "kind": "account", "text": "Royal London Hospital" }],
  "contextSufficient": false,
  "reasoning": "Past visit plus a forward-looking opportunity that depends on it.",
  "confidence": 85
}
```

---

## 2) Orchestrator prompt（responseFormat = `dag`）

GUID: `msdyn_aibdptcustomprompt228202435537pmbd0d86826d054e2ba9efc694a371f6fb`

顶层必须是一个对象，含 `steps` 数组（≥1）。

### JSON Schema（粘到门户的结构化输出定义）

```json
{
  "type": "object",
  "properties": {
    "steps": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "seq": { "type": "integer", "minimum": 1 },
          "outputRef": { "type": "string" },
          "dependsOn": {
            "type": "array",
            "items": { "type": "string" }
          },
          "function": { "type": "string" },
          "arguments": { "type": "object" },
          "usePageContext": { "type": "boolean" }
        },
        "required": ["seq", "function", "arguments"]
      }
    }
  },
  "required": ["steps"]
}
```

### 字段约定要点

- `steps`：**永远是数组**，单步也是 1 个元素（不要退化成 `{function, arguments}` 顶层对象——
  客户端 `SingleIntentSchema` 能容错，但统一用 `steps[]` 最稳）。
- `seq`：执行顺序整数（≥1）。**同 seq 并行**，高 seq 等低 seq 完成。
- `dependsOn`：**字符串数组**（如 `["$opp"]`），不要逗号串 `"$opp,$act"`。无依赖省略或 `[]`。
- `outputRef`：本步输出的引用名（如 `"$opp"`），供后续步骤 `$opp.id` 引用。
- `arguments`：**对象**（不要 JSON 字符串）。可含 `$ref.field` 占位符。
- `usePageContext`：可选布尔；为 true 时跳过 Dataverse 查询、用页面上下文数据。

### 单步示例输出

```json
{
  "steps": [
    {
      "seq": 1,
      "function": "draftActivity",
      "arguments": {
        "title": "King's Hospital - Product Introduction Meeting",
        "type": "meeting",
        "accountName": "King's Hospital",
        "scheduledDate": "2026-06-17"
      }
    }
  ]
}
```

### 多步示例（带依赖与引用）

```json
{
  "steps": [
    {
      "seq": 1,
      "outputRef": "$opp",
      "function": "draftOpportunity",
      "arguments": { "name": "Royal London - ICU Monitors", "accountName": "Royal London Hospital" }
    },
    {
      "seq": 2,
      "dependsOn": ["$opp"],
      "function": "draftActivity",
      "arguments": {
        "title": "Demo follow-up",
        "type": "meeting",
        "opportunityName": "$opp.name",
        "scheduledDate": "2026-06-18"
      }
    }
  ]
}
```

---

## 3) 更新后验证清单

更新两个 prompt 的结构化输出 schema 后，逐项确认：

1. **Frame 不再回退**：发一条消息，控制台不再出现 `[FrameShadow] Zod validation failed: intents: Required`。
2. **Orchestrator 不再回退**：控制台 dag 调用后不再紧跟一次 text 调用。
3. **每请求 LLM 调用数 = 2**：一条简单指令的 `[AI Tool] Invoking prompt` 日志应只有 2 行（json + dag），不再是 4 行。
4. **多意图仍正确**：测一条"记录拜访 + 新建商机"，确认 `intents` 有 2 个元素、`steps` 有 2 步、依赖关系正确。
5. **回退仍可用（保险）**：客户端的 text 回退逻辑保留不删——万一结构化输出再次漂移，仍能兜底，只是不应再被触发。

---

## 4) 代码端备注（无需改动，仅说明）

- 客户端的 `preprocess` 容错（relatesTo 多形态、confidence 字符串、dependsOn 逗号串、arguments JSON 字符串）
  **全部保留**。它们是防御层，不和本约定冲突。
- `boundEntities` 由前端注入，schema 里**不要求模型产出**。
- text 回退分支（frame.ts L401、orchestrator.ts L274）保留，作为结构化输出再次漂移时的安全网。
