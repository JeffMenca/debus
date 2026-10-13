import { REQUEST_FLUSH } from './request-flush';

describe('REQUEST_FLUSH', () => {
  it('is a short budget, so a slow Pub/Sub never holds the request of a user', () => {
    expect(REQUEST_FLUSH).toEqual({ limit: 10, budgetMs: 2000 });
  });
});
