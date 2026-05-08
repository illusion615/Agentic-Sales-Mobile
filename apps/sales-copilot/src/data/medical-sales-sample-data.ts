/**
 * 医疗设备/ToB 销售场景 7 天逼真示例数据
 * 用于驱动 BriefMe 晨间播报
 * 
 * 特点：
 * - 数据有冲突和不完美，不是"完美 CRM 数据"
 * - 包含高价值场景：高金额商机临近签约缺关键人、老客户回款延期、顺路拜访挽救风险账户等
 * - 每条记录带时间锚点和数字锚点
 * - 活动覆盖：成了、拖了、人变了、答应又推迟
 * - 待办30%+逾期，逾期原因各异
 * - 信号12条+：连续无推进、金额大confidence下滑、同区域顺路、联系人请假/换岗、回款二次延期、竞品入场、月目标缺口
 */

export const ACCOUNT_IDS = {
  HUADONG_YIYUAN: 'acc-001-huadong-yiyuan',
  ZHONGSHAN_YIYUAN: 'acc-002-zhongshan-yiyuan',
  XINHUA_YILIAO: 'acc-003-xinhua-yiliao',
  RUIJIN_YIYUAN: 'acc-004-ruijin-yiyuan',
  CHANGZHENG_YIYUAN: 'acc-005-changzheng-yiyuan',
  TONGJI_YIYUAN: 'acc-006-tongji-yiyuan',
  XIEHE_YIYUAN: 'acc-007-xiehe-yiyuan',
  HUAXI_YIYUAN: 'acc-008-huaxi-yiyuan',
  QILU_YIYUAN: 'acc-009-qilu-yiyuan',
  ZHEDA_YIYUAN: 'acc-010-zheda-yiyuan',
  SHENGYI_YILIAO: 'acc-011-shengyi-yiliao',
  KANGDA_QIXIE: 'acc-012-kangda-qixie'
} as const;

export const OPP_IDS = {
  HUADONG_CT: 'opp-001-ct-huadong',
  ZHONGSHAN_MRI: 'opp-002-mri-zhongshan',
  XINHUA_MONITOR: 'opp-003-monitor-xinhua',
  RUIJIN_ULTRA: 'opp-004-ultra-ruijin',
  CHANGZHENG_ENDO: 'opp-005-endo-changzheng',
  TONGJI_CT: 'opp-006-ct-tongji',
  XIEHE_PETCT: 'opp-007-petct-xiehe',
  HUAXI_DSA: 'opp-008-dsa-huaxi',
  QILU_MAMMO: 'opp-009-mammo-qilu',
  ZHEDA_MRI: 'opp-010-mri-zheda',
  SHENGYI_PARTS: 'opp-011-parts-shengyi',
  KANGDA_SERVICE: 'opp-012-service-kangda',
  HUADONG_DR: 'opp-013-dr-huadong',
  ZHONGSHAN_XRAY: 'opp-014-xray-zhongshan',
  RUIJIN_VENTILATOR: 'opp-015-vent-ruijin'
} as const;

