import type { GuatemalaDepartment } from '@debus/contracts';
import guatemala from './guatemala.json';

export interface DepartmentLabel {
  name: GuatemalaDepartment;
  short: string;
  latitude: number;
  longitude: number;
}

// Readable short names on a point inside each department; the ISO codes (QZ) say nothing on a map.
export const DEPARTMENT_LABELS: readonly DepartmentLabel[] = [
  { name: 'Alta Verapaz', short: 'A. Ver', latitude: 15.65, longitude: -90.15 },
  { name: 'Baja Verapaz', short: 'B. Ver', latitude: 15.08, longitude: -90.43 },
  { name: 'Chimaltenango', short: 'Chim', latitude: 14.74, longitude: -90.93 },
  { name: 'Chiquimula', short: 'Chiq', latitude: 14.7, longitude: -89.4 },
  { name: 'El Progreso', short: 'Prog', latitude: 14.92, longitude: -90.07 },
  { name: 'Escuintla', short: 'Esc', latitude: 14.16, longitude: -90.92 },
  { name: 'Guatemala', short: 'Guat', latitude: 14.76, longitude: -90.47 },
  { name: 'Huehuetenango', short: 'Hue', latitude: 15.68, longitude: -91.6 },
  { name: 'Izabal', short: 'Iza', latitude: 15.55, longitude: -89.03 },
  { name: 'Jalapa', short: 'Jal', latitude: 14.65, longitude: -89.92 },
  { name: 'Jutiapa', short: 'Jut', latitude: 14.28, longitude: -89.89 },
  { name: 'Petén', short: 'Pet', latitude: 17.02, longitude: -89.92 },
  { name: 'Quetzaltenango', short: 'Quet', latitude: 14.82, longitude: -91.67 },
  { name: 'Quiché', short: 'Qui', latitude: 15.48, longitude: -90.96 },
  { name: 'Retalhuleu', short: 'Reu', latitude: 14.4, longitude: -91.76 },
  { name: 'Sacatepéquez', short: 'Sac', latitude: 14.47, longitude: -90.76 },
  { name: 'San Marcos', short: 'S. Mar', latitude: 15.01, longitude: -91.9 },
  { name: 'Santa Rosa', short: 'S. Ros', latitude: 14.17, longitude: -90.33 },
  { name: 'Sololá', short: 'Sol', latitude: 14.73, longitude: -91.23 },
  { name: 'Suchitepéquez', short: 'Such', latitude: 14.47, longitude: -91.41 },
  { name: 'Totonicapán', short: 'Toto', latitude: 15.03, longitude: -91.39 },
  { name: 'Zacapa', short: 'Zac', latitude: 15.03, longitude: -89.56 },
];

type Ring = readonly (readonly number[])[];

// Even-odd rule: a ray from the point crosses the edge of the shape an odd number of times.
function ringHolds(ring: Ring, longitude: number, latitude: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    const crosses =
      yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function departmentAt(latitude: number, longitude: number): GuatemalaDepartment | null {
  for (const { properties, geometry } of guatemala.features) {
    if (!properties.gt) continue;
    const polygons = (
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    ) as readonly (readonly Ring[])[];
    const holds = polygons.some((rings) =>
      rings.reduce((inside, ring) => inside !== ringHolds(ring, longitude, latitude), false),
    );
    if (holds) return properties.name as GuatemalaDepartment;
  }
  return null;
}
