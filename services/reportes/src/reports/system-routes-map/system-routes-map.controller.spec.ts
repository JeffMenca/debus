import { StreamableFile } from '@nestjs/common';
import { SystemRoutesMapController } from './system-routes-map.controller';

describe('SystemRoutesMapController', () => {
  const query = { branchId: '9b2c7a10-1111-4c4c-8888-123456789abc' };
  const setup = () => {
    const report = {
      map: jest.fn().mockResolvedValue({ branches: [], selectedBranchId: null, routes: [] }),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')),
    };
    return { report, controller: new SystemRoutesMapController(report as never) };
  };

  it('asks for the map of the chosen branch', async () => {
    const { controller, report } = setup();

    await controller.map(query);

    expect(report.map).toHaveBeenCalledWith(query);
  });

  it('answers the PDF as a file named after the report', async () => {
    const { controller, report } = setup();

    const file = await controller.pdf(query);

    expect(report.pdf).toHaveBeenCalledWith(query);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders().disposition).toMatch(
      /^attachment; filename="reporte-mapa-rutas-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
  });
});
