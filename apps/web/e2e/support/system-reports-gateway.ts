import {
  type PageQuery,
  type RepairCategoryShare,
  type SystemBranchGroup,
  type SystemBusOptionRow,
  type SystemExpenseRow,
  type SystemIncomeRow,
  type SystemMapBranch,
  type SystemMapRoute,
  type SystemProfitRow,
  type SystemRepairExpenseRow,
  type SystemRoutesMap,
  type SystemTopRouteRow,
  foldSearchText,
  pageArgs,
  systemBusOptionsQuerySchema,
  systemExpensesQuerySchema,
  systemIncomeQuerySchema,
  systemProfitQuerySchema,
  systemRepairExpensesQuerySchema,
  systemRoutesMapQuerySchema,
  systemTopRoutesQuerySchema,
  toPage,
} from '@debus/contracts';
import type { Page } from '@playwright/test';
import type { RecordedRequest } from './admin-gateway';
import { pdfAnswer } from './reports-gateway';
import { fulfillJson } from './session';

export interface SystemReportsSeed {
  income?: SystemIncomeRow[];
  expenses?: SystemExpenseRow[];
  profit?: SystemProfitRow[];
  topRoutes?: SystemTopRouteRow[];
  repairs?: SystemRepairExpenseRow[];
  buses?: SystemBusOptionRow[];
  // The branches of the map and the active routes that start from each of them.
  map?: { branches: SystemMapBranch[]; routes: Record<string, SystemMapRoute[]> };
  // The next PDF is refused with this text, as when the report has too many rows.
  pdfRefusal?: string;
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
const REPORTS_PATH = /\/api\/reportes\/reports\/(system-[a-z-]+)(\/pdf)?(\?|$)/;

const STEMS: Record<string, string> = {
  'system-income': 'reporte-ingresos',
  'system-expenses': 'reporte-gastos',
  'system-profit': 'reporte-ganancias',
  'system-top-routes': 'reporte-rutas-demandadas',
  'system-repair-expenses': 'reporte-taller',
  'system-routes-map': 'reporte-mapa-rutas',
};

const sum = <T>(items: T[], pick: (item: T) => number) =>
  Math.round(items.reduce((total, item) => total + pick(item), 0) * 100) / 100;

const inRange = (day: string, from?: string, to?: string) =>
  (!from || day >= from) && (!to || day <= to);

// Rows ordered by group, as the service sends them, and the sums of each group.
function groupsOf<T extends { branchId: string; branchName: string; amount: number }>(
  rows: T[],
): SystemBranchGroup[] {
  const groups = new Map<string, SystemBranchGroup>();
  for (const row of rows) {
    const known = groups.get(row.branchId);
    groups.set(row.branchId, {
      branchId: row.branchId,
      branchName: row.branchName,
      entries: (known?.entries ?? 0) + 1,
      amount: sum([{ amount: known?.amount ?? 0 }, row], (item) => item.amount),
    });
  }
  return [...groups.values()];
}

const byBranch = <T extends { branchName: string }>(a: T, b: T) =>
  foldSearchText(a.branchName).localeCompare(foldSearchText(b.branchName));

// Plays the reports of the system administrator of the reportes API: it validates the query with
// the contract, filters by branch and period, orders by group, pages and adds up the whole filter
// like the service, and answers the PDF with a small file.
export async function mockSystemReportsGateway(page: Page, seed: SystemReportsSeed = {}) {
  const income = structuredClone(seed.income ?? []);
  const expenses = structuredClone(seed.expenses ?? []);
  const profit = structuredClone(seed.profit ?? []);
  const topRoutes = structuredClone(seed.topRoutes ?? []);
  const repairs = structuredClone(seed.repairs ?? []);
  const buses = structuredClone(seed.buses ?? []);
  const map = structuredClone(seed.map ?? { branches: [], routes: {} });
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
    const params = Object.fromEntries(url.searchParams);
    const invalid = () => fulfillJson(route, 400, { statusCode: 400, message: INVALID });

    // The PDF is the same for every report; a refusal answers the next request only.
    const pdfOrPage = async (shown: unknown[], paging: PageQuery, summary: unknown) => {
      if (pdf) {
        if (!refusal) return route.fulfill(pdfAnswer(STEMS[slug!]!));
        const message = refusal;
        refusal = undefined;
        return fulfillJson(route, 409, { statusCode: 409, message });
      }
      const { skip, take } = pageArgs(paging);
      return fulfillJson(route, 200, {
        ...toPage(shown.slice(skip, skip + take), shown.length, paging),
        summary,
      });
    };

    if (slug === 'system-income') {
      const parsed = systemIncomeQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { from, to, branchId, ...paging } = parsed.data;
      const shown = income
        .filter((sale) => !branchId || sale.branchId === branchId)
        .filter((sale) => inRange(sale.day, from, to))
        .sort((a, b) => byBranch(a, b) || b.day.localeCompare(a.day) || a.id.localeCompare(b.id));
      const kindTotal = (concept: SystemIncomeRow['concept']) =>
        sum(
          shown.filter((sale) => sale.concept === concept),
          (sale) => sale.amount,
        );
      return pdfOrPage(shown, paging, {
        totals: {
          entries: shown.length,
          amount: sum(shown, (sale) => sale.amount),
          onlineTickets: kindTotal('ONLINE_TICKET'),
          counterTickets: kindTotal('COUNTER_TICKET'),
          rentals: kindTotal('RENTAL'),
        },
        groups: groupsOf(shown),
      });
    }

    if (slug === 'system-expenses') {
      const parsed = systemExpensesQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { from, to, branchId, ...paging } = parsed.data;
      const shown = expenses
        .filter((expense) => !branchId || expense.branchId === branchId)
        .filter((expense) => inRange(expense.day, from, to))
        .sort((a, b) => byBranch(a, b) || b.day.localeCompare(a.day) || a.id.localeCompare(b.id));
      const kindTotal = (concept: SystemExpenseRow['concept']) =>
        sum(
          shown.filter((expense) => expense.concept === concept),
          (expense) => expense.amount,
        );
      return pdfOrPage(shown, paging, {
        totals: {
          entries: shown.length,
          amount: sum(shown, (expense) => expense.amount),
          fuel: kindTotal('FUEL'),
          depreciation: kindTotal('DEPRECIATION'),
          labor: kindTotal('LABOR'),
          parts: kindTotal('PART'),
        },
        groups: groupsOf(shown),
      });
    }

    if (slug === 'system-profit') {
      const parsed = systemProfitQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { branchId, page, pageSize } = parsed.data;
      const paging = { page, pageSize };
      const shown = profit.filter((row) => !branchId || row.branchId === branchId).sort(byBranch);
      const income = sum(shown, (row) => row.income);
      const expensesTotal = sum(shown, (row) => row.expenses);
      return pdfOrPage(shown, paging, {
        totals: {
          ticketIncome: sum(shown, (row) => row.ticketIncome),
          rentalIncome: sum(shown, (row) => row.rentalIncome),
          income,
          fuel: sum(shown, (row) => row.fuel),
          labor: sum(shown, (row) => row.labor),
          parts: sum(shown, (row) => row.parts),
          depreciation: sum(shown, (row) => row.depreciation),
          expenses: expensesTotal,
          profit: sum(shown, (row) => row.profit),
          margin: income === 0 ? null : Math.round(((income - expensesTotal) / income) * 1000) / 10,
        },
        groups: [],
      });
    }

    if (slug === 'system-top-routes') {
      const parsed = systemTopRoutesQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { branchId, page, pageSize } = parsed.data;
      const paging = { page, pageSize };
      const shown = topRoutes
        .filter((row) => !branchId || row.branchId === branchId)
        .sort((a, b) => b.tickets - a.tickets || a.routeId.localeCompare(b.routeId));
      return pdfOrPage(shown, paging, {
        totals: {
          routes: shown.length,
          trips: sum(shown, (row) => row.trips),
          tickets: sum(shown, (row) => row.tickets),
          income: sum(shown, (row) => row.income),
        },
        groups: [],
      });
    }

    if (slug === 'system-repair-expenses') {
      const parsed = systemRepairExpensesQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { from, to, branchId, busId, ...paging } = parsed.data;
      const shown = repairs
        .filter((line) => !branchId || line.branchId === branchId)
        .filter((line) => !busId || line.busId === busId)
        .filter((line) => inRange(line.serviceDate, from, to))
        .sort(
          (a, b) =>
            foldSearchText(a.categoryName).localeCompare(foldSearchText(b.categoryName)) ||
            b.serviceDate.localeCompare(a.serviceDate) ||
            a.expenseId.localeCompare(b.expenseId) ||
            a.lineNo - b.lineNo,
        );
      const byCategory = new Map<string, RepairCategoryShare>();
      for (const line of shown) {
        const known = byCategory.get(line.categoryId);
        byCategory.set(line.categoryId, {
          categoryId: line.categoryId,
          categoryName: line.categoryName,
          lines: (known?.lines ?? 0) + 1,
          amount: sum([{ amount: known?.amount ?? 0 }, line], (item) => item.amount),
        });
      }
      return pdfOrPage(shown, paging, {
        totals: {
          lines: shown.length,
          expenses: new Set(shown.map((line) => line.expenseId)).size,
          amount: sum(shown, (line) => line.amount),
        },
        groups: [...byCategory.values()],
      });
    }

    if (slug === 'system-bus-options') {
      const parsed = systemBusOptionsQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      const { q, page, pageSize } = parsed.data;
      const paging = { page, pageSize };
      const shown = buses.filter(
        (bus) => !q || foldSearchText(`${bus.plate} ${bus.brand} ${bus.model}`).includes(q),
      );
      return pdfOrPage(shown, paging, { totals: { buses: shown.length }, groups: [] });
    }

    if (slug === 'system-routes-map') {
      const parsed = systemRoutesMapQuerySchema.safeParse(params);
      if (!parsed.success) return invalid();
      if (pdf) return pdfOrPage([], { page: 1, pageSize: 1 }, undefined);
      const first = [...map.branches]
        .sort((a, b) => foldSearchText(a.name).localeCompare(foldSearchText(b.name)))
        .find((branch) => branch.routes > 0);
      const selectedBranchId = parsed.data.branchId ?? first?.id ?? null;
      const answer: SystemRoutesMap = {
        branches: map.branches,
        selectedBranchId,
        routes: selectedBranchId ? (map.routes[selectedBranchId] ?? []) : [],
      };
      return fulfillJson(route, 200, answer);
    }

    return fulfillJson(route, 404, { statusCode: 404, message: 'No encontramos lo que buscas.' });
  });

  return {
    requests,
    reports: () => requests.filter((r) => !r.path.endsWith('/pdf')),
    pdfs: () => requests.filter((r) => r.path.endsWith('/pdf')),
    // The last query a report was asked with, as parameters.
    lastQueryOf: (slug: string) =>
      new URLSearchParams(
        requests.filter((r) => !r.path.endsWith('/pdf') && r.path.endsWith(`/${slug}`)).at(-1)
          ?.query ?? '',
      ),
  };
}

