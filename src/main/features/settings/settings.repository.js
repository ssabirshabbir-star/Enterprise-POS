const { constants: fsConstants } = require('fs');
const fs = require('fs/promises');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { getPool, withTransaction } = require('../../database/connection');
const restoreExecutionPolicyModel = require('../restore-engine/restore-execution-policy.model');
const restoreProductionGovernanceModel = require('../restore-engine/restore-production-governance.model');
const restoreRecoveryStateModel = require('../restore-engine/restore-recovery-state.model');
const packageJson = require('../../../../package.json');

const SETTING_KEYS = ['store', 'tax', 'system'];
const BACKUP_WORKFLOW_VERSION = 'certified-backup-phase-1';
const BACKUP_MANIFEST_VERSION = '1.0';
const BACKUP_FORMAT_VERSION = '1.0';
const SCHEMA_VERSION = 'current';
const INTEGRITY_ALGORITHM = 'sha256';
const BACKUP_COVERAGE_POLICY = {
  policyDocument: '45_TABLE_COVERAGE_POLICY.md',
  backupClass: 'Operational Backup',
  restoreEligibility: 'Restore blocked until certification',
  tables: [
    {
      name: 'roles',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Parent',
    },
    {
      name: 'users',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'permissions',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Parent',
    },
    {
      name: 'role_permissions',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'activity_logs',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Audit',
    },
    {
      name: 'categories',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'brands',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'units',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'variants',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'products',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'warehouses',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'inventory',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'stock_movements',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'suppliers',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'supplier_ledger',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'supplier_payments',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'purchases',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'purchase_items',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'purchase_requisitions',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'purchase_requisition_items',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'purchase_orders',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'purchase_order_items',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'goods_receipts',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'goods_receipt_items',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'customers',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Parent',
    },
    {
      name: 'sales',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'sale_items',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'payments',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'customer_ledger',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'customer_payments',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Child',
    },
    {
      name: 'returns',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'return_items',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'refund_payments',
      classification: 'Mandatory',
      recoveryCriticality: 'Critical',
      dependency: 'Child',
    },
    {
      name: 'expense_categories',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Parent',
    },
    {
      name: 'expenses',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'held_sales',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Child',
    },
    {
      name: 'printer_settings',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Configuration',
    },
    {
      name: 'app_settings',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Configuration',
    },
    {
      name: 'backup_logs',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Audit',
    },
    {
      name: 'terminals',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Operational',
    },
    {
      name: 'sync_logs',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Audit',
    },
    {
      name: 'offline_queue',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Operational',
    },
    {
      name: 'device_registrations',
      classification: 'Mandatory',
      recoveryCriticality: 'Medium',
      dependency: 'Operational',
    },
    {
      name: 'licenses',
      classification: 'Mandatory',
      recoveryCriticality: 'High',
      dependency: 'Configuration',
    },
    {
      name: 'update_checks',
      classification: 'Optional',
      recoveryCriticality: 'Low',
      dependency: 'Audit',
    },
    {
      name: 'lucky_draw_campaigns',
      classification: 'Optional',
      recoveryCriticality: 'Low',
      dependency: 'Future Reserved',
    },
    {
      name: 'lucky_draw_entries',
      classification: 'Optional',
      recoveryCriticality: 'Low',
      dependency: 'Future Reserved',
    },
    {
      name: 'lucky_draw_winners',
      classification: 'Optional',
      recoveryCriticality: 'Low',
      dependency: 'Future Reserved',
    },
    {
      name: 'coupon_logs',
      classification: 'Optional',
      recoveryCriticality: 'Low',
      dependency: 'Future Reserved',
    },
  ],
  excludedTables: [
    {
      name: 'refresh_tokens',
      classification: 'Runtime Cache',
      recoveryCriticality: 'Rebuildable',
      reason: 'Authentication runtime state must be revalidated after Restore.',
    },
  ],
};
const BACKUP_TABLES = BACKUP_COVERAGE_POLICY.tables.map((table) => table.name);
const RESTORE_RECOVERY_ACTIVITY = 'backup.restore.recovery_state';
const RESTORE_OPERATION_ACTIVITY = 'backup.restore.operation';
const RESTORE_SAFETY_BACKUP_ACTIVITY = 'backup.restore.safety_backup';
const RESTORE_OPERATION_UNRESOLVED_STATES = Object.freeze([
  'PREFLIGHT_READY',
  'SAFETY_BACKUP_IN_PROGRESS',
  'SAFETY_BACKUP_VERIFIED',
  'RESTORE_IN_PROGRESS',
  'RESTORE_APPLIED',
  'POST_RESTORE_VERIFYING',
  'FAILED_RECOVERABLE',
  'FAILED_ROLLBACK_REQUIRED',
  'ROLLBACK_IN_PROGRESS',
]);
const RESTORE_OPERATION_TERMINAL_STATES = Object.freeze([
  'COMPLETED',
  'CANCELLED',
  'ROLLED_BACK',
  'MANUAL_RECOVERY_REQUIRED',
]);

// ─── R2-B: Restore Execution Constants ─────────────────────────────────────
// These are used only by executeRestoreBackup below.
// executeRestoreBackup is NOT exported and NOT accessible from any other layer
// until a separate approved milestone (R2-C) wires it through the service.
const RESTORE_EXECUTION_ACKNOWLEDGEMENT =
  'I confirm this certified backup Restore is authorized and I accept full responsibility for data replacement.';
const BACKUP_TABLE_SET = new Set(BACKUP_COVERAGE_POLICY.tables.map((t) => t.name));
const EXCLUDED_RESTORE_TABLES = new Set(['refresh_tokens']);
// ─────────────────────────────────────────────────────────────────────────────

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
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

function hashValue(value) {
  return crypto.createHash(INTEGRITY_ALGORITHM).update(stableStringify(value)).digest('hex');
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash(INTEGRITY_ALGORITHM).update(buffer).digest('hex');
}

function createBackupId() {
  return crypto.randomUUID();
}

