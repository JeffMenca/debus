import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SEARCH_MAX_LENGTH,
  type Page,
  type PageQuery,
  pageCount,
} from '@debus/contracts';

// The address speaks Spanish; the API keeps its English names.
export const PAGE_PARAM = 'pagina';
export const PAGE_SIZE_PARAM = 'mostrar';

const FIRST_PAGE = 1;

function readPageNumber(raw: string | null): number {
  const page = Number(raw);
  return raw !== null && Number.isInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE;
}

function readPageSize(raw: string | null): PageQuery['pageSize'] {
  return PAGE_SIZE_OPTIONS.find((option) => String(option) === raw) ?? DEFAULT_PAGE_SIZE;
}

// A strange value in the address is not an error: each one goes back to its default on its own.
export function readPage(search: URLSearchParams): PageQuery {
  return {
    page: readPageNumber(search.get(PAGE_PARAM)),
    pageSize: readPageSize(search.get(PAGE_SIZE_PARAM)),
  };
}

// Defaults stay out of the address so it reads clean.
export function writePage(params: URLSearchParams, { page, pageSize }: PageQuery): void {
  if (page !== FIRST_PAGE) params.set(PAGE_PARAM, String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set(PAGE_SIZE_PARAM, String(pageSize));
}

// A search the API would refuse (too long) is dropped like any other strange value, so the screen
// never gets stuck on an error it cannot recover from.
export function readSearch(raw: string | null): string | undefined {
  return raw && raw.trim().length <= SEARCH_MAX_LENGTH ? raw : undefined;
}

export function enumParam<V extends string>(slugs: Record<V, string>) {
  const values = Object.keys(slugs) as V[];
  return {
    read: (raw: string | null): V | undefined => values.find((value) => slugs[value] === raw),
    write: (value: V | undefined): string | undefined => (value ? slugs[value] : undefined),
  };
}

export function lastPageIfOutOfRange(page: Page<unknown>): number | null {
  if (page.items.length > 0 || page.total === 0 || page.page === FIRST_PAGE) return null;
  return pageCount(page.total, page.pageSize);
}
