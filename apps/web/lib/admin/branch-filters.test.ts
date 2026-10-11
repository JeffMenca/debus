import type { Branch } from '@debus/contracts';
import { countBranchesByTab, filterBranches } from './branch-filters';

const branch = (code: string, name: string, department: string, active = true): Branch =>
  ({
    id: code,
    code,
    name,
    department,
    municipality: name,
    address: 'Calle 1',
    phone: '77612233',
    latitude: 14.6,
    longitude: -90.5,
    active,
    version: 1,
    admins: [],
  }) as Branch;

const branches = [
  branch('XEL', 'Quetzaltenango', 'Quetzaltenango'),
  branch('FLO', 'Flores', 'Petén'),
  branch('ESC', 'Escuintla', 'Escuintla', false),
];

describe('filterBranches', () => {
  it('filters by tab', () => {
    expect(filterBranches(branches, 'active', '').map((b) => b.code)).toEqual(['XEL', 'FLO']);
    expect(filterBranches(branches, 'inactive', '').map((b) => b.code)).toEqual(['ESC']);
    expect(filterBranches(branches, 'all', '')).toHaveLength(3);
  });

  it('searches name, code, municipality and department without accents', () => {
    expect(filterBranches(branches, 'all', 'xel').map((b) => b.code)).toEqual(['XEL']);
    expect(filterBranches(branches, 'all', 'peten').map((b) => b.code)).toEqual(['FLO']);
    expect(filterBranches(branches, 'all', 'ESCUIN').map((b) => b.code)).toEqual(['ESC']);
    expect(filterBranches(branches, 'all', 'zzz')).toEqual([]);
  });

  it('counts each tab', () => {
    expect(countBranchesByTab(branches)).toEqual({ active: 2, inactive: 1, all: 3 });
  });
});
