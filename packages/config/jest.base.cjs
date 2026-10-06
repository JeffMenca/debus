// Unit-test preset: the 85% coverage threshold is part of the contract.
module.exports = {
  preset: 'ts-jest',
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
  coverageThreshold: { global: { statements: 85, branches: 85, functions: 85, lines: 85 } },
  passWithNoTests: true,
};
