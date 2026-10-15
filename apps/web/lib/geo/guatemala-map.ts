import type { GeoBounds } from './project';

// The frame of the map of the home page: the same on the server, which draws the country, and in
// the browser, which places the branches over it.
export const MAP_BOUNDS: GeoBounds = { west: -92.25, east: -88.2, south: 13.7, north: 17.85 };
export const MAP_WIDTH = 600;
