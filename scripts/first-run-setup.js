const bcrypt = require('bcryptjs');
const { loadEnvironment } = require('../src/main/config/env');
const { getPool, closeDatabase, withTransaction } = require('../src/main/database/connection');
const { initializeDatabase } = require('../src/main/database/schema');

async function run() {
  loadEnvironment();
  await initializeDatabase();
  const users = await getPool().query('SELECT COUNT(*)::int AS count FROM users');
  if (users.rows[0].count > 0) {
    console.log('First-run setup skipped: users already exist.');
    return;
  }

  const username = String(process.env.SEED_ADMIN_USERNAME || '').trim().toLowerCase();
  const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SEED_ADMIN_PASSWORD || '');
  const fullName = process.env.SEED_ADMIN_NAME || 'System Administrator';
  if (!username || !email || password.length < 8) {
    throw new Error('Set SEED_ADMIN_USERNAME, SEED_ADMIN_EMAIL, and a strong SEED_ADMIN_PASSWORD before first-run setup.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await withTransaction(async (client) => {
    const role = await client.query("SELECT id FROM roles WHERE name = 'Admin' LIMIT 1");
    if (!role.rows[0]) throw new Error('Admin role is missing.');
    await client.query(
      `
        INSERT INTO users (username, email, full_name, password_hash, role_id, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
      `,
      [username, email, fullName, passwordHash, role.rows[0].id]
    );
    await client.query(
      "INSERT INTO activity_logs (action, status, message, metadata) VALUES ('first_run.admin', 'success', 'First admin created', $1::jsonb)",
      [JSON.stringify({ username, email })]
    );
  });
  console.log(`First admin created: ${username}`);
}

run()
  .catch((error) => {
    console.error(`First-run setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
