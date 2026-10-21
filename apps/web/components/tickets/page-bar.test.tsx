import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageBar } from './page-bar';

describe('PageBar', () => {
  it('says which cards are shown and moves to every page', async () => {
    const onChange = jest.fn();
    render(
      <PageBar query={{ page: 3, pageSize: 20 }} total={100} shown={20} onChange={onChange} />,
    );

    expect(screen.getByText('Mostrando 41–60 de 100')).toBeVisible();
    expect(screen.getByText('Página 3 de 5')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Primera página' }));
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Última página' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    await userEvent.click(await screen.findByRole('option', { name: '50' }));

    expect(onChange.mock.calls).toEqual([
      [{ page: 1 }],
      [{ page: 2 }],
      [{ page: 4 }],
      [{ page: 5 }],
      [{ pageSize: 50 }],
    ]);
  });

  it('cannot go back from the first page nor forward from the last', () => {
    render(<PageBar query={{ page: 1, pageSize: 20 }} total={5} shown={5} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });
});
