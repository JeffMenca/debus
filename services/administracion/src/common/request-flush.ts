// Request path: a short budget so a slow Pub/Sub never holds the user's request; the scheduled flush retries the rest.
export const REQUEST_FLUSH = { limit: 10, budgetMs: 2000 } as const;
