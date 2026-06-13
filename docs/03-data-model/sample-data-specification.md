# Sample Data Specification for Sales Copilot

This document defines consistent sample data across all Dataverse tables to ensure business logic works correctly.

**Reference Date:** May 3, 2026 (today)

---

## 1. Accounts (account1)

| account1_id | name | industry | tier | region | phone | email | last_contacted_on | credit_status | payment_status | owner_id |
|-------------|------|----------|------|--------|-------|-------|-------------------|---------------|----------------|----------|
| acc-001 | 华东科技有限公司 | 科技 | S | 华东 | 021-5555-1001 | contact@huadongtech.com | 2026-04-28 | 正常 | 正常 | {user_id} |
| acc-002 | 上海创新软件 | 软件 | A | 华东 | 021-5555-1002 | info@shchuangxin.com | 2026-04-18 | 正常 | 正常 | {user_id} |
| acc-003 | 北京智能制造 | 制造 | A | 华北 | 010-5555-1003 | sales@bjzhineng.com | 2026-05-02 | 正常 | 正常 | {user_id} |
| acc-004 | 深圳数字科技 | 科技 | S | 华南 | 0755-5555-1004 | hello@szdigital.com | 2026-04-20 | 预警 | 正常 | {user_id} |
| acc-005 | 成都云计算 | 云服务 | B | 西南 | 028-5555-1005 | support@cdcloud.com | 2026-05-01 | 正常 | 正常 | {user_id} |
| acc-006 | 杭州电商平台 | 电商 | A | 华东 | 0571-5555-1006 | biz@hzecom.com | 2026-04-25 | 正常 | 正常 | {user_id} |
| acc-007 | 广州物流集团 | 物流 | B | 华南 | 020-5555-1007 | ops@gzlogistics.com | 2026-03-28 | 预警 | 逾期 | {user_id} |
| acc-008 | 武汉医疗科技 | 医疗 | C | 华北 | 027-5555-1008 | admin@whmedtech.com | 2026-04-30 | 正常 | 正常 | {user_id} |

**Key Scenarios:**
- acc-002, acc-004: At-risk (14+ days no contact)
- acc-007: Critical (36 days no contact, overdue payment)
- acc-001, acc-004: Tier S high-value accounts

---

## 2. Contacts (contact)

| contact_id | full_name | account_id | title | phone | email |
|------------|-----------|------------|-------|-------|-------|
| con-001 | 陈伟 | acc-001 | CEO | 138-1234-5678 | chen.wei@huadongtech.com |
| con-002 | 李娜 | acc-001 | 采购总监 | 139-2345-6789 | li.na@huadongtech.com |
| con-003 | 王强 | acc-002 | CTO | 136-3456-7890 | wang.qiang@shchuangxin.com |
| con-004 | 张丽 | acc-003 | 项目经理 | 137-4567-8901 | zhang.li@bjzhineng.com |
| con-005 | 刘洋 | acc-004 | VP销售 | 135-5678-9012 | liu.yang@szdigital.com |
| con-006 | 赵敏 | acc-005 | 财务总监 | 138-6789-0123 | zhao.min@cdcloud.com |
| con-007 | 孙磊 | acc-006 | 运营总监 | 139-7890-1234 | sun.lei@hzecom.com |
| con-008 | 周琳 | acc-007 | 采购经理 | 136-8901-2345 | zhou.lin@gzlogistics.com |
| con-009 | 吴昊 | acc-008 | 技术总监 | 137-9012-3456 | wu.hao@whmedtech.com |
| con-010 | 郑欣 | acc-004 | 总经理 | 135-0123-4567 | zheng.xin@szdigital.com |

---

## 3. Opportunities (opportunity1)

| opportunity1_id | name | account_id | stage | total_amount | confidence | expected_close_date | closed_on | confidence_trend | blocker | owner_id |
|-----------------|------|------------|-------|--------------|------------|---------------------|-----------|------------------|---------|----------|
| opp-001 | 华东科技ERP升级项目 | acc-001 | negotiation | 280000 | 85 | 2026-05-08 | null | up | null | {user_id} |
| opp-002 | 上海创新数据中台 | acc-002 | proposal | 150000 | 60 | 2026-05-15 | null | flat | null | {user_id} |
| opp-003 | 北京智能MES系统 | acc-003 | qualification | 320000 | 40 | 2026-06-15 | null | up | null | {user_id} |
| opp-004 | 深圳数字云迁移 | acc-004 | negotiation | 420000 | 75 | 2026-05-10 | null | down | 客户预算审批中，CFO要求重新评估ROI | {user_id} |
| opp-005 | 成都云计算扩容 | acc-005 | prospecting | 80000 | 25 | 2026-07-01 | null | flat | null | {user_id} |
| opp-006 | 杭州电商平台优化 | acc-006 | proposal | 180000 | 55 | 2026-05-20 | null | up | null | {user_id} |
| opp-007 | 广州物流TMS系统 | acc-007 | won | 250000 | 100 | 2026-04-28 | 2026-04-28 | up | null | {user_id} |
| opp-008 | 武汉医疗HIS升级 | acc-008 | qualification | 95000 | 35 | 2026-06-30 | null | flat | null | {user_id} |

