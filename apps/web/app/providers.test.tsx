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

it('mounts the notification area', () => {
  const { container } = render(<Providers>contenido</Providers>);

  expect(container.ownerDocument.querySelector('section[aria-label]')).toBeInTheDocument();
});
