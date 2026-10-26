import {
  type BranchBusRow,
  type BranchDepreciationRow,
  type BranchDriverRow,
  type BranchRentalIncomeRow,
  type BranchRepairExpenseRow,
  type BranchTicketIncomePage,
  type BranchTicketIncomeRow,
  BUS_DISPLAY_STATUSES,
  PDF_CONTENT_TYPE,
  type PageQuery,
  type RepairCategoryShare,
  branchBusesQuerySchema,
  branchDepreciationQuerySchema,
  branchDriversQuerySchema,
  branchRentalIncomeQuerySchema,
  branchRepairExpensesQuerySchema,
  branchTicketIncomeQuerySchema,
  foldSearchText,
  pageArgs,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import type { Page } from '@playwright/test';
import type { RecordedRequest } from './admin-gateway';
import { CORS_HEADERS, fulfillJson } from './session';

type TicketIncomeGroup = BranchTicketIncomePage['summary']['groups'][number];

export interface ReportsSeed {
  buses?: BranchBusRow[];
  drivers?: BranchDriverRow[];
  depreciation?: BranchDepreciationRow[];
  repairs?: BranchRepairExpenseRow[];
  ticketIncome?: BranchTicketIncomeRow[];
  rentals?: BranchRentalIncomeRow[];
  // The rate in force today that the depreciation report shows; null when none is configured.
  currentPerKm?: number | null;
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

export const sampleDriverRow = (overrides: Partial<BranchDriverRow> = {}): BranchDriverRow => ({
  driverId: crypto.randomUUID(),
  licenseNumber: 'A1234567',
  fullName: 'Ana Pérez',
  licenseType: 'B',
  licenseExpiresOn: '2030-03-01',
  active: true,
  completedTrips: 4,
  ...overrides,
});

export const sampleDepreciationRow = (
  overrides: Partial<BranchDepreciationRow> = {},
): BranchDepreciationRow => ({
  busId: crypto.randomUUID(),
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  completedTrips: 2,
  kmTraveled: 300,
  appliedPerKm: 1.33,
  accumulated: 400,
  ...overrides,
});

export const sampleRepairRow = (
  overrides: Partial<BranchRepairExpenseRow> = {},
): BranchRepairExpenseRow => ({
  busId: crypto.randomUUID(),
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  expenses: 2,
  total: 2300,
  categories: [
    { categoryId: crypto.randomUUID(), categoryName: 'Motor', lines: 2, amount: 1500 },
    { categoryId: crypto.randomUUID(), categoryName: 'Llantas', lines: 1, amount: 800 },
  ],
  ...overrides,
});

export const sampleTicketIncomeRow = (
  overrides: Partial<BranchTicketIncomeRow> = {},
): BranchTicketIncomeRow => ({
  tripId: crypto.randomUUID(),
  departureAt: '2026-10-20T11:30:00.000Z',
  routeId: crypto.randomUUID(),
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  busId: crypto.randomUUID(),
  busPlate: 'C482BTX',
  tickets: 3,
  onlineTickets: 2,
  counterTickets: 1,
  income: 255,
  ...overrides,
});

export const sampleRentalIncomeRow = (
  overrides: Partial<BranchRentalIncomeRow> = {},
): BranchRentalIncomeRow => ({
  rentalId: crypto.randomUUID(),
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  paidOn: '2026-10-21',
  passengers: 35,
  busPlate: 'C482BTX',
  price: 2760,
  ...overrides,
});

// The file the PDF route answers, named after the report and the day like the service does.
export const pdfAnswer = (stem: string) => ({
  status: 200,
  body: '%PDF-1.4\n%%EOF',
  headers: {
    ...CORS_HEADERS,
    'content-type': PDF_CONTENT_TYPE,
    'content-disposition': `attachment; filename="${stem}-${todayInGuatemala()}.pdf"`,
  },
});

// Plays the branch reports of the reportes API: it validates the query with the contract, filters,
// pages and adds up the whole filter like the service, and answers the PDF with a small file.
export async function mockReportsGateway(page: Page, seed: ReportsSeed = {}) {
  const buses = structuredClone(seed.buses ?? []);
  const drivers = structuredClone(seed.drivers ?? []);
  const depreciation = structuredClone(seed.depreciation ?? []);
  const repairs = structuredClone(seed.repairs ?? []);
  const ticketIncome = structuredClone(seed.ticketIncome ?? []);
  const rentals = structuredClone(seed.rentals ?? []);
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
    // Every report answers alike: its PDF (or the pending refusal), or one page of the filtered
    // rows with the summary of all of them.
    const answer = async (shown: unknown[], paging: PageQuery, stem: string, summary: unknown) => {
      if (pdf) {
        if (!refusal) return route.fulfill(pdfAnswer(stem));
        const message = refusal;
        refusal = undefined;
        return fulfillJson(route, 409, { statusCode: 409, message });
      }
      if (seed.pageDelayMs && paging.page > 1) {
        await new Promise((resolve) => setTimeout(resolve, seed.pageDelayMs));
      }
      const { skip, take } = pageArgs(paging);
      return fulfillJson(route, 200, {
        ...toPage(shown.slice(skip, skip + take), shown.length, paging),
        summary,
      });
    };
    const params = Object.fromEntries(url.searchParams);

    if (slug === 'branch-buses') {
      const parsed = branchBusesQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      const { status, q, ...paging } = parsed.data;

      const matching = buses
        .filter((bus) => !q || foldSearchText(`${bus.plate} ${bus.brand} ${bus.model}`).includes(q))
        .sort((a, b) => a.plate.localeCompare(b.plate) || a.busId.localeCompare(b.busId));
      const shown = matching.filter((bus) => status === 'all' || bus.status === status);

      return answer(shown, paging, 'reporte-buses', {
        totals: {
          buses: shown.length,
          completedTrips: shown.reduce((sum, bus) => sum + bus.completedTrips, 0),
        },
        groups: BUS_DISPLAY_STATUSES.map((value) => ({
          status: value,
          buses: matching.filter((bus) => bus.status === value).length,
        })),
      });
    }

    if (slug === 'branch-drivers') {
      const parsed = branchDriversQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      const { status, q, ...paging } = parsed.data;

      const matching = drivers
        .filter(
          (driver) =>
            !q || foldSearchText(`${driver.fullName} ${driver.licenseNumber}`).includes(q),
        )
        .sort(
          (a, b) => a.fullName.localeCompare(b.fullName) || a.driverId.localeCompare(b.driverId),
        );
      const shown = matching.filter(
        (driver) => status === 'all' || driver.active === (status === 'active'),
      );

      return answer(shown, paging, 'reporte-choferes', {
        totals: {
          drivers: shown.length,
          completedTrips: shown.reduce((sum, driver) => sum + driver.completedTrips, 0),
        },
        groups: [true, false].map((active) => ({
          active,
          drivers: matching.filter((driver) => driver.active === active).length,
        })),
      });
    }

    if (slug === 'branch-depreciation') {
      const parsed = branchDepreciationQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      // from and to are always in the parsed query, though the generic schema hides them.
      const { q, ...paging } = parsed.data;

      const shown = depreciation
        .filter((bus) => !q || foldSearchText(`${bus.plate} ${bus.brand} ${bus.model}`).includes(q))
        .sort((a, b) => a.plate.localeCompare(b.plate) || a.busId.localeCompare(b.busId));

      return answer(shown, paging, 'reporte-depreciacion', {
        totals: {
          kmTraveled: shown.reduce((sum, bus) => sum + bus.kmTraveled, 0),
          accumulated: shown.reduce((sum, bus) => sum + bus.accumulated, 0),
          currentPerKm: seed.currentPerKm === undefined ? 1.5 : seed.currentPerKm,
        },
        groups: [],
      });
    }

    if (slug === 'branch-repair-expenses') {
      const parsed = branchRepairExpensesQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      const { busId, categoryId, ...paging } = parsed.data;

      // A category filter keeps only the lines of that category, so each bus total shrinks with it.
      const shown = repairs
        .filter((bus) => !busId || bus.busId === busId)
        .map((bus) => {
          if (!categoryId) return bus;
          const categories = bus.categories.filter((c) => c.categoryId === categoryId);
          return { ...bus, categories, total: categories.reduce((sum, c) => sum + c.amount, 0) };
        })
        .filter((bus) => bus.categories.length > 0)
        .sort((a, b) => b.total - a.total || a.busId.localeCompare(b.busId));
      const byCategory = new Map<string, RepairCategoryShare>();
      for (const category of shown.flatMap((bus) => bus.categories)) {
        const known = byCategory.get(category.categoryId);
        byCategory.set(category.categoryId, {
          ...category,
          lines: (known?.lines ?? 0) + category.lines,
          amount: (known?.amount ?? 0) + category.amount,
        });
      }

      return answer(shown, paging, 'reporte-taller', {
        totals: {
          buses: shown.length,
          expenses: shown.reduce((sum, bus) => sum + bus.expenses, 0),
          total: shown.reduce((sum, bus) => sum + bus.total, 0),
        },
        groups: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      });
    }

    if (slug === 'branch-ticket-income') {
      const parsed = branchTicketIncomeQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      const { routeId, busId, ...paging } = parsed.data;

      const shown = ticketIncome
        .filter((trip) => !routeId || trip.routeId === routeId)
        .filter((trip) => !busId || trip.busId === busId)
        .sort(
          (a, b) => b.departureAt.localeCompare(a.departureAt) || a.tripId.localeCompare(b.tripId),
        );
      const byRoute = new Map<string, TicketIncomeGroup>();
      for (const trip of shown) {
        const known = byRoute.get(trip.routeId);
        byRoute.set(trip.routeId, {
          routeId: trip.routeId,
          originLabel: trip.originLabel,
          destinationLabel: trip.destinationLabel,
          tickets: (known?.tickets ?? 0) + trip.tickets,
          income: (known?.income ?? 0) + trip.income,
        });
      }

      return answer(shown, paging, 'reporte-ingresos-boletos', {
        totals: {
          trips: shown.length,
          tickets: shown.reduce((sum, trip) => sum + trip.tickets, 0),
          income: shown.reduce((sum, trip) => sum + trip.income, 0),
        },
        groups: [...byRoute.values()].sort((a, b) => b.income - a.income),
      });
    }

    if (slug === 'branch-rental-income') {
      const parsed = branchRentalIncomeQuerySchema.safeParse(params);
      if (!parsed.success) return fulfillJson(route, 400, { statusCode: 400, message: INVALID });
      const { q, ...paging } = parsed.data;

      const shown = rentals
        .filter(
          (rental) =>
            !q ||
            foldSearchText(
              `${rental.clientName} ${rental.nit} ${rental.originLabel} ${rental.destinationLabel}`,
            ).includes(q),
        )
        .sort(
          (a, b) =>
            b.paidOn.localeCompare(a.paidOn) ||
            b.departureAt.localeCompare(a.departureAt) ||
            a.rentalId.localeCompare(b.rentalId),
        );

      return answer(shown, paging, 'reporte-ingresos-alquileres', {
        totals: {
          rentals: shown.length,
          income: shown.reduce((sum, rental) => sum + rental.price, 0),
        },
        groups: [],
      });
    }

    return fulfillJson(route, 404, { statusCode: 404, message: 'No encontramos lo que buscas.' });
  });

  return {
    requests,
    reports: () => requests.filter((r) => !r.path.endsWith('/pdf')),
    pdfs: () => requests.filter((r) => r.path.endsWith('/pdf')),
  };
}
