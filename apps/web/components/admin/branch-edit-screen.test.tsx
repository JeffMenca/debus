import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { useBranch } from '../../hooks/use-branches';
import { BranchEditScreen } from './branch-edit-screen';

jest.mock('../../hooks/use-branches');
jest.mock('./branch-form', () => ({
  BranchForm: ({ mode, branch }: { mode: string; branch: { name: string } }) => (
    <p>{`form ${mode} ${branch.name}`}</p>
  ),
}));

const id = '9b2c7a10-1111-4c4c-8888-123456789abc';

describe('BranchEditScreen', () => {
  it('shows placeholders while the branch loads', () => {
    jest
      .mocked(useBranch)
      .mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    render(<BranchEditScreen id={id} />);

    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
  });

  it('shows the branch name as the title and its form', () => {
    jest.mocked(useBranch).mockReturnValue({
      data: { id, name: 'Quetzaltenango' },
      isPending: false,
      isError: false,
    } as never);
    render(<BranchEditScreen id={id} />);

    expect(useBranch).toHaveBeenCalledWith(id);
    expect(screen.getByRole('heading', { level: 1, name: 'Quetzaltenango' })).toBeInTheDocument();
    expect(screen.getByText('form edit Quetzaltenango')).toBeInTheDocument();
  });

  it('explains a branch that does not exist and leads back to the list', () => {
    jest.mocked(useBranch).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(404, 'No encontramos esa sucursal.'),
      refetch: jest.fn(),
    } as never);
    render(<BranchEditScreen id={id} />);

    expect(screen.getByText('No encontramos esa sucursal.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a sucursales' })).toHaveAttribute(
      'href',
      '/admin/sucursales',
    );
  });

  it('offers a retry for other errors', async () => {
    const refetch = jest.fn();
    jest.mocked(useBranch).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(0, 'No pudimos conectarnos.'),
      refetch,
    } as never);
    render(<BranchEditScreen id={id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
  });
});
