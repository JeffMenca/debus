import { render, screen } from '@testing-library/react';
import CategoriesPage, { metadata } from './page';

jest.mock('../../../components/expenses/categories-screen', () => ({
  CategoriesScreen: () => <p>lista de categorías</p>,
}));

it('shows the categories list', () => {
  render(<CategoriesPage />);

  expect(screen.getByText('lista de categorías')).toBeInTheDocument();
  expect(metadata.title).toBe('Categorías de gasto · debus');
});
