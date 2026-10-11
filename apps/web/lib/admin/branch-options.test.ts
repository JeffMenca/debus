import { branchLabel, branchesFor } from './branch-options';

const open = { id: 'b1', name: 'Quetzaltenango', active: true };
const closed = { id: 'b2', name: 'Flores', active: false };

describe('branchesFor', () => {
  it('offers every branch to a branch admin, so a closed one can get its admin back', () => {
    expect(branchesFor('BRANCH_ADMIN', [open, closed])).toEqual([open, closed]);
  });

  it.each(['CASHIER', 'DRIVER'] as const)('offers only open branches to a %s', (role) => {
    expect(branchesFor(role, [open, closed])).toEqual([open]);
  });

  it('offers only open branches while no role is chosen', () => {
    expect(branchesFor(undefined, [open, closed])).toEqual([open]);
  });
});

describe('branchLabel', () => {
  it('marks a closed branch', () => {
    expect(branchLabel(closed)).toBe('Flores (inactiva)');
  });

  it('leaves an open branch as it is', () => {
    expect(branchLabel(open)).toBe('Quetzaltenango');
  });
});
