// Unit-test preset: the 85% coverage threshold is part of the contract.
// Workers are capped because turbo already runs one jest per package in parallel, and each
// ts-jest worker holds a full type-checking program (~450 MB): uncapped, a single service took 4.4 GB.
module.exports = {
  preset: 'ts-jest',
  maxWorkers: 2,
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/generated/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { statements: 85, branches: 85, functions: 85, lines: 85 } },
  passWithNoTests: true,
};
