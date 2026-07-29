import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import type { WorkOrderDetail } from '@/domain/work-order';

/** Hours from now, as an ISO string — keeps the fixture perpetually realistic. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

/** Days before now, for history entries. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Development fixture: one day of work for a single technician, shaped to
 * exercise the dashboard — a breached job, a tight window, an unscheduled job
 * and one without coordinates so routing has to degrade.
 */
export function seedWorkOrders(): WorkOrderDetail[] {
  return [
    {
      id: 'wo-1001',
      number: 'WO-1001',
      status: 'scheduled',
      priority: 'emergency',
      incidentType: '透析机停机',
      customerId: 'acc-1',
      customerName: '南山人民医院',
      address: {
        line1: '广东省深圳市南山区桃园路 89 号',
        city: '深圳',
        location: { latitude: 22.5333, longitude: 113.9301 },
      },
      slaDueBy: hoursFromNow(-1),
      promisedWindowStart: hoursFromNow(-2),
      promisedWindowEnd: hoursFromNow(0),
      scheduledStart: hoursFromNow(-2),
      scheduledEnd: hoursFromNow(-1),
      estimatedDurationMinutes: 60,
      summary: '血液透析机报警停机，科室已停用两台设备。',
      instructions: '进入病区需换鞋并登记，联系设备科王主任取钥匙。',
      assetId: 'asset-9',
      assetName: '透析机 DX-200 #3',
      contactName: '王主任',
      contactPhone: '13800000001',
    },
    {
      id: 'wo-1002',
      number: 'WO-1002',
      status: 'scheduled',
      priority: 'high',
      incidentType: '监护仪校准',
      customerId: 'acc-2',
      customerName: '深圳市第二人民医院',
      address: {
        line1: '广东省深圳市福田区笋岗西路 3002 号',
        city: '深圳',
        location: { latitude: 22.5486, longitude: 114.0895 },
      },
      slaDueBy: hoursFromNow(1.5),
      promisedWindowStart: hoursFromNow(0.5),
      promisedWindowEnd: hoursFromNow(2.5),
      scheduledStart: hoursFromNow(0.5),
      scheduledEnd: hoursFromNow(1.5),
      estimatedDurationMinutes: 60,
      summary: '年度校准，涉及 ICU 6 台监护仪。',
      contactName: '李工',
      contactPhone: '13800000002',
    },
    {
      id: 'wo-1003',
      number: 'WO-1003',
      status: 'scheduled',
      priority: 'normal',
      incidentType: '预防性维护',
      customerId: 'acc-3',
      customerName: '深圳大学附属医院',
      address: {
        line1: '广东省深圳市南山区学苑大道 1098 号',
        city: '深圳',
        location: { latitude: 22.5285, longitude: 113.9366 },
      },
      slaDueBy: hoursFromNow(6),
      scheduledStart: hoursFromNow(3),
      scheduledEnd: hoursFromNow(4),
      estimatedDurationMinutes: 60,
      summary: '季度保养，更换滤芯并记录运行参数。',
    },
    {
      id: 'wo-1004',
      number: 'WO-1004',
      status: 'unscheduled',
      priority: 'low',
      incidentType: '耗材补充',
      customerId: 'acc-4',
      customerName: '罗湖社区健康服务中心',
      // No coordinates: routing must degrade rather than invent a position.
      address: { line1: '广东省深圳市罗湖区人民北路 2019 号', city: '深圳' },
      slaDueBy: hoursFromNow(30),
      estimatedDurationMinutes: 30,
      summary: '补充耗材并回收空瓶。',
    },
  ];
}

export function seedCustomers(): CustomerProfile[] {
  return [
    {
      id: 'acc-1',
      name: '南山人民医院',
      industry: '公立医院',
      siteAccessNotes: '设备科在住院楼 B1，需在门岗登记并换鞋；夜间从急诊入口进。',
      cautions: ['血透室为洁净区，进入前需穿戴鞋套与口罩', '设备停机需科室主任签字确认'],
      contacts: [
        { name: '王主任', role: '设备科主任', phone: '13800000001' },
        { name: '陈护士长', role: '血透室', phone: '13800000011' },
      ],
    },
    {
      id: 'acc-2',
      name: '深圳市第二人民医院',
      industry: '公立医院',
      siteAccessNotes: 'ICU 需提前 30 分钟报备，由李工陪同进入。',
      contacts: [{ name: '李工', role: '临床工程师', phone: '13800000002' }],
    },
    {
      id: 'acc-3',
      name: '深圳大学附属医院',
      industry: '教学医院',
      contacts: [{ name: '张老师', role: '设备管理', phone: '13800000003' }],
    },
    {
      id: 'acc-4',
      name: '罗湖社区健康服务中心',
      industry: '社区医疗',
      contacts: [{ name: '周主任', role: '院办', phone: '13800000004' }],
    },
  ];
}

/** Keyed by customer id. */
export function seedServiceHistory(): Record<string, ServiceHistoryEntry[]> {
  return {
    'acc-1': [
      {
        id: 'h-1',
        workOrderNumber: 'WO-0912',
        completedOn: daysAgo(21),
        incidentType: '透析机停机',
        resolution: '更换电导率传感器，校准后运行正常。判断为进水水质波动导致误报。',
        technicianName: '李工',
        assetName: '透析机 DX-200 #3',
      },
      {
        id: 'h-2',
        workOrderNumber: 'WO-0788',
        completedOn: daysAgo(63),
        incidentType: '透析机停机',
        resolution: '清洗管路并更换滤芯，报警消除。已建议院方加装前置软水器。',
        technicianName: '王工',
        assetName: '透析机 DX-200 #3',
      },
      {
        id: 'h-3',
        workOrderNumber: 'WO-0651',
        completedOn: daysAgo(120),
        incidentType: '预防性维护',
        resolution: '季度保养，更换密封圈，运行参数正常。',
        technicianName: '李工',
      },
    ],
    'acc-2': [
      {
        id: 'h-4',
        workOrderNumber: 'WO-0834',
        completedOn: daysAgo(180),
        incidentType: '监护仪校准',
        resolution: '完成 6 台监护仪年度校准，出具校准报告。',
        technicianName: '赵工',
      },
    ],
    'acc-3': [],
    'acc-4': [],
  };
}
