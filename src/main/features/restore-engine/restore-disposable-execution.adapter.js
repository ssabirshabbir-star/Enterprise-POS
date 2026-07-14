const crypto = require('crypto');
const fs = require('fs/promises');
const { Pool } = require('pg');
const { getDatabaseConfig } = require('../../config/env');
const settingsRepository = require('../settings/settings.repository');
const recoveryModel = require('./restore-recovery-state.model');

const DISPOSABLE_DB_PREFIX = 'enterprise_pos_restore_cert_';
const TOKEN_TTL_MS = 5 * 60 * 1000;
const executionTokens = new Map();

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function sanitizeError(value) {
  return recoveryModel.sanitizeFailureSummary(value && value.message ? value.message : value);
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(identifier || ''))) {
    throw new Error('Invalid database identifier.');
  }
  return `"${identifier}"`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  return crypto.createHash('sha256').update(input).digest('hex');
}

function assertDisposableDatabaseName(databaseName) {
  const name = String(databaseName || '').trim();
  const current = String(getDatabaseConfig().database || '').trim();
  if (!new RegExp(`^${DISPOSABLE_DB_PREFIX}[a-z0-9_]{8,}$`).test(name)) {
    throw new Error('Restore execution target must be an explicitly disposable certification database.');
  }
  if (name === current) {
    throw new Error('Restore execution target must not be the configured primary database.');
  }
  return name;
}

function poolForDatabase(databaseName) {
  const config = getDatabaseConfig();
  const database = assertDisposableDatabaseName(databaseName);
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    url.pathname = `/${database}`;
    return new Pool({
      ...config,
      connectionString: url.toString(),
    });
  }
  return new Pool({
    ...config,
    database,
  });
}

async function readCertifiedPackage(filePath) {
  const verification = await settingsRepository.verifyRestorePackage(filePath);
  if (verification.verificationStatus !== 'passed') {
    throw new Error('Restore package verification failed.');
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const checksum = sha256(raw);
  const backup = JSON.parse(raw);
  return { backup, raw, checksum, verification };
}

function packageTables(backup) {
  const included = backup?.manifest?.coverageDeclaration?.includedTables;
  const data = backup?.data;
  if (!Array.isArray(included) || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Restore package table inventory is invalid.');
  }
  const tableNames = included.map((table) => String(table.name || '').trim());
  const unknownPayloadTables = Object.keys(data).filter((name) => !tableNames.includes(name));
  if (unknownPayloadTables.length) {
    throw new Error(`Restore package contains unknown table(s): ${unknownPayloadTables.join(', ')}.`);
  }
  for (const name of tableNames) {
    quoteIdentifier(name);
    if (!Array.isArray(data[name])) {
      throw new Error(`Restore package table ${name} is missing data rows.`);
    }
  }
  return { tableNames, data, included };
}

async function deleteAndInsertTables(client, backup, { failDuringMutation = false } = {}) {
  const { tableNames, data } = packageTables(backup);
  const constraintsSuspended = await suspendForeignKeyChecks(client);
  const insertOrder = constraintsSuspended ? tableNames : await orderedTablesForDatabase(client, tableNames);
  const deleteOrder = [...insertOrder].reverse();
  let tablesRestored = 0;
  let rowsRestored = 0;

  if (constraintsSuspended) {
    const truncatedTables = tableNames.map(quoteIdentifier).join(', ');
    await client.query(`TRUNCATE ${truncatedTables} RESTART IDENTITY CASCADE`);
  } else {
    for (const tableName of deleteOrder) {
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
    }
  }

  for (const tableName of insertOrder) {
    const rows = data[tableName];
    if (failDuringMutation && tablesRestored === 0) {
      throw new Error('CONTROLLED_MID_APPLICATION_FAILURE');
    }
    if (!rows.length) {
      tablesRestored += 1;
      continue;
    }
    const columns = Object.keys(rows[0]);
    columns.forEach(quoteIdentifier);
    const quotedColumns = columns.map(quoteIdentifier).join(', ');
    for (const row of rows) {
      const values = columns.map((column) => (row[column] === undefined ? null : row[column]));
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders})`,
        values
      );
      rowsRestored += 1;
    }
    await restoreTableSequence(client, tableName);
    tablesRestored += 1;
  }

  return { tablesRestored, rowsRestored };
}

async function suspendForeignKeyChecks(client) {
  try {
    await client.query('SET LOCAL session_replication_role = replica');
    return true;
  } catch {
    return false;
  }
}

async function orderedTablesForDatabase(client, tableNames) {
  const tableSet = new Set(tableNames);
  const result = await client.query(
    `
      SELECT
        child.relname AS child_table,
        parent.relname AS parent_table
      FROM pg_constraint constraint_info
      JOIN pg_class child ON child.oid = constraint_info.conrelid
      JOIN pg_class parent ON parent.oid = constraint_info.confrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE constraint_info.contype = 'f'
        AND child_ns.nspname = 'public'
        AND parent_ns.nspname = 'public'
        AND child.relname = ANY($1::text[])
        AND parent.relname = ANY($1::text[])
    `,
    [tableNames]
  );
  const dependencies = new Map(tableNames.map((name) => [name, new Set()]));
  for (const row of result.rows) {
    if (row.child_table !== row.parent_table && tableSet.has(row.child_table)) {
      dependencies.get(row.child_table).add(row.parent_table);
    }
  }

  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(tableName) {
    if (visited.has(tableName)) return;
    if (visiting.has(tableName)) {
      throw new Error(`Restore table dependency cycle includes ${tableName}.`);
    }
    visiting.add(tableName);
    for (const parent of dependencies.get(tableName) || []) visit(parent);
    visiting.delete(tableName);
    visited.add(tableName);
    ordered.push(tableName);
  }
  tableNames.forEach(visit);
  return ordered;
}

async function restoreTableSequence(client, tableName) {
  const idColumn = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = 'id'
      LIMIT 1
    `,
    [tableName]
  );
  if (!idColumn.rows.length) return;
  const sequence = await client.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [
    tableName,
    'id',
  ]);
  const sequenceName = sequence.rows[0]?.seq;
  if (!sequenceName) return;
  const maxResult = await client.query(
    `SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM ${quoteIdentifier(tableName)}`
  );
  const maxId = Number(maxResult.rows[0]?.max_id || 0);
  if (maxId > 0) {
    await client.query('SELECT setval($1, $2, true)', [sequenceName, maxId]);
  } else {
    await client.query('SELECT setval($1, 1, false)', [sequenceName]);
  }
}

