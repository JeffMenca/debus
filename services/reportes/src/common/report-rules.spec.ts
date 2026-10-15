import { ConflictException } from '@nestjs/common';
import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { REPORT_MESSAGES } from './report-messages';
import { assertPdfSize } from './report-rules';

describe('assertPdfSize', () => {
  it('refuses a PDF with more rows than the limit', () => {
    expect(() => assertPdfSize(REPORT_PDF_MAX_ROWS + 1)).toThrow(ConflictException);
    expect(() => assertPdfSize(REPORT_PDF_MAX_ROWS)).not.toThrow();
  });

  it('asks to narrow the filters in plain Spanish', () => {
    expect(() => assertPdfSize(REPORT_PDF_MAX_ROWS + 1)).toThrow(REPORT_MESSAGES.tooManyRows);
    expect(REPORT_MESSAGES.tooManyRows).toBe(
      'El reporte tiene demasiadas filas para un PDF. Elige un periodo más corto o agrega filtros.',
    );
  });
});
