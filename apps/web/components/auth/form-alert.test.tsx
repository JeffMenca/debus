import { Ticket } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { FormAlert } from './form-alert';

describe('FormAlert', () => {
  it('announces errors', () => {
    render(<FormAlert tone="error">Algo salió mal.</FormAlert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal.');
  });

  it('announces success politely', () => {
    render(<FormAlert tone="success">Listo.</FormAlert>);

    expect(screen.getByRole('status')).toHaveTextContent('Listo.');
  });

  it('can be a plain note without a live region', () => {
    render(
      <FormAlert tone="success" icon={Ticket} live={false}>
        Nota.
      </FormAlert>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Nota.')).toBeInTheDocument();
  });
});