// ==================== 账户数据 (10个) ====================
export const accountsSampleData = [
  {
    account1_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    name: '华东医院',
    industry: '三甲医院',
    phone: '021-62483180',
    email: 'procurement@huadong-hospital.com',
    address: '上海市静安区延安西路221号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-05-01T14:30:00.000Z',
    latitude: 31.2246,
    longitude: 121.4385,
    region: 0, // 华东
    tier: 0, // S
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-05-01T14:30:00.000Z',
    notes: 'S级战略客户，设备科王主任是关键决策人。CT项目院长已口头同意，等财务最终审批。今天顺路可以拜访。'
  },
  {
    account1_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    name: '中山医院',
    industry: '三甲医院',
    phone: '021-64041990',
    email: 'equip@zs-hospital.sh.cn',
    address: '上海市徐汇区枫林路180号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-18T10:00:00.000Z',
    latitude: 31.1985,
    longitude: 121.4479,
    region: 0, // 华东
    tier: 0, // S
    credit_status: 0, // 正常
    payment_status: 1, // 逾期
    last_interaction_date: '2026-04-18T10:00:00.000Z',
    notes: '老客户，去年采购了2台MRI。但Q1有笔86万尾款拖了快2个月了，财务说资金紧张。新的MRI升级项目被压着不敢报。'
  },
  {
    account1_id: ACCOUNT_IDS.XINHUA_YILIAO,
    name: '新华医疗集团',
    industry: '医疗集团',
    phone: '0533-3587117',
    email: 'purchase@shinva.com',
    address: '山东省淄博市高新区鲁泰大道1号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-28T16:00:00.000Z',
    latitude: 36.8138,
    longitude: 118.0545,
    region: 1, // 华北
    tier: 1, // A
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-28T16:00:00.000Z',
    notes: '监护仪项目竞标中，我们报价比迈瑞高8%，但技术指标更好。采购经理李明暗示价格是主要障碍。'
  },
  {
    account1_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    name: '瑞金医院',
    industry: '三甲医院',
    phone: '021-64370045',
    email: 'device@rjh.com.cn',
    address: '上海市黄浦区瑞金二路197号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-10T09:00:00.000Z',
    latitude: 31.2107,
    longitude: 121.4654,
    region: 0, // 华东
    tier: 0, // S
    credit_status: 1, // 预警
    payment_status: 2, // 催收中
    last_interaction_date: '2026-04-10T09:00:00.000Z',
    notes: '老客户出问题了！之前承诺4月15日付清的120万，拖到现在还没到账。财务那边说院内资金调配出了状况。设备科陈主任换岗了，新来的张主任还不熟悉情况。'
  },
  {
    account1_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    name: '长征医院',
    industry: '军队医院',
    phone: '021-81886999',
    email: 'equipment@czh.cn',
    address: '上海市黄浦区凤阳路415号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-22T14:00:00.000Z',
    latitude: 31.2339,
    longitude: 121.4768,
    region: 0, // 华东
    tier: 1, // A
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-22T14:00:00.000Z',
    notes: '内镜中心项目，预算800万，但流程特别慢。上次说5月初会有消息，结果联系人刘科长去培训了，要5月8号才回来。'
  },
  {
    account1_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    name: '同济医院',
    industry: '三甲医院',
    phone: '027-83662688',
    email: 'procurement@tjh.com.cn',
    address: '武汉市解放大道1095号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-25T11:00:00.000Z',
    latitude: 30.5822,
    longitude: 114.2797,
    region: 1, // 华北
    tier: 1, // A
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-25T11:00:00.000Z',
    notes: 'CT项目稳步推进中，影像科周主任很认可我们的技术。但听说西门子最近在大力做关系，要警惕。'
  },
  {
    account1_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    name: '协和医院',
    industry: '三甲医院',
    phone: '010-69156114',
    email: 'device@pumch.cn',
    address: '北京市东城区帅府园1号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-05-01T09:00:00.000Z',
    latitude: 39.9138,
    longitude: 116.4184,
    region: 1, // 华北
    tier: 0, // S
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-05-01T09:00:00.000Z',
    notes: 'PET-CT项目，全国标杆客户。院长亲自过问，但采购流程极其复杂。核医学科赵主任是技术把关人，需要重点维护。'
  },
  {
    account1_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    name: '华西医院',
    industry: '三甲医院',
    phone: '028-85422286',
    email: 'equipment@wchscu.cn',
    address: '成都市武侯区国学巷37号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-20T15:00:00.000Z',
    latitude: 30.6402,
    longitude: 104.0316,
    region: 3, // 西南
    tier: 0, // S
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-20T15:00:00.000Z',
    notes: 'DSA项目金额大，但已经2周没有任何推进了。上次打电话设备科说领导在开会，没空。可能有问题。'
  },
  {
    account1_id: ACCOUNT_IDS.QILU_YIYUAN,
    name: '齐鲁医院',
    industry: '三甲医院',
    phone: '0531-82169114',
    email: 'purchase@qiluhospital.com',
    address: '山东省济南市历下区文化西路107号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-29T10:00:00.000Z',
    latitude: 36.6673,
    longitude: 117.0258,
    region: 1, // 华北
    tier: 2, // B
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-29T10:00:00.000Z',
    notes: '乳腺钼靶机项目，金额不大但利润率高。放射科孙主任很满意上次的演示，说会尽快推进。'
  },
  {
    account1_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    name: '浙大一院',
    industry: '三甲医院',
    phone: '0571-87236114',
    email: 'equipment@zy1y.com',
    address: '杭州市上城区庆春路79号',
    owner_id: 'demo-user-id',
    last_contacted_on: '2026-04-15T14:00:00.000Z',
    latitude: 30.2573,
    longitude: 120.1697,
    region: 0, // 华东
    tier: 0, // S
    credit_status: 0, // 正常
    payment_status: 0, // 正常
    last_interaction_date: '2026-04-15T14:00:00.000Z',
    notes: 'MRI项目沉默了快3周。但昨天突然收到设备科助理的微信，问能不能安排下周去考察我们工厂。可能有戏！'
  }
];

