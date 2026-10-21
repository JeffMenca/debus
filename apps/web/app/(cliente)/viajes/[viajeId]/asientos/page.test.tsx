import { render, screen } from '@testing-library/react';
import SeatsPage, { metadata } from './page';

jest.mock('../../../../../components/tickets/purchase-screen', () => ({
  PurchaseScreen: ({ tripId }: { tripId: string }) => <p>{`asientos de ${tripId}`}</p>,
}));

it('reads the trip from the address and shows its seats', async () => {
  render(await SeatsPage({ params: Promise.resolve({ viajeId: 'abc' }) } as never));

  expect(screen.getByText('asientos de abc')).toBeInTheDocument();
  expect(metadata.title).toBe('Elige tus asientos · debus');
});
