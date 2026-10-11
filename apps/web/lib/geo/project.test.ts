import guatemala from './guatemala.json';
import { createProjection, curvePath, projectGeoJson, type FeatureCollection } from './project';

const BOUNDS = { west: -10, east: 10, south: 0, north: 10 };

describe('createProjection', () => {
  it('maps the corners of the bounds to the corners of the drawing', () => {
    const { project, width, height } = createProjection(BOUNDS, 400);

    expect(width).toBe(400);
    expect(project(-10, 10)).toEqual([0, 0]);
    expect(project(10, 0)).toEqual([400, height]);
  });

  it('keeps proportions: the height follows the bounds, narrowed by the latitude', () => {
    const { height } = createProjection(BOUNDS, 400);

    // 10 degrees of latitude against 20 of longitude shrunk by cos(5 degrees).
    expect(height).toBeCloseTo((10 / (20 * Math.cos((5 * Math.PI) / 180))) * 400, 5);
  });

  it('puts north above south and west left of east', () => {
    const { project } = createProjection(BOUNDS, 400);
    const [westX] = project(-5, 5);
    const [eastX] = project(5, 5);
    const [, northY] = project(0, 8);
    const [, southY] = project(0, 2);

    expect(westX).toBeLessThan(eastX);
    expect(northY).toBeLessThan(southY);
  });
});

describe('projectGeoJson', () => {
  const collection: FeatureCollection = {
    features: [
      {
        properties: { name: 'Home', gt: true },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-10, 10],
              [10, 10],
              [10, 0],
              [-10, 10],
            ],
          ],
        },
      },
      {
        properties: { name: 'Neighbor', gt: false },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-10, 10],
                [0, 10],
                [0, 5],
              ],
            ],
            [
              [
                [0, 0],
                [5, 0],
                [5, 5],
              ],
              [
                [1, 1],
                [2, 1],
                [2, 2],
              ],
            ],
          ],
        },
      },
    ],
  };

  it('turns every feature into a closed path and flags the home country', () => {
    const { features } = projectGeoJson(collection, BOUNDS, 400);

    expect(features.map(({ name, isHome }) => ({ name, isHome }))).toEqual([
      { name: 'Home', isHome: true },
      { name: 'Neighbor', isHome: false },
    ]);
    expect(features[0].path).toMatch(/^M0 0L400 0L400 [\d.]+L0 0Z$/);
  });

  it('joins the rings of a multipolygon and keeps its holes as sub-paths', () => {
    const { features } = projectGeoJson(collection, BOUNDS, 400);

    expect(features[1].path.match(/M/g)).toHaveLength(3);
    expect(features[1].path.match(/Z/g)).toHaveLength(3);
  });

  it('rounds coordinates to one decimal so the markup stays small', () => {
    const { features } = projectGeoJson(collection, BOUNDS, 333);

    expect(features[0].path).not.toMatch(/\.\d{2,}/);
  });

  it('exposes the projection used, for placing points on the same drawing', () => {
    const { project, width, height } = projectGeoJson(collection, BOUNDS, 400);

    expect(project(-10, 10)).toEqual([0, 0]);
    expect(project(10, 0)).toEqual([width, height]);
  });

  it('projects the bundled country outline into the drawing', () => {
    const bounds = { west: -92.25, east: -88.2, south: 13.7, north: 17.85 };
    const { features, width, height } = projectGeoJson(guatemala as FeatureCollection, bounds, 600);

    expect(features.filter((feature) => feature.isHome)).toHaveLength(1);
    expect(features.map((feature) => feature.name)).toEqual(
      expect.arrayContaining(['Guatemala', 'México', 'Belice', 'Honduras', 'El Salvador']),
    );
    expect(width).toBe(600);
    expect(height).toBeGreaterThan(500);
    expect(height).toBeLessThan(700);
  });
});

describe('curvePath', () => {
  it('is a quadratic curve that starts and ends on the given points', () => {
    expect(curvePath([0, 0], [100, 0])).toMatch(/^M0 0Q[\d.\-]+ [\d.\-]+ 100 0$/);
  });

  it('bows to one side of the straight line, by a share of its length', () => {
    const [, controlY] = /Q[\d.-]+ ([\d.-]+)/.exec(curvePath([0, 0], [100, 0], 0.2)) ?? [];

    expect(Number(controlY)).toBeCloseTo(20, 1);
  });

  it('bows the opposite way when the share is negative', () => {
    const [, controlY] = /Q[\d.-]+ ([\d.-]+)/.exec(curvePath([0, 0], [100, 0], -0.2)) ?? [];

    expect(Number(controlY)).toBeCloseTo(-20, 1);
  });
});
