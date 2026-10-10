const preset = require('@debus/config/jest-integration');

module.exports = {
  ...preset,
  // The log-capture helper is test support: its own unit test covers it.
  collectCoverageFrom: [...preset.collectCoverageFrom, '!src/testing/**'],
};