async function verifyAppliedPackage(pool, backup) {
  const { tableNames, data, included } = packageTables(backup);
  const passedChecks = [];
  const failedChecks = [];
  const rowCounts = [];

  for (const tableName of tableNames) {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`
    );
    const actual = countResult.rows[0]?.count ?? null;
    const expected = data[tableName].length;
    const passed = actual === expected;
    rowCounts.push({ tableName, expected, actual, passed });
    (passed ? passedChecks : failedChecks).push({
      name: `row_count.${tableName}`,
      message: `${tableName} expected ${expected}, found ${actual}.`,
    });
  }

  const includedCountMatches =
    included.length === tableNames.length && tableNames.length === Object.keys(data).length;
  (includedCountMatches ? passedChecks : failedChecks).push({
    name: 'table_inventory.count',
    message: 'Manifest table inventory matches payload table count.',
  });

  return freeze({
    verificationStatus: failedChecks.length ? 'failed' : 'passed',
    passedChecks,
    failedChecks,
    rowCounts,
    dataHash: sha256(stableStringify(data)),
  });
}

async function applyPackageToDisposableDatabase({
  databaseName,
  backup,
  injectFailureStage = null,
} = {}) {
  const pool = poolForDatabase(databaseName);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await deleteAndInsertTables(client, backup, {
      failDuringMutation: injectFailureStage === 'during_mutation',
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function applyPackageAndVerify({
  databaseName,
  backup,
  injectFailureStage = null,
} = {}) {
  const application = await applyPackageToDisposableDatabase({
    databaseName,
    backup,
    injectFailureStage,
  });
  if (injectFailureStage === 'post_verification' || injectFailureStage === 'rollback_failure') {
    throw new Error('CONTROLLED_POST_RESTORE_VERIFICATION_FAILURE');
  }
  const pool = poolForDatabase(databaseName);
  try {
    const verification = await verifyAppliedPackage(pool, backup);
    if (verification.verificationStatus !== 'passed') {
      throw new Error('POST_RESTORE_VERIFICATION_FAILED');
    }
    return { application, verification };
  } finally {
    await pool.end();
  }
}

function createExecutionDigest(payload) {
  return sha256(stableStringify(payload));
}

function issueDisposableExecutionToken({
  operationId,
  ownerUserId,
  sourcePackageChecksum,
  safetyBackupChecksum,
  primaryDatabaseName,
  disposableDatabaseName,
  preflightDigest,
  executionPolicyDigest,
  ttlMs = TOKEN_TTL_MS,
} = {}) {
  const targetDatabase = assertDisposableDatabaseName(disposableDatabaseName);
  const tokenId = crypto.randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlMs);
  const digest = createExecutionDigest({
    operationId,
    ownerUserId,
    sourcePackageChecksum,
    safetyBackupChecksum,
    primaryDatabaseName,
    disposableDatabaseName: targetDatabase,
    preflightDigest,
    executionPolicyDigest,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  executionTokens.set(tokenId, {
    tokenId,
    operationId,
    ownerUserId,
    sourcePackageChecksum,
    safetyBackupChecksum,
    primaryDatabaseName,
    disposableDatabaseName: targetDatabase,
    preflightDigest,
    executionPolicyDigest,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    digest,
    used: false,
  });
  return freeze({ tokenId, expiresAt: expiresAt.toISOString(), digest });
}

function consumeExecutionToken(tokenId, expected = {}) {
  const token = executionTokens.get(tokenId);
  if (!token) throw new Error('RESTORE_EXECUTION_TOKEN_NOT_FOUND');
  if (token.used) throw new Error('RESTORE_EXECUTION_TOKEN_REPLAYED');
  if (new Date(token.expiresAt).getTime() < Date.now()) {
    token.used = true;
    throw new Error('RESTORE_EXECUTION_TOKEN_EXPIRED');
  }
  const keys = [
    'operationId',
    'ownerUserId',
    'sourcePackageChecksum',
    'safetyBackupChecksum',
    'disposableDatabaseName',
    'preflightDigest',
    'executionPolicyDigest',
  ];
  for (const key of keys) {
    if (String(token[key] || '') !== String(expected[key] || '')) {
      throw new Error('RESTORE_EXECUTION_TOKEN_DIGEST_MISMATCH');
    }
  }
  token.used = true;
  return token;
}

async function executeDisposableRestore({
  tokenId,
  operationId,
  ownerUserId,
  sourcePackagePath,
  safetyBackupPath,
  disposableDatabaseName,
  preflightDigest,
  executionPolicyDigest,
  injectFailureStage = null,
  restartAdapter = null,
  sessionAdapter = null,
} = {}) {
  const targetDatabase = assertDisposableDatabaseName(disposableDatabaseName);
  const recoveryState = await settingsRepository.getRestoreRecoveryState();
  if (recoveryState.operationId !== operationId) throw new Error('RESTORE_OPERATION_MISMATCH');
  if (String(recoveryState.ownerUserId || '') !== String(ownerUserId || '')) {
    throw new Error('RESTORE_OPERATION_OWNER_MISMATCH');
  }
  if (recoveryState.currentState !== recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED) {
    throw new Error('RESTORE_OPERATION_NOT_READY');
  }
  if (!recoveryState.safetyBackupReference?.checksum) {
    throw new Error('RESTORE_SAFETY_BACKUP_REQUIRED');
  }

  const sourcePackage = await readCertifiedPackage(sourcePackagePath);
  const safetyPackage = await readCertifiedPackage(safetyBackupPath);
  consumeExecutionToken(tokenId, {
    operationId,
    ownerUserId,
    sourcePackageChecksum: sourcePackage.checksum,
    safetyBackupChecksum: safetyPackage.checksum,
    disposableDatabaseName: targetDatabase,
    preflightDigest,
    executionPolicyDigest,
  });

  if (injectFailureStage === 'before_mutation') {
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
      failureCategory: 'pre_mutation_failure',
      failureSummary: 'Controlled failure before mutation.',
      replayStatus: 'token_consumed',
    });
    return { ok: false, restored: false, rollbackRequired: false };
  }

  await settingsRepository.transitionRestoreOperation({
    operationId,
    requestedByUserId: ownerUserId,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
  });

  try {
    const result = await applyPackageAndVerify({
      databaseName: targetDatabase,
      backup: sourcePackage.backup,
      injectFailureStage,
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.COMPLETED,
      replayStatus: 'token_consumed',
      completionMarker: `completed:${operationId}`,
    });
    if (sessionAdapter?.invalidateAll) await sessionAdapter.invalidateAll({ operationId });
    if (restartAdapter?.requestRestart) await restartAdapter.requestRestart({ operationId });
    return freeze({
      ok: true,
      restored: true,
      databaseName: targetDatabase,
      tablesRestored: result.application.tablesRestored,
      rowsRestored: result.application.rowsRestored,
      verification: result.verification,
      restartRequired: true,
      sessionInvalidationRequired: true,
    });
  } catch (error) {
    if (injectFailureStage === 'during_mutation' || /CONTROLLED_MID/.test(error.message)) {
      await settingsRepository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
        failureCategory: 'transaction_rolled_back',
        failureSummary: error.message,
        replayStatus: 'token_consumed',
      });
      return { ok: false, restored: false, rolledBackByTransaction: true, error: sanitizeError(error) };
    }

    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
      failureCategory: 'post_restore_verification_failed',
      failureSummary: error.message,
      replayStatus: 'token_consumed',
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
    });
    try {
      if (injectFailureStage === 'rollback_failure') {
        throw new Error('CONTROLLED_ROLLBACK_FAILURE');
      }
      const rollback = await applyPackageAndVerify({
        databaseName: targetDatabase,
        backup: safetyPackage.backup,
      });
      await settingsRepository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.ROLLED_BACK,
        replayStatus: 'token_consumed',
        completionMarker: `rolled_back:${operationId}`,
      });
      return freeze({
        ok: false,
        restored: false,
        rollbackApplied: true,
        rollback,
        error: sanitizeError(error),
      });
    } catch (rollbackError) {
      await settingsRepository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
        failureCategory: 'rollback_failed',
        failureSummary: rollbackError.message,
        replayStatus: 'token_consumed',
      });
      return {
        ok: false,
        restored: false,
        manualRecoveryRequired: true,
        error: sanitizeError(rollbackError),
      };
    }
  }
}

module.exports = {
  assertDisposableDatabaseName,
  applyPackageAndVerify,
  consumeExecutionToken,
  executeDisposableRestore,
  issueDisposableExecutionToken,
  readCertifiedPackage,
  verifyAppliedPackage,
  DISPOSABLE_DB_PREFIX,
};
