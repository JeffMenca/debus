import { identityHeaders } from './identity-headers';

describe('identityHeaders', () => {
  it('builds the identity headers the gateway sends', () => {
    expect(identityHeaders('u1', 'BRANCH_ADMIN', 'b1')).toEqual({
      'x-user-id': 'u1',
      'x-user-role': 'BRANCH_ADMIN',
      'x-branch-id': 'b1',
    });
  });

  it('leaves the branch out for a session without one', () => {
    expect(identityHeaders('u1', 'SYSTEM_ADMIN')).not.toHaveProperty('x-branch-id');
  });
});
