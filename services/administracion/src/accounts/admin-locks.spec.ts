import { lockActiveSystemAdmins, lockBranchAdmins } from './admin-locks';

const setup = () => ({ $queryRaw: jest.fn().mockResolvedValue([]) });
const sqlOf = (tx: ReturnType<typeof setup>) => tx.$queryRaw.mock.calls[0][0].join('?');

describe('admin locks', () => {
  it('locks the active system admins in id order', async () => {
    const tx = setup();

    await lockActiveSystemAdmins(tx as never);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlOf(tx)).toContain(
      "role = 'SYSTEM_ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE",
    );
  });

  it('locks the pending and active admins of one branch in id order', async () => {
    const tx = setup();

    await lockBranchAdmins(tx as never, '9b2c7a10-1111-4c4c-8888-123456789abc');

    expect(tx.$queryRaw.mock.calls[0][1]).toBe('9b2c7a10-1111-4c4c-8888-123456789abc');
    expect(sqlOf(tx)).toContain("status <> 'INACTIVE' ORDER BY id FOR UPDATE");
  });
});
