const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const activation = require('../../src/main/features/restore-engine/restore-production-activation.model');
const execution = require('../../src/main/features/restore-engine/restore-production-execution.service');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function pendingActivationRecord() {
  return JSON.parse(read('resources/restore/production-activation.pending.json'));
}

function fakeRepository(overrides = {}) {
  const calls = [];
  return {
    calls,
    verifyRestorePackage: async () => {
      calls.push('package_verification');
      return { verificationStatus: 'passed' };
    },
    assessRestoreEligibility: async () => {
      calls.push('package_eligibility');
      return { eligibilityStatus: 'eligible_for_authorization' };
    },
    getRestoreRecoveryState: async () => {
      calls.push('recovery_state');
      return {
        operationId: '00000000-0000-4000-8000-000000000001',
        ownerUserId: 1,
        currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
        activeOperation: true,
        unresolvedRecoveryState: false,
        safetyBackupReference: {
          safetyBackupId: '00000000-0000-4000-8000-000000000002',
          checksum: 'a'.repeat(64),
          backupLogId: 42,
          filePath: 'D:\\safe\\safety-backup.json',
        },
      };
    },
    getRestoreExecutionPolicy: async () => {
      calls.push('execution_policy');
      return {
        operationLock: {
          locked: true,
          operationId: '00000000-0000-4000-8000-000000000001',
          currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
        },
      };
    },
    ...overrides,
  };
}

function fakeActivity() {
  const records = [];
  return {
    records,
    createActivityLog: async (record) => {
      records.push(record);
      return { id: records.length };
    },
  };
}

test('production restore route is exposed through preload/controller but UI action remains disabled', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const preload = read('src/main/preload.js');
  const api = read('src/main/features/settings/settings.api.js');
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const html = read('src/main/features/settings/index.html');

  assert.match(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.match(controller, /settingsService\.executeProductionRestore/);
  assert.match(
    preload,
    /restoreBackup:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/backups\/restore', payload\)/
  );
  assert.match(api, /async function restoreBackup/);
  assert.match(html, /id="restoreBackupButton"[^>]*disabled/);
  assert.doesNotMatch(renderer, /addListener\(\$id\('restoreBackupButton'\), 'click'/);
  assert.doesNotMatch(renderer, /handleExecuteRestore|location\.reload/);
});

test('pending production activation blocks restore before engine invocation', async () => {
  const repository = fakeRepository();
  const activity = fakeActivity();
  let engineCalled = false;
  const result = await execution.executeProductionRestore(
    {
      sourcePackagePath: 'D:\\backups\\certified-backup.json',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmationId: '00000000-0000-4000-8000-000000000003',
      preflightDigest: 'b'.repeat(64),
      executionPolicyDigest: 'c'.repeat(64),
    },
    {
      repository,
      activityRepository: activity,
      readActivationRecord: async () => pendingActivationRecord(),
      restoreEngine: async () => {
        engineCalled = true;
        return { ok: true };
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESTORE_PRODUCTION_EXECUTION_BLOCKED');
  assert.equal(result.restoreExecuted, false);
  assert.equal(result.noDataCommitted, true);
  assert.equal(engineCalled, false);
  assert(result.blockerCodes.includes('RESTORE_PRODUCTION_ACTIVATION_RECORD.NOT_APPROVED'));
  assert(result.blockerCodes.includes('RESTORE_PRODUCTION_PRODUCTION_FEATURE_FLAG.DISABLED'));
  assert.deepEqual(repository.calls.slice(0, 2), ['package_verification', 'package_eligibility']);
  assert.equal(activity.records[0].status, 'blocked');
  assert.doesNotMatch(JSON.stringify(result), /DATABASE_URL|PGPASSWORD|postgres:\/\/[^"]+@/i);
});

test('malformed request and missing package are rejected with stable safe errors', async () => {
  const repository = fakeRepository();
  const result = await execution.executeProductionRestore(null, {
    repository,
    activityRepository: fakeActivity(),
    readActivationRecord: async () => pendingActivationRecord(),
    now: () => new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.ok, false);
  assert(result.blockerCodes.includes('RESTORE_PRODUCTION_PAYLOAD_INVALID'));
  assert(result.blockerCodes.includes('RESTORE_PACKAGE_REQUIRED'));
  assert.equal(result.restoreExecuted, false);
});

test('production route rejects unsafe database identity and missing safety confirmation gates', async () => {
  const repository = fakeRepository({
    getRestoreRecoveryState: async () => ({
      operationId: '00000000-0000-4000-8000-000000000004',
      ownerUserId: 1,
      currentState: recovery.RESTORE_RECOVERY_STATES.IDLE,
      activeOperation: false,
      unresolvedRecoveryState: false,
      safetyBackupReference: null,
    }),
    getRestoreExecutionPolicy: async () => ({ operationLock: { locked: false } }),
  });
  const result = await execution.executeProductionRestore(
    { sourcePackagePath: 'D:\\backups\\certified-backup.json' },
    {
      repository,
      activityRepository: fakeActivity(),
      readActivationRecord: async () => pendingActivationRecord(),
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.restoreExecuted, false);
  assert(result.blockerCodes.includes('RESTORE_SAFETY_BACKUP_REQUIRED'));
  assert(result.blockerCodes.includes('RESTORE_FINAL_CONFIRMATION_REQUIRED'));
  assert.match(
    result.steps.map((step) => `${step.order}:${step.name}:${step.status}`).join('\n'),
    /restore_engine_invocation:not_started/
  );
});

test('activation model sees the route as present but pending record remains non-authorizing', () => {
  const result = activation.assessRestoreProductionActivation({
    record: pendingActivationRecord(),
    productionFeatureFlagEnabled: execution.PRODUCTION_RESTORE_FEATURE_ENABLED,
    productionExecutionRoutePresent: execution.PRODUCTION_RESTORE_ROUTE_PRESENT,
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.productionExecutionRoutePresent, true);
  assert.equal(result.productionFeatureFlagEnabled, false);
  assert.equal(result.activationAuthorized, false);
  assert(!result.blockerCodes.includes('production_execution_route.absent'));
  assert(result.blockerCodes.includes('activation_record.not_approved'));
  assert(result.blockerCodes.includes('production_feature_flag.disabled'));
});
