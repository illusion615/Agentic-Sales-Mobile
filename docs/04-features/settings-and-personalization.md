# 设置与个性化

> 反向生成自当前代码（`src/lib/i18n.ts`、`src/hooks/use-app-settings.ts`、
> `src/components/settings-panel.tsx`、`src/generated/services/setting-service.ts`）。
> 描述设置的两层存储结构与各设置分区。

## 1. 两层设置存储

设置按「作用范围」分为两层：

| 层 | 存储 | 用途 | 访问方式 |
| --- | --- | --- | --- |
| 本地偏好 | `localStorage` | 纯客户端 UI 偏好，无需跨设备同步 | `i18n.ts` 的 getter/setter + 自定义事件 |
| 共享配置 | Dataverse `crf5c_settings` 表 | 需要持久化/跨设备的应用级配置 | `use-app-settings.ts` |

### 1.1 本地偏好（i18n.ts）

`i18n.ts` 提供成对的 getter/setter，写入后派发自定义事件通知订阅组件即时刷新。
例如 Copilot 列表偏好：

- `getCopilotListDefaultView` / `setCopilotListDefaultView`
- `getCopilotListTopN` / `setCopilotListTopN`

这些偏好驱动 `record-list-card.tsx` 的 Top-N 截断与「显示全部」行为。

### 1.2 共享配置（Dataverse Settings 表）

`use-app-settings.ts` 以键值方式读写 `crf5c_settings`：

- `SETTING_KEYS` 定义well-known键，当前含
  `power_automate_flow_url`、`copilot_studio_agent_name`。
- `useAppSettings()` 读全部并按 key 取值；`useUpsertSetting()` 做 upsert
  （按 `settingKey` 找现有行 → 有则 update、无则 create，并 invalidate `setting-list` 重取）。
- `useSettingValue(key)` 读单值。
- 适配器为 `setting-service.ts`，类型 `Setting`（`settingKey`/`settingValue`/`description`/`updatedOn`）。

## 2. 设置面板分区（settings-panel.tsx）

设置面板分为若干区：

| 区 | 内容 |
| --- | --- |
| General（通用） | 日程相关偏好（agenda）等已归入此区。 |
| Style（样式） | 列表展示等子分组（含 Copilot 列表默认视图、Top-N）。 |
| AI Assistant Config（AI 助手配置） | Power Automate Flow URL、Copilot Studio Agent 名称等共享配置。 |
| Voice（语音） | 语音播报相关偏好。 |

> 已移除的设置：失效的「Organize Data in Cards」开关（i18n + 面板同步删除），
> 以及与平台安全模型冲突的 `adminMode`（`getAdminMode`/`setAdminMode` 及其 UI 已整体移除，
> 详见 [`data-access-and-security.md`](data-access-and-security.md) §4）。

## 3. 初始化

- `use-init-settings.ts` / `use-first-mount.ts` 负责首次挂载时的设置初始化与默认值落地。
- Copilot 是否已配置（Flow URL / Agent 是否就绪）由 `use-copilot-configured.ts` 判断。

## 关键文件

- 本地偏好：[`apps/sales-copilot/src/lib/i18n.ts`](../../apps/sales-copilot/src/lib/i18n.ts)
- 共享配置 hook：[`apps/sales-copilot/src/hooks/use-app-settings.ts`](../../apps/sales-copilot/src/hooks/use-app-settings.ts)
- 设置面板：[`apps/sales-copilot/src/components/settings-panel.tsx`](../../apps/sales-copilot/src/components/settings-panel.tsx)
- 设置适配器：[`apps/sales-copilot/src/generated/services/setting-service.ts`](../../apps/sales-copilot/src/generated/services/setting-service.ts)
