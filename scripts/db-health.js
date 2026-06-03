const { loadEnvironment } = require('../src/main/config/env');
const { getPool, closeDatabase } = require('../src/main/database/connection');

async function run() {
  loadEnvironment();
  const pool = getPool();
  const result = await pool.query('SELECT NOW() AS server_time, current_database() AS database_name');
  console.log(`Database OK: ${result.rows[0].database_name} at ${result.rows[0].server_time.toISOString()}`);
}

run()
  .catch((error) => {
    if (error.code === 'ECONNREFUSED') console.error('Database health failed: PostgreSQL is not running or is unreachable.');
    else if (error.code === '28P01') console.error('Database health failed: invalid PostgreSQL username/password.');
    else if (error.code === '3D000') console.error('Database health failed: database does not exist.');
    else console.error(`Database health failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
