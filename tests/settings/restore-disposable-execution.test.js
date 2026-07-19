const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { Pool } = require('pg');

const { loadEnvironment, getDatabaseConfig } = require('../../src/main/config/env');
const { initializeDatabase } = require('../../src/main/database/schema');
const { closeDatabase, getPool } = require('../../src/main/database/connection');
const settingsRepository = require('../../src/main/features/settings/settings.repository');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');
const adapter = require('../../src/main/features/restore-engine/restore-disposable-execution.adapter');

loadEnvironment();

const primaryDatabase = getDatabaseConfig().database;
const createdDatabases = new Set();
const RUN_ID = process.env.RESTORE_CERT_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot =
  process.env.RESTORE_CERT_ARTIFACT_DIR ||
  path.join(repoRootForArtifacts(), 'test-artifacts', 'restore-disposable-certification', RUN_ID);
const CONNECTION_TIMEOUT_MS = Number(process.env.RESTORE_CERT_CONNECTION_TIMEOUT_MS || 5000);
const QUERY_TIMEOUT_MS = Number(process.env.RESTORE_CERT_QUERY_TIMEOUT_MS || 30000);

function repoRootForArtifacts() {
  return path.resolve(__dirname, '..', '..');
}

function safeDatabaseIdentity(databaseName) {
  const config = getDatabaseConfig();
  return {
    host:
      config.host || (config.connectionString ? new URL(config.connectionString).hostname : null),
    port: Number(
      config.port ||
        (config.connectionString ? new URL(config.connectionString).port || 5432 : 5432)
    ),
    database: databaseName,
    userPresent: Boolean(
      config.user || (config.connectionString ? new URL(config.connectionString).username : null)
    ),
    passwordPresent: Boolean(
      config.password ||
      (config.connectionString ? new URL(config.connectionString).password : null)
    ),
    connectionStringRedacted: Boolean(config.connectionString),
  };
}

async function writeArtifact(fileName, payload) {
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(path.join(artifactRoot, fileName), `${JSON.stringify(payload, null, 2)}\n`);
}

async function stage(name, databaseName, callback) {
  const startedAt = new Date();
  const started = Date.now();
  try {
    const result = await callback();
    await writeArtifact(`stage-${started}-${name}.json`, {
      stage: name,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      targetDatabase: safeDatabaseIdentity(databaseName || null),
      status: 'passed',
    });
    return result;
  } catch (error) {
    await writeArtifact(`stage-${started}-${name}.json`, {
      stage: name,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      targetDatabase: safeDatabaseIdentity(databaseName || null),
      status: 'failed',
      code: error.code || error.message || 'RESTORE_CERT_STAGE_FAILED',
      message: String(error.message || error).slice(0, 500),
    }).catch(() => {});
    throw error;
  }
}

