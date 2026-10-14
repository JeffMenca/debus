import { REQUEST_FLUSH } from '@debus/messaging';
import { AdminEvents } from './admin-events';

describe('AdminEvents', () => {
  const setup = () => {
    const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
    return { outbox, events: new AdminEvents(outbox as never) };
  };

  it('writes branch and settings events in the caller transaction', async () => {
    const { outbox, events } = setup();
    const tx = {};

    await events.branchChanged(tx as never, 'BranchUpdated', { branchId: 'b' } as never, 'c');
    await events.settingsUpdated(tx as never, { versionId: 'v' } as never, 'c');

    expect(outbox.add).toHaveBeenNthCalledWith(1, tx, 'BranchUpdated', { branchId: 'b' }, 'c');
    expect(outbox.add).toHaveBeenNthCalledWith(2, tx, 'SettingsUpdated', { versionId: 'v' }, 'c');
  });

  it('writes a repair expense event in the caller transaction', async () => {
    const { outbox, events } = setup();
    const tx = {};

    await events.repairExpenseAdded(tx as never, { expenseId: 'e' } as never, 'c');

    expect(outbox.add).toHaveBeenCalledWith(tx, 'RepairExpenseAdded', { expenseId: 'e' }, 'c');
  });

  it('flushes with the short request budget', async () => {
    const { outbox, events } = setup();
    await events.flush();
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
  });
});
