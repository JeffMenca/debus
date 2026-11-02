import { type ArchitecturePage, type ArchitectureQuery, pageArgs, toPage } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { PdfRenderer } from '../../common/pdf/pdf-renderer';
import { toReportDocument } from './system-architecture.pdf';
import { architectureRows, architectureSums } from './system-architecture.rows';

// The events come from the registry in the contracts, so the report needs no database; the
// registry is bounded (27 events), so the PDF never reaches the row limit.
@Injectable()
export class SystemArchitectureService {
  constructor(private readonly renderer: PdfRenderer) {}

  page(query: ArchitectureQuery): ArchitecturePage {
    const rows = architectureRows(query);
    const { skip, take } = pageArgs(query);
    return {
      ...toPage(rows.slice(skip, skip + take), rows.length, query),
      summary: { totals: architectureSums(rows), groups: [] },
    };
  }

  pdf(query: ArchitectureQuery): Promise<Buffer> {
    return this.renderer.render(toReportDocument({ query, now: new Date() }));
  }
}
