import {
  ARCHITECTURE_REPORT_PARAMS,
  readArchitectureParams,
  writeArchitectureParams,
} from './architecture';

describe('architecture params', () => {
  it('reads a known service, event and page from the address and ignores unknown ones', () => {
    expect(
      readArchitectureParams(new URLSearchParams('servicio=ventas&evento=TicketSold&pagina=2')),
    ).toEqual({ service: 'ventas', event: 'TicketSold', page: 2, pageSize: 20 });
    expect(readArchitectureParams(new URLSearchParams('servicio=x&evento=y'))).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('writes only the filters and the page that are set', () => {
    expect(writeArchitectureParams({ page: 2, pageSize: 20, service: 'gateway' }).toString()).toBe(
      'servicio=gateway&pagina=2',
    );
    expect(writeArchitectureParams({ page: 1, pageSize: 20 }).toString()).toBe('');
  });

  it('asks the API with its own names', () => {
    expect(
      ARCHITECTURE_REPORT_PARAMS.toSearch({
        page: 1,
        pageSize: 20,
        service: 'ventas',
        event: 'TicketSold',
      }).toString(),
    ).toBe('event=TicketSold&page=1&pageSize=20&service=ventas');
  });
});
