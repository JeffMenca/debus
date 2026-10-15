import { Injectable, Logger } from '@nestjs/common';
import pdfmake from 'pdfmake';
import { toPrintableDocument } from './printable-text';
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
  private readonly logger = new Logger(PdfRenderer.name);

  // The data of a report can hold characters the standard font cannot print (an emoji in a bus
  // model, a Mayan apostrophe in a client name): the PDF gets the closest text instead of failing.
  render(doc: ReportDocument): Promise<Buffer> {
    const printable = toPrintableDocument(doc);
    if (printable.replaced.length > 0) {
      const list = printable.replaced.map((r) => `${r.codePoint} -> ${r.replacement}`).join(', ');
      this.logger.warn(`The PDF font cannot print some characters, replaced: ${list}`);
    }
    return pdfmake.createPdf(buildDocDefinition(printable.doc)).getBuffer();
  }
}
