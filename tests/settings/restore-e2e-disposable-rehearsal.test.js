const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { Pool } = require('pg');

const { loadEnvironment, getDatabaseConfig } = require('../../src/main/config/env');
const { initializeDatabase } = require('../../src/main/database/schema');
const { closeDatabase, getPool } = require('../../src/main/database/connection');
const activityRepository = require('../../src/main/features/activity/activity.repository');
const settingsRepository = require('../../src/main/features/settings/settings.repository');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');
const adapter = require('../../src/main/features/restore-engine/restore-disposable-execution.adapter');

loadEnvironment();

const OWNER_USER_ID = 1;
function currentPrimaryDatabaseName() {
  const config = getDatabaseConfig();
  if (config.connectionString) return new URL(config.connectionString).pathname.replace(/^\//, '');
  return config.database;
}

const primaryDatabase = currentPrimaryDatabaseName();
const createdDatabases = new Set();
const artifactRoot = process.env.RESTORE_E2E_ARTIFACT_DIR || null;
const CONNECTION_TIMEOUT_MS = Number(process.env.RESTORE_CERT_CONNECTION_TIMEOUT_MS || 5000);
const QUERY_TIMEOUT_MS = Number(process.env.RESTORE_CERT_QUERY_TIMEOUT_MS || 30000);
const CLEANUP_QUERY_TIMEOUT_MS = Number(process.env.RESTORE_CERT_CLEANUP_TIMEOUT_MS || 60000);

function uniqueDbName(label) {
  return `${adapter.DISPOSABLE_DB_PREFIX}e2e_${label}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error('invalid identifier');
  return `"${identifier}"`;
}

function configForDatabase(databaseName, options = {}) {
  const config = getDatabaseConfig();
  const bounded = {
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 1000,
    query_timeout: options.cleanup ? CLEANUP_QUERY_TIMEOUT_MS : QUERY_TIMEOUT_MS,
    statement_timeout: options.cleanup ? CLEANUP_QUERY_TIMEOUT_MS : QUERY_TIMEOUT_MS,
  };
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    url.pathname = `/${databaseName}`;
    return { ...config, ...bounded, connectionString: url.toString() };
  }
  return { ...config, ...bounded, database: databaseName };
}

async function adminPool() {
  return new Pool(configForDatabase('postgres'));
}

async function cleanupAdminPool() {
  return new Pool(configForDatabase('postgres', { cleanup: true }));
}

async function createDatabase(databaseName) {
  adapter.assertDisposableDatabaseName(databaseName);
  const pool = await adminPool();
  try {
    await pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    createdDatabases.add(databaseName);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(databaseName) {
  if (!databaseName) return;
  adapter.assertDisposableDatabaseName(databaseName);
  const pool = await cleanupAdminPool();
  const started = Date.now();
  let cleanupStatus = 'passed';
  let cleanupError = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await pool
          .query(`ALTER DATABASE ${quoteIdentifier(databaseName)} WITH ALLOW_CONNECTIONS false`)
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
          [databaseName]
        );
        try {
          await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
        } catch (error) {
          if (error.code !== '42601') throw error;
          await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
        }
        cleanupStatus = 'passed';
        cleanupError = null;
        break;
      } catch (error) {
        cleanupStatus = 'failed';
        cleanupError = error;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    const remaining = await pool
      .query('SELECT datname FROM pg_database WHERE datname = $1', [databaseName])
      .catch(() => ({ rows: [{ datname: databaseName }] }));
    if (remaining.rows.length) cleanupStatus = 'retained_for_manual_cleanup';
    else createdDatabases.delete(databaseName);
    await writeArtifact(`cleanup-${databaseName}.json`, {
      databaseName,
      cleanupStatus,
      elapsedMs: Date.now() - started,
      manualCleanupRequired: remaining.rows.length > 0,
      code: cleanupError?.code || null,
      message: cleanupError ? String(cleanupError.message || cleanupError).slice(0, 500) : null,
    });
  } finally {
    await pool.end();
  }
}

async function withDatabase(databaseName, callback) {
  const previousPgDatabase = process.env.PGDATABASE;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  await closeDatabase();
  process.env.PGDATABASE = databaseName;
  if (previousDatabaseUrl) {
    const url = new URL(previousDatabaseUrl);
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.toString();
  }
  try {
    return await callback();
  } finally {
    await closeDatabase();
    if (previousPgDatabase === undefined) delete process.env.PGDATABASE;
    else process.env.PGDATABASE = previousPgDatabase;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function withPool(databaseName, callback) {
  const pool = new Pool(configForDatabase(databaseName));
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function setupDatabase(databaseName, marker) {
  await createDatabase(databaseName);
  await withDatabase(databaseName, async () => {
    await initializeDatabase();
    await getPool().query('DELETE FROM categories WHERE name LIKE $1', ['RESTORE_E2E_%']);
    await getPool().query(
      `INSERT INTO categories (name, description, is_active) VALUES ($1, $2, true)`,
      [`RESTORE_E2E_${marker}`, `${marker} rehearsal fixture`]
    );
  });
}

async function createBackupPackage(databaseName, filePath) {
  const pool = new Pool(configForDatabase(databaseName));
  try {
    return await settingsRepository.exportBackup(filePath, null, { pool });
  } finally {
    await pool.end();
  }
}

async function categoryNames(databaseName) {
  return withPool(databaseName, async (pool) => {
    const result = await pool.query(
      `SELECT name FROM categories WHERE name LIKE 'RESTORE_E2E_%' ORDER BY name`
    );
    return result.rows.map((row) => row.name);
  });
}

async function primaryMarkerNames() {
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
  await initializeDatabase();
  const result = await getPool().query(
    `SELECT name FROM categories WHERE name LIKE 'RESTORE_E2E_%' ORDER BY name`
  );
  return result.rows.map((row) => row.name);
}

async function writeArtifact(fileName, payload) {
  if (!artifactRoot) return;
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(path.join(artifactRoot, fileName), `${JSON.stringify(payload, null, 2)}\n`);
}

async function recordDryRunEvidence({ operationId, sourcePackagePath, source }) {
  const verification = await settingsRepository.verifyRestorePackage(sourcePackagePath);
  const eligibility = await settingsRepository.assessRestoreEligibility(sourcePackagePath);
  assert.equal(verification.verificationStatus, 'passed');
  assert.equal(eligibility.eligibilityStatus, 'eligible_for_authorization');
  return activityRepository.createActivityLog({
    userId: OWNER_USER_ID,
    action: 'backup.restore.dry_run_certification_report',
    status: 'success',
    message: 'Restore dry-run certification passed for disposable e2e rehearsal.',
    metadata: {
      reportType: 'restore_dry_run_certification_report',
      reportCorrelationId: `restore-e2e:${operationId}`,
      certificationStatus: 'dry_run_certification_passed',
      packageSummary: {
        fileName: path.basename(sourcePackagePath),
        filePath: sourcePackagePath,
        backupId: source.backup.manifest.backupIdentity.backupId,
        correlationId: source.backup.manifest.backupIdentity.correlationId,
        manifestVersion: source.backup.manifest.manifestVersion,
        certificationStatus: source.backup.certification.status,
      },
      verificationSummary: { status: verification.verificationStatus },
      eligibilitySummary: { status: eligibility.eligibilityStatus },
      authorizationSummary: {
        userAuthenticated: true,
        role: 'Admin',
        permissionOutcome: 'passed',
        authorizationAssessmentStatus: 'authorization_assessment_would_pass',
      },
      noRestoreExecuted: true,
      restoreUnavailable: true,
      restoreEligible: false,
    },
  });
}

async function createPreparedOperation({ sourcePackagePath, safetyPackagePath }) {
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
  await initializeDatabase();
  const source = await adapter.readCertifiedPackage(sourcePackagePath);
  const safety = await adapter.readCertifiedPackage(safetyPackagePath);
  let lock = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    lock = await settingsRepository.acquireRestoreOperationLock({
      ownerUserId: OWNER_USER_ID,
      sourceBackupId: source.backup.manifest.backupIdentity.backupId,
      sourcePackageChecksum: source.checksum,
      sourcePackageFingerprint: source.checksum,
      sourceManifestVersion: source.backup.manifest.manifestVersion,
    });
    if (lock.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(lock.ok, true, lock.message);
  await settingsRepository.transitionRestoreOperation({
    operationId: lock.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
  });
  const verified = await settingsRepository.transitionRestoreOperation({
    operationId: lock.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    safetyBackupReference: {
      safetyBackupId: safety.backup.manifest.backupIdentity.backupId,
      filePath: safetyPackagePath,
      checksum: safety.checksum,
      backupLogId: null,
    },
  });
  assert.equal(verified.ok, true, verified.message);
  return { operationId: lock.operationId, source, safety };
}

async function createConfirmation({ prepared, sourcePackagePath, targetDatabase }) {
  await recordDryRunEvidence({
    operationId: prepared.operationId,
    sourcePackagePath,
    source: prepared.source,
  });
  const result = await settingsRepository.createRestoreFinalConfirmation({
    operationId: prepared.operationId,
    ownerUserId: OWNER_USER_ID,
    typedPhrase: 'RESTORE DATABASE',
    targetDatabaseReference: adapter.disposableTargetIdentity(targetDatabase),
  });
  assert.equal(result.ok, true, result.message || JSON.stringify(result.blockers));
  return result.confirmation;
}

function issueToken({ prepared, targetDatabase }) {
  return adapter.issueDisposableExecutionToken({
    operationId: prepared.operationId,
    ownerUserId: OWNER_USER_ID,
    sourcePackageChecksum: prepared.source.checksum,
    safetyBackupChecksum: prepared.safety.checksum,
    primaryDatabaseName: primaryDatabase,
    disposableDatabaseName: targetDatabase,
    preflightDigest: `restore-e2e-preflight:${prepared.operationId}`,
    executionPolicyDigest: `restore-e2e-policy:${prepared.operationId}`,
  });
}

async function executeRehearsal({
  prepared,
  sourcePackagePath,
  safetyPackagePath,
  targetDatabase,
  confirmationId,
  injectFailureStage = null,
}) {
  const token = issueToken({ prepared, targetDatabase });
  const restartCalls = [];
  const sessionCalls = [];
  const result = await adapter.executeDisposableRestore({
    tokenId: token.tokenId,
    confirmationId,
    operationId: prepared.operationId,
    ownerUserId: OWNER_USER_ID,
    sourcePackagePath,
    safetyBackupPath: safetyPackagePath,
    disposableDatabaseName: targetDatabase,
    preflightDigest: `restore-e2e-preflight:${prepared.operationId}`,
    executionPolicyDigest: `restore-e2e-policy:${prepared.operationId}`,
    injectFailureStage,
    restartAdapter: { requestRestart: async (payload) => restartCalls.push(payload) },
    sessionAdapter: { invalidateAll: async (payload) => sessionCalls.push(payload) },
  });
  return { result, token, restartCalls, sessionCalls };
}

async function transitionStates(operationId) {
  const result = await getPool().query(
    `
      SELECT
        metadata->>'previousState' AS previous_state,
        metadata->>'currentState' AS current_state,
        status,
        message,
        created_at
      FROM activity_logs
      WHERE action = 'backup.restore.recovery_state'
        AND metadata->>'operationId' = $1
      ORDER BY id ASC
    `,
    [operationId]
  );
  return result.rows.map((row) => ({
    previousState: row.previous_state,
    currentState: row.current_state,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  }));
}

async function confirmationStatus(operationId) {
  const result = await getPool().query(
    `
      SELECT confirmation_id, status, consumed_at, expires_at
      FROM restore_final_confirmations
      WHERE operation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operationId]
  );
  return result.rows[0] || null;
}

