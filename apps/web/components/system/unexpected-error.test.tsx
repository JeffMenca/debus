import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnexpectedError } from './unexpected-error';

describe('UnexpectedError', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes the error to the console and shows only the friendly text', () => {
    const log = jest.spyOn(console, 'error').mockImplementation();
    const error = Object.assign(new Error('stack secreto'), { digest: 'abc123' });

    render(<UnexpectedError error={error} retry={jest.fn()} />);

    expect(log).toHaveBeenCalledWith(error);
    expect(screen.queryByText(/secreto|abc123/)).toBeNull();
    expect(screen.getByText(/No es culpa tuya/)).toBeInTheDocument();
  });

  it('asks Next to draw the screen again from its one primary button', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    const retry = jest.fn();
    render(<UnexpectedError error={new Error('x')} retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