function uniqueDbName(label) {
  return `${adapter.DISPOSABLE_DB_PREFIX}${label}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error('invalid identifier');
  return `"${identifier}"`;
}

function configForDatabase(databaseName) {
  const config = getDatabaseConfig();
  const bounded = {
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 1000,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
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

async function createDatabase(databaseName) {
  adapter.assertDisposableDatabaseName(databaseName);
  const pool = await adminPool();
  try {
    await stage('create-database', databaseName, () =>
      pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    );
    createdDatabases.add(databaseName);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(databaseName) {
  if (!databaseName) return;
  adapter.assertDisposableDatabaseName(databaseName);
  const pool = await adminPool();
  try {
    await stage('cleanup-disable-connections', databaseName, () =>
      pool
        .query(`ALTER DATABASE ${quoteIdentifier(databaseName)} WITH ALLOW_CONNECTIONS false`)
        .catch((error) => {
          if (error.code !== '55000') throw error;
        })
    );
    await stage('cleanup-terminate-sessions', databaseName, () =>
      pool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [databaseName]
      )
    );
    await stage('cleanup-drop-database', databaseName, async () => {
      try {
        await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
      } catch (error) {
        if (error.code !== '42601') throw error;
        await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
    });
    createdDatabases.delete(databaseName);
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

async function setupDatabase(databaseName, marker) {
  await createDatabase(databaseName);
  await stage('schema-initialization', databaseName, () =>
    withDatabase(databaseName, async () => {
      await initializeDatabase();
      await getPool().query('DELETE FROM categories WHERE name LIKE $1', ['RESTORE_CERT_%']);
      await getPool().query(
        `INSERT INTO categories (name, description, is_active) VALUES ($1, $2, true)`,
        [`RESTORE_CERT_${marker}`, `${marker} fixture`]
      );
    })
  );
}

async function createBackupPackage(databaseName, filePath) {
  const pool = new Pool(configForDatabase(databaseName));
  try {
    return await stage('backup-export', databaseName, () =>
      settingsRepository.exportBackup(filePath, null, { pool })
    );
  } finally {
    await pool.end();
  }
}

async function packageCategoryNames(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const backup = JSON.parse(raw);
  return (backup.data?.categories || [])
    .map((row) => row.name)
    .filter((name) => String(name).startsWith('RESTORE_CERT_'))
    .sort();
}

async function categoryNames(databaseName) {
  const pool = new Pool(configForDatabase(databaseName));
  try {
    const result = await pool.query(
      `SELECT name FROM categories WHERE name LIKE 'RESTORE_CERT_%' ORDER BY name`
    );
    return result.rows.map((row) => row.name);
  } finally {
    await pool.end();
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

async function createPreparedOperation({ sourcePackagePath, safetyPackagePath, ownerUserId = 1 }) {
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
  await initializeDatabase();
  const source = await adapter.readCertifiedPackage(sourcePackagePath);
  const safety = await adapter.readCertifiedPackage(safetyPackagePath);
  const lock = await settingsRepository.acquireRestoreOperationLock({
    ownerUserId,
    sourcePackageChecksum: source.checksum,
    sourcePackageFingerprint: source.checksum,
    sourceManifestVersion: source.backup.manifest.manifestVersion,
  });
  assert.equal(lock.ok, true, lock.message);
  await settingsRepository.transitionRestoreOperation({
    operationId: lock.operationId,
    requestedByUserId: ownerUserId,
    nextState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
  });
  const verified = await settingsRepository.transitionRestoreOperation({
    operationId: lock.operationId,
    requestedByUserId: ownerUserId,
    nextState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    safetyBackupReference: {
      safetyBackupId: safety.backup.manifest.backupIdentity.backupId,
      filePath: safetyPackagePath,
      checksum: safety.checksum,
      backupLogId: null,
    },
  });
  assert.equal(verified.ok, true, verified.message);
  return { operationId: lock.operationId, source, safety, ownerUserId };
}

async function recordDryRunEvidence({ operationId, source }) {
  await getPool().query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, 'backup.restore.dry_run_certification_report', 'success', $2, $3::jsonb)
    `,
    [
      1,
      'Restore dry-run certification passed for disposable confirmation test.',
      JSON.stringify({
        reportCorrelationId: `dry-run:${operationId}`,
        certificationStatus: 'dry_run_certification_passed',
        packageSummary: {
          backupId: source.backup.manifest.backupIdentity.backupId,
          correlationId: source.backup.manifest.backupIdentity.correlationId,
        },
        noRestoreExecuted: true,
        restoreUnavailable: true,
        restoreEligible: false,
      }),
    ]
  );
}

async function createConfirmation({ prepared, targetDatabase }) {
  await recordDryRunEvidence({ operationId: prepared.operationId, source: prepared.source });
  const targetDatabaseReference = adapter.disposableTargetIdentity(targetDatabase);
  const result = await settingsRepository.createRestoreFinalConfirmation({
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
    typedPhrase: 'RESTORE DATABASE',
    targetDatabaseReference,
  });
  assert.equal(result.ok, true, result.message || JSON.stringify(result.blockers));
  return result.confirmation;
}