export const BRANCH_QUETZALTENANGO = '11111111-1111-4111-8111-111111111111';
export const BRANCH_ESCUINTLA = '22222222-2222-4222-8222-222222222222';
export const BRANCH_GUATEMALA = '33333333-3333-4333-8333-333333333333';

const branchOf = (id: string, branchName: string) => ({ branchId: id, branchName });
const QUETZALTENANGO = branchOf(BRANCH_QUETZALTENANGO, 'Quetzaltenango');
const ESCUINTLA = branchOf(BRANCH_ESCUINTLA, 'Escuintla');

let counter = 0;
const nextId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

export const sampleIncomeRow = (overrides: Partial<SystemIncomeRow> = {}): SystemIncomeRow => ({
  id: nextId(),
  ...QUETZALTENANGO,
  concept: 'ONLINE_TICKET',
  day: '2026-10-20',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  clientName: null,
  quantity: 2,
  amount: 170,
  ...overrides,
});

export const sampleExpenseRow = (overrides: Partial<SystemExpenseRow> = {}): SystemExpenseRow => ({
  id: `${nextId()}:FUEL`,
  ...QUETZALTENANGO,
  concept: 'FUEL',
  day: '2026-10-20',
  busPlate: 'C482BTX',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  categoryName: null,
  description: null,
  amount: 1180,
  ...overrides,
});