// ==================== 商机数据 (15个) ====================
export const opportunitiesSampleData = [
  {
    opportunity1_id: OPP_IDS.HUADONG_CT,
    name: '华东医院256排CT采购项目',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 3, // negotiation
    confidence: 85,
    total_amount: 1280000,
    expected_close_date: '2026-05-08T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-02-15T10:00:00.000Z',
    last_action: '5月1日院长办公会讨论通过，等财务最终审批',
    blocker: '财务处长出差，要5月5日才能签字',
    confidence_trend: 0 // up
  },
  {
    opportunity1_id: OPP_IDS.ZHONGSHAN_MRI,
    name: '中山医院3.0T MRI升级项目',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 40,
    total_amount: 2400000,
    expected_close_date: '2026-06-30T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-03-10T09:00:00.000Z',
    last_action: '4月18日提交了技术方案，但因回款问题一直没敢跟进',
    blocker: '86万尾款未清，影响新项目报批',
    confidence_trend: 1 // down
  },
  {
    opportunity1_id: OPP_IDS.XINHUA_MONITOR,
    name: '新华医疗监护仪集采项目',
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 55,
    total_amount: 680000,
    expected_close_date: '2026-05-20T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-03-25T14:00:00.000Z',
    last_action: '4月28日参加竞标会，技术评分第一但价格评分落后',
    blocker: '价格比迈瑞高8%，对方在压价',
    confidence_trend: 1 // down
  },
  {
    opportunity1_id: OPP_IDS.RUIJIN_ULTRA,
    name: '瑞金医院高端超声设备采购',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 1, // qualification
    confidence: 25,
    total_amount: 450000,
    expected_close_date: '2026-07-15T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-04-05T11:00:00.000Z',
    last_action: '4月10日首次拜访，但设备科陈主任已换岗',
    blocker: '老联系人换岗、回款严重逾期、新决策人不熟悉',
    confidence_trend: 1 // down
  },
  {
    opportunity1_id: OPP_IDS.CHANGZHENG_ENDO,
    name: '长征医院内镜中心整体解决方案',
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 60,
    total_amount: 820000,
    expected_close_date: '2026-06-15T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-03-01T08:00:00.000Z',
    last_action: '4月22日提交完整方案，对方说5月初给回复',
    blocker: '关键联系人刘科长培训中，5月8日才回',
    confidence_trend: 2 // flat
  },
  {
    opportunity1_id: OPP_IDS.TONGJI_CT,
    name: '同济医院CT设备更新项目',
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 65,
    total_amount: 980000,
    expected_close_date: '2026-05-30T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-02-28T10:00:00.000Z',
    last_action: '4月25日周主任表示技术方案没问题，下周上会讨论',
    blocker: '听说西门子在大力做关系，需要警惕',
    confidence_trend: 2 // flat
  },
  {
    opportunity1_id: OPP_IDS.XIEHE_PETCT,
    name: '协和医院PET-CT采购项目',
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 3, // negotiation
    confidence: 75,
    total_amount: 3800000,
    expected_close_date: '2026-05-15T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-01-10T09:00:00.000Z',
    last_action: '5月1日与核医学科赵主任确认技术细节，准备最终报价',
    blocker: '采购流程复杂，还需院长办公会最终审批',
    confidence_trend: 0 // up
  },
  {
    opportunity1_id: OPP_IDS.HUAXI_DSA,
    name: '华西医院DSA血管造影机项目',
    account_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 35,
    total_amount: 1650000,
    expected_close_date: '2026-06-30T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-03-05T11:00:00.000Z',
    last_action: '4月20日最后一次沟通，之后连续2周无回应',
    blocker: '连续2周无法联系到设备科，可能有内部变故',
    confidence_trend: 1 // down
  },
  {
    opportunity1_id: OPP_IDS.QILU_MAMMO,
    name: '齐鲁医院乳腺钼靶机采购',
    account_id: ACCOUNT_IDS.QILU_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 2, // proposal
    confidence: 70,
    total_amount: 280000,
    expected_close_date: '2026-05-25T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-04-01T14:00:00.000Z',
    last_action: '4月29日孙主任表示很满意演示效果',
    blocker: '金额不大，但需要放射科主任最终确认机型',
    confidence_trend: 0 // up
  },
  {
    opportunity1_id: OPP_IDS.ZHEDA_MRI,
    name: '浙大一院1.5T MRI采购项目',
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 1, // qualification
    confidence: 50,
    total_amount: 1100000,
    expected_close_date: '2026-06-30T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-03-20T10:00:00.000Z',
    last_action: '昨天收到设备科助理微信，问能否安排下周考察工厂',
    blocker: '沉默3周后突然重新联系，需要判断真实意图',
    confidence_trend: 0 // up
  },
  {
    opportunity1_id: OPP_IDS.HUADONG_DR,
    name: '华东医院DR设备更换项目',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 1, // qualification
    confidence: 45,
    total_amount: 320000,
    expected_close_date: '2026-07-31T00:00:00.000Z',
    closed_on: null,
    created_on: '2026-04-20T09:00:00.000Z',
    last_action: '4月底初步沟通，对方有兴趣但还没提上日程',
    blocker: '客户精力都在CT项目上，DR项目优先级低',
    confidence_trend: 2 // flat
  },
  {
    opportunity1_id: OPP_IDS.ZHONGSHAN_XRAY,
    name: '中山医院移动式X光机采购',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 4, // won
    confidence: 100,
    total_amount: 180000,
    expected_close_date: '2026-04-20T00:00:00.000Z',
    closed_on: '2026-04-22T10:00:00.000Z',
    created_on: '2026-03-15T14:00:00.000Z',
    last_action: '4月22日签约完成，但因回款问题发货被压',
    blocker: '签约了但没发货，等回款',
    confidence_trend: 2 // flat
  },
  {
    opportunity1_id: OPP_IDS.RUIJIN_VENTILATOR,
    name: '瑞金医院呼吸机批量采购',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    owner_id: 'demo-user-id',
    stage: 5, // lost
    confidence: 0,
    total_amount: 560000,
    expected_close_date: '2026-04-30T00:00:00.000Z',
    closed_on: '2026-04-28T16:00:00.000Z',
    created_on: '2026-03-01T10:00:00.000Z',
    last_action: '输给了迈瑞，对方价格低15%且响应更快',
    blocker: '回款问题影响了我们的服务响应速度',
    confidence_trend: 1 // down
  }
];