function issueToken({ operationId, ownerUserId, source, safety, targetDatabase }) {
  return adapter.issueDisposableExecutionToken({
    operationId,
    ownerUserId,
    sourcePackageChecksum: source.checksum,
    safetyBackupChecksum: safety.checksum,
    primaryDatabaseName: primaryDatabase,
    disposableDatabaseName: targetDatabase,
    preflightDigest: `preflight:${operationId}`,
    executionPolicyDigest: `policy:${operationId}`,
  });
}

async function execute({
  prepared,
  sourcePackagePath,
  safetyPackagePath,
  targetDatabase,
  injectFailureStage,
  confirmationId = null,
}) {
  const confirmation =
    confirmationId || (await createConfirmation({ prepared, targetDatabase })).confirmationId;
  const token = issueToken({
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
    source: prepared.source,
    safety: prepared.safety,
    targetDatabase,
  });
  const restartCalls = [];
  const sessionCalls = [];
  const result = await adapter.executeDisposableRestore({
    tokenId: token.tokenId,
    confirmationId: confirmation,
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
    sourcePackagePath,
    safetyBackupPath: safetyPackagePath,
    disposableDatabaseName: targetDatabase,
    preflightDigest: `preflight:${prepared.operationId}`,
    executionPolicyDigest: `policy:${prepared.operationId}`,
    injectFailureStage,
    restartAdapter: { requestRestart: async (payload) => restartCalls.push(payload) },
    sessionAdapter: { invalidateAll: async (payload) => sessionCalls.push(payload) },
  });
  return { result, token, restartCalls, sessionCalls };
}

test.after(async () => {
  await stage('close-primary-pool-after-tests', primaryDatabase, () => closeDatabase()).catch(
    () => {}
  );
  for (const databaseName of Array.from(createdDatabases)) {
    await dropDatabase(databaseName).catch(() => {});
  }
  process.env.PGDATABASE = primaryDatabase;
});

