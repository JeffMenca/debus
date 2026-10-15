import { REPORT_PDF_MAX_ROWS } from '@debus/contracts';
import { ConflictException } from '@nestjs/common';
import { REPORT_MESSAGES } from './report-messages';

// A PDF holds every filtered row, so a huge result asks for narrower filters instead.
export function assertPdfSize(total: number): void {
  if (total > REPORT_PDF_MAX_ROWS) throw new ConflictException(REPORT_MESSAGES.tooManyRows);
}
