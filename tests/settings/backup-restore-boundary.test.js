const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Settings API exposes certified backup and guarded production restore boundary', () => {
  const source = read('src/main/features/settings/settings.api.js');
  const calls = [];
  const window = {
    posApi: {
      app: {
        info: () => ({ ok: true }),
      },
      settings: {
        get: () => ({ ok: true }),
        listBackups: (filters) => calls.push(['listBackups', filters]) || { ok: true },
        assessBackupPreflight: () => calls.push(['assessBackupPreflight']) || { ok: true },
        createBackup: () => calls.push(['createBackup']) || { ok: true },
        inspectRestorePackage: () => calls.push(['inspectRestorePackage']) || { ok: true },
        verifyRestorePackage: () => calls.push(['verifyRestorePackage']) || { ok: true },
        assessRestoreEligibility: () => calls.push(['assessRestoreEligibility']) || { ok: true },
        assessRestoreAuthorization: (payload) =>
          calls.push(['assessRestoreAuthorization', payload]) || { ok: true },
        dryRunCertificationReport: (payload) =>
          calls.push(['dryRunCertificationReport', payload]) || { ok: true },
        listDryRunCertificationReports: (filters) =>
          calls.push(['listDryRunCertificationReports', filters]) || { ok: true },
        getDryRunCertificationReport: (id) =>
          calls.push(['getDryRunCertificationReport', id]) || { ok: true },
        restoreReadinessDashboard: () => calls.push(['restoreReadinessDashboard']) || { ok: true },
        restoreGovernanceAssessment: () =>
          calls.push(['restoreGovernanceAssessment']) || { ok: true },
        restoreEngineFoundationAssessment: () =>
          calls.push(['restoreEngineFoundationAssessment']) || { ok: true },
        restoreTransactionFoundationAssessment: () =>
          calls.push(['restoreTransactionFoundationAssessment']) || { ok: true },
        restoreBackup: (payload) => calls.push(['restoreBackup', payload]) || { ok: false },
      },
    },
  };

  vm.runInNewContext(source, { window });

  assert.equal(typeof window.SettingsApi.createBackup, 'function');
  assert.equal(typeof window.SettingsApi.assessBackupPreflight, 'function');
  assert.equal(typeof window.SettingsApi.verifyRestorePackage, 'function');
  assert.equal(typeof window.SettingsApi.assessRestoreEligibility, 'function');
  assert.equal(typeof window.SettingsApi.restoreReadinessDashboard, 'function');
  assert.equal(typeof window.SettingsApi.restoreBackup, 'function');

  window.SettingsApi.createBackup();
  window.SettingsApi.assessRestoreEligibility();
  window.SettingsApi.restoreBackup({ operationId: 'op-1' });

  assert.deepEqual(
    calls.map((call) => call[0]),
    ['createBackup', 'assessRestoreEligibility', 'restoreBackup']
  );
});

test('preload settings bridge exposes guarded restore execution route', () => {
  const source = read('src/main/preload.js');

  assert.match(
    source,
    /createBackup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/create'\)/
  );
  assert.match(
    source,
    /assessBackupPreflight:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/preflight'\)/
  );
  assert.match(
    source,
    /verifyRestorePackage:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/verify-restore-package'\)/
  );
  assert.match(source, /restoreReadinessDashboard:\s*\(\)\s*=>/);
  assert.match(
    source,
    /restoreBackup:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/restore', payload\)/
  );
});

test('main-process settings route exposes guarded production restore and keeps repository execution internal', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const service = read('src/main/features/settings/settings.service.js');
  const repository = read('src/main/features/settings/settings.repository.js');

  assert.match(controller, /\/settings\/backups\/create/);
  assert.match(controller, /\/settings\/backups\/restore-readiness-dashboard/);
  assert.match(controller, /\/settings\/backups\/restore-transaction-foundation-assessment/);
  assert.match(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.match(controller, /settingsService\.executeProductionRestore/);

  const serviceExports = service.slice(service.lastIndexOf('module.exports'));
  assert.match(serviceExports, /createBackup/);
  assert.match(serviceExports, /verifyRestorePackage/);
  assert.match(serviceExports, /assessRestoreEligibility/);
  assert.match(serviceExports, /executeProductionRestore/);

  const repositoryExports = repository.slice(repository.lastIndexOf('module.exports'));
  assert.match(repositoryExports, /exportBackup/);
  assert.match(repositoryExports, /verifyRestorePackage/);
  assert.match(repositoryExports, /assessRestoreEligibility/);
  assert.doesNotMatch(repositoryExports, /executeRestoreBackup/);
});

test('renderer wires guarded restore execution and keeps the button initially disabled', () => {
  const html = read('src/main/features/settings/index.html');
  const renderer = read('src/main/features/settings/settings.renderer.js');

  assert.match(html, /id="restoreBackupButton"[^>]*disabled/);
  assert.match(renderer, /function handleExecuteRestore/);
  assert.match(
    renderer,
    /addListener\(\$id\('restoreBackupButton'\), 'click', handleExecuteRestore\)/
  );
  assert.match(renderer, /policy\.restoreExecutionAvailable === true/);
  assert.match(renderer, /lastRestoreConfirmation\?\.confirmationId/);
  assert.doesNotMatch(renderer, /location\.reload/);
});

test('renderer preserves certified backup success while refreshing history', () => {
  const renderer = read('src/main/features/settings/settings.renderer.js');

  assert.match(renderer, /Certified backup created and verified successfully/);
  assert.match(renderer, /await handleRefreshBackups\(1, \{ silent: true \}\)/);
  assert.match(
    renderer,
    /if \(!options\.silent\) showMessage\('Backup history refreshed\.', 'success'\)/
  );
});
