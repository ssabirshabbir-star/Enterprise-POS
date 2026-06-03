const { getPool } = require('../../database/connection');

async function createActivityLog({ userId = null, action, status, message = null, metadata = {} }) {
  await getPool().query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [userId, action, status, message, JSON.stringify(metadata)]
  );
}

module.exports = {
  createActivityLog
};
