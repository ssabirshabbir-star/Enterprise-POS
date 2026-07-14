const { getPool } = require('../../database/connection');

async function createActivityLog({
  userId = null,
  action,
  status,
  message = null,
  metadata = {},
  client = null,
}) {
  const db = client || getPool();
  const result = await db.query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
    `,
    [userId, action, status, message, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

module.exports = {
  createActivityLog,
};
