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

function approvedActivationRecord() {
  const technicalCertification = Object.fromEntries(
    activation.REQUIRED_CERTIFICATION_EVIDENCE.map((key) => [
      key,
      {
        status: 'passed',
        evidenceReference: `test-evidence/${key}.json`,
        evidenceHash: 'a'.repeat(64),
      },
    ])
  );
  return {
    schemaVersion: activation.RESTORE_ACTIVATION_SCHEMA_VERSION,
    product: activation.RESTORE_PRODUCT,
    component: activation.RESTORE_COMPONENT,
    releaseScope: activation.RESTORE_ACTIVATION_SCOPE,
    applicationVersion: '1.0.0',
    backupFormatVersion: activation.REQUIRED_BACKUP_FORMAT_VERSION,
    activationStatus: 'approved',
    restoreStrategy: activation.APPROVED_RESTORE_STRATEGIES[0],
    safetyBackupPolicy: activation.REQUIRED_SAFETY_BACKUP_POLICY,
    technicalCertification,
    authorization: {
      governanceReviewStatus: 'approved',
      securityReviewStatus: 'approved',
      releaseApprovalStatus: 'approved',
      approverIdentity: 'owner-approved-test-scope',
      approvalAuthority: 'Enterprise POS Release Authority',
      approvalTimestamp: '2026-07-19T00:00:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      revoked: false,
      testOnly: false,
    },
  };
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
        unresolvedRecoveryState: true,
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
    validateManagedDatabaseIdentity: async () => {
      calls.push('managed_database_identity');
      return { ok: true, identityVerified: true, code: 'MANAGED_DATABASE_IDENTITY_VERIFIED' };
    },
    getManagedDatabaseIdentity: async () => ({
      schemaVersion: 1,
      product: 'Enterprise POS',
      component: 'installer-managed-postgres',
      installationId: 'installation-1',
      clusterId: 'cluster-1',
      databaseId: 'database-1',
      databaseName: 'enterprise_pos',
      fingerprint: 'b'.repeat(64),
    }),
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

test('production restore route is exposed through preload/controller and guarded UI execution', () => {
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
  assert.match(renderer, /function handleExecuteRestore/);
  assert.match(
    renderer,
    /addListener\(\$id\('restoreBackupButton'\), 'click', handleExecuteRestore\)/
  );
  assert.match(renderer, /policy\.restoreExecutionAvailable === true/);
  assert.doesNotMatch(renderer, /location\.reload/);
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
  assert(!result.blockerCodes.includes('RESTORE_PRODUCTION_PRODUCTION_FEATURE_FLAG.DISABLED'));
  assert.deepEqual(repository.calls.slice(0, 2), ['package_verification', 'package_eligibility']);
  assert(repository.calls.includes('managed_database_identity'));
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

test('production route rejects managed database identity mismatch before engine invocation', async () => {
  const repository = fakeRepository({
    validateManagedDatabaseIdentity: async () => {
      repository.calls.push('managed_database_identity');
      return {
        ok: false,
        code: 'MANAGED_DATABASE_IDENTITY_MISMATCH',
        identityVerified: false,
        blockers: ['identity.databaseId.mismatch'],
        message: 'Managed database identity mismatch. Restore remains blocked.',
      };
    },
  });
  let engineCalled = false;
  const result = await execution.executeProductionRestore(
    {
      sourcePackagePath: 'D:\\backups\\certified-backup.json',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmationId: '00000000-0000-4000-8000-000000000003',
    },
    {
      repository,
      activityRepository: fakeActivity(),
      readActivationRecord: async () => approvedActivationRecord(),
      productionFeatureFlagEnabled: true,
      restoreEngine: async () => {
        engineCalled = true;
        return { ok: true };
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(engineCalled, false);
  assert(result.blockerCodes.includes('MANAGED_DATABASE_IDENTITY_MISMATCH'));
});

test('production route rejects consumed confirmation replay before package verification', async () => {
  const repository = fakeRepository({
    validateRestoreFinalConfirmation: async () => {
      repository.calls.push('final_confirmation_replay_check');
      return {
        ok: false,
        code: 'RESTORE_CONFIRMATION_ALREADY_CONSUMED',
        valid: false,
      };
    },
  });
  let engineCalled = false;
  const result = await execution.executeProductionRestore(
    {
      sourcePackagePath: 'D:\\backups\\certified-backup.json',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmationId: '00000000-0000-4000-8000-000000000003',
    },
    {
      repository,
      activityRepository: fakeActivity(),
      readActivationRecord: async () => approvedActivationRecord(),
      productionFeatureFlagEnabled: true,
      restoreEngine: async () => {
        engineCalled = true;
        return { ok: true };
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESTORE_CONFIRMATION_ALREADY_CONSUMED');
  assert.equal(result.restoreExecuted, false);
  assert.equal(engineCalled, false);
  assert.deepEqual(repository.calls, ['final_confirmation_replay_check']);
});

test('approved production route invokes engine after package, identity, safety, and confirmation gates', async () => {
  const repository = fakeRepository();
  const calls = [];
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
      activityRepository: fakeActivity(),
      readActivationRecord: async () => approvedActivationRecord(),
      productionFeatureFlagEnabled: true,
      restoreEngine: async () => {
        calls.push('restore_engine');
        return { ok: true, tablesRestored: 4, rowsRestored: 10 };
      },
      postRestoreValidator: async () => {
        calls.push('post_restore_validation');
        return { ok: true };
      },
      restartAdapter: {
        requestRestart: async () => calls.push('restart_requested'),
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.restoreExecuted, true);
  assert.deepEqual(calls, ['restore_engine', 'post_restore_validation', 'restart_requested']);
  assert.match(
    result.steps.map((step) => `${step.order}:${step.name}:${step.status}`).join('\n'),
    /package_verification:passed[\s\S]*managed_database_identity:passed[\s\S]*production_activation:passed[\s\S]*safety_backup_verification:passed[\s\S]*restore_engine_invocation:passed[\s\S]*post_restore_validation:passed/
  );
});

test('production route returns structured safe failure when engine guard rejects execution', async () => {
  const repository = fakeRepository();
  const result = await execution.executeProductionRestore(
    {
      sourcePackagePath: 'D:\\backups\\certified-backup.json',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmationId: '00000000-0000-4000-8000-000000000003',
    },
    {
      repository,
      activityRepository: fakeActivity(),
      readActivationRecord: async () => approvedActivationRecord(),
      productionFeatureFlagEnabled: true,
      restoreEngine: async () => {
        throw new Error('RESTORE_CONFIRMATION_REQUIRED');
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESTORE_EXECUTION_FAILED');
  assert.equal(result.restoreExecuted, false);
  assert.equal(result.noDataCommitted, true);
  assert.match(result.message, /RESTORE_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(JSON.stringify(result), /DATABASE_URL|PGPASSWORD|postgres:\/\/[^"]+@/i);
});

test('approved production route still blocks dangerous unresolved recovery states', async () => {
  const repository = fakeRepository({
    getRestoreRecoveryState: async () => ({
      operationId: '00000000-0000-4000-8000-000000000001',
      ownerUserId: 1,
      currentState: recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
      activeOperation: true,
      unresolvedRecoveryState: true,
      safetyBackupReference: {
        safetyBackupId: '00000000-0000-4000-8000-000000000002',
        checksum: 'a'.repeat(64),
        backupLogId: 42,
        filePath: 'D:\\safe\\safety-backup.json',
      },
    }),
  });
  let engineCalled = false;
  const result = await execution.executeProductionRestore(
    {
      sourcePackagePath: 'D:\\backups\\certified-backup.json',
      operationId: '00000000-0000-4000-8000-000000000001',
      confirmationId: '00000000-0000-4000-8000-000000000003',
    },
    {
      repository,
      activityRepository: fakeActivity(),
      readActivationRecord: async () => approvedActivationRecord(),
      productionFeatureFlagEnabled: true,
      restoreEngine: async () => {
        engineCalled = true;
        return { ok: true };
      },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(engineCalled, false);
  assert(result.blockerCodes.includes('RESTORE_PRODUCTION_RECOVERY_STATE.UNRESOLVED'));
  assert(result.blockerCodes.includes('RESTORE_RECOVERY_STATE_UNRESOLVED'));
});

test('activation model sees the route as present but pending record remains non-authorizing', () => {
  const result = activation.assessRestoreProductionActivation({
    record: pendingActivationRecord(),
    productionFeatureFlagEnabled: execution.PRODUCTION_RESTORE_FEATURE_ENABLED,
    productionExecutionRoutePresent: execution.PRODUCTION_RESTORE_ROUTE_PRESENT,
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.productionExecutionRoutePresent, true);
  assert.equal(result.productionFeatureFlagEnabled, true);
  assert.equal(result.activationAuthorized, false);
  assert(!result.blockerCodes.includes('production_execution_route.absent'));
  assert(result.blockerCodes.includes('activation_record.not_approved'));
  assert(!result.blockerCodes.includes('production_feature_flag.disabled'));
});
