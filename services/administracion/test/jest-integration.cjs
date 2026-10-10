const preset = require('@debus/config/jest-integration');

module.exports = {
  ...preset,
  // Every suite shares the one outbox table, and a flush publishes whatever is pending: run the files one at a time.
  maxWorkers: 1,
  // An emulator error must end the run with a failure, never leave Jest waiting on an open client.
  forceExit: true,
};
