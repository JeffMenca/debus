import { render, screen } from '@testing-library/react';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('shows the title as the page heading with the eyebrow above and the actions beside it', () => {
    render(
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        actions={<button type="button">Invitar usuario</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invitar usuario' })).toBeInTheDocument();
  });

  it('works with only a title and respects reduced motion', () => {
    const { container } = render(<PageHeader title="Panel" />);

    expect(container.querySelector('header')).toHaveClass('motion-reduce:animate-none');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
