import { Injectable } from '@nestjs/common';
import pdfmake from 'pdfmake';
import { type ReportDocument, buildDocDefinition } from './report-document';

// The 14 standard PDF fonts need no files; Helvetica covers Spanish (WinAnsi).
const HELVETICA = {
  normal: 'Helvetica',
  bold: 'Helvetica-Bold',
  italics: 'Helvetica-Oblique',
  bolditalics: 'Helvetica-BoldOblique',
};
pdfmake.setFonts({ Helvetica: HELVETICA });

// A document definition never reaches the network or the disk. pdfmake also asks the local policy
// about font names, so those four (and nothing else) are the only paths it may open.
const STANDARD_FONTS = new Set(Object.values(HELVETICA));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => STANDARD_FONTS.has(path));

@Injectable()
export class PdfRenderer {
  render(doc: ReportDocument): Promise<Buffer> {
    return pdfmake.createPdf(buildDocDefinition(doc)).getBuffer();
  }
}
