import { SystemBusOptionsController } from './system-bus-options.controller';

describe('SystemBusOptionsController', () => {
  it('asks for the page of buses of every branch', async () => {
    const report = { page: jest.fn().mockResolvedValue({ items: [] }) };
    const query = { page: 1, pageSize: 100 };

    await new SystemBusOptionsController(report as never).page(query);

    expect(report.page).toHaveBeenCalledWith(query);
  });
});
