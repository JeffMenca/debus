import { render, screen } from '@testing-library/react';
import DriverTripPage, { metadata } from './page';

jest.mock('../../../../components/trips/trip-detail-screen', () => ({
  TripDetailScreen: ({ tripId, audience }: { tripId: string; audience: string }) => (
    <p>{`trip ${tripId} for ${audience}`}</p>
  ),
}));

it('reads the id from the address and shows that trip to the driver', async () => {
  render(await DriverTripPage({ params: Promise.resolve({ viajeId: 'abc' }) } as never));

  expect(screen.getByText('trip abc for driver')).toBeInTheDocument();
  expect(metadata.title).toBe('Viaje · debus');
});
