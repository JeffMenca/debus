import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Providers } from './providers';

function Probe() {
  return <p>{useQueryClient() ? 'con cliente' : 'sin cliente'}</p>;
}

it('provides a query client', () => {
  render(
    <Providers>
      <Probe />
    </Providers>,
  );

  expect(screen.getByText('con cliente')).toBeInTheDocument();
});
