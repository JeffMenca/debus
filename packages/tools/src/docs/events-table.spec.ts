import { eventsTable } from './events-table';

describe('eventsTable', () => {
  it('lists what viajes publishes, with who consumes it', () => {
    const table = eventsTable('viajes');

    expect(table).toContain('Publica');
    expect(table).toMatch(/\| `TripScheduled` \| .*ventas.*reportes.*flota/);
    expect(table).toMatch(/\| `TripDeparted` \|/);
  });

  it('lists what viajes consumes, with who publishes it', () => {
    const table = eventsTable('viajes');

    expect(table).toContain('Consume');
    expect(table).toMatch(/\| `RentalPaid` \| clientes/);
    expect(table).toMatch(/\| `BusAdded` \| flota/);
    expect(table).toMatch(/\| `SettingsUpdated` \| administracion/);
  });

  it('does not list what the service does not take part in', () => {
    const table = eventsTable('viajes');

    expect(table).not.toContain('TicketSold');
    expect(table).not.toContain('UserRegistered');
  });

  it('says so when a service publishes or consumes nothing', () => {
    expect(eventsTable('notificaciones')).toContain('No publica eventos.');
    expect(eventsTable('gateway')).toContain('No consume eventos.');
  });

  it('shows the diagnostic probe of the gateway to every service', () => {
    expect(eventsTable('gateway')).toMatch(/\| `ProbeSent` \|.*administracion.*notificaciones/);
    expect(eventsTable('flota')).toMatch(/\| `ProbeSent` \| gateway/);
  });

  it('is the same text each time', () => {
    expect(eventsTable('flota')).toBe(eventsTable('flota'));
  });
});
