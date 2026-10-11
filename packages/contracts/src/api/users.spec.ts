import { updateUserRequestSchema, userListQuerySchema } from './users';

describe('users api', () => {
  it('accepts optional list filters', () => {
    expect(userListQuerySchema.parse({})).toEqual({});
    expect(userListQuerySchema.parse({ role: 'CASHIER', status: 'PENDING', q: ' ana ' })).toEqual({
      role: 'CASHIER',
      status: 'PENDING',
      q: 'ana',
    });
    expect(userListQuerySchema.safeParse({ role: 'BOSS' }).success).toBe(false);
  });

  it('needs at least one change to update a user', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.parse({ fullName: ' Ana Sic ' })).toEqual({
      fullName: 'Ana Sic',
    });
  });
});