test('PostgreSQL disposable restore prerequisite is available and bounded', async () => {
  const probeDb = uniqueDbName('preflight');
  const result = await stage('postgres-prerequisite', 'postgres', async () => {
    const pool = await adminPool();
    try {
      const server = await pool.query('SELECT version() AS version, current_user AS current_user');
      await pool.query(`CREATE DATABASE ${quoteIdentifier(probeDb)}`);
      createdDatabases.add(probeDb);
      await pool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [probeDb]
      );
      await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(probeDb)}`);
      createdDatabases.delete(probeDb);
      return {
        ok: true,
        code: 'RESTORE_CERT_POSTGRES_AVAILABLE',
        version: server.rows[0].version,
        currentUserPresent: Boolean(server.rows[0].current_user),
      };
    } catch (error) {
      error.code = error.code || 'RESTORE_CERT_POSTGRES_UNAVAILABLE';
      throw error;
    } finally {
      await pool.end();
    }
  });

  await writeArtifact('postgres-prerequisite-result.json', {
    ...result,
    primaryDatabase,
    disposablePrefix: adapter.DISPOSABLE_DB_PREFIX,
  });
  assert.equal(result.ok, true);
});

test('disposable guard rejects primary and non-certification database names', () => {
  assert.throws(() => adapter.assertDisposableDatabaseName(primaryDatabase), /disposable/);
  assert.throws(() => adapter.assertDisposableDatabaseName('star'), /disposable/);
  assert.throws(() => adapter.assertDisposableDatabaseName('enterprise_pos_prod'), /disposable/);
  assert.doesNotThrow(() =>
    adapter.assertDisposableDatabaseName('enterprise_pos_restore_cert_unit_abcdefgh')
  );
});

test('successful disposable restore reaches completed and rejects replay', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-success-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, 'SOURCE_SUCCESS');
  await setupDatabase(targetDb, 'TARGET_SUCCESS');
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  assert.deepEqual(await packageCategoryNames(sourcePath), ['RESTORE_CERT_SOURCE_SUCCESS']);
  assert.deepEqual(await packageCategoryNames(safetyPath), ['RESTORE_CERT_TARGET_SUCCESS']);

  const prepared = await createPreparedOperation({
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
  });
  const { result, token, restartCalls, sessionCalls } = await execute({
    prepared,
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
    targetDatabase: targetDb,
  });

  assert.equal(result.ok, true);
  assert.equal(result.verification.verificationStatus, 'passed');
  const certificationCodes = result.verification.certificationChecks.map((check) => check.code);
  assert(certificationCodes.includes('database.connectivity'));
  assert(certificationCodes.includes('schema.required_tables'));
  assert(certificationCodes.includes('foreign_keys.valid'));
  assert(certificationCodes.includes('critical_queries.readable'));
  assert(certificationCodes.includes('access_control.readable'));
  assert(certificationCodes.includes('settings.readable'));
  assert(certificationCodes.includes('identity_sequences.safe'));
  assert.equal(
    result.verification.certificationChecks.every((check) => check.status === 'passed'),
    true
  );
  assert.deepEqual(await categoryNames(targetDb), ['RESTORE_CERT_SOURCE_SUCCESS']);
  assert.equal(restartCalls.length, 1);
  assert.equal(sessionCalls.length, 1);
  const confirmationRows = await getPool().query(
    `SELECT status, consumed_at FROM restore_final_confirmations WHERE operation_id = $1`,
    [prepared.operationId]
  );
  assert.equal(confirmationRows.rows.length, 1);
  assert.equal(confirmationRows.rows[0].status, 'CONSUMED');
  assert(confirmationRows.rows[0].consumed_at);
  await assert.rejects(
    () =>
      adapter.executeDisposableRestore({
        tokenId: token.tokenId,
        operationId: prepared.operationId,
        ownerUserId: prepared.ownerUserId,
        sourcePackagePath: sourcePath,
        safetyBackupPath: safetyPath,
        disposableDatabaseName: targetDb,
        preflightDigest: `preflight:${prepared.operationId}`,
        executionPolicyDigest: `policy:${prepared.operationId}`,
      }),
    /REPLAYED|Terminal|NOT_READY/
  );

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});

test('disposable execution rejects missing final confirmation before restore mutation', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-confirmation-required-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, 'SOURCE_CONFIRMATION_REQUIRED');
  await setupDatabase(targetDb, 'TARGET_CONFIRMATION_REQUIRED');
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  const prepared = await createPreparedOperation({
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
  });
  const token = issueToken({
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
    source: prepared.source,
    safety: prepared.safety,
    targetDatabase: targetDb,
  });

  await assert.rejects(
    () =>
      adapter.executeDisposableRestore({
        tokenId: token.tokenId,
        operationId: prepared.operationId,
        ownerUserId: prepared.ownerUserId,
        sourcePackagePath: sourcePath,
        safetyBackupPath: safetyPath,
        disposableDatabaseName: targetDb,
        preflightDigest: `preflight:${prepared.operationId}`,
        executionPolicyDigest: `policy:${prepared.operationId}`,
      }),
    /RESTORE_CONFIRMATION_REQUIRED/
  );
  const state = await settingsRepository.getRestoreRecoveryState();
  assert.equal(state.operationId, prepared.operationId);
  assert.equal(state.currentState, recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED);
  await settingsRepository.cancelRestorePreparation({
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
  });

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});

test('post-restore certification fails when restored row counts are tampered', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-certfail-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  await setupDatabase(sourceDb, 'SOURCE_CERTFAIL');
  await setupDatabase(targetDb, 'TARGET_CERTFAIL');
  await createBackupPackage(sourceDb, sourcePath);
  const source = await adapter.readCertifiedPackage(sourcePath);

  const applied = await adapter.applyPackageAndVerify({
    databaseName: targetDb,
    backup: source.backup,
  });
  assert.equal(applied.verification.verificationStatus, 'passed');

  await withPool(targetDb, async (pool) => {
    await pool.query(`DELETE FROM categories WHERE name = $1`, ['RESTORE_CERT_SOURCE_CERTFAIL']);
    const verification = await adapter.verifyAppliedPackage(pool, source.backup);
    assert.equal(verification.verificationStatus, 'failed');
    assert(
      verification.failedChecks.some((check) => check.name === 'row_count.categories'),
      'tampered category row count should fail post-restore certification'
    );
    assert(
      verification.certificationChecks.some(
        (check) => check.code === 'row_count.categories' && check.status === 'failed'
      )
    );
  });

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});

test('mid-application failure rolls back transaction and leaves target baseline', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-midfail-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, 'SOURCE_MIDFAIL');
  await setupDatabase(targetDb, 'TARGET_MIDFAIL');
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  assert.deepEqual(await packageCategoryNames(sourcePath), ['RESTORE_CERT_SOURCE_MIDFAIL']);
  assert.deepEqual(await packageCategoryNames(safetyPath), ['RESTORE_CERT_TARGET_MIDFAIL']);

  const prepared = await createPreparedOperation({
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
  });
  const { result } = await execute({
    prepared,
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
    targetDatabase: targetDb,
    injectFailureStage: 'during_mutation',
  });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBackByTransaction, true);
  assert.deepEqual(await categoryNames(targetDb), ['RESTORE_CERT_TARGET_MIDFAIL']);
  await settingsRepository.cancelRestorePreparation({
    operationId: prepared.operationId,
    ownerUserId: prepared.ownerUserId,
  });

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});

test('post-application verification failure rolls back from safety backup', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-rollback-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, 'SOURCE_ROLLBACK');
  await setupDatabase(targetDb, 'TARGET_ROLLBACK');
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  assert.deepEqual(await packageCategoryNames(sourcePath), ['RESTORE_CERT_SOURCE_ROLLBACK']);
  assert.deepEqual(await packageCategoryNames(safetyPath), ['RESTORE_CERT_TARGET_ROLLBACK']);

  const prepared = await createPreparedOperation({
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
  });
  const { result } = await execute({
    prepared,
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
    targetDatabase: targetDb,
    injectFailureStage: 'post_verification',
  });

  assert.equal(result.ok, false);
  assert.equal(result.rollbackApplied, true);
  assert.deepEqual(await categoryNames(targetDb), ['RESTORE_CERT_TARGET_ROLLBACK']);

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});

test('rollback failure enters manual recovery required', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-restore-manual-'));
  const sourceDb = uniqueDbName('source');
  const targetDb = uniqueDbName('target');
  const sourcePath = path.join(tmp, 'source.json');
  const safetyPath = path.join(tmp, 'safety.json');
  await setupDatabase(sourceDb, 'SOURCE_MANUAL');
  await setupDatabase(targetDb, 'TARGET_MANUAL');
  await createBackupPackage(sourceDb, sourcePath);
  await createBackupPackage(targetDb, safetyPath);
  assert.deepEqual(await packageCategoryNames(sourcePath), ['RESTORE_CERT_SOURCE_MANUAL']);
  assert.deepEqual(await packageCategoryNames(safetyPath), ['RESTORE_CERT_TARGET_MANUAL']);

  const prepared = await createPreparedOperation({
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
  });
  const { result } = await execute({
    prepared,
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
    targetDatabase: targetDb,
    injectFailureStage: 'rollback_failure',
  });

  assert.equal(result.ok, false);
  assert.equal(result.manualRecoveryRequired, true);
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
  const state = await settingsRepository.getRestoreRecoveryState();
  assert.equal(state.currentState, recovery.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED);
  assert.equal(state.targetDatabaseReference.database, targetDb);
  assert.equal(state.targetDatabaseReference.disposableCertificationDatabase, true);
  const startup = await settingsRepository.getRestoreStartupRecoveryAssessment();
  assert.equal(startup.startupRecovery.startupMode, 'NORMAL');
  assert.equal(startup.startupRecovery.maintenanceModeRequired, false);
  assert.equal(startup.ignoredRestoreOperation.operationId, prepared.operationId);
  assert.equal(
    startup.startupRecoverySnapshot.targetDatabase.startupSelectionReason,
    'disposable_target_not_current_database'
  );

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});
