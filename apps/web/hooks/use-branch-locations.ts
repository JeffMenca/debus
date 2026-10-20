import type { PublicBranchLocation, PublicBranchLocationPage } from '@debus/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

// Not taken from use-branches, which brings in the schemas (and zod) of the admin screens.
const LOCATIONS_PATH = '/api/administracion/branches/locations';
const FIVE_MINUTES = 5 * 60_000;
// The largest page of the API contract. Guatemala has far fewer than 100 branches, so one page is
// the whole list; a company with more would see the first 100, a limit accepted for the map.
const PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new TypeError(`Expected ${key} to be text`);
  return value;
}

function number(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Expected ${key} to be a number`);
  }
  return value;
}

function parseLocation(value: unknown): PublicBranchLocation {
  if (!isRecord(value)) throw new TypeError('Expected a branch location');
  return {
    id: text(value, 'id'),
    name: text(value, 'name'),
    municipality: text(value, 'municipality'),
    // The contract narrows it to the 22 departments; the map only prints it.
    department: text(value, 'department') as PublicBranchLocation['department'],
    latitude: number(value, 'latitude'),
    longitude: number(value, 'longitude'),
  };
}

// Reads the page by hand instead of with the schema of the contract: that schema comes with zod,
// and the home page is the first screen of the site, which must not carry that library.
export function parseLocations(value: unknown): PublicBranchLocationPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new TypeError('Expected a page of branch locations');
  }
  return {
    items: value.items.map(parseLocation),
    total: number(value, 'total'),
    page: number(value, 'page'),
    pageSize: number(value, 'pageSize'),
  };
}

// Where the active branches are, for the map of the home page. Anybody may ask: no session needed.
export function useBranchLocations() {
  return useQuery({
    queryKey: ['branches', 'locations'],
    queryFn: () =>
      apiRequest(`${LOCATIONS_PATH}?${toQueryString({ pageSize: PAGE_SIZE })}`, {
        parse: parseLocations,
      }),
    select: (page) => page.items,
    staleTime: FIVE_MINUTES,
  });
}
