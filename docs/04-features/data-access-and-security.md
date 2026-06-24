# 数据访问与多用户安全

> 反向生成自当前代码（`src/generated/services/`、`src/hooks/use-user.ts`、各创建/删除路径）。
> 描述应用如何读写 Dataverse 数据，以及多用户场景下的数据隔离模型。

## 1. 两层服务结构

数据层分为**生成层**与**适配层**两层，均位于 `src/generated/services/`：

| 层 | 文件命名 | 职责 |
| --- | --- | --- |
| 生成层 | `Crf5c_xxxService.ts`、`AccountsService.ts` 等（大驼峰） | Power Apps SDK 自动生成的原始 OData 包装，列名为 Dataverse 物理列（`crf5c_*`、`_xxx_value`）。**不要手改。** |
| 适配层 | `xxx-service.ts`（中划线小写） | 手写适配器，把物理列翻译成应用友好类型，对外只暴露 `XxxService` 静态类。 |

应用代码（hooks、页面、智能体 handler）**只调用适配层**，不直接碰生成层。

## 2. 适配层的字段翻译

每个适配器围绕三件事构建（以 `business-insight-service.ts` 为例）：

- **`FIELD_MAP`**：友好字段名 → Dataverse 列名映射，供 `mapOptions()` 在 `getAll` 时翻译 `filter`/`orderBy`/`select`。
- **`fromDv(dv)`**：把原始 OData 行映射成应用类型。
- **`toDv(record)`**：把应用类型映射回 Dataverse 写入载荷。

`_adapter-utils.ts` 提供共享原语：

| 工具 | 解决的问题 |
| --- | --- |
| `mapOptions(opts, FIELD_MAP)` | 列表查询前把友好字段名换成物理列名。 |
| `dvChoice(dv, col, numMap)` | 读 Choice 列。列表查询不投影 `<col>name`，须按 `@OData.FormattedValue → 数值映射 → <col>name` 顺序兜底。 |
| `dvLookupName(dv, '_xxx_value')` | 读 Lookup 显示名，同样依赖 `@OData.FormattedValue` 注解。 |
| `labelToDv` / `dvNum` / `numToDv` | Choice 标签 ↔ 整数（基数 `995340000`）、数值列读写。 |
| `requireId` / `requireCreated` | 边界守卫：拒绝空 id 转发；create 成功但缺主键时立即抛带诊断的错误。 |
| `createWithReadback` | 托管环境下 create 返回 204 无 body 时，按 `readbackFilter` 回读刚建记录（带重试，应对最终一致性）。 |

> **陷阱**：`retrieveMultipleRecordsAsync`（列表）不会把 `@FormattedValue` 投影进 `<col>name`，
> 所以列表里的 Choice / Lookup 必须走 `dvChoice` / `dvLookupName`，直接读 `dv.<col>name` 会得到空串。

## 3. 自定义表

- 商机使用自定义表 `crf5c_opportunity1s`（非标准 `opportunity`），适配器为 `opportunity-service.ts`。
- 业务洞察 `crf5c_businessinsights`、简报 `crf5c_briefings`、设置 `crf5c_settings`、
  会话日志 `crf5c_copilotconversations`、智能体日志 `crf5c_agentlogs` 等均为自定义表。
- 活动相关参与方走 `activityparties`（见 `src/lib/activity-party.ts`）。

## 4. 多用户安全模型

应用以 **Power Apps Code App 直连绑定 + 委派用户身份** 运行：每个用户用自己的 Dataverse
凭据访问数据。**安全裁剪由平台完成，不在客户端做。**

### 4.1 读取：平台裁剪，禁止客户端所有者过滤

- `XxxService.getAll()` 返回的结果，已由 Dataverse 按当前用户的**安全角色**裁剪
  （User / Business Unit / Organization 访问级别）。
- 因此**严禁**在客户端再加 `ownerid === currentUserId` 之类的过滤——那会与平台安全模型重复，
  并在管理者（BU/Org 级可见）场景下错误地隐藏本应可见的数据。
- 历史上曾误加客户端 owner 过滤与 `adminMode` 开关，已**全部移除**：home 的 KPI/洞察、
  `opportunity-review.tsx`、`brief.tsx`、`query-handlers.ts` 均不做所有者过滤。

### 4.2 写入：所有权落章

- 创建记录时**主动写入所有者**（当前用户的 `systemuserid`），保证新数据归属正确。
- 当前用户通过 `useUser` hook（`src/hooks/use-user.ts`）从 `systemusers` 表解析。

### 4.3 删除：限定本人范围

- 破坏性批量操作（如重新生成洞察 = 先删后建、清空）**只删除属于本人的行**，
  通过在删除前的查询条件中限定所有者实现，避免误删他人数据。

### 4.4 不变量小结

| 操作 | 谁负责隔离 | 客户端动作 |
| --- | --- | --- |
| 读取列表 | 平台（安全角色裁剪） | 不加 owner 过滤 |
| 创建 | 客户端 | 落章写入所有者 |
| 删除/重生成 | 客户端 | 仅删本人行 |

## 关键文件

- 适配器：[`apps/sales-copilot/src/generated/services/`](../../apps/sales-copilot/src/generated/services/)
- 共享原语：[`apps/sales-copilot/src/generated/services/_adapter-utils.ts`](../../apps/sales-copilot/src/generated/services/_adapter-utils.ts)
- 当前用户解析：[`apps/sales-copilot/src/hooks/use-user.ts`](../../apps/sales-copilot/src/hooks/use-user.ts)
