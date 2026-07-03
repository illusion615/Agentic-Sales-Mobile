# 多语言翻译导出 / 导入工作流（i18n Translation Workflow）

> 适用范围：`apps/sales-copilot`（Power Apps Code App）的界面多语言（i18n）。
> 目标读者：开发 / 维护者，以及负责把翻译发给客户校对的人。
> 最后更新：2026-06-26。

---

## 1. 设计原则：运行时与校对解耦

界面文案有两个互不相同的诉求，**用两种格式分开承载**，不要让一个文件同时干两件事：

| 用途 | 格式 | 位置 | 优化目标 |
| --- | --- | --- | --- |
| **程序运行时加载** | 每语言一个扁平 JSON | `apps/sales-copilot/src/locales/*.json` | 解析快、体积小、类型安全 |
| **业务用户校对** | 每语言一个 Excel | `apps/sales-copilot/i18n-review/*.xlsx`（脚本生成，已 gitignore） | 非技术人员零学习成本、源译并排、防误改 |

中间靠两个脚本同步：`导出 → 客户用 Excel 校对 → 导入`。运行时 JSON 始终保持干净，从不手写两份。

### 语言清单

| Locale | 角色 |
| --- | --- |
| `zh-Hans` | 中文（产品原文 / 源语言） |
| `en-US` | 英文（国际源语言，校对参照基准） |
| `de-DE` / `fr-FR` / `es-ES` | 目标语言（业务用户校对的对象） |

所有语言的 JSON **键集合必须完全一致**（当前 607 个键 × 5 语言）。

---

## 2. 涉及的文件

```
apps/sales-copilot/
├── src/locales/
│   ├── zh-Hans.json      # 运行时词典（源）
│   ├── en-US.json
│   ├── de-DE.json
│   ├── fr-FR.json
│   └── es-ES.json
├── scripts/
│   ├── i18n-export.mjs   # 导出 Excel
│   └── i18n-import.mjs   # 导入 Excel → JSON
└── i18n-review/          # 生成的 Excel（gitignore，不入库）
    ├── review-de-DE.xlsx
    ├── review-fr-FR.xlsx
    └── review-es-ES.xlsx
```

- `src/lib/i18n.ts` 把 5 个 JSON 导入合并为 `translations`，并由 `keyof typeof zhHans` 推导出 `TranslationKey`。组件里统一用 `t('key', locale, params)` 取词。
- 依赖：`exceljs`（devDependency，仅脚本使用，不进 App 打包产物）。

> 以下命令都在 `apps/sales-copilot/` 目录下执行：
> ```bash
> cd apps/sales-copilot
> ```

---

## 3. 导出（发给客户校对）

```bash
pnpm i18n:export
```

为每个目标语言生成一个工作簿：`i18n-review/review-de-DE.xlsx` 等。把对应文件发给对应语言的业务用户。

### 表格结构（每个工作簿）

| 列 | 内容 | 是否可编辑 |
| --- | --- | --- |
| **Key** | 技术键名 | 🔒 锁定 |
| **English (source)** | 英文源文 | 🔒 锁定 |
| **中文 (参考)** | 中文参考 | 🔒 锁定 |
| **`<Language>` — edit here** | 目标语言译文（已预填机翻，**高亮**） | ✅ 业务用户改这里 |
| **Placeholders to keep** | 必须保留的占位符（如 `{num}`） | 🔒 锁定 |
| **Notes (optional)** | 备注 | ✅ 可选填写 |

- 工作表已**保护**：除「译文列」和「备注列」外全部锁死，业务用户改不动 key / 源文 / 占位符，杜绝误删。
- 首行 + 首列冻结，带筛选器。

### 给业务用户的说明（随文件转达）

1. **只改高亮的「— edit here」那一列**，其它列不用动。
2. **占位符必须原样保留**：像 `{num}`、`{days}`、`{count}`、`{name}` 这种大括号片段是程序动态填值的位置，不能翻译、不能删除、不能改大括号里的英文。例：`Smart Insight #{num}` → 德语 `Smart Insight #{num}`（`{num}` 保持不变）。
3. 改完保存，把文件发回。

