import { toStatusCounts } from './user-counts';

describe('toStatusCounts', () => {
  it('fills the statuses nobody has with zero', () => {
    expect(toStatusCounts([{ status: 'ACTIVE', _count: { _all: 4 } }])).toEqual({
      PENDING: 0,
      ACTIVE: 4,
      INACTIVE: 0,
    });
  });
});

describe('toStatusCounts with loosely typed rows', () => {
  it('ignores rows that carry no count', () => {
    expect(toStatusCounts([{ status: 'ACTIVE' }, { status: 'PENDING', _count: true }])).toEqual({
      PENDING: 0,
      ACTIVE: 0,
      INACTIVE: 0,
    });
    expect(toStatusCounts([{ status: 'ACTIVE', _count: {} }]).ACTIVE).toBe(0);
  });
});
