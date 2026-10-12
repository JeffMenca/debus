// The suites of this service share one outbox: the outbox tests flush and clear it, and the others read
// the rows they wrote. Running the files one after another keeps them from stepping on each other.
module.exports = { ...require('@debus/config/jest-integration'), maxWorkers: 1 };
