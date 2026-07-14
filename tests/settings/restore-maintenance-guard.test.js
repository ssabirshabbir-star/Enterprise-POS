const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const guard = require('../../src/main/features/restore-engine/restore-maintenance-guard');
const governance = require('../../src/main/features/restore-engine/restore-production-governance.model');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function statusFor(state) {
  return {
    startupRecovery: governance.assessStartupRecovery({
      operationId: '00000000-0000-4000-8000-000000000001',
      currentState: state,
    }),
  };
}

test('maintenance model blocks dangerous restore states and safe terminal states remain open', () => {
  for (const state of governance.DANGEROUS_STARTUP_STATES) {
    const assessment = governance.assessStartupRecovery({ currentState: state });
    assert.equal(assessment.maintenanceModeRequired, true);
    assert.equal(assessment.blocksMutations, true);
    assert.equal(assessment.reasonCode, guard.MAINTENANCE_ERROR_CODE);
  }

  for (const state of [
    recovery.RESTORE_RECOVERY_STATES.COMPLETED,
    recovery.RESTORE_RECOVERY_STATES.ROLLED_BACK,
    recovery.RESTORE_RECOVERY_STATES.CANCELLED,
  ]) {
    const assessment = governance.assessStartupRecovery({ currentState: state });
    assert.equal(assessment.maintenanceModeRequired, false);
    assert.equal(assessment.blocksMutations, false);
  }
});

test('safety backup in progress blocks writes without forcing startup lockout', () => {
  const assessment = governance.assessStartupRecovery({
    currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
  });
  assert.equal(assessment.startupAllowed, true);
  assert.equal(assessment.maintenanceModeRequired, false);
  assert.equal(assessment.blocksMutations, true);
});

test('central guard rejects mutations before service execution and preserves read-only routes', async () => {
  let serviceCalled = false;
  const blocked = await guard.assertMutationAllowed('/pos/sales/complete', () =>
    statusFor(recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS)
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.response.code, guard.MAINTENANCE_ERROR_CODE);
  assert.equal(blocked.response.ok, false);
  assert.equal(blocked.response.recovery.currentState, recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS);
  assert.doesNotMatch(JSON.stringify(blocked.response), /password|DATABASE_URL|PGPASSWORD/i);

  const ipcMain = {
    handlers: new Map(),
    handle(channel, listener) {
      this.handlers.set(channel, listener);
    },
  };
  const guarded = guard.createGuardedIpcMain(ipcMain, {
    getMaintenanceStatus: () => statusFor(recovery.RESTORE_RECOVERY_STATES.RESTORE_APPLIED),
  });
  guarded.handle('/products/create', async () => {
    serviceCalled = true;
    return { ok: true };
  });
  const response = await ipcMain.handlers.get('/products/create')();
  assert.equal(response.code, guard.MAINTENANCE_ERROR_CODE);
  assert.equal(serviceCalled, false);

  const readOnly = await guard.assertMutationAllowed('/settings/backups/restore-execution-policy', () =>
    statusFor(recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS)
  );
  assert.equal(readOnly.allowed, true);
});

test('concurrent mutation checks reject consistently during maintenance mode', async () => {
  const checks = await Promise.all(
    Array.from({ length: 5 }, () =>
      guard.assertMutationAllowed('/inventory/import/execution/certified', () =>
        statusFor(recovery.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED)
      )
    )
  );
  assert.equal(checks.filter((item) => item.allowed === false).length, 5);
  assert(checks.every((item) => item.response.code === guard.MAINTENANCE_ERROR_CODE));
});

test('main process uses guarded IPC registration and production restore execution remains absent', () => {
  const main = read('src/main/main.js');
  const preload = read('src/main/preload.js');
  const controller = read('src/main/features/settings/settings.controller.js');
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const guardSource = read('src/main/features/restore-engine/restore-maintenance-guard.js');

  assert.match(main, /createGuardedIpcMain/);
  assert.match(main, /registerBillingRoutes\(guardedIpcMain\)/);
  assert.match(main, /registerSettingsRoutes\(guardedIpcMain\)/);
  assert.match(guardSource, /\/pos\/sales\/complete/);
  assert.match(guardSource, /\/inventory\/import\/execution\/certified/);
  assert.match(guardSource, /\/barcodes\/preview\/request/);
  assert.match(guardSource, /\/barcodes\/preview\/print/);
  assert.match(guardSource, /\/updates\/check/);
  assert.match(guardSource, /\/license\/status/);
  assert.match(guardSource, /\/license\/refresh/);
  assert.match(guardSource, /\/settings\/save/);

  assert.doesNotMatch(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.doesNotMatch(preload, /restoreBackup:\s*\(/);
  assert.doesNotMatch(renderer, /A\(\)\.restoreBackup|handleExecuteRestore|location\.reload/);
});

test('write-like deployment and barcode routes are guarded during recovery mode', async () => {
  for (const channel of [
    '/barcodes/preview/request',
    '/barcodes/preview/print',
    '/updates/check',
    '/license/status',
    '/license/refresh',
  ]) {
    const decision = await guard.assertMutationAllowed(channel, () =>
      statusFor(recovery.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED)
    );
    assert.equal(decision.allowed, false, `${channel} should be blocked`);
    assert.equal(decision.response.code, guard.MAINTENANCE_ERROR_CODE);
  }
});