function sanitizePathSegment(value) {
  return String(value || '')
    .replace(/[^a-z0-9_-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function ensureInsideDirectory(rootDirectory, targetPath) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Recovery backup path escaped the approved storage directory.');
  }
  return target;
}

async function resolveRecoveryBackupDirectory({ recoveryRoot = null } = {}) {
  const configuredRoot =
    recoveryRoot ||
    process.env.ENTERPRISE_POS_RESTORE_RECOVERY_DIR ||
    path.join(os.homedir(), 'AppData', 'Roaming', 'Enterprise POS');
  const recoveryDirectory = path.resolve(configuredRoot, 'backups', 'recovery');
  await fs.mkdir(recoveryDirectory, { recursive: true });
  const stat = await fs.lstat(recoveryDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Approved recovery backup directory is not a normal directory.');
  }
  return recoveryDirectory;
}

async function createSafetyBackupPath({ operationId, recoveryRoot = null, now = new Date() } = {}) {
  const recoveryDirectory = await resolveRecoveryBackupDirectory({ recoveryRoot });
  const shortOperationId = sanitizePathSegment(operationId).slice(0, 12) || 'restore-op';
  const baseName = `restore-safety-backup-${shortOperationId}-${safeTimestamp(now)}.json`;
  const targetPath = await ensureInsideDirectory(
    recoveryDirectory,
    path.join(recoveryDirectory, baseName)
  );
  try {
    await fs.access(targetPath);
    throw new Error('Generated safety backup path already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return targetPath;
}

async function databaseVersion(db = getPool()) {
  const result = await db.query('SELECT version() AS version');
  return result.rows[0]?.version || 'unknown';
}

async function collectBackupData(db = getPool()) {
  const data = {};
  const tableEvidence = [];
  for (const table of BACKUP_COVERAGE_POLICY.tables) {
    const result = await db.query(`SELECT * FROM ${quoteIdentifier(table.name)} ORDER BY 1 ASC`);
    data[table.name] = result.rows;
    tableEvidence.push({
      ...table,
      rowCount: result.rowCount,
    });
  }
  return { data, tableEvidence };
}

async function withReadOnlyRepeatableReadSnapshot(db, callback) {
  const client = await db.connect();
  let transactionStarted = false;
  let transactionStartedAt = null;

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    transactionStartedAt = Date.now();
    const result = await callback(client);
    await client.query('COMMIT');
    const transactionCompletedAt = Date.now();
    return {
      ...result,
      snapshotTransaction: {
        isolationLevel: 'repeatable read',
        readOnly: true,
        startedAt: new Date(transactionStartedAt).toISOString(),
        completedAt: new Date(transactionCompletedAt).toISOString(),
        durationMs: transactionCompletedAt - transactionStartedAt,
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function captureBackupSnapshot({ db, backupId, correlationId, createdAt, userId }) {
  return withReadOnlyRepeatableReadSnapshot(db, async (client) => {
    const { data, tableEvidence } = await collectBackupData(client);
    const metadata = await createMetadata({
      backupId,
      correlationId,
      createdAt,
      userId,
      db: client,
    });
    return { data, tableEvidence, metadata };
  });
}

function createManifest({ backupId, correlationId, createdAt, dataHash, tableEvidence }) {
  return {
    backupIdentity: {
      backupId,
      correlationId,
    },
    backupClass: BACKUP_COVERAGE_POLICY.backupClass,
    manifestVersion: BACKUP_MANIFEST_VERSION,
    compatibilityDeclaration: {
      application: 'Enterprise POS',
      applicationVersion: packageJson.version,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      workflowVersion: BACKUP_WORKFLOW_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
    coverageDeclaration: {
      policyDocument: BACKUP_COVERAGE_POLICY.policyDocument,
      includedTables: tableEvidence,
      excludedTables: BACKUP_COVERAGE_POLICY.excludedTables,
    },
    integrityDeclaration: {
      algorithm: INTEGRITY_ALGORITHM,
      dataHash,
    },
    recoveryDeclaration: {
      restoreEligible: false,
      restoreStatus: 'Blocked',
      restoreBlockReason:
        'Restore remains blocked until Documents 48 and 49 certification gates are implemented.',
    },
    createdAt,
  };
}

async function createMetadata({ backupId, correlationId, createdAt, userId, db = getPool() }) {
  return {
    backupUuid: backupId,
    createdAt,
    operator: {
      userId,
    },
    applicationVersion: packageJson.version,
    schemaVersion: SCHEMA_VERSION,
    workflowVersion: BACKUP_WORKFLOW_VERSION,
    databaseVersion: await databaseVersion(db),
    edition: 'Desktop POS',
    machine: os.hostname(),
    terminal: null,
    correlationId,
  };
}

function createVerification({ backup, parsedBackup }) {
  const expectedHash = backup.manifest.integrityDeclaration.dataHash;
  const actualHash = hashValue(parsedBackup.data);
  const coverageTables = backup.manifest.coverageDeclaration.includedTables.map(
    (table) => table.name
  );
  const parsedTables = Object.keys(parsedBackup.data || {}).sort();
  const expectedTables = [...coverageTables].sort();
  const rowCountsMatch = backup.manifest.coverageDeclaration.includedTables.every(
    (table) =>
      Array.isArray(parsedBackup.data?.[table.name]) &&
      parsedBackup.data[table.name].length === table.rowCount
  );
  const tablesMatch = stableStringify(parsedTables) === stableStringify(expectedTables);
  const passed =
    parsedBackup?.metadata?.backupUuid === backup.metadata.backupUuid &&
    parsedBackup?.manifest?.manifestVersion === BACKUP_MANIFEST_VERSION &&
    parsedBackup?.manifest?.backupClass === BACKUP_COVERAGE_POLICY.backupClass &&
    parsedBackup?.manifest?.recoveryDeclaration?.restoreEligible === false &&
    actualHash === expectedHash &&
    tablesMatch &&
    rowCountsMatch;

  return {
    status: passed ? 'Passed' : 'Failed',
    verifiedAt: new Date().toISOString(),
    checks: {
      manifestPresent: Boolean(parsedBackup.manifest),
      metadataPresent: Boolean(parsedBackup.metadata),
      backupIdentityMatch: parsedBackup?.metadata?.backupUuid === backup.metadata.backupUuid,
      manifestVersionMatch: parsedBackup?.manifest?.manifestVersion === BACKUP_MANIFEST_VERSION,
      backupClassMatch: parsedBackup?.manifest?.backupClass === BACKUP_COVERAGE_POLICY.backupClass,
      restoreBlocked: parsedBackup?.manifest?.recoveryDeclaration?.restoreEligible === false,
      integrityHashMatch: actualHash === expectedHash,
      coverageTablesMatch: tablesMatch,
      rowCountsMatch,
    },
  };
}

async function verifyWrittenBackup(filePath, backup) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsedBackup = JSON.parse(raw);
  const verification = createVerification({ backup, parsedBackup });
  if (verification.status !== 'Passed') {
    throw Object.assign(new Error('BACKUP_VERIFICATION_FAILED'), { verification });
  }
  return verification;
}

function mapPrinter(row = {}) {
  return {
    printerName: row.printer_name || '',
    paperWidth: row.paper_width || '80mm',
    autoPrint: Boolean(row.auto_print),
    silentPrint: Boolean(row.silent_print),
    receiptCopies: Number(row.receipt_copies || 1),
    footerText: row.footer_text || 'Thank you for shopping',
  };
}

async function getSettings() {
  const settingsResult = await getPool().query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1)',
    [SETTING_KEYS]
  );
  const printerResult = await getPool().query(
    'SELECT * FROM printer_settings ORDER BY id ASC LIMIT 1'
  );
  const settings = Object.fromEntries(settingsResult.rows.map((row) => [row.key, row.value]));
  return {
    store: settings.store || {},
    tax: settings.tax || {},
    printer: mapPrinter(printerResult.rows[0]),
    system: settings.system || {},
  };
}

async function saveSettings(payload, userId) {
  await withTransaction(async (client) => {
    for (const key of SETTING_KEYS) {
      await client.query(
        `
          INSERT INTO app_settings (key, value, updated_by, updated_at)
          VALUES ($1, $2::jsonb, $3, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `,
        [key, JSON.stringify(payload[key] || {}), userId]
      );
    }

    await client.query(
      `
        UPDATE printer_settings
        SET printer_name = $1, paper_width = $2, silent_print = $3, footer_text = $4,
            auto_print = $5, receipt_copies = $6, updated_at = NOW()
        WHERE id = (SELECT id FROM printer_settings ORDER BY id ASC LIMIT 1)
      `,
      [
        payload.printer.printerName || null,
        payload.printer.paperWidth,
        Boolean(payload.printer.silentPrint),
        payload.printer.footerText,
        Boolean(payload.printer.autoPrint),
        payload.printer.receiptCopies,
      ]
    );
  });
  return getSettings();
}

async function saveStoreSettings(store, userId) {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO app_settings (key, value, updated_by, updated_at)
        VALUES ('store', $1::jsonb, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      `,
      [JSON.stringify(store || {}), userId]
    );
  });
  return getSettings();
}

async function exportBackup(filePath, userId, options = {}) {
  const db = options.pool || getPool();
  const backupId = createBackupId();
  const correlationId = createBackupId();
  const createdAt = new Date().toISOString();
  const { data, tableEvidence, metadata, snapshotTransaction } = await captureBackupSnapshot({
    db,
    backupId,
    correlationId,
    createdAt,
    userId,
  });
  const dataHash = hashValue(data);
  const manifest = createManifest({ backupId, correlationId, createdAt, dataHash, tableEvidence });

  const backup = {
    manifest,
    metadata,
    data,
  };

  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
  const verification = await verifyWrittenBackup(filePath, backup);
  const certifiedBackup = {
    ...backup,
    verification,
    certification: {
      status: 'Backup Certified',
      certifiedAt: verification.verifiedAt,
      scope: 'Certified Backup Phase 1',
      restoreEligible: false,
    },
  };
  await fs.writeFile(filePath, JSON.stringify(certifiedBackup, null, 2), 'utf8');
  const fileName = path.basename(filePath);
  const log = await createBackupLog({
    fileName,
    filePath,
    action: 'BACKUP',
    status: 'SUCCESS',
    message: `Certified backup created. ${BACKUP_TABLES.length} tables captured. Restore remains blocked.`,
    userId,
    db,
  });
  return {
    backupId,
    correlationId,
    fileName,
    filePath,
    logId: log.id,
    tableCount: BACKUP_TABLES.length,
    integrityHash: dataHash,
    verificationStatus: verification.status,
    restoreEligible: false,
    snapshotTransaction,
  };
}

async function assessBackupPreflight(filePath) {
  const normalizedPath = String(filePath || '').trim();
  const checks = [];
  const warnings = [];
  if (!normalizedPath) {
    return {
      ok: false,
      preflightStatus: 'blocked',
      selectedPathAvailable: false,
      writableDestination: false,
      estimatedBackupReady: false,
      filePath: null,
      fileName: null,
      checks: [
        {
          name: 'selected_path',
          status: 'blocked',
          message: 'No backup destination was selected.',
        },
      ],
      warnings: [],
      message: 'Backup preflight blocked. Select a backup destination before creating backup.',
    };
  }

  const fileName = path.basename(normalizedPath);
  const directory = path.dirname(normalizedPath);
  let directoryExists = false;
  let writableDestination = false;
  let targetFileExists = false;

  try {
    const directoryStat = await fs.stat(directory);
    directoryExists = directoryStat.isDirectory();
  } catch {
    directoryExists = false;
  }
  checks.push({
    name: 'destination_directory',
    status: directoryExists ? 'passed' : 'blocked',
    message: directoryExists
      ? 'Backup destination directory exists.'
      : 'Backup destination directory does not exist.',
  });

  if (directoryExists) {
    try {
      await fs.access(directory, fsConstants.W_OK);
      writableDestination = true;
    } catch {
      writableDestination = false;
    }
  }
  checks.push({
    name: 'writable_destination',
    status: writableDestination ? 'passed' : 'blocked',
    message: writableDestination
      ? 'Backup destination appears writable.'
      : 'Backup destination is not writable.',
  });

  try {
    const targetStat = await fs.stat(normalizedPath);
    targetFileExists = targetStat.isFile();
  } catch {
    targetFileExists = false;
  }
  if (targetFileExists) {
    warnings.push('Selected file already exists and may be overwritten if backup is created.');
  }
  checks.push({
    name: 'selected_path',
    status: 'passed',
    message: targetFileExists
      ? 'Selected backup path already exists.'
      : 'Selected backup path is available for a new file.',
  });

  const extensionOk = path.extname(normalizedPath).toLowerCase() === '.json';
  if (!extensionOk) warnings.push('Backup files should use the .json extension.');
  checks.push({
    name: 'backup_extension',
    status: extensionOk ? 'passed' : 'warning',
    message: extensionOk
      ? 'Backup destination uses the .json extension.'
      : 'Backup destination does not use the .json extension.',
  });

  const blocked = checks.some((check) => check.status === 'blocked');
  const preflightStatus = blocked ? 'blocked' : warnings.length ? 'warning' : 'ready';

  return {
    ok: !blocked,
    preflightStatus,
    selectedPathAvailable: Boolean(normalizedPath),
    writableDestination,
    estimatedBackupReady: !blocked,
    filePath: normalizedPath,
    fileName,
    directory,
    targetFileExists,
    checks,
    warnings,
    message: blocked
      ? 'Backup preflight blocked. Resolve destination issues before creating backup.'
      : 'Backup preflight completed. Backup creation is still a separate action.',
  };
}

async function createBackupLog({
  fileName,
  filePath,
  action,
  status,
  message,
  userId,
  db = getPool(),
}) {
  const result = await db.query(
    `
      INSERT INTO backup_logs (file_name, file_path, action, status, message, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [fileName, filePath || null, action, status, message || null, userId || null]
  );
  return result.rows[0];
}

function recoveryStateFromActivity(row) {
  if (!row) return restoreRecoveryStateModel.createIdleRecoveryState();
  const metadata = row.metadata || {};
  return restoreRecoveryStateModel.normalizeRecoveryState({
    ...(metadata.recoveryState || metadata),
    updatedAt: row.created_at || metadata.updatedAt,
    transitionEvidence: [
      {
        activityLogId: row.id,
        action: row.action,
        status: row.status,
        message: row.message,
        createdAt: row.created_at,
      },
    ],
  });
}

function operationRowToRecoveryState(row, transitionEvidence = []) {
  if (!row) return restoreRecoveryStateModel.createIdleRecoveryState();
  const hasTargetDatabaseReference =
    row.target_database_fingerprint ||
    row.target_database_name ||
    row.target_database_host ||
    row.target_database_port != null ||
    row.target_database_disposable != null ||
    row.target_database_ambiguous != null;
  const targetDatabaseReference = hasTargetDatabaseReference
    ? {
        fingerprint: row.target_database_fingerprint || null,
        database: row.target_database_name || null,
        host: row.target_database_host || null,
        port: row.target_database_port || null,
        disposableCertificationDatabase: row.target_database_disposable === true,
        ambiguous: row.target_database_ambiguous === true,
      }
    : null;
  return restoreRecoveryStateModel.normalizeRecoveryState({
    operationId: row.operation_id,
    ownerUserId: row.owner_user_id,
    sourceBackupId: row.source_backup_id,
    sourcePackageFingerprint: row.source_package_fingerprint,
    sourcePackageChecksum: row.source_package_checksum,
    sourceManifestVersion: row.source_manifest_version,
    targetDatabaseReference,
    currentState: row.state,
    previousState: row.previous_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    safetyBackupReference:
      row.safety_backup_id || row.safety_backup_path || row.safety_backup_checksum
        ? {
            safetyBackupId: row.safety_backup_id,
            filePath: row.safety_backup_path,
            checksum: row.safety_backup_checksum,
            backupLogId: row.safety_backup_log_id,
          }
        : null,
    finalConfirmationReference:
      row.final_confirmation_id || row.final_confirmation_hash
        ? {
            confirmationId: row.final_confirmation_id,
            confirmationHash: row.final_confirmation_hash,
            issuedAt: row.final_confirmation_issued_at,
            expiresAt: row.final_confirmation_expires_at,
            consumedAt: row.final_confirmation_consumed_at,
            databaseFingerprint: row.final_confirmation_database_fingerprint,
            policyDigest: row.final_confirmation_policy_digest,
            preflightDigest: row.final_confirmation_preflight_digest,
          }
        : null,
    failureCategory: row.failure_category,
    sanitizedFailureSummary: row.sanitized_failure_summary,
    replayStatus: row.terminal_at ? 'terminal' : 'not_replayed',
    rollbackRequired: row.requires_rollback === true,
    restartRequired: row.requires_restart === true,
    completionMarker: row.terminal_at ? `${row.state}:${row.terminal_at}` : null,
    transitionEvidence,
  });
}

async function latestRestoreOperation(client = null) {
  const db = client || getPool();
  const result = await db.query(
    `
      SELECT *
      FROM restore_operations
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `
  );
  return result.rows[0] || null;
}

async function activeRestoreOperation(client = null) {
  const db = client || getPool();
  const result = await db.query(
    `
      SELECT *
      FROM restore_operations
      WHERE terminal_at IS NULL
        AND state = ANY($1::text[])
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [RESTORE_OPERATION_UNRESOLVED_STATES]
  );
  return result.rows[0] || null;
}

async function restoreOperationEvidence(operationId, client = null) {
  if (!operationId) return [];
  const db = client || getPool();
  const result = await db.query(
    `
      SELECT id, action, status, message, metadata, created_at
      FROM activity_logs
      WHERE action IN ($1, $2, $3)
        AND metadata->>'operationId' = $4
      ORDER BY created_at ASC, id ASC
    `,
    [
      RESTORE_RECOVERY_ACTIVITY,
      RESTORE_OPERATION_ACTIVITY,
      RESTORE_SAFETY_BACKUP_ACTIVITY,
      String(operationId),
    ]
  );
  return result.rows.map((row) => ({
    activityLogId: row.id,
    action: row.action,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  }));
}

async function getRestoreRecoveryState() {
  const operation = (await activeRestoreOperation()) || (await latestRestoreOperation());
  if (operation) {
    const evidence = await restoreOperationEvidence(operation.operation_id);
    return operationRowToRecoveryState(operation, evidence);
  }
  const result = await getPool().query(
    `
      SELECT id, action, status, message, metadata, created_at
      FROM activity_logs
      WHERE action = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [RESTORE_RECOVERY_ACTIVITY]
  );
  return recoveryStateFromActivity(result.rows[0]);
}

function isTerminalRestoreState(state) {
  return RESTORE_OPERATION_TERMINAL_STATES.includes(state);
}

async function recordRestoreOperationActivity({
  client,
  userId = null,
  operationId,
  action = RESTORE_OPERATION_ACTIVITY,
  status = 'recorded',
  message,
  metadata = {},
}) {
  await client.query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      userId,
      action,
      status,
      message || 'Restore operation lifecycle event recorded.',
      JSON.stringify({ ...metadata, operationId }),
    ]
  );
}

async function acquireRestoreOperationLock({
  ownerUserId,
  sourceBackupId = null,
  sourcePackageFingerprint = null,
  sourcePackageChecksum = null,
  sourceManifestVersion = null,
} = {}) {
  if (!ownerUserId) {
    return {
      ok: false,
      lockAcquired: false,
      message: 'Restore preparation requires an authenticated owner.',
    };
  }

  return withTransaction(async (client) => {
    const existing = await activeRestoreOperation(client);
    if (existing) {
      return {
        ok: false,
        lockAcquired: false,
        recoveryState: operationRowToRecoveryState(
          existing,
          await restoreOperationEvidence(existing.operation_id, client)
        ),
        message: 'An unresolved Restore preparation operation already exists.',
      };
    }

    const operationId = restoreRecoveryStateModel.createOperationId();
    const insert = await client.query(
      `
        INSERT INTO restore_operations (
          operation_id,
          owner_user_id,
          source_backup_id,
          source_package_fingerprint,
          source_package_checksum,
          source_manifest_version,
          state,
          previous_state
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PREFLIGHT_READY', 'IDLE')
        RETURNING *
      `,
      [
        operationId,
        ownerUserId,
        sourceBackupId,
        sourcePackageFingerprint,
        sourcePackageChecksum,
        sourceManifestVersion,
      ]
    );
    const row = insert.rows[0];
    await recordRestoreOperationActivity({
      client,
      userId: ownerUserId,
      operationId,
      status: 'locked',
      message: 'Exclusive Restore preparation lock acquired.',
      metadata: {
        state: row.state,
        sourceBackupId,
        sourcePackageFingerprint,
        sourceManifestVersion,
        noRestoreExecuted: true,
      },
    });
    return {
      ok: true,
      lockAcquired: true,
      operationId,
      recoveryState: operationRowToRecoveryState(
        row,
        await restoreOperationEvidence(operationId, client)
      ),
      message: 'Exclusive Restore preparation lock acquired.',
    };
  }).catch(async (error) => {
    if (error && error.code === '23505') {
      const existing = await activeRestoreOperation().catch(() => null);
      return {
        ok: false,
        lockAcquired: false,
        recoveryState: existing ? operationRowToRecoveryState(existing) : null,
        message: 'A concurrent Restore preparation request acquired the lock first.',
      };
    }
    throw error;
  });
}

async function transitionRestoreOperation({
  operationId,
  requestedByUserId,
  nextState,
  safetyBackupReference = null,
  targetDatabaseReference = null,
  failureCategory = null,
  failureSummary = null,
  replayStatus = 'not_replayed',
} = {}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM restore_operations
        WHERE operation_id = $1
        FOR UPDATE
      `,
      [operationId]
    );
    const currentRow = result.rows[0];
    if (!currentRow) {
      return {
        ok: false,
        transitionRecorded: false,
        message: 'Restore preparation operation was not found.',
      };
    }
    const validation = restoreRecoveryStateModel.validateTransition({
      currentState: currentRow.state,
      nextState,
      ownerUserId: currentRow.owner_user_id,
      requestedByUserId,
    });
    if (!validation.transitionAllowed) {
      return {
        ok: false,
        transitionRecorded: false,
        validation,
        recoveryState: operationRowToRecoveryState(currentRow),
        message: 'Restore recovery transition rejected.',
      };
    }
    const sanitizedFailureSummary =
      restoreRecoveryStateModel.sanitizeFailureSummary(failureSummary);
    const terminal = isTerminalRestoreState(nextState);
    const safety = safetyBackupReference || {};
    const target = targetDatabaseReference || {};
    const updated = await client.query(
      `
        UPDATE restore_operations
        SET
          previous_state = state,
          state = $2,
          safety_backup_id = COALESCE($3, safety_backup_id),
          safety_backup_path = COALESCE($4, safety_backup_path),
          safety_backup_checksum = COALESCE($5, safety_backup_checksum),
          safety_backup_log_id = COALESCE($6, safety_backup_log_id),
          target_database_fingerprint = COALESCE($7, target_database_fingerprint),
          target_database_name = COALESCE($8, target_database_name),
          target_database_host = COALESCE($9, target_database_host),
          target_database_port = COALESCE($10, target_database_port),
          target_database_disposable = COALESCE($11, target_database_disposable),
          target_database_ambiguous = COALESCE($12, target_database_ambiguous),
          failure_category = $13,
          sanitized_failure_summary = $14,
          requires_restart = requires_restart OR $15,
          requires_rollback = requires_rollback OR $16,
          updated_at = NOW(),
          terminal_at = CASE WHEN $17 THEN NOW() ELSE terminal_at END
        WHERE operation_id = $1
        RETURNING *
      `,
      [
        operationId,
        nextState,
        safety.safetyBackupId || null,
        safety.filePath || null,
        safety.checksum || null,
        safety.backupLogId || null,
        target.fingerprint || null,
        target.database || target.databaseName || target.normalizedDatabaseName || null,
        target.host || null,
        target.port || null,
        typeof target.disposableCertificationDatabase === 'boolean'
          ? target.disposableCertificationDatabase
          : null,
        typeof target.ambiguous === 'boolean' ? target.ambiguous : null,
        failureCategory || null,
        sanitizedFailureSummary || null,
        nextState === 'RESTORE_APPLIED' || nextState === 'POST_RESTORE_VERIFYING',
        nextState === 'FAILED_ROLLBACK_REQUIRED' || nextState === 'ROLLBACK_IN_PROGRESS',
        terminal,
      ]
    );
    await recordRestoreOperationActivity({
      client,
      userId: requestedByUserId || currentRow.owner_user_id,
      operationId,
      action: RESTORE_RECOVERY_ACTIVITY,
      status: terminal ? 'terminal' : 'recorded',
      message: `Restore recovery state transitioned from ${currentRow.state} to ${nextState}.`,
      metadata: {
        previousState: currentRow.state,
        currentState: nextState,
        safetyBackupReference,
        targetDatabaseReference,
        failureCategory,
        sanitizedFailureSummary,
        replayStatus,
        noRestoreExecuted: true,
        restoreExecutionAvailable: false,
      },
    });
    const row = updated.rows[0];
    return {
      ok: true,
      transitionRecorded: true,
      validation,
      recoveryState: operationRowToRecoveryState(
        row,
        await restoreOperationEvidence(operationId, client)
      ),
      message: 'Restore recovery transition recorded.',
    };
  });
}

async function assessDatabaseHealthForRestorePreparation() {
  try {
    const result = await getPool().query('SELECT 1 AS ok');
    return {
      status: result.rows[0]?.ok === 1 ? 'healthy' : 'unhealthy',
      checkedAt: new Date().toISOString(),
      message: 'Database health check completed for Restore safety preparation.',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      checkedAt: new Date().toISOString(),
      message: 'Database health check failed for Restore safety preparation.',
      sanitizedFailureSummary: restoreRecoveryStateModel.sanitizeFailureSummary(error.message),
    };
  }
}

async function markRestorePreparationFailure({
  operationId,
  ownerUserId,
  failureCategory,
  failureSummary,
} = {}) {
  if (!operationId) return null;
  return transitionRestoreOperation({
    operationId,
    requestedByUserId: ownerUserId,
    nextState: restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
    failureCategory,
    failureSummary,
    replayStatus: 'blocked',
  }).catch(() => null);
}

async function prepareRestoreSafetyBackup({
  sourcePackagePath,
  ownerUserId,
  recoveryRoot = null,
} = {}) {
  const selectedPath = String(sourcePackagePath || '').trim();
  if (!selectedPath) {
    return {
      ok: false,
      preparationStarted: false,
      message: 'A verified backup package must be selected before safety preparation.',
    };
  }

  const verification = await verifyRestorePackage(selectedPath);
  if (verification.verificationStatus !== 'passed') {
    return {
      ok: false,
      preparationStarted: false,
      packageVerification: verification,
      message: 'Safety preparation blocked because package verification did not pass.',
    };
  }

  const eligibility = await assessRestoreEligibility(selectedPath);
  if (eligibility.eligibilityStatus !== 'eligible_for_authorization') {
    return {
      ok: false,
      preparationStarted: false,
      packageVerification: verification,
      packageEligibility: eligibility,
      message: 'Safety preparation blocked because package eligibility did not pass.',
    };
  }

  const databaseHealth = await assessDatabaseHealthForRestorePreparation();
  if (databaseHealth.status !== 'healthy') {
    return {
      ok: false,
      preparationStarted: false,
      packageVerification: verification,
      packageEligibility: eligibility,
      databaseHealth,
      message: 'Safety preparation blocked because database health did not pass.',
    };
  }

  const summary = verification.summary || {};
  const sourcePackageChecksum = await hashFile(selectedPath);
  const lock = await acquireRestoreOperationLock({
    ownerUserId,
    sourceBackupId: summary.backupId || null,
    sourcePackageFingerprint: sourcePackageChecksum,
    sourcePackageChecksum,
    sourceManifestVersion: summary.manifestVersion || null,
  });
  if (!lock.ok) {
    return {
      ok: false,
      preparationStarted: false,
      packageVerification: verification,
      packageEligibility: eligibility,
      databaseHealth,
      ...lock,
    };
  }

  const operationId = lock.operationId;
  let targetPath = null;
  try {
    const inProgress = await transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
    });
    if (!inProgress.ok) return inProgress;

    targetPath = await createSafetyBackupPath({ operationId, recoveryRoot });
    const safetyBackup = await exportBackup(targetPath, ownerUserId);
    const safetyBackupChecksum = await hashFile(targetPath);
    const safetyBackupVerification = await verifyRestorePackage(targetPath);
    if (safetyBackupVerification.verificationStatus !== 'passed') {
      await markRestorePreparationFailure({
        operationId,
        ownerUserId,
        failureCategory: 'safety_backup_verification_failed',
        failureSummary: safetyBackupVerification.message,
      });
      return {
        ok: false,
        preparationStarted: true,
        operationId,
        safetyBackup: {
          filePath: targetPath,
          checksum: safetyBackupChecksum,
          verificationStatus: safetyBackupVerification.verificationStatus,
        },
        message:
          'Safety backup was created but failed verification. Restore execution remains unavailable.',
      };
    }

    await withTransaction(async (client) => {
      await recordRestoreOperationActivity({
        client,
        userId: ownerUserId,
        operationId,
        action: RESTORE_SAFETY_BACKUP_ACTIVITY,
        status: 'verified',
        message: 'Pre-Restore safety backup created and verified.',
        metadata: {
          safetyBackupId: safetyBackup.backupId,
          safetyBackupLogId: safetyBackup.logId,
          safetyBackupFileName: safetyBackup.fileName,
          safetyBackupChecksum,
          verificationStatus: safetyBackupVerification.verificationStatus,
          noRestoreExecuted: true,
        },
      });
    });

    const transition = await transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      safetyBackupReference: {
        safetyBackupId: safetyBackup.backupId,
        filePath: targetPath,
        checksum: safetyBackupChecksum,
        backupLogId: safetyBackup.logId,
      },
    });

    return {
      ok: true,
      preparationStarted: true,
      safetyBackupVerified: true,
      noRestoreExecuted: true,
      restoreExecutionAvailable: false,
      operationId,
      recoveryState: transition.recoveryState,
      packageVerification: verification,
      packageEligibility: eligibility,
      databaseHealth,
      safetyBackup: {
        safetyBackupId: safetyBackup.backupId,
        fileName: safetyBackup.fileName,
        filePath: targetPath,
        checksum: safetyBackupChecksum,
        backupLogId: safetyBackup.logId,
        verificationStatus: safetyBackupVerification.verificationStatus,
      },
      message:
        'Pre-Restore safety backup is verified. Restore execution remains unavailable in this phase.',
    };
  } catch (error) {
    await markRestorePreparationFailure({
      operationId,
      ownerUserId,
      failureCategory: 'safety_backup_preparation_failed',
      failureSummary: error.message,
    });
    return {
      ok: false,
      preparationStarted: true,
      operationId,
      safetyBackupPath: targetPath,
      message:
        'Pre-Restore safety backup preparation failed. Restore execution remains unavailable.',
      failureSummary: restoreRecoveryStateModel.sanitizeFailureSummary(error.message),
    };
  }
}

async function cancelRestorePreparation({ operationId, ownerUserId } = {}) {
  const selectedOperationId = operationId || (await activeRestoreOperation())?.operation_id;
  if (!selectedOperationId) {
    return {
      ok: false,
      cancelled: false,
      message: 'No active Restore preparation operation is available to cancel.',
    };
  }
  const transition = await transitionRestoreOperation({
    operationId: selectedOperationId,
    requestedByUserId: ownerUserId,
    nextState: restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.CANCELLED,
    replayStatus: 'cancelled',
  });
  return {
    ...transition,
    cancelled: transition.ok === true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
    message: transition.ok
      ? 'Restore safety preparation was cancelled. No Restore was executed.'
      : transition.message,
  };
}

async function recordRestoreRecoveryTransition({
  operationId,
  ownerUserId = null,
  requestedByUserId = null,
  nextState,
  sourceBackupId = null,
  sourcePackageFingerprint = null,
  sourcePackageChecksum = null,
  sourceManifestVersion = null,
  safetyBackupReference = null,
  failureCategory = null,
  failureSummary = null,
  replayStatus = null,
  completionMarker = null,
} = {}) {
  const current = await getRestoreRecoveryState();
  const requestedOperationId =
    operationId || current.operationId || restoreRecoveryStateModel.createOperationId();
  const validation = restoreRecoveryStateModel.validateTransition({
    currentState: current.currentState,
    nextState,
    ownerUserId: current.ownerUserId,
    requestedByUserId,
  });
  if (!validation.transitionAllowed) {
    return {
      ok: false,
      transitionRecorded: false,
      validation,
      recoveryState: current,
      message: 'Restore recovery transition rejected.',
    };
  }

  const now = new Date().toISOString();
  const recoveryState = restoreRecoveryStateModel.normalizeRecoveryState({
    operationId: requestedOperationId,
    ownerUserId: current.ownerUserId || ownerUserId || requestedByUserId || null,
    sourceBackupId: sourceBackupId || current.sourceBackupId || null,
    sourcePackageFingerprint: sourcePackageFingerprint || current.sourcePackageFingerprint || null,
    sourcePackageChecksum: sourcePackageChecksum || current.sourcePackageChecksum || null,
    sourceManifestVersion: sourceManifestVersion || current.sourceManifestVersion || null,
    currentState: nextState,
    previousState: current.currentState,
    createdAt: current.createdAt || now,
    updatedAt: now,
    safetyBackupReference: safetyBackupReference || current.safetyBackupReference || null,
    failureCategory: failureCategory || null,
    sanitizedFailureSummary: restoreRecoveryStateModel.sanitizeFailureSummary(failureSummary),
    replayStatus: replayStatus || 'not_replayed',
    rollbackRequired: nextState === 'FAILED_ROLLBACK_REQUIRED' || current.rollbackRequired,
    restartRequired:
      nextState === 'RESTORE_APPLIED' ||
      nextState === 'POST_RESTORE_VERIFYING' ||
      current.restartRequired,
    completionMarker: completionMarker || null,
  });

  const log = await getPool().query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, action, status, message, metadata, created_at
    `,
    [
      requestedByUserId || recoveryState.ownerUserId || null,
      RESTORE_RECOVERY_ACTIVITY,
      'recorded',
      `Restore recovery state transitioned from ${current.currentState} to ${nextState}.`,
      JSON.stringify({ recoveryState, validation }),
    ]
  );

  return {
    ok: true,
    transitionRecorded: true,
    validation,
    recoveryState: recoveryStateFromActivity(log.rows[0]),
    message: 'Restore recovery transition recorded.',
  };
}

async function getRestoreExecutionPolicy() {
  const recoveryState = await getRestoreRecoveryState();
  const activeOperation = await activeRestoreOperation();
  const safety = recoveryState.safetyBackupReference || null;
  const databaseIdentity = restoreProductionGovernanceModel.resolveDatabaseIdentity();
  return restoreExecutionPolicyModel.createRestoreExecutionPolicy({
    recoveryState,
    productionGovernance: {
      databaseIdentity,
      startupRecovery: restoreProductionGovernanceModel.assessStartupRecovery(recoveryState),
      finalConfirmationRequired: true,
      finalConfirmationPresent: Boolean(recoveryState.finalConfirmationReference?.confirmationId),
      finalCertificationAssessment:
        restoreProductionGovernanceModel.createFinalCertificationAssessment({
          databaseIdentityValid:
            databaseIdentity.ambiguous !== true &&
            databaseIdentity.disposableCertificationDatabase !== true,
          recoveryStartupCertified: true,
          rollbackCertified: true,
          retentionPolicyCertified: true,
          safetyBackupVerified: recoveryState.currentState === 'SAFETY_BACKUP_VERIFIED',
          operationLockValid: Boolean(activeOperation),
        }),
    },
    operationLock: {
      locked: Boolean(activeOperation),
      operationId: activeOperation?.operation_id || recoveryState.operationId,
      ownerUserId: activeOperation?.owner_user_id || recoveryState.ownerUserId,
      currentState: activeOperation?.state || recoveryState.currentState,
      safetyBackupVerified: recoveryState.currentState === 'SAFETY_BACKUP_VERIFIED',
      safetyBackupReference: safety,
    },
  });
}

const CONTROLLED_RESTORE_CERTIFICATION_MARKERS = Object.freeze([
  'CONTROLLED_POST_RESTORE_VERIFICATION_FAILURE',
  'CONTROLLED_ROLLBACK_FAILURE',
  'CONTROLLED_MID_APPLICATION_FAILURE',
]);

function restoreOperationTargetsCurrentDatabase(operationRow, currentDatabaseIdentity) {
  if (!operationRow) {
    return { known: false, matches: false, reason: 'operation_missing' };
  }
  if (operationRow.target_database_fingerprint) {
    return {
      known: true,
      matches: operationRow.target_database_fingerprint === currentDatabaseIdentity?.fingerprint,
      reason: 'fingerprint_recorded',
    };
  }
  if (operationRow.target_database_name) {
    const targetName = String(operationRow.target_database_name || '').toLowerCase();
    const currentName = String(currentDatabaseIdentity?.database || '').toLowerCase();
    return {
      known: true,
      matches: targetName === currentName,
      reason: 'database_name_recorded',
    };
  }
  return { known: false, matches: false, reason: 'target_identity_missing' };
}

function isDisposableCertificationOperation(
  operationRow,
  evidence = [],
  currentDatabaseIdentity = {}
) {
  if (!operationRow) return false;
  if (operationRow.target_database_disposable === true) {
    return currentDatabaseIdentity.disposableCertificationDatabase !== true;
  }
  const targetName = String(operationRow.target_database_name || '').toLowerCase();
  if (/^enterprise_pos_restore_cert_/.test(targetName)) {
    return currentDatabaseIdentity.disposableCertificationDatabase !== true;
  }
  return false;
}

function isLegacyControlledCertificationEvidence(
  operationRow,
  evidence = [],
  currentDatabaseIdentity = {}
) {
  if (!operationRow || currentDatabaseIdentity.disposableCertificationDatabase === true)
    return false;
  if (operationRow.terminal_at == null) return false;
  if (operationRow.target_database_fingerprint || operationRow.target_database_name) return false;
  const summary = String(operationRow.sanitized_failure_summary || '');
  const evidenceText = evidence
    .map((item) => `${item.status || ''} ${item.message || ''}`)
    .join('\n');
  const controlledFailure = CONTROLLED_RESTORE_CERTIFICATION_MARKERS.some(
    (marker) => summary.includes(marker) || evidenceText.includes(marker)
  );
  const safetyPath = String(operationRow.safety_backup_path || '').toLowerCase();
  const tempCertificationPath =
    safetyPath.includes(`${path.sep.toLowerCase()}temp${path.sep.toLowerCase()}`) &&
    safetyPath.includes('epos-restore-');
  return controlledFailure && tempCertificationPath;
}

function classifyRestoreStartupOperation(
  operationRow,
  evidence = [],
  currentDatabaseIdentity = {}
) {
  if (!operationRow) {
    return {
      blocksCurrentDatabase: false,
      reason: 'operation_missing',
      targetMatchesCurrentDatabase: false,
      reconciledAsHistoricalCertification: false,
    };
  }
  const targetMatch = restoreOperationTargetsCurrentDatabase(operationRow, currentDatabaseIdentity);
  if (targetMatch.known) {
    const disposableOnly = isDisposableCertificationOperation(
      operationRow,
      evidence,
      currentDatabaseIdentity
    );
    return {
      blocksCurrentDatabase: targetMatch.matches && !disposableOnly,
      reason: disposableOnly ? 'disposable_target_not_current_database' : targetMatch.reason,
      targetMatchesCurrentDatabase: targetMatch.matches,
      reconciledAsHistoricalCertification: disposableOnly,
    };
  }
  if (isLegacyControlledCertificationEvidence(operationRow, evidence, currentDatabaseIdentity)) {
    return {
      blocksCurrentDatabase: false,
      reason: 'legacy_controlled_disposable_certification_evidence',
      targetMatchesCurrentDatabase: false,
      reconciledAsHistoricalCertification: true,
    };
  }
  return {
    blocksCurrentDatabase: true,
    reason: 'target_identity_missing_conservative_lockout',
    targetMatchesCurrentDatabase: null,
    reconciledAsHistoricalCertification: false,
  };
}

async function reconcileRestoreStartupOperation(operationRow) {
  if (!operationRow) return null;
  const state = operationRow.state;
  if (state !== restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS) {
    return operationRow;
  }

  const evidence = await restoreOperationEvidence(operationRow.operation_id);
  const hasRollbackTerminalEvidence = evidence.some(
    (item) =>
      item.status === 'terminal' &&
      /ROLLED_BACK|MANUAL_RECOVERY_REQUIRED/.test(String(item.message || ''))
  );
  if (hasRollbackTerminalEvidence) return operationRow;

  const transition = await transitionRestoreOperation({
    operationId: operationRow.operation_id,
    requestedByUserId: operationRow.owner_user_id,
    nextState: restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
    failureCategory: 'startup_rollback_outcome_ambiguous',
    failureSummary:
      'Application restarted while rollback was in progress and no durable rollback completion evidence was found.',
    replayStatus: 'startup_reconciled',
  });
  if (!transition.ok) return operationRow;

  const refreshed = await latestRestoreOperation();
  return refreshed || operationRow;
}

function createRestoreStartupRecoverySnapshot({
  recoveryState,
  startupRecovery,
  startupOperationClassification = null,
}) {
  const safety = recoveryState.safetyBackupReference || null;
  const finalConfirmation = recoveryState.finalConfirmationReference || null;
  const databaseIdentity = restoreProductionGovernanceModel.resolveDatabaseIdentity();
  const operationTarget = recoveryState.targetDatabaseReference || null;
  const applyEvidence = (recoveryState.transitionEvidence || []).filter((item) =>
    /RESTORE_IN_PROGRESS|RESTORE_APPLIED|POST_RESTORE_VERIFYING|COMPLETED/.test(
      String(item.message || '')
    )
  );
  const rollbackEvidence = (recoveryState.transitionEvidence || []).filter((item) =>
    /ROLLBACK|ROLLED_BACK|MANUAL_RECOVERY_REQUIRED/.test(String(item.message || ''))
  );
  return {
    recoveryState,
    previousState: recoveryState.previousState || null,
    operationId: recoveryState.operationId || null,
    unresolvedOperation: recoveryState.unresolvedRecoveryState === true,
    operationLockExists: recoveryState.activeOperation === true,
    sourcePackage: {
      backupId: recoveryState.sourceBackupId || null,
      checksum: recoveryState.sourcePackageChecksum || null,
      fingerprint: recoveryState.sourcePackageFingerprint || null,
      manifestVersion: recoveryState.sourceManifestVersion || null,
    },
    safetyBackup: safety
      ? {
          safetyBackupId: safety.safetyBackupId || null,
          checksum: safety.checksum || null,
          backupLogId: safety.backupLogId || null,
          verified: Boolean(safety.checksum),
        }
      : { verified: false },
    finalConfirmation,
    restoreApplyEvidence: {
      present: applyEvidence.length > 0,
      entries: applyEvidence,
    },
    postRestoreCertificationEvidence: {
      present: (recoveryState.transitionEvidence || []).some((item) =>
        /POST_RESTORE_VERIFYING|COMPLETED/.test(String(item.message || ''))
      ),
    },
    rollbackEvidence: {
      present: rollbackEvidence.length > 0,
      entries: rollbackEvidence,
      required: recoveryState.rollbackRequired === true,
    },
    targetDatabase: {
      identity: operationTarget || databaseIdentity,
      currentDatabaseIdentity: databaseIdentity,
      operationTargetKnown: Boolean(operationTarget),
      targetMatchesCurrentDatabase:
        startupOperationClassification?.targetMatchesCurrentDatabase ?? null,
      startupSelectionReason: startupOperationClassification?.reason || null,
      reconciledAsHistoricalCertification:
        startupOperationClassification?.reconciledAsHistoricalCertification === true,
      productionDatabase:
        (operationTarget || databaseIdentity).disposableCertificationDatabase !== true,
      disposableCertificationDatabase:
        (operationTarget || databaseIdentity).disposableCertificationDatabase === true,
    },
    startupMode: startupRecovery.startupMode,
    maintenanceLockRequired: startupRecovery.maintenanceModeRequired === true,
    mutationGuardActive: startupRecovery.databaseMutationsBlocked === true,
    allowedRecoveryActions: startupRecovery.allowedRecoveryActions || [],
    blockingReasons: startupRecovery.blockingReasons || [],
    manualInterventionReason: startupRecovery.requiresManualRecovery
      ? recoveryState.sanitizedFailureSummary ||
        'Manual recovery is required before write-capable operation can resume.'
      : null,
    assessedAt: startupRecovery.assessedAt || new Date().toISOString(),
  };
}

async function createRestoreFinalConfirmation({
  operationId,
  ownerUserId,
  typedPhrase,
  preflightDigest = null,
  executionPolicyDigest = null,
} = {}) {
  const policy = await getRestoreExecutionPolicy();
  const databaseIdentity = restoreProductionGovernanceModel.resolveDatabaseIdentity();
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM restore_operations
        WHERE operation_id = $1
        FOR UPDATE
      `,
      [operationId]
    );
    const row = result.rows[0];
    if (!row) {
      return {
        ok: false,
        confirmationCreated: false,
        message: 'Restore operation was not found.',
      };
    }
    if (String(row.owner_user_id || '') !== String(ownerUserId || '')) {
      return {
        ok: false,
        confirmationCreated: false,
        message: 'Restore final confirmation owner mismatch.',
      };
    }
    if (row.terminal_at || row.final_confirmation_consumed_at) {
      return {
        ok: false,
        confirmationCreated: false,
        message:
          'Restore final confirmation cannot be created for terminal or consumed operations.',
      };
    }
    if (row.final_confirmation_id || row.final_confirmation_hash) {
      return {
        ok: false,
        confirmationCreated: false,
        blockers: ['final_confirmation_already_recorded'],
        message: 'Restore final confirmation has already been recorded for this operation.',
      };
    }
    const confirmation = restoreProductionGovernanceModel.createConfirmationRecord({
      operationId,
      ownerUserId,
      sourcePackageChecksum: row.source_package_checksum,
      sourceManifestVersion: row.source_manifest_version,
      safetyBackupChecksum: row.safety_backup_checksum,
      databaseIdentity,
      preflightDigest,
      executionPolicyDigest:
        executionPolicyDigest || restoreProductionGovernanceModel.createPolicyDigest(policy),
      recoveryState: row.state,
      typedPhrase,
    });
    if (!confirmation.ok) {
      return {
        ok: false,
        confirmationCreated: false,
        blockers: confirmation.blockers,
        databaseIdentity,
        message: 'Restore final confirmation is blocked.',
      };
    }
    const updated = await client.query(
      `
        UPDATE restore_operations
        SET
          final_confirmation_id = $2,
          final_confirmation_hash = $3,
          final_confirmation_issued_at = $4,
          final_confirmation_expires_at = $5,
          final_confirmation_database_fingerprint = $6,
          final_confirmation_policy_digest = $7,
          final_confirmation_preflight_digest = $8,
          updated_at = NOW()
        WHERE operation_id = $1
        RETURNING *
      `,
      [
        operationId,
        confirmation.confirmationId,
        confirmation.confirmationHash,
        confirmation.issuedAt,
        confirmation.expiresAt,
        databaseIdentity.fingerprint,
        confirmation.binding.executionPolicyDigest,
        confirmation.binding.preflightDigest,
      ]
    );
    await recordRestoreOperationActivity({
      client,
      userId: ownerUserId,
      operationId,
      action: RESTORE_OPERATION_ACTIVITY,
      status: 'confirmation_issued',
      message:
        'Durable Restore final confirmation was issued. Production execution remains unavailable.',
      metadata: {
        confirmationId: confirmation.confirmationId,
        confirmationHash: confirmation.confirmationHash,
        databaseFingerprint: databaseIdentity.fingerprint,
        expiresAt: confirmation.expiresAt,
        restoreExecutionAvailable: false,
      },
    });
    return {
      ok: true,
      confirmationCreated: true,
      confirmation: {
        confirmationId: confirmation.confirmationId,
        confirmationHash: confirmation.confirmationHash,
        issuedAt: confirmation.issuedAt,
        expiresAt: confirmation.expiresAt,
        databaseFingerprint: databaseIdentity.fingerprint,
      },
      recoveryState: operationRowToRecoveryState(updated.rows[0]),
      executionEligible: false,
      executionCertified: false,
      restoreExecutionAvailable: false,
      message:
        'Restore final confirmation was recorded, but production Restore execution remains unavailable.',
    };
  });
}

async function getRestoreStartupRecoveryAssessment() {
  let activeOperation = await activeRestoreOperation();
  activeOperation = await reconcileRestoreStartupOperation(activeOperation);
  const latestOperation = activeOperation ? null : await latestRestoreOperation();
  const currentDatabaseIdentity = restoreProductionGovernanceModel.resolveDatabaseIdentity();
  let startupOperation = null;
  let startupOperationClassification = null;
  let ignoredRestoreOperation = null;
  if (activeOperation) {
    const evidence = await restoreOperationEvidence(activeOperation.operation_id);
    startupOperationClassification = classifyRestoreStartupOperation(
      activeOperation,
      evidence,
      currentDatabaseIdentity
    );
    if (startupOperationClassification.blocksCurrentDatabase) {
      startupOperation = activeOperation;
    } else {
      ignoredRestoreOperation = operationRowToRecoveryState(activeOperation, evidence);
    }
  } else if (
    latestOperation?.state ===
    restoreRecoveryStateModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED
  ) {
    const evidence = await restoreOperationEvidence(latestOperation.operation_id);
    startupOperationClassification = classifyRestoreStartupOperation(
      latestOperation,
      evidence,
      currentDatabaseIdentity
    );
    if (startupOperationClassification.blocksCurrentDatabase) {
      startupOperation = latestOperation;
    } else {
      ignoredRestoreOperation = operationRowToRecoveryState(latestOperation, evidence);
    }
  }
  const recoveryState = startupOperation
    ? operationRowToRecoveryState(
        startupOperation,
        await restoreOperationEvidence(startupOperation.operation_id)
      )
    : restoreRecoveryStateModel.createIdleRecoveryState();
  const startupRecovery = restoreProductionGovernanceModel.assessStartupRecovery(recoveryState);
  const startupRecoverySnapshot = createRestoreStartupRecoverySnapshot({
    recoveryState,
    startupRecovery,
    startupOperationClassification,
  });
  return {
    ok: true,
    recoveryState,
    startupRecovery,
    startupRecoverySnapshot,
    ignoredRestoreOperation,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  };
}

async function restoreOperationForSafetyArtifact(artifactPath) {
  const selectedPath = String(artifactPath || '').trim();
  if (!selectedPath) return null;
  const result = await getPool().query(
    `
      SELECT *
      FROM restore_operations
      WHERE safety_backup_path = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [selectedPath]
  );
  return result.rows[0] || null;
}

async function getRestoreRetentionAssessment({ artifactPath = null } = {}) {
  const selectedArtifactPath = String(artifactPath || '').trim();
  const operation = selectedArtifactPath
    ? await restoreOperationForSafetyArtifact(selectedArtifactPath)
    : null;

  if (selectedArtifactPath && !operation) {
    return {
      ok: true,
      linkedOperationFound: false,
      recoveryState: restoreRecoveryStateModel.createIdleRecoveryState(),
      retention: {
        artifactPath: selectedArtifactPath,
        testOnly: restoreProductionGovernanceModel.classifyRetention({
          recoveryState: restoreRecoveryStateModel.createIdleRecoveryState(),
          artifactPath: selectedArtifactPath,
        }).testOnly,
        terminal: false,
        dangerous: true,
        cleanupEligible: false,
        dryRunRequired: true,
        deleteOnlyInsideApprovedRecoveryRoot: true,
        reason:
          'Safety backup artifact is not linked to a Restore operation journal entry. Cleanup requires manual review.',
      },
      noRestoreExecuted: true,
      restoreExecutionAvailable: false,
    };
  }

  const recoveryState = operation
    ? operationRowToRecoveryState(operation, await restoreOperationEvidence(operation.operation_id))
    : await getRestoreRecoveryState();
  return {
    ok: true,
    linkedOperationFound: Boolean(operation),
    recoveryState,
    retention: restoreProductionGovernanceModel.classifyRetention({
      recoveryState,
      artifactPath: selectedArtifactPath || recoveryState.safetyBackupReference?.filePath || '',
    }),
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  };
}

function backupLogFilters(filters = {}) {
  const where = ['1=1'];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const search = String(filters.search || '').trim();
  if (search) {
    const token = `%${search.toLowerCase()}%`;
    const placeholder = addParam(token);
    where.push(`(
      LOWER(COALESCE(backup_logs.file_name, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(backup_logs.status, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(backup_logs.message, '')) LIKE ${placeholder}
    )`);
  }
  if (filters.status === 'success') {
    where.push(`LOWER(backup_logs.status) = ${addParam('success')}`);
  } else if (filters.status === 'failed') {
    where.push(`LOWER(backup_logs.status) = ${addParam('failed')}`);
  }
  if (filters.dateFrom) {
    where.push(`backup_logs.created_at >= ${addParam(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    where.push(`backup_logs.created_at < ${addParam(filters.dateTo)}`);
  }
  return { where: where.join(' AND '), params };
}

function backupLogSort(sort = 'newest') {
  if (sort === 'oldest') return 'backup_logs.created_at ASC';
  if (sort === 'status') return 'backup_logs.status ASC';
  return 'backup_logs.created_at DESC';
}

async function listBackupLogs(filters = {}) {
  const pageSize = Math.max(1, Math.min(200, Number(filters.pageSize) || 100));
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * pageSize;
  const filterSql = backupLogFilters(filters);
  const limitPlaceholder = `$${filterSql.params.length + 1}`;
  const offsetPlaceholder = `$${filterSql.params.length + 2}`;
  const queryParams = [...filterSql.params, pageSize, offset];
  const countResult = await getPool().query(
    `
      SELECT COUNT(*)::int AS total
      FROM backup_logs
      WHERE ${filterSql.where}
    `,
    filterSql.params
  );
  const result = await getPool().query(
    `
      SELECT backup_logs.*, users.full_name AS created_by_name
      FROM backup_logs
      LEFT JOIN users ON users.id = backup_logs.created_by
      WHERE ${filterSql.where}
      ORDER BY ${backupLogSort(filters.sort)}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    queryParams
  );
  return {
    backups: result.rows.map((row) => ({
      id: row.id,
      backupId: row.backup_id || null,
      fileName: row.file_name,
      filePath: row.file_path,
      action: row.action,
      status: row.status,
      message: row.message,
      createdBy: row.created_by_name || 'System',
      createdAt: row.created_at,
    })),
    page,
    pageSize,
    total: countResult.rows[0]?.total || 0,
  };
}

function mapDryRunReportRow(row = {}) {
  const metadata = row.metadata || {};
  const report = metadata.report || {};
  const packageSummary = metadata.packageSummary || report.packageSummary || {};
  return {
    id: row.id,
    action: row.action,
    status: row.status,
    message: row.message,
    createdBy: row.created_by_name || 'System',
    createdAt: row.created_at,
    reportCorrelationId: metadata.reportCorrelationId || report.reportCorrelationId || null,
    certificationStatus:
      metadata.certificationStatus || report.certificationStatus || row.status || null,
    backupId: packageSummary.backupId || null,
    packageCorrelationId: packageSummary.correlationId || null,
    fileName: packageSummary.fileName || null,
    backupClass: packageSummary.backupClass || null,
    verificationStatus: metadata.verificationSummary?.status || null,
    eligibilityStatus: metadata.eligibilitySummary?.status || null,
    authorizationStatus: metadata.authorizationSummary?.authorizationAssessmentStatus || null,
    noRestoreExecuted: metadata.noRestoreExecuted ?? report.noRestoreExecuted ?? true,
    restoreUnavailable: metadata.restoreUnavailable ?? report.restoreUnavailable ?? true,
    restoreEligible: metadata.restoreEligible ?? report.restoreEligible ?? false,
    blockingReasonCount: Array.isArray(metadata.blockingReasons)
      ? metadata.blockingReasons.length
      : 0,
    warningCount: Array.isArray(metadata.warnings) ? metadata.warnings.length : 0,
    report: report || null,
  };
}

function dryRunReportHistoryFilters(filters = {}) {
  const where = ["activity_logs.action = 'backup.restore.dry_run_certification_report'"];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const search = String(filters.search || '').trim();
  if (search) {
    const token = `%${search.toLowerCase()}%`;
    const placeholder = addParam(token);
    where.push(`(
      LOWER(COALESCE(activity_logs.metadata #>> '{packageSummary,fileName}', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(activity_logs.metadata #>> '{packageSummary,backupId}', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(activity_logs.metadata #>> '{report,packageSummary,backupId}', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(activity_logs.metadata #>> '{certificationStatus}', '')) LIKE ${placeholder}
      OR LOWER(COALESCE(activity_logs.metadata #>> '{reportCorrelationId}', '')) LIKE ${placeholder}
    )`);
  }

  if (filters.status === 'certified') {
    where.push("activity_logs.metadata->>'certificationStatus' = 'dry_run_certification_passed'");
  } else if (filters.status === 'blocked') {
    where.push("activity_logs.metadata->>'certificationStatus' = 'dry_run_certification_blocked'");
  } else if (filters.status === 'failed_verification') {
    where.push("activity_logs.metadata #>> '{verificationSummary,status}' = 'failed'");
  } else if (filters.status === 'failed_eligibility') {
    where.push("activity_logs.metadata #>> '{eligibilitySummary,status}' = 'blocked'");
  } else if (filters.status === 'authorization_blocked') {
    where.push(
      "activity_logs.metadata #>> '{authorizationSummary,authorizationAssessmentStatus}' = 'authorization_assessment_would_block'"
    );
  }

  if (filters.dateFrom) {
    where.push(`activity_logs.created_at >= ${addParam(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    where.push(`activity_logs.created_at < ${addParam(filters.dateTo)}`);
  }

  return { where: where.join(' AND '), params };
}

function dryRunReportSort(sort = 'newest') {
  if (sort === 'oldest') return 'activity_logs.created_at ASC';
  if (sort === 'status') return "activity_logs.metadata->>'certificationStatus' ASC";
  if (sort === 'package_name') {
    return "LOWER(COALESCE(activity_logs.metadata #>> '{packageSummary,fileName}', '')) ASC";
  }
  return 'activity_logs.created_at DESC';
}

async function listRestoreDryRunReports(filters = {}) {
  const pageSize = Math.max(1, Math.min(50, Number(filters.pageSize) || 10));
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * pageSize;
  const filterSql = dryRunReportHistoryFilters(filters);
  const limitPlaceholder = `$${filterSql.params.length + 1}`;
  const offsetPlaceholder = `$${filterSql.params.length + 2}`;
  const queryParams = [...filterSql.params, pageSize, offset];
  const countResult = await getPool().query(
    `
      SELECT COUNT(*)::int AS total
      FROM activity_logs
      WHERE ${filterSql.where}
    `,
    filterSql.params
  );
  const result = await getPool().query(
    `
      SELECT activity_logs.*, users.full_name AS created_by_name
      FROM activity_logs
      LEFT JOIN users ON users.id = activity_logs.user_id
      WHERE ${filterSql.where}
      ORDER BY ${dryRunReportSort(filters.sort)}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    queryParams
  );
  return {
    reports: result.rows.map((row) => {
      const mapped = mapDryRunReportRow(row);
      delete mapped.report;
      return mapped;
    }),
    page,
    pageSize,
    total: countResult.rows[0]?.total || 0,
  };
}

async function getRestoreDryRunReport(reportId) {
  const result = await getPool().query(
    `
      SELECT activity_logs.*, users.full_name AS created_by_name
      FROM activity_logs
      LEFT JOIN users ON users.id = activity_logs.user_id
      WHERE activity_logs.id = $1
        AND activity_logs.action = 'backup.restore.dry_run_certification_report'
      LIMIT 1
    `,
    [reportId]
  );
  if (!result.rows[0]) return null;
  return mapDryRunReportRow(result.rows[0]);
}

async function getRestoreReadinessDashboardEvidence() {
  const aggregateResult = await getPool().query(`
    SELECT
      COUNT(*)::int AS total_reports,
      COUNT(*) FILTER (
        WHERE activity_logs.metadata->>'certificationStatus' = 'dry_run_certification_passed'
      )::int AS certified_reports,
      COUNT(*) FILTER (
        WHERE activity_logs.metadata->>'certificationStatus' = 'dry_run_certification_blocked'
      )::int AS blocked_reports,
      COUNT(*) FILTER (
        WHERE activity_logs.metadata #>> '{verificationSummary,status}' = 'failed'
      )::int AS failed_verification_reports,
      COUNT(*) FILTER (
        WHERE activity_logs.metadata #>> '{eligibilitySummary,status}' = 'blocked'
      )::int AS failed_eligibility_reports,
      COUNT(*) FILTER (
        WHERE activity_logs.metadata #>> '{authorizationSummary,authorizationAssessmentStatus}' = 'authorization_assessment_would_block'
      )::int AS authorization_blocked_reports,
      MAX(activity_logs.created_at) AS latest_report_at
    FROM activity_logs
    WHERE activity_logs.action = 'backup.restore.dry_run_certification_report'
  `);
  const reportsResult = await getPool().query(`
    SELECT activity_logs.*, users.full_name AS created_by_name
    FROM activity_logs
    LEFT JOIN users ON users.id = activity_logs.user_id
    WHERE activity_logs.action = 'backup.restore.dry_run_certification_report'
    ORDER BY activity_logs.created_at DESC
    LIMIT 25
  `);
  return {
    aggregate: aggregateResult.rows[0] || {},
    reports: reportsResult.rows.map(mapDryRunReportRow),
  };
}

function packageReaderResult(status, message, details = {}) {
  return {
    ok: status === 'package_readable',
    status,
    message,
    restoreEligible: false,
    ...details,
  };
}

function verificationResult(status, message, details = {}) {
  return {
    ok: status === 'passed',
    verificationStatus: status,
    message,
    restoreEligible: false,
    ...details,
  };
}

function eligibilityResult(status, message, details = {}) {
  return {
    ok: status === 'eligible_for_authorization',
    eligibilityStatus: status,
    message,
    restoreEligible: false,
    ...details,
  };
}

function summarizePackage(filePath, backup) {
  const manifest = backup.manifest || {};
  const metadata = backup.metadata || {};
  const coverage = manifest.coverageDeclaration || {};
  const integrity = manifest.integrityDeclaration || {};
  const identity = manifest.backupIdentity || {};
  const includedTables = Array.isArray(coverage.includedTables) ? coverage.includedTables : [];
  const data = backup.data && typeof backup.data === 'object' ? backup.data : {};

  return {
    fileName: path.basename(filePath),
    filePath,
    packageReadable: true,
    backupId: identity.backupId || metadata.backupUuid || null,
    correlationId: identity.correlationId || metadata.correlationId || null,
    backupClass: manifest.backupClass || null,
    workflowVersion:
      metadata.workflowVersion || manifest.compatibilityDeclaration?.workflowVersion || null,
    manifestVersion: manifest.manifestVersion || null,
    applicationVersion:
      metadata.applicationVersion || manifest.compatibilityDeclaration?.applicationVersion || null,
    schemaVersion:
      metadata.schemaVersion || manifest.compatibilityDeclaration?.schemaVersion || null,
    createdAt: metadata.createdAt || manifest.createdAt || null,
    tableCount: includedTables.length,
    payloadTableCount: Object.keys(data).length,
    integrityAlgorithm: integrity.algorithm || null,
    integrityDeclared: Boolean(integrity.dataHash),
    restoreEligible: false,
    restoreStatus: manifest.recoveryDeclaration?.restoreStatus || 'Blocked',
  };
}

function packageSummary(filePath, backup) {
  const manifest = backup.manifest || {};
  const metadata = backup.metadata || {};
  const coverage = manifest.coverageDeclaration || {};
  const includedTables = Array.isArray(coverage.includedTables) ? coverage.includedTables : [];
  const excludedTables = Array.isArray(coverage.excludedTables) ? coverage.excludedTables : [];
  const data = backup.data && typeof backup.data === 'object' ? backup.data : {};
  return {
    ...summarizePackage(filePath, backup),
    includedTableCount: includedTables.length,
    excludedTableCount: excludedTables.length,
    certificationStatus: backup.certification?.status || null,
    verificationStatus: backup.verification?.status || null,
    createdAt: metadata.createdAt || manifest.createdAt || null,
    payloadTableCount: Object.keys(data).length,
  };
}

function check(name, passed, message) {
  return { name, passed: Boolean(passed), message };
}

function condition(name, passed, message, blockingReason) {
  return {
    name,
    passed: Boolean(passed),
    message,
    blockingReason: passed ? null : blockingReason || message,
  };
}

function validateCertifiedBackup(filePath, backup) {
  const manifest = backup.manifest || {};
  const metadata = backup.metadata || {};
  const coverage = manifest.coverageDeclaration || {};
  const integrity = manifest.integrityDeclaration || {};
  const identity = manifest.backupIdentity || {};
  const compatibility = manifest.compatibilityDeclaration || {};
  const recovery = manifest.recoveryDeclaration || {};
  const includedTables = Array.isArray(coverage.includedTables) ? coverage.includedTables : [];
  const excludedTables = Array.isArray(coverage.excludedTables) ? coverage.excludedTables : [];
  const data =
    backup.data && typeof backup.data === 'object' && !Array.isArray(backup.data)
      ? backup.data
      : null;
  const expectedIncluded = BACKUP_COVERAGE_POLICY.tables.map((table) => table.name).sort();
  const actualIncluded = includedTables.map((table) => table.name).sort();
  const payloadTables = data ? Object.keys(data).sort() : [];
  const expectedHash = integrity.dataHash;
  const actualHash = data ? hashValue(data) : null;
  const includedCoverageMatches =
    stableStringify(actualIncluded) === stableStringify(expectedIncluded);
  const payloadMatchesCoverage =
    data && stableStringify(payloadTables) === stableStringify(actualIncluded);
  const rowCountsMatch =
    data &&
    includedTables.every(
      (table) => Array.isArray(data[table.name]) && data[table.name].length === table.rowCount
    );
  const checks = [
    check('manifest.present', Boolean(backup.manifest), 'Manifest is present.'),
    check(
      'manifest.version',
      manifest.manifestVersion === BACKUP_MANIFEST_VERSION,
      'Manifest version is supported.'
    ),
    check('metadata.present', Boolean(backup.metadata), 'Metadata is present.'),
    check(
      'backup.uuid',
      Boolean(identity.backupId || metadata.backupUuid),
      'Backup UUID is present.'
    ),
    check(
      'correlation.id',
      Boolean(identity.correlationId || metadata.correlationId),
      'Correlation ID is present.'
    ),
    check(
      'backup.class',
      manifest.backupClass === BACKUP_COVERAGE_POLICY.backupClass,
      'Backup class is supported.'
    ),
    check(
      'workflow.version',
      metadata.workflowVersion === BACKUP_WORKFLOW_VERSION ||
        compatibility.workflowVersion === BACKUP_WORKFLOW_VERSION,
      'Workflow version is supported.'
    ),
    check(
      'integrity.section',
      integrity.algorithm === INTEGRITY_ALGORITHM && Boolean(expectedHash),
      'Integrity declaration is present.'
    ),
    check(
      'integrity.hash',
      Boolean(expectedHash) && actualHash === expectedHash,
      'SHA-256 data hash matches.'
    ),
    check('coverage.included', includedCoverageMatches, 'Included table coverage matches policy.'),
    check(
      'coverage.excluded',
      excludedTables.length === BACKUP_COVERAGE_POLICY.excludedTables.length,
      'Excluded table declaration is present.'
    ),
    check('payload.present', Boolean(data), 'Backup payload is present.'),
    check('payload.inventory', payloadMatchesCoverage, 'Payload tables match table inventory.'),
    check('row.counts', rowCountsMatch, 'Payload row counts match table inventory.'),
    check(
      'restore.blocked',
      recovery.restoreEligible === false,
      'Restore remains blocked in package declaration.'
    ),
    check(
      'certification.status',
      backup.certification?.status === 'Backup Certified',
      'Backup certification status is declared.'
    ),
  ];
  const failedChecks = checks.filter((item) => !item.passed);
  const passedChecks = checks.filter((item) => item.passed);
  const warnings = [];
  if (metadata.backupUuid && identity.backupId && metadata.backupUuid !== identity.backupId) {
    warnings.push('Metadata backup UUID differs from manifest backup identity.');
  }
  if (
    metadata.correlationId &&
    identity.correlationId &&
    metadata.correlationId !== identity.correlationId
  ) {
    warnings.push('Metadata correlation ID differs from manifest correlation identity.');
  }
  if (backup.verification?.status && backup.verification.status !== 'Passed') {
    warnings.push('Package carries a non-passing backup verification status.');
  }

  const passed = failedChecks.length === 0;
  return verificationResult(
    passed ? 'passed' : 'failed',
    passed
      ? 'Backup package verified. Verification Only - Restore is not available.'
      : 'Backup package failed verification. Restore remains unavailable.',
    {
      fileName: path.basename(filePath),
      filePath,
      summary: packageSummary(filePath, backup),
      passedChecks,
      failedChecks,
      warnings,
    }
  );
}

async function inspectRestorePackage(filePath) {
  if (!filePath) {
    return packageReaderResult('package_unreadable', 'No backup package was selected.');
  }

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return packageReaderResult('package_unreadable', 'Backup package could not be read.', {
      fileName: path.basename(filePath),
      filePath,
    });
  }

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    return packageReaderResult('malformed_package', 'Backup package is not valid JSON.', {
      fileName: path.basename(filePath),
      filePath,
    });
  }

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return packageReaderResult('malformed_package', 'Backup package structure is invalid.', {
      fileName: path.basename(filePath),
      filePath,
    });
  }

  if (!backup.manifest && backup.metadata?.app === 'Enterprise POS') {
    return packageReaderResult(
      'unsupported_format',
      'Legacy backup package format is unsupported for certified restore inspection.',
      {
        fileName: path.basename(filePath),
        filePath,
      }
    );
  }

  const missing = [];
  if (!backup.manifest) missing.push('manifest');
  if (!backup.metadata) missing.push('metadata');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    missing.push('backup payload');
  }
  if (!backup.manifest?.coverageDeclaration?.includedTables) missing.push('table inventory');
  if (!backup.manifest?.integrityDeclaration) missing.push('integrity section');
  if (!backup.manifest?.backupIdentity?.backupId && !backup.metadata?.backupUuid) {
    missing.push('backup identifier');
  }
  if (!backup.manifest?.backupIdentity?.correlationId && !backup.metadata?.correlationId) {
    missing.push('correlation identifier');
  }
  if (
    !backup.metadata?.workflowVersion &&
    !backup.manifest?.compatibilityDeclaration?.workflowVersion
  ) {
    missing.push('workflow version');
  }
  if (!backup.manifest?.manifestVersion) missing.push('manifest version');

  if (missing.length > 0) {
    return packageReaderResult(
      'missing_required_section',
      `Backup package is missing required section(s): ${missing.join(', ')}.`,
      {
        fileName: path.basename(filePath),
        filePath,
        missing,
      }
    );
  }

  if (
    backup.manifest.backupClass !== BACKUP_COVERAGE_POLICY.backupClass ||
    backup.metadata.workflowVersion !== BACKUP_WORKFLOW_VERSION ||
    backup.manifest.manifestVersion !== BACKUP_MANIFEST_VERSION
  ) {
    return packageReaderResult(
      'unsupported_format',
      'Backup package is not a supported Certified Backup v1 package.',
      summarizePackage(filePath, backup)
    );
  }

  return packageReaderResult(
    'package_readable',
    'Package Inspection Only - Restore is not available.',
    summarizePackage(filePath, backup)
  );
}

