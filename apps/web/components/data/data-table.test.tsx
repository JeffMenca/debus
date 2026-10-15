import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, columnHelperFor } from './data-table';

interface Row {
  id: string;
  name: string;
  km: number;
}
const helper = columnHelperFor<Row>();
const columns = helper.columns([
  helper.accessor('name', { header: 'Nombre' }),
  helper.accessor('km', {
    header: 'Kilometraje',
    cell: (info) => info.getValue().toLocaleString('en-US'),
  }),
]);
const rows: Row[] = [
  { id: '1', name: 'Volvo B8R', km: 148410 },
  { id: '2', name: 'Scania K360', km: 96220 },
];

describe('DataTable', () => {
  it('renders an accessible table with headers, cells and the summary', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        emptyMessage="Sin buses"
        summary="Mostrando 2 de 2 buses"
        footerNote={<span>Nota al pie</span>}
      />,
    );

    const table = screen.getByRole('table', { name: 'Buses' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Nombre', 'Kilometraje']);
    expect(within(table).getByText('148,410')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Mostrando 2 de 2 buses')).toBeInTheDocument();
    expect(screen.getByText('Nota al pie')).toBeInTheDocument();
  });

  it('uses the given row ids', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        getRowId={(row) => `bus-${row.id}`}
        emptyMessage=""
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows skeleton rows while loading and a friendly empty state', () => {
    const { rerender } = render(
      <DataTable caption="Buses" columns={columns} data={[]} isLoading emptyMessage="Sin buses" />,
    );
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();

    rerender(
      <DataTable caption="Buses" columns={columns} data={[]} emptyMessage="Aún no hay buses" />,
    );

    expect(screen.queryByLabelText('Cargando')).not.toBeInTheDocument();
    expect(screen.getByText('Aún no hay buses')).toBeInTheDocument();
  });

  it('keeps the empty message outside the table, so a wide table scrolling aside never hides it', () => {
    render(
      <DataTable caption="Buses" columns={columns} data={[]} emptyMessage="Aún no hay buses" />,
    );

    expect(
      within(screen.getByRole('table', { name: 'Buses' })).queryByText('Aún no hay buses'),
    ).toBeNull();
    expect(screen.getByText('Aún no hay buses')).toBeVisible();
  });

  it('offers a retry when loading failed', async () => {
    const onRetry = jest.fn();
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={[]}
        error="No pudimos cargar los buses."
        onRetry={onRetry}
        emptyMessage=""
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los buses.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the error without a retry button when there is nothing to retry', () => {
    render(
      <DataTable caption="Buses" columns={columns} data={[]} error="Falló." emptyMessage="" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falló.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows the PDF export only when a report asks for it', async () => {
    const onExport = jest.fn();
    const { rerender } = render(
      <DataTable caption="Buses" columns={columns} data={rows} emptyMessage="" />,
    );
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).not.toBeInTheDocument();

    rerender(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        emptyMessage=""
        onExport={onExport}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(onExport).toHaveBeenCalled();
  });

  it('keeps screen-reader-only text inside its cell, so it never widens the page', () => {
    const withHidden = helper.columns([
      helper.accessor('name', { header: () => <span className="sr-only">Nombre oculto</span> }),
    ]);
    render(<DataTable caption="Buses" columns={withHidden} data={rows} emptyMessage="" />);

    // An absolutely positioned child needs a positioned cell, or it sticks out of the scroll area.
    expect(screen.getByRole('columnheader')).toHaveClass('relative');
  });

  describe('with server pagination', () => {
    const people: Row[] = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: `Bus ${n}`, km: n }));

    it('paints the page the server sent and asks for the next one', async () => {
      const onPageChange = jest.fn();
      render(
        <DataTable
          caption="Buses"
          columns={columns}
          data={people.slice(0, 2)}
          emptyMessage="Nadie"
          pagination={{ page: 1, pageSize: 2, total: 5, onPageChange, onPageSizeChange: jest.fn() }}
        />,
      );

      // Header plus the 2 rows it got: the table neither cuts nor pads the page.
      expect(screen.getAllByRole('row')).toHaveLength(3);
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
      expect(screen.getByText('Mostrando 1–2 de 5')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('jumps to the first and last pages', async () => {
      const onPageChange = jest.fn();
      render(
        <DataTable
          caption="Buses"
          columns={columns}
          data={people.slice(2, 4)}
          emptyMessage="Nadie"
          pagination={{ page: 2, pageSize: 2, total: 5, onPageChange, onPageSizeChange: jest.fn() }}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Última página' }));
      await userEvent.click(screen.getByRole('button', { name: 'Primera página' }));
      await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));

      expect(onPageChange.mock.calls.map(([page]) => page)).toEqual([3, 1, 1]);
    });

    it('reports a new page size apart from a new page', async () => {
      const onPageChange = jest.fn();
      const onPageSizeChange = jest.fn();
      render(
        <DataTable
          caption="Buses"
          columns={columns}
          data={people}
          emptyMessage="Nadie"
          pagination={{ page: 1, pageSize: 20, total: 45, onPageChange, onPageSizeChange }}
        />,
      );

      await userEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
      await userEvent.click(screen.getByRole('option', { name: '100' }));

      expect(onPageSizeChange).toHaveBeenCalledWith(100);
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('hides the pagination when there is nothing to show', () => {
      render(
        <DataTable
          caption="Buses"
          columns={columns}
          data={[]}
          emptyMessage="Nadie"
          pagination={{
            page: 1,
            pageSize: 20,
            total: 0,
            onPageChange: jest.fn(),
            onPageSizeChange: jest.fn(),
          }}
        />,
      );

      expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
      expect(screen.getByText('Nadie')).toBeInTheDocument();
    });

    it('keeps the footer note but leaves the count to the pagination bar', () => {
      render(
        <DataTable
          caption="Buses"
          columns={columns}
          data={people}
          emptyMessage="Nadie"
          summary="Mostrando 5 de 45"
          footerNote={<span>Nota al pie</span>}
          pagination={{
            page: 1,
            pageSize: 20,
            total: 45,
            onPageChange: jest.fn(),
            onPageSizeChange: jest.fn(),
          }}
        />,
      );

      expect(screen.getByText('Nota al pie')).toBeInTheDocument();
      expect(screen.queryByText('Mostrando 5 de 45')).not.toBeInTheDocument();
      expect(screen.getByText('Mostrando 1–5 de 45')).toBeInTheDocument();
    });
  });

  it('marks the table busy while the next page arrives', () => {
    const { rerender } = render(
      <DataTable caption="Buses" columns={columns} data={rows} emptyMessage="" />,
    );
    expect(screen.getByRole('table', { name: 'Buses' }).closest('[aria-busy="true"]')).toBeNull();

    rerender(
      <DataTable caption="Buses" columns={columns} data={rows} emptyMessage="" isRefreshing />,
    );

    expect(
      screen.getByRole('table', { name: 'Buses' }).closest('[aria-busy="true"]'),
    ).not.toBeNull();
  });

  it('shows the detail under the rows that are expanded, and nowhere else', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage=""
        expandedRowIds={new Set(['2'])}
        renderDetail={(row) => <p>Detalle de {row.name}</p>}
      />,
    );

    expect(screen.getByText('Detalle de Scania K360')).toBeInTheDocument();
    expect(screen.queryByText('Detalle de Volvo B8R')).not.toBeInTheDocument();
    const detail = screen.getByText('Detalle de Scania K360').closest('td')!;
    expect(detail).toHaveAttribute('colspan', '2');
    expect(detail.closest('tr')!.previousElementSibling).toHaveTextContent('Scania K360');
  });

  it('shows no detail when no row is expanded', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyMessage=""
        renderDetail={(row) => <p>Detalle de {row.name}</p>}
      />,
    );

    expect(screen.queryByText(/Detalle de/)).not.toBeInTheDocument();
  });
});