**Key Scenarios:**
- opp-001, opp-004: Closing this week (May 8 & May 10) - Hot Opportunities
- opp-007: Won deal this month (success story)
- opp-004: Confidence trending down with blocker (needs attention)
- Total active pipeline: ¥1,525,000 (excluding won/lost)

---

## 4. Activities (activity1)

| activity1_id | title | type | account_id | opportunity_id | scheduled_date | draft_status | outcome | notes | owner_id |
|--------------|-------|------|------------|----------------|----------------|--------------|---------|-------|----------|
| act-001 | 华东科技合同谈判 | meeting | acc-001 | opp-001 | 2026-04-28T14:00 | completed | 成功 | 客户确认采购意向，等待最终合同 | {user_id} |
| act-002 | 上海创新需求调研 | visit | acc-002 | opp-002 | 2026-04-18T10:00 | completed | 拖延 | 客户CTO出差，需重新安排 | {user_id} |
| act-003 | 北京智能现场演示 | visit | acc-003 | opp-003 | 2026-05-02T09:30 | completed | 成功 | 演示效果良好，客户反馈积极 | {user_id} |
| act-004 | 深圳数字方案汇报 | meeting | acc-004 | opp-004 | 2026-04-20T15:00 | completed | 承诺后推迟 | CFO要求补充ROI分析 | {user_id} |
| act-005 | 成都云计算初次拜访 | visit | acc-005 | opp-005 | 2026-05-01T11:00 | completed | 成功 | 建立初步联系，了解客户需求 | {user_id} |
| act-006 | 杭州电商跟进电话 | call | acc-006 | opp-006 | 2026-05-03T10:00 | confirmed | null | 确认方案细节 | {user_id} |
| act-007 | 华东科技签约会议 | meeting | acc-001 | opp-001 | 2026-05-05T14:00 | confirmed | null | 预计签约 | {user_id} |
| act-008 | 深圳数字紧急跟进 | call | acc-004 | opp-004 | 2026-05-03T14:30 | confirmed | null | 跟进预算审批进度 | {user_id} |
| act-009 | 上海创新方案修订 | visit | acc-002 | opp-002 | 2026-05-06T10:00 | confirmed | null | 重新拜访，修订方案 | {user_id} |
| act-010 | 广州物流售后回访 | visit | acc-007 | null | 2026-05-08T09:00 | confirmed | null | 项目交付后回访，确认满意度 | {user_id} |
| act-011 | 武汉医疗技术交流 | meeting | acc-008 | opp-008 | 2026-05-10T15:00 | confirmed | null | 技术方案深入讨论 | {user_id} |
| act-012 | 北京智能高层拜访 | visit | acc-003 | opp-003 | 2026-05-12T10:00 | confirmed | null | 高层关系建立 | {user_id} |

**Key Scenarios:**
- act-006, act-008: Today's scheduled activities (2 calls)
- act-001 to act-005: Completed this week (5 activities)
- act-007 to act-012: Upcoming scheduled activities

---

## 5. Tasks (task)

| task_id | title | account_id | opportunity_id | due_date | status | priority | is_overdue | overdue_reason | owner_id |
|---------|-------|------------|----------------|----------|--------|----------|------------|----------------|----------|
| task-001 | 发送华东科技合同终稿 | acc-001 | opp-001 | 2026-05-03T17:00 | 待办 | 高 | false | null | {user_id} |
| task-002 | 跟进上海创新报价反馈 | acc-002 | opp-002 | 2026-05-03T18:00 | 待办 | 高 | false | null | {user_id} |
| task-003 | 准备深圳数字预算方案 | acc-004 | opp-004 | 2026-05-03T16:00 | 进行中 | 高 | false | null | {user_id} |
| task-004 | 联系广州物流回款事宜 | acc-007 | null | 2026-04-30T17:00 | 待办 | 高 | true | 客户财务出差，多次联系未果 | {user_id} |
| task-005 | 更新北京智能项目资料 | acc-003 | opp-003 | 2026-05-05T17:00 | 待办 | 中 | false | null | {user_id} |
| task-006 | 杭州电商方案优化 | acc-006 | opp-006 | 2026-05-06T17:00 | 待办 | 中 | false | null | {user_id} |
| task-007 | 成都云计算竞品分析 | acc-005 | opp-005 | 2026-05-10T17:00 | 待办 | 低 | false | null | {user_id} |
| task-008 | 武汉医疗客户背调 | acc-008 | opp-008 | 2026-05-08T17:00 | 待办 | 中 | false | null | {user_id} |

**Key Scenarios:**
- task-001, task-002, task-003: Due today (3 tasks)
- task-004: Overdue (needs immediate attention)
- Mix of priorities: 4 high, 3 medium, 1 low

