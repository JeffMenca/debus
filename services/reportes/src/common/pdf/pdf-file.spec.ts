import { todayInGuatemala } from '@debus/contracts';
import { pdfFile } from './pdf-file';

describe('pdfFile', () => {
  it('names the downloaded file after the report and the day', () => {
    const file = pdfFile(Buffer.from('%PDF-'), 'reporte-buses', '2026-10-13');

    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="reporte-buses-2026-10-13.pdf"',
    });
  });

  it('uses today in Guatemala when no day is given', () => {
    const file = pdfFile(Buffer.from('%PDF-'), 'reporte-buses');

    expect(file.getHeaders().disposition).toBe(
      `attachment; filename="reporte-buses-${todayInGuatemala()}.pdf"`,
    );
  });
});
