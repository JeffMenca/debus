import { render, screen } from '@testing-library/react';
import { TravelScene } from './travel-scene';

it('shows the brand promise and hides the decoration from screen readers', () => {
  const { container } = render(<TravelScene />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tu próximo viaje empieza aquí.' }),
  ).toBeInTheDocument();
  expect(screen.getByText('debus')).toBeInTheDocument();
  expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
});

it('places the given actions on the same row as the logo', () => {
  render(<TravelScene actions={<a href="/login">Entrar</a>} />);

  const logoRow = screen.getByText('debus').closest('div[class*="justify-between"]');
  expect(logoRow).toContainElement(screen.getByRole('link', { name: 'Entrar' }));
});

it('shrinks the logo only when there are actions to share the row with', () => {
  const { rerender } = render(<TravelScene />);
  expect(screen.getByText('debus')).not.toHaveClass('max-sm:text-[22px]');

  rerender(<TravelScene actions={<a href="/login">Entrar</a>} />);
  expect(screen.getByText('debus')).toHaveClass('max-sm:text-[22px]');
});

describe('as the header of a page', () => {
  it('puts the logo and the actions in a banner that is not inside a section', () => {
    render(<TravelScene header actions={<a href="/login">Entrar</a>} />);

    const banner = screen.getByRole('banner');
    expect(banner).toContainElement(screen.getByText('debus'));
    expect(banner).toContainElement(screen.getByRole('link', { name: 'Entrar' }));
    expect(banner.closest('section')).toBeNull();
  });

  it('keeps the title out of the banner, in the scene that follows', () => {
    render(<TravelScene header />);

    expect(screen.getByRole('banner')).not.toContainElement(
      screen.getByRole('heading', { level: 1 }),
    );
    expect(screen.getByTestId('hero')).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('leaves the scene of the login as it was: no banner, a section', () => {
    const { container } = render(<TravelScene actions={<a href="/login">Entrar</a>} />);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });
});
