const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG_VERSION = 1;
const CONFIG_FILE = 'enterprise-pos-installation.json';

function safeStorageProvider() {
  try {
    return require('electron').safeStorage;
  } catch {
    return null;
  }
}

function installationConfigPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

function normalizeDatabaseConfig(input = {}) {
  const host = String(input.host || 'localhost').trim();
  const port = Number(input.port || 5432);
  const database = String(input.database || 'enterprise_pos').trim();
  const username = String(input.username || input.user || 'postgres').trim();
  const sslMode = String(input.sslMode || 'disable').trim();

  if (!host) throw new Error('Database host is required.');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Database port is invalid.');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(database)) {
    throw new Error('Database name is invalid.');
  }
  if (!username) throw new Error('Database username is required.');
  if (!['disable', 'prefer', 'require'].includes(sslMode)) {
    throw new Error('Database SSL mode is invalid.');
  }

  return { host, port, database, username, sslMode };
}

function encryptPassword(password, provider = safeStorageProvider()) {
  const secret = String(password || '');
  if (!secret) return null;
  if (!provider || typeof provider.isEncryptionAvailable !== 'function') {
    throw new Error('Platform credential encryption is unavailable.');
  }
  if (!provider.isEncryptionAvailable()) {
    throw new Error('Platform credential encryption is unavailable.');
  }
  const encrypted = provider.encryptString(secret);
  return {
    scheme: 'electron-safeStorage',
    ciphertext: Buffer.from(encrypted).toString('base64'),
  };
}

function decryptPassword(encryptedPassword, provider = safeStorageProvider()) {
  if (!encryptedPassword) return '';
  if (encryptedPassword.scheme !== 'electron-safeStorage') {
    throw new Error('Unsupported credential encryption scheme.');
  }
  if (!provider || typeof provider.decryptString !== 'function') {
    throw new Error('Platform credential decryption is unavailable.');
  }
  const buffer = Buffer.from(String(encryptedPassword.ciphertext || ''), 'base64');
  return provider.decryptString(buffer);
}

function redactConfig(record = {}) {
  return {
    version: record.version,
    host: record.host,
    port: record.port,
    database: record.database,
    username: record.username,
    sslMode: record.sslMode,
    installationId: record.installationId,
    storeId: record.storeId || null,
    installerVersion: record.installerVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    passwordStored: Boolean(record.encryptedPassword),
  };
}

function createInstallationRecord(payload = {}, options = {}) {
  const databaseConfig = normalizeDatabaseConfig(payload);
  const now = options.now || new Date().toISOString();
  return {
    version: CONFIG_VERSION,
    ...databaseConfig,
    encryptedPassword: encryptPassword(payload.password, options.safeStorage),
    installationId: payload.installationId || crypto.randomUUID(),
    storeId: payload.storeId || null,
    installerVersion: payload.installerVersion || '1.0.0',
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
}

function saveInstallationConfig(userDataPath, payload = {}, options = {}) {
  const target = installationConfigPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const record = createInstallationRecord(payload, options);
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return { ok: true, path: target, config: redactConfig(record) };
}

function loadInstallationConfig(userDataPath, options = {}) {
  const target = installationConfigPath(userDataPath);
  if (!fs.existsSync(target)) return { ok: false, code: 'INSTALLER_CONFIG_MISSING', path: target };
  const record = JSON.parse(fs.readFileSync(target, 'utf8'));
  const normalized = normalizeDatabaseConfig(record);
  return {
    ok: true,
    path: target,
    config: {
      ...redactConfig(record),
      ...normalized,
      password: options.includePassword
        ? decryptPassword(record.encryptedPassword, options.safeStorage)
        : undefined,
    },
  };
}

function applyInstallationConfigToEnv(config = {}) {
  process.env.PGHOST = String(config.host || 'localhost');
  process.env.PGPORT = String(config.port || 5432);
  process.env.PGDATABASE = String(config.database || '');
  process.env.PGUSER = String(config.username || '');
  if (config.password !== undefined) process.env.PGPASSWORD = String(config.password || '');
  if (config.sslMode) process.env.PGSSLMODE = String(config.sslMode);
  delete process.env.DATABASE_URL;
}

function loadAndApplyInstallationConfig(userDataPath, options = {}) {
  const loaded = loadInstallationConfig(userDataPath, {
    ...options,
    includePassword: true,
  });
  if (!loaded.ok) return loaded;
  applyInstallationConfigToEnv(loaded.config);
  return { ok: true, path: loaded.path, config: redactConfig(loaded.config) };
}

module.exports = {
  CONFIG_FILE,
  CONFIG_VERSION,
  applyInstallationConfigToEnv,
  createInstallationRecord,
  decryptPassword,
  encryptPassword,
  installationConfigPath,
  loadAndApplyInstallationConfig,
  loadInstallationConfig,
  normalizeDatabaseConfig,
  redactConfig,
  saveInstallationConfig,
};
