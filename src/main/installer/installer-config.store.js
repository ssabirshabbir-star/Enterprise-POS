const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPackageVersion } = require('../app-version');
const managedIdentity = require('./managed-database-identity.model');

const CONFIG_VERSION = 2;
const CONFIG_FILE = 'enterprise-pos-installation.json';
const CONFIG_MODES = Object.freeze({
  EXTERNALLY_MANAGED: 'externally-managed-postgres',
  INSTALLER_MANAGED: 'installer-managed-postgres',
  CERTIFICATION: 'certification-managed-postgres',
});
const SUPPORTED_CONFIG_VERSIONS = new Set([1, CONFIG_VERSION]);
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);

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

function parseDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  const sslMode =
    url.searchParams.get('sslmode') ||
    (url.searchParams.get('ssl') === 'true' ? 'require' : 'disable');
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 5432),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    sslMode,
  };
}

function hasDatabaseEnvironment(env = process.env) {
  return Boolean(
    env.DATABASE_URL ||
    (env.PGDATABASE && env.PGUSER && Object.prototype.hasOwnProperty.call(env, 'PGPASSWORD'))
  );
}

function createConfigFromEnvironment(env = process.env, overrides = {}) {
  const base = env.DATABASE_URL
    ? parseDatabaseUrl(env.DATABASE_URL)
    : {
        host: env.PGHOST,
        port: env.PGPORT,
        database: env.PGDATABASE,
        username: env.PGUSER,
        password: env.PGPASSWORD,
        sslMode: env.PGSSLMODE || 'disable',
      };
  return {
    ...base,
    mode: CONFIG_MODES.EXTERNALLY_MANAGED,
    ...overrides,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function codeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function classifyMode(input = {}) {
  const requested = String(input.mode || '').trim();
  if (Object.values(CONFIG_MODES).includes(requested)) return requested;
  if (input.certificationOnly === true) return CONFIG_MODES.CERTIFICATION;
  if (input.managed === true) return CONFIG_MODES.INSTALLER_MANAGED;
  return CONFIG_MODES.EXTERNALLY_MANAGED;
}

function normalizeDatabaseConfig(input = {}) {
  const host = String(input.host || 'localhost').trim();
  const port = Number(input.port || 5432);
  const database = String(input.database || 'enterprise_pos').trim();
  const username = String(input.username || input.user || 'postgres').trim();
  const sslMode = String(input.sslMode || 'disable').trim();
  const mode = classifyMode(input);

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
  if (SYSTEM_DATABASES.has(database.toLowerCase())) {
    throw codeError(
      'MANAGED_DATABASE_IDENTITY_UNSAFE',
      'System PostgreSQL databases cannot be used as the Enterprise POS application database.'
    );
  }
  if (
    mode === CONFIG_MODES.INSTALLER_MANAGED &&
    /^enterprise_pos_restore_cert_|^epos_cert_/i.test(database)
  ) {
    throw codeError(
      'MANAGED_DATABASE_IDENTITY_UNSAFE',
      'Disposable certification databases cannot be used for installer-managed production startup.'
    );
  }

  return { host, port, database, username, sslMode, mode };
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
    mode: record.mode || CONFIG_MODES.EXTERNALLY_MANAGED,
    host: record.host,
    port: record.port,
    database: record.database,
    username: record.username,
    sslMode: record.sslMode,
    installationId: record.installationId,
    managedPostgres: record.managedPostgres || null,
    managedIdentity: record.managedIdentity
      ? managedIdentity.redactedIdentity(record.managedIdentity)
      : null,
    storeId: record.storeId || null,
    installerVersion: record.installerVersion,
    legacyMigratedAt: record.legacyMigratedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSuccessfulConnectionAt: record.lastSuccessfulConnectionAt || null,
    integrity: record.integrity
      ? {
          algorithm: record.integrity.algorithm,
          present: Boolean(record.integrity.digest),
        }
      : null,
    passwordStored: Boolean(record.encryptedPassword),
  };
}

function integrityPayload(record = {}) {
  return {
    version: record.version,
    mode: record.mode,
    host: record.host,
    port: record.port,
    database: record.database,
    username: record.username,
    sslMode: record.sslMode,
    installationId: record.installationId,
    managedPostgres: record.managedPostgres || null,
    managedIdentity: record.managedIdentity || null,
    storeId: record.storeId || null,
    installerVersion: record.installerVersion,
    legacyMigratedAt: record.legacyMigratedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSuccessfulConnectionAt: record.lastSuccessfulConnectionAt || null,
    encryptedPassword: record.encryptedPassword || null,
  };
}

function attachIntegrity(record = {}) {
  return {
    ...record,
    integrity: {
      algorithm: 'sha256-config-record-v1',
      digest: sha256(stableStringify(integrityPayload(record))),
    },
  };
}

function verifyIntegrity(record = {}) {
  if (!record.integrity) {
    return { ok: true, legacy: true, code: 'MANAGED_DATABASE_CONFIG_LEGACY_INTEGRITY_MISSING' };
  }
  if (record.integrity.algorithm !== 'sha256-config-record-v1') {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_INTEGRITY_UNSUPPORTED' };
  }
  const expected = sha256(stableStringify(integrityPayload(record)));
  if (expected !== record.integrity.digest) {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_CORRUPT' };
  }
  return { ok: true, legacy: false };
}

function createInstallationRecord(payload = {}, options = {}) {
  const databaseConfig = normalizeDatabaseConfig(payload);
  const now = options.now || new Date().toISOString();
  const installationId = payload.installationId || crypto.randomUUID();
  const localManagedIdentity =
    payload.managedIdentity ||
    (databaseConfig.mode === CONFIG_MODES.INSTALLER_MANAGED
      ? managedIdentity.createLocalManagedIdentity({
          installationId,
          clusterId: payload.managedPostgres?.clusterId,
          databaseId: payload.managedPostgres?.databaseId,
          databaseName: databaseConfig.database,
          createdAt: now,
        })
      : null);
  return attachIntegrity({
    version: CONFIG_VERSION,
    ...databaseConfig,
    encryptedPassword: encryptPassword(payload.password, options.safeStorage),
    installationId,
    managedPostgres: payload.managedPostgres || null,
    managedIdentity: localManagedIdentity,
    storeId: payload.storeId || null,
    installerVersion: payload.installerVersion || getPackageVersion(),
    legacyMigratedAt: payload.legacyMigratedAt || null,
    createdAt: payload.createdAt || now,
    updatedAt: now,
    lastSuccessfulConnectionAt: payload.lastSuccessfulConnectionAt || null,
  });
}

function saveInstallationConfig(userDataPath, payload = {}, options = {}) {
  const target = installationConfigPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const record = createInstallationRecord(payload, options);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return { ok: true, path: target, config: redactConfig(record) };
}

function writeInstallationRecord(userDataPath, record) {
  const target = installationConfigPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const withIntegrity = attachIntegrity(record);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(withIntegrity, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return { ok: true, path: target, config: redactConfig(withIntegrity) };
}

function updateInstallationMetadata(userDataPath, metadata = {}, options = {}) {
  const target = installationConfigPath(userDataPath);
  if (!fs.existsSync(target)) return { ok: false, code: 'INSTALLER_CONFIG_MISSING', path: target };
  let record;
  try {
    record = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_CORRUPT', path: target };
  }
  if (!SUPPORTED_CONFIG_VERSIONS.has(Number(record.version))) {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_VERSION_UNSUPPORTED', path: target };
  }
  const integrity = verifyIntegrity(record);
  if (!integrity.ok) return { ok: false, code: integrity.code, path: target };
  const allowed = new Set([
    'installerVersion',
    'lastSuccessfulConnectionAt',
    'legacyMigratedAt',
    'storeId',
  ]);
  const next = {
    ...record,
    updatedAt: options.now || new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(metadata || {})) {
    if (allowed.has(key)) next[key] = value;
  }
  return writeInstallationRecord(userDataPath, next);
}

function loadInstallationConfig(userDataPath, options = {}) {
  const target = installationConfigPath(userDataPath);
  if (!fs.existsSync(target)) return { ok: false, code: 'INSTALLER_CONFIG_MISSING', path: target };
  let record;
  try {
    record = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_CORRUPT', path: target };
  }
  if (!SUPPORTED_CONFIG_VERSIONS.has(Number(record.version))) {
    return { ok: false, code: 'MANAGED_DATABASE_CONFIG_VERSION_UNSUPPORTED', path: target };
  }
  const integrity = verifyIntegrity(record);
  if (!integrity.ok) return { ok: false, code: integrity.code, path: target };
  let normalized;
  try {
    normalized = normalizeDatabaseConfig(record);
  } catch (error) {
    return {
      ok: false,
      code: error.code || 'MANAGED_DATABASE_CONFIG_CORRUPT',
      path: target,
    };
  }
  let password;
  try {
    password = options.includePassword
      ? decryptPassword(record.encryptedPassword, options.safeStorage)
      : undefined;
  } catch (error) {
    return {
      ok: false,
      code:
        error.message === 'Unsupported credential encryption scheme.'
          ? 'MANAGED_DATABASE_CREDENTIAL_UNSUPPORTED'
          : 'MANAGED_DATABASE_CREDENTIAL_DECRYPT_FAILED',
      path: target,
    };
  }
  if (options.includePassword && !password) {
    return { ok: false, code: 'MANAGED_DATABASE_CREDENTIAL_UNAVAILABLE', path: target };
  }
  return {
    ok: true,
    path: target,
    legacyIntegrity: integrity.legacy === true,
    config: {
      ...redactConfig(record),
      ...normalized,
      managedIdentity: record.managedIdentity || null,
      password,
    },
  };
}

function applyInstallationConfigToEnv(config = {}) {
  process.env.ENTERPRISE_POS_DB_CONFIG_SOURCE = 'installer-config';
  process.env.ENTERPRISE_POS_DB_CONFIG_MODE = String(
    config.mode || CONFIG_MODES.EXTERNALLY_MANAGED
  );
  if (config.installationId) {
    process.env.ENTERPRISE_POS_INSTALLATION_ID = String(config.installationId);
  }
  if (config.managedIdentity?.clusterId) {
    process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID = String(config.managedIdentity.clusterId);
  }
  if (config.managedIdentity?.databaseId) {
    process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID = String(config.managedIdentity.databaseId);
  }
  if (config.managedIdentity?.fingerprint) {
    process.env.ENTERPRISE_POS_MANAGED_IDENTITY_FINGERPRINT = String(
      config.managedIdentity.fingerprint
    );
  }
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
  CONFIG_MODES,
  CONFIG_FILE,
  CONFIG_VERSION,
  applyInstallationConfigToEnv,
  createInstallationRecord,
  createConfigFromEnvironment,
  decryptPassword,
  encryptPassword,
  hasDatabaseEnvironment,
  installationConfigPath,
  loadAndApplyInstallationConfig,
  loadInstallationConfig,
  normalizeDatabaseConfig,
  redactConfig,
  saveInstallationConfig,
  updateInstallationMetadata,
};
