import { render, screen } from '@testing-library/react';
import NewBranchPage from './page';

jest.mock('../../../../components/admin/branch-form', () => ({
  BranchForm: ({ mode }: { mode: string }) => <p>{`form ${mode}`}</p>,
}));

it('titles the page and shows the creation form', () => {
  render(<NewBranchPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Nueva sucursal' })).toBeInTheDocument();
  expect(screen.getByText('form create')).toBeInTheDocument();
});
