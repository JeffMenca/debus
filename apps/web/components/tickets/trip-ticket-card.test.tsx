import { render, screen } from '@testing-library/react';
import { seatMap } from '../../test-support/tickets';
import { TripTicketCard } from './trip-ticket-card';

describe('TripTicketCard', () => {
  it('shows the hours with the places under them and the date and plate above', () => {
    render(<TripTicketCard trip={seatMap()} />);

    expect(screen.getByText(/^Viaje · /)).toBeInTheDocument();
    expect(screen.getByText('Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByText('Guatemala')).toBeInTheDocument();
  });

  it('keeps its round decoration in the corner, hidden from assistive technology', () => {
    const { container } = render(<TripTicketCard trip={seatMap()} />);

    const decoration = container.querySelector('[data-decoration]');
    expect(decoration).toHaveAttribute('aria-hidden', 'true');
    // Small and pushed into the corner, so it ends before the row of hours.
    expect(decoration).toHaveClass('size-24', '-top-12', '-right-12');
  });

  it('leaves room on the right of the heading for the decoration', () => {
    render(<TripTicketCard trip={seatMap()} />);

    expect(screen.getByText(/^Viaje · /)).toHaveClass('pr-10');
  });
});