async function currentOperation(operationId) {
  const result = await getPool().query(
    `
      SELECT operation_id, state, previous_state, target_database_name, target_database_disposable,
             terminal_at, failure_category, sanitized_failure_summary
      FROM restore_operations
      WHERE operation_id = $1
    `,
    [operationId]
  );
  return result.rows[0] || null;
}

async function assertStarStartupNormal() {
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
  await initializeDatabase();
  const startup = await settingsRepository.getRestoreStartupRecoveryAssessment();
  assert.equal(startup.startupRecovery.startupMode, 'NORMAL');
  assert.equal(startup.startupRecovery.maintenanceModeRequired, false);
  return startup;
}

async function createPackageSet(label) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `epos-restore-e2e-${label}-`));
  const sourceDb = uniqueDbName(`${label}_source`);
  const targetDb = uniqueDbName(`${label}_target`);
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, `${label.toUpperCase()}_SOURCE`);
  await setupDatabase(targetDb, `${label.toUpperCase()}_TARGET`);
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  return { tmp, sourceDb, targetDb, sourcePath, safetyPath };
}

test.after(async () => {
  await closeDatabase();
  for (const databaseName of Array.from(createdDatabases)) {
    await dropDatabase(databaseName).catch(() => {});
  }
  process.env.PGDATABASE = primaryDatabase;
});

