const crypto = require('crypto');
const fs = require('fs/promises');
const { Pool } = require('pg');
const { getDatabaseConfig } = require('../../config/env');
const settingsRepository = require('../settings/settings.repository');
const recoveryModel = require('./restore-recovery-state.model');

const DISPOSABLE_DB_PREFIX = 'enterprise_pos_restore_cert_';
const TOKEN_TTL_MS = 5 * 60 * 1000;
const executionTokens = new Map();
const CRITICAL_READ_TABLES = Object.freeze([
  'users',
  'roles',
  'permissions',
  'products',
  'inventory',
  'customers',
  'sales',
  'app_settings',
  'backup_logs',
]);

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

function quoteQualifiedIdentifier(identifier) {
  return String(identifier || '')
    .split('.')
    .map(quoteIdentifier)
    .join('.');
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
    throw new Error(
      'Restore execution target must be an explicitly disposable certification database.'
    );
  }
  if (name === current) {
    throw new Error('Restore execution target must not be the configured primary database.');
  }
  return name;
}

function disposableTargetIdentity(databaseName) {
  const config = getDatabaseConfig();
  return {
    host: String(config.host || 'localhost').toLowerCase(),
    port: Number(config.port || 5432),
    database: assertDisposableDatabaseName(databaseName),
    disposableCertificationDatabase: true,
    ambiguous: true,
    fingerprint: sha256(
      stableStringify({
        host: String(config.host || 'localhost').toLowerCase(),
        port: Number(config.port || 5432),
        database: assertDisposableDatabaseName(databaseName),
        schema: 'public',
        disposableCertificationDatabase: true,
      })
    ),
  };
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

function packageTables(backup, { managedDatabaseIdentity = null, preservedRows = null } = {}) {
  const included = backup?.manifest?.coverageDeclaration?.includedTables;
  const data = backup?.data;
  if (!Array.isArray(included) || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Restore package table inventory is invalid.');
  }
  const restoredData = { ...data };
  if (managedDatabaseIdentity && Array.isArray(restoredData.app_settings)) {
    const withoutSourceManagedIdentity = restoredData.app_settings.filter(
      (row) => String(row?.key || '') !== 'managed_database_identity'
    );
    withoutSourceManagedIdentity.push({
      key: 'managed_database_identity',
      value: managedDatabaseIdentity,
      updated_by: null,
      updated_at: new Date().toISOString(),
    });
    restoredData.app_settings = withoutSourceManagedIdentity;
  }
  if (preservedRows && typeof preservedRows === 'object' && !Array.isArray(preservedRows)) {
    for (const [tableName, rows] of Object.entries(preservedRows)) {
      if (!Array.isArray(rows) || !Array.isArray(restoredData[tableName])) continue;
      const keyName = tableName === 'backup_logs' || tableName === 'activity_logs' ? 'id' : null;
      if (!keyName) continue;
      const preservedKeys = new Set(rows.map((row) => String(row?.[keyName] || '')));
      restoredData[tableName] = restoredData[tableName]
        .filter((row) => !preservedKeys.has(String(row?.[keyName] || '')))
        .concat(rows);
    }
  }
  const tableNames = included.map((table) => String(table.name || '').trim());
  const unknownPayloadTables = Object.keys(restoredData).filter(
    (name) => !tableNames.includes(name)
  );
  if (unknownPayloadTables.length) {
    throw new Error(
      `Restore package contains unknown table(s): ${unknownPayloadTables.join(', ')}.`
    );
  }
  for (const name of tableNames) {
    quoteIdentifier(name);
    if (!Array.isArray(restoredData[name])) {
      throw new Error(`Restore package table ${name} is missing data rows.`);
    }
  }
  return { tableNames, data: restoredData, included };
}

async function deleteAndInsertTables(
  client,
  backup,
  {
    failDuringMutation = false,
    managedDatabaseIdentity = null,
    useTruncate = true,
    preservedRows = null,
  } = {}
) {
  const { tableNames, data } = packageTables(backup, { managedDatabaseIdentity, preservedRows });
  const constraintsSuspended = await suspendForeignKeyChecks(client);
  const insertOrder = constraintsSuspended
    ? tableNames
    : await orderedTablesForDatabase(client, tableNames);
  const deleteOrder = constraintsSuspended ? [...tableNames].reverse() : [...insertOrder].reverse();
  let tablesRestored = 0;
  let rowsRestored = 0;

  if (constraintsSuspended && useTruncate) {
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

async function verifyAppliedPackage(
  pool,
  backup,
  { managedDatabaseIdentity = null, preservedRows = null } = {}
) {
  const { tableNames, data, included } = packageTables(backup, {
    managedDatabaseIdentity,
    preservedRows,
  });
  const certificationChecks = [];
  const rowCounts = [];

  function recordCheck(code, passed, evidence = {}, failureReason = null) {
    const check = {
      code,
      status: passed ? 'passed' : 'failed',
      passed: Boolean(passed),
      evidence,
      failureReason: passed ? null : failureReason || `${code} failed.`,
      checkedAt: new Date().toISOString(),
    };
    certificationChecks.push(check);
    return check;
  }

  async function tableExists(tableName) {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
      `,
      [tableName]
    );
    return result.rows.length > 0;
  }

  async function idColumnExists(tableName) {
    const result = await pool.query(
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
    return result.rows.length > 0;
  }

  async function countPrimaryKeyDuplicates(tableName) {
    if (!(await idColumnExists(tableName))) return 0;
    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS duplicate_count
        FROM (
          SELECT id
          FROM ${quoteIdentifier(tableName)}
          WHERE id IS NOT NULL
          GROUP BY id
          HAVING COUNT(*) > 1
        ) duplicates
      `
    );
    return Number(result.rows[0]?.duplicate_count || 0);
  }

  async function sequenceEvidence(tableName) {
    if (!(await idColumnExists(tableName))) {
      return {
        tableName,
        sequenceName: null,
        maxId: null,
        lastValue: null,
        sequenceAtOrAboveMax: true,
      };
    }
    const sequence = await pool.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [
      tableName,
      'id',
    ]);
    const sequenceName = sequence.rows[0]?.seq || null;
    if (!sequenceName) {
      return {
        tableName,
        sequenceName: null,
        maxId: null,
        lastValue: null,
        sequenceAtOrAboveMax: true,
      };
    }
    const maxResult = await pool.query(
      `SELECT COALESCE(MAX(id), 0)::bigint AS max_id FROM ${quoteIdentifier(tableName)}`
    );
    const seqResult = await pool.query(
      `SELECT last_value::bigint AS last_value FROM ${quoteQualifiedIdentifier(sequenceName)}`
    );
    const maxId = Number(maxResult.rows[0]?.max_id || 0);
    const lastValue = Number(seqResult.rows[0]?.last_value || 0);
    return {
      tableName,
      sequenceName,
      maxId,
      lastValue,
      sequenceAtOrAboveMax: lastValue >= maxId,
    };
  }

  async function foreignKeyViolations() {
    const constraints = await pool.query(
      `
        SELECT
          constraint_info.conname AS constraint_name,
          child.relname AS child_table,
          parent.relname AS parent_table,
          child_cols.column_name AS child_column,
          parent_cols.column_name AS parent_column
        FROM pg_constraint constraint_info
        JOIN pg_class child ON child.oid = constraint_info.conrelid
        JOIN pg_class parent ON parent.oid = constraint_info.confrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        JOIN unnest(constraint_info.conkey) WITH ORDINALITY child_key(attnum, ord) ON true
        JOIN unnest(constraint_info.confkey) WITH ORDINALITY parent_key(attnum, ord)
          ON parent_key.ord = child_key.ord
        JOIN information_schema.columns child_cols
          ON child_cols.table_schema = child_ns.nspname
         AND child_cols.table_name = child.relname
         AND child_cols.ordinal_position = child_key.attnum
        JOIN information_schema.columns parent_cols
          ON parent_cols.table_schema = parent_ns.nspname
         AND parent_cols.table_name = parent.relname
         AND parent_cols.ordinal_position = parent_key.attnum
        WHERE constraint_info.contype = 'f'
          AND child_ns.nspname = 'public'
          AND parent_ns.nspname = 'public'
      `
    );
    const violations = [];
    for (const constraint of constraints.rows) {
      const violation = await pool.query(
        `
          SELECT COUNT(*)::int AS violation_count
          FROM ${quoteIdentifier(constraint.child_table)} child
          LEFT JOIN ${quoteIdentifier(constraint.parent_table)} parent
            ON child.${quoteIdentifier(constraint.child_column)}
             = parent.${quoteIdentifier(constraint.parent_column)}
          WHERE child.${quoteIdentifier(constraint.child_column)} IS NOT NULL
            AND parent.${quoteIdentifier(constraint.parent_column)} IS NULL
        `
      );
      const violationCount = Number(violation.rows[0]?.violation_count || 0);
      if (violationCount > 0) {
        violations.push({
          constraintName: constraint.constraint_name,
          childTable: constraint.child_table,
          parentTable: constraint.parent_table,
          childColumn: constraint.child_column,
          parentColumn: constraint.parent_column,
          violationCount,
        });
      }
    }
    return violations;
  }

  await pool.query('SELECT 1 AS ok');
  recordCheck('database.connectivity', true, { query: 'SELECT 1' });

  const tableExistence = [];
  for (const tableName of tableNames) {
    tableExistence.push({ tableName, exists: await tableExists(tableName) });
  }
  recordCheck(
    'schema.required_tables',
    tableExistence.every((table) => table.exists),
    { tables: tableExistence },
    'One or more manifest tables are missing from the target database.'
  );

  for (const tableName of tableNames) {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`
    );
    const actual = countResult.rows[0]?.count ?? null;
    const expected = data[tableName].length;
    const passed = actual === expected;
    rowCounts.push({ tableName, expected, actual, passed });
    recordCheck(
      `row_count.${tableName}`,
      passed,
      { tableName, expected, actual },
      `${tableName} expected ${expected}, found ${actual}.`
    );
  }

  const includedCountMatches =
    included.length === tableNames.length && tableNames.length === Object.keys(data).length;
  recordCheck(
    'table_inventory.count',
    includedCountMatches,
    {
      manifestIncludedTableCount: included.length,
      payloadTableCount: Object.keys(data).length,
      restoredTableCount: tableNames.length,
    },
    'Manifest table inventory does not match payload table count.'
  );

  const duplicateCounts = [];
  for (const tableName of tableNames) {
    duplicateCounts.push({ tableName, duplicateCount: await countPrimaryKeyDuplicates(tableName) });
  }
  recordCheck(
    'primary_keys.unique',
    duplicateCounts.every((table) => table.duplicateCount === 0),
    { tables: duplicateCounts },
    'One or more restored tables contain duplicate id values.'
  );

  const fkViolations = await foreignKeyViolations();
  recordCheck(
    'foreign_keys.valid',
    fkViolations.length === 0,
    { violations: fkViolations },
    'One or more restored foreign-key relationships are invalid.'
  );

  const criticalTables = [];
  for (const tableName of CRITICAL_READ_TABLES.filter((name) => tableNames.includes(name))) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`
    );
    criticalTables.push({ tableName, rowCount: Number(result.rows[0]?.count || 0) });
  }
  recordCheck(
    'critical_queries.readable',
    criticalTables.length > 0,
    { tables: criticalTables },
    'No application-critical tables were available for read-only certification.'
  );

  const accessTables = ['users', 'roles', 'permissions'].filter((name) =>
    tableNames.includes(name)
  );
  const accessCounts = [];
  for (const tableName of accessTables) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`
    );
    accessCounts.push({ tableName, rowCount: Number(result.rows[0]?.count || 0) });
  }
  recordCheck(
    'access_control.readable',
    accessTables.length === 3 && accessCounts.every((table) => Number.isInteger(table.rowCount)),
    { tables: accessCounts },
    'Access-control tables are not all readable after restore.'
  );

  if (tableNames.includes('app_settings')) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM app_settings');
    recordCheck(
      'settings.readable',
      Number.isInteger(result.rows[0]?.count),
      { tableName: 'app_settings', rowCount: Number(result.rows[0]?.count || 0) },
      'Application settings table is not readable after restore.'
    );
  }

  const sequences = [];
  for (const tableName of tableNames) {
    sequences.push(await sequenceEvidence(tableName));
  }
  recordCheck(
    'identity_sequences.safe',
    sequences.every((sequence) => sequence.sequenceAtOrAboveMax),
    { sequences },
    'One or more restored identity sequences are below the maximum restored id.'
  );

  const passedChecks = certificationChecks
    .filter((check) => check.passed)
    .map((check) => ({
      name: check.code,
      message: check.failureReason || `${check.code} passed.`,
    }));
  const failedChecks = certificationChecks
    .filter((check) => !check.passed)
    .map((check) => ({ name: check.code, message: check.failureReason }));

  return freeze({
    verificationStatus: failedChecks.length ? 'failed' : 'passed',
    passedChecks,
    failedChecks,
    certificationChecks,
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

async function applyPackageToPoolAndVerify({
  pool,
  backup,
  injectFailureStage = null,
  managedDatabaseIdentity = null,
  useTruncate = true,
  preservedRows = null,
  checkpointAdapter = null,
} = {}) {
  const client = await pool.connect();
  let application;
  try {
    await client.query('BEGIN');
    application = await deleteAndInsertTables(client, backup, {
      failDuringMutation: injectFailureStage === 'during_mutation',
      managedDatabaseIdentity,
      useTruncate,
      preservedRows,
    });
    await client.query('COMMIT');
    if (checkpointAdapter?.reach) {
      await checkpointAdapter.reach('after_mutation_before_validation', {
        tablesRestored: application.tablesRestored,
        rowsRestored: application.rowsRestored,
      });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (injectFailureStage === 'post_verification' || injectFailureStage === 'rollback_failure') {
    throw new Error('CONTROLLED_POST_RESTORE_VERIFICATION_FAILURE');
  }
  const verification = await verifyAppliedPackage(pool, backup, {
    managedDatabaseIdentity,
    preservedRows,
  });
  if (verification.verificationStatus !== 'passed') {
    throw Object.assign(new Error('POST_RESTORE_VERIFICATION_FAILED'), { verification });
  }
  return { application, verification };
}

async function applyPackageAndVerify({ databaseName, backup, injectFailureStage = null } = {}) {
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
  const targetDatabaseReference = disposableTargetIdentity(targetDatabase);
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
  confirmationId,
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
  const targetDatabaseReference = disposableTargetIdentity(targetDatabase);
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
  const confirmation = await settingsRepository.consumeRestoreFinalConfirmation({
    operationId,
    confirmationId,
    ownerUserId,
    targetDatabaseReference,
  });
  if (!confirmation.ok) {
    throw new Error(confirmation.code || 'RESTORE_CONFIRMATION_REQUIRED');
  }

  if (injectFailureStage === 'before_mutation') {
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
      targetDatabaseReference,
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
    targetDatabaseReference,
  });

  try {
    const application = await applyPackageToDisposableDatabase({
      databaseName: targetDatabase,
      backup: sourcePackage.backup,
      injectFailureStage,
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
      targetDatabaseReference,
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
      targetDatabaseReference,
    });
    if (injectFailureStage === 'post_verification' || injectFailureStage === 'rollback_failure') {
      throw new Error('CONTROLLED_POST_RESTORE_VERIFICATION_FAILURE');
    }
    const pool = poolForDatabase(targetDatabase);
    let verification;
    try {
      verification = await verifyAppliedPackage(pool, sourcePackage.backup);
    } finally {
      await pool.end();
    }
    if (verification.verificationStatus !== 'passed') {
      throw new Error('POST_RESTORE_VERIFICATION_FAILED');
    }
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.COMPLETED,
      targetDatabaseReference,
      replayStatus: 'token_consumed',
      completionMarker: `completed:${operationId}`,
    });
    if (sessionAdapter?.invalidateAll) await sessionAdapter.invalidateAll({ operationId });
    if (restartAdapter?.requestRestart) await restartAdapter.requestRestart({ operationId });
    return freeze({
      ok: true,
      restored: true,
      databaseName: targetDatabase,
      tablesRestored: application.tablesRestored,
      rowsRestored: application.rowsRestored,
      verification,
      restartRequired: true,
      sessionInvalidationRequired: true,
    });
  } catch (error) {
    if (injectFailureStage === 'during_mutation' || /CONTROLLED_MID/.test(error.message)) {
      await settingsRepository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
        targetDatabaseReference,
        failureCategory: 'transaction_rolled_back',
        failureSummary: error.message,
        replayStatus: 'token_consumed',
      });
      return {
        ok: false,
        restored: false,
        rolledBackByTransaction: true,
        error: sanitizeError(error),
      };
    }

    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
      targetDatabaseReference,
      failureCategory: 'post_restore_verification_failed',
      failureSummary: error.message,
      replayStatus: 'token_consumed',
    });
    await settingsRepository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
      targetDatabaseReference,
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
        targetDatabaseReference,
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
        targetDatabaseReference,
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
  applyPackageToPoolAndVerify,
  applyPackageAndVerify,
  consumeExecutionToken,
  disposableTargetIdentity,
  executeDisposableRestore,
  issueDisposableExecutionToken,
  readCertifiedPackage,
  verifyAppliedPackage,
  DISPOSABLE_DB_PREFIX,
};
