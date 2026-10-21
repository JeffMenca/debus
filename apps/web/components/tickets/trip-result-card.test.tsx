import { render, screen } from '@testing-library/react';
import { TRIP_ID, availableTrip } from '../../test-support/tickets';
import { TripResultCard } from './trip-result-card';

const renderCard = (over: Parameters<typeof availableTrip>[0] = {}, search = '') =>
  render(
    <ul>
      <TripResultCard trip={availableTrip(over)} search={search} />
    </ul>,
  );

describe('TripResultCard', () => {
  it('shows the departure, the arrival, the bus, the free seats and the price', () => {
    renderCard({ freeSeats: 18 });

    expect(screen.getAllByText('05:30')).toHaveLength(2);
    expect(screen.getByText('Madrugada')).toBeInTheDocument();
    expect(screen.getByText('09:45')).toBeInTheDocument();
    expect(screen.getByText('4 h 15 min · directo')).toBeInTheDocument();
    expect(screen.getByText('C-482BTX')).toBeInTheDocument();
    expect(screen.getByText('18 de 40 libres')).toBeInTheDocument();
    expect(screen.getByText(/Q\s?85\.00/)).toBeInTheDocument();
    expect(screen.getByText('por asiento')).toBeInTheDocument();
  });

  it('leads to the seats of the trip, keeping the search to come back to', () => {
    renderCard({}, 'origen=Quetzaltenango&pasajeros=2');

    expect(
      screen.getByRole('link', { name: 'Elegir asientos de Quetzaltenango a Guatemala, 05:30' }),
    ).toHaveAttribute('href', `/viajes/${TRIP_ID}/asientos?origen=Quetzaltenango&pasajeros=2`);
  });

  it('warns when few seats are left', () => {
    renderCard({ freeSeats: 4 });

    expect(screen.getByText('¡Solo quedan 4!')).toBeInTheDocument();
  });

  it('offers nothing to choose on a sold out trip', () => {
    renderCard({ freeSeats: 0 });

    expect(screen.getByText('Sin asientos libres')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agotado' })).toBeDisabled();
  });
});
