import { RepairExpensesController } from './repair-expenses.controller';

const id = '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a';
const branchId = '11111111-1111-4111-8111-111111111111';
const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};

describe('RepairExpensesController', () => {
  const setup = (created: boolean) => {
    const expenses = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id }),
      create: jest.fn().mockResolvedValue({ expense: { id }, created }),
    };
    const response = { status: jest.fn() };
    return {
      expenses,
      response,
      controller: new RepairExpensesController(expenses as never),
    };
  };

  it('lists the page of the branch of the caller', async () => {
    const { expenses, controller } = setup(true);
    const query = { page: 1, pageSize: 20 };

    expect(await controller.list(actor, query)).toEqual({ items: [] });
    expect(expenses.list).toHaveBeenCalledWith(branchId, query);
  });

  it('gets one expense of the branch of the caller', async () => {
    const { expenses, controller } = setup(true);

    expect(await controller.get(actor, id)).toEqual({ id });
    expect(expenses.get).toHaveBeenCalledWith(branchId, id);
  });

  it('answers 201 when the expense is new', async () => {
    const { expenses, response, controller } = setup(true);
    const body = { id } as never;

    expect(await controller.create(actor, body, response as never, 'c')).toEqual({ id });
    expect(expenses.create).toHaveBeenCalledWith(actor, body, 'c');
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('answers 200 with the saved expense when the id was already used', async () => {
    const { response, controller } = setup(false);

    await controller.create(actor, { id } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(200);
  });
});
