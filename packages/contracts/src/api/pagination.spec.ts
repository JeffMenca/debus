import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  pageArgs,
  pageCount,
  pageQuerySchema,
  pageSchema,
  pageWithSummarySchema,
  toPage,
} from './pagination';

describe('pageQuerySchema', () => {
  it('starts on the first page with the default size', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('reads numbers from query strings', () => {
    expect(pageQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('refuses pages below one, sizes above the maximum and decimals', () => {
    expect(pageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });
});

describe('page helpers', () => {
  it('turns a page into skip and take', () => {
    expect(pageArgs({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(pageArgs({ page: 3, pageSize: 50 })).toEqual({ skip: 100, take: 50 });
  });

  it('builds the response echoing the query', () => {
    expect(toPage(['a'], 41, { page: 3, pageSize: 20 })).toEqual({
      items: ['a'],
      total: 41,
      page: 3,
      pageSize: 20,
    });
  });

  it('counts at least one page, even when there is nothing', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });

  it('validates a page with and without a summary', () => {
    const numbers = pageSchema(z.number());
    expect(numbers.parse({ items: [1], total: 1, page: 1, pageSize: 20 }).items).toEqual([1]);
    expect(numbers.safeParse({ items: [1], total: -1, page: 1, pageSize: 20 }).success).toBe(false);
    const counted = pageWithSummarySchema(z.number(), z.object({ all: z.number() }));
    expect(
      counted.parse({ items: [], total: 0, page: 1, pageSize: 20, summary: { all: 0 } }).summary,
    ).toEqual({ all: 0 });
  });
});
