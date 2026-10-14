import { render, screen } from '@testing-library/react';
import { arrivalRecord, departureRecord, tripDetail } from '../../test-support/trips';
import { TripHero } from './trip-hero';

const progress = () => screen.getByRole('progressbar');

it('names the kind of trip with its day, and the route, bus, driver and distance', () => {
  render(<TripHero trip={tripDetail()} />);

  expect(screen.getByText('Viaje regular · martes 20 de octubre')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Quetzaltenango a Guatemala' }),
  ).toBeInTheDocument();
  expect(screen.getByText('C-482BTX')).toBeInTheDocument();
  expect(screen.getByText('Julio Pérez')).toBeInTheDocument();
  expect(screen.getByText('201 km')).toBeInTheDocument();
});

it('calls a rental by its name and leaves out the distance it does not have', () => {
  render(<TripHero trip={tripDetail({ type: 'RENTAL', routeId: null, distanceKm: null })} />);

  expect(screen.getByText('Alquiler · martes 20 de octubre')).toBeInTheDocument();
  expect(screen.queryByText('Distancia')).not.toBeInTheDocument();
});

it('shows the scheduled hours and a bus that has not left', () => {
  render(<TripHero trip={tripDetail()} />);

  expect(screen.getByText('05:30')).toBeInTheDocument();
  expect(screen.getByText('salida programada')).toBeInTheDocument();
  expect(screen.getByText('10:30')).toBeInTheDocument();
  expect(screen.getByText('llegada estimada')).toBeInTheDocument();
  expect(progress()).toHaveAttribute('aria-valuenow', '0');
});

it('shows the real departure and the bus halfway while it is on the road', () => {
  render(<TripHero trip={tripDetail({ status: 'IN_TRANSIT', departure: departureRecord() })} />);

  expect(screen.getByText('05:34')).toBeInTheDocument();
  expect(screen.getByText('salida real')).toBeInTheDocument();
  expect(screen.getByText('llegada estimada')).toBeInTheDocument();
  expect(progress()).toHaveAttribute('aria-valuenow', '50');
});

it('shows both real hours and the bus at the end when the trip is completed', () => {
  render(
    <TripHero
      trip={tripDetail({
        status: 'COMPLETED',
        departure: departureRecord(),
        arrival: arrivalRecord(),
      })}
    />,
  );

  expect(screen.getByText('09:52')).toBeInTheDocument();
  expect(screen.getByText('llegada real')).toBeInTheDocument();
  expect(progress()).toHaveAttribute('aria-valuenow', '100');
});

it('only moves the bus when motion is allowed', () => {
  render(<TripHero trip={tripDetail({ status: 'IN_TRANSIT', departure: departureRecord() })} />);

  expect(progress().querySelector('[style*="left"]')).toHaveClass('motion-reduce:transition-none');
});
