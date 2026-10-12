export const GUATEMALA_CENTER = { latitude: 15.5, longitude: -90.25 } as const;

// Six decimals is about a tenth of a meter: more than a branch address needs.
export const roundCoordinate = (value: number): number => Math.round(value * 1e6) / 1e6;
