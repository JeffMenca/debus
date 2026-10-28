import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  discoverUnits,
  findForbidden,
  mirrorPaths,
  neededPackageDirs,
  renderReadme,
  renderRootPackage,
  renderWorkspaceYaml,
  repoName,
  repoSlug,
  workspaceDirs,
} from './mirror.mjs';

const pkg = (dir, name, deps = {}) => ({ dir, json: { name, dependencies: deps } });
const packages = [
  pkg('services/flota', '@debus/flota', {
    '@debus/messaging': 'workspace:^',
    '@debus/config': 'workspace:*',
  }),
  pkg('apps/web', '@debus/web', { '@debus/contracts': 'workspace:*' }),
  pkg('packages/config', '@debus/config'),
  pkg('packages/contracts', '@debus/contracts', { '@debus/config': 'workspace:*' }),
  pkg('packages/messaging', '@debus/messaging', {
    '@debus/contracts': 'workspace:^',
    '@debus/server': 'workspace:^',
  }),
  pkg('packages/server', '@debus/server', { '@debus/contracts': 'workspace:^' }),
];

test('units are the services and the apps, not the packages', () => {
  const units = discoverUnits(packages);
  assert.deepEqual(
    units.map((unit) => unit.name),
    ['flota', 'web'],
  );
  assert.equal(repoName(units[0]), 'sa-debus-flota');
  assert.equal(repoSlug(units[1]), 'rrobertobt/sa-debus-web');
});

test('a unit needs its workspace packages transitively, without itself', () => {
  const [flota, web] = discoverUnits(packages);
  assert.deepEqual(neededPackageDirs(flota, packages), [
    'packages/config',
    'packages/contracts',
    'packages/messaging',
    'packages/server',
  ]);
  assert.deepEqual(neededPackageDirs(web, packages), ['packages/config', 'packages/contracts']);
  assert.deepEqual(workspaceDirs(web, packages), [
    'apps/web',
    'packages/config',
    'packages/contracts',
  ]);
});

test('a missing workspace package is an error', () => {
  const [flota] = discoverUnits(packages);
  assert.throws(() => neededPackageDirs(flota, packages.slice(0, 2)), /not found/);
});

test('mirror paths pick the dockerfile of the unit and its docs when they exist', () => {
  const [flota, web] = discoverUnits(packages);
  const service = mirrorPaths(flota, packages, { hasDocs: true });
  assert.ok(service.includes('infra/docker/service.Dockerfile'));
  assert.ok(service.includes('docs/flota'));
  const app = mirrorPaths(web, packages, { hasDocs: false });
  assert.ok(app.includes('infra/docker/web.Dockerfile'));
  assert.ok(!app.some((path) => path.startsWith('docs/')));
});

test('the workspace file keeps everything but the package list', () => {
  const original = 'packages:\n  - apps/*\n  - services/*\n\nonlyBuiltDependencies:\n  - esbuild\n';
  assert.equal(
    renderWorkspaceYaml(original, ['services/flota', 'packages/config']),
    'packages:\n  - services/flota\n  - packages/config\n\nonlyBuiltDependencies:\n  - esbuild\n',
  );
});

test('the root package drops hooks, other scripts and workspace packages that are not in the mirror', () => {
  const root = {
    packageManager: 'pnpm@10',
    engines: { node: '>=22' },
    scripts: {
      build: 'turbo run build',
      test: 'turbo run test',
      prepare: 'husky',
      local: 'node x',
    },
    devDependencies: {
      '@debus/config': 'workspace:*',
      '@debus/messaging': 'workspace:*',
      '@commitlint/cli': '^21',
      husky: '^9',
      eslint: '^10',
    },
  };
  const [, web] = discoverUnits(packages);
  const result = renderRootPackage(root, web, new Set(['@debus/config']));
  assert.equal(result.name, 'sa-debus-web');
  assert.deepEqual(Object.keys(result.devDependencies), ['@debus/config', 'eslint']);
  assert.equal(result.scripts.build, 'turbo run build');
  assert.ok(!('prepare' in result.scripts) && !('local' in result.scripts));
});

test('forbidden terms are found in any case and clean text passes', () => {
  const term = ['Cl', 'aude'].join('');
  assert.equal(findForbidden(`co-authored by ${term}`), term);
  assert.equal(
    findForbidden(`${['.', 'cl', 'aude'].join('')}/plans`)?.toLowerCase(),
    term.toLowerCase(),
  );
  assert.equal(findForbidden('feat(flota): add buses'), null);
});

test('the readme says it is a read-only mirror and names the source', () => {
  const [flota] = discoverUnits(packages);
  const readme = renderReadme(flota, {
    sha: 'abc1234',
    repoUrl: 'https://x/y',
    monorepoUrl: 'https://x/mono',
  });
  assert.match(readme, /solo lectura/);
  assert.match(readme, /abc1234/);
  assert.match(readme, /https:\/\/x\/mono/);
  assert.match(readme, /docs\/flota\/README\.md/);
});
