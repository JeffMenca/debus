import { PDF_CONTENT_TYPE, todayInGuatemala } from '@debus/contracts';
import { StreamableFile } from '@nestjs/common';

// The download is named after the report and the day, so repeated exports do not overwrite each other.
export function pdfFile(
  buffer: Buffer,
  fileStem: string,
  today: string = todayInGuatemala(),
): StreamableFile {
  return new StreamableFile(buffer, {
    type: PDF_CONTENT_TYPE,
    disposition: `attachment; filename="${fileStem}-${today}.pdf"`,
  });
}
