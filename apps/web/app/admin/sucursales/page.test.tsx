import { render, screen } from '@testing-library/react';
import BranchesPage, { metadata } from './page';

jest.mock('../../../components/admin/branches-screen', () => ({
  BranchesScreen: () => <p>lista de sucursales</p>,
}));

it('shows the branches list', () => {
  render(<BranchesPage />);

  expect(screen.getByText('lista de sucursales')).toBeInTheDocument();
  expect(metadata.title).toBe('Sucursales · debus');
});
