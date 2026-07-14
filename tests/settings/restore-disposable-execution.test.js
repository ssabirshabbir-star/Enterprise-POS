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
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    url.pathname = `/${databaseName}`;
    return { ...config, connectionString: url.toString() };
  }
  return { ...config, database: databaseName };
}

async function adminPool() {
  return new Pool(configForDatabase('postgres'));
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
  const pool = await adminPool();
  try {
    await pool.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName]
    );
    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
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
  await withDatabase(databaseName, async () => {
    await initializeDatabase();
    await getPool().query('DELETE FROM categories WHERE name LIKE $1', ['RESTORE_CERT_%']);
    await getPool().query(
      `INSERT INTO categories (name, description, is_active) VALUES ($1, $2, true)`,
      [`RESTORE_CERT_${marker}`, `${marker} fixture`]
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

async function createPreparedOperation({ sourcePackagePath, safetyPackagePath, ownerUserId = 1 }) {
  await closeDatabase();
  process.env.PGDATABASE = primaryDatabase;
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

async function execute({ prepared, sourcePackagePath, safetyPackagePath, targetDatabase, injectFailureStage }) {
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
  await closeDatabase();
  for (const databaseName of Array.from(createdDatabases)) {
    await dropDatabase(databaseName).catch(() => {});
  }
  process.env.PGDATABASE = primaryDatabase;
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

  const prepared = await createPreparedOperation({ sourcePackagePath: sourcePath, safetyPackagePath: safetyPath });
  const { result, token, restartCalls, sessionCalls } = await execute({
    prepared,
    sourcePackagePath: sourcePath,
    safetyPackagePath: safetyPath,
    targetDatabase: targetDb,
  });

  assert.equal(result.ok, true);
  assert.equal(result.verification.verificationStatus, 'passed');
  assert.deepEqual(await categoryNames(targetDb), ['RESTORE_CERT_SOURCE_SUCCESS']);
  assert.equal(restartCalls.length, 1);
  assert.equal(sessionCalls.length, 1);
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

  const prepared = await createPreparedOperation({ sourcePackagePath: sourcePath, safetyPackagePath: safetyPath });
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

  const prepared = await createPreparedOperation({ sourcePackagePath: sourcePath, safetyPackagePath: safetyPath });
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

  const prepared = await createPreparedOperation({ sourcePackagePath: sourcePath, safetyPackagePath: safetyPath });
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

  await dropDatabase(sourceDb);
  await dropDatabase(targetDb);
});
