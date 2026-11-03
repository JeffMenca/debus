import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptionSelect } from './option-select';

const user = userEvent.setup({ applyAccept: false });
const options = [
  { value: 'a', label: 'Motor' },
  { value: 'b', label: 'Llantas', disabled: true },
];

function setup(props: Partial<React.ComponentProps<typeof OptionSelect>> = {}) {
  const onChange = jest.fn();
  render(
    <OptionSelect
      id="s"
      label="Categoría"
      placeholder="Elige la categoría"
      options={options}
      total={2}
      value=""
      onChange={onChange}
      search=""
      onSearchChange={jest.fn()}
      searchLabel="Buscar categoría"
      emptyMessage="Sin categorías"
      {...props}
    />,
  );
  return { onChange };
}

it('leaves an option that is disabled out of reach', async () => {
  const { onChange } = setup();

  await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
  await user.click(await screen.findByRole('option', { name: 'Llantas' }));

  expect(onChange).not.toHaveBeenCalled();
});

describe('with an option for "all"', () => {
  it('shows it as the value while nothing is picked', () => {
    setup({ noneLabel: 'Todas las categorías' });

    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveTextContent(
      'Todas las categorías',
    );
  });

  it('reports an empty value when it is chosen again after picking one', async () => {
    const { onChange } = setup({ noneLabel: 'Todas las categorías', value: 'a' });

    await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
    await user.click(await screen.findByRole('option', { name: 'Todas las categorías' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('does not count that option when deciding whether the list needs a search box', () => {
    setup({ noneLabel: 'Todas las categorías', total: 2 });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows the search box when the server has more than the page it sent', () => {
    setup({ noneLabel: 'Todas las categorías', total: 150 });

    expect(screen.getByRole('searchbox', { name: 'Buscar categoría' })).toBeInTheDocument();
  });
});

describe('with an error', () => {
  it('is marked invalid and points to the message that explains it', () => {
    setup({ error: 'Elige un bus.' });

    const trigger = screen.getByRole('combobox', { name: 'Categoría' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByText('Elige un bus.');
    expect(trigger).toHaveAttribute('aria-describedby', message.id);
  });

  it('carries no error attributes when all is well', () => {
    setup();

    const trigger = screen.getByRole('combobox', { name: 'Categoría' });
    expect(trigger).not.toHaveAttribute('aria-invalid');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });
});

it('offers the search box when asked to, even if the whole list fits', () => {
  setup({ alwaysSearch: true });

  expect(screen.getByRole('searchbox', { name: 'Buscar categoría' })).toBeInTheDocument();
});

it('keeps the box away when the whole list fits and nobody asked for it', () => {
  setup();

  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});
