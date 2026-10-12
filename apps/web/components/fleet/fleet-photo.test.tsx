import { render, screen } from '@testing-library/react';
import { usePhoto } from '../../hooks/use-photo';
import { FleetPhoto } from './fleet-photo';

jest.mock('../../hooks/use-photo');

it('shows the picture of the bus when it loads', () => {
  jest.mocked(usePhoto).mockReturnValue('blob:bus');

  render(
    <FleetPhoto
      path="/api/flota/buses/1/photo"
      alt="Foto del bus C-482BTX"
      fallback={<i>respaldo</i>}
    />,
  );

  expect(screen.getByRole('img', { name: 'Foto del bus C-482BTX' })).toHaveAttribute(
    'src',
    'blob:bus',
  );
  expect(screen.queryByText('respaldo')).not.toBeInTheDocument();
  expect(usePhoto).toHaveBeenCalledWith('/api/flota/buses/1/photo');
});

it('shows the fallback while there is no picture', () => {
  jest.mocked(usePhoto).mockReturnValue(null);

  render(<FleetPhoto path={null} alt="Foto" fallback={<i>respaldo</i>} />);

  expect(screen.getByText('respaldo')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
