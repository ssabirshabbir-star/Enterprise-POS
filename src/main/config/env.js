const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function loadEnvironment(app) {
  const candidates = app?.isPackaged
    ? [
        path.join(app.getPath('userData'), '.env.production'),
        path.join(app.getPath('userData'), '.env'),
        path.join(process.resourcesPath, '.env.production'),
      ]
    : [path.join(__dirname, '..', '..', '..', '.env')];

  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (envPath) dotenv.config({ path: envPath, quiet: true });
  return envPath || null;
}

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment value: ${name}`);
  }

  return value;
}

const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);

function structuredConfigError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true';
}

function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname || '',
    port: Number(url.port || 5432),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
    user: decodeURIComponent(url.username || ''),
  };
}

function assertSafeDatabaseIdentity(config = {}, source = 'unknown') {
  const database = String(config.database || '').trim();
  if (!database) {
    throw structuredConfigError(
      'MANAGED_DATABASE_IDENTITY_UNKNOWN',
      'Database identity is missing or ambiguous.',
      { source }
    );
  }
  if (SYSTEM_DATABASES.has(database.toLowerCase())) {
    throw structuredConfigError(
      'MANAGED_DATABASE_IDENTITY_UNSAFE',
      'System PostgreSQL databases cannot be used as the Enterprise POS application database.',
      { source, database }
    );
  }
  if (
    isProductionRuntime() &&
    process.env.ENTERPRISE_POS_DB_CONFIG_MODE !== 'certification-managed-postgres' &&
    /^enterprise_pos_restore_cert_|^epos_cert_/i.test(database)
  ) {
    throw structuredConfigError(
      'MANAGED_DATABASE_IDENTITY_UNSAFE',
      'Disposable certification databases cannot be used for normal production startup.',
      { source, database }
    );
  }
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    const identity = parseConnectionString(process.env.DATABASE_URL);
    assertSafeDatabaseIdentity(identity, 'database_url');
    return {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PGPOOL_MAX || 8),
      idleTimeoutMillis: 30000,
      source: 'database_url',
    };
  }

  const isProduction = isProductionRuntime();
  const source = process.env.ENTERPRISE_POS_DB_CONFIG_SOURCE || 'pg_env';
  const mode = process.env.ENTERPRISE_POS_DB_CONFIG_MODE || null;
  if (isProduction && !process.env.PGPASSWORD) {
    const loadErrorCode = process.env.ENTERPRISE_POS_INSTALLER_CONFIG_ERROR_CODE;
    if (loadErrorCode && loadErrorCode !== 'INSTALLER_CONFIG_MISSING') {
      throw structuredConfigError(
        loadErrorCode,
        'The managed local database configuration is damaged or cannot be decrypted. Use the controlled database recovery flow.',
        { source: 'installer-config' }
      );
    }
    throw structuredConfigError(
      'MANAGED_DATABASE_CONFIG_MISSING',
      'The local Enterprise POS database has not been configured yet. Complete the guided database setup before signing in.',
      { source }
    );
  }

  const config = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'star',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    max: 8,
    idleTimeoutMillis: 30000,
    source,
    mode,
  };
  if (isProduction) assertSafeDatabaseIdentity(config, source);
  return config;
}

function getAuthConfig() {
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true';
  const accessFallback = isProduction ? undefined : 'enterprise-pos-local-access-secret-change-me';
  const refreshFallback = isProduction
    ? undefined
    : 'enterprise-pos-local-refresh-secret-change-me';
  return {
    accessTokenSecret: requireEnv('JWT_ACCESS_SECRET', accessFallback),
    refreshTokenSecret: requireEnv('JWT_REFRESH_SECRET', refreshFallback),
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '7d',
  };
}

module.exports = {
  assertSafeDatabaseIdentity,
  getAuthConfig,
  getDatabaseConfig,
  loadEnvironment,
  structuredConfigError,
};
