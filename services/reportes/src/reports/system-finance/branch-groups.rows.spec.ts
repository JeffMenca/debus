import { toBranchGroups } from './branch-groups.rows';

describe('toBranchGroups', () => {
  it('maps the raw groups to the contract groups', () => {
    expect(
      toBranchGroups([{ branch_id: 'b1', branch_name: 'Boca', entries: 3, amount: 255.5 }]),
    ).toEqual([{ branchId: 'b1', branchName: 'Boca', entries: 3, amount: 255.5 }]);
    expect(toBranchGroups([])).toEqual([]);
  });
});
