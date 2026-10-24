import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMediaQuery } from '../../hooks/use-media-query';
import { OriginSelector } from './origin-selector';

jest.mock('../../hooks/use-media-query');
const user = userEvent.setup({ applyAccept: false });

const branch = (name: string) => ({ id: `id-${name}`, name });
const few = ['Quetzaltenango', 'Cobán', 'Huehuetenango'].map(branch);
const many = [...few, branch('Flores'), branch('Escuintla')];

const wide = () => jest.mocked(useMediaQuery).mockReturnValue(false);
const phone = () => jest.mocked(useMediaQuery).mockReturnValue(true);

describe('OriginSelector', () => {
  it('shows up to four branches as tabs, with the chosen one selected', async () => {
    wide();
    const onChange = jest.fn();
    render(<OriginSelector branches={few} value="id-Cobán" onChange={onChange} />);

    expect(screen.getByRole('tablist', { name: 'Sucursal de origen' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Cobán' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Quetzaltenango' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    await user.click(screen.getByRole('tab', { name: 'Huehuetenango' }));
    expect(onChange).toHaveBeenCalledWith('id-Huehuetenango');
  });

  it('shows five branches or more as a select', async () => {
    wide();
    const onChange = jest.fn();
    render(<OriginSelector branches={many} value="id-Cobán" onChange={onChange} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Sucursal de origen' });
    expect(select).toHaveTextContent('Cobán');

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Flores' }));
    expect(onChange).toHaveBeenCalledWith('id-Flores');
  });

  it('always shows a select on a phone, however few the branches are', () => {
    phone();
    render(<OriginSelector branches={few} value="id-Cobán" onChange={jest.fn()} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sucursal de origen' })).toBeInTheDocument();
  });

  it('shows nothing to choose from when there are no branches', () => {
    wide();
    const { container } = render(
      <OriginSelector branches={[]} value={null} onChange={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