---

## 4. 导入（回填到程序）

把客户改好的 `review-*.xlsx` 放回 `i18n-review/`，然后：

```bash
pnpm i18n:import
```

脚本会把译文合并回 `src/locales/<locale>.json`，并自动校验。终端输出示例：

```
✓ de-DE: applied 312, unchanged 295, empty 0, placeholder-skip 0, unknown 0
✓ fr-FR: applied 0,   unchanged 607, empty 0, placeholder-skip 0, unknown 0
✓ es-ES: applied 0,   unchanged 607, empty 0, placeholder-skip 0, unknown 0
✓ All 5 locales key-aligned (607 keys).
✓ No skipped cells.
```

### 校验规则（坏数据绝不进 App）

| 情况 | 处理 |
| --- | --- |
| 占位符集合与英文源文不一致（改坏 / 删了 `{x}`） | **跳过该条 + 报警**，保留原值 |
| 译文单元格为空 | 跳过，保留原值 |
| 出现 JSON 里不存在的 key | 跳过 + 报警 |
| 5 个语言键数量不一致 | 最后统一报「KEY SET MISMATCH」 |

报警会逐条打印（前 20 条），按提示让客户修正后重跑即可。`applied` = 实际更新条数；幂等——同一文件重复导入第二次应为 `applied 0`。

### 关于尾随空格（已处理，无需关心）

Excel 会自动吃掉单元格末尾空格。少数文案带有意义的首尾空格（如 `Generated `、`Last: `、`, `）。导入脚本以**英文源文的首尾空格为准**自动补齐——业务用户怎么填都不会破坏空格。

---

## 5. 校对完成后：构建与发布

```bash
pnpm build          # tsc -b && vite build
# 验证 dist/index.html 时间戳为最新
export PATH="$HOME/.dotnet/tools:$PATH" && pac code push
```

> ⚠️ `pac code push` 不会重新构建，必须先 `pnpm build`。
> 构建相关纪律（冷编译耗时、Node 版本等）见 `.github/copilot-instructions.md`。

---

## 6. 维护：新增键 / 新增语言

### 新增一个文案键

1. 在 **全部 5 个** `src/locales/*.json` 里加同名键（值给对应语言译文，未译的可暂填英文）。
2. 组件里用 `t('newKey', locale)` 引用。
3. `pnpm build` 验证；键集合保持 5 语言一致。

### 新增一种语言（例：`it-IT`）

1. `src/lib/i18n.ts`：在 `Locale` 联合类型与 `LOCALE_META` 中加该语言（label / bcp47 / lang / speech）。
2. 复制 `en-US.json` 为 `src/locales/it-IT.json` 作为起点（机翻或留英文）。
3. `i18n.ts` 顶部 import 该 JSON 并加入 `translations`。
4. 两个脚本 `scripts/i18n-export.mjs` 与 `scripts/i18n-import.mjs` 的 `TARGET_LANGS` 里加上 `it-IT`。
5. `pnpm i18n:export` 生成校对表，走第 3–5 步流程。

---

## 7. 注意事项与边界

- **不进词典的字符串**（按设计保留中英内联，不做多语言）：喂给大模型的提示词、内部调试页（Frame Inspector / Shadow Mode / 代码审查页）、`currentPage`/`summary` 等页面上下文（只给 AI 用、不显示）、以及技能目录 / 新手引导这类**双语数据内容**（需扩充数据源本身，属独立内容任务）。
- 生成的 `i18n-review/` 已在 `.gitignore`，不入库；校对回填后只提交 `src/locales/*.json` 的变更。
- de/fr/es 当前为**机器翻译质量**，正等客户业务用户校对。校对回填后再 push 上线更稳妥。
- 运行时维持纯 JSON（解析最快、体积最小），是性能与可维护性的最佳点；校对走 Excel，两侧解耦互不影响。
