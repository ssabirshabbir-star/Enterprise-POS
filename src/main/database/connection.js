const { Pool } = require('pg');
const { getDatabaseConfig } = require('../config/env');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
  }

  return pool;
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  closeDatabase,
  getPool,
  withTransaction
};
