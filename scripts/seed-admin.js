const bcrypt = require('bcryptjs');
const { loadEnvironment } = require('../src/main/config/env');
const { getPool, closeDatabase, withTransaction } = require('../src/main/database/connection');
const { initializeDatabase } = require('../src/main/database/schema');

loadEnvironment();

async function seedAdmin() {
  await initializeDatabase();

  const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const username = String(process.env.SEED_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const fullName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  if (!username || !email || !password) {
    throw new Error('SEED_ADMIN_USERNAME, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD are required in .env');
  }
  const passwordHash = await bcrypt.hash(password, 12);

  await withTransaction(async (client) => {
    const roleResult = await client.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', ['Admin']);
    const roleId = roleResult.rows[0]?.id;

    if (!roleId) {
      throw new Error('Admin role does not exist. Run schema initialization first.');
    }

    const updateResult = await client.query(
      `
        UPDATE users
        SET
          email = $2,
          full_name = $3,
          password_hash = $4,
          role_id = $5,
          is_active = TRUE,
          failed_login_attempts = 0,
          updated_at = NOW()
        WHERE LOWER(username) = LOWER($1)
      `,
      [username, email, fullName, passwordHash, roleId]
    );

    if (updateResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO users (username, email, full_name, password_hash, role_id, is_active, updated_at)
          VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
        `,
        [username, email, fullName, passwordHash, roleId]
      );
    }

    await client.query(
      `
        INSERT INTO activity_logs (action, status, message, metadata)
        VALUES ('seed.admin', 'success', 'Default admin user seeded', $1::jsonb)
      `,
      [JSON.stringify({ username, email })]
    );
  });

  console.log(`Admin username seeded: ${username}`);
  console.log(`Admin email: ${email}`);
  console.log(`Admin password: ${password}`);
}

seedAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
