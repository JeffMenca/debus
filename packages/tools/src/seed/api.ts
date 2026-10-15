// Query string with only the parameters that have a value.
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) query.set(name, String(value));
  }
  return `${path}?${query.toString()}`;
}

export const ADMINISTRACION = '/api/administracion';
export const FLOTA = '/api/flota';
export const VIAJES = '/api/viajes';
// The largest page the API gives; the seed looks for one record at a time, so one page is enough.
export const PAGE = { page: 1, pageSize: 100 } as const;
