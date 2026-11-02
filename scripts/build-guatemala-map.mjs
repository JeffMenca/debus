#!/usr/bin/env node
// Regenerates apps/web/lib/geo/guatemala.json from Natural Earth (public domain): the 22 departments
// of Guatemala plus the neighbours, simplified together so that their borders keep touching.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const NEIGHBOURS = {
  MEX: 'México',
  BLZ: 'Belice',
  HND: 'Honduras',
  SLV: 'El Salvador',
};
// Natural Earth writes it with an s; the rest of the system uses the official name.
const OFFICIAL_NAMES = { Quezaltenango: 'Quetzaltenango' };

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/web/lib/geo/guatemala.json',
);
const work = mkdtempSync(join(tmpdir(), 'guatemala-map-'));

const download = async (file) => {
  const response = await fetch(`${BASE}/${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response.json();
};
const mapshaper = (...args) =>
  execFileSync('npx', ['--yes', 'mapshaper@0.6.113', ...args], { cwd: work, stdio: 'inherit' });
const writeLayer = (file, features, nameOf, gt) =>
  writeFileSync(
    join(work, file),
    JSON.stringify({
      type: 'FeatureCollection',
      features: features.map(({ geometry, properties }) => ({
        type: 'Feature',
        geometry,
        properties: { name: nameOf(properties), gt },
      })),
    }),
  );

try {
  const [departments, countries] = await Promise.all([
    download('ne_10m_admin_1_states_provinces.geojson'),
    download('ne_10m_admin_0_countries.geojson'),
  ]);
  writeLayer(
    'gt.geojson',
    departments.features.filter(({ properties }) => properties.adm0_a3 === 'GTM'),
    ({ name }) => OFFICIAL_NAMES[name] ?? name,
    true,
  );
  writeLayer(
    'countries.geojson',
    countries.features.filter(({ properties }) => properties.ADM0_A3 in NEIGHBOURS),
    ({ ADM0_A3 }) => NEIGHBOURS[ADM0_A3],
    false,
  );
  mapshaper('countries.geojson', '-clip', 'bbox=-93.5,12.8,-87.2,18.7', '-o', 'neighbours.geojson');
  mapshaper(
    '-i',
    'gt.geojson',
    'neighbours.geojson',
    'combine-files',
    '-merge-layers',
    'force',
    '-simplify',
    '12%',
    'keep-shapes',
    '-o',
    'precision=0.001',
    'format=geojson',
    'guatemala.json',
  );
  writeFileSync(output, readFileSync(join(work, 'guatemala.json')));
  execFileSync('pnpm', ['exec', 'prettier', '--write', output], { stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
