import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useHydrated } from './use-hydrated';

function Probe() {
  return <span>{String(useHydrated())}</span>;
}

describe('useHydrated', () => {
  it('is false on the server and true once the page is interactive', () => {
    expect(renderToString(<Probe />)).toContain('false');

    render(<Probe />);

    expect(screen.getByText('true')).toBeInTheDocument();
  });
});
