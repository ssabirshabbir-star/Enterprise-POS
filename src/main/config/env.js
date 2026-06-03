const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function loadEnvironment(app) {
  const candidates = app?.isPackaged
    ? [
        path.join(app.getPath('userData'), '.env.production'),
        path.join(app.getPath('userData'), '.env'),
        path.join(process.resourcesPath, '.env.production')
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

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PGPOOL_MAX || 8),
      idleTimeoutMillis: 30000
    };
  }

  const isProduction = process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true';
  if (isProduction && !process.env.PGPASSWORD) {
    throw new Error('Database is not configured. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD in the production env file.');
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'star',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    max: 8,
    idleTimeoutMillis: 30000
  };
}

function getAuthConfig() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_PACKAGED === 'true';
  const accessFallback = isProduction ? undefined : 'enterprise-pos-local-access-secret-change-me';
  const refreshFallback = isProduction ? undefined : 'enterprise-pos-local-refresh-secret-change-me';
  return {
    accessTokenSecret: requireEnv('JWT_ACCESS_SECRET', accessFallback),
    refreshTokenSecret: requireEnv('JWT_REFRESH_SECRET', refreshFallback),
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '7d'
  };
}

module.exports = {
  getAuthConfig,
  getDatabaseConfig,
  loadEnvironment
};
