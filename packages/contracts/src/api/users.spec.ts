import { updateUserRequestSchema, userListQuerySchema, userPageSchema } from './users';

describe('users api', () => {
  it('pages the list and folds the search term', () => {
    expect(userListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      userListQuerySchema.parse({
        role: 'CASHIER',
        status: 'PENDING',
        group: 'staff',
        q: ' José ',
        page: '2',
      }),
    ).toEqual({
      role: 'CASHIER',
      status: 'PENDING',
      group: 'staff',
      q: 'jose',
      page: 2,
      pageSize: 20,
    });
    expect(userListQuerySchema.safeParse({ role: 'BOSS' }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ group: 'everyone' }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('describes a page of users with the branch name and the tab counts', () => {
    const page = userPageSchema.parse({
      items: [
        {
          id: '0b9a4c1e-8a4f-4b1e-9b8e-6b1f2c3d4e5f',
          fullName: 'Ana Sic',
          email: 'ana@correo.com',
          role: 'CASHIER',
          branchId: '1c9a4c1e-8a4f-4b1e-9b8e-6b1f2c3d4e5f',
          branchName: 'Quetzaltenango',
          status: 'ACTIVE',
        },
      ],
      total: 41,
      page: 1,
      pageSize: 20,
      summary: { statusCounts: { ACTIVE: 30, PENDING: 10, INACTIVE: 1 } },
    });
    expect(page.items[0]?.branchName).toBe('Quetzaltenango');
  });

  it('needs at least one change to update a user', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.parse({ fullName: ' Ana Sic ' })).toEqual({
      fullName: 'Ana Sic',
    });
  });
});
