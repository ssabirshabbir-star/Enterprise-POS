const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { test, expect, _electron: electron } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..');
const runId =
  process.env.ENTERPRISE_POS_E2E_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot =
  process.env.ENTERPRISE_POS_E2E_ARTIFACT_DIR ||
  path.join(repoRoot, 'test-artifacts', 'electron-e2e', runId);
const disposablePrefix = 'enterprise_pos_e2e_';
const dbName = `${disposablePrefix}${runId
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .slice(0, 36)}`;
const adminUser = 'e2e_admin';
const adminPassword = crypto.randomBytes(18).toString('base64url');
const createdProductNames = new Set();
let appInstance = null;
let databaseReady = false;

dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeEvidence(name, payload) {
  mkdirp(artifactRoot);
  fs.writeFileSync(
    path.join(artifactRoot, name),
    `${JSON.stringify({ writtenAt: new Date().toISOString(), ...payload }, null, 2)}\n`
  );
}

function assertDisposableDatabaseName(database) {
  if (!new RegExp(`^${disposablePrefix}[a-z0-9_]+$`).test(database)) {
    throw new Error('E2E database name is not disposable.');
  }
}

function quoteIdentifier(identifier) {
  assertDisposableDatabaseName(identifier);
  return `"${identifier}"`;
}

function basePgConfig(database = 'postgres', overrides = {}) {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    connectionTimeoutMillis: overrides.connectionTimeoutMillis || 5000,
    idleTimeoutMillis: 1000,
    query_timeout: overrides.queryTimeout || 30000,
    statement_timeout: overrides.queryTimeout || 30000,
  };
}

function sanitizedDbIdentity(database = dbName) {
  const config = basePgConfig(database);
  return {
    host: config.host,
    port: config.port,
    database,
    userPresent: Boolean(config.user),
    passwordPresent: Boolean(config.password),
    disposable: database.startsWith(disposablePrefix),
  };
}

async function withPool(database, callback, overrides = {}) {
  const pool = new Pool(basePgConfig(database, overrides));
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function createDisposableDatabase() {
  assertDisposableDatabaseName(dbName);
  await withPool('postgres', async (pool) => {
    await pool
      .query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`)
      .catch(async (error) => {
        if (error.code !== '42601') throw error;
        await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
      });
    await pool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
  });
}

async function dropDisposableDatabase() {
  if (!databaseReady) return;
  await withPool(
    'postgres',
    async (pool) => {
      await pool
        .query(`ALTER DATABASE ${quoteIdentifier(dbName)} WITH ALLOW_CONNECTIONS false`)
        .catch((error) => {
          if (error.code !== '55000') throw error;
        });
      await pool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [dbName]
      );
      await pool
        .query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`)
        .catch(async (error) => {
          if (error.code !== '42601') throw error;
          await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
        });
    },
    { queryTimeout: 60000 }
  );
  databaseReady = false;
}

async function initializeDisposableSchema() {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    PGDATABASE: process.env.PGDATABASE,
  };
  delete process.env.DATABASE_URL;
  process.env.PGDATABASE = dbName;
  const { initializeDatabase } = require('../../src/main/database/schema');
  const { closeDatabase } = require('../../src/main/database/connection');
  try {
    await initializeDatabase();
  } finally {
    await closeDatabase();
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.PGDATABASE === undefined) delete process.env.PGDATABASE;
    else process.env.PGDATABASE = previous.PGDATABASE;
  }
}

async function seedAdminUser() {
  await withPool(dbName, async (pool) => {
    const role = await pool.query("SELECT id FROM roles WHERE name = 'Admin' LIMIT 1");
    const roleId = role.rows[0]?.id;
    if (!roleId) throw new Error('Admin role was not initialized.');
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `
        INSERT INTO users (username, email, full_name, password_hash, role_id, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (username)
        DO UPDATE SET password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id, is_active = TRUE
      `,
      [adminUser, `${adminUser}@example.test`, 'E2E Administrator', passwordHash, roleId]
    );
  });
}

function electronEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    'PGDATABASE',
    'PGPASSWORD',
    'ENTERPRISE_POS_E2E_USER_DATA_DIR',
    'ELECTRON_RUN_AS_NODE',
  ]) {
    delete env[key];
  }
  return {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: '',
    PGHOST: process.env.PGHOST || 'localhost',
    PGPORT: String(process.env.PGPORT || 5432),
    PGDATABASE: dbName,
    PGUSER: process.env.PGUSER || 'postgres',
    PGPASSWORD: process.env.PGPASSWORD || '',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'enterprise-pos-e2e-access-secret',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'enterprise-pos-e2e-refresh-secret',
    ENTERPRISE_POS_E2E_USER_DATA_DIR: path.join(
      os.tmpdir(),
      `enterprise-pos-e2e-user-data-${runId}`
    ),
    ...overrides,
  };
}

async function launchApp(options = {}) {
  const startedAt = Date.now();
  const stdout = [];
  const stderr = [];
  const consoleMessages = [];
  const pageErrors = [];
  const electronApp = await electron.launch({
    args: [repoRoot, `--user-data-dir=${electronEnv().ENTERPRISE_POS_E2E_USER_DATA_DIR}`],
    cwd: repoRoot,
    env: electronEnv(options.env || {}),
    timeout: 30000,
  });
  const child = electronApp.process();
  child.stdout?.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
  const page = await electronApp.firstWindow({ timeout: 30000 });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error.message || error).slice(0, 500)));
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  appInstance = { electronApp, page, child, stdout, stderr, consoleMessages, pageErrors };
  writeEvidence(`${options.label || 'launch'}-started.json`, {
    pid: child.pid,
    elapsedMs: Date.now() - startedAt,
    targetDatabase: sanitizedDbIdentity(),
    userDataIsolated: /enterprise-pos-e2e/i.test(electronEnv().ENTERPRISE_POS_E2E_USER_DATA_DIR),
  });
  return appInstance;
}

async function closeApp(label = 'close') {
  if (!appInstance) return;
  const startedAt = Date.now();
  const { electronApp, child, stdout, stderr, consoleMessages, pageErrors } = appInstance;
  await electronApp.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
  let processAlive = true;
  try {
    process.kill(child.pid, 0);
  } catch {
    processAlive = false;
  }
  writeEvidence(`${label}-result.json`, {
    pid: child.pid,
    elapsedMs: Date.now() - startedAt,
    processAlive,
    stdoutBytes: stdout.join('').length,
    stderrBytes: stderr.join('').length,
    rendererConsoleIssues: consoleMessages,
    pageErrors,
  });
  appInstance = null;
  expect(processAlive).toBe(false);
}

async function login(page) {
  await page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 20000 });
  const result = await page.evaluate(
    ({ username, password }) => window.posApi.auth.login({ username, password }),
    { username: adminUser, password: adminPassword }
  );
  expect(result.ok, result.message || 'Login failed').toBe(true);
  await page.evaluate((profile) => (window.__e2eLoginProfile = profile), result.profile);
  await page.locator('#username').fill(adminUser);
  await page.locator('#password').fill(adminPassword);
  await page.locator('#loginButton').click();
  await page.locator('#dashboard').waitFor({ state: 'visible', timeout: 20000 });
}

test.describe.configure({ mode: 'serial', timeout: 90000 });

test.beforeAll(async () => {
  writeEvidence('environment-preflight.json', {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    electronDependencyPresent: Boolean(require.resolve('electron')),
    targetDatabase: sanitizedDbIdentity(),
  });
  await createDisposableDatabase();
  databaseReady = true;
  await initializeDisposableSchema();
  await seedAdminUser();
  writeEvidence('database-ready.json', { targetDatabase: sanitizedDbIdentity() });
});

test.afterEach(async () => {
  await closeApp('after-each-close');
});

test.afterAll(async () => {
  await dropDisposableDatabase();
  writeEvidence('database-cleanup.json', { targetDatabase: sanitizedDbIdentity(), dropped: true });
});

test('launches the real Electron app and reaches login', async () => {
  const { page, pageErrors } = await launchApp({ label: 'test-1-launch' });
  await page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 20000 });
  await expect(page.locator('#loadingScreen')).toBeHidden();
  expect(await page.title()).toBe('Enterprise POS');
  expect(pageErrors).toEqual([]);
});

