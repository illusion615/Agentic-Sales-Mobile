import type { WorkOrderDetail } from '@/domain/work-order';

/** Hours from now, as an ISO string — keeps the fixture perpetually realistic. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
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
