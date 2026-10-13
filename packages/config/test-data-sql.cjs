// The SQL that removes test data from the local databases (scripts/clean-test-data.mjs runs it with
// psql). It lives here so integration tests can run the very same statements.
const { TEST_BRANCH_PREFIX, TEST_EMAIL_DOMAIN } = require('./test-data.cjs');

const RUN = /^[0-9a-f]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const exists = (table) => `to_regclass('public.${table}') IS NOT NULL`;
const whenTablesExist = (tables, sql) =>
  `DO $$ BEGIN IF ${tables.map(exists).join(' AND ')} THEN ${sql}; END IF; END $$;`;
// For a database that has `table` but not `missing`.
const whenTableExistsWithout = (table, missing, sql) =>
  `DO $$ BEGIN IF ${exists(table)} AND NOT (${exists(missing)}) THEN ${sql}; END IF; END $$;`;

function checkRun(run) {
  if (run != null && !RUN.test(run))
    throw new Error('run must be the 8 hex characters of a TEST_RUN');
}

const patterns = (run) => ({
  emails: run ? `'%-${run}-%@${TEST_EMAIL_DOMAIN}'` : `'%@${TEST_EMAIL_DOMAIN}'`,
  branches: `'${TEST_BRANCH_PREFIX}${run ?? ''}%'`,
});

function cleanupStatements({ run = null, settingsVersionIds = null } = {}) {
  checkRun(run);
  const { emails, branches } = patterns(run);
  const testUsers = `SELECT id FROM users WHERE email LIKE ${emails}`;
  // Users are never deleted by the product, so a version without an author comes from a test that
  // already cleaned its accounts. Only a whole-database cleanup removes those. Every column is
  // prefixed: users also has a created_by_id, and an unprefixed name inside the subquery would
  // resolve to it and match every version.
  const authors = run
    ? `s.created_by_id IN (${testUsers})`
    : `s.created_by_id IN (${testUsers}) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.created_by_id)`;
  // Settings versions are immutable history, so the trigger is off only while the rows go.
  const deleteVersions = [
    'ALTER TABLE settings_versions DISABLE TRIGGER settings_versions_immutable',
    `DELETE FROM settings_versions s WHERE ${authors}`,
    'ALTER TABLE settings_versions ENABLE TRIGGER settings_versions_immutable',
  ].join('; ');

  const testBranches = `SELECT id FROM branches WHERE name LIKE ${branches}`;
  const inTestBranches = (table, column = 'branch_id') =>
    whenTablesExist(
      [table, 'branches'],
      `DELETE FROM ${table} WHERE ${column} IN (${testBranches})`,
    );
  // flota and viajes rows point at the branch copies, so they go first.
  const fleetAndTrips = [
    whenTablesExist(
      ['trip_copies', 'buses', 'branches'],
      `DELETE FROM trip_copies WHERE bus_id IN (SELECT id FROM buses WHERE branch_id IN (${testBranches}))`,
    ),
    whenTablesExist(
      ['trip_copies', 'drivers', 'branches'],
      `DELETE FROM trip_copies WHERE driver_id IN (SELECT id FROM drivers WHERE branch_id IN (${testBranches}))`,
    ),
    whenTablesExist(
      ['buses', 'branches'],
      `UPDATE buses SET assigned_driver_id = NULL WHERE branch_id IN (${testBranches})`,
    ),
    inTestBranches('buses'),
    inTestBranches('drivers'),
    inTestBranches('routes', 'origin_branch_id'),
    inTestBranches('routes', 'destination_branch_id'),
    inTestBranches('trips'),
    inTestBranches('bus_copies'),
    inTestBranches('driver_copies'),
    inTestBranches('route_copies', 'origin_branch_id'),
    inTestBranches('route_copies', 'destination_branch_id'),
  ];

  return [
    whenTablesExist(['settings_versions', 'users'], deleteVersions),
    whenTablesExist(
      ['refresh_tokens', 'users'],
      `DELETE FROM refresh_tokens WHERE user_id IN (${testUsers})`,
    ),
    whenTablesExist(
      ['account_links', 'users'],
      `DELETE FROM account_links WHERE user_id IN (${testUsers})`,
    ),
    whenTablesExist(['users'], `DELETE FROM users WHERE email LIKE ${emails}`),
    whenTablesExist(['sent_emails'], `DELETE FROM sent_emails WHERE recipient LIKE ${emails}`),
    ...fleetAndTrips,
    // A test branch goes unless accounts that are not test data belong to it.
    whenTablesExist(
      ['branches', 'users'],
      `DELETE FROM branches b WHERE b.name LIKE ${branches} AND NOT EXISTS (SELECT 1 FROM users u WHERE u.branch_id = b.id)`,
    ),
    // Services that keep a copy of the branches have no accounts, so every test branch goes.
    whenTableExistsWithout('branches', 'users', `DELETE FROM branches WHERE name LIKE ${branches}`),
    ...copiesStatements(settingsVersionIds),
  ];
}

// A service that only keeps copies of the settings (viajes) receives them by event, after the
// source version may be gone: it keeps the copies whose id still exists in administracion.
function copiesStatements(settingsVersionIds) {
  if (settingsVersionIds == null) return [];
  for (const id of settingsVersionIds) {
    if (!UUID.test(id)) throw new Error(`${id} is not a UUID`);
  }
  const alive = settingsVersionIds.map((id) => `'${id}'::uuid`).join(', ');
  const where = settingsVersionIds.length > 0 ? ` WHERE id NOT IN (${alive})` : '';
  return [
    whenTableExistsWithout('settings_versions', 'users', `DELETE FROM settings_versions${where}`),
  ];
}

function keptBranchesQuery(run = null) {
  checkRun(run);
  return `SELECT name FROM branches WHERE name LIKE ${patterns(run).branches}`;
}

// The keys of the photos that the buses and drivers of the test branches point at. Only a database
// with `buses` and `drivers` (flota) can run it; the objects must go from the bucket before the rows do.
function photoKeysQuery(run = null) {
  checkRun(run);
  const testBranches = `SELECT id FROM branches WHERE name LIKE ${patterns(run).branches}`;
  const keysOf = (table) =>
    `SELECT photo_key FROM ${table} WHERE photo_key IS NOT NULL AND branch_id IN (${testBranches})`;
  return `${keysOf('buses')} UNION ${keysOf('drivers')}`;
}

module.exports = { cleanupStatements, keptBranchesQuery, photoKeysQuery, whenTablesExist };
