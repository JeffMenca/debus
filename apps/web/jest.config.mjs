import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: '<rootDir>/jest.environment.mjs',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/'],
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
  coverageThreshold: { global: { statements: 85, branches: 85, functions: 85, lines: 85 } },
};

export default createJestConfig(config);
