import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Component, type ReactNode, useState } from 'react';
import ErrorPage from './error';

// What Next does with error.tsx: it shows it in place of the segment that threw, and retry draws
// the segment again.
class Boundary extends Component<
  { children: ReactNode },
  { error: (Error & { digest?: string }) | null }
> {
  state = { error: null as (Error & { digest?: string }) | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorPage error={error} retry={() => this.setState({ error: null })} />;
  }
}

function Screen({ breaks }: { breaks: { value: boolean } }) {
  if (breaks.value) throw new Error('stack secreto: connect ECONNREFUSED 10.0.0.5');
  return <p>Pantalla normal</p>;
}

describe('the page for an unexpected error', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('replaces the screen that threw with a friendly text, without showing the error', () => {
    render(
      <Boundary>
        <Screen breaks={{ value: true }} />
      </Boundary>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Algo salió mal al mostrar esta pantalla' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secreto|ECONNREFUSED/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });

  it('draws the screen again when the person tries again, and shows it if it works now', async () => {
    const breaks = { value: true };
    function Wrapper() {
      const [, setTick] = useState(0);
      return (
        <Boundary>
          <Screen breaks={breaks} />
          <button hidden onClick={() => setTick((tick) => tick + 1)} />
        </Boundary>
      );
    }
    render(<Wrapper />);
    breaks.value = false;

    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(screen.getByText('Pantalla normal')).toBeInTheDocument();
  });
});
