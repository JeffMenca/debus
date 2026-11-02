import { render, screen } from '@testing-library/react';
import { Logo } from './logo';

it('keeps its full size by default', () => {
  render(<Logo />);

  expect(screen.getByText('debus')).not.toHaveClass('max-sm:text-[22px]');
});

it('shrinks on narrow screens when it shares its row', () => {
  const { container } = render(<Logo compact />);

  expect(screen.getByText('debus')).toHaveClass('max-sm:text-[22px]');
  expect(container.firstElementChild?.firstElementChild).toHaveClass('max-sm:size-9');
});

it('has a light version for dark backgrounds, colored by sidebar tokens', () => {
  const { container } = render(<Logo tone="light" />);

  expect(screen.getByText('debus')).toHaveClass('text-sidebar-accent-foreground');
  expect(screen.getByText('debus')).not.toHaveClass('text-foreground');
  expect(container.firstElementChild?.firstElementChild).toHaveClass(
    'bg-sidebar-primary',
    'text-sidebar-primary-foreground',
  );
});

it('folds with the sidebar when it is collapsible, keeping its name', () => {
  const { container } = render(<Logo tone="light" collapsible />);

  expect(screen.getByText('debus')).toHaveClass('group-data-[collapsible=icon]:hidden');
  expect(container.firstElementChild).toHaveAttribute('aria-label', 'debus');
  expect(container.firstElementChild?.firstElementChild).toHaveClass(
    'group-data-[collapsible=icon]:size-8',
  );
});
