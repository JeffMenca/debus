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