export const sampleProfitRow = (overrides: Partial<SystemProfitRow> = {}): SystemProfitRow => ({
  ...QUETZALTENANGO,
  ticketIncome: 255,
  rentalIncome: 2760,
  income: 3015,
  fuel: 1180,
  labor: 350.5,
  parts: 5200,
  depreciation: 306,
  expenses: 7036.5,
  profit: -4021.5,
  margin: -133.4,
  ...overrides,
});

export const sampleTopRouteRow = (
  overrides: Partial<SystemTopRouteRow> = {},
): SystemTopRouteRow => ({
  position: 1,
  routeId: nextId(),
  branchId: BRANCH_QUETZALTENANGO,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  distanceKm: 204,
  ticketPrice: 85,
  active: true,
  trips: 2,
  onlineTickets: 4,
  counterTickets: 2,
  tickets: 6,
  income: 510,
  share: 60,
  ...overrides,
});

export const sampleRepairLine = (
  overrides: Partial<SystemRepairExpenseRow> = {},
): SystemRepairExpenseRow => ({
  expenseId: nextId(),
  lineNo: 0,
  categoryId: nextId(),
  categoryName: 'Llantas',
  busId: nextId(),
  busPlate: 'C482BTX',
  ...QUETZALTENANGO,
  serviceDate: '2026-10-19',
  kind: 'PART',
  description: 'Cuatro llantas nuevas',
  amount: 5200,
  ...overrides,
});