// ==================== 活动数据 (24条) ====================
export const activitiesSampleData = [
  // 今天 5月2日
  {
    activity1_id: 'act-001',
    title: '华东医院CT项目跟进拜访',
    type: 0, // visit
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-02T10:00:00.000Z',
    draft_status: 1, // confirmed
    notes: '今天顺路去一趟，确认财务审批进度。王主任说5月5日财务处长回来就能签字。',
    created_on: '2026-05-01T18:00:00.000Z',
    outcome: null
  },
  {
    activity1_id: 'act-002',
    title: '协和医院PET-CT最终报价讨论',
    type: 1, // call
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-02T14:00:00.000Z',
    draft_status: 1, // confirmed
    notes: '和赵主任确认最终配置和报价，准备提交正式投标文件',
    created_on: '2026-05-01T16:00:00.000Z',
    outcome: null
  },
  // 昨天 5月1日
  {
    activity1_id: 'act-003',
    title: '华东医院CT项目回访',
    type: 0, // visit
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-01T14:30:00.000Z',
    draft_status: 2, // completed
    notes: '好消息！院长办公会已经讨论通过了，就等财务最终签字。',
    created_on: '2026-04-30T10:00:00.000Z',
    outcome: 0 // 成功
  },
  {
    activity1_id: 'act-004',
    title: '协和医院技术确认会',
    type: 2, // meeting
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-01T09:00:00.000Z',
    draft_status: 2, // completed
    notes: '赵主任对技术方案很满意，同意我们准备最终报价。',
    created_on: '2026-04-29T15:00:00.000Z',
    outcome: 0 // 成功
  },
  // 4月30日
  {
    activity1_id: 'act-005',
    title: '瑞金医院回款催收电话',
    type: 1, // call
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-30T10:00:00.000Z',
    draft_status: 2, // completed
    notes: '财务说本周肯定付...结果又没到账。这是第二次承诺后推迟了。',
    created_on: '2026-04-29T09:00:00.000Z',
    outcome: 3 // 承诺后推迟
  },
  {
    activity1_id: 'act-006',
    title: '长征医院项目进度确认',
    type: 1, // call
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    opportunity_id: OPP_IDS.CHANGZHENG_ENDO,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-30T15:00:00.000Z',
    draft_status: 2, // completed
    notes: '打电话才知道刘科长去培训了，要5月8日才回来。只能等。',
    created_on: '2026-04-29T14:00:00.000Z',
    outcome: 2 // 人员变动
  },
  // 4月29日
  {
    activity1_id: 'act-007',
    title: '齐鲁医院钼靶机演示',
    type: 0, // visit
    account_id: ACCOUNT_IDS.QILU_YIYUAN,
    opportunity_id: OPP_IDS.QILU_MAMMO,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-29T10:00:00.000Z',
    draft_status: 2, // completed
    notes: '演示效果很好，孙主任当场就说没问题，让我们准备合同。',
    created_on: '2026-04-28T08:00:00.000Z',
    outcome: 0 // 成功
  },
  // 4月28日
  {
    activity1_id: 'act-008',
    title: '新华医疗竞标会',
    type: 2, // meeting
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    opportunity_id: OPP_IDS.XINHUA_MONITOR,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-28T09:00:00.000Z',
    draft_status: 2, // completed
    notes: '技术评分第一，但价格评分被迈瑞压了。李经理私下说价格是关键。',
    created_on: '2026-04-25T10:00:00.000Z',
    outcome: 1 // 拖延
  },
  // 4月25日
  {
    activity1_id: 'act-009',
    title: '同济医院CT项目技术交流',
    type: 0, // visit
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    opportunity_id: OPP_IDS.TONGJI_CT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-25T11:00:00.000Z',
    draft_status: 2, // completed
    notes: '周主任认可技术方案，说下周上会。但听说西门子在做关系...',
    created_on: '2026-04-24T09:00:00.000Z',
    outcome: 0 // 成功
  },
  // 4月22日
  {
    activity1_id: 'act-010',
    title: '中山医院X光机签约',
    type: 2, // meeting
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    opportunity_id: OPP_IDS.ZHONGSHAN_XRAY,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-22T10:00:00.000Z',
    draft_status: 2, // completed
    notes: '签约完成！但财务说要先清完旧账才能发货。',
    created_on: '2026-04-20T14:00:00.000Z',
    outcome: 0 // 成功
  },
  {
    activity1_id: 'act-011',
    title: '长征医院内镜中心方案提交',
    type: 0, // visit
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    opportunity_id: OPP_IDS.CHANGZHENG_ENDO,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-22T14:00:00.000Z',
    draft_status: 2, // completed
    notes: '提交了完整方案，刘科长说5月初给回复',
    created_on: '2026-04-21T09:00:00.000Z',
    outcome: 0 // 成功
  },
  // 4月20日
  {
    activity1_id: 'act-012',
    title: '华西医院DSA项目沟通',
    type: 1, // call
    account_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    opportunity_id: OPP_IDS.HUAXI_DSA,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-20T15:00:00.000Z',
    draft_status: 2, // completed
    notes: '这是最后一次联系上设备科的时候，之后就没人接电话了...',
    created_on: '2026-04-19T10:00:00.000Z',
    outcome: 4 // 无结果
  },
  // 4月18日
  {
    activity1_id: 'act-013',
    title: '中山医院MRI方案提交',
    type: 3, // email
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    opportunity_id: OPP_IDS.ZHONGSHAN_MRI,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-18T10:00:00.000Z',
    draft_status: 2, // completed
    notes: '提交了技术方案，但因为回款问题不敢主动跟进',
    created_on: '2026-04-17T16:00:00.000Z',
    outcome: 1 // 拖延
  },
  // 4月15日
  {
    activity1_id: 'act-014',
    title: '浙大一院MRI需求沟通',
    type: 0, // visit
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    opportunity_id: OPP_IDS.ZHEDA_MRI,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-15T14:00:00.000Z',
    draft_status: 2, // completed
    notes: '聊了需求，对方态度一般。没想到3周后突然又联系我们了。',
    created_on: '2026-04-14T09:00:00.000Z',
    outcome: 4 // 无结果
  },
  {
    activity1_id: 'act-015',
    title: '瑞金医院首次回款催收',
    type: 1, // call
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-15T09:00:00.000Z',
    draft_status: 2, // completed
    notes: '财务说4月底前肯定付...结果并没有',
    created_on: '2026-04-14T15:00:00.000Z',
    outcome: 3 // 承诺后推迟
  },
  // 4月10日
  {
    activity1_id: 'act-016',
    title: '瑞金医院超声项目首访',
    type: 0, // visit
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: OPP_IDS.RUIJIN_ULTRA,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-10T09:00:00.000Z',
    draft_status: 2, // completed
    notes: '去了才知道陈主任已经调走了！新来的张主任态度冷淡，说要重新评估。',
    created_on: '2026-04-09T10:00:00.000Z',
    outcome: 2 // 人员变动
  },
  // 语音录入活动
  {
    activity1_id: 'act-017',
    title: '【语音备注】新华医疗项目思考',
    type: 4, // other (语音录入)
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    opportunity_id: OPP_IDS.XINHUA_MONITOR,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-28T18:30:00.000Z',
    draft_status: 2, // completed
    notes: '开车回来路上想了想，价格确实是硬伤。要不要申请特批降价？但利润就没了...先跟领导商量下。',
    created_on: '2026-04-28T18:30:00.000Z',
    outcome: 4 // 无结果
  },
  // 更多历史活动
  {
    activity1_id: 'act-018',
    title: '协和医院核医学科拜访',
    type: 0, // visit
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-26T10:00:00.000Z',
    draft_status: 2, // completed
    notes: '赵主任很专业，问了很多技术细节。总体态度积极。',
    created_on: '2026-04-25T09:00:00.000Z',
    outcome: 0 // 成功
  },
  // 被取消的活动
  {
    activity1_id: 'act-019',
    title: '华西医院DSA演示（已取消）',
    type: 0, // visit
    account_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    opportunity_id: OPP_IDS.HUAXI_DSA,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-27T10:00:00.000Z',
    draft_status: 3, // cancelled
    notes: '对方临时说领导有事，改期。但后来就联系不上了。',
    created_on: '2026-04-24T14:00:00.000Z',
    outcome: 1 // 拖延
  },
  // 未来计划的活动
  {
    activity1_id: 'act-020',
    title: '浙大一院工厂考察接待',
    type: 2, // meeting
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    opportunity_id: OPP_IDS.ZHEDA_MRI,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-07T09:00:00.000Z',
    draft_status: 0, // draft
    notes: '昨天突然收到消息说要来考察，安排下周三。这是好信号！',
    created_on: '2026-05-01T20:00:00.000Z',
    outcome: null
  },
  {
    activity1_id: 'act-021',
    title: '华东医院财务签字跟进',
    type: 1, // call
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-05T10:00:00.000Z',
    draft_status: 1, // confirmed
    notes: '财务处长5月5日回来，当天打电话确认签字进度',
    created_on: '2026-05-01T15:00:00.000Z',
    outcome: null
  },
  {
    activity1_id: 'act-022',
    title: '长征医院刘科长回访',
    type: 1, // call
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    opportunity_id: OPP_IDS.CHANGZHENG_ENDO,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-08T14:00:00.000Z',
    draft_status: 1, // confirmed
    notes: '刘科长5月8日培训结束，当天下午打电话跟进',
    created_on: '2026-04-30T16:00:00.000Z',
    outcome: null
  },
  // 今日华东区顺路拜访提醒
  {
    activity1_id: 'act-023',
    title: '瑞金医院顺路拜访（建议）',
    type: 0, // visit
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-05-02T11:30:00.000Z',
    draft_status: 0, // draft
    notes: '今天去华东医院的话，可以顺路去瑞金催一下回款。两家医院距离只有2公里。',
    created_on: '2026-05-02T06:00:00.000Z',
    outcome: null
  },
  // 竞品相关活动
  {
    activity1_id: 'act-024',
    title: '【情报】同济医院竞品动向',
    type: 4, // other
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    opportunity_id: OPP_IDS.TONGJI_CT,
    owner_id: 'demo-user-id',
    scheduled_date: '2026-04-30T12:00:00.000Z',
    draft_status: 2, // completed
    notes: '从渠道听说西门子华中区老总亲自去拜访了院长。要高度重视！',
    created_on: '2026-04-30T12:00:00.000Z',
    outcome: 4 // 无结果
  }
];

