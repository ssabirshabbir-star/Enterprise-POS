const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const { initializeDatabase } = require('../database/schema');
const { closeDatabase, getPool, withTransaction } = require('../database/connection');
const configStore = require('./installer-config.store');
const postgresPolicy = require('./postgres-version-policy');
const postgresProvisioning = require('./postgres-provisioning.service');

function sanitizeError(error) {
  return {
    code: error?.code || 'INSTALLER_DIAGNOSTIC_FAILED',
    message: String(error?.message || 'Installer diagnostic failed.').replace(
      /(password|pgpassword|database_url)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]'
    ),
  };
}

function parsePostgresMajor(versionText = '') {
  return postgresPolicy.parsePostgresVersion(versionText).major;
}

function poolConfig(input = {}, databaseOverride = null) {
  const cfg = configStore.normalizeDatabaseConfig(input);
  return {
    host: cfg.host,
    port: cfg.port,
    database: databaseOverride || cfg.database,
    user: cfg.username,
    password: String(input.password || ''),
    ssl: cfg.sslMode === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    max: 1,
  };
}

async function withPool(input, databaseOverride, callback) {
  const pool = new Pool(poolConfig(input, databaseOverride));
  try {
    return await callback(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function detectPostgres(input = {}) {
  try {
    return await withPool(input, input.database, async (pool) => {
      const result = await pool.query('SELECT version() AS version');
      const version = result.rows[0]?.version || 'unknown';
      const major = parsePostgresMajor(version);
      const compatibility = postgresPolicy.classifyPostgresVersion(version);
      return {
        ok: true,
        serviceDetected: true,
        version,
        major,
        supported: compatibility.existingInstallAllowed,
        compatibility,
      };
    });
  } catch (error) {
    return { ok: false, serviceDetected: false, ...sanitizeError(error) };
  }
}

async function databaseExists(input = {}) {
  try {
    return await withPool(input, 'postgres', async (pool) => {
      const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1', [
        input.database,
      ]);
      return { ok: true, exists: result.rowCount > 0 };
    });
  } catch (error) {
    return { ok: false, exists: false, ...sanitizeError(error) };
  }
}

async function createDatabaseIfMissing(input = {}) {
  const cfg = configStore.normalizeDatabaseConfig(input);
  const exists = await databaseExists({ ...input, ...cfg });
  if (!exists.ok) return exists;
  if (exists.exists) return { ok: true, created: false, message: 'Database already exists.' };
  const quoted = `"${cfg.database.replace(/"/g, '""')}"`;
  try {
    return await withPool({ ...input, ...cfg }, 'postgres', async (pool) => {
      await pool.query(`CREATE DATABASE ${quoted}`);
      return { ok: true, created: true, message: 'Database created.' };
    });
  } catch (error) {
    return { ok: false, created: false, ...sanitizeError(error) };
  }
}

function pathWritable(targetPath) {
  try {
    fs.mkdirSync(targetPath, { recursive: true });
    fs.accessSync(targetPath, fs.constants.W_OK);
    return { ok: true, path: targetPath };
  } catch (error) {
    return { ok: false, path: targetPath, ...sanitizeError(error) };
  }
}

async function assessInstallerHealth({ userDataPath, config = null } = {}) {
  const loaded = userDataPath
    ? configStore.loadInstallationConfig(userDataPath, { includePassword: false })
    : { ok: false };
  const candidate = config || loaded.config || null;
  const postgres = candidate
    ? await detectPostgres(candidate)
    : { ok: false, serviceDetected: false };
  const exists = candidate ? await databaseExists(candidate) : { ok: false, exists: false };
  const backupDir = process.env.BACKUP_DIR || path.join(userDataPath || os.tmpdir(), 'backups');
  const managedPostgres = await postgresProvisioning.assessManagedPostgresPreflight({
    userDataPath,
  });
  return {
    ok: postgres.ok && exists.ok && exists.exists,
    mode: loaded.ok ? 'configured' : 'configuration_required',
    configuration: loaded.ok ? loaded.config : null,
    postgres,
    database: exists,
    writableUserData: userDataPath ? pathWritable(userDataPath) : { ok: false },
    writableBackupFolder: pathWritable(backupDir),
    migrations: exists.exists ? 'ready_for_schema_initialization' : 'database_missing',
    managedPostgres,
  };
}

async function initializeConfiguredDatabase({ userDataPath, config, admin = null } = {}) {
  const existingConfig = userDataPath ? configStore.loadInstallationConfig(userDataPath) : null;
  const useExistingInstallerManagedConfig =
    admin &&
    existingConfig?.ok &&
    existingConfig.config?.mode === configStore.CONFIG_MODES.INSTALLER_MANAGED &&
    existingConfig.config?.managedPostgres;
  const saved = useExistingInstallerManagedConfig
    ? configStore.loadAndApplyInstallationConfig(userDataPath)
    : config
      ? configStore.saveInstallationConfig(userDataPath, config)
      : configStore.loadAndApplyInstallationConfig(userDataPath);
  if (!saved.ok) return saved;
  const applied = configStore.loadAndApplyInstallationConfig(userDataPath);
  if (!applied.ok) return applied;
  const created = await createDatabaseIfMissing({
    ...config,
    ...applied.config,
    password: config?.password || process.env.PGPASSWORD || '',
  });
  if (!created.ok) return created;
  await closeDatabase();
  await initializeDatabase();
  if (admin) {
    const adminResult = await createInitialAdministrator(admin);
    if (!adminResult.ok) return adminResult;
    return {
      ok: true,
      createdDatabase: created.created,
      adminCreated: adminResult.created,
      message: adminResult.message,
    };
  }
  return { ok: true, createdDatabase: created.created, message: 'Database initialized.' };
}

async function hasUsableUserAccounts() {
  const result = await getPool().query(
    `
      SELECT COUNT(*)::int AS count
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.is_active = TRUE
        AND roles.is_active = TRUE
        AND users.password_hash IS NOT NULL
        AND users.password_hash <> ''
    `
  );
  return {
    ok: true,
    hasUsers: Number(result.rows[0]?.count || 0) > 0,
    count: Number(result.rows[0]?.count || 0),
  };
}

async function createInitialAdministrator(admin = {}) {
  const username = String(admin.username || '')
    .trim()
    .toLowerCase();
  const email = String(admin.email || '')
    .trim()
    .toLowerCase();
  const fullName = String(admin.fullName || 'System Administrator').trim();
  const password = String(admin.password || '');
  const confirmPassword = String(admin.confirmPassword || '');
  if (!username || !email || password.length < 8) {
    return {
      ok: false,
      created: false,
      message: 'Initial administrator requires username, email, and an 8-character password.',
    };
  }
  if (!confirmPassword || password !== confirmPassword) {
    return {
      ok: false,
      created: false,
      message: 'Initial administrator password confirmation does not match.',
    };
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const createdUser = await withTransaction(async (client) => {
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const current = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (current.rows[0]?.count > 0) {
      return null;
    }
    const role = await client.query("SELECT id FROM roles WHERE name = 'Admin' LIMIT 1");
    if (!role.rows[0]) throw new Error('Admin role is missing.');
    const inserted = await client.query(
      `
        INSERT INTO users (username, email, full_name, password_hash, role_id, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING id, username, email
      `,
      [username, email, fullName, passwordHash, role.rows[0].id]
    );
    await client.query(
      "INSERT INTO activity_logs (action, status, message, metadata) VALUES ('installer.first_admin', 'success', 'Initial administrator created by setup wizard', $1::jsonb)",
      [JSON.stringify({ username, email })]
    );
    return inserted.rows[0];
  });
  if (!createdUser) {
    return { ok: true, created: false, message: 'Database initialized; users already exist.' };
  }
  return {
    ok: true,
    created: true,
    message: 'Database initialized and initial administrator created.',
  };
}

module.exports = {
  assessInstallerHealth,
  createDatabaseIfMissing,
  createInitialAdministrator,
  databaseExists,
  detectPostgres,
  hasUsableUserAccounts,
  initializeConfiguredDatabase,
  parsePostgresMajor,
  pathWritable,
  poolConfig,
  sanitizeError,
};
