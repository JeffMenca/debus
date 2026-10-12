import { render, screen } from '@testing-library/react';
import DesignSystemPage, { metadata } from './page';

jest.mock('sonner', () => ({ toast: { success: jest.fn() }, Toaster: () => null }));

it('is a page without a link, hidden from search engines', () => {
  render(<DesignSystemPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Sistema de diseño' })).toBeInTheDocument();
  expect(metadata.robots).toEqual({ index: false });
});
