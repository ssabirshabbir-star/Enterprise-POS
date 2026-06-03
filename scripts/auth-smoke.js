const os = require('os');
const path = require('path');
const { loadEnvironment } = require('../src/main/config/env');
const { initializeDatabase } = require('../src/main/database/schema');
const { closeDatabase } = require('../src/main/database/connection');
const sessionStore = require('../src/main/security/session-store');
const authService = require('../src/main/features/auth/auth.service');

async function run() {
  loadEnvironment();
  sessionStore.initializeSessionStore({
    getPath: () => path.join(os.tmpdir(), 'enterprise-pos-auth-smoke')
  });
  await initializeDatabase();

  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error('SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD are required for auth smoke tests');
  }

  const invalid = await authService.login({ username, password: 'wrong-password' });
  if (invalid.ok) {
    throw new Error('Invalid login unexpectedly succeeded');
  }

  const login = await authService.login({ username, password });
  if (!login.ok || login.profile.role !== 'Admin') {
    throw new Error('Valid login failed');
  }

  const profile = await authService.getProfile();
  if (!profile.ok || profile.profile.username !== username) {
    throw new Error('Profile endpoint failed');
  }

  const access = await authService.canAccess('settings');
  if (!access.ok || !access.allowed) {
    throw new Error('Admin RBAC check failed');
  }

  const logout = await authService.logout();
  if (!logout.ok) {
    throw new Error('Logout failed');
  }

  const afterLogout = await authService.getProfile();
  if (afterLogout.ok) {
    throw new Error('Profile succeeded after logout');
  }

  console.log('Auth smoke checks passed.');
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
