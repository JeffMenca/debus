import { toActiveCounts } from './active-counts';

describe('toActiveCounts', () => {
  it('splits the grouped rows into active and inactive', () => {
    expect(
      toActiveCounts([
        { active: true, _count: { _all: 3 } },
        { active: false, _count: { _all: 2 } },
      ]),
    ).toEqual({ active: 3, inactive: 2 });
  });

  it('reads a missing count as zero', () => {
    expect(toActiveCounts([{ active: true, _count: true }, { active: false }])).toEqual({
      active: 0,
      inactive: 0,
    });
    expect(toActiveCounts([])).toEqual({ active: 0, inactive: 0 });
  });
});
