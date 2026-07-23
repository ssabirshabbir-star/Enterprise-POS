const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { authSecretPath, ensureAuthSecrets } = require('../src/main/security/auth-secret-store');
const { getAuthConfig } = require('../src/main/config/env');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
    decryptString: (buffer) => String(buffer).replace(/^sealed:/, ''),
  };
}

async function withCleanAuthEnv(callback) {
  const names = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_TTL',
    'JWT_REFRESH_TTL',
    'NODE_ENV',
    'ELECTRON_IS_PACKAGED',
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    return await callback();
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('packaged auth secrets are generated, encrypted, read back, and applied to env', async () => {
  await withCleanAuthEnv(async () => {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_PACKAGED = 'true';
    const userDataPath = tempDir('epos-auth-secrets-');
    let calls = 0;
    const result = ensureAuthSecrets(null, {
      userDataPath,
      safeStorage: fakeSafeStorage(),
      randomBytes: () => Buffer.alloc(48, ++calls),
    });

    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(result.source, 'secure-store');
    assert.equal(fs.existsSync(authSecretPath(userDataPath)), true);
    assert.equal(process.env.JWT_ACCESS_SECRET.length > 32, true);
    assert.equal(process.env.JWT_REFRESH_SECRET.length > 32, true);
    assert.notEqual(process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET);

    const raw = fs.readFileSync(authSecretPath(userDataPath), 'utf8');
    assert.match(raw, /electron-safeStorage/);
    assert.doesNotMatch(
      raw,
      new RegExp(process.env.JWT_ACCESS_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.doesNotMatch(
      raw,
      new RegExp(process.env.JWT_REFRESH_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );

    const authConfig = getAuthConfig();
    assert.equal(authConfig.accessTokenSecret, process.env.JWT_ACCESS_SECRET);
    assert.equal(authConfig.refreshTokenSecret, process.env.JWT_REFRESH_SECRET);
  });
});

test('packaged auth secrets are reused after restart instead of rotated', async () => {
  await withCleanAuthEnv(async () => {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_PACKAGED = 'true';
    const userDataPath = tempDir('epos-auth-secrets-reuse-');
    let calls = 0;
    ensureAuthSecrets(null, {
      userDataPath,
      safeStorage: fakeSafeStorage(),
      randomBytes: () => Buffer.alloc(48, ++calls),
    });
    const firstAccessSecret = process.env.JWT_ACCESS_SECRET;
    const firstRefreshSecret = process.env.JWT_REFRESH_SECRET;

    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    const reused = ensureAuthSecrets(null, {
      userDataPath,
      safeStorage: fakeSafeStorage(),
      randomBytes: () => Buffer.alloc(48, 9),
    });

    assert.equal(reused.ok, true);
    assert.equal(reused.created, false);
    assert.equal(process.env.JWT_ACCESS_SECRET, firstAccessSecret);
    assert.equal(process.env.JWT_REFRESH_SECRET, firstRefreshSecret);
  });
});

test('explicit environment auth secrets remain authoritative', async () => {
  await withCleanAuthEnv(async () => {
    const userDataPath = tempDir('epos-auth-secrets-env-');
    process.env.JWT_ACCESS_SECRET = 'provided-access-secret-with-enough-length';
    process.env.JWT_REFRESH_SECRET = 'provided-refresh-secret-with-enough-length';

    const result = ensureAuthSecrets(null, {
      userDataPath,
      safeStorage: fakeSafeStorage(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.source, 'environment');
    assert.equal(fs.existsSync(authSecretPath(userDataPath)), false);
  });
});

test('packaged auth secret storage fails closed when encryption is unavailable', async () => {
  await withCleanAuthEnv(async () => {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_PACKAGED = 'true';
    const userDataPath = tempDir('epos-auth-secrets-unavailable-');

    assert.throws(
      () =>
        ensureAuthSecrets(null, {
          userDataPath,
          safeStorage: { isEncryptionAvailable: () => false },
        }),
      /Platform credential encryption is unavailable/
    );
    assert.equal(fs.existsSync(authSecretPath(userDataPath)), false);
    assert.equal(process.env.JWT_ACCESS_SECRET, undefined);
    assert.equal(process.env.JWT_REFRESH_SECRET, undefined);
  });
});
