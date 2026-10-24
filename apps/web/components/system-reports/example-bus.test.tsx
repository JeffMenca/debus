import { act, render } from '@testing-library/react';
import { useMediaQuery } from '../../hooks/use-media-query';
import { CURVE_SEGMENTS, curvePoints, pointAlong } from '../../lib/system-reports/route-curve';
import { ExampleBus } from './example-bus';

const mockSetLatLng = jest.fn();
const mockPositions: unknown[] = [];
jest.mock('react-leaflet', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual('react');
  return {
    Marker: forwardRef(({ position }: { position: unknown }, ref: unknown) => {
      mockPositions.push(position);
      useImperativeHandle(ref, () => ({ setLatLng: mockSetLatLng }));
      return <div data-testid="bus" />;
    }),
  };
});
jest.mock('../../hooks/use-media-query');

const points = curvePoints([14.8347, -91.518], [14.6349, -90.5069]);
let frames: ((now: number) => void)[] = [];

beforeEach(() => {
  mockSetLatLng.mockReset();
  mockPositions.length = 0;
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  jest.spyOn(performance, 'now').mockReturnValue(1000);
});
afterEach(() => jest.restoreAllMocks());

describe('ExampleBus', () => {
  it('stands at the middle of the route and does not move for who asked for less motion', () => {
    jest.mocked(useMediaQuery).mockReturnValue(true);
    render(<ExampleBus points={points} offset={0} speed={0.1} />);

    expect(mockSetLatLng).toHaveBeenCalledTimes(1);
    expect(mockSetLatLng).toHaveBeenCalledWith(points[CURVE_SEGMENTS / 2]);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('drives along the route, a little further each second, from where its offset puts it', () => {
    jest.mocked(useMediaQuery).mockReturnValue(false);
    render(<ExampleBus points={points} offset={0.25} speed={0.1} />);

    act(() => frames.shift()!(1000 + 2000));

    expect(mockSetLatLng).toHaveBeenLastCalledWith(pointAlong(points, 0.45));
    expect(frames).toHaveLength(1);
  });

  it('stops asking for frames when it leaves the map', () => {
    jest.mocked(useMediaQuery).mockReturnValue(false);
    const { unmount } = render(<ExampleBus points={points} offset={0} speed={0.1} />);

    unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('starts at the beginning of its route', () => {
    jest.mocked(useMediaQuery).mockReturnValue(false);
    render(<ExampleBus points={points} offset={0} speed={0.1} />);

    expect(mockPositions[0]).toEqual(points[0]);
  });
});
