import { render, screen } from '@testing-library/react';
import CounterPage, { metadata } from './page';

jest.mock('../../../components/tickets/counter-screen', () => ({
  CounterScreen: () => <p>ventanilla</p>,
}));

describe('CounterPage', () => {
  it('shows the counter with its own title', () => {
    render(<CounterPage />);

    expect(screen.getByText('ventanilla')).toBeInTheDocument();
    expect(metadata.title).toBe('Ventanilla · debus');
  });
});
