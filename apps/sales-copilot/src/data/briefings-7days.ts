/**
 * 连续7天的 BriefMe 晨间播报样本数据
 * 
 * 设计原则：
 * - 每天6个章节，主叙事不重复
 * - 7天之间体现连续性：风险升级/缓解、待办逾期、confidence变化、客户状态演进
 * - 每天播报重点轮换
 * - 至少2个章节含金额、比例、日期、距离等数字锚点
 * - 至少1个可映射按钮动作的CTA
 * 
 * 时间线：5月2日（今天）往回推7天
 */

import { ACCOUNT_IDS, OPP_IDS } from './medical-sales-sample-data';

// Day 1: 4月26日 - 风险拉响
export const briefingDay1 = {
  briefing_id: 'brief-day1-0426',
  owner_id: 'demo-user-id',
  generated_on: '2026-04-26T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'urgent',
        title: '紧急：瑞金医院回款首次逾期',
        title_zh: '紧急：瑞金医院回款首次逾期',
        summary: '120万设备款原定4月15日到账，但昨天财务确认仍未收到。对方财务说资金调配出了问题，承诺"本周五前肯定付"。需要密切跟进。',
        summary_zh: '120万设备款原定4月15日到账，但昨天财务确认仍未收到。对方财务说资金调配出了问题，承诺"本周五前肯定付"。需要密切跟进。',
        script_zh: '早上好。今天有一件紧急事项需要您优先处理。瑞金医院那边，原本应该在4月15号到账的120万设备款，到现在还没收到，已经逾期11天了。昨天联系了对方财务部的李主管，他说最近院里资金调配出了些问题，承诺本周五、也就是4月30号之前一定会把款打过来。不过您也知道，口头承诺不太靠谱，建议今天再打个电话确认一下，最好能让对方发个书面的付款计划。这笔回款直接影响我们本月的完成率，需要重点盯着。',
        script_en: 'Good morning. There is an urgent matter that needs your immediate attention. The 1.2 million equipment payment from Ruijin Hospital, which was supposed to arrive on April 15th, still hasn\'t come through. It\'s now 11 days overdue. I contacted their finance department yesterday, and Manager Li mentioned they\'re having some fund allocation issues. He promised to pay by this Friday, April 30th. However, as you know, verbal promises are not always reliable. I suggest making another call today to confirm, and ideally get a written payment schedule. This collection directly affects our monthly completion rate, so it needs close monitoring.',
        timeRange: { start: 0, end: 28 },
        bullets: ['逾期金额：120万', '逾期天数：11天', '对方承诺：本周五（4月30日）前付款'],
        bullets_zh: ['逾期金额：120万', '逾期天数：11天', '对方承诺：本周五（4月30日）前付款'],
        metrics: [
          { label: '逾期金额', value: '120万', direction: 'down' },
          { label: '逾期天数', value: '11天', direction: 'down' }
        ],
        cta: { action: 'call', label: '联系财务确认', label_zh: '联系财务确认', target: ACCOUNT_IDS.RUIJIN_YIYUAN }
      },
      {
        type: 'risk',
        title: '中山医院MRI项目：86万尾款也开始拖了',
        title_zh: '中山医院MRI项目：86万尾款也开始拖了',
        summary: '去年采购的MRI设备尾款86万，原定3月底付清，现已逾期近1个月。财务说跟瑞金一样，都是资金紧张。新的240万MRI升级项目可能会受影响。',
        summary_zh: '去年采购的MRI设备尾款86万，原定3月底付清，现已逾期近1个月。财务说跟瑞金一样，都是资金紧张。新的240万MRI升级项目可能会受影响。',
        script_zh: '第二件事也是关于回款的。中山医院去年采购的那台MRI，还有86万的尾款没付，原本说好3月底结清，现在已经拖了快一个月了。我昨天跟他们财务聊过，说法跟瑞金那边差不多，都是说院里资金紧张。这个情况比较麻烦的是，我们正在跟他们谈一个新的MRI升级项目，金额有240万，如果旧账不清，新项目很难往上报。建议您这周找个时间去趟中山，当面了解一下真实情况，看看能不能做个分期付款的方案，先把关系维护住。',
        script_en: 'The second item is also about collections. Zhongshan Hospital still owes 86,000 yuan for the MRI equipment we delivered last year. It was supposed to be cleared by the end of March, but it\'s been nearly a month now. I spoke with their finance team yesterday, and the story is similar to Ruijin - they say the hospital is tight on funds. The tricky part is we\'re currently negotiating a new MRI upgrade project worth 2.4 million with them. If the old debt isn\'t cleared, it\'s hard to push the new project forward. I suggest visiting Zhongshan this week to understand the real situation and perhaps propose an installment plan to maintain the relationship.',
        timeRange: { start: 28, end: 55 },
        bullets: ['尾款金额：86万', '逾期天数：26天', '新项目金额：240万（可能受阻）'],
        bullets_zh: ['尾款金额：86万', '逾期天数：26天', '新项目金额：240万（可能受阻）'],
        metrics: [
          { label: '影响新项目', value: '240万', direction: 'down' }
        ],
        cta: { action: 'open_account', label: '查看账户详情', label_zh: '查看账户详情', target: ACCOUNT_IDS.ZHONGSHAN_YIYUAN }
      },
      {
        type: 'opportunity',
        title: '协和PET-CT项目：赵主任约下周技术交流',
        title_zh: '协和PET-CT项目：赵主任约下周技术交流',
        summary: '380万大单有新进展。核医学科赵主任昨天主动联系，说技术评审委员会基本认可我们的方案，想约下周详细讨论配置细节。',
        summary_zh: '380万大单有新进展。核医学科赵主任昨天主动联系，说技术评审委员会基本认可我们的方案，想约下周详细讨论配置细节。',
        script_zh: '接下来说个好消息。协和医院那个380万的PET-CT大单有新进展！昨天下午，核医学科的赵主任主动打电话过来，说技术评审委员会上周开会，对我们的方案整体比较认可，特别是图像分辨率和扫描速度这两个指标，评价很高。赵主任想约下周找个时间，详细讨论一下探测器配置和软件模块的细节。这是个非常积极的信号，说明我们在技术评分上应该能拿高分。建议您今天就跟赵主任确认具体时间，最好安排在周二或周三，给我们足够的准备时间。',
        script_en: 'Now for some good news. The 3.8 million PET-CT deal at Xiehe Hospital has made progress! Yesterday afternoon, Director Zhao from the Nuclear Medicine department called to say that the technical review committee met last week and generally approved our proposal. They were particularly impressed with our image resolution and scanning speed metrics. Director Zhao wants to schedule a meeting next week to discuss detector configuration and software module details. This is a very positive signal - it means we should score high on technical evaluation. I suggest confirming the specific time with Director Zhao today, preferably Tuesday or Wednesday, to give us adequate preparation time.',
        timeRange: { start: 55, end: 82 },
        bullets: ['项目金额：380万', '技术评审基本通过', '下周安排详细技术交流'],
        bullets_zh: ['项目金额：380万', '技术评审基本通过', '下周安排详细技术交流'],
        metrics: [
          { label: '金额', value: '380万', direction: 'flat' },
          { label: '信心度', value: '65%→70%', direction: 'up' }
        ],
        cta: { action: 'followup', label: '确认下周时间', label_zh: '确认下周时间', target: OPP_IDS.XIEHE_PETCT }
      },
      {
        type: 'insight',
        title: '华西DSA项目：演示被临时取消',
        title_zh: '华西DSA项目：演示被临时取消',
        summary: '原定明天的DSA设备演示，今天下午突然被取消了。对方说领导临时有事。这已经是第二次改期了，需要警惕。',
        summary_zh: '原定明天的DSA设备演示，今天下午突然被取消了。对方说领导临时有事。这已经是第二次改期了，需要警惕。',
        script_zh: '不过也有个不太好的消息。华西医院那边，原本约好明天做DSA设备演示的，今天下午突然打电话说取消了，说是他们科主任临时有事。这已经是第二次改期了，上次是上周三，理由也是领导有事。165万的单子，两次改期，我觉得这里面可能有问题。是他们在比较其他厂家？还是内部意见不统一？或者有别的原因？建议您不要直接追问演示时间，先侧面了解一下，比如通过设备科的小王，或者他们之前接触过的其他科室，看看到底是什么情况。',
        script_en: 'However, there\'s some not-so-good news too. Huaxi Hospital was supposed to have a DSA equipment demo tomorrow, but they called this afternoon to cancel, saying their department director had something come up. This is already the second postponement - last time was last Wednesday with the same excuse. For a 1.65 million deal, two cancellations raises red flags. Are they comparing other vendors? Is there internal disagreement? Or something else? I suggest not directly asking about rescheduling the demo. Instead, try to gather intel from the side - perhaps through Xiao Wang from the equipment department, or other departments they\'ve been in contact with.',
        timeRange: { start: 82, end: 108 },
        bullets: ['项目金额：165万', '第2次改期', '需了解真实原因'],
        bullets_zh: ['项目金额：165万', '第2次改期', '需了解真实原因'],
        metrics: [
          { label: '信心度', value: '50%→45%', direction: 'down' }
        ]
      },
      {
        type: 'action',
        title: '今日待办：新华医疗方案修订',
        title_zh: '今日待办：新华医疗方案修订',
        summary: '监护仪集采项目技术方案需要根据上次反馈修订，特别是价格部分。后天就是投标会了。',
        summary_zh: '监护仪集采项目技术方案需要根据上次反馈修订，特别是价格部分。后天就是投标会了。',
        script_zh: '关于今日待办。新华医疗的监护仪集采项目，后天28号就是投标会了，技术方案还需要根据李经理上次的反馈做最后一轮修订。重点是价格部分，我们报68万，迈瑞据说报63万左右，比我们低大概8%。方案里需要突出我们的售后服务优势和三年免费质保，把性价比的故事讲清楚。68万的单子虽然不算大，但这是我们进入新华医疗的第一个项目，有战略意义。建议您今天下午务必把方案改完发给李经理过目，有什么问题还能在明天补救。',
        script_en: 'Regarding today\'s to-do list. The Xinhua Medical monitoring equipment tender is the day after tomorrow, on the 28th, and the technical proposal still needs final revisions based on Manager Li\'s feedback. The focus is on pricing - we\'re quoting 680,000 while Mindray is reportedly around 630,000, about 8% lower than us. The proposal needs to highlight our after-sales service advantages and three-year free warranty to make a compelling value proposition. While 680,000 isn\'t a huge deal, this is our first project with Xinhua Medical, so it has strategic significance. Please make sure to finish the revisions this afternoon and send them to Manager Li for review, so there\'s time to address any issues tomorrow.',
        timeRange: { start: 108, end: 132 },
        bullets: ['68万监护仪项目', '方案今日必须改完', '后天投标会'],
        bullets_zh: ['68万监护仪项目', '方案今日必须改完', '后天投标会'],
        metrics: [
          { label: '距离投标', value: '2天', direction: 'flat' }
        ]
      },
      {
        type: 'preview',
        title: '本周展望：3个项目进入关键阶段',
        title_zh: '本周展望：3个项目进入关键阶段',
        summary: '本周需要重点关注：新华医疗投标（28日）、协和技术交流（待定）、华东医院CT审批进度。同时要盯紧两笔回款。',
        summary_zh: '本周需要重点关注：新华医疗投标（28日）、协和技术交流（待定）、华东医院CT审批进度。同时要盯紧两笔回款。',
        script_zh: '最后简单总结一下本周的重点。有三个项目进入关键阶段：第一是新华医疗的监护仪投标，28号、也就是后天，决战时刻；第二是协和PET-CT的技术交流，抓紧跟赵主任确定时间；第三是华东医院128万CT项目，据说下周一要上院长办公会，这两天可以侧面了解一下会议氛围。另外，瑞金和中山两笔回款加起来有206万，必须紧盯不放。总体来说，这周有机会也有风险，把该做的事情做到位，下周应该会有好消息。以上就是今天的播报，祝您工作顺利！',
        script_en: 'Finally, let me summarize this week\'s key priorities. Three projects are entering critical stages: First, the Xinhua Medical monitoring equipment tender on the 28th - the day after tomorrow, crunch time. Second, the Xiehe PET-CT technical discussion - confirm the time with Director Zhao ASAP. Third, the Huadong Hospital 1.28 million CT project - word is it\'s going to the dean\'s meeting next Monday, so try to get a sense of the atmosphere these days. Also, the two collections from Ruijin and Zhongshan total 2.06 million - must keep close watch. Overall, this week has both opportunities and risks. If we do what needs to be done, next week should bring good news. That\'s today\'s briefing. Have a productive day!',
        timeRange: { start: 132, end: 160 },
        bullets: ['新华投标：4月28日', '协和交流：待确认', '两笔回款：206万待收'],
        bullets_zh: ['新华投标：4月28日', '协和交流：待确认', '两笔回款：206万待收'],
        metrics: [
          { label: '本周关键项目', value: '3个', direction: 'flat' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 2: 4月27日 - 拜访路线优化
export const briefingDay2 = {
  briefing_id: 'brief-day2-0427',
  owner_id: 'demo-user-id',
  generated_on: '2026-04-27T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'route',
        title: '今日路线优化：华东区3家客户顺路拜访',
        title_zh: '今日路线优化：华东区3家客户顺路拜访',
        summary: '今天去华东医院确认CT审批进度，顺路可以拜访瑞金（距离1.8公里）催回款，再去中山（距离2.5公里）了解MRI项目状态。一趟路搞定三件事。',
        summary_zh: '今天去华东医院确认CT审批进度，顺路可以拜访瑞金（距离1.8公里）催回款，再去中山（距离2.5公里）了解MRI项目状态。一趟路搞定三件事。',
        timeRange: { start: 0, end: 30 },
        bullets: [
          '10:00 华东医院 - CT审批进度（128万）',
          '11:30 瑞金医院 - 回款催收（120万）',
          '14:00 中山医院 - MRI项目沟通（240万）'
        ],
        bullets_zh: [
          '10:00 华东医院 - CT审批进度（128万）',
          '11:30 瑞金医院 - 回款催收（120万）',
          '14:00 中山医院 - MRI项目沟通（240万）'
        ],
        metrics: [
          { label: '涉及金额', value: '488万', direction: 'flat' },
          { label: '总路程', value: '4.3公里', direction: 'flat' }
        ],
        cta: { action: 'visit', label: '开始导航', label_zh: '开始导航', target: ACCOUNT_IDS.HUADONG_YIYUAN }
      },
      {
        type: 'urgent',
        title: '瑞金回款跟进：承诺周五付款',
        title_zh: '瑞金回款跟进：承诺周五付款',
        summary: '昨天电话确认，财务说周五前一定付。今天顺路拜访时再当面确认一下，了解是否有新的障碍。',
        summary_zh: '昨天电话确认，财务说周五前一定付。今天顺路拜访时再当面确认一下，了解是否有新的障碍。',
        timeRange: { start: 30, end: 55 },
        bullets: ['120万逾期款', '承诺周五（4月30日）付款', '今天当面确认'],
        bullets_zh: ['120万逾期款', '承诺周五（4月30日）付款', '今天当面确认'],
        metrics: [
          { label: '剩余天数', value: '3天', direction: 'flat' }
        ]
      },
      {
        type: 'opportunity',
        title: '华东CT项目：听说院长办公会下周一讨论',
        title_zh: '华东CT项目：听说院长办公会下周一讨论',
        summary: '王主任昨天透露，128万CT项目预计下周一上院长办公会。如果通过，只差财务签字就能签约了。今天去确认具体流程。',
        summary_zh: '王主任昨天透露，128万CT项目预计下周一上院长办公会。如果通过，只差财务签字就能签约了。今天去确认具体流程。',
        timeRange: { start: 55, end: 82 },
        bullets: ['项目金额：128万', '下周一院长办公会', '信心度提升到80%'],
        bullets_zh: ['项目金额：128万', '下周一院长办公会', '信心度提升到80%'],
        metrics: [
          { label: '信心度', value: '80%', direction: 'up' }
        ],
        cta: { action: 'open_opp', label: '查看商机', label_zh: '查看商机', target: OPP_IDS.HUADONG_CT }
      },
      {
        type: 'risk',
        title: '中山MRI：回款问题可能影响新项目',
        title_zh: '中山MRI：回款问题可能影响新项目',
        summary: '今天去中山医院时，需要委婉了解86万尾款的付款计划。如果旧账不清，240万新项目没法往上报。',
        summary_zh: '今天去中山医院时，需要委婉了解86万尾款的付款计划。如果旧账不清，240万新项目没法往上报。',
        timeRange: { start: 82, end: 108 },
        bullets: ['旧账：86万逾期', '新项目：240万待报', '需要平衡关系'],
        bullets_zh: ['旧账：86万逾期', '新项目：240万待报', '需要平衡关系'],
        metrics: [
          { label: '尾款逾期', value: '27天', direction: 'down' }
        ]
      },
      {
        type: 'action',
        title: '明日准备：新华医疗投标会',
        title_zh: '明日准备：新华医疗投标会',
        summary: '明天上午9点新华医疗监护仪投标会。方案已改完，今天晚上再过一遍演示文稿。价格是关键，比迈瑞高8%。',
        summary_zh: '明天上午9点新华医疗监护仪投标会。方案已改完，今天晚上再过一遍演示文稿。价格是关键，比迈瑞高8%。',
        timeRange: { start: 108, end: 132 },
        bullets: ['明天9:00投标会', '我方报价68万', '比迈瑞高8%（约5万）'],
        bullets_zh: ['明天9:00投标会', '我方报价68万', '比迈瑞高8%（约5万）'],
        metrics: [
          { label: '价格差距', value: '8%', direction: 'down' }
        ]
      },
      {
        type: 'preview',
        title: '华西DSA项目：保持联系但不要催',
        title_zh: '华西DSA项目：保持联系但不要催',
        summary: '昨天演示被取消后，今天先不要催。发个微信问候一下，保持联系，等对方主动约时间。',
        summary_zh: '昨天演示被取消后，今天先不要催。发个微信问候一下，保持联系，等对方主动约时间。',
        timeRange: { start: 132, end: 160 },
        bullets: ['165万DSA项目', '演示两次被取消', '先观望，保持联系'],
        bullets_zh: ['165万DSA项目', '演示两次被取消', '先观望，保持联系'],
        metrics: [
          { label: '信心度', value: '45%', direction: 'flat' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 3: 4月28日 - 商机冲刺
export const briefingDay3 = {
  briefing_id: 'brief-day3-0428',
  owner_id: 'demo-user-id',
  generated_on: '2026-04-28T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'focus',
        title: '今日决战：新华医疗监护仪投标',
        title_zh: '今日决战：新华医疗监护仪投标',
        summary: '上午9点投标会，68万监护仪项目。技术方案有优势，但价格比迈瑞高8%。李经理私下暗示价格是关键因素。',
        summary_zh: '上午9点投标会，68万监护仪项目。技术方案有优势，但价格比迈瑞高8%。李经理私下暗示价格是关键因素。',
        timeRange: { start: 0, end: 30 },
        bullets: ['9:00 投标会开始', '我方报价：68万', '竞品报价：约63万（低8%）'],
        bullets_zh: ['9:00 投标会开始', '我方报价：68万', '竞品报价：约63万（低8%）'],
        metrics: [
          { label: '项目金额', value: '68万', direction: 'flat' },
          { label: '技术评分', value: '第1名', direction: 'up' }
        ],
        cta: { action: 'open_opp', label: '查看投标准备', label_zh: '查看投标准备', target: OPP_IDS.XINHUA_MONITOR }
      },
      {
        type: 'opportunity',
        title: '昨日收获：华东CT下周一上会确认',
        title_zh: '昨日收获：华东CT下周一上会确认',
        summary: '昨天拜访华东医院，王主任确认128万CT项目下周一（5月1日）上院长办公会。他说问题不大，就是走个流程。',
        summary_zh: '昨天拜访华东医院，王主任确认128万CT项目下周一（5月1日）上院长办公会。他说问题不大，就是走个流程。',
        timeRange: { start: 30, end: 55 },
        bullets: ['5月1日院长办公会', '王主任态度积极', '信心度提升至85%'],
        bullets_zh: ['5月1日院长办公会', '王主任态度积极', '信心度提升至85%'],
        metrics: [
          { label: '信心度', value: '80%→85%', direction: 'up' }
        ]
      },
      {
        type: 'risk',
        title: '瑞金回款：设备科陈主任突然调走了',
        title_zh: '瑞金回款：设备科陈主任突然调走了',
        summary: '昨天去瑞金催款，才知道陈主任上周已经调到其他科室了！新来的张主任态度冷淡，说"这个事要重新了解情况"。回款和超声项目都悬了。',
        summary_zh: '昨天去瑞金催款，才知道陈主任上周已经调到其他科室了！新来的张主任态度冷淡，说"这个事要重新了解情况"。回款和超声项目都悬了。',
        timeRange: { start: 55, end: 85 },
        bullets: ['陈主任已调离', '新任张主任态度冷淡', '45万超声项目也受影响'],
        bullets_zh: ['陈主任已调离', '新任张主任态度冷淡', '45万超声项目也受影响'],
        metrics: [
          { label: '风险等级', value: '高', direction: 'down' },
          { label: '影响金额', value: '165万', direction: 'down' }
        ],
        cta: { action: 'ask_copilot', label: '分析应对策略', label_zh: '分析应对策略', target: 'copilot' }
      },
      {
        type: 'insight',
        title: '中山MRI：财务承诺5月15日前清账',
        title_zh: '中山MRI：财务承诺5月15日前清账',
        summary: '昨天和中山医院财务科长单独聊了聊，他说院里资金确实紧张，但86万尾款5月15日前肯定付。我说清完账就启动新的MRI项目。',
        summary_zh: '昨天和中山医院财务科长单独聊了聊，他说院里资金确实紧张，但86万尾款5月15日前肯定付。我说清完账就启动新的MRI项目。',
        timeRange: { start: 85, end: 112 },
        bullets: ['86万尾款：5月15日前付清', '新项目：清账后启动', '达成口头共识'],
        bullets_zh: ['86万尾款：5月15日前付清', '新项目：清账后启动', '达成口头共识'],
        metrics: [
          { label: '预计回款', value: '5月15日', direction: 'up' }
        ]
      },
      {
        type: 'action',
        title: '同济CT项目：周主任说下周上会',
        title_zh: '同济CT项目：周主任说下周上会',
        summary: '收到同济医院周主任消息，98万CT项目技术方案通过了，下周会上院务会讨论。他认可我们的技术，但提醒"最近西门子在活动"。',
        summary_zh: '收到同济医院周主任消息，98万CT项目技术方案通过了，下周会上院务会讨论。他认可我们的技术，但提醒"最近西门子在活动"。',
        timeRange: { start: 112, end: 138 },
        bullets: ['技术方案已通过', '下周院务会讨论', '警惕西门子竞争'],
        bullets_zh: ['技术方案已通过', '下周院务会讨论', '警惕西门子竞争'],
        metrics: [
          { label: '信心度', value: '65%', direction: 'flat' }
        ]
      },
      {
        type: 'preview',
        title: '明日待办：长征医院内镜方案跟进',
        title_zh: '明日待办：长征医院内镜方案跟进',
        summary: '82万内镜中心方案提交6天了，明天打电话给刘科长确认评审进度。',
        summary_zh: '82万内镜中心方案提交6天了，明天打电话给刘科长确认评审进度。',
        timeRange: { start: 138, end: 160 },
        bullets: ['方案提交6天', '明日电话确认', '82万内镜项目'],
        bullets_zh: ['方案提交6天', '明日电话确认', '82万内镜项目'],
        metrics: [
          { label: '信心度', value: '60%', direction: 'flat' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 4: 4月29日 - 回款与发货联动
export const briefingDay4 = {
  briefing_id: 'brief-day4-0429',
  owner_id: 'demo-user-id',
  generated_on: '2026-04-29T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'urgent',
        title: '回款危机：瑞金承诺明天到账，但...',
        title_zh: '回款危机：瑞金承诺明天到账，但...',
        summary: '瑞金医院120万回款承诺明天（4月30日）到账，但联系人换了，新的张主任说"还在走流程"。这是第一次承诺，能否兑现要打个问号。',
        summary_zh: '瑞金医院120万回款承诺明天（4月30日）到账，但联系人换了，新的张主任说"还在走流程"。这是第一次承诺，能否兑现要打个问号。',
        timeRange: { start: 0, end: 28 },
        bullets: ['承诺日期：明天4月30日', '对接人已换：张主任', '态度：不太积极'],
        bullets_zh: ['承诺日期：明天4月30日', '对接人已换：张主任', '态度：不太积极'],
        metrics: [
          { label: '逾期天数', value: '14天', direction: 'down' },
          { label: '承诺兑现率', value: '待观察', direction: 'flat' }
        ],
        cta: { action: 'call', label: '再次确认', label_zh: '再次确认', target: ACCOUNT_IDS.RUIJIN_YIYUAN }
      },
      {
        type: 'insight',
        title: '中山X光机：签约了但没法发货',
        title_zh: '中山X光机：签约了但没法发货',
        summary: '昨天中山医院18万移动式X光机签约完成！但公司财务说，86万尾款没清，新设备不能发货。客户那边已经在催了...',
        summary_zh: '昨天中山医院18万移动式X光机签约完成！但公司财务说，86万尾款没清，新设备不能发货。客户那边已经在催了...',
        timeRange: { start: 28, end: 55 },
        bullets: ['新签约：18万X光机', '卡点：86万尾款未清', '客户已在催发货'],
        bullets_zh: ['新签约：18万X光机', '卡点：86万尾款未清', '客户已在催发货'],
        metrics: [
          { label: '签约金额', value: '18万', direction: 'up' },
          { label: '发货状态', value: '冻结', direction: 'down' }
        ]
      },
      {
        type: 'opportunity',
        title: '齐鲁钼靶机：今天演示，争取快速签约',
        title_zh: '齐鲁钼靶机：今天演示，争取快速签约',
        summary: '今天10点去齐鲁医院做乳腺钼靶机演示。28万的单子不大，但利润率高，孙主任很期待。争取一次演示搞定。',
        summary_zh: '今天10点去齐鲁医院做乳腺钼靶机演示。28万的单子不大，但利润率高，孙主任很期待。争取一次演示搞定。',
        timeRange: { start: 55, end: 82 },
        bullets: ['10:00 演示开始', '项目金额：28万', '孙主任态度积极'],
        bullets_zh: ['10:00 演示开始', '项目金额：28万', '孙主任态度积极'],
        metrics: [
          { label: '利润率', value: '35%', direction: 'up' },
          { label: '信心度', value: '70%', direction: 'up' }
        ],
        cta: { action: 'visit', label: '开始导航', label_zh: '开始导航', target: ACCOUNT_IDS.QILU_YIYUAN }
      },
      {
        type: 'risk',
        title: '长征内镜项目：刘科长去培训了',
        title_zh: '长征内镜项目：刘科长去培训了',
        summary: '下午打电话给长征医院刘科长，才知道他出差培训去了，要5月8日才回来。82万内镜项目只能等着。',
        summary_zh: '下午打电话给长征医院刘科长，才知道他出差培训去了，要5月8日才回来。82万内镜项目只能等着。',
        timeRange: { start: 82, end: 108 },
        bullets: ['刘科长：5月8日回来', '82万项目暂停', '无法推进'],
        bullets_zh: ['刘科长：5月8日回来', '82万项目暂停', '无法推进'],
        metrics: [
          { label: '等待天数', value: '9天', direction: 'down' }
        ]
      },
      {
        type: 'action',
        title: '新华监护仪：技术第一但价格输了',
        title_zh: '新华监护仪：技术第一但价格输了',
        summary: '昨天投标会结果出来了，技术评分我们第一，但综合评分因为价格被迈瑞反超。李经理私下说"如果你们能降5%..."',
        summary_zh: '昨天投标会结果出来了，技术评分我们第一，但综合评分因为价格被迈瑞反超。李经理私下说"如果你们能降5%..."',
        timeRange: { start: 108, end: 135 },
        bullets: ['技术评分：第1名', '综合评分：第2名', '价格差距：8%'],
        bullets_zh: ['技术评分：第1名', '综合评分：第2名', '价格差距：8%'],
        metrics: [
          { label: '需降价', value: '5%', direction: 'down' },
          { label: '信心度', value: '70%→55%', direction: 'down' }
        ],
        cta: { action: 'ask_copilot', label: '计算降价空间', label_zh: '计算降价空间', target: 'copilot' }
      },
      {
        type: 'preview',
        title: '明日：4月最后一天，盯紧瑞金回款',
        title_zh: '明日：4月最后一天，盯紧瑞金回款',
        summary: '明天是4月30日，瑞金承诺的回款日。一早就要联系确认到账情况。同时也要关注华东CT项目5月1日的院长办公会。',
        summary_zh: '明天是4月30日，瑞金承诺的回款日。一早就要联系确认到账情况。同时也要关注华东CT项目5月1日的院长办公会。',
        timeRange: { start: 135, end: 160 },
        bullets: ['明天：瑞金回款截止日', '后天：华东CT上会', '4月完成率：65%'],
        bullets_zh: ['明天：瑞金回款截止日', '后天：华东CT上会', '4月完成率：65%'],
        metrics: [
          { label: '4月完成率', value: '65%', direction: 'down' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 5: 4月30日 - 沉默客户唤醒
export const briefingDay5 = {
  briefing_id: 'brief-day5-0430',
  owner_id: 'demo-user-id',
  generated_on: '2026-04-30T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'urgent',
        title: '瑞金回款：今天是承诺日，必须确认',
        title_zh: '瑞金回款：今天是承诺日，必须确认',
        summary: '今天是瑞金医院承诺的回款日（4月30日）。一早打电话确认，如果今天还不到账，就是连续两次失信了。',
        summary_zh: '今天是瑞金医院承诺的回款日（4月30日）。一早打电话确认，如果今天还不到账，就是连续两次失信了。',
        timeRange: { start: 0, end: 25 },
        bullets: ['今日：承诺回款日', '金额：120万', '如失信：启动升级流程'],
        bullets_zh: ['今日：承诺回款日', '金额：120万', '如失信：启动升级流程'],
        metrics: [
          { label: '逾期天数', value: '15天', direction: 'down' }
        ],
        cta: { action: 'call', label: '确认到账', label_zh: '确认到账', target: ACCOUNT_IDS.RUIJIN_YIYUAN }
      },
      {
        type: 'focus',
        title: '华西DSA：已失联10天，需要激活',
        title_zh: '华西DSA：已失联10天，需要激活',
        summary: '华西医院DSA项目自4月20日后完全没有回应，已经10天了。165万的项目不能就这么丢了，今天必须想办法找其他渠道联系。',
        summary_zh: '华西医院DSA项目自4月20日后完全没有回应，已经10天了。165万的项目不能就这么丢了，今天必须想办法找其他渠道联系。',
        timeRange: { start: 25, end: 52 },
        bullets: ['失联天数：10天', '项目金额：165万', '尝试找其他联系人'],
        bullets_zh: ['失联天数：10天', '项目金额：165万', '尝试找其他联系人'],
        metrics: [
          { label: '信心度', value: '45%→35%', direction: 'down' }
        ],
        cta: { action: 'ask_copilot', label: '查找备选联系人', label_zh: '查找备选联系人', target: 'copilot' }
      },
      {
        type: 'opportunity',
        title: '好消息！齐鲁钼靶机演示大获成功',
        title_zh: '好消息！齐鲁钼靶机演示大获成功',
        summary: '昨天齐鲁医院演示效果很好！孙主任当场就说"没问题，准备合同吧"。28万的单子，利润率35%，争取下周签约。',
        summary_zh: '昨天齐鲁医院演示效果很好！孙主任当场就说"没问题，准备合同吧"。28万的单子，利润率35%，争取下周签约。',
        timeRange: { start: 52, end: 78 },
        bullets: ['演示结果：成功', '孙主任：同意签约', '下一步：准备合同'],
        bullets_zh: ['演示结果：成功', '孙主任：同意签约', '下一步：准备合同'],
        metrics: [
          { label: '信心度', value: '70%→85%', direction: 'up' },
          { label: '利润率', value: '35%', direction: 'up' }
        ],
        cta: { action: 'followup', label: '准备合同', label_zh: '准备合同', target: OPP_IDS.QILU_MAMMO }
      },
      {
        type: 'insight',
        title: '竞品情报：西门子在同济医院活动',
        title_zh: '竞品情报：西门子在同济医院活动',
        summary: '从渠道听说，西门子华中区老总昨天亲自去拜访了同济医院院长。98万CT项目可能有变数，要高度警惕。',
        summary_zh: '从渠道听说，西门子华中区老总昨天亲自去拜访了同济医院院长。98万CT项目可能有变数，要高度警惕。',
        timeRange: { start: 78, end: 105 },
        bullets: ['竞品：西门子', '级别：区域老总亲自出马', '项目金额：98万'],
        bullets_zh: ['竞品：西门子', '级别：区域老总亲自出马', '项目金额：98万'],
        metrics: [
          { label: '风险等级', value: '中→高', direction: 'down' }
        ]
      },
      {
        type: 'action',
        title: '浙大一院MRI：沉默2周半，需要联系',
        title_zh: '浙大一院MRI：沉默2周半，需要联系',
        summary: '浙大一院110万MRI项目已经沉默了17天，从4月15日拜访后就没有任何回应。今天发个微信问候一下，了解情况。',
        summary_zh: '浙大一院110万MRI项目已经沉默了17天，从4月15日拜访后就没有任何回应。今天发个微信问候一下，了解情况。',
        timeRange: { start: 105, end: 130 },
        bullets: ['沉默天数：17天', '项目金额：110万', '发微信试探'],
        bullets_zh: ['沉默天数：17天', '项目金额：110万', '发微信试探'],
        metrics: [
          { label: '信心度', value: '45%', direction: 'flat' }
        ]
      },
      {
        type: 'preview',
        title: '明天：华东CT院长办公会',
        title_zh: '明天：华东CT院长办公会',
        summary: '明天5月1日是华东医院128万CT项目上院长办公会的日子。王主任说问题不大，但还是要等结果。五一假期，希望有好消息。',
        summary_zh: '明天5月1日是华东医院128万CT项目上院长办公会的日子。王主任说问题不大，但还是要等结果。五一假期，希望有好消息。',
        timeRange: { start: 130, end: 160 },
        bullets: ['5月1日：华东CT上会', '金额：128万', '王主任态度积极'],
        bullets_zh: ['5月1日：华东CT上会', '金额：128万', '王主任态度积极'],
        metrics: [
          { label: '信心度', value: '85%', direction: 'up' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 6: 5月1日 - 区域目标缺口
export const briefingDay6 = {
  briefing_id: 'brief-day6-0501',
  owner_id: 'demo-user-id',
  generated_on: '2026-05-01T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'urgent',
        title: '4月复盘：完成率65%，缺口175万',
        title_zh: '4月复盘：完成率65%，缺口175万',
        summary: '4月结束了，目标500万，实际完成325万，完成率65%。主要是瑞金回款120万没到账（昨天又推迟了），加上几个项目延期。5月压力更大。',
        summary_zh: '4月结束了，目标500万，实际完成325万，完成率65%。主要是瑞金回款120万没到账（昨天又推迟了），加上几个项目延期。5月压力更大。',
        timeRange: { start: 0, end: 30 },
        bullets: ['4月目标：500万', '实际完成：325万', '缺口：175万（35%）'],
        bullets_zh: ['4月目标：500万', '实际完成：325万', '缺口：175万（35%）'],
        metrics: [
          { label: '完成率', value: '65%', direction: 'down' },
          { label: '缺口', value: '175万', direction: 'down' }
        ]
      },
      {
        type: 'risk',
        title: '瑞金回款二次失信：承诺又没兑现',
        title_zh: '瑞金回款二次失信：承诺又没兑现',
        summary: '昨天（4月30日）瑞金医院承诺的回款日，结果又没到账。财务说"下周肯定付"。这已经是第二次承诺后推迟了，需要升级处理。',
        summary_zh: '昨天（4月30日）瑞金医院承诺的回款日，结果又没到账。财务说"下周肯定付"。这已经是第二次承诺后推迟了，需要升级处理。',
        timeRange: { start: 30, end: 58 },
        bullets: ['二次承诺失信', '逾期天数：16天', '需要升级处理'],
        bullets_zh: ['二次承诺失信', '逾期天数：16天', '需要升级处理'],
        metrics: [
          { label: '承诺失信', value: '2次', direction: 'down' },
          { label: '风险等级', value: '高', direction: 'down' }
        ],
        cta: { action: 'call', label: '升级处理', label_zh: '升级处理', target: ACCOUNT_IDS.RUIJIN_YIYUAN }
      },
      {
        type: 'opportunity',
        title: '好消息！华东CT项目院长办公会通过',
        title_zh: '好消息！华东CT项目院长办公会通过',
        summary: '今天上午华东医院院长办公会讨论通过了128万CT项目！王主任说只等财务处长签字，处长出差了要5月5日才回来。胜利在望！',
        summary_zh: '今天上午华东医院院长办公会讨论通过了128万CT项目！王主任说只等财务处长签字，处长出差了要5月5日才回来。胜利在望！',
        timeRange: { start: 58, end: 85 },
        bullets: ['院长办公会：通过', '待办：财务处长签字', '预计签约：5月5日后'],
        bullets_zh: ['院长办公会：通过', '待办：财务处长签字', '预计签约：5月5日后'],
        metrics: [
          { label: '信心度', value: '85%→90%', direction: 'up' },
          { label: '金额', value: '128万', direction: 'flat' }
        ],
        cta: { action: 'open_opp', label: '查看详情', label_zh: '查看详情', target: OPP_IDS.HUADONG_CT }
      },
      {
        type: 'insight',
        title: '协和PET-CT：技术确认会圆满成功',
        title_zh: '协和PET-CT：技术确认会圆满成功',
        summary: '今天和协和医院赵主任的技术确认会很顺利，他对我们的方案非常满意。380万大单进入最终报价阶段，明天准备报价单。',
        summary_zh: '今天和协和医院赵主任的技术确认会很顺利，他对我们的方案非常满意。380万大单进入最终报价阶段，明天准备报价单。',
        timeRange: { start: 85, end: 112 },
        bullets: ['技术确认：通过', '赵主任：非常满意', '下一步：准备最终报价'],
        bullets_zh: ['技术确认：通过', '赵主任：非常满意', '下一步：准备最终报价'],
        metrics: [
          { label: '信心度', value: '70%→75%', direction: 'up' },
          { label: '金额', value: '380万', direction: 'flat' }
        ]
      },
      {
        type: 'action',
        title: '惊喜！浙大一院突然回复要来考察',
        title_zh: '惊喜！浙大一院突然回复要来考察',
        summary: '晚上突然收到浙大一院设备科助理微信，问能否安排下周三来考察工厂！110万MRI项目沉默3周后突然复活，这是好信号。',
        summary_zh: '晚上突然收到浙大一院设备科助理微信，问能否安排下周三来考察工厂！110万MRI项目沉默3周后突然复活，这是好信号。',
        timeRange: { start: 112, end: 138 },
        bullets: ['沉默21天后重新联系', '请求：下周三考察工厂', '信号积极'],
        bullets_zh: ['沉默21天后重新联系', '请求：下周三考察工厂', '信号积极'],
        metrics: [
          { label: '信心度', value: '45%→50%', direction: 'up' }
        ],
        cta: { action: 'followup', label: '确认考察安排', label_zh: '确认考察安排', target: OPP_IDS.ZHEDA_MRI }
      },
      {
        type: 'preview',
        title: '5月开局：目标500万，在手项目梳理',
        title_zh: '5月开局：目标500万，在手项目梳理',
        summary: '5月目标同样是500万。目前确定能签的：华东CT（128万）、齐鲁钼靶（28万）。高概率：协和PET-CT（380万）。还有同济、浙大一院、长征等项目在推进。',
        summary_zh: '5月目标同样是500万。目前确定能签的：华东CT（128万）、齐鲁钼靶（28万）。高概率：协和PET-CT（380万）。还有同济、浙大一院、长征等项目在推进。',
        timeRange: { start: 138, end: 165 },
        bullets: ['5月目标：500万', '确定签约：156万', '高概率：380万'],
        bullets_zh: ['5月目标：500万', '确定签约：156万', '高概率：380万'],
        metrics: [
          { label: '目标', value: '500万', direction: 'flat' },
          { label: '在手项目', value: '7个', direction: 'flat' }
        ]
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// Day 7: 5月2日 - 周总结 + 下周预判
export const briefingDay7 = {
  briefing_id: 'brief-day7-0502',
  owner_id: 'demo-user-id',
  generated_on: '2026-05-02T06:00:00.000Z',
  payload_json: JSON.stringify({
    items: [
      {
        type: 'summary',
        title: '本周回顾：1胜2负4待定',
        title_zh: '本周回顾：1胜2负4待定',
        summary: '本周战绩：赢了齐鲁钼靶（28万），输了瑞金呼吸机（56万，被迈瑞抢走），华东CT、协和PET-CT、同济CT、浙大MRI四个项目在推进中。最大风险是瑞金回款二次失信。',
        summary_zh: '本周战绩：赢了齐鲁钼靶（28万），输了瑞金呼吸机（56万，被迈瑞抢走），华东CT、协和PET-CT、同济CT、浙大MRI四个项目在推进中。最大风险是瑞金回款二次失信。',
        timeRange: { start: 0, end: 32 },
        bullets: [
          '赢单：齐鲁钼靶28万',
          '输单：瑞金呼吸机56万（迈瑞）',
          '推进中：4个项目共716万'
        ],
        bullets_zh: [
          '赢单：齐鲁钼靶28万',
          '输单：瑞金呼吸机56万（迈瑞）',
          '推进中：4个项目共716万'
        ],
        metrics: [
          { label: '本周赢单', value: '28万', direction: 'up' },
          { label: '本周输单', value: '56万', direction: 'down' }
        ]
      },
      {
        type: 'urgent',
        title: '最大风险：瑞金120万回款已逾期22天',
        title_zh: '最大风险：瑞金120万回款已逾期22天',
        summary: '瑞金医院120万回款已逾期22天，两次承诺都没兑现。设备科陈主任换岗后，新的张主任帮不上忙。再拖下去要上报风控部门了。今天必须有明确说法。',
        summary_zh: '瑞金医院120万回款已逾期22天，两次承诺都没兑现。设备科陈主任换岗后，新的张主任帮不上忙。再拖下去要上报风控部门了。今天必须有明确说法。',
        timeRange: { start: 32, end: 60 },
        bullets: [
          '逾期天数：22天',
          '承诺失信：2次',
          '联系人换岗：陈主任→张主任'
        ],
        bullets_zh: [
          '逾期天数：22天',
          '承诺失信：2次',
          '联系人换岗：陈主任→张主任'
        ],
        metrics: [
          { label: '风险等级', value: '极高', direction: 'down' }
        ],
        cta: { action: 'call', label: '今日必须催收', label_zh: '今日必须催收', target: ACCOUNT_IDS.RUIJIN_YIYUAN }
      },
      {
        type: 'opportunity',
        title: '本周最大收获：华东CT只差临门一脚',
        title_zh: '本周最大收获：华东CT只差临门一脚',
        summary: '128万华东CT项目院长办公会已通过，就等财务处长5月5日回来签字。今天顺路去一趟，和王主任确认后续流程，争取下周签约。',
        summary_zh: '128万华东CT项目院长办公会已通过，就等财务处长5月5日回来签字。今天顺路去一趟，和王主任确认后续流程，争取下周签约。',
        timeRange: { start: 60, end: 88 },
        bullets: [
          '院长办公会：已通过',
          '财务处长：5月5日回来签字',
          '今日行动：顺路拜访确认'
        ],
        bullets_zh: [
          '院长办公会：已通过',
          '财务处长：5月5日回来签字',
          '今日行动：顺路拜访确认'
        ],
        metrics: [
          { label: '金额', value: '128万', direction: 'flat' },
          { label: '信心度', value: '90%', direction: 'up' }
        ],
        cta: { action: 'visit', label: '今日顺路拜访', label_zh: '今日顺路拜访', target: ACCOUNT_IDS.HUADONG_YIYUAN }
      },
      {
        type: 'action',
        title: '今日重点：协和PET-CT最终报价',
        title_zh: '今日重点：协和PET-CT最终报价',
        summary: '380万大单进入关键阶段。下午2点和赵主任电话确认最终配置，今天内完成报价单。这是全年最大的单子，必须拿下。',
        summary_zh: '380万大单进入关键阶段。下午2点和赵主任电话确认最终配置，今天内完成报价单。这是全年最大的单子，必须拿下。',
        timeRange: { start: 88, end: 115 },
        bullets: [
          '下午2点：电话确认配置',
          '今日内：完成报价单',
          '下周：提交正式投标文件'
        ],
        bullets_zh: [
          '下午2点：电话确认配置',
          '今日内：完成报价单',
          '下周：提交正式投标文件'
        ],
        metrics: [
          { label: '金额', value: '380万', direction: 'flat' },
          { label: '信心度', value: '75%', direction: 'up' }
        ],
        cta: { action: 'call', label: '呼叫赵主任', label_zh: '呼叫赵主任', target: 'contact-007' }
      },
      {
        type: 'insight',
        title: '下周预判：3个项目有望突破',
        title_zh: '下周预判：3个项目有望突破',
        summary: '下周重点：华东CT签约（5月5日后）、协和PET-CT投标、浙大MRI工厂考察（5月7日）。如果顺利，5月首周就能锁定400万以上。',
        summary_zh: '下周重点：华东CT签约（5月5日后）、协和PET-CT投标、浙大MRI工厂考察（5月7日）。如果顺利，5月首周就能锁定400万以上。',
        timeRange: { start: 115, end: 142 },
        bullets: [
          '5月5日后：华东CT签约（128万）',
          '5月7日：浙大一院工厂考察',
          '5月8日：长征医院刘科长回来'
        ],
        bullets_zh: [
          '5月5日后：华东CT签约（128万）',
          '5月7日：浙大一院工厂考察',
          '5月8日：长征医院刘科长回来'
        ],
        metrics: [
          { label: '下周潜在签约', value: '400万+', direction: 'up' }
        ]
      },
      {
        type: 'preview',
        title: '风险清单：3个隐患需要持续跟踪',
        title_zh: '风险清单：3个隐患需要持续跟踪',
        summary: '持续风险：瑞金回款（120万，已上报风控）、华西DSA失联（165万，12天无响应）、西门子在同济活动（98万，需要升级响应）。每天都要盯着。',
        summary_zh: '持续风险：瑞金回款（120万，已上报风控）、华西DSA失联（165万，12天无响应）、西门子在同济活动（98万，需要升级响应）。每天都要盯着。',
        timeRange: { start: 142, end: 170 },
        bullets: [
          '瑞金回款：120万逾期，风控关注',
          '华西DSA：165万失联12天',
          '同济CT：98万竞品入场'
        ],
        bullets_zh: [
          '瑞金回款：120万逾期，风控关注',
          '华西DSA：165万失联12天',
          '同济CT：98万竞品入场'
        ],
        metrics: [
          { label: '风险金额', value: '383万', direction: 'down' }
        ],
        cta: { action: 'ask_copilot', label: '生成风险报告', label_zh: '生成风险报告', target: 'copilot' }
      }
    ]
  }),
  audio_url: null,
  last_position: 0
};

// 导出完整的7天播报数据
export const briefings7DaysSampleData = [
  briefingDay7, // 5月2日 - 今天（周总结）
  briefingDay6, // 5月1日 - 区域目标缺口
  briefingDay5, // 4月30日 - 沉默客户唤醒
  briefingDay4, // 4月29日 - 回款与发货联动
  briefingDay3, // 4月28日 - 商机冲刺
  briefingDay2, // 4月27日 - 拜访路线优化
  briefingDay1, // 4月26日 - 风险拉响
];

export default briefings7DaysSampleData;
