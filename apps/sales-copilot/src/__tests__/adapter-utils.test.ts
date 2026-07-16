import { describe, expect, it } from 'vitest';
import { mapOptions } from '@/generated/services/_adapter-utils';

describe('mapOptions', () => {
  it('maps filter identifiers but preserves quoted OData PropertyName values', () => {
    expect(mapOptions({
      filter: "Microsoft.Dynamics.CRM.EqualUserId(PropertyName='ownerid') and ownerid eq 'owner-1'",
    }, {
      ownerid: '_ownerid_value',
    })).toEqual({
      filter: "Microsoft.Dynamics.CRM.EqualUserId(PropertyName='ownerid') and _ownerid_value eq 'owner-1'",
    });
  });

  it('preserves escaped apostrophes inside string literals', () => {
    expect(mapOptions({ filter: "title eq 'D''Angelo ownerid'" }, {
      title: 'biz_title',
      ownerid: '_ownerid_value',
    })).toEqual({ filter: "biz_title eq 'D''Angelo ownerid'" });
  });
});