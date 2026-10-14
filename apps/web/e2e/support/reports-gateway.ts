import {
  type BranchBusRow,
  BUS_DISPLAY_STATUSES,
  PDF_CONTENT_TYPE,
  branchBusesQuerySchema,
  foldSearchText,
  pageArgs,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import type { Page } from '@playwright/test';
import type { RecordedRequest } from './admin-gateway';
import { CORS_HEADERS, fulfillJson } from './session';

export interface ReportsSeed {
  buses?: BranchBusRow[];
  // The next PDF is refused with this text, as when the report has too many rows.
  pdfRefusal?: string;
  // Answers every page after the first this many milliseconds late, to see the table while it loads.
  pageDelayMs?: number;
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
const REPORTS_PATH = /\/api\/reportes\/reports\/([a-z-]+)(\/pdf)?(\?|$)/;

export const sampleBusRow = (overrides: Partial<BranchBusRow> = {}): BranchBusRow => ({
  busId: crypto.randomUUID(),
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  capacity: 40,
  status: 'AVAILABLE',
  driverName: null,
  mileageKm: 148412,
  completedTrips: 7,
  ...overrides,
});

// Plays the branch reports of the reportes API: it validates the query with the contract, filters,
// pages and adds up the whole filter like the service, and answers the PDF with a small file.
export async function mockReportsGateway(page: Page, seed: ReportsSeed = {}) {
  const buses = structuredClone(seed.buses ?? []);
  const requests: RecordedRequest[] = [];
  let refusal = seed.pdfRefusal;

  await page.route(REPORTS_PATH, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: url.pathname,
      query: url.search,
      body: undefined,
    });
    const [, slug, pdf] = REPORTS_PATH.exec(url.pathname + url.search) ?? [];
    if (slug !== 'branch-buses')
      return fulfillJson(route, 404, { statusCode: 404, message: 'No encontramos lo que buscas.' });

    const parsed = branchBusesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
    const { status, q, ...paging } = parsed.data;

    const matching = buses
      .filter((bus) => !q || foldSearchText(`${bus.plate} ${bus.brand} ${bus.model}`).includes(q))
      .sort((a, b) => a.plate.localeCompare(b.plate) || a.busId.localeCompare(b.busId));
    const shown = matching.filter((bus) => status === 'all' || bus.status === status);

    if (pdf) {
      if (refusal) {
        const message = refusal;
        refusal = undefined;
        return fulfillJson(route, 409, { statusCode: 409, message });
      }
      return route.fulfill({
        status: 200,
        body: '%PDF-1.4\n%%EOF',
        headers: {
          ...CORS_HEADERS,
          'content-type': PDF_CONTENT_TYPE,
          'content-disposition': `attachment; filename="reporte-buses-${todayInGuatemala()}.pdf"`,
        },
      });
    }

    if (seed.pageDelayMs && paging.page > 1) {
      await new Promise((resolve) => setTimeout(resolve, seed.pageDelayMs));
    }
    const { skip, take } = pageArgs(paging);
    return fulfillJson(route, 200, {
      ...toPage(shown.slice(skip, skip + take), shown.length, paging),
      summary: {
        totals: {
          buses: shown.length,
          completedTrips: shown.reduce((sum, bus) => sum + bus.completedTrips, 0),
        },
        groups: BUS_DISPLAY_STATUSES.map((value) => ({
          status: value,
          buses: matching.filter((bus) => bus.status === value).length,
        })),
      },
    });
  });

  return {
    requests,
    reports: () => requests.filter((r) => !r.path.endsWith('/pdf')),
    pdfs: () => requests.filter((r) => r.path.endsWith('/pdf')),
  };
}