test('governed disposable restore rehearsal covers success, rollback, restart, and replay', async () => {
  const beforePrimaryMarkers = await primaryMarkerNames();

  const success = await createPackageSet('success');
  const preparedSuccess = await createPreparedOperation({
    sourcePackagePath: success.sourcePath,
    safetyPackagePath: success.safetyPath,
  });
  const successConfirmation = await createConfirmation({
    prepared: preparedSuccess,
    sourcePackagePath: success.sourcePath,
    targetDatabase: success.targetDb,
  });
  const successRun = await executeRehearsal({
    prepared: preparedSuccess,
    sourcePackagePath: success.sourcePath,
    safetyPackagePath: success.safetyPath,
    targetDatabase: success.targetDb,
    confirmationId: successConfirmation.confirmationId,
  });
  assert.equal(successRun.result.ok, true);
  assert.equal(successRun.result.verification.verificationStatus, 'passed');
  assert.deepEqual(await categoryNames(success.targetDb), ['RESTORE_E2E_SUCCESS_SOURCE']);
  const successTransitions = await transitionStates(preparedSuccess.operationId);
  assert.deepEqual(
    successTransitions.map((item) => item.currentState),
    [
      'SAFETY_BACKUP_IN_PROGRESS',
      'SAFETY_BACKUP_VERIFIED',
      'RESTORE_IN_PROGRESS',
      'RESTORE_APPLIED',
      'POST_RESTORE_VERIFYING',
      'COMPLETED',
    ]
  );
  assert.equal((await currentOperation(preparedSuccess.operationId)).state, 'COMPLETED');
  assert.equal((await confirmationStatus(preparedSuccess.operationId)).status, 'CONSUMED');
  await assert.rejects(
    () =>
      adapter.executeDisposableRestore({
        tokenId: successRun.token.tokenId,
        confirmationId: successConfirmation.confirmationId,
        operationId: preparedSuccess.operationId,
        ownerUserId: OWNER_USER_ID,
        sourcePackagePath: success.sourcePath,
        safetyBackupPath: success.safetyPath,
        disposableDatabaseName: success.targetDb,
        preflightDigest: `restore-e2e-preflight:${preparedSuccess.operationId}`,
        executionPolicyDigest: `restore-e2e-policy:${preparedSuccess.operationId}`,
      }),
    /REPLAYED|Terminal|NOT_READY/
  );
  const successStartup = await assertStarStartupNormal();

  const failure = await createPackageSet('failure');
  const preparedFailure = await createPreparedOperation({
    sourcePackagePath: failure.sourcePath,
    safetyPackagePath: failure.safetyPath,
  });
  const failureConfirmation = await createConfirmation({
    prepared: preparedFailure,
    sourcePackagePath: failure.sourcePath,
    targetDatabase: failure.targetDb,
  });
  const failureRun = await executeRehearsal({
    prepared: preparedFailure,
    sourcePackagePath: failure.sourcePath,
    safetyPackagePath: failure.safetyPath,
    targetDatabase: failure.targetDb,
    confirmationId: failureConfirmation.confirmationId,
    injectFailureStage: 'post_verification',
  });
  assert.equal(failureRun.result.ok, false);
  assert.equal(failureRun.result.rollbackApplied, true);
  assert.deepEqual(await categoryNames(failure.targetDb), ['RESTORE_E2E_FAILURE_TARGET']);
  const failureTransitions = await transitionStates(preparedFailure.operationId);
  assert.deepEqual(
    failureTransitions.map((item) => item.currentState),
    [
      'SAFETY_BACKUP_IN_PROGRESS',
      'SAFETY_BACKUP_VERIFIED',
      'RESTORE_IN_PROGRESS',
      'RESTORE_APPLIED',
      'POST_RESTORE_VERIFYING',
      'FAILED_ROLLBACK_REQUIRED',
      'ROLLBACK_IN_PROGRESS',
      'ROLLED_BACK',
    ]
  );
  assert.equal((await currentOperation(preparedFailure.operationId)).state, 'ROLLED_BACK');
  assert.equal((await confirmationStatus(preparedFailure.operationId)).status, 'CONSUMED');
  const rolledBackStartup = await assertStarStartupNormal();

  const restart = await createPackageSet('restart');
  const preparedRestart = await createPreparedOperation({
    sourcePackagePath: restart.sourcePath,
    safetyPackagePath: restart.safetyPath,
  });
  const restartTarget = adapter.disposableTargetIdentity(restart.targetDb);
  await settingsRepository.transitionRestoreOperation({
    operationId: preparedRestart.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
    targetDatabaseReference: restartTarget,
  });
  await settingsRepository.transitionRestoreOperation({
    operationId: preparedRestart.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
    targetDatabaseReference: restartTarget,
  });
  const appliedStartup = await assertStarStartupNormal();
  assert.equal(appliedStartup.ignoredRestoreOperation.operationId, preparedRestart.operationId);
  await settingsRepository.transitionRestoreOperation({
    operationId: preparedRestart.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
    targetDatabaseReference: restartTarget,
  });
  await settingsRepository.transitionRestoreOperation({
    operationId: preparedRestart.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
    targetDatabaseReference: restartTarget,
    failureCategory: 'restart_rehearsal_post_check_failed',
    failureSummary: 'Controlled restart recovery rehearsal failure.',
  });
  await settingsRepository.transitionRestoreOperation({
    operationId: preparedRestart.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recovery.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
    targetDatabaseReference: restartTarget,
  });
  const rollbackInProgressStartup = await assertStarStartupNormal();
  assert.equal(
    rollbackInProgressStartup.ignoredRestoreOperation.currentState,
    'MANUAL_RECOVERY_REQUIRED'
  );
  assert.equal(
    (await currentOperation(preparedRestart.operationId)).state,
    'MANUAL_RECOVERY_REQUIRED'
  );

  assert.deepEqual(await primaryMarkerNames(), beforePrimaryMarkers);
  assert.throws(() => adapter.assertDisposableDatabaseName(primaryDatabase), /disposable/);
  assert.throws(() => adapter.assertDisposableDatabaseName('star'), /disposable/);

  await writeArtifact('success-run-summary.json', {
    operationId: preparedSuccess.operationId,
    targetDatabase: success.targetDb,
    transitions: successTransitions,
    confirmation: await confirmationStatus(preparedSuccess.operationId),
    verificationStatus: successRun.result.verification.verificationStatus,
    certificationChecks: successRun.result.verification.certificationChecks,
    restartCalls: successRun.restartCalls,
    sessionCalls: successRun.sessionCalls,
    starStartupMode: successStartup.startupRecovery.startupMode,
  });
  await writeArtifact('controlled-failure-rollback-summary.json', {
    operationId: preparedFailure.operationId,
    targetDatabase: failure.targetDb,
    transitions: failureTransitions,
    rollbackApplied: failureRun.result.rollbackApplied,
    rollbackVerification: failureRun.result.rollback?.verification,
    finalOperation: await currentOperation(preparedFailure.operationId),
    starStartupMode: rolledBackStartup.startupRecovery.startupMode,
  });
  await writeArtifact('restart-recovery-summary.json', {
    appliedOperationId: preparedRestart.operationId,
    appliedStartup: appliedStartup.startupRecoverySnapshot,
    appliedIgnoredOperation: appliedStartup.ignoredRestoreOperation,
    rollbackInProgressStartup: rollbackInProgressStartup.startupRecoverySnapshot,
    rollbackInProgressIgnoredOperation: rollbackInProgressStartup.ignoredRestoreOperation,
    finalOperation: await currentOperation(preparedRestart.operationId),
  });
  await writeArtifact('production-safety-summary.json', {
    primaryDatabase,
    primaryMarkersBefore: beforePrimaryMarkers,
    primaryMarkersAfter: await primaryMarkerNames(),
    productionRestoreRemainsDisabled: true,
    primaryTargetRejected: true,
  });

  await dropDatabase(success.sourceDb);
  await dropDatabase(success.targetDb);
  await dropDatabase(failure.sourceDb);
  await dropDatabase(failure.targetDb);
  await dropDatabase(restart.sourceDb);
  await dropDatabase(restart.targetDb);
});