// ==================== 待办数据 (15条，35%逾期) ====================
export const tasksSampleData = [
  // 逾期待办 (5条逾期，占33%)
  {
    task_id: 'task-001',
    title: '催收瑞金医院120万逾期款',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    due_date: '2026-04-25T18:00:00.000Z',
    status: 1, // 进行中
    is_overdue: true,
    overdue_reason: '对方财务说资金调配出问题，连续两次承诺后又推迟。新设备科张主任不熟悉情况也帮不上忙。',
    priority: 0, // 高
    notes: '已经逾期7天了，再拖下去要上报风控了',
    created_on: '2026-04-15T09:00:00.000Z'
  },
  {
    task_id: 'task-002',
    title: '跟进中山医院MRI方案反馈',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    opportunity_id: OPP_IDS.ZHONGSHAN_MRI,
    owner_id: 'demo-user-id',
    due_date: '2026-04-28T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: true,
    overdue_reason: '因为回款问题不敢主动催，一直拖着没跟进',
    priority: 1, // 中
    notes: '方案已经提交10多天了，要不要硬着头皮问一下？',
    created_on: '2026-04-18T11:00:00.000Z'
  },
  {
    task_id: 'task-003',
    title: '华西医院DSA项目重新建联',
    account_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    opportunity_id: OPP_IDS.HUAXI_DSA,
    owner_id: 'demo-user-id',
    due_date: '2026-04-30T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: true,
    overdue_reason: '连续两周打电话都没人接，发邮件也不回。可能内部出了什么问题。',
    priority: 0, // 高
    notes: '165万的项目不能就这么丢了，要想办法找其他渠道联系',
    created_on: '2026-04-20T16:00:00.000Z'
  },
  {
    task_id: 'task-004',
    title: '新华医疗监护仪项目降价申请',
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    opportunity_id: OPP_IDS.XINHUA_MONITOR,
    owner_id: 'demo-user-id',
    due_date: '2026-05-01T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: true,
    overdue_reason: '一直在纠结要不要降价，利润率已经很低了。拖到现在还没决定。',
    priority: 0, // 高
    notes: '技术评分第一但价格输了，降5%能不能拿下？',
    created_on: '2026-04-28T18:00:00.000Z'
  },
  {
    task_id: 'task-005',
    title: '提交同济医院CT项目投标文件',
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    opportunity_id: OPP_IDS.TONGJI_CT,
    owner_id: 'demo-user-id',
    due_date: '2026-05-01T23:59:00.000Z',
    status: 1, // 进行中
    is_overdue: true,
    overdue_reason: '周主任说上周会讨论，但没收到通知。听说西门子在做关系，文件准备好了但不敢贸然提交。',
    priority: 0, // 高
    notes: '再等等还是先提交？万一对方已经内定了呢...',
    created_on: '2026-04-25T12:00:00.000Z'
  },
  // 今日待办 (3条)
  {
    task_id: 'task-006',
    title: '确认华东医院CT财务审批进度',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    due_date: '2026-05-02T18:00:00.000Z',
    status: 1, // 进行中
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '今天顺路拜访，确认财务签字流程',
    created_on: '2026-05-01T16:00:00.000Z'
  },
  {
    task_id: 'task-007',
    title: '准备协和医院PET-CT最终报价',
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    due_date: '2026-05-02T18:00:00.000Z',
    status: 1, // 进行中
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '和赵主任电话确认配置后，今天内完成报价单',
    created_on: '2026-05-01T17:00:00.000Z'
  },
  {
    task_id: 'task-008',
    title: '回复浙大一院工厂考察安排',
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    opportunity_id: OPP_IDS.ZHEDA_MRI,
    owner_id: 'demo-user-id',
    due_date: '2026-05-02T12:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '昨晚收到的消息，要尽快确认下周三的考察安排',
    created_on: '2026-05-01T21:00:00.000Z'
  },
  // 本周待办 (4条)
  {
    task_id: 'task-009',
    title: '跟进华东医院财务签字',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    due_date: '2026-05-05T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '财务处长5日回来，当天确认签字结果',
    created_on: '2026-05-01T15:00:00.000Z'
  },
  {
    task_id: 'task-010',
    title: '准备齐鲁医院钼靶机合同',
    account_id: ACCOUNT_IDS.QILU_YIYUAN,
    opportunity_id: OPP_IDS.QILU_MAMMO,
    owner_id: 'demo-user-id',
    due_date: '2026-05-06T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 1, // 中
    notes: '孙主任说没问题，让准备合同。先把模板改好。',
    created_on: '2026-04-29T11:00:00.000Z'
  },
  {
    task_id: 'task-011',
    title: '长征医院刘科长培训后回访',
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    opportunity_id: OPP_IDS.CHANGZHENG_ENDO,
    owner_id: 'demo-user-id',
    due_date: '2026-05-08T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 1, // 中
    notes: '刘科长8日培训结束，当天打电话',
    created_on: '2026-04-30T16:00:00.000Z'
  },
  {
    task_id: 'task-012',
    title: '浙大一院工厂考察接待',
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    opportunity_id: OPP_IDS.ZHEDA_MRI,
    owner_id: 'demo-user-id',
    due_date: '2026-05-07T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '沉默3周后突然要来考察，好好准备！',
    created_on: '2026-05-01T21:00:00.000Z'
  },
  // 后续待办 (3条)
  {
    task_id: 'task-013',
    title: '协和医院投标文件提交',
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    due_date: '2026-05-12T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 0, // 高
    notes: '380万大单，投标文件要仔细准备',
    created_on: '2026-05-01T10:00:00.000Z'
  },
  {
    task_id: 'task-014',
    title: '月度销售数据汇总',
    account_id: null,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    due_date: '2026-05-10T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 1, // 中
    notes: '4月完成65%，5月压力很大',
    created_on: '2026-05-01T09:00:00.000Z'
  },
  {
    task_id: 'task-015',
    title: '拜访瑞金医院新任设备科张主任',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: OPP_IDS.RUIJIN_ULTRA,
    owner_id: 'demo-user-id',
    due_date: '2026-05-15T18:00:00.000Z',
    status: 0, // 待办
    is_overdue: false,
    overdue_reason: '',
    priority: 1, // 中
    notes: '老联系人陈主任换岗了，要尽快和新领导建立关系',
    created_on: '2026-04-10T10:00:00.000Z'
  }
];

