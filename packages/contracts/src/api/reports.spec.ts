import { z } from 'zod';
import { PDF_CONTENT_TYPE, REPORT_PDF_MAX_ROWS, noGroupsSchema, reportPageSchema } from './reports';

describe('report page', () => {
  it('puts totals and groups next to the page', () => {
    const schema = reportPageSchema(
      z.object({ id: z.string() }),
      z.object({ n: z.number() }),
      z.object({ k: z.string() }),
    );

    expect(
      schema.parse({
        items: [{ id: 'a' }],
        total: 1,
        page: 1,
        pageSize: 20,
        summary: { totals: { n: 1 }, groups: [{ k: 'x' }] },
      }).summary.totals.n,
    ).toBe(1);
    expect(() =>
      schema.parse({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        summary: { totals: { n: 0 } },
      }),
    ).toThrow();
  });

  it('lets a report without groups send an empty list only', () => {
    expect(z.array(noGroupsSchema).safeParse([]).success).toBe(true);
    expect(z.array(noGroupsSchema).safeParse([{}]).success).toBe(false);
  });

  it('caps a PDF and names its media type', () => {
    expect(REPORT_PDF_MAX_ROWS).toBe(5000);
    expect(PDF_CONTENT_TYPE).toBe('application/pdf');
  });
});
