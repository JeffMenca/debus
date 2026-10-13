import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorAlert } from './error-alert';

it('shows the message as an alert with a retry button', async () => {
  const onRetry = jest.fn();
  render(<ErrorAlert message="No pudimos cargar los buses." onRetry={onRetry} />);

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los buses.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('omits the retry button when there is nothing to retry', () => {
  render(<ErrorAlert message="Falló." />);

  expect(screen.getByRole('alert')).toHaveTextContent('Falló.');
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
});
