// Pure helpers that turn GeoJSON into SVG paths, so a map needs no tiles, library or client code.

export type Point = readonly [x: number, y: number];

export interface GeoBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

// A position is [lon, lat]. The types stay loose on purpose: an imported JSON file is typed by its
// shape, so it cannot be narrowed to the geometry kinds without a cast.
type Ring = readonly (readonly number[])[];

export interface FeatureCollection {
  features: readonly {
    properties: { name: string; gt: boolean };
    geometry: { type: string; coordinates: readonly Ring[] | readonly (readonly Ring[])[] };
  }[];
}

export interface Projection {
  width: number;
  height: number;
  project: (lon: number, lat: number) => Point;
}

export interface ProjectedFeature {
  name: string;
  isHome: boolean;
  path: string;
}

const round = (value: number): number => Math.round(value * 10) / 10;

// Equirectangular, narrowing the longitude by the cosine of the middle latitude so the shape
// keeps its proportions.
export function createProjection(bounds: GeoBounds, width: number): Projection {
  const { west, east, south, north } = bounds;
  const middle = ((south + north) / 2) * (Math.PI / 180);
  const height = ((north - south) / ((east - west) * Math.cos(middle))) * width;
  return {
    width,
    height,
    project: (lon, lat) => [
      ((lon - west) / (east - west)) * width,
      ((north - lat) / (north - south)) * height,
    ],
  };
}

export function projectGeoJson(
  collection: FeatureCollection,
  bounds: GeoBounds,
  width: number,
): Projection & { features: ProjectedFeature[] } {
  const projection = createProjection(bounds, width);
  const ringPath = (ring: Ring): string =>
    ring
      .map(([lon, lat], index) => {
        const [x, y] = projection.project(lon, lat);
        return `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
      })
      .join('') + 'Z';

  const features = collection.features.map(({ properties, geometry }) => {
    const polygons = (
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    ) as readonly (readonly Ring[])[];
    return {
      name: properties.name,
      isHome: properties.gt,
      path: polygons.flatMap((rings) => rings.map(ringPath)).join(''),
    };
  });
  return { ...projection, features };
}

// A quadratic curve bowed to one side of the straight line by `bend` times its length.
export function curvePath([ax, ay]: Point, [bx, by]: Point, bend = 0.22): string {
  const controlX = (ax + bx) / 2 - (by - ay) * bend;
  const controlY = (ay + by) / 2 + (bx - ax) * bend;
  return `M${round(ax)} ${round(ay)}Q${round(controlX)} ${round(controlY)} ${round(bx)} ${round(by)}`;
}
