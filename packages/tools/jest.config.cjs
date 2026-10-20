const base = require('@debus/config/jest');

module.exports = {
  ...base,
  collectCoverageFrom: [...base.collectCoverageFrom, '!src/**/testing/**'],
  // The cli.ts files only read the environment and call functions that have their own tests.
  coveragePathIgnorePatterns: ['/node_modules/', '/cli\\.ts$'],
};
