// Integration/e2e preset: runs test/**/*.e2e-spec.ts against the real app (65% threshold).
const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  rootDir: process.cwd(),
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  coverageDirectory: 'coverage-integration',
  coverageThreshold: { global: { statements: 65, branches: 65, functions: 65, lines: 65 } },
  setupFiles: [require.resolve('./jest.integration-env.cjs')],
  testTimeout: 60000,
  passWithNoTests: false,
};
