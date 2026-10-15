import { ForbiddenException, StreamableFile } from '@nestjs/common';
import { BranchDriversController } from './branch-drivers.controller';

describe('BranchDriversController', () => {
  const query = { status: 'all' as const, page: 1, pageSize: 20 };
  const admin = { userId: 'u1', role: 'BRANCH_ADMIN' as const, branchId: 'branch-1' };
  const setup = () => {
    const report = {
      page: jest.fn().mockResolvedValue({ items: [] }),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
    };
    return { report, controller: new BranchDriversController(report as never) };
  };

  it('asks for the page of the branch of the session', async () => {
    const { controller, report } = setup();

    await controller.page(admin, query);

    expect(report.page).toHaveBeenCalledWith('branch-1', query);
  });

  it('answers the PDF as a file named after the report', async () => {
    const { controller, report } = setup();

    const file = await controller.pdf(admin, query);

    expect(report.pdf).toHaveBeenCalledWith('branch-1', query);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders().disposition).toMatch(
      /^attachment; filename="reporte-choferes-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
  });

  it('refuses a session without a branch', () => {
    const { controller } = setup();

    expect(() => controller.page({ ...admin, branchId: null }, query)).toThrow(ForbiddenException);
  });
});
