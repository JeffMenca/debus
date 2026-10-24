import { CURVE_SEGMENTS, curvePoints, pointAlong } from './route-curve';

const A = [14.8347, -91.518] as const;
const B = [14.6349, -90.5069] as const;

describe('curvePoints', () => {
  it('splits the curve into 40 segments and keeps both ends exactly where the branches are', () => {
    const points = curvePoints(A, B);

    expect(CURVE_SEGMENTS).toBe(40);
    expect(points).toHaveLength(CURVE_SEGMENTS + 1);
    expect(points[0]).toEqual(A);
    expect(points.at(-1)).toEqual(B);
  });

  it('bows to one side of the straight line instead of drawing it', () => {
    const middle = curvePoints(A, B)[CURVE_SEGMENTS / 2]!;
    const straight = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];

    expect(middle[0]).not.toBeCloseTo(straight[0]!, 2);
    expect(Math.hypot(middle[0] - straight[0]!, middle[1] - straight[1]!)).toBeGreaterThan(0.05);
  });

  it('bows more with a bigger bend, and not at all with none', () => {
    const flat = curvePoints(A, B, 0)[CURVE_SEGMENTS / 2]!;

    expect(flat[0]).toBeCloseTo((A[0] + B[0]) / 2, 10);
    expect(flat[1]).toBeCloseTo((A[1] + B[1]) / 2, 10);
  });
});

describe('pointAlong', () => {
  const points = curvePoints(A, B);

  it('starts at the first point and ends at the last', () => {
    expect(pointAlong(points, 0)).toEqual(A);
    expect(pointAlong(points, 1)).toEqual(B);
  });

  it('stands half way at the middle of the way', () => {
    expect(pointAlong(points, 0.5)).toEqual(points[CURVE_SEGMENTS / 2]);
  });

  it('lands between two points of the curve', () => {
    const [lat, lng] = pointAlong(
      [
        [0, 0],
        [10, 20],
      ],
      0.25,
    );

    expect(lat).toBeCloseTo(2.5);
    expect(lng).toBeCloseTo(5);
  });

  it('wraps a time past the end back to the start', () => {
    expect(pointAlong(points, 1.25)).toEqual(pointAlong(points, 0.25));
    expect(pointAlong(points, -0.75)).toEqual(pointAlong(points, 0.25));
  });
});