export const sampleBusOption = (
  overrides: Partial<SystemBusOptionRow> = {},
): SystemBusOptionRow => ({
  id: nextId(),
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  branchName: 'Quetzaltenango',
  ...overrides,
});

export const sampleMapBranch = (overrides: Partial<SystemMapBranch> = {}): SystemMapBranch => ({
  id: nextId(),
  name: 'Quetzaltenango',
  latitude: 14.8347,
  longitude: -91.5181,
  routes: 0,
  ...overrides,
});

export const sampleMapRoute = (overrides: Partial<SystemMapRoute> = {}): SystemMapRoute => ({
  routeId: nextId(),
  destinationBranchId: BRANCH_GUATEMALA,
  destinationName: 'Guatemala',
  latitude: 14.6349,
  longitude: -90.5069,
  distanceKm: 204,
  ticketPrice: 85,
  tickets: 6,
  ...overrides,
});

// Two branches with sales, spending and a route each, enough to see groups, subtotals and a total.
export function twoBranchSeed(): Required<
  Pick<SystemReportsSeed, 'income' | 'expenses' | 'profit' | 'topRoutes' | 'repairs' | 'buses'>
> {
  const tires = nextId();
  const oil = nextId();
  const volvo = nextId();
  const hino = nextId();
  return {
    income: [
      sampleIncomeRow({ concept: 'ONLINE_TICKET', quantity: 2, amount: 170 }),
      sampleIncomeRow({ concept: 'COUNTER_TICKET', quantity: 1, amount: 85, day: '2026-10-21' }),
      sampleIncomeRow({
        concept: 'RENTAL',
        quantity: 35,
        amount: 2760,
        clientName: 'Colegio San José',
        destinationLabel: 'Panajachel',
        day: '2026-10-22',
      }),
      sampleIncomeRow({
        ...ESCUINTLA,
        originLabel: 'Escuintla',
        destinationLabel: 'Guatemala',
        quantity: 3,
        amount: 150,
      }),
    ],
    expenses: [
      sampleExpenseRow({ concept: 'FUEL', amount: 1180 }),
      sampleExpenseRow({ id: `${nextId()}:DEPRECIATION`, concept: 'DEPRECIATION', amount: 306 }),
      sampleExpenseRow({
        id: `${nextId()}:0`,
        concept: 'PART',
        busPlate: 'C482BTX',
        originLabel: null,
        destinationLabel: null,
        categoryName: 'Llantas',
        description: 'Cuatro llantas nuevas',
        amount: 5200,
        day: '2026-10-19',
      }),
      sampleExpenseRow({
        ...ESCUINTLA,
        id: `${nextId()}:FUEL`,
        busPlate: 'P222BBB',
        originLabel: 'Escuintla',
        amount: 640,
      }),
    ],
    profit: [
      sampleProfitRow(),
      sampleProfitRow({
        ...ESCUINTLA,
        ticketIncome: 150,
        rentalIncome: 0,
        income: 150,
        fuel: 640,
        labor: 0,
        parts: 0,
        depreciation: 0,
        expenses: 640,
        profit: -490,
        margin: -326.7,
      }),
    ],
    topRoutes: [
      sampleTopRouteRow({ tickets: 6, share: 66.7, income: 510 }),
      sampleTopRouteRow({
        position: 2,
        branchId: BRANCH_ESCUINTLA,
        originLabel: 'Escuintla',
        distanceKm: null,
        ticketPrice: null,
        active: null,
        trips: 1,
        onlineTickets: 3,
        counterTickets: 0,
        tickets: 3,
        income: 150,
        share: 33.3,
      }),
    ],
    repairs: [
      sampleRepairLine({ categoryId: tires, busId: volvo }),
      sampleRepairLine({
        categoryId: oil,
        categoryName: 'Cambio de aceite',
        busId: volvo,
        kind: 'LABOR',
        description: 'Aceite y filtro',
        amount: 350.5,
        serviceDate: '2026-10-21',
      }),
      sampleRepairLine({
        categoryId: oil,
        categoryName: 'Cambio de aceite',
        busId: hino,
        busPlate: 'P222BBB',
        ...ESCUINTLA,
        kind: 'LABOR',
        description: 'Aceite',
        amount: 200,
      }),
    ],
    buses: [
      sampleBusOption({ id: volvo }),
      sampleBusOption({
        id: hino,
        plate: 'P222BBB',
        brand: 'Hino',
        model: 'RK8',
        branchName: 'Escuintla',
      }),
    ],
  };
}
