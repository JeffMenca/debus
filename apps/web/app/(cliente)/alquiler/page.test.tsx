import { render, screen } from '@testing-library/react';
import RentalPage, { metadata } from './page';

jest.mock('../../../components/rentals/rental-request-screen', () => ({
  RentalRequestScreen: () => <p>alquilar un bus</p>,
}));

it('shows the rental request screen', () => {
  render(<RentalPage />);

  expect(screen.getByText('alquilar un bus')).toBeInTheDocument();
  expect(metadata.title).toBe('Alquila un bus · debus');
});