---

## 6. Business Insights (business_insight)

| business_insight_id | type | title | summary | details_json | rationale | reference_type | reference_ids_json | generated_on | valid_until | is_active | display_order | owner_id |
|---------------------|------|-------|---------|--------------|-----------|----------------|-------------------|--------------|-------------|-----------|---------------|----------|
| insight-001 | warning | 跟进提醒 | 2个客户超过14天未联系 | ["上海创新软件 - 上次联系15天前，需求调研后未跟进，CTO王强可能已与竞争对手接触", "深圳数字科技 - 上次联系13天前，预算审批中需保持沟通，避免项目搁置"] | 超过14天未联系的客户流失风险增加40%。建议本周内安排拜访。 | client | ["acc-002", "acc-004"] | 2026-05-03T06:00 | 2026-05-03T23:59 | true | 1 | {user_id} |
| insight-002 | warning | 高价值机会 | 2个大单本周即将关闭，总价值¥70万 | ["华东科技ERP升级项目 - ¥28万，5月8日截止，信心度85%，陈伟CEO已口头确认", "深圳数字云迁移 - ¥42万，5月10日截止，信心度75%但趋势下降，需解决CFO预算顾虑"] | 本周有2笔高价值交易待关闭，占月度目标60%。opp-004需重点跟进解决blocker。 | opportunity | ["opp-001", "opp-004"] | 2026-05-03T06:00 | 2026-05-03T23:59 | true | 2 | {user_id} |
| insight-003 | info | 今日行动 | 3项任务待完成，2个电话已安排 | ["发送华东科技合同终稿 - 高优先级，下午5点前完成", "跟进上海创新报价反馈 - 高优先级，联系CTO王强", "准备深圳数字预算方案 - 进行中，为下午电话做准备", "杭州电商跟进电话 - 上午10点，确认方案细节", "深圳数字紧急跟进 - 下午2:30，跟进预算审批进度"] | 今日待办事项充足，建议上午优先处理杭州电商电话，下午集中处理深圳和华东相关任务。 | client | ["acc-001", "acc-002", "acc-004", "acc-006"] | 2026-05-03T06:00 | 2026-05-03T23:59 | true | 3 | {user_id} |
| insight-004 | success | 本月战绩 | 本月已成交1单，金额¥25万 | ["广州物流TMS系统 - 4月28日成交，¥25万，项目已启动交付", "当前活跃商机6个，总价值¥152.5万，加权预测¥89万"] | 本月开局良好，已完成目标25%。如本周2单顺利关闭，可提前完成月度目标。 | opportunity | ["opp-007"] | 2026-05-03T06:00 | 2026-05-03T23:59 | true | 4 | {user_id} |

---

## KPI Card Data Expectations

Based on the sample data above, the KPI cards should display:

### 1. Today's Agenda
- **3 tasks due today**: task-001, task-002, task-003
- **2 calls scheduled**: act-006 (杭州电商), act-008 (深圳数字)
- **1 overdue**: task-004 (广州物流回款)
- **Completion**: 0/5 (0%)

### 2. Hot Opportunities
- **Closing this week**: opp-001 (¥28万, May 8), opp-004 (¥42万, May 10)
- **Total value**: ¥70万
- **Pipeline**: ¥152.5万 (6 active opps)

### 3. Client Coverage
- **Contacted this week**: 4 (acc-001, acc-003, acc-005, acc-008)
- **Total portfolio**: 8 accounts
- **At-risk (14+ days)**: 3 (acc-002, acc-004, acc-007)
- **Coverage**: 4/8 = 50%

### 4. Weekly Momentum
- **Activities this week**: 5 completed (act-001 to act-005)
- **Weekly target**: 8 (example)
- **Progress**: 62.5%

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         ACCOUNTS                                 │
│  acc-001 ─┬─ con-001, con-002                                   │
│           └─ opp-001 ─┬─ act-001, act-007                       │
│                       └─ task-001                                │
│                                                                  │
│  acc-002 ─── con-003                                            │
│           └─ opp-002 ─┬─ act-002, act-009                       │
│                       └─ task-002                                │
│                                                                  │
│  acc-004 ─┬─ con-005, con-010                                   │
│           └─ opp-004 ─┬─ act-004, act-008                       │
│                       └─ task-003                                │
│                                                                  │
│  acc-007 ─── con-008                                            │
│           ├─ opp-007 (WON)                                      │
│           ├─ act-010                                            │
│           └─ task-004 (OVERDUE)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Notes for Backend Implementation

1. **owner_id**: Replace `{user_id}` with actual user's objectId from `useUser()`
2. **Dates**: All dates should be relative to current date for realistic testing
3. **IDs**: Use GUIDs in production, sample uses readable IDs for documentation
4. **JSON fields**: `details_json` and `reference_ids_json` are stringified JSON arrays
5. **Refresh daily**: Business insights should be regenerated each morning
