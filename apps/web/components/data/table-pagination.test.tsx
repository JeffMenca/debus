import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablePagination } from './table-pagination';

const props = {
  page: 2,
  pageCount: 3,
  pageSize: 20,
  total: 45,
  from: 21,
  to: 40,
  canPrevious: true,
  canNext: true,
  onFirst: jest.fn(),
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onLast: jest.fn(),
  onPageSizeChange: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

it('says where you are and moves between pages', async () => {
  render(<TablePagination {...props} />);

  expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument();
  expect(screen.getByText('Mostrando 21–40 de 45')).toBeInTheDocument();
  expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Primera página' }));
  await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
  await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  await userEvent.click(screen.getByRole('button', { name: 'Última página' }));
  expect(props.onFirst).toHaveBeenCalled();
  expect(props.onPrevious).toHaveBeenCalled();
  expect(props.onNext).toHaveBeenCalled();
  expect(props.onLast).toHaveBeenCalled();
});

it('announces the page to screen readers when it changes', () => {
  render(<TablePagination {...props} />);

  expect(screen.getByText('Página 2 de 3')).toHaveAttribute('aria-live', 'polite');
});

it('writes thousands with a separator', () => {
  render(<TablePagination {...props} page={2} pageCount={150} total={3000} from={21} to={40} />);

  expect(screen.getByText('Mostrando 21–40 de 3,000')).toBeInTheDocument();
  expect(screen.getByText('Página 2 de 150')).toBeInTheDocument();
});

it('disables the way back on the first page', () => {
  render(<TablePagination {...props} page={1} from={1} to={20} canPrevious={false} />);

  expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Primera página' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
});

it('disables the way forward on the last page', () => {
  render(<TablePagination {...props} page={3} from={41} to={45} canNext={false} />);

  expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Última página' })).toBeDisabled();
});

it('offers 20, 50 and 100 rows per page', async () => {
  render(<TablePagination {...props} />);

  await userEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
  const options = screen.getAllByRole('option').map((option) => option.textContent);
  await userEvent.click(screen.getByRole('option', { name: '50' }));

  expect(options).toEqual(['20', '50', '100']);
  expect(props.onPageSizeChange).toHaveBeenCalledWith(50);
});

it('makes every control at least 44 px tall', () => {
  render(<TablePagination {...props} />);
  const nav = screen.getByRole('navigation', { name: 'Paginación' });

  for (const button of within(nav).getAllByRole('button')) {
    expect(button).toHaveClass('size-11');
  }
});
