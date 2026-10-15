import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportRangeField } from './report-range-field';

const TODAY = '2026-10-13';
const user = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-13T18:00:00Z'),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});
afterEach(() => jest.useRealTimers());

const trigger = () => screen.getByRole('button', { name: /Periodo/ });

describe('ReportRangeField', () => {
  it('starts on every record', () => {
    render(<ReportRangeField range={{}} onChange={jest.fn()} />);

    expect(trigger()).toHaveTextContent('Todos los registros');
  });

  it('proposes today when opened, without applying anything', async () => {
    const onChange = jest.fn();
    render(<ReportRangeField range={{}} onChange={onChange} />);

    await user.click(trigger());

    expect(screen.getByLabelText('Desde')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Hasta')).toHaveValue(TODAY);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the chosen days and closes', async () => {
    const onChange = jest.fn();
    render(<ReportRangeField range={{}} onChange={onChange} />);
    await user.click(trigger());

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-01', to: TODAY });
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
  });

  it('shows the period and offers to see every record again', async () => {
    const onChange = jest.fn();
    render(
      <ReportRangeField range={{ from: '2026-10-01', to: '2026-10-13' }} onChange={onChange} />,
    );
    expect(trigger()).toHaveTextContent('1 oct. 2026 – 13 oct. 2026');

    await user.click(trigger());
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Ver todos los registros' }));

    expect(onChange).toHaveBeenCalledWith({});
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
  });

  it('does not offer to see every record when there is no period', async () => {
    render(<ReportRangeField range={{}} onChange={jest.fn()} />);
    await user.click(trigger());

    expect(
      screen.queryByRole('button', { name: 'Ver todos los registros' }),
    ).not.toBeInTheDocument();
  });

  it('keeps "hasta" from going before "desde"', async () => {
    const onChange = jest.fn();
    render(<ReportRangeField range={{}} onChange={onChange} />);
    await user.click(trigger());

    expect(screen.getByLabelText('Hasta')).toHaveAttribute('min', TODAY);
    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', TODAY);
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-01' } });

    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });

  it('closes with Escape without applying and gives the focus back', async () => {
    const onChange = jest.fn();
    render(<ReportRangeField range={{}} onChange={onChange} />);
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('proposes the day already chosen when only one end is set', async () => {
    render(<ReportRangeField range={{ from: '2026-10-05' }} onChange={jest.fn()} />);
    await user.click(trigger());

    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-05');
  });
});
