const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const activation = require('../../src/main/features/restore-engine/restore-production-activation.model');
const governance = require('../../src/main/features/restore-engine/restore-production-governance.model');
const policy = require('../../src/main/features/restore-engine/restore-execution-policy.model');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');

const repoRoot = path.resolve(__dirname, '..', '..');
const validHash = 'a'.repeat(64);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function approvedRecord(overrides = {}) {
  const technicalCertification = Object.fromEntries(
    activation.REQUIRED_CERTIFICATION_EVIDENCE.map((key) => [
      key,
      {
        status: 'passed',
        evidenceReference: `test-evidence/${key}.json`,
        evidenceHash: validHash,
      },
    ])
  );
  return {
    schemaVersion: activation.RESTORE_ACTIVATION_SCHEMA_VERSION,
    product: activation.RESTORE_PRODUCT,
    component: activation.RESTORE_COMPONENT,
    releaseScope: activation.RESTORE_ACTIVATION_SCOPE,
    applicationVersion: '1.0.0',
    databaseSchemaVersion: '1',
    backupFormatVersion: activation.REQUIRED_BACKUP_FORMAT_VERSION,
    activationStatus: 'approved',
    restoreStrategy: activation.APPROVED_RESTORE_STRATEGIES[0],
    safetyBackupPolicy: activation.REQUIRED_SAFETY_BACKUP_POLICY,
    technicalCertification,
    authorization: {
      governanceReviewStatus: 'approved',
      securityReviewStatus: 'approved',
      releaseApprovalStatus: 'approved',
      approverIdentity: 'release-owner',
      approvalAuthority: 'Enterprise POS Release Authority',
      approvalTimestamp: '2026-07-19T00:00:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      revoked: false,
      testOnly: false,
    },
    ...overrides,
  };
}

test('pending restore production activation record is non-authorizing', () => {
  const pending = readJson('resources/restore/production-activation.pending.json');
  const result = activation.assessRestoreProductionActivation({
    record: pending,
    currentApplicationVersion: '1.0.0',
    currentBackupFormatVersion: '1.0',
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.activationAuthorized, false);
  assert.equal(result.productionActivationAvailable, false);
  assert.equal(result.restoreExecutionAvailable, false);
  assert(result.blockerCodes.includes('activation_record.not_approved'));
  assert(result.blockerCodes.includes('authorization.approver'));
  assert(result.blockerCodes.includes('production_feature_flag.disabled'));
  assert(result.blockerCodes.includes('production_execution_route.absent'));
});

test('restore activation requires complete evidence, live approval, and production controls', () => {
  const record = approvedRecord();
  const result = activation.assessRestoreProductionActivation({
    record,
    currentApplicationVersion: '1.0.0',
    currentSchemaVersion: '1',
    currentBackupFormatVersion: '1.0',
    productionFeatureFlagEnabled: true,
    productionExecutionRoutePresent: true,
    databaseIdentity: governance.resolveDatabaseIdentity({
      host: 'localhost',
      port: 5432,
      database: 'enterprise_pos',
    }),
    recoveryState: recovery.createIdleRecoveryState('2026-07-19T00:00:00.000Z'),
    operationLock: { locked: false },
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.activationAuthorized, true);
  assert.equal(result.productionActivationAvailable, true);
  assert.equal(result.restoreExecutionAvailable, true);
  assert.equal(result.blockers.length, 0);
  assert.match(result.recordDigest, /^[a-f0-9]{64}$/);
});

test('restore activation allows safety-verified handoff but blocks dangerous unresolved recovery', () => {
  const common = {
    record: approvedRecord(),
    currentApplicationVersion: '1.0.0',
    currentSchemaVersion: '1',
    currentBackupFormatVersion: '1.0',
    productionFeatureFlagEnabled: true,
    productionExecutionRoutePresent: true,
    databaseIdentity: governance.resolveDatabaseIdentity({
      host: 'localhost',
      port: 5432,
      database: 'enterprise_pos',
    }),
    operationLock: { locked: false },
    now: new Date('2026-07-19T00:00:00.000Z'),
  };

  const safetyReady = activation.assessRestoreProductionActivation({
    ...common,
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      unresolvedRecoveryState: true,
      safetyBackupReference: { checksum: validHash, filePath: 'D:\\backups\\safety.json' },
    },
  });

  assert.equal(safetyReady.activationAuthorized, true);
  assert(!safetyReady.blockerCodes.includes('recovery_state.unresolved'));

  const dangerous = activation.assessRestoreProductionActivation({
    ...common,
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
      unresolvedRecoveryState: true,
    },
  });

  assert.equal(dangerous.activationAuthorized, false);
  assert(dangerous.blockerCodes.includes('recovery_state.unresolved'));
});

test('restore activation rejects mismatched, expired, revoked, and test-only evidence', () => {
  const bad = approvedRecord({
    product: 'Other POS',
    backupFormatVersion: '9.9',
    authorization: {
      ...approvedRecord().authorization,
      expiresAt: '2026-01-01T00:00:00.000Z',
      revoked: true,
      testOnly: true,
    },
  });
  bad.technicalCertification.failure_matrix.evidenceHash = 'not-a-hash';

  const result = activation.assessRestoreProductionActivation({
    record: bad,
    currentApplicationVersion: '1.0.0',
    currentSchemaVersion: '1',
    currentBackupFormatVersion: '1.0',
    productionFeatureFlagEnabled: true,
    productionExecutionRoutePresent: true,
    now: new Date('2026-07-19T00:00:00.000Z'),
  });

  assert.equal(result.activationAuthorized, false);
  assert(result.blockerCodes.includes('activation_record.product'));
  assert(result.blockerCodes.includes('activation_record.backup_format'));
  assert(result.blockerCodes.includes('technical_certification.failure_matrix.evidence_hash'));
  assert(result.blockerCodes.includes('authorization.expired'));
  assert(result.blockerCodes.includes('authorization.revoked'));
  assert(result.blockerCodes.includes('authorization.test_only'));
});

test('restore execution policy includes production activation blockers and stays disabled', () => {
  const result = policy.createRestoreExecutionPolicy({
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      safetyBackupReference: { checksum: validHash },
    },
    packageVerification: { verificationStatus: 'passed' },
    packageEligibility: { eligibilityStatus: 'eligible_for_authorization' },
    authorization: { authorizationStatus: 'authorization_assessment_passed' },
    databaseHealth: { status: 'healthy' },
    operationLock: { locked: false },
    productionGovernance: {
      databaseIdentity: governance.resolveDatabaseIdentity({
        host: 'localhost',
        port: 5432,
        database: 'enterprise_pos',
      }),
    },
  });

  assert.equal(result.restoreExecutionAvailable, false);
  assert.equal(result.productionActivation.activationAuthorized, false);
  assert.match(
    result.blockers.map((item) => item.code).join('\n'),
    /production_activation\.activation_record\.missing/
  );
});
