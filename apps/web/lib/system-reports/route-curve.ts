export type LatLng = [latitude: number, longitude: number];
type Position = Readonly<LatLng>;

export const CURVE_SEGMENTS = 40;

// A quadratic bezier from one branch to the other, bowed to one side by `bend` times the length
// of the line between them, so two routes between the same branches do not hide each other.
export function curvePoints(from: Position, to: Position, bend = 0.22): LatLng[] {
  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;
  const controlLat = (fromLat + toLat) / 2 - (toLng - fromLng) * bend;
  const controlLng = (fromLng + toLng) / 2 + (toLat - fromLat) * bend;
  return Array.from({ length: CURVE_SEGMENTS + 1 }, (_, index) => {
    if (index === 0) return [fromLat, fromLng];
    if (index === CURVE_SEGMENTS) return [toLat, toLng];
    const t = index / CURVE_SEGMENTS;
    const u = 1 - t;
    return [
      u * u * fromLat + 2 * u * t * controlLat + t * t * toLat,
      u * u * fromLng + 2 * u * t * controlLng + t * t * toLng,
    ];
  });
}

// The point at `progress` of the way (0 is the start, 1 the end); a value past either end wraps
// around, so a bus that keeps going comes back to the start.
export function pointAlong(points: readonly Position[], progress: number): LatLng {
  const wrapped = progress === 1 ? 1 : ((progress % 1) + 1) % 1;
  const position = wrapped * (points.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, points.length - 1);
  const rest = position - index;
  const [lat, lng] = points[index]!;
  const [nextLat, nextLng] = points[next]!;
  return [lat + (nextLat - lat) * rest, lng + (nextLng - lng) * rest];
}
