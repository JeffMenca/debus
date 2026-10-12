import { render, screen } from '@testing-library/react';
import BranchPage from './page';

jest.mock('../../../../components/admin/branch-edit-screen', () => ({
  BranchEditScreen: ({ id }: { id: string }) => <p>{`editing ${id}`}</p>,
}));

it('reads the id from the address and edits that branch', async () => {
  render(await BranchPage({ params: Promise.resolve({ id: 'abc' }) } as never));

  expect(screen.getByText('editing abc')).toBeInTheDocument();
});
