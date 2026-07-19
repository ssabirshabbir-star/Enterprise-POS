const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const configStore = require('../src/main/installer/installer-config.store');
const diagnostics = require('../src/main/installer/installer-diagnostics.service');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
    decryptString: (buffer) => String(buffer).replace(/^sealed:/, ''),
  };
}

test('installer configuration persists encrypted PostgreSQL credentials only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-installer-config-'));
  const saved = configStore.saveInstallationConfig(
    dir,
    {
      host: 'localhost',
      port: 5432,
      database: 'enterprise_pos',
      username: 'epos_user',
      password: 'not-plain-text',
      sslMode: 'disable',
      installerVersion: '1.0.0',
      storeId: 'store-placeholder',
    },
    { safeStorage: fakeSafeStorage(), now: '2026-07-18T00:00:00.000Z' }
  );

  assert.equal(saved.ok, true);
  assert.equal(saved.config.passwordStored, true);
  assert.equal(saved.config.password, undefined);
  const raw = fs.readFileSync(configStore.installationConfigPath(dir), 'utf8');
  assert.doesNotMatch(raw, /not-plain-text/);
  assert.match(raw, /electron-safeStorage/);

  const loaded = configStore.loadInstallationConfig(dir, {
    includePassword: true,
    safeStorage: fakeSafeStorage(),
  });
  assert.equal(loaded.config.password, 'not-plain-text');
});

test('installer configuration validates production database identity fields', () => {
  assert.deepEqual(configStore.normalizeDatabaseConfig({ database: 'shop_01' }), {
    host: 'localhost',
    port: 5432,
    database: 'shop_01',
    username: 'postgres',
    sslMode: 'disable',
    mode: configStore.CONFIG_MODES.EXTERNALLY_MANAGED,
  });
  assert.throws(() => configStore.normalizeDatabaseConfig({ database: 'bad name' }), /invalid/i);
  assert.throws(() => configStore.normalizeDatabaseConfig({ port: 99999 }), /port/i);
});

test('PostgreSQL diagnostics classify supported versions and writable folders', () => {
  assert.equal(diagnostics.parsePostgresMajor('PostgreSQL 16.3 on x86_64-pc-mingw64'), 16);
  assert.equal(diagnostics.parsePostgresMajor('not postgres'), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-installer-writable-'));
  assert.equal(diagnostics.pathWritable(dir).ok, true);
});

test('setup page is a guided first-run wizard and keeps restore recovery separate', () => {
  const html = read('src/renderer/setup.html');
  assert.match(html, /Enterprise POS Installation/);
  assert.match(html, /Database Detection/);
  assert.match(html, /Connect or Install/);
  assert.match(html, /Run initialization/);
  assert.match(html, /installerAdminUsername/);
  assert.match(html, /installerAdminPassword/);
  assert.match(html, /installerStoreId/);
  assert.match(html, /code === 'RESTORE_MAINTENANCE_LOCKOUT'/);
  assert.match(html, /document\.querySelector\('#installerWizard'\)\?\.classList\.add\('hidden'\)/);
  assert.doesNotMatch(html, /activateLicense|checkForUpdates|autoUpdate/);
});

test('preload and main expose installer foundation with disabled restore UI', () => {
  const preload = read('src/main/preload.js');
  const main = read('src/main/main.js');
  const settingsHtml = read('src/main/features/settings/index.html');

  assert.match(preload, /installer:\s*{/);
  assert.match(preload, /\/installer\/status/);
  assert.match(preload, /\/installer\/database\/initialize/);
  assert.match(main, /registerInstallerRoutes\(ipcMain, app\)/);
  assert.match(main, /loadAndApplyInstallationConfig/);
  assert.match(main, /createConfigFromEnvironment/);
  assert.match(main, /ENTERPRISE_POS_INSTALLER_CONFIG_ERROR_CODE/);
  assert.match(settingsHtml, /id="restoreBackupButton"[^>]*disabled/);
  assert.match(
    preload,
    /restoreBackup:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/restore', payload\)/
  );
});

test('installer controller provides setup-only IPC routes', () => {
  const controller = read('src/main/installer/installer.controller.js');
  assert.match(controller, /\/installer\/status/);
  assert.match(controller, /\/installer\/config\/save/);
  assert.match(controller, /\/installer\/database\/test/);
  assert.match(controller, /\/installer\/database\/create/);
  assert.match(controller, /\/installer\/database\/initialize/);
  assert.doesNotMatch(controller, /license|update|restoreBackup/);
});
