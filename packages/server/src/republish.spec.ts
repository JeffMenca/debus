import { REPUBLISH_PAGE_SIZE, republishInPages, republishPageArgs } from './republish';

type Tx = { name: string };

function setup(pages: string[][]) {
  const tx: Tx = { name: 'tx' };
  const findPage = jest.fn<Promise<{ id: string }[]>, [string | undefined]>();
  for (const page of pages) findPage.mockResolvedValueOnce(page.map((id) => ({ id })));
  findPage.mockResolvedValue([]);
  const order: string[] = [];
  const transaction = jest.fn(async (work: (tx: Tx) => Promise<void>) => {
    order.push('begin');
    await work(tx);
    order.push('commit');
  });
  const publishOne = jest.fn(async (_tx: Tx, id: string) => {
    order.push(`publish ${id}`);
  });
  const flush = jest.fn(async () => {
    order.push('flush');
  });
  return { tx, findPage, transaction, publishOne, flush, order };
}

describe('republishInPages', () => {
  it('walks the pages until an empty one, one transaction per page', async () => {
    const steps = setup([['a', 'b'], ['c']]);

    const count = await republishInPages(steps);

    expect(count).toBe(3);
    expect(steps.findPage.mock.calls).toEqual([[undefined], ['b'], ['c']]);
    expect(steps.order).toEqual([
      'begin',
      'publish a',
      'publish b',
      'commit',
      'begin',
      'publish c',
      'commit',
      'flush',
    ]);
    expect(steps.publishOne).toHaveBeenCalledWith(steps.tx, 'a');
  });

  it('does not flush when there was nothing to publish', async () => {
    const steps = setup([]);

    await expect(republishInPages(steps)).resolves.toBe(0);
    expect(steps.transaction).not.toHaveBeenCalled();
    expect(steps.flush).not.toHaveBeenCalled();
  });

  it('stops at the first failure and leaves the committed pages published', async () => {
    const steps = setup([['a'], ['b']]);
    steps.publishOne.mockResolvedValueOnce().mockRejectedValueOnce(new Error('boom'));

    await expect(republishInPages(steps)).rejects.toThrow('boom');
    expect(steps.flush).not.toHaveBeenCalled();
  });
});

describe('republishPageArgs', () => {
  it('orders by id and takes a page, starting after the cursor when there is one', () => {
    expect(republishPageArgs()).toEqual({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: REPUBLISH_PAGE_SIZE,
    });
    expect(republishPageArgs('x')).toEqual({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: REPUBLISH_PAGE_SIZE,
      cursor: { id: 'x' },
      skip: 1,
    });
  });
});
