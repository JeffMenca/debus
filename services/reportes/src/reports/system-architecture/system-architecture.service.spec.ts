import { EVENT_TYPES } from '@debus/contracts';
import { SystemArchitectureService } from './system-architecture.service';

describe('SystemArchitectureService', () => {
  const setup = () => {
    const renderer = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) };
    return { renderer, service: new SystemArchitectureService(renderer as never) };
  };

  it('pages the filtered events and adds up the whole filtered set', () => {
    const { service } = setup();

    const page = service.page({ page: 2, pageSize: 20 });

    expect(page.items.map((row) => row.type)).toEqual(EVENT_TYPES.slice(20, 40));
    expect(page).toMatchObject({ total: EVENT_TYPES.length, page: 2, pageSize: 20 });
    expect(page.summary.totals.events).toBe(EVENT_TYPES.length);
    expect(page.summary.groups).toEqual([]);
  });

  it('keeps only the events of the chosen service', () => {
    const { service } = setup();

    const page = service.page({ page: 1, pageSize: 100, event: 'TicketSold' });

    expect(page.items.map((row) => row.type)).toEqual(['TicketSold']);
    expect(page.summary.totals).toEqual({ events: 1, subscriptions: 3 });
  });

  it('renders the PDF with every filtered event', async () => {
    const { service, renderer } = setup();

    const pdf = await service.pdf({ page: 1, pageSize: 20, service: 'ventas' });

    expect(pdf.toString()).toBe('%PDF-');
    const [doc] = renderer.render.mock.calls[0] as [{ filters: string[] }];
    expect(doc.filters).toEqual(['Servicio: Ventas']);
  });
});
