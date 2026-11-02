import { GUATEMALA_DEPARTMENTS } from '@debus/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPARTMENT_LABELS, departmentAt } from './departments';
import guatemala from './guatemala.json';

it('has the 22 departments with their official names', () => {
  const names = guatemala.features.filter((f) => f.properties.gt).map((f) => f.properties.name);
  expect([...names].sort()).toEqual([...GUATEMALA_DEPARTMENTS].sort());
});

it('stays small enough for the public page', () => {
  expect(readFileSync(join(__dirname, 'guatemala.json')).length).toBeLessThan(40_000);
});

it.each([
  [14.83, -91.63, 'Quetzaltenango'],
  [14.64, -90.47, 'Guatemala'],
  [17.02, -89.92, 'Petén'],
])('finds the department at %f, %f', (lat, lon, name) => {
  expect(departmentAt(lat, lon)).toBe(name);
});

it('returns null in the ocean or a neighbor', () => {
  expect(departmentAt(13.75, -91.5)).toBeNull();
  expect(departmentAt(17.5, -88.5)).toBeNull();
});

it('has one label per department, inside it', () => {
  expect(DEPARTMENT_LABELS).toHaveLength(22);
  for (const { name, latitude, longitude } of DEPARTMENT_LABELS) {
    expect(departmentAt(latitude, longitude)).toBe(name);
  }
});

it('no two labels touch at the smallest scale we draw', () => {
  const pxPerDegree = 67;
  const charWidth = 5.6;
  const height = 11;
  for (const [i, a] of DEPARTMENT_LABELS.entries()) {
    for (const b of DEPARTMENT_LABELS.slice(i + 1)) {
      const dx = Math.abs(a.longitude - b.longitude) * pxPerDegree;
      const dy = Math.abs(a.latitude - b.latitude) * pxPerDegree * 1.03;
      const width = ((a.short.length + b.short.length) / 2) * charWidth;
      expect(dx < width && dy < height).toBe(false);
    }
  }
});
