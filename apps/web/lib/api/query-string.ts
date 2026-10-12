type QueryValue = string | number | undefined | null;

// Sorted keys keep the same query on the same cache key, whatever order the caller wrote it in.
export function toQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}
