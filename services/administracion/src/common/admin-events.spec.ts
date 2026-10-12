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

  it('flushes with the short request budget', async () => {
    const { outbox, events } = setup();
    await events.flush();
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
  });
});
