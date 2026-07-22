const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

const servicePath = path.resolve(__dirname, '../src/main/features/auth/auth.service.js');
const authRepositoryPath = path.resolve(__dirname, '../src/main/features/auth/auth.repository.js');
const activityRepositoryPath = path.resolve(
  __dirname,
  '../src/main/features/activity/activity.repository.js'
);
const sessionStorePath = path.resolve(__dirname, '../src/main/security/session-store.js');

function injectModule(resolvedPath, exports) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };
}

function clearAuthModules() {
  for (const resolvedPath of [
    servicePath,
    authRepositoryPath,
    activityRepositoryPath,
    sessionStorePath,
  ]) {
    delete require.cache[resolvedPath];
  }
}

function loadAuthService({ persistRefreshToken } = {}) {
  clearAuthModules();
  const calls = {
    accessToken: null,
    audits: [],
    clearSession: 0,
    createdRefreshTokens: [],
    loginSuccesses: [],
    persistedRefreshTokens: [],
    revokedRefreshTokens: [],
  };
  const user = {
    id: 7,
    username: 'admin',
    email: 'admin@example.test',
    fullName: 'System Administrator',
    passwordHash: bcrypt.hashSync('CorrectHorse1', 4),
    role: 'Admin',
    isActive: true,
  };

  injectModule(authRepositoryPath, {
    cleanupStaleRefreshTokens: async () => ({ total: 0 }),
    createRefreshToken: async ({ tokenId }) => {
      calls.createdRefreshTokens.push(tokenId);
      return tokenId;
    },
    findRefreshTokenById: async () => null,
    findUserById: async (id) => (Number(id) === user.id ? { ...user } : null),
    findUserByUsername: async (username) =>
      String(username).toLowerCase() === user.username ? { ...user } : null,
    getUserPermissions: async () => [
      'dashboard.view',
      'pos.view',
      'products.view',
      'inventory.view',
    ],
    markLoginFailure: async () => null,
    markLoginSuccess: async (userId) => calls.loginSuccesses.push(userId),
    revokeRefreshToken: async (tokenId) => calls.revokedRefreshTokens.push(tokenId),
    rotateRefreshToken: async () => null,
  });

  injectModule(activityRepositoryPath, {
    createActivityLog: async (entry) => calls.audits.push(entry),
  });

  injectModule(sessionStorePath, {
    clearSession: () => {
      calls.clearSession += 1;
    },
    getAccessToken: () => calls.accessToken,
    persistRefreshToken: (refreshToken) => {
      calls.persistedRefreshTokens.push(refreshToken);
      if (persistRefreshToken) persistRefreshToken(refreshToken);
    },
    readRefreshToken: () => null,
    setAccessToken: (token) => {
      calls.accessToken = token;
    },
  });

  return {
    calls,
    service: require(servicePath),
  };
}

test('login fails closed when secure session persistence fails', async () => {
  const { calls, service } = loadAuthService({
    persistRefreshToken: () => {
      throw new Error('safe storage unavailable');
    },
  });

  const result = await service.login({ username: 'admin', password: 'CorrectHorse1' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_SESSION_UNAVAILABLE');
  assert.deepEqual(calls.loginSuccesses, []);
  assert.equal(calls.clearSession, 1);
  assert.equal(calls.revokedRefreshTokens.length, 1);
  assert.equal(calls.createdRefreshTokens[0], calls.revokedRefreshTokens[0]);
  assert.equal(calls.accessToken, null);
  assert.equal(
    calls.audits.some(
      (entry) =>
        entry.action === 'auth.login' &&
        entry.status === 'failed' &&
        entry.metadata?.reason === 'session_persist_failed'
    ),
    true
  );
});

test('successful login creates a backend session before module access is allowed', async () => {
  const { calls, service } = loadAuthService();

  const login = await service.login({ username: 'admin', password: 'CorrectHorse1' });
  const access = await service.canAccess('products');

  assert.equal(login.ok, true);
  assert.equal(Boolean(calls.accessToken), true);
  assert.equal(calls.persistedRefreshTokens.length, 1);
  assert.deepEqual(calls.loginSuccesses, [7]);
  assert.equal(access.ok, true);
  assert.equal(access.allowed, true);
  assert.equal(access.profile.username, 'admin');
});
