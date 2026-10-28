// Pure helpers for scripts/mirror-repos.mjs: which paths a unit needs and the files generated for its mirror.

export const OWNER = 'rrobertobt';
export const REPO_PREFIX = 'sa-debus-';

// Files from the repository root that every mirror keeps (with their history).
const ROOT_FILES = [
  'turbo.json',
  '.nvmrc',
  '.gitignore',
  '.dockerignore',
  '.prettierrc.mjs',
  '.prettierignore',
];

const KEPT_SCRIPTS = ['dev', 'build', 'lint', 'typecheck', 'test', 'format', 'format:check'];
const DROPPED_DEV_DEPENDENCIES = [/^husky$/, /^@commitlint\//];

// Names of the private tooling folder, the assistant and its files. Split so this file does not spell them out.
const FORBIDDEN_TERMS = [
  ['cl', 'aude'],
  ['anth', 'ropic'],
  ['AGENTS', '\\.md'],
].map((parts) => parts.join(''));
const FORBIDDEN = new RegExp(FORBIDDEN_TERMS.join('|'), 'i');

export function repoName(unit) {
  return `${REPO_PREFIX}${unit.name}`;
}

export function repoSlug(unit) {
  return `${OWNER}/${repoName(unit)}`;
}

/** Units are the deployables: the gateway, the services and the web app. */
export function discoverUnits(packages) {
  return packages
    .filter((pkg) => /^(services|apps)\//.test(pkg.dir))
    .map((pkg) => ({ name: pkg.dir.split('/')[1], dir: pkg.dir, packageName: pkg.json.name }));
}

function workspaceDependencies(pkg) {
  const all = { ...pkg.json.dependencies, ...pkg.json.devDependencies };
  return Object.entries(all)
    .filter(([, spec]) => String(spec).startsWith('workspace:'))
    .map(([name]) => name);
}

/** Directories of the workspace packages the unit needs, transitively, without the unit itself. */
export function neededPackageDirs(unit, packages) {
  const byName = new Map(packages.map((pkg) => [pkg.json.name, pkg]));
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const pkg = byName.get(name);
    if (!pkg) throw new Error(`Workspace package ${name} not found`);
    workspaceDependencies(pkg).forEach(visit);
  };
  visit(unit.packageName);
  seen.delete(unit.packageName);
  return [...seen].map((name) => byName.get(name).dir).sort();
}

export function mirrorPaths(unit, packages, { hasDocs }) {
  const dockerfile = unit.dir.startsWith('apps/') ? 'web.Dockerfile' : 'service.Dockerfile';
  return [
    unit.dir,
    ...neededPackageDirs(unit, packages),
    ...ROOT_FILES,
    `infra/docker/${dockerfile}`,
    ...(hasDocs ? [`docs/${unit.name}`] : []),
  ];
}

/** Workspace directories present in a mirror: the unit and the packages it needs. */
export function workspaceDirs(unit, packages) {
  return [unit.dir, ...neededPackageDirs(unit, packages)];
}

/** Replaces the `packages:` list of the root pnpm-workspace.yaml and keeps the rest as it is. */
export function renderWorkspaceYaml(original, dirs) {
  const rest = original.replace(/^packages:\n(?:[ \t]+- .*\n)+/m, '');
  return `packages:\n${dirs.map((dir) => `  - ${dir}`).join('\n')}\n${rest.startsWith('\n') ? '' : '\n'}${rest}`;
}

/** Root package.json of a mirror: no git hooks, only the scripts that work without the monorepo. */
export function renderRootPackage(root, unit, presentPackageNames) {
  const keep = (deps) =>
    Object.fromEntries(
      Object.entries(deps ?? {}).filter(([name, spec]) => {
        if (DROPPED_DEV_DEPENDENCIES.some((re) => re.test(name))) return false;
        return !String(spec).startsWith('workspace:') || presentPackageNames.has(name);
      }),
    );
  return {
    name: repoName(unit),
    private: true,
    packageManager: root.packageManager,
    engines: root.engines,
    scripts: Object.fromEntries(KEPT_SCRIPTS.map((key) => [key, root.scripts[key]])),
    devDependencies: keep(root.devDependencies),
  };
}

export function findForbidden(text) {
  const match = FORBIDDEN.exec(text);
  return match ? match[0] : null;
}

export function renderReadme(unit, { sha, repoUrl, monorepoUrl }) {
  const kind = unit.dir.startsWith('apps/') ? 'la aplicación web' : `el servicio \`${unit.name}\``;
  return `# ${repoName(unit)}

Espejo de solo lectura de ${kind} de **debus**, la plataforma de transporte extraurbano del proyecto final de Software Avanzado 2026.

- La fuente de verdad es el monorepo: ${monorepoUrl}
- Este repositorio se genera a partir de él (último origen: \`${sha}\`). No se aceptan PR ni commits directos; los cambios se hacen en el monorepo.
- El historial de \`${unit.dir}\`, de los paquetes compartidos que usa (\`packages/\`) y de los archivos de raíz se conserva tal cual. El último commit, \`chore: sync from monorepo\`, solo agrega los archivos generados (\`package.json\` de raíz, \`pnpm-workspace.yaml\`, \`pnpm-lock.yaml\`, este README y la integración continua) y se reemplaza en cada sincronización.
- El manual técnico está en \`docs/${unit.name}/README.md\` cuando existe.

## Compilar y probar

\`\`\`bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
\`\`\`

Las pruebas de integración y de extremo a extremo necesitan PostgreSQL, el emulador de Pub/Sub y el resto del sistema, así que se corren desde el monorepo (${monorepoUrl}).

Repositorio: ${repoUrl}
`;
}

export function renderCi() {
  return `name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test
`;
}