// ==================== 信号数据 (15条) ====================
export const signalsSampleData = [
  // 紧急信号
  {
    signal_id: 'sig-001',
    signal_type: 'payment_overdue',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    title: '回款二次延期预警',
    description: '瑞金医院120万逾期款已两次承诺后推迟，逾期天数达22天。财务说资金调配出问题，新设备科张主任也帮不上忙。再拖可能要上报风控。',
    severity: 0, // critical
    detected_on: '2026-05-02T06:00:00.000Z',
    related_data_json: JSON.stringify({ amount: 1200000, overdue_days: 22, promise_count: 2 }),
    is_active: true
  },
  {
    signal_id: 'sig-002',
    signal_type: 'no_progress',
    account_id: ACCOUNT_IDS.HUAXI_YIYUAN,
    opportunity_id: OPP_IDS.HUAXI_DSA,
    owner_id: 'demo-user-id',
    title: '连续两周无推进 - 华西DSA项目',
    description: '华西医院DSA项目（165万）自4月20日后失联，连续2周无法联系到设备科。可能有内部变故，需要找其他渠道了解情况。',
    severity: 0, // critical
    detected_on: '2026-05-02T06:00:00.000Z',
    related_data_json: JSON.stringify({ last_contact: '2026-04-20', days_silent: 12, amount: 1650000 }),
    is_active: true
  },
  {
    signal_id: 'sig-003',
    signal_type: 'competitor_alert',
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    opportunity_id: OPP_IDS.TONGJI_CT,
    owner_id: 'demo-user-id',
    title: '竞品突然入场 - 同济医院CT项目',
    description: '情报显示西门子华中区老总亲自拜访了同济医院院长。98万CT项目有被截胡风险，周主任虽然认可我们技术，但最终决策在院领导。',
    severity: 1, // warning
    detected_on: '2026-04-30T12:00:00.000Z',
    related_data_json: JSON.stringify({ competitor: '西门子', amount: 980000, confidence_change: -10 }),
    is_active: true
  },
  // 警示信号
  {
    signal_id: 'sig-004',
    signal_type: 'contact_change',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    opportunity_id: OPP_IDS.RUIJIN_ULTRA,
    owner_id: 'demo-user-id',
    title: '关键联系人换岗 - 瑞金医院',
    description: '设备科陈主任已调离，新任张主任态度冷淡。需要重新建立关系，超声项目可能要从头沟通。',
    severity: 1, // warning
    detected_on: '2026-04-10T10:00:00.000Z',
    related_data_json: JSON.stringify({ old_contact: '陈主任', new_contact: '张主任' }),
    is_active: true
  },
  {
    signal_id: 'sig-005',
    signal_type: 'contact_unavailable',
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    opportunity_id: OPP_IDS.CHANGZHENG_ENDO,
    owner_id: 'demo-user-id',
    title: '联系人培训中 - 长征医院',
    description: '关键联系人刘科长去培训了，5月8日才回来。82万内镜中心项目只能等待，但要注意培训回来后第一时间跟进。',
    severity: 2, // info
    detected_on: '2026-04-30T15:00:00.000Z',
    related_data_json: JSON.stringify({ contact: '刘科长', return_date: '2026-05-08' }),
    is_active: true
  },
  {
    signal_id: 'sig-006',
    signal_type: 'payment_affecting_deal',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    opportunity_id: OPP_IDS.ZHONGSHAN_MRI,
    owner_id: 'demo-user-id',
    title: '回款逾期影响新项目 - 中山医院',
    description: '中山医院86万尾款逾期近2个月，新的240万MRI升级项目被压着不敢报。已签约的18万X光机也因此不敢发货。',
    severity: 1, // warning
    detected_on: '2026-05-02T06:00:00.000Z',
    related_data_json: JSON.stringify({ overdue_amount: 860000, blocked_deal: 2400000, blocked_shipment: 180000 }),
    is_active: true
  },
  {
    signal_id: 'sig-007',
    signal_type: 'price_pressure',
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    opportunity_id: OPP_IDS.XINHUA_MONITOR,
    owner_id: 'demo-user-id',
    title: '价格竞争压力 - 新华医疗',
    description: '监护仪集采项目技术评分第一，但价格比迈瑞高8%。采购经理暗示价格是关键因素，是否申请降价需要尽快决定。',
    severity: 1, // warning
    detected_on: '2026-04-28T18:00:00.000Z',
    related_data_json: JSON.stringify({ our_price: 680000, competitor_price: 630000, gap_percent: 8 }),
    is_active: true
  },
  // 正面信号
  {
    signal_id: 'sig-008',
    signal_type: 'deal_ready',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: OPP_IDS.HUADONG_CT,
    owner_id: 'demo-user-id',
    title: '临近签约 - 华东医院CT项目',
    description: '128万CT项目院长办公会已通过，只等财务处长5月5日回来签字。今天可以顺路拜访确认进度。',
    severity: 3, // positive
    detected_on: '2026-05-01T15:00:00.000Z',
    related_data_json: JSON.stringify({ amount: 1280000, approval_date: '2026-05-01', pending: '财务签字' }),
    is_active: true
  },
  {
    signal_id: 'sig-009',
    signal_type: 'deal_closing',
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    opportunity_id: OPP_IDS.XIEHE_PETCT,
    owner_id: 'demo-user-id',
    title: '大单推进顺利 - 协和医院PET-CT',
    description: '380万PET-CT项目技术确认完成，赵主任很满意。今天确认最终配置和报价，准备提交正式投标文件。',
    severity: 3, // positive
    detected_on: '2026-05-01T10:00:00.000Z',
    related_data_json: JSON.stringify({ amount: 3800000, confidence: 75, next_step: '最终报价' }),
    is_active: true
  },
  {
    signal_id: 'sig-010',
    signal_type: 'reactivation',
    account_id: ACCOUNT_IDS.ZHEDA_YIYUAN,
    opportunity_id: OPP_IDS.ZHEDA_MRI,
    owner_id: 'demo-user-id',
    title: '沉默商机重新激活 - 浙大一院',
    description: 'MRI项目沉默3周后，昨天突然收到设备科助理微信，问能否安排下周考察工厂。可能有戏，需要好好准备！',
    severity: 3, // positive
    detected_on: '2026-05-01T20:00:00.000Z',
    related_data_json: JSON.stringify({ silent_days: 21, reactivation_signal: '工厂考察请求', amount: 1100000 }),
    is_active: true
  },
  {
    signal_id: 'sig-011',
    signal_type: 'demo_success',
    account_id: ACCOUNT_IDS.QILU_YIYUAN,
    opportunity_id: OPP_IDS.QILU_MAMMO,
    owner_id: 'demo-user-id',
    title: '演示获认可 - 齐鲁医院钼靶机',
    description: '28万钼靶机项目演示效果很好，孙主任当场表示没问题，让准备合同。利润率高的小单，争取快速签约。',
    severity: 3, // positive
    detected_on: '2026-04-29T11:00:00.000Z',
    related_data_json: JSON.stringify({ amount: 280000, demo_result: '非常满意', next_step: '准备合同' }),
    is_active: true
  },
  // 业务洞察
  {
    signal_id: 'sig-012',
    signal_type: 'route_optimization',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    title: '今日顺路拜访建议 - 华东区',
    description: '今天去华东医院的话，可以顺路拜访瑞金医院催款（距离2公里）。两件事一趟搞定，效率更高。',
    severity: 2, // info
    detected_on: '2026-05-02T06:00:00.000Z',
    related_data_json: JSON.stringify({ primary_visit: 'acc-001-huadong-yiyuan', nearby: ['acc-004-ruijin-yiyuan'], distance_km: 2 }),
    is_active: true
  },
  {
    signal_id: 'sig-013',
    signal_type: 'target_gap',
    account_id: null,
    opportunity_id: null,
    owner_id: 'demo-user-id',
    title: '5月目标缺口预警',
    description: '4月完成率65%，5月已过去2天。本月目标500万，目前确认可签约的只有华东CT（128万）和齐鲁钼靶（28万），缺口344万。',
    severity: 1, // warning
    detected_on: '2026-05-02T06:00:00.000Z',
    related_data_json: JSON.stringify({ monthly_target: 5000000, confirmed: 1560000, gap: 3440000, last_month_rate: 0.65 }),
    is_active: true
  },
  {
    signal_id: 'sig-014',
    signal_type: 'confidence_drop',
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    opportunity_id: OPP_IDS.XINHUA_MONITOR,
    owner_id: 'demo-user-id',
    title: '信心度连续下滑 - 新华监护仪',
    description: '新华医疗监护仪项目信心度从70%降至55%，主要因为价格竞争不利。如果不能在价格上有所突破，可能会输给迈瑞。',
    severity: 1, // warning
    detected_on: '2026-04-28T19:00:00.000Z',
    related_data_json: JSON.stringify({ previous_confidence: 70, current_confidence: 55, drop_reason: '价格竞争' }),
    is_active: true
  },
  {
    signal_id: 'sig-015',
    signal_type: 'win_celebration',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    opportunity_id: OPP_IDS.ZHONGSHAN_XRAY,
    owner_id: 'demo-user-id',
    title: '签约成功但发货受阻 - 中山X光机',
    description: '18万移动式X光机4月22日签约成功！但因为回款问题，公司财务要求先清完旧账才能发货。',
    severity: 2, // info
    detected_on: '2026-04-22T11:00:00.000Z',
    related_data_json: JSON.stringify({ amount: 180000, signed_date: '2026-04-22', blocker: '等回款后发货' }),
    is_active: true
  }
];

