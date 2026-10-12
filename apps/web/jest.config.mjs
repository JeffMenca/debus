import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: '<rootDir>/jest.environment.mjs',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/'],
  // Turbo runs every task of the repo at once, so a form test that takes 1 s alone can take 20 s
  // on a busy machine: the timeout is generous on purpose and Jest leaves half the cores free.
  testTimeout: 30_000,
  maxWorkers: '50%',
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'proxy.ts',
    '!**/*.test.{ts,tsx}',
    '!app/layout.tsx',
    '!components/ui/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { statements: 85, branches: 85, functions: 85, lines: 85 } },
};

// next/jest ignores node_modules except a few Next packages. TanStack Table 9 ships ES modules
// only, so it is let through too (pnpm keeps each package under node_modules/.pnpm/<name>@<version>).
const TRANSFORMED_PACKAGES = String.raw`@tanstack|geist|next[\\/](?:dist|src)[\\/](?:client|shared[\\/]lib)`;
const NODE_MODULES_PATTERNS = [
  String.raw`/node_modules/(?!\.pnpm)(?!(?:${TRANSFORMED_PACKAGES})/)`,
  String.raw`/node_modules[\\/]\.pnpm[\\/](?!(?:@tanstack|geist|next\+(?:dist|src)\+(?:client|shared\+lib))[+@])(?!.*node_modules[\\/](?:${TRANSFORMED_PACKAGES})[\\/])`,
];

async function resolveConfig() {
  const resolved = await createJestConfig(config)();
  return {
    ...resolved,
    transformIgnorePatterns: [
      ...NODE_MODULES_PATTERNS,
      ...resolved.transformIgnorePatterns.filter((pattern) => !pattern.includes('node_modules')),
    ],
  };
}

export default resolveConfig;