async function verifyRestorePackage(filePath) {
  const inspection = await inspectRestorePackage(filePath);
  if (!inspection.ok) {
    return verificationResult('failed', inspection.message, {
      fileName: inspection.fileName,
      filePath: inspection.filePath,
      packageStatus: inspection.status,
      passedChecks: [],
      failedChecks: [check(inspection.status || 'package.readable', false, inspection.message)],
      warnings: [],
    });
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const backup = JSON.parse(raw);
  return validateCertifiedBackup(filePath, backup);
}

async function assessRestoreEligibility(filePath) {
  const verification = await verifyRestorePackage(filePath);
  const summary = verification.summary || {};
  const passedCheckNames = new Set(
    (Array.isArray(verification.passedChecks) ? verification.passedChecks : []).map(
      (item) => item.name
    )
  );
  const conditions = [
    condition(
      'package.read',
      verification.packageStatus !== 'package_unreadable' && verification.verificationStatus,
      'Package read result is available.',
      'Package could not be read.'
    ),
    condition(
      'package.verified',
      verification.verificationStatus === 'passed',
      'Package verification passed.',
      'Package verification did not pass.'
    ),
    condition(
      'manifest.version',
      passedCheckNames.has('manifest.version'),
      'Manifest version is supported.',
      'Manifest version is missing or unsupported.'
    ),
    condition(
      'workflow.version',
      passedCheckNames.has('workflow.version'),
      'Workflow version is supported.',
      'Workflow version is missing or unsupported.'
    ),
    condition(
      'backup.class',
      passedCheckNames.has('backup.class'),
      'Backup class is supported.',
      'Backup class is missing or unsupported.'
    ),
    condition(
      'integrity.hash',
      passedCheckNames.has('integrity.hash'),
      'SHA-256 verification passed.',
      'SHA-256 verification failed.'
    ),
    condition(
      'metadata.complete',
      passedCheckNames.has('metadata.present') &&
        Boolean(summary.createdAt) &&
        Boolean(summary.schemaVersion) &&
        Boolean(summary.applicationVersion),
      'Metadata contains required compatibility information.',
      'Metadata is missing required compatibility information.'
    ),
    condition(
      'required.identifiers',
      passedCheckNames.has('backup.uuid') && passedCheckNames.has('correlation.id'),
      'Required identifiers are present.',
      'Required backup or correlation identifiers are missing.'
    ),
    condition(
      'table.coverage',
      passedCheckNames.has('coverage.included') && passedCheckNames.has('coverage.excluded'),
      'Table coverage declaration is acceptable.',
      'Table coverage declaration is missing or unacceptable.'
    ),
    condition(
      'payload.consistency',
      passedCheckNames.has('payload.present') &&
        passedCheckNames.has('payload.inventory') &&
        passedCheckNames.has('row.counts'),
      'Payload consistency is acceptable.',
      'Payload/table inventory consistency failed.'
    ),
    condition(
      'certification.status',
      passedCheckNames.has('certification.status') &&
        summary.certificationStatus === 'Backup Certified',
      'Backup certification status is acceptable.',
      'Backup certification status is missing or unacceptable.'
    ),
    condition(
      'schema.compatibility',
      Boolean(summary.schemaVersion),
      'Schema compatibility information is present.',
      'Schema compatibility information is missing.'
    ),
    condition(
      'application.compatibility',
      Boolean(summary.applicationVersion),
      'Application version compatibility information is present.',
      'Application version compatibility information is missing.'
    ),
  ];
  const failedConditions = conditions.filter((item) => !item.passed);
  const passedConditions = conditions.filter((item) => item.passed);
  const blockingReasons = failedConditions.map((item) => item.blockingReason);
  const warnings = Array.isArray(verification.warnings) ? verification.warnings : [];
  const eligible = failedConditions.length === 0;
  return eligibilityResult(
    eligible ? 'eligible_for_authorization' : 'blocked',
    eligible
      ? 'Package satisfies eligibility checks but Restore remains unavailable pending authorization and certification.'
      : 'Package is blocked from authorization. Restore remains unavailable.',
    {
      fileName: verification.fileName || summary.fileName,
      filePath: verification.filePath || summary.filePath,
      summary,
      verificationStatus: verification.verificationStatus,
      passedConditions,
      failedConditions,
      blockingReasons,
      warnings,
    }
  );
}

// ─── R2-B: executeRestoreBackup — Repository-Internal Only ──────────────────
// NOT in module.exports. Not reachable from service/controller/preload/API/UI.
// Implements TX-002 (commit boundary), RB-002 (rollback), RUN-002 (row-count
// verification). Will be exposed only after a separate R2-C approval.
// ─────────────────────────────────────────────────────────────────────────────

function buildRestoreDependencyGraph(tableDeclarations) {
  const graph = {};
  for (const tableDecl of tableDeclarations) {
    const name = String(tableDecl.name || '').trim();
    if (!name) continue;
    const deps = Array.isArray(tableDecl.dependencies)
      ? tableDecl.dependencies
      : Array.isArray(tableDecl.dependsOn)
        ? tableDecl.dependsOn
        : Array.isArray(tableDecl.requiredTables)
          ? tableDecl.requiredTables
          : [];
    graph[name] = deps.map((d) => String(d || '').trim()).filter(Boolean);
  }
  return graph;
}

function topologicalSortRestoreTables(tableNames, dependencyGraph) {
  const nameSet = new Set(tableNames);
  const inDegree = Object.fromEntries(tableNames.map((n) => [n, 0]));
  const adjList = Object.fromEntries(tableNames.map((n) => [n, []]));

  for (const name of tableNames) {
    for (const dep of dependencyGraph[name] || []) {
      if (!nameSet.has(dep)) continue;
      if (!adjList[dep]) adjList[dep] = [];
      adjList[dep].push(name);
      inDegree[name] = (inDegree[name] || 0) + 1;
    }
  }

  const queue = tableNames.filter((n) => (inDegree[n] || 0) === 0);
  const sorted = [];
  while (queue.length) {
    const node = queue.shift();
    sorted.push(node);
    for (const next of adjList[node] || []) {
      inDegree[next] -= 1;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  if (sorted.length !== tableNames.length) {
    const inCycle = tableNames.filter((n) => !sorted.includes(n));
    throw Object.assign(new Error('RESTORE_DEPENDENCY_CYCLE'), { inCycle });
  }
  return sorted;
}

async function executeRestoreBackup(filePath, acknowledgementText, userId) {
  // ── Phase A: Pre-transaction safety checks ─────────────────────────────────
  // None of these touch the database. Every failure returns before any write.

  // A1. Acknowledgement guard
  const ack = String(acknowledgementText || '').trim();
  if (ack !== RESTORE_EXECUTION_ACKNOWLEDGEMENT) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'acknowledgement_invalid',
      message:
        'Restore aborted: required execution acknowledgement was not provided. No data was changed.',
    };
  }

  // A2. Read and parse file
  let backup;
  try {
    const raw = await fs.readFile(String(filePath || ''), 'utf8');
    backup = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'package_unreadable',
      message: 'Restore aborted: backup file could not be read or parsed. No data was changed.',
    };
  }

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'package_malformed',
      message: 'Restore aborted: backup file is not a valid JSON object. No data was changed.',
    };
  }

  const manifest = (typeof backup.manifest === 'object' && backup.manifest) || {};
  const backupData =
    (typeof backup.data === 'object' && !Array.isArray(backup.data) && backup.data) || {};

  // A3. Integrity hash verification
  const expectedHash = manifest?.integrityDeclaration?.dataHash;
  if (!expectedHash) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'integrity_missing',
      message:
        'Restore aborted: backup integrity hash declaration is missing. No data was changed.',
    };
  }
  const actualHash = hashValue(backupData);
  if (actualHash !== expectedHash) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'integrity_mismatch',
      message: 'Restore aborted: backup integrity hash does not match. No data was changed.',
    };
  }

  // A4. Certification status
  if (backup?.certification?.status !== 'Backup Certified') {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'not_certified',
      message:
        'Restore aborted: backup does not carry Backup Certified status. No data was changed.',
    };
  }

  // A5. restoreEligible must remain false — hard safety invariant
  if (manifest?.recoveryDeclaration?.restoreEligible !== false) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'restore_eligible_invariant_violated',
      message: 'Restore aborted: restoreEligible safety invariant violated. No data was changed.',
    };
  }

  // A6. includedTables must be declared
  const includedTableDecls = Array.isArray(manifest?.coverageDeclaration?.includedTables)
    ? manifest.coverageDeclaration.includedTables
    : [];
  if (includedTableDecls.length === 0) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'no_tables_declared',
      message: 'Restore aborted: backup manifest declares no included tables. No data was changed.',
    };
  }

  // A7. Validate each table name: must be in whitelist; exclude refresh_tokens silently
  const restorable = [];
  for (const tableDecl of includedTableDecls) {
    const name = String(tableDecl.name || '').trim();
    if (!name) {
      return {
        ok: false,
        restoreExecuted: false,
        abortedBeforeTransaction: true,
        reason: 'table_name_missing',
        message: 'Restore aborted: a table declaration has an empty name. No data was changed.',
      };
    }
    if (EXCLUDED_RESTORE_TABLES.has(name)) continue; // excluded — skip silently, never restore
    if (!BACKUP_TABLE_SET.has(name)) {
      return {
        ok: false,
        restoreExecuted: false,
        abortedBeforeTransaction: true,
        reason: 'unknown_table',
        unknownTable: name,
        message: `Restore aborted: table "${name}" is not in the approved restore whitelist. No data was changed.`,
      };
    }
    restorable.push(tableDecl);
  }

  const restorableNames = restorable.map((t) => String(t.name).trim());

  // A8. All restorable tables must have an array payload in backup.data
  const missingPayloads = restorableNames.filter((n) => !Array.isArray(backupData[n]));
  if (missingPayloads.length) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'payload_missing',
      missingPayloads,
      message: `Restore aborted: backup payload missing for: ${missingPayloads.join(', ')}. No data was changed.`,
    };
  }

  // A9. Dependency graph and topological sort — abort on cycle
  const dependencyGraph = buildRestoreDependencyGraph(restorable);
  const hasDeclaredDeps = Object.values(dependencyGraph).some((deps) => deps.length > 0);
  let insertOrder; // parent-first

  if (hasDeclaredDeps) {
    try {
      insertOrder = topologicalSortRestoreTables(restorableNames, dependencyGraph);
    } catch {
      return {
        ok: false,
        restoreExecuted: false,
        abortedBeforeTransaction: true,
        reason: 'dependency_cycle',
        message:
          'Restore aborted: dependency cycle detected in backup manifest declarations. No data was changed.',
      };
    }
  } else {
    // No explicit deps declared: fall back to BACKUP_COVERAGE_POLICY order (already parent-first)
    const policyOrder = BACKUP_COVERAGE_POLICY.tables.map((t) => t.name);
    insertOrder = policyOrder.filter((n) => restorableNames.includes(n));
    // Safety: append any names not in policy order (certified backups should not have unknown tables)
    for (const n of restorableNames) {
      if (!insertOrder.includes(n)) insertOrder.push(n);
    }
  }

  // deleteOrder = children first (reverse of insertOrder) — FK-safe without any special privileges
  const deleteOrder = [...insertOrder].reverse();

  // ── Phase B: Transaction ───────────────────────────────────────────────────
  // All DB writes are inside a single PostgreSQL transaction.
  // On any throw, withTransaction fires ROLLBACK automatically (TX-002 + RB-002).

  let tablesRestored = 0;
  let rowsRestored = 0;

  try {
    await withTransaction(async (client) => {
      // B1. DELETE existing rows in child-first order (FK-safe, no special privileges)
      for (const tableName of deleteOrder) {
        await client.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
      }

      // B2. INSERT restored rows in parent-first order
      for (const tableName of insertOrder) {
        const rows = backupData[tableName];
        if (!Array.isArray(rows) || rows.length === 0) {
          tablesRestored += 1;
          continue;
        }
        const sampleRow = rows[0];
        const columns = Object.keys(sampleRow);
        if (columns.length === 0) {
          tablesRestored += 1;
          continue;
        }
        // Validate all column names before issuing any INSERT for this table
        for (const col of columns) {
          quoteIdentifier(col); // throws on invalid identifier — caught by withTransaction
        }
        const quotedColumns = columns.map(quoteIdentifier).join(', ');
        for (const row of rows) {
          const values = columns.map((col) => (row[col] !== undefined ? row[col] : null));
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(
            `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders})`,
            values
          );
          rowsRestored += 1;
        }
        tablesRestored += 1;
      }

      // B3. Post-write row-count verification — implements RUN-002 runtime recovery gate
      // If counts do not match, throw → automatic ROLLBACK — DB returns to pre-restore state
      const mismatches = [];
      for (const tableDecl of restorable) {
        const name = String(tableDecl.name).trim();
        const expected = tableDecl.rowCount;
        if (typeof expected !== 'number') continue; // no declared count, skip
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(name)}`
        );
        const actual = countResult.rows[0]?.count ?? null;
        if (actual !== expected) mismatches.push({ table: name, expected, actual });
      }
      if (mismatches.length) {
        throw Object.assign(new Error('ROW_COUNT_MISMATCH'), { mismatches });
      }
    });
  } catch (err) {
    // ROLLBACK has already been issued by withTransaction.
    await createBackupLog({
      fileName: path.basename(String(filePath || '')),
      filePath: String(filePath || ''),
      action: 'RESTORE',
      status: 'FAILED',
      message: `Restore transaction failed and was automatically rolled back. ${err.message || 'Unexpected error.'} No data was changed.`,
      userId: userId || null,
    }).catch(() => {});
    return {
      ok: false,
      restoreExecuted: false,
      rolledBack: true,
      reason: err.message || 'transaction_failed',
      mismatches: err.mismatches || undefined,
      message: 'Restore transaction failed and was fully rolled back. No data was changed.',
    };
  }

  // ── Phase C: Post-transaction audit ────────────────────────────────────────
  const backupId = manifest?.backupIdentity?.backupId || null;
  const log = await createBackupLog({
    fileName: path.basename(String(filePath || '')),
    filePath: String(filePath || ''),
    action: 'RESTORE',
    status: 'SUCCESS',
    message: `Restore completed. ${tablesRestored} table(s), ${rowsRestored} row(s) restored from backup ${backupId || 'unknown'}.`,
    userId: userId || null,
  }).catch(() => null);

  return {
    ok: true,
    restoreExecuted: true,
    rolledBack: false,
    tablesRestored,
    rowsRestored,
    backupId,
    logId: log?.id || null,
    message: `Restore completed. ${tablesRestored} table(s) and ${rowsRestored} row(s) were restored.`,
  };
}
// ─── End R2-B ─────────────────────────────────────────────────────────────────

module.exports = {
  assessRestoreEligibility,
  assessBackupPreflight,
  acquireRestoreOperationLock,
  cancelRestorePreparation,
  createRestoreFinalConfirmation,
  exportBackup,
  getSettings,
  getRestoreExecutionPolicy,
  getRestoreRecoveryState,
  getRestoreRetentionAssessment,
  getRestoreStartupRecoveryAssessment,
  inspectRestorePackage,
  getRestoreDryRunReport,
  getRestoreReadinessDashboardEvidence,
  listRestoreDryRunReports,
  prepareRestoreSafetyBackup,
  recordRestoreRecoveryTransition,
  listBackupLogs,
  saveSettings,
  saveStoreSettings,
  transitionRestoreOperation,
  verifyRestorePackage,
};
