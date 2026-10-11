import { render, screen } from '@testing-library/react';
import { TextLink } from './text-link';

it('is a link with the focus ring of the design system, not the browser default', () => {
  render(<TextLink href="/recuperar">¿La olvidaste?</TextLink>);

  const link = screen.getByRole('link', { name: '¿La olvidaste?' });
  expect(link).toHaveAttribute('href', '/recuperar');
  expect(link).toHaveClass(
    'focus-visible:outline-2',
    'focus-visible:outline-ring',
    'outline-offset-2',
  );
});

it('accepts extra classes', () => {
  render(
    <TextLink href="/x" className="underline">
      x
    </TextLink>,
  );

  expect(screen.getByRole('link')).toHaveClass('underline');
});

it('is indigo and small by default', () => {
  render(<TextLink href="/x">x</TextLink>);

  expect(screen.getByRole('link')).toHaveClass('text-primary', 'text-[13px]');
});

it.each([
  ['coral', 'text-coral-700', 'hover:text-coral-900'],
  ['light', 'text-sidebar-foreground', 'hover:text-sidebar-accent-foreground'],
] as const)('has a %s tone for colored backgrounds, replacing the indigo', (tone, color, hover) => {
  render(
    <TextLink href="/x" tone={tone}>
      x
    </TextLink>,
  );

  const link = screen.getByRole('link');
  expect(link).toHaveClass(color, hover);
  expect(link).not.toHaveClass('text-primary');
});

it('can be sized up to the body text', () => {
  render(
    <TextLink href="/x" size="md">
      x
    </TextLink>,
  );

  expect(screen.getByRole('link')).toHaveClass('text-[15px]');
  expect(screen.getByRole('link')).not.toHaveClass('text-[13px]');
});
