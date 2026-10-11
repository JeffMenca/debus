import { render, screen } from '@testing-library/react';
import { ListPageSkeleton } from './list-page-skeleton';

it('keeps the title while the list state is read from the address', () => {
  render(<ListPageSkeleton title="Usuarios" />);

  expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
  expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
});