test('exposes context-isolated preload API and real IPC contracts', async () => {
  const { page } = await launchApp({ label: 'test-2-ipc' });
  const contract = await page.evaluate(async () => {
    return {
      hasPosApi: typeof window.posApi === 'object',
      hasAppInfo: typeof window.posApi?.app?.info === 'function',
      hasProducts: typeof window.posApi?.products?.list === 'function',
      nodeRequireExposed: typeof window.require !== 'undefined',
      ipcRendererExposed: typeof window.ipcRenderer !== 'undefined',
      appInfo: await window.posApi.app.info(),
      malformedAuth: await window.posApi.auth.login({ username: '..', password: '' }),
    };
  });
  expect(contract.hasPosApi).toBe(true);
  expect(contract.hasAppInfo).toBe(true);
  expect(contract.hasProducts).toBe(true);
  expect(contract.nodeRequireExposed).toBe(false);
  expect(contract.ipcRendererExposed).toBe(false);
  expect(contract.appInfo.ok).toBe(true);
  expect(contract.malformedAuth.ok).toBe(false);
  await login(page);
  const productRead = await page.evaluate(() => window.posApi.products.list({ limit: 1 }));
  expect(productRead.ok).toBe(true);
});

test('renders the authenticated application shell', async () => {
  const { page } = await launchApp({ label: 'test-3-shell' });
  await login(page);
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#appSidebar')).toBeVisible();
  await expect(page.locator('#routeTitle')).toContainText(/Billing|Dashboard/);
  await expect(page.locator('#signedInUser')).toContainText('E2E Administrator');
});

test('runs a PostgreSQL-backed product workflow through preload and IPC', async () => {
  const { page } = await launchApp({ label: 'test-4-db-workflow' });
  await login(page);
  const marker = `E2E Product ${Date.now()}`;
  createdProductNames.add(marker);
  const result = await page.evaluate(async (name) => {
    const create = await window.posApi.products.create({
      name,
      sku: `E2E${Date.now()}`,
      barcode: `E2EBC${Date.now()}`,
      purchasePrice: 10,
      salePrice: 12,
      wholesalePrice: 11,
      minStockLevel: 1,
      currentStock: 3,
      isActive: true,
    });
    const list = await window.posApi.products.list({ search: name, limit: 5 });
    return { create, list };
  }, marker);
  expect(result.create.ok).toBe(true);
  expect(result.list.ok).toBe(true);
  expect(result.list.products.some((product) => product.name === marker)).toBe(true);
  await withPool(dbName, async (pool) => {
    const rows = await pool.query('SELECT name, current_stock FROM products WHERE name = $1', [
      marker,
    ]);
    expect(rows.rowCount).toBe(1);
    expect(Number(rows.rows[0].current_stock)).toBe(3);
    await pool.query('UPDATE products SET deleted_at = NOW(), is_active = FALSE WHERE name = $1', [
      marker,
    ]);
  });
});

test('rejects invalid credentials without leaving login', async () => {
  const { page } = await launchApp({ label: 'test-5-auth-boundary' });
  await page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#username').fill(adminUser);
  await page.locator('#password').fill('not-the-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#message')).toContainText('Invalid username or password', {
    timeout: 20000,
  });
  await expect(page.locator('#dashboard')).toBeHidden();
});

test('shows controlled setup failure when the database is unavailable', async () => {
  const unavailablePort = String(Number(process.env.PGPORT || 5432) + 41000);
  const { page } = await launchApp({
    label: 'test-6-db-unavailable',
    env: {
      PGPORT: unavailablePort,
      PGDATABASE: `${disposablePrefix}unavailable_${Date.now()}`,
      PGPASSWORD: process.env.PGPASSWORD || '',
    },
  });
  await page.locator('#setupTitle').waitFor({ state: 'visible', timeout: 30000 });
  await expect(page.locator('#setupError')).toContainText(/database/i);
  const setupText = await page.locator('body').innerText();
  expect(setupText).not.toContain(process.env.PGPASSWORD || 'admin123');
});

test('shuts down cleanly and supports a second launch', async () => {
  const first = await launchApp({ label: 'test-7-first-repeat-launch' });
  await first.page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 20000 });
  await closeApp('test-7-first-close');
  const second = await launchApp({ label: 'test-7-second-repeat-launch' });
  await second.page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 20000 });
});
