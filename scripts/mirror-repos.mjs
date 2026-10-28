#!/usr/bin/env node
// Builds one read-only mirror repository per deployable unit (gateway, services, web) from the monorepo,
// keeping the history of the paths each unit needs. The monorepo stays the source of truth.
//
//   node scripts/mirror-repos.mjs [--unit <name|all>] [--ref main] [--out <dir>] [--push]
//
// Without --push it only builds the mirrors in <out> (default: a temporary directory) and checks them.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverUnits,
  findForbidden,
  mirrorPaths,
  renderCi,
  renderReadme,
  renderRootPackage,
  renderWorkspaceYaml,
  repoName,
  repoSlug,
  workspaceDirs,
} from './lib/mirror.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = /(^|\/)\.env(\..+)?$/;

function parseArgs(argv) {
  const args = { unit: 'all', ref: 'main', out: join(tmpdir(), 'sa-debus-mirrors'), push: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--push') args.push = true;
    else if (arg === '--unit') args.unit = argv[++i];
    else if (arg === '--ref') args.ref = argv[++i];
    else if (arg === '--out') args.out = resolve(argv[++i]);
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

const git = (cwd, ...args) => run('git', args, { cwd });

function listPackages(cwd) {
  const found = [];
  for (const group of ['apps', 'services', 'packages']) {
    const base = join(cwd, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const file = join(base, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(file)) {
        found.push({ dir: `${group}/${entry.name}`, json: JSON.parse(readFileSync(file, 'utf8')) });
      }
    }
  }
  return found;
}

function monorepoUrl() {
  const remote = git(ROOT, 'remote', 'get-url', 'origin');
  const match = /github\.com[:/](.+?)(\.git)?$/.exec(remote);
  return match ? `https://github.com/${match[1]}` : remote;
}

function assertClean(dir, unit) {
  const problems = [];
  const files = git(dir, 'ls-files').split('\n');
  const names = new Set(
    git(dir, 'log', '--all', '--name-only', '--format=').split('\n').filter(Boolean),
  );
  for (const name of [...files, ...names]) {
    if (ENV_FILE.test(name) && !name.endsWith('.env.example'))
      problems.push(`env file in history: ${name}`);
  }
  const messages = git(dir, 'log', '--all', '--format=%an %ae%n%B');
  const badMessage = findForbidden(messages);
  if (badMessage) problems.push(`forbidden term in commit messages: ${badMessage}`);
  for (const file of files) {
    const abs = join(dir, file);
    if (file === 'pnpm-lock.yaml' || !existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    const bad = findForbidden(file) ?? findForbidden(text);
    if (bad) problems.push(`forbidden term in ${file}: ${bad}`);
  }
  if (problems.length)
    throw new Error(`Mirror ${repoName(unit)} is not clean:\n  ${problems.join('\n  ')}`);
}

function buildMirror(unit, packages, { ref, out }, url) {
  const dir = join(out, repoName(unit));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  run('git', ['clone', '--quiet', '--no-local', '--single-branch', '--branch', ref, ROOT, dir]);

  const sha = git(dir, 'rev-parse', '--short', 'HEAD');
  const originalWorkspace = git(dir, 'show', 'HEAD:pnpm-workspace.yaml');
  const originalLock = git(dir, 'show', 'HEAD:pnpm-lock.yaml');
  const rootPackage = JSON.parse(git(dir, 'show', 'HEAD:package.json'));
  const hasDocs = git(dir, 'ls-tree', '--name-only', 'HEAD', 'docs/')
    .split('\n')
    .includes(`docs/${unit.name}`);

  const filterArgs = ['filter-repo', '--force', '--quiet'];
  for (const path of mirrorPaths(unit, packages, { hasDocs })) filterArgs.push('--path', path);
  git(dir, ...filterArgs);
  git(dir, 'branch', '-M', 'main');

  const dirs = workspaceDirs(unit, packages);
  const present = new Set(
    packages.filter((pkg) => dirs.includes(pkg.dir)).map((pkg) => pkg.json.name),
  );
  const write = (name, content) => writeFileSync(join(dir, name), content);

  write('pnpm-workspace.yaml', renderWorkspaceYaml(originalWorkspace, dirs));
  write(
    'package.json',
    `${JSON.stringify(renderRootPackage(rootPackage, unit, present), null, 2)}\n`,
  );
  write('pnpm-lock.yaml', `${originalLock}\n`);
  write(
    'README.md',
    renderReadme(unit, { sha, repoUrl: `https://github.com/${repoSlug(unit)}`, monorepoUrl: url }),
  );
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  write('.github/workflows/ci.yml', renderCi());

  // Keeps the versions already locked in the monorepo and drops the importers that are not in this mirror.
  run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], { cwd: dir });

  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '--no-verify', '-m', `chore: sync from monorepo ${sha}`);
  assertClean(dir, unit);
  return { dir, sha };
}

function push(unit, dir) {
  const slug = repoSlug(unit);
  let exists = true;
  try {
    run('gh', ['repo', 'view', slug, '--json', 'name']);
  } catch {
    exists = false;
  }
  if (!exists)
    run('gh', [
      'repo',
      'create',
      slug,
      '--private',
      '--description',
      `Read-only mirror of ${unit.dir} from the debus monorepo`,
    ]);
  const url = `git@github.com:${slug}.git`;
  const remotes = git(dir, 'remote');
  if (remotes.split('\n').includes('origin')) git(dir, 'remote', 'set-url', 'origin', url);
  else git(dir, 'remote', 'add', 'origin', url);
  try {
    git(dir, 'fetch', '--quiet', 'origin', 'main');
  } catch {
    // The repository is empty on the first push.
  }
  git(dir, 'push', '--force-with-lease=main', 'origin', 'main:main');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = listPackages(ROOT);
  const units = discoverUnits(packages);
  const selected = args.unit === 'all' ? units : units.filter((unit) => unit.name === args.unit);
  if (!selected.length)
    throw new Error(`Unknown unit ${args.unit}. Units: ${units.map((u) => u.name).join(', ')}`);

  const url = monorepoUrl();
  for (const unit of selected) {
    const { dir, sha } = buildMirror(unit, packages, args, url);
    const commits = git(dir, 'rev-list', '--count', 'HEAD');
    console.log(`${repoName(unit)}: ${commits} commits from ${args.ref}@${sha} -> ${dir}`);
    if (args.push) {
      push(unit, dir);
      console.log(`${repoName(unit)}: pushed to ${repoSlug(unit)}`);
    }
  }
}

main();