// ==================== 联系人数据 ====================
export const contactsSampleData = [
  {
    contact_id: 'contact-001',
    full_name: '王志强',
    account_id: ACCOUNT_IDS.HUADONG_YIYUAN,
    title: '设备科主任',
    phone: '13901234567',
    email: 'wang.zhiqiang@huadong-hospital.com'
  },
  {
    contact_id: 'contact-002',
    full_name: '陈建华',
    account_id: ACCOUNT_IDS.ZHONGSHAN_YIYUAN,
    title: '设备科科长',
    phone: '13802345678',
    email: 'chen.jianhua@zs-hospital.sh.cn'
  },
  {
    contact_id: 'contact-003',
    full_name: '李明',
    account_id: ACCOUNT_IDS.XINHUA_YILIAO,
    title: '采购经理',
    phone: '13703456789',
    email: 'li.ming@shinva.com'
  },
  {
    contact_id: 'contact-004',
    full_name: '张伟',
    account_id: ACCOUNT_IDS.RUIJIN_YIYUAN,
    title: '设备科主任（新任）',
    phone: '13604567890',
    email: 'zhang.wei@rjh.com.cn'
  },
  {
    contact_id: 'contact-005',
    full_name: '刘国庆',
    account_id: ACCOUNT_IDS.CHANGZHENG_YIYUAN,
    title: '设备科科长',
    phone: '13505678901',
    email: 'liu.guoqing@czh.cn'
  },
  {
    contact_id: 'contact-006',
    full_name: '周明',
    account_id: ACCOUNT_IDS.TONGJI_YIYUAN,
    title: '影像科主任',
    phone: '13406789012',
    email: 'zhou.ming@tjh.com.cn'
  },
  {
    contact_id: 'contact-007',
    full_name: '赵建国',
    account_id: ACCOUNT_IDS.XIEHE_YIYUAN,
    title: '核医学科主任',
    phone: '13307890123',
    email: 'zhao.jianguo@pumch.cn'
  },
  {
    contact_id: 'contact-008',
    full_name: '孙丽',
    account_id: ACCOUNT_IDS.QILU_YIYUAN,
    title: '放射科主任',
    phone: '13208901234',
    email: 'sun.li@qiluhospital.com'
  }
];

// ==================== Briefing 数据 (7天) ====================
// 从独立文件导入完整的7天播报数据
export { briefings7DaysSampleData as briefingsSampleData } from './briefings-7days';
