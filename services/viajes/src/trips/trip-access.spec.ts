import { tripAccessWhere } from './trip-access';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const userId = '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('tripAccessWhere', () => {
  it('limits a branch admin to the trips of the branch', () => {
    expect(tripAccessWhere({ userId, role: 'BRANCH_ADMIN', branchId })).toEqual({ branchId });
  });

  it('limits a driver to the trips they drive, whatever the branch', () => {
    expect(tripAccessWhere({ userId, role: 'DRIVER', branchId })).toEqual({ driverId: userId });
  });

  it('refuses a branch admin without branch', () => {
    expect(() => tripAccessWhere({ userId, role: 'BRANCH_ADMIN', branchId: null })).toThrow();
  });
});
