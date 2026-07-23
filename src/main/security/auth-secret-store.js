const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_SECRET_FILE = 'auth-secrets.dat';
const AUTH_SECRET_SCHEMA_VERSION = 1;
const SECRET_BYTES = 48;

function safeStorageProvider() {
  try {
    return require('electron').safeStorage;
  } catch {
    return null;
  }
}

function authSecretPath(userDataPath) {
  return path.join(userDataPath, AUTH_SECRET_FILE);
}

function codeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isSecretUsable(value) {
  return typeof value === 'string' && value.length >= 32;
}

function assertSafeStorage(provider) {
  if (!provider || typeof provider.isEncryptionAvailable !== 'function') {
    throw codeError(
      'AUTH_SECRET_STORAGE_UNAVAILABLE',
      'Platform credential encryption is unavailable.'
    );
  }
  if (!provider.isEncryptionAvailable()) {
    throw codeError(
      'AUTH_SECRET_STORAGE_UNAVAILABLE',
      'Platform credential encryption is unavailable.'
    );
  }
}

function generateSecret(randomBytes = crypto.randomBytes) {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

function encryptSecrets(secrets, safeStorage) {
  assertSafeStorage(safeStorage);
  return {
    schemaVersion: AUTH_SECRET_SCHEMA_VERSION,
    scheme: 'electron-safeStorage',
    ciphertext: Buffer.from(safeStorage.encryptString(JSON.stringify(secrets))).toString('base64'),
    createdAt: new Date().toISOString(),
  };
}

function decryptSecrets(record, safeStorage) {
  if (record?.schemaVersion !== AUTH_SECRET_SCHEMA_VERSION) {
    throw codeError(
      'AUTH_SECRET_STORAGE_UNSUPPORTED',
      'Auth secret record version is unsupported.'
    );
  }
  if (record.scheme !== 'electron-safeStorage') {
    throw codeError(
      'AUTH_SECRET_STORAGE_UNSUPPORTED',
      'Auth secret encryption scheme is unsupported.'
    );
  }
  assertSafeStorage(safeStorage);
  let parsed;
  try {
    const plaintext = safeStorage.decryptString(
      Buffer.from(String(record.ciphertext || ''), 'base64')
    );
    parsed = JSON.parse(plaintext);
  } catch {
    throw codeError('AUTH_SECRET_DECRYPT_FAILED', 'Auth secrets could not be decrypted.');
  }
  if (!isSecretUsable(parsed.accessTokenSecret) || !isSecretUsable(parsed.refreshTokenSecret)) {
    throw codeError('AUTH_SECRET_INVALID', 'Auth secret record is incomplete.');
  }
  return parsed;
}

function writeSecretRecord(target, record) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function applySecretsToEnvironment(secrets) {
  process.env.JWT_ACCESS_SECRET = secrets.accessTokenSecret;
  process.env.JWT_REFRESH_SECRET = secrets.refreshTokenSecret;
}

function ensureAuthSecrets(app, options = {}) {
  if (
    isSecretUsable(process.env.JWT_ACCESS_SECRET) &&
    isSecretUsable(process.env.JWT_REFRESH_SECRET)
  ) {
    return { ok: true, source: 'environment' };
  }

  const userDataPath = options.userDataPath || app?.getPath?.('userData');
  if (!userDataPath) {
    throw codeError('AUTH_SECRET_USER_DATA_UNAVAILABLE', 'Application data path is unavailable.');
  }
  const safeStorage = options.safeStorage || safeStorageProvider();
  const target = authSecretPath(userDataPath);

  if (fs.existsSync(target)) {
    const record = JSON.parse(fs.readFileSync(target, 'utf8'));
    const secrets = decryptSecrets(record, safeStorage);
    applySecretsToEnvironment(secrets);
    return { ok: true, source: 'secure-store', path: target, created: false };
  }

  const secrets = {
    accessTokenSecret: generateSecret(options.randomBytes),
    refreshTokenSecret: generateSecret(options.randomBytes),
  };
  const record = encryptSecrets(secrets, safeStorage);
  writeSecretRecord(target, record);

  const readBack = JSON.parse(fs.readFileSync(target, 'utf8'));
  const verified = decryptSecrets(readBack, safeStorage);
  applySecretsToEnvironment(verified);
  return { ok: true, source: 'secure-store', path: target, created: true };
}

module.exports = {
  AUTH_SECRET_FILE,
  authSecretPath,
  ensureAuthSecrets,
};
