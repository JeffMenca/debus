import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import BranchLocationMap from './branch-location-map';

let clickHandler: ((event: { latlng: { lat: number; lng: number } }) => void) | undefined;

jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  GeoJSON: () => <div data-testid="outline" />,
  Marker: () => <div data-testid="pin" />,
  TileLayer: () => <div data-testid="tiles" />,
  useMapEvents: (handlers: { click: typeof clickHandler }) => {
    clickHandler = handlers.click;
    return null;
  },
}));

describe('BranchLocationMap', () => {
  it('draws the outline of the country and no map tiles from outside', () => {
    render(<BranchLocationMap value={null} onPick={jest.fn()} />);

    expect(screen.getByTestId('outline')).toBeInTheDocument();
    expect(screen.queryByTestId('tiles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pin')).not.toBeInTheDocument();
  });

  it('shows the pin only once there is a point', () => {
    render(<BranchLocationMap value={{ latitude: 14.8, longitude: -91.5 }} onPick={jest.fn()} />);

    expect(screen.getByTestId('pin')).toBeInTheDocument();
  });

  it('hands over the touched point', () => {
    const onPick = jest.fn();
    render(<BranchLocationMap value={null} onPick={onPick} />);

    clickHandler?.({ latlng: { lat: 14.83, lng: -91.51 } });

    expect(onPick).toHaveBeenCalledWith(14.83, -91.51);
  });
});
