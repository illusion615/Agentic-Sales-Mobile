import { describe, expect, it } from 'vitest';
import { seedWorkOrders } from '@/data/local/seed';
import { distanceKm } from '@/domain/scheduling';
import { hasCoordinates } from '@/domain/work-order';
import { wgs84ToGcj02 } from '@/lib/geo-datum';

/** AMap POI records verified 2026-07-31; locations are GCJ-02. */
const AMAP_POIS = {
  'wo-1001': {
    name: '深圳市南山区人民医院',
    addressIncludes: '桃园路 89 号',
    gcj: { longitude: 113.922873, latitude: 22.530603 },
  },
  'wo-1002': {
    name: '深圳市第二人民医院',
    addressIncludes: '笋岗西路 3002 号',
    gcj: { longitude: 114.08574, latitude: 22.557275 },
  },
  'wo-1003': {
    name: '深圳大学总医院',
    addressIncludes: '学苑大道 1298 号',
    gcj: { longitude: 113.987481, latitude: 22.594355 },
  },
  'wo-1004': {
    name: '深圳市罗湖区书院街社区健康服务中心',
    addressIncludes: '人民北路 3081 号',
    gcj: { longitude: 114.120375, latitude: 22.553563 },
  },
  'wo-1005': {
    name: '深圳市宝安人民医院',
    addressIncludes: '龙井二路 118 号',
    gcj: { longitude: 113.914854, latitude: 22.562217 },
  },
  'wo-1006': {
    name: '深圳市龙岗中心医院',
    addressIncludes: '龙岗大道 6082 号',
    gcj: { longitude: 114.2835, latitude: 22.735289 },
  },
  'wo-1007': {
    name: '深圳市龙华区人民医院',
    addressIncludes: '建设东路 38 号',
    gcj: { longitude: 114.03262, latitude: 22.655543 },
  },
  'wo-1008': {
    name: '深圳市罗湖区人民医院',
    addressIncludes: '友谊路 47 号',
    gcj: { longitude: 114.122198, latitude: 22.53785 },
  },
  'wo-1009': {
    name: '深圳市盐田区人民医院（主院区）',
    addressIncludes: '梧桐路 2010 号',
    gcj: { longitude: 114.2337, latitude: 22.55745 },
  },
  'wo-1010': {
    name: '深圳理工大学总医院（东院区）',
    addressIncludes: '华夏路 39 号',
    gcj: { longitude: 113.943833, latitude: 22.751108 },
  },
} as const;

describe('fixture geography', () => {
  const workOrders = seedWorkOrders();

  it('has one authoritative POI baseline for every work order', () => {
    expect(workOrders.map((row) => row.id).sort()).toEqual(Object.keys(AMAP_POIS).sort());
  });

  for (const [id, poi] of Object.entries(AMAP_POIS)) {
    it(`${id} matches the verified AMap POI`, () => {
      const workOrder = workOrders.find((row) => row.id === id);
      expect(workOrder).toBeDefined();
      expect(workOrder?.customerName).toBe(poi.name);
      expect(workOrder?.address.line1).toContain(poi.addressIncludes);
      expect(workOrder && hasCoordinates(workOrder)).toBe(true);

      const rendered = wgs84ToGcj02(workOrder!.address.location!);
      expect(distanceKm(rendered, poi.gcj) * 1000).toBeLessThan(2);
    });
  }
});
