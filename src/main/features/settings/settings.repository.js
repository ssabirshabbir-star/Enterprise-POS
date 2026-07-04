const { constants: fsConstants } = require('fs');
const fs = require('fs/promises');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { getPool, withTransaction } = require('../../database/connection');
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

function createBackupId() {
  return crypto.randomUUID();
}

async function databaseVersion() {
  const result = await getPool().query('SELECT version() AS version');
  return result.rows[0]?.version || 'unknown';
}

async function collectBackupData() {
  const data = {};
  const tableEvidence = [];
  for (const table of BACKUP_COVERAGE_POLICY.tables) {
    const result = await getPool().query(
      `SELECT * FROM ${quoteIdentifier(table.name)} ORDER BY 1 ASC`
    );
    data[table.name] = result.rows;
    tableEvidence.push({
      ...table,
      rowCount: result.rowCount,
    });
  }
  return { data, tableEvidence };
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

async function createMetadata({ backupId, correlationId, createdAt, userId }) {
  return {
    backupUuid: backupId,
    createdAt,
    operator: {
      userId,
    },
    applicationVersion: packageJson.version,
    schemaVersion: SCHEMA_VERSION,
    workflowVersion: BACKUP_WORKFLOW_VERSION,
    databaseVersion: await databaseVersion(),
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

async function exportBackup(filePath, userId) {
  const backupId = createBackupId();
  const correlationId = createBackupId();
  const createdAt = new Date().toISOString();
  const { data, tableEvidence } = await collectBackupData();
  const dataHash = hashValue(data);
  const metadata = await createMetadata({ backupId, correlationId, createdAt, userId });
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

async function createBackupLog({ fileName, filePath, action, status, message, userId }) {
  const result = await getPool().query(
    `
      INSERT INTO backup_logs (file_name, file_path, action, status, message, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [fileName, filePath || null, action, status, message || null, userId || null]
  );
  return result.rows[0];
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
  exportBackup,
  getSettings,
  inspectRestorePackage,
  getRestoreDryRunReport,
  getRestoreReadinessDashboardEvidence,
  listRestoreDryRunReports,
  listBackupLogs,
  saveSettings,
  verifyRestorePackage,
};
