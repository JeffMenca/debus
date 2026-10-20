import { readCounterParams, writeCounterParams } from './counter-list-params';

const TODAY = '2026-10-18';

describe('counter list params', () => {
  it('opens on the trips from today, page 1, when the address says nothing', () => {
    expect(readCounterParams(new URLSearchParams(), TODAY)).toEqual({
      page: 1,
      pageSize: 20,
      from: TODAY,
    });
    expect(
      writeCounterParams(readCounterParams(new URLSearchParams(), TODAY), TODAY).toString(),
    ).toBe('');
  });

  it('keeps the day, the search and the page in Spanish in the address', () => {
    const address = new URLSearchParams('desde=2026-10-20&buscar=xela&pagina=2');
    const query = readCounterParams(address, TODAY);

    expect(query).toEqual({ page: 2, pageSize: 20, from: '2026-10-20', q: 'xela' });
    expect(writeCounterParams(query, TODAY).toString()).toBe(
      'desde=2026-10-20&buscar=xela&pagina=2',
    );
  });

  it('goes back to today for a day that is not one', () => {
    expect(readCounterParams(new URLSearchParams('desde=ayer'), TODAY).from).toBe(TODAY);
  });
});
