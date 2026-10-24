import { StreamableFile } from '@nestjs/common';
import { SystemProfitController } from './system-profit.controller';

describe('SystemProfitController', () => {
  const query = { page: 1, pageSize: 20 };
  const setup = () => {
    const report = {
      page: jest.fn().mockResolvedValue({ items: [] }),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
    };
    return { report, controller: new SystemProfitController(report as never) };
  };

  it('asks for the page of every branch', async () => {
    const { controller, report } = setup();

    await controller.page(query);

    expect(report.page).toHaveBeenCalledWith(query);
  });

  it('answers the PDF as a file named after the report', async () => {
    const { controller, report } = setup();

    const file = await controller.pdf(query);

    expect(report.pdf).toHaveBeenCalledWith(query);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders().disposition).toMatch(
      /^attachment; filename="reporte-ganancias-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
  });
});
