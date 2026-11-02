import { render, screen } from '@testing-library/react';
import { DepartmentLabels } from './department-labels';

jest.mock('react-leaflet', () => ({
  Marker: ({
    icon,
    interactive,
  }: {
    icon: { options: { html: string } };
    interactive: boolean;
  }) => (
    <div
      data-testid="label"
      data-interactive={String(interactive)}
      dangerouslySetInnerHTML={{ __html: icon.options.html }}
    />
  ),
}));

describe('DepartmentLabels', () => {
  it('names the 22 departments with their short names and takes no touches', () => {
    render(<DepartmentLabels />);

    const labels = screen.getAllByTestId('label');
    expect(labels).toHaveLength(22);
    expect(screen.getByText('Quet')).toBeInTheDocument();
    for (const label of labels) expect(label).toHaveAttribute('data-interactive', 'false');
  });

  it('is hidden from assistive technology', () => {
    render(<DepartmentLabels />);

    expect(screen.getByText('Quet')).toHaveAttribute('aria-hidden', 'true');
  });
});
