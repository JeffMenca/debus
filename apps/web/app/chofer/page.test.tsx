import { render, screen } from '@testing-library/react';
import DriverHomePage, { metadata } from './page';

jest.mock('../../components/trips/driver-trips-screen', () => ({
  DriverTripsScreen: () => <p>mis viajes</p>,
}));

it('shows the trips of the driver', () => {
  render(<DriverHomePage />);

  expect(screen.getByText('mis viajes')).toBeInTheDocument();
  expect(metadata.title).toBe('Mis viajes · debus');
});
