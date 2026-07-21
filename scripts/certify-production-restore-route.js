#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { execFileSync, spawn } = require('child_process');

const { loadEnvironment, getDatabaseConfig } = require('../src/main/config/env');
const { initializeDatabase } = require('../src/main/database/schema');
const { closeDatabase, getPool } = require('../src/main/database/connection');
const authService = require('../src/main/features/auth/auth.service');
const settingsRepository = require('../src/main/features/settings/settings.repository');
const executionService = require('../src/main/features/restore-engine/restore-production-execution.service');
const activationModel = require('../src/main/features/restore-engine/restore-production-activation.model');
const governanceModel = require('../src/main/features/restore-engine/restore-production-governance.model');
const recoveryModel = require('../src/main/features/restore-engine/restore-recovery-state.model');
const maintenanceGuard = require('../src/main/features/restore-engine/restore-maintenance-guard');
const { registerProductRoutes } = require('../src/main/features/products/product.controller');
const { registerInventoryRoutes } = require('../src/main/features/inventory/inventory.controller');
const { registerPurchaseRoutes } = require('../src/main/features/purchases/purchase.controller');
const { registerBillingRoutes } = require('../src/main/features/billing/billing.controller');
const { registerCustomerRoutes } = require('../src/main/features/customers/customers.controller');
const { registerSupplierRoutes } = require('../src/main/features/suppliers/suppliers.controller');
const { registerSettingsRoutes } = require('../src/main/features/settings/settings.controller');
const managedIdentityModel = require('../src/main/installer/managed-database-identity.model');
const packageJson = require('../package.json');

const REQUIRED_FLAG = '--certify-production-restore-route';
const INTERRUPTION_CHILD_FLAG = '--certify-production-restore-interruption-child';
const certificationModeRequested =
  process.argv.includes(REQUIRED_FLAG) || process.argv.includes(INTERRUPTION_CHILD_FLAG);
if (!certificationModeRequested) {
  loadEnvironment();
}

const DB_PREFIX = 'enterprise_pos_managed_restore_cert_';
const OWNER_USER_ID = 1;
const CONFIRMATION_PHRASE = 'RESTORE DATABASE';
function detectSourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'UNKNOWN';
  }
}
const SOURCE_COMMIT = process.env.SOURCE_COMMIT || detectSourceCommit();
const startedAt = new Date();
const runId =
  process.env.PRODUCTION_RESTORE_CERT_RUN_ID ||
  `run-${startedAt
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)}`;
let evidenceRoot =
  process.env.PRODUCTION_RESTORE_CERT_OUTPUT ||
  path.join(process.cwd(), 'test-artifacts', 'production-restore-certification', runId);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    keepDatabase: false,
    output: evidenceRoot,
    child: false,
    checkpoint: null,
    checkpointFile: null,
    backupPath: null,
    recoveryRoot: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === REQUIRED_FLAG) args.certify = true;
    else if (item === INTERRUPTION_CHILD_FLAG) args.child = true;
    else if (item === '--keep-database') args.keepDatabase = true;
    else if (item === '--output') args.output = path.resolve(argv[++index]);
    else if (item === '--checkpoint') args.checkpoint = argv[++index];
    else if (item === '--checkpoint-file') args.checkpointFile = path.resolve(argv[++index]);
    else if (item === '--backup') args.backupPath = path.resolve(argv[++index]);
    else if (item === '--recovery-root') args.recoveryRoot = path.resolve(argv[++index]);
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function usage() {
  return [
    `Usage: node scripts/certify-production-restore-route.js ${REQUIRED_FLAG} [--output <dir>] [--keep-database]`,
    '',
    'Executes the DB-backed production Restore route against a disposable, installer-managed-equivalent PostgreSQL target.',
    'The production Restore feature flag and committed activation record are not modified.',
  ].join('\n');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
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

async function fileSha256(filePath) {
  return sha256(await fs.readFile(filePath));
}

function redactPath(filePath) {
  if (!filePath) return null;
  const value = String(filePath);
  const root = path.resolve(process.cwd());
  return value.startsWith(root) ? path.relative(root, value) : value.replace(/\\/g, '/');
}

function redactedDatabaseConfig(databaseName) {
  const config = getDatabaseConfig();
  let host = config.host || 'localhost';
  let port = Number(config.port || 5432);
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    host = url.hostname || host;
    port = Number(url.port || port || 5432);
  }
  return {
    host: String(host).toLowerCase(),
    port,
    database: databaseName,
    credentialsPresent: Boolean(config.user || config.password || config.connectionString),
    connectionStringRedacted: Boolean(config.connectionString),
  };
}

async function writeEvidence(fileName, payload) {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const body = {
    schemaVersion: 1,
    sourceCommit: SOURCE_COMMIT,
    runId,
    startedAt: payload.startedAt || startedAt.toISOString(),
    finishedAt: payload.finishedAt || new Date().toISOString(),
    ...payload,
  };
  const filePath = path.join(evidenceRoot, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`);
  return filePath;
}

function uniqueDbName(label) {
  return `${DB_PREFIX}${String(label)
    .replace(/[^a-z0-9_]/gi, '_')
    .toLowerCase()}_${Date.now()
    .toString(36)
    .slice(-8)}_${crypto.randomBytes(4).toString('hex')}`.toLowerCase();
}

function assertCertificationDatabaseName(databaseName) {
  if (!new RegExp(`^${DB_PREFIX}[a-z0-9_]+$`).test(String(databaseName || ''))) {
    throw new Error('Unsafe certification database name.');
  }
  return databaseName;
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(identifier || ''))) {
    throw new Error('Invalid SQL identifier.');
  }
  return `"${identifier}"`;
}

function configForDatabase(databaseName, options = {}) {
  const config = getDatabaseConfig();
  const bounded = {
    connectionTimeoutMillis: Number(options.connectionTimeoutMillis || 5000),
    idleTimeoutMillis: 1000,
    query_timeout: Number(options.queryTimeoutMillis || 45000),
    statement_timeout: Number(options.queryTimeoutMillis || 45000),
  };
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    url.pathname = `/${databaseName}`;
    return { ...config, ...bounded, connectionString: url.toString() };
  }
  return { ...config, ...bounded, database: databaseName };
}

async function withAdminPool(callback) {
  const pool = new Pool(configForDatabase('postgres', { queryTimeoutMillis: 60000 }));
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function createDatabase(databaseName) {
  assertCertificationDatabaseName(databaseName);
  await withAdminPool(async (pool) => {
    await pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });
}

async function dropDatabase(databaseName) {
  if (!databaseName) return { ok: true, skipped: true };
  assertCertificationDatabaseName(databaseName);
  return withAdminPool(async (pool) => {
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
    return { ok: true, databaseDropped: true };
  });
}

async function withTargetEnvironment(databaseName, identity, callback) {
  const previous = {
    PGDATABASE: process.env.PGDATABASE,
    DATABASE_URL: process.env.DATABASE_URL,
    ENTERPRISE_POS_INSTALLATION_ID: process.env.ENTERPRISE_POS_INSTALLATION_ID,
    ENTERPRISE_POS_MANAGED_CLUSTER_ID: process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID,
    ENTERPRISE_POS_MANAGED_DATABASE_ID: process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID,
    ENTERPRISE_POS_MANAGED_IDENTITY_FINGERPRINT:
      process.env.ENTERPRISE_POS_MANAGED_IDENTITY_FINGERPRINT,
  };
  await closeDatabase();
  process.env.PGDATABASE = databaseName;
  if (previous.DATABASE_URL) {
    const url = new URL(previous.DATABASE_URL);
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.toString();
  }
  process.env.ENTERPRISE_POS_INSTALLATION_ID = identity.installationId;
  process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID = identity.clusterId;
  process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID = identity.databaseId;
  process.env.ENTERPRISE_POS_MANAGED_IDENTITY_FINGERPRINT = identity.fingerprint;
  try {
    return await callback();
  } finally {
    await closeDatabase();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createManagedIdentity(databaseName) {
  const identity = managedIdentityModel.normalizeIdentity({
    installationId: crypto.randomUUID(),
    clusterId: crypto.randomUUID(),
    databaseId: crypto.randomUUID(),
    databaseName,
    source: 'production-restore-certification-managed-equivalent',
  });
  return {
    ...identity,
    fingerprint: managedIdentityModel.identityDigest(identity),
  };
}

async function insertBaselineDataset(marker, passwords) {
  const pool = getPool();
  const adminHash = await bcrypt.hash(passwords.admin, 12);
  const userHash = await bcrypt.hash(passwords.user, 12);
  const inactiveHash = await bcrypt.hash(passwords.inactive, 12);
  const lockedHash = await bcrypt.hash(passwords.locked, 12);

  const roles = await pool.query('SELECT id, name FROM roles WHERE name = ANY($1)', [
    ['Admin', 'Cashier', 'Manager'],
  ]);
  const roleId = Object.fromEntries(roles.rows.map((row) => [row.name, row.id]));
  assert(roleId.Admin, 'Admin role missing');
  assert(roleId.Cashier || roleId.Manager, 'Non-admin role missing');

  await pool.query(
    `
      INSERT INTO users (id, username, email, full_name, password_hash, role_id, is_active, locked_until)
      VALUES
        (1, $1, $2, $3, $4, $5, TRUE, NULL),
        (2, $6, $7, $8, $9, $10, TRUE, NULL),
        (3, $11, $12, $13, $14, $10, FALSE, NULL),
        (4, $15, $16, $17, $18, $10, TRUE, NOW() + interval '2 hours')
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        is_active = EXCLUDED.is_active,
        locked_until = EXCLUDED.locked_until
    `,
    [
      `admin_${marker}`,
      `admin_${marker}@example.invalid`,
      'Certification Administrator',
      adminHash,
      roleId.Admin,
      `cashier_${marker}`,
      `cashier_${marker}@example.invalid`,
      'Certification Cashier',
      userHash,
      roleId.Cashier || roleId.Manager,
      `inactive_${marker}`,
      `inactive_${marker}@example.invalid`,
      'Inactive Certification User',
      inactiveHash,
      `locked_${marker}`,
      `locked_${marker}@example.invalid`,
      'Locked Certification User',
      lockedHash,
    ]
  );
  await pool.query("SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1))");

  const category = await pool.query(
    `INSERT INTO categories (name, description, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
    [`CERT_CAT_${marker}`, 'Production Restore certification category']
  );
  const unit = await pool.query(
    `INSERT INTO units (name, short_name, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
    [`CERT_UNIT_${marker}`, 'crt']
  );
  const product = await pool.query(
    `
      INSERT INTO products (
        name, sku, barcode, category_id, unit_id, purchase_price, sale_price,
        wholesale_price, min_stock_level, current_stock, is_active
      )
      VALUES ($1, $2, $3, $4, $5, 10.00, 15.00, 12.00, 2.000, 25.000, TRUE)
      RETURNING id
    `,
    [
      `CERT_PRODUCT_${marker}`,
      `SKU_${marker}`,
      `BAR_${marker}`,
      category.rows[0].id,
      unit.rows[0].id,
    ]
  );
  const warehouse = await pool.query(
    `SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL ORDER BY id LIMIT 1`
  );
  await pool.query(
    `
      INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
      VALUES ($1, $2, 25.000, 2.000)
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level
    `,
    [product.rows[0].id, warehouse.rows[0].id]
  );
  const supplier = await pool.query(
    `INSERT INTO suppliers (name, phone, email, address, opening_balance, current_balance, is_active)
     VALUES ($1, '555-0100', $2, 'Certification Lane', 0, 0, TRUE) RETURNING id`,
    [`CERT_SUPPLIER_${marker}`, `supplier_${marker}@example.invalid`]
  );
  const customer = await pool.query(
    `INSERT INTO customers (name, phone, email, address, opening_balance, credit_limit, current_balance, is_active)
     VALUES ($1, '555-0200', $2, 'Certification Avenue', 0, 1000, 0, TRUE) RETURNING id`,
    [`CERT_CUSTOMER_${marker}`, `customer_${marker}@example.invalid`]
  );
  const purchase = await pool.query(
    `
      INSERT INTO purchases (
        supplier_id, invoice_number, purchase_date, subtotal, grand_total,
        paid_amount, due_amount, status, created_by
      )
      VALUES ($1, $2, CURRENT_DATE, 100.00, 100.00, 100.00, 0.00, 'RECEIVED', 1)
      RETURNING id
    `,
    [supplier.rows[0].id, `PUR_${marker}`]
  );
  await pool.query(
    `
      INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_price, sale_price, total)
      VALUES ($1, $2, 10.000, 10.00, 15.00, 100.00)
    `,
    [purchase.rows[0].id, product.rows[0].id]
  );
  const sale = await pool.query(
    `
      INSERT INTO sales (
        invoice_number, customer_id, cashier_id, subtotal, grand_total,
        paid_amount, change_amount, payment_method, status
      )
      VALUES ($1, $2, 2, 15.00, 15.00, 15.00, 0.00, 'CASH', 'COMPLETED')
      RETURNING id
    `,
    [`SALE_${marker}`, customer.rows[0].id]
  );
  await pool.query(
    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
     VALUES ($1, $2, 1.000, 15.00, 15.00)`,
    [sale.rows[0].id, product.rows[0].id]
  );
  await pool.query(
    `
      INSERT INTO app_settings (key, value, updated_by)
      VALUES ($1, $2::jsonb, 1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by
    `,
    [
      `certification_marker_${marker}`,
      JSON.stringify({
        marker,
        stage: 'baseline',
        value: 'backup-time-setting',
      }),
    ]
  );

  return {
    users: {
      admin: `admin_${marker}`,
      nonAdmin: `cashier_${marker}`,
      inactive: `inactive_${marker}`,
      locked: `locked_${marker}`,
    },
    productId: product.rows[0].id,
    supplierId: supplier.rows[0].id,
    customerId: customer.rows[0].id,
    purchaseId: purchase.rows[0].id,
    saleId: sale.rows[0].id,
    markerKey: `certification_marker_${marker}`,
  };
}

async function mutateAfterBackup(marker, baseline) {
  const pool = getPool();
  await pool.query('UPDATE products SET current_stock = 7.000, sale_price = 99.00 WHERE id = $1', [
    baseline.productId,
  ]);
  await pool.query('UPDATE inventory SET current_stock = 7.000 WHERE product_id = $1', [
    baseline.productId,
  ]);
  await pool.query('UPDATE app_settings SET value = $2::jsonb, updated_by = 1 WHERE key = $1', [
    baseline.markerKey,
    JSON.stringify({ marker, stage: 'post-backup', value: 'mutated-setting' }),
  ]);
  await pool.query(`INSERT INTO categories (name, description, is_active) VALUES ($1, $2, TRUE)`, [
    `CERT_POST_BACKUP_${marker}`,
    'This row must disappear after restore',
  ]);
  await pool.query('UPDATE suppliers SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [
    baseline.supplierId,
  ]);
}

async function fingerprintDataset(marker, baseline) {
  const pool = getPool();
  const queries = {
    users: {
      sql: `SELECT username, is_active, locked_until IS NOT NULL AS locked FROM users WHERE username LIKE $1 ORDER BY username`,
      params: [`%_${marker}`],
    },
    products: {
      sql: `SELECT id, name, sku, current_stock::text, sale_price::text, is_active FROM products WHERE sku = $1 OR name LIKE $2 ORDER BY id`,
      params: [`SKU_${marker}`, `%${marker}%`],
    },
    inventory: {
      sql: `SELECT product_id, current_stock::text FROM inventory WHERE product_id = $1 ORDER BY product_id`,
      params: [baseline.productId],
    },
    suppliers: {
      sql: `SELECT id, name, is_active, deleted_at IS NOT NULL AS deleted FROM suppliers WHERE name LIKE $1 ORDER BY id`,
      params: [`%${marker}%`],
    },
    customers: {
      sql: `SELECT id, name, is_active FROM customers WHERE name LIKE $1 ORDER BY id`,
      params: [`%${marker}%`],
    },
    purchases: {
      sql: `SELECT invoice_number, grand_total::text, status FROM purchases WHERE invoice_number = $1 ORDER BY id`,
      params: [`PUR_${marker}`],
    },
    sales: {
      sql: `SELECT invoice_number, grand_total::text, status FROM sales WHERE invoice_number = $1 ORDER BY id`,
      params: [`SALE_${marker}`],
    },
    settings: {
      sql: `SELECT key, value FROM app_settings WHERE key = $1`,
      params: [baseline.markerKey],
    },
    postBackupRows: {
      sql: `SELECT COUNT(*)::int AS count FROM categories WHERE name = $1`,
      params: [`CERT_POST_BACKUP_${marker}`],
    },
  };
  const result = {};
  for (const [key, query] of Object.entries(queries)) {
    result[key] = (await pool.query(query.sql, query.params)).rows;
  }
  return {
    summary: result,
    fingerprint: sha256(stableStringify(result)),
  };
}

async function recordDryRunEvidence(operationId, source) {
  await getPool().query(
    `
      INSERT INTO activity_logs (user_id, action, status, message, metadata)
      VALUES ($1, 'backup.restore.dry_run_certification_report', 'success', $2, $3::jsonb)
    `,
    [
      OWNER_USER_ID,
      'Production-route Restore dry-run evidence recorded for DB-backed certification.',
      JSON.stringify({
        reportCorrelationId: `production-route:${operationId}`,
        certificationStatus: 'dry_run_certification_passed',
        packageSummary: {
          backupId: source.summary?.backupId || source.backup?.manifest?.backupIdentity?.backupId,
          manifestVersion: source.summary?.manifestVersion || '1.0',
        },
        noRestoreExecuted: true,
        restoreEligible: false,
      }),
    ]
  );
}

function createActivationRecord(evidenceSeed) {
  const technicalCertification = Object.fromEntries(
    activationModel.REQUIRED_CERTIFICATION_EVIDENCE.map((key) => [
      key,
      {
        status: 'passed',
        evidenceReference: `test-artifacts/production-restore-certification/${runId}/${key}.json`,
        evidenceHash: sha256(`${evidenceSeed}:${key}`),
      },
    ])
  );
  return {
    schemaVersion: activationModel.RESTORE_ACTIVATION_SCHEMA_VERSION,
    product: activationModel.RESTORE_PRODUCT,
    component: activationModel.RESTORE_COMPONENT,
    releaseScope: activationModel.RESTORE_ACTIVATION_SCOPE,
    applicationVersion: packageJson.version,
    databaseSchemaVersion: null,
    backupFormatVersion: activationModel.REQUIRED_BACKUP_FORMAT_VERSION,
    activationStatus: 'approved',
    restoreStrategy: 'transactional_in_place_with_verified_safety_backup',
    safetyBackupPolicy: activationModel.REQUIRED_SAFETY_BACKUP_POLICY,
    technicalCertification,
    authorization: {
      governanceReviewStatus: 'approved',
      securityReviewStatus: 'approved',
      releaseApprovalStatus: 'approved',
      approverIdentity: 'CERTIFICATION_ROUTE_IN_MEMORY_ONLY',
      approvalAuthority: 'Enterprise POS certification harness',
      approvalTimestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revoked: false,
      testOnly: false,
    },
  };
}

async function prepareConfirmation(sourcePackagePath, recoveryRoot) {
  const safety = await settingsRepository.prepareRestoreSafetyBackup({
    sourcePackagePath,
    ownerUserId: OWNER_USER_ID,
    recoveryRoot,
  });
  assert.equal(safety.ok, true, safety.message || JSON.stringify(safety));
  const source = await settingsRepository.verifyRestorePackage(sourcePackagePath);
  await recordDryRunEvidence(safety.operationId, source);
  const confirmation = await settingsRepository.createRestoreFinalConfirmation({
    operationId: safety.operationId,
    ownerUserId: OWNER_USER_ID,
    typedPhrase: CONFIRMATION_PHRASE,
    targetDatabaseReference: governanceModel.resolveDatabaseIdentity(),
    preflightDigest: sha256(`preflight:${safety.operationId}:${runId}`),
    executionPolicyDigest: sha256(`policy:${safety.operationId}:${runId}`),
  });
  assert.equal(confirmation.ok, true, confirmation.message || JSON.stringify(confirmation));
  return { safety, confirmation };
}

async function cancelActiveRestoreOperation(reason = 'certification_negative_case_cleanup') {
  const state = await settingsRepository.getRestoreRecoveryState().catch(() => null);
  if (!state?.operationId) return { ok: true, skipped: true };
  const cancellable = new Set([
    recoveryModel.RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
    recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
  ]);
  if (!cancellable.has(state.currentState)) {
    return { ok: true, skipped: true, currentState: state.currentState };
  }
  const result = await settingsRepository.transitionRestoreOperation({
    operationId: state.operationId,
    requestedByUserId: state.ownerUserId || OWNER_USER_ID,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED,
    failureCategory: reason,
    failureSummary: reason,
  });
  return { ok: result.ok === true, currentState: state.currentState, result };
}

async function executeProductionRoute({
  sourcePackagePath,
  operationId,
  confirmationId,
  injectFailureStage = null,
  checkpointAdapter = null,
}) {
  return executionService.executeProductionRestore(
    {
      sourcePackagePath,
      operationId,
      confirmationId,
      preflightDigest: sha256(`preflight:${operationId}:${runId}`),
      executionPolicyDigest: sha256(`policy:${operationId}:${runId}`),
    },
    {
      productionFeatureFlagEnabled: true,
      readActivationRecord: async () => createActivationRecord(operationId),
      injectFailureStage,
      checkpointAdapter,
    }
  );
}

async function runInterruptionChild(args) {
  if (!args.checkpoint || !args.checkpointFile || !args.backupPath || !args.recoveryRoot) {
    throw new Error(
      'Interruption child requires checkpoint, checkpoint-file, backup, and recovery-root.'
    );
  }
  const prepared = await prepareConfirmation(args.backupPath, args.recoveryRoot);
  const checkpointAdapter = {
    async reach(name, metadata = {}) {
      if (name !== args.checkpoint) return;
      await fs.mkdir(path.dirname(args.checkpointFile), { recursive: true });
      await fs.writeFile(
        args.checkpointFile,
        `${JSON.stringify(
          {
            checkpoint: name,
            operationId: prepared.safety.operationId,
            pid: process.pid,
            reachedAt: new Date().toISOString(),
            metadata,
          },
          null,
          2
        )}\n`
      );
      await new Promise(() => {});
    },
  };
  await executeProductionRoute({
    sourcePackagePath: args.backupPath,
    operationId: prepared.safety.operationId,
    confirmationId: prepared.confirmation.confirmation.confirmationId,
    injectFailureStage:
      args.checkpoint === 'during_rollback_before_apply' ? 'post_verification' : null,
    checkpointAdapter,
  });
  throw new Error(`Interruption child exited before checkpoint ${args.checkpoint}.`);
}

async function waitForJsonFile(filePath, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for checkpoint file: ${filePath}`);
}

function spawnInterruptionChild({ checkpoint, checkpointFile, backupPath, recoveryRoot }) {
  return spawn(
    process.execPath,
    [
      __filename,
      INTERRUPTION_CHILD_FLAG,
      '--checkpoint',
      checkpoint,
      '--checkpoint-file',
      checkpointFile,
      '--backup',
      backupPath,
      '--recovery-root',
      recoveryRoot,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

async function authenticateUsers(baseline, passwords) {
  const admin = await authService.login({
    username: baseline.users.admin,
    password: passwords.admin,
  });
  const nonAdmin = await authService.login({
    username: baseline.users.nonAdmin,
    password: passwords.user,
  });
  const inactive = await authService.login({
    username: baseline.users.inactive,
    password: passwords.inactive,
  });
  const locked = await authService.login({
    username: baseline.users.locked,
    password: passwords.locked,
  });
  const wrong = await authService.login({
    username: baseline.users.admin,
    password: 'wrong-password',
  });
  return {
    admin: {
      username: baseline.users.admin,
      ok: admin.ok === true,
      role: admin.profile?.role || null,
    },
    nonAdmin: {
      username: baseline.users.nonAdmin,
      ok: nonAdmin.ok === true,
      role: nonAdmin.profile?.role || null,
    },
    inactive: {
      username: baseline.users.inactive,
      ok: inactive.ok === true,
      expectedRejected: inactive.ok !== true,
    },
    locked: {
      username: baseline.users.locked,
      ok: locked.ok === true,
      expectedRejected: locked.ok !== true,
    },
    wrongPassword: {
      username: baseline.users.admin,
      ok: wrong.ok === true,
      expectedRejected: wrong.ok !== true,
    },
  };
}

async function countUsers() {
  const row = (
    await getPool().query('SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE')
  ).rows[0];
  return Number(row?.count || 0);
}

async function restoreOperationById(operationId) {
  const result = await getPool().query(
    `
      SELECT operation_id, state, previous_state, terminal_at, final_confirmation_consumed_at,
             requires_rollback, requires_restart, failure_category, sanitized_failure_summary,
             target_database_fingerprint, target_database_name, target_database_host,
             target_database_port, target_database_disposable, target_database_ambiguous
      FROM restore_operations
      WHERE operation_id = $1
      LIMIT 1
    `,
    [operationId]
  );
  return result.rows[0] || null;
}

async function scenarioSuccessfulRestore(context) {
  const {
    marker,
    backupPath,
    recoveryRoot,
    baseline,
    baselineFingerprint,
    postMutationFingerprint,
    passwords,
  } = context;
  const prepared = await prepareConfirmation(backupPath, recoveryRoot);
  const result = await executeProductionRoute({
    sourcePackagePath: backupPath,
    operationId: prepared.safety.operationId,
    confirmationId: prepared.confirmation.confirmation.confirmationId,
  });
  const restoredFingerprint = await fingerprintDataset(marker, baseline);
  const identityValidation = await settingsRepository.validateManagedDatabaseIdentity(
    context.localIdentity
  );
  const confirmationReplay = await executeProductionRoute({
    sourcePackagePath: backupPath,
    operationId: prepared.safety.operationId,
    confirmationId: prepared.confirmation.confirmation.confirmationId,
  });
  const auth = await authenticateUsers(baseline, passwords);
  const firstRunSuppressed = (await countUsers()) > 0;
  const operationRow = await restoreOperationById(prepared.safety.operationId);
  await getPool().query(
    `INSERT INTO categories (name, description, is_active) VALUES ($1, $2, TRUE)`,
    [`CERT_POST_RESTORE_WRITE_${marker}`, 'write-after-restore-proof']
  );
  const postRestoreWrite = (
    await getPool().query('SELECT COUNT(*)::int AS count FROM categories WHERE name = $1', [
      `CERT_POST_RESTORE_WRITE_${marker}`,
    ])
  ).rows[0].count;
  const recoveryState = await settingsRepository.getRestoreRecoveryState();
  const evidence = {
    scenarioName: 'successful_production_restore',
    status:
      result.ok &&
      restoredFingerprint.fingerprint === baselineFingerprint.fingerprint &&
      restoredFingerprint.fingerprint !== postMutationFingerprint.fingerprint &&
      identityValidation.ok &&
      confirmationReplay.ok === false &&
      auth.admin.ok &&
      auth.nonAdmin.ok &&
      auth.inactive.expectedRejected &&
      auth.locked.expectedRejected &&
      auth.wrongPassword.expectedRejected &&
      firstRunSuppressed &&
      Number(postRestoreWrite) === 1 &&
      operationRow?.state === recoveryModel.RESTORE_RECOVERY_STATES.COMPLETED
        ? 'passed'
        : 'failed',
    expectedResult:
      'Production route restores backup-time data, consumes confirmation, preserves destination identity, and leaves users usable.',
    actualResult: {
      routeResult: result,
      baselineFingerprint: baselineFingerprint.fingerprint,
      postMutationFingerprint: postMutationFingerprint.fingerprint,
      restoredFingerprint: restoredFingerprint.fingerprint,
      identityValidation: {
        ok: identityValidation.ok,
        code: identityValidation.code,
        identity: identityValidation.identity || identityValidation.databaseIdentity || null,
      },
      confirmationReplay: {
        ok: confirmationReplay.ok,
        code: confirmationReplay.code,
        blockerCodes: confirmationReplay.blockerCodes || [],
      },
      authentication: auth,
      firstRunSuppressed,
      postRestoreWriteSucceeded: Number(postRestoreWrite) === 1,
      recoveryState: {
        currentState: recoveryState.currentState,
        unresolvedRecoveryState: recoveryState.unresolvedRecoveryState,
      },
      operationState: operationRow,
    },
  };
  await writeEvidence('successful-restore-result.json', evidence);
  return evidence;
}

async function scenarioSafetyBackupFailure(context) {
  const invalidRoot = path.join(context.runRoot, 'not-a-directory');
  await fs.writeFile(invalidRoot, 'blocking file');
  const before = await fingerprintDataset(context.marker, context.baseline);
  const result = await settingsRepository.prepareRestoreSafetyBackup({
    sourcePackagePath: context.backupPath,
    ownerUserId: OWNER_USER_ID,
    recoveryRoot: invalidRoot,
  });
  const after = await fingerprintDataset(context.marker, context.baseline);
  const cleanup = await cancelActiveRestoreOperation('safety_backup_failure_certification_cleanup');
  const evidence = {
    scenarioName: 'safety_backup_failure',
    status: result.ok === false && before.fingerprint === after.fingerprint ? 'passed' : 'failed',
    expectedResult:
      'Safety backup failure blocks before destructive mutation and leaves data unchanged.',
    actualResult: {
      ok: result.ok,
      preparationStarted: result.preparationStarted,
      message: result.message,
      dataUnchanged: before.fingerprint === after.fingerprint,
      operationCleanup: cleanup,
      fingerprintBefore: before.fingerprint,
      fingerprintAfter: after.fingerprint,
    },
  };
  await writeEvidence('safety-backup-failure-result.json', evidence);
  return evidence;
}

async function scenarioIdentityRejections(context) {
  const cases = [
    { name: 'missing_local_identity', local: { ...context.localIdentity, installationId: '' } },
    {
      name: 'installation_id_mismatch',
      local: { ...context.localIdentity, installationId: crypto.randomUUID() },
    },
    {
      name: 'cluster_id_mismatch',
      local: { ...context.localIdentity, clusterId: crypto.randomUUID() },
    },
    {
      name: 'database_id_mismatch',
      local: { ...context.localIdentity, databaseId: crypto.randomUUID() },
    },
    {
      name: 'database_name_mismatch',
      local: { ...context.localIdentity, databaseName: `${context.databaseName}_copy` },
    },
  ];
  const before = await fingerprintDataset(context.marker, context.baseline);
  const results = [];
  for (const testCase of cases) {
    const previous = {
      ENTERPRISE_POS_INSTALLATION_ID: process.env.ENTERPRISE_POS_INSTALLATION_ID,
      ENTERPRISE_POS_MANAGED_CLUSTER_ID: process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID,
      ENTERPRISE_POS_MANAGED_DATABASE_ID: process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID,
      PGDATABASE: process.env.PGDATABASE,
    };
    process.env.ENTERPRISE_POS_INSTALLATION_ID = testCase.local.installationId || '';
    process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID = testCase.local.clusterId || '';
    process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID = testCase.local.databaseId || '';
    process.env.PGDATABASE = testCase.local.databaseName || context.databaseName;
    const prepared = await prepareConfirmation(context.backupPath, context.recoveryRoot);
    const result = await executeProductionRoute({
      sourcePackagePath: context.backupPath,
      operationId: prepared.safety.operationId,
      confirmationId: prepared.confirmation.confirmation.confirmationId,
    });
    const cleanup = await cancelActiveRestoreOperation(`identity_rejection_${testCase.name}`);
    process.env.ENTERPRISE_POS_INSTALLATION_ID = previous.ENTERPRISE_POS_INSTALLATION_ID;
    process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID = previous.ENTERPRISE_POS_MANAGED_CLUSTER_ID;
    process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID = previous.ENTERPRISE_POS_MANAGED_DATABASE_ID;
    process.env.PGDATABASE = previous.PGDATABASE;
    results.push({
      name: testCase.name,
      rejected: result.ok === false,
      code: result.code,
      blockerCodes: result.blockerCodes || [],
      operationCleanup: cleanup,
      engineNotInvoked: (result.steps || []).some(
        (step) => step.name === 'restore_engine_invocation' && step.status === 'not_started'
      ),
    });
  }
  const after = await fingerprintDataset(context.marker, context.baseline);
  const evidence = {
    scenarioName: 'target_identity_rejection_matrix',
    status:
      results.every((item) => item.rejected && item.engineNotInvoked) &&
      before.fingerprint === after.fingerprint
        ? 'passed'
        : 'failed',
    expectedResult:
      'Identity mismatch cases reject before production engine invocation and preserve data.',
    actualResult: {
      results,
      dataUnchanged: before.fingerprint === after.fingerprint,
    },
  };
  await writeEvidence('identity-rejection-matrix.json', evidence);
  return evidence;
}

async function scenarioIntegrityRejections(context) {
  const privateRoot = path.join(context.runRoot, 'private-backups');
  await fs.mkdir(privateRoot, { recursive: true });
  const corruptPath = path.join(privateRoot, 'corrupt-backup.json');
  const missingManifestPath = path.join(privateRoot, 'missing-manifest-backup.json');
  const invalidManifestPath = path.join(privateRoot, 'invalid-manifest-backup.json');
  const raw = await fs.readFile(context.backupPath, 'utf8');
  const parsed = JSON.parse(raw);
  await fs.writeFile(corruptPath, raw.replace(/CERT_PRODUCT_/, 'CORRUPTED_PRODUCT_'));
  const missing = { ...parsed };
  delete missing.manifest;
  await fs.writeFile(missingManifestPath, JSON.stringify(missing, null, 2));
  const invalid = { ...parsed, manifest: { ...parsed.manifest, manifestVersion: '999.0' } };
  await fs.writeFile(invalidManifestPath, JSON.stringify(invalid, null, 2));
  const cases = [
    { name: 'missing_backup_file', filePath: path.join(privateRoot, 'missing-backup.json') },
    { name: 'missing_manifest', filePath: missingManifestPath },
    { name: 'invalid_manifest_version', filePath: invalidManifestPath },
    { name: 'sha256_payload_mismatch', filePath: corruptPath },
  ];
  const before = await fingerprintDataset(context.marker, context.baseline);
  const results = [];
  for (const testCase of cases) {
    const result = await executionService.executeProductionRestore(
      {
        sourcePackagePath: testCase.filePath,
        operationId: crypto.randomUUID(),
        confirmationId: crypto.randomUUID(),
      },
      {
        productionFeatureFlagEnabled: true,
        readActivationRecord: async () => createActivationRecord(testCase.name),
      }
    );
    results.push({
      name: testCase.name,
      rejected: result.ok === false,
      code: result.code,
      blockerCodes: result.blockerCodes || [],
      engineNotInvoked: (result.steps || []).some(
        (step) => step.name === 'restore_engine_invocation' && step.status === 'not_started'
      ),
    });
  }
  const after = await fingerprintDataset(context.marker, context.baseline);
  const evidence = {
    scenarioName: 'backup_integrity_rejection_matrix',
    status:
      results.every((item) => item.rejected && item.engineNotInvoked) &&
      before.fingerprint === after.fingerprint
        ? 'passed'
        : 'failed',
    expectedResult: 'Invalid or unverifiable backup packages reject before mutation.',
    actualResult: { results, dataUnchanged: before.fingerprint === after.fingerprint },
  };
  await writeEvidence('integrity-rejection-matrix.json', evidence);
  return evidence;
}

async function scenarioConfirmationMatrix(context) {
  const before = await fingerprintDataset(context.marker, context.baseline);
  const valid = await prepareConfirmation(context.backupPath, context.recoveryRoot);
  const missing = await executeProductionRoute({
    sourcePackagePath: context.backupPath,
    operationId: valid.safety.operationId,
    confirmationId: crypto.randomUUID(),
  });
  const wrongUserValidation = await settingsRepository.createRestoreFinalConfirmation({
    operationId: valid.safety.operationId,
    ownerUserId: 2,
    typedPhrase: CONFIRMATION_PHRASE,
    targetDatabaseReference: governanceModel.resolveDatabaseIdentity(),
  });
  const consumed = await settingsRepository.consumeRestoreFinalConfirmation({
    operationId: valid.safety.operationId,
    confirmationId: valid.confirmation.confirmation.confirmationId,
    ownerUserId: OWNER_USER_ID,
    targetDatabaseReference: governanceModel.resolveDatabaseIdentity(),
  });
  const replay = await settingsRepository.consumeRestoreFinalConfirmation({
    operationId: valid.safety.operationId,
    confirmationId: valid.confirmation.confirmation.confirmationId,
    ownerUserId: OWNER_USER_ID,
    targetDatabaseReference: governanceModel.resolveDatabaseIdentity(),
  });
  const cleanup = await cancelActiveRestoreOperation('confirmation_replay_certification_cleanup');
  const after = await fingerprintDataset(context.marker, context.baseline);
  const evidence = {
    scenarioName: 'confirmation_and_replay_matrix',
    status:
      missing.ok === false &&
      wrongUserValidation.ok === false &&
      consumed.ok === true &&
      replay.ok === false &&
      before.fingerprint === after.fingerprint
        ? 'passed'
        : 'failed',
    expectedResult:
      'Confirmation rejects missing/wrong-user/replay cases and valid confirmation consumes once.',
    actualResult: {
      missingConfirmation: {
        ok: missing.ok,
        code: missing.code,
        blockerCodes: missing.blockerCodes || [],
      },
      wrongAdministrator: { ok: wrongUserValidation.ok, code: wrongUserValidation.code },
      validConsumed: { ok: consumed.ok, code: consumed.code },
      replay: { ok: replay.ok, code: replay.code },
      operationCleanup: cleanup,
      dataUnchanged: before.fingerprint === after.fingerprint,
    },
  };
  await writeEvidence('confirmation-replay-matrix.json', evidence);
  return evidence;
}

async function scenarioMutationLock(context) {
  const prepared = await prepareConfirmation(context.backupPath, context.recoveryRoot);
  await settingsRepository.transitionRestoreOperation({
    operationId: prepared.safety.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
  });
  const policy = await settingsRepository.getRestoreExecutionPolicy();
  const before = await fingerprintDataset(context.marker, context.baseline);
  const handlers = new Map();
  const ipcMain = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  const guardedIpc = maintenanceGuard.createGuardedIpcMain(ipcMain, {
    getMaintenanceStatus: () => settingsRepository.getRestoreStartupRecoveryAssessment(),
  });
  registerProductRoutes(guardedIpc);
  registerInventoryRoutes(guardedIpc);
  registerPurchaseRoutes(guardedIpc);
  registerBillingRoutes(guardedIpc);
  registerCustomerRoutes(guardedIpc);
  registerSupplierRoutes(guardedIpc);
  registerSettingsRoutes(guardedIpc);
  const invoke = async (channel, payload) => {
    const handler = handlers.get(channel);
    if (!handler) return { channel, registered: false, ok: false };
    const result = await handler({ sender: null }, payload);
    return {
      channel,
      registered: true,
      ok: result?.ok === true,
      code: result?.code || null,
      blocked: result?.code === maintenanceGuard.MAINTENANCE_ERROR_CODE,
    };
  };
  const writeAttempts = [];
  writeAttempts.push(
    await invoke('/products/create', {
      name: `CERT_LOCK_PRODUCT_${context.marker}`,
      sku: `LOCK-SKU-${context.marker}`,
      salePrice: 5,
      purchasePrice: 3,
      currentStock: 1,
    })
  );
  writeAttempts.push(
    await invoke('/inventory/adjust', {
      productId: context.baseline.productId,
      adjustmentType: 'increase',
      quantity: 1,
      reason: 'restore lock certification',
    })
  );
  writeAttempts.push(
    await invoke('/pos/sales/complete', {
      items: [{ productId: context.baseline.productId, quantity: 1, unitPrice: 5 }],
      paymentMethod: 'Cash',
      paidAmount: 5,
    })
  );
  writeAttempts.push(
    await invoke('/purchases/create', {
      supplierId: context.baseline.supplierId,
      items: [{ productId: context.baseline.productId, quantity: 1, purchasePrice: 3 }],
      paidAmount: 0,
    })
  );
  writeAttempts.push(
    await invoke('/customers/create', {
      name: `CERT_LOCK_CUSTOMER_${context.marker}`,
      phone: '000-lock',
    })
  );
  writeAttempts.push(
    await invoke('/suppliers/create', {
      name: `CERT_LOCK_SUPPLIER_${context.marker}`,
      phone: '000-lock',
    })
  );
  writeAttempts.push(
    await invoke('/settings/save', { system: { certLockMarker: context.marker } })
  );
  const readResult = await invoke('/products/list', {});
  const secondLock = await settingsRepository.acquireRestoreOperationLock({
    ownerUserId: OWNER_USER_ID,
    sourcePackageChecksum: sha256('second-lock'),
    sourcePackageFingerprint: sha256('second-lock'),
    sourceManifestVersion: '1.0',
  });
  await settingsRepository.transitionRestoreOperation({
    operationId: prepared.safety.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
    failureCategory: 'certification_mutation_lock_released_before_mutation',
    failureSummary: 'Mutation lock certification ended before Restore mutation.',
  });
  await settingsRepository.transitionRestoreOperation({
    operationId: prepared.safety.operationId,
    requestedByUserId: OWNER_USER_ID,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED,
  });
  const after = await fingerprintDataset(context.marker, context.baseline);
  const blockedWrites = writeAttempts.every((item) => item.blocked === true);
  const evidence = {
    scenarioName: 'mutation_lock',
    status:
      policy.operationLock?.locked === true &&
      secondLock.ok === false &&
      blockedWrites &&
      before.fingerprint === after.fingerprint
        ? 'passed'
        : 'failed',
    expectedResult:
      'Production guarded IPC write paths reject business mutations while Restore lock is active and leave data unchanged.',
    actualResult: {
      operationLock: policy.operationLock || null,
      secondRestoreRequestRejected: secondLock.ok === false,
      blockedWrites,
      writeAttempts,
      readOnlyAccessAllowed: readResult.registered === true && readResult.blocked !== true,
      unchangedFingerprint: before.fingerprint === after.fingerprint,
    },
  };
  await writeEvidence('mutation-lock-result.json', evidence);
  return evidence;
}

async function scenarioFailureRollback(context) {
  await mutateAfterBackup(`${context.marker}_rollback_pre`, context.baseline);
  const safetyBefore = await fingerprintDataset(context.marker, context.baseline);
  const prepared = await prepareConfirmation(context.backupPath, context.recoveryRoot);
  const result = await executeProductionRoute({
    sourcePackagePath: context.backupPath,
    operationId: prepared.safety.operationId,
    confirmationId: prepared.confirmation.confirmation.confirmationId,
    injectFailureStage: 'post_verification',
  });
  const after = await fingerprintDataset(context.marker, context.baseline);
  const recoveryState = await settingsRepository.getRestoreRecoveryState();
  const operationRow = await restoreOperationById(prepared.safety.operationId);
  const evidence = {
    scenarioName: 'restore_failure_and_rollback',
    status:
      result.ok === false &&
      after.fingerprint === safetyBefore.fingerprint &&
      operationRow?.state === recoveryModel.RESTORE_RECOVERY_STATES.ROLLED_BACK
        ? 'passed'
        : 'failed',
    expectedResult: 'Post-mutation failure triggers rollback from verified safety backup.',
    actualResult: {
      routeResult: result,
      safetyFingerprint: safetyBefore.fingerprint,
      afterFingerprint: after.fingerprint,
      rollbackRestoredPreRestoreState: after.fingerprint === safetyBefore.fingerprint,
      recoveryState: {
        currentState: recoveryState.currentState,
        unresolvedRecoveryState: recoveryState.unresolvedRecoveryState,
      },
      operationState: operationRow,
    },
  };
  await writeEvidence('restore-failure-rollback-result.json', evidence);
  return evidence;
}

async function scenarioRollbackFailureRecovery(context) {
  const prepared = await prepareConfirmation(context.backupPath, context.recoveryRoot);
  const result = await executeProductionRoute({
    sourcePackagePath: context.backupPath,
    operationId: prepared.safety.operationId,
    confirmationId: prepared.confirmation.confirmation.confirmationId,
    injectFailureStage: 'rollback_failure',
  });
  const recoveryState = await settingsRepository.getRestoreRecoveryState();
  const operationRow = await restoreOperationById(prepared.safety.operationId);
  const manualRecovery =
    operationRow?.state === recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED;
  const startupBefore = await settingsRepository.getRestoreStartupRecoveryAssessment();
  const completion = manualRecovery
    ? await settingsRepository.completeManualRestoreRecovery({
        operationId: prepared.safety.operationId,
        requestedByUserId: OWNER_USER_ID,
        expectedOutcome: 'restore_verified',
        expectedTargetFingerprint: operationRow.target_database_fingerprint,
        localManagedIdentity: context.localIdentity,
        restoreProcessEvidence: { activeRestoreProcess: false },
      })
    : { ok: false, code: 'RESTORE_MANUAL_RECOVERY_NOT_ENTERED' };
  const replay = await settingsRepository.completeManualRestoreRecovery({
    operationId: prepared.safety.operationId,
    requestedByUserId: OWNER_USER_ID,
    expectedOutcome: 'restore_verified',
    expectedTargetFingerprint: operationRow?.target_database_fingerprint,
    localManagedIdentity: context.localIdentity,
    restoreProcessEvidence: { activeRestoreProcess: false },
  });
  const startupAfter = await settingsRepository.getRestoreStartupRecoveryAssessment();
  const evidence = {
    scenarioName: 'rollback_failure_manual_recovery',
    status:
      manualRecovery &&
      result.ok === false &&
      startupBefore.startupRecovery?.databaseMutationsBlocked === true &&
      completion.ok === true &&
      replay.ok === false &&
      replay.code === 'RESTORE_MANUAL_RECOVERY_ALREADY_COMPLETED' &&
      startupAfter.startupRecovery?.databaseMutationsBlocked !== true
        ? 'passed'
        : 'failed',
    expectedResult:
      'Rollback failure leaves durable manual recovery lockout until verified recovery completion records a safe outcome and rejects replay.',
    actualResult: {
      routeResult: result,
      manualRecoveryRequired: manualRecovery,
      startupBefore: {
        blocksMutations: startupBefore.startupRecovery?.databaseMutationsBlocked === true,
        startupMode: startupBefore.startupRecovery?.startupMode || null,
      },
      completion,
      replay: { ok: replay.ok, code: replay.code },
      startupAfter: {
        blocksMutations: startupAfter.startupRecovery?.databaseMutationsBlocked === true,
        startupMode: startupAfter.startupRecovery?.startupMode || null,
      },
      recoveryState: {
        currentState: recoveryState.currentState,
        unresolvedRecoveryState: recoveryState.unresolvedRecoveryState,
        startupMode: recoveryState.startupMode,
      },
      operationState: operationRow,
    },
  };
  await writeEvidence('rollback-failure-recovery-result.json', evidence);
  return evidence;
}

async function scenarioPackagedPath(context) {
  const repoLocal = /node_modules|scripts|src[\\/]/i;
  const evidence = {
    scenarioName: 'packaged_runtime_path',
    status: 'partial',
    expectedResult:
      'Production route resolves backup packages, safety backups, identity and recovery metadata without requiring source-tree developer paths; PostgreSQL tool resolution remains covered by Phase 6 managed runtime certification.',
    actualResult: {
      backupPath: redactPath(context.backupPath),
      recoveryRoot: redactPath(context.recoveryRoot),
      sourceTreeDependencyDetected:
        repoLocal.test(context.backupPath) || repoLocal.test(context.recoveryRoot),
      postgresToolResolution:
        'not_invoked_by_json production restore route in this repository build',
      phase6ManagedRuntimeDependency:
        'PostgreSQL 17.10 packaged runtime certified separately before this phase.',
    },
  };
  if (!evidence.actualResult.sourceTreeDependencyDetected) evidence.status = 'passed';
  await writeEvidence('packaged-path-result.json', evidence);
  return evidence;
}

async function scenarioPostgresRuntimeProof() {
  const runtimeRoot = process.env.PRODUCTION_RESTORE_CERT_POSTGRES_RUNTIME_ROOT || '';
  const archivePath = process.env.PRODUCTION_RESTORE_CERT_POSTGRES_ARCHIVE || '';
  const expectedArchiveSha = 'ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106';
  const resolvedRoot = runtimeRoot ? path.resolve(runtimeRoot) : '';
  const executables = {
    postgres: resolvedRoot ? path.join(resolvedRoot, 'pgsql', 'bin', 'postgres.exe') : '',
    pgCtl: resolvedRoot ? path.join(resolvedRoot, 'pgsql', 'bin', 'pg_ctl.exe') : '',
    initdb: resolvedRoot ? path.join(resolvedRoot, 'pgsql', 'bin', 'initdb.exe') : '',
    psql: resolvedRoot ? path.join(resolvedRoot, 'pgsql', 'bin', 'psql.exe') : '',
    createdb: resolvedRoot ? path.join(resolvedRoot, 'pgsql', 'bin', 'createdb.exe') : '',
  };
  const results = {};
  for (const [name, filePath] of Object.entries(executables)) {
    const resolved = filePath ? path.resolve(filePath) : '';
    results[name] = {
      path: redactPath(resolved),
      exists: Boolean(resolved) && Boolean(await fs.stat(resolved).catch(() => null)),
      withinRuntimeRoot: Boolean(resolvedRoot) && resolved.startsWith(resolvedRoot),
    };
  }
  let versionOutput = '';
  try {
    versionOutput = execFileSync(executables.postgres, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    versionOutput = recoveryModel.sanitizeFailureSummary(error.message);
  }
  const archiveSha = archivePath ? await fileSha256(archivePath).catch(() => null) : null;
  let activeDatabaseVersion = null;
  let activeDatabasePort = null;
  let activeDatabaseName = null;
  try {
    const versionResult = await getPool().query(
      'SELECT version() AS version, inet_server_port() AS port, current_database() AS database'
    );
    activeDatabaseVersion = versionResult.rows[0]?.version || null;
    activeDatabasePort = Number(versionResult.rows[0]?.port || 0);
    activeDatabaseName = versionResult.rows[0]?.database || null;
  } catch (error) {
    activeDatabaseVersion = `unavailable: ${error.code || error.message}`;
  }
  const status =
    resolvedRoot &&
    Object.values(results).every((item) => item.exists && item.withinRuntimeRoot) &&
    /17\.10/.test(versionOutput) &&
    /17\.10/.test(String(activeDatabaseVersion || '')) &&
    (!archivePath || archiveSha === expectedArchiveSha) &&
    Number(process.env.PGPORT || 0) !== 5432 &&
    activeDatabasePort === Number(process.env.PGPORT || 0)
      ? 'passed'
      : 'failed';
  const evidence = {
    scenarioName: 'postgres_17_packaged_runtime_proof',
    status,
    expectedResult:
      'Restore certification uses the pinned packaged PostgreSQL 17.10 runtime and active database connection, not local PostgreSQL 18.1.',
    actualResult: {
      runtimeRoot: redactPath(resolvedRoot),
      executables: Object.fromEntries(
        Object.entries(executables).map(([name, filePath]) => [name, redactPath(filePath)])
      ),
      executableProof: results,
      postgresVersionOutput: versionOutput,
      archivePath: archivePath ? redactPath(archivePath) : null,
      archiveSha256: archiveSha,
      expectedArchiveSha256: expectedArchiveSha,
      port: Number(process.env.PGPORT || 0),
      activeDatabase: {
        database: activeDatabaseName,
        port: activeDatabasePort,
        version: activeDatabaseVersion,
      },
      localPostgres18Rejected: !/18\.1/.test(versionOutput),
    },
  };
  await writeEvidence('postgres-runtime-proof.json', evidence);
  return evidence;
}

async function scenarioInterruptionRecovery(context) {
  const checkpoints = [
    {
      checkpoint: 'after_safety_before_mutation',
      recoveryAction: 'cancel_pre_mutation',
      expectedFinalState: recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED,
    },
    {
      checkpoint: 'after_mutation_before_validation',
      recoveryAction: 'manual_restore_verified',
      expectedFinalState: recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
    },
    {
      checkpoint: 'during_rollback_before_apply',
      recoveryAction: 'startup_reconcile_then_manual_restore_verified',
      expectedFinalState: recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
    },
  ];
  const results = [];
  for (const item of checkpoints) {
    await mutateAfterBackup(`${context.marker}_${item.checkpoint}`, context.baseline);
    const before = await fingerprintDataset(context.marker, context.baseline);
    const checkpointFile = path.join(
      context.runRoot,
      'interruption-checkpoints',
      `${item.checkpoint}.json`
    );
    const child = spawnInterruptionChild({
      checkpoint: item.checkpoint,
      checkpointFile,
      backupPath: context.backupPath,
      recoveryRoot: context.recoveryRoot,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const checkpoint = await waitForJsonFile(checkpointFile);
    const killed = child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    const startup = await settingsRepository.getRestoreStartupRecoveryAssessment();
    const operationRow = await restoreOperationById(checkpoint.operationId);
    let recoveryResult = null;
    if (item.recoveryAction === 'cancel_pre_mutation') {
      recoveryResult = await settingsRepository.transitionRestoreOperation({
        operationId: checkpoint.operationId,
        requestedByUserId: OWNER_USER_ID,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
        failureCategory: 'certification_interruption_before_mutation',
        failureSummary: 'Certification child was terminated before Restore mutation.',
      });
      recoveryResult = await settingsRepository.transitionRestoreOperation({
        operationId: checkpoint.operationId,
        requestedByUserId: OWNER_USER_ID,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED,
      });
    } else {
      const latestState = await settingsRepository.getRestoreRecoveryState();
      if (
        latestState.currentState !== recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED
      ) {
        recoveryResult = await settingsRepository.transitionRestoreOperation({
          operationId: checkpoint.operationId,
          requestedByUserId: OWNER_USER_ID,
          nextState: recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
          failureCategory: 'certification_interruption_requires_manual_recovery',
          failureSummary: `Certification child was terminated at ${item.checkpoint}.`,
        });
      }
      const manualRow = await restoreOperationById(checkpoint.operationId);
      recoveryResult = await settingsRepository.completeManualRestoreRecovery({
        operationId: checkpoint.operationId,
        requestedByUserId: OWNER_USER_ID,
        expectedOutcome: 'restore_verified',
        expectedTargetFingerprint: manualRow?.target_database_fingerprint,
        localManagedIdentity: context.localIdentity,
        restoreProcessEvidence: { activeRestoreProcess: false },
      });
    }
    const after = await fingerprintDataset(context.marker, context.baseline);
    const startupAfter = await settingsRepository.getRestoreStartupRecoveryAssessment();
    const finalRow = await restoreOperationById(checkpoint.operationId);
    results.push({
      checkpointRequested: item.checkpoint,
      childPid: checkpoint.pid,
      killed,
      stdout: stdout.slice(0, 400),
      stderr: recoveryModel.sanitizeFailureSummary(stderr).slice(0, 400),
      lastPersistedState: operationRow?.state || null,
      startupModeAfterKill: startup.startupRecovery?.startupMode || null,
      businessAccessLockedAfterKill:
        startup.startupRecovery?.databaseMutationsBlocked === true ||
        startup.startupRecovery?.recoveryScreenRequired === true,
      recoveryAction: item.recoveryAction,
      recoveryResult,
      finalState: finalRow?.state || null,
      startupModeAfterRecovery: startupAfter.startupRecovery?.startupMode || null,
      finalDatabaseFingerprint: after.fingerprint,
      databaseClassified: Boolean(finalRow?.state),
      dataChangedFromCheckpoint: before.fingerprint !== after.fingerprint,
    });
  }
  const passed = results.every(
    (item) =>
      item.killed === true &&
      item.databaseClassified === true &&
      item.businessAccessLockedAfterKill === true &&
      (item.recoveryResult?.ok === true ||
        item.finalState === recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED) &&
      item.startupModeAfterRecovery !== 'MANUAL_RECOVERY_REQUIRED'
  );
  const evidence = {
    scenarioName: 'interruption_recovery_matrix',
    status: passed ? 'passed' : 'failed',
    expectedResult:
      'Child-process interruption at real Restore checkpoints is detected, remains classified, and recovers through supported routes.',
    actualResult: { results },
  };
  await writeEvidence('interruption-recovery-matrix.json', evidence);
  return evidence;
}

async function scanEvidenceForSecrets(secretValues) {
  const offenders = [];
  const files = await fs.readdir(evidenceRoot);
  for (const fileName of files) {
    if (!fileName.endsWith('.json') && !fileName.endsWith('.md') && !fileName.endsWith('.txt')) {
      continue;
    }
    const fullPath = path.join(evidenceRoot, fileName);
    const text = await fs.readFile(fullPath, 'utf8');
    for (const secret of secretValues.filter(Boolean)) {
      if (text.includes(secret)) offenders.push({ fileName, type: 'seed_secret_literal' });
    }
    if (/postgres:\/\/[^"\s]+:[^"\s]+@/i.test(text)) {
      offenders.push({ fileName, type: 'credentialed_database_url' });
    }
    if (/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(text)) {
      offenders.push({ fileName, type: 'bcrypt_hash' });
    }
  }
  const result = {
    scenarioName: 'secret_scan',
    status: offenders.length ? 'failed' : 'passed',
    expectedResult:
      'Evidence contains no plaintext seeded passwords, password hashes, credential URLs, tokens, or private keys.',
    actualResult: {
      filesScanned: files.length,
      offenders,
    },
  };
  await writeEvidence('secret-scan-result.json', result);
  return result;
}

function classifyCertificationStatus(allScenarioResults, secretScan, supplementalResults = []) {
  const scenarioStatuses = [...allScenarioResults, ...supplementalResults].map((item) => ({
    scenarioName: item.scenarioName,
    status: item.status,
  }));
  const blockingStatuses = scenarioStatuses.filter((item) => item.status !== 'passed');
  const blockers = [];
  if (secretScan?.status !== 'passed') blockers.push('secret-redaction scan failed');
  for (const item of blockingStatuses) {
    blockers.push(`${item.scenarioName}: ${item.status}`);
  }
  return {
    scenarioStatuses,
    status: blockers.length === 0 ? 'technical_pass' : 'blocked',
    blockers,
  };
}

async function buildEvidenceHashManifest() {
  const files = (await fs.readdir(evidenceRoot))
    .filter((file) => file.endsWith('.json') && file !== 'evidence-hash-manifest.json')
    .sort();
  const entries = [];
  for (const file of files) {
    const fullPath = path.join(evidenceRoot, file);
    const stat = await fs.stat(fullPath);
    entries.push({
      path: file,
      size: stat.size,
      sha256: await fileSha256(fullPath),
      sourceCommit: SOURCE_COMMIT,
      runId,
    });
  }
  const manifest = {
    schemaVersion: 1,
    sourceCommit: SOURCE_COMMIT,
    runId,
    generatedAt: new Date().toISOString(),
    entries,
  };
  const manifestPath = path.join(evidenceRoot, 'evidence-hash-manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestHash = await fileSha256(manifestPath);
  await fs.writeFile(
    path.join(evidenceRoot, 'evidence-hash-manifest.sha256.txt'),
    `${manifestHash}  evidence-hash-manifest.json\n`
  );
  return { manifestPath, manifestHash, entries };
}

async function writeApprovalPacket(summary, manifest) {
  const packetRoot = path.join(process.cwd(), 'docs', 'restore', 'authorization');
  await fs.mkdir(packetRoot, { recursive: true });
  const packetPath = path.join(packetRoot, 'PRODUCTION_RESTORE_AUTHORIZATION_PACKET.md');
  const approvalTemplatePath = path.join(packetRoot, 'production-restore-activation.template.json');
  const technicalComplete = summary.status === 'technical_pass';
  const packet = `# Production Restore Authorization Packet

## Decision State

Technical certification status: ${technicalComplete ? 'complete' : 'incomplete'}

Production activation status: pending. This packet does not authorize production Restore.

## Scope

- Product: Enterprise POS desktop application
- Target: installer-managed local PostgreSQL database only
- Restore strategy: transactional in-place Restore with verified pre-Restore safety backup
- Backup format: ${activationModel.REQUIRED_BACKUP_FORMAT_VERSION}
- Unsupported targets: arbitrary PostgreSQL instances, remote/cloud databases, copied configuration identities, and databases without a matching managed identity marker

## Certification Evidence

- Source commit: ${SOURCE_COMMIT}
- Certification run: ${runId}
- Evidence manifest SHA-256: ${manifest.manifestHash}
- Evidence directory: test-artifacts/production-restore-certification/${runId}

## Controls Preserved

- Administrator authorization and final typed confirmation
- Manifest and SHA-256 package verification
- Durable managed installation/database identity validation
- Safety-backup creation and verification before destructive mutation
- Confirmation binding to operation, backup, target, user and expiry
- Confirmation consumption and replay rejection
- Restore operation mutation lock
- Destination managed identity preservation
- Post-restore schema, critical-table and user validation
- Rollback/manual-recovery state transitions
- Secret redaction in evidence

## Residual Risks

- Human owner/release approval is not recorded.
- Human security/governance approval is not recorded.
- The committed activation record remains pending and non-authorizing.
- Production Restore feature flag remains disabled.

## Required Human Approval

Owner/release approver must review this packet, the evidence manifest, and generated evidence, then complete an authorizing activation record only if the scope and residual risks are accepted.
`;
  await fs.writeFile(packetPath, packet);

  const template = {
    schemaVersion: activationModel.RESTORE_ACTIVATION_SCHEMA_VERSION,
    product: activationModel.RESTORE_PRODUCT,
    component: activationModel.RESTORE_COMPONENT,
    releaseScope: activationModel.RESTORE_ACTIVATION_SCOPE,
    applicationVersion: packageJson.version,
    backupFormatVersion: activationModel.REQUIRED_BACKUP_FORMAT_VERSION,
    activationStatus: 'pending',
    restoreStrategy: 'transactional_in_place_with_verified_safety_backup',
    safetyBackupPolicy: activationModel.REQUIRED_SAFETY_BACKUP_POLICY,
    technicalCertification: Object.fromEntries(
      activationModel.REQUIRED_CERTIFICATION_EVIDENCE.map((key) => [
        key,
        {
          status: technicalComplete ? 'passed' : 'pending',
          evidenceReference: `test-artifacts/production-restore-certification/${runId}/${key}.json`,
          evidenceHash: '<bind-to-specific-evidence-file-sha256>',
        },
      ])
    ),
    authorization: {
      governanceReviewStatus: 'pending',
      securityReviewStatus: 'pending',
      releaseApprovalStatus: 'pending',
      approverIdentity: '<human-approver>',
      approvalAuthority: '<authority>',
      approvalTimestamp: '<approved-at-iso>',
      expiresAt: '<expires-at-iso>',
      revoked: false,
      testOnly: false,
    },
    evidenceManifestSha256: manifest.manifestHash,
    notes: [
      'Template is non-authorizing until every placeholder is replaced by authentic approval evidence.',
      'Do not enable PRODUCTION_RESTORE_FEATURE_ENABLED from this template alone.',
    ],
  };
  await fs.writeFile(approvalTemplatePath, `${JSON.stringify(template, null, 2)}\n`);
  return { packetPath, approvalTemplatePath };
}

async function writeLegalAudit() {
  const auditPath = path.join(
    process.cwd(),
    'docs',
    'restore',
    'authorization',
    'RESTORE_LICENSE_AUDIT.md'
  );
  const text = `# Backup and Restore Licence Audit

This audit records repository-controlled notice status for components used by Backup and Restore.
It is not external legal approval.

| Component | Version | Vendor/source | Licence | Notice path | Installer inclusion status | External legal review |
| --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL Windows binaries | 17.10 | PostgreSQL Global Development Group / EDB Windows binaries package | PostgreSQL Licence plus bundled third-party notices | resources/postgres/POSTGRESQL-LICENSE.txt; resources/postgres/THIRD-PARTY-NOTICES.md; archive server_license.txt and commandlinetools_3rd_party_licenses.txt | Included by offline installer payload policy | Owner/legal review required for redistribution acceptance |
| Microsoft Visual C++ Redistributable | pinned manifest version | Microsoft | Microsoft redistribution terms | resources/prerequisites/microsoft-vc-runtime/manifest.json; docs/installer/MICROSOFT_VC_RUNTIME_PREREQUISITE.md | Included by offline installer payload policy | Owner/legal review required for redistribution acceptance |
| Electron/Node runtime | package-lock pinned | OpenJS/Electron project dependencies | Open source licences from dependency tree | package-lock.json and bundled dependency metadata | Included through Electron package | Review third-party notice completeness before commercial release |
| Backup/Restore JSON archive logic | application code | Enterprise POS | Project licence | package.json | Application-owned code | No separate external component approval identified |
| SHA-256 hashing | Node.js crypto | Node.js/OpenSSL through Electron runtime | Node/Electron bundled licences | package-lock.json and Electron notices | Included through runtime | Covered by runtime notice review |

Repository-controlled notices listed above are present. External redistribution acceptance remains a human owner/legal review item for bundled PostgreSQL and Microsoft VC++ runtime distribution.
`;
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.writeFile(auditPath, text);
  return auditPath;
}

async function run() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return { status: 'help' };
  }
  if (args.child) {
    await runInterruptionChild(args);
    return { status: 'child_completed_unexpectedly' };
  }
  if (!args.certify) {
    throw new Error(`Missing required flag ${REQUIRED_FLAG}`);
  }
  await fs.mkdir(args.output, { recursive: true });
  if (args.output !== evidenceRoot) evidenceRoot = args.output;

  const marker = runId
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(-12);
  const databaseName = uniqueDbName('prod_route');
  const localIdentity = createManagedIdentity(databaseName);
  const passwords = {
    admin: `Admin-${crypto.randomBytes(12).toString('hex')}!`,
    user: `User-${crypto.randomBytes(12).toString('hex')}!`,
    inactive: `Inactive-${crypto.randomBytes(12).toString('hex')}!`,
    locked: `Locked-${crypto.randomBytes(12).toString('hex')}!`,
  };
  const runRoot = args.output;
  const privateBackupRoot = path.join(runRoot, 'private-backups');
  const backupPath = path.join(privateBackupRoot, 'certified-backup.json');
  const recoveryRoot = path.join(runRoot, 'recovery');
  const allScenarioResults = [];
  let cleanupResult = null;

  await writeEvidence('environment.json', {
    scenarioName: 'environment',
    status: 'recorded',
    expectedResult: 'Controlled DB-backed certification environment recorded without secrets.',
    actualResult: {
      platform: process.platform,
      arch: process.arch,
      hostnameHash: sha256(os.hostname()),
      nodeVersion: process.version,
      packageVersion: packageJson.version,
      database: redactedDatabaseConfig(databaseName),
      productionRestoreFeatureEnabled: executionService.PRODUCTION_RESTORE_FEATURE_ENABLED,
      committedActivationRecord:
        'resources/restore/production-activation.pending.json remains non-authorizing',
    },
  });

  try {
    await fs.mkdir(privateBackupRoot, { recursive: true });
    await createDatabase(databaseName);
    await withTargetEnvironment(databaseName, localIdentity, async () => {
      await initializeDatabase();
      const identityResult = await settingsRepository.ensureManagedDatabaseIdentity(localIdentity);
      assert.equal(identityResult.ok, true, identityResult.message);
      const pgVersion = (await getPool().query('SELECT version()')).rows[0].version;
      const baseline = await insertBaselineDataset(marker, passwords);
      const baselineFingerprint = await fingerprintDataset(marker, baseline);
      await writeEvidence('managed-identity.json', {
        scenarioName: 'managed_identity',
        status: identityResult.ok ? 'passed' : 'failed',
        expectedResult: 'Local installer identity and database-side identity are durably paired.',
        actualResult: {
          postgresVersion: pgVersion,
          database: redactedDatabaseConfig(databaseName),
          localIdentity: managedIdentityModel.redactedIdentity(localIdentity),
          identityResult,
          identityFingerprint: localIdentity.fingerprint,
        },
      });
      await writeEvidence('baseline-data-fingerprint.json', {
        scenarioName: 'baseline_dataset',
        status: 'passed',
        expectedResult:
          'Deterministic baseline records created without exposing passwords or password hashes.',
        actualResult: baselineFingerprint,
      });

      const backup = await settingsRepository.exportBackup(backupPath, OWNER_USER_ID);
      const backupHash = await fileSha256(backupPath);
      const backupVerification = await settingsRepository.verifyRestorePackage(backupPath);
      await writeEvidence('backup-result.json', {
        scenarioName: 'real_backup_creation',
        status: backupVerification.verificationStatus === 'passed' ? 'passed' : 'failed',
        expectedResult:
          'Actual Backup service writes a non-empty, SHA-256 verified package accepted by Restore verifier.',
        actualResult: {
          backupFile: redactPath(backupPath),
          size: (await fs.stat(backupPath)).size,
          sha256: backupHash,
          backupId: backup.backupId,
          verificationStatus: backupVerification.verificationStatus,
          summary: backupVerification.summary,
        },
      });

      await mutateAfterBackup(marker, baseline);
      const postMutationFingerprint = await fingerprintDataset(marker, baseline);

      const context = {
        runRoot,
        marker,
        databaseName,
        localIdentity,
        backupPath,
        recoveryRoot,
        baseline,
        baselineFingerprint,
        postMutationFingerprint,
        passwords,
      };
      allScenarioResults.push(await scenarioSuccessfulRestore(context));
      allScenarioResults.push(await scenarioSafetyBackupFailure(context));
      allScenarioResults.push(await scenarioIdentityRejections(context));
      allScenarioResults.push(await scenarioIntegrityRejections(context));
      allScenarioResults.push(await scenarioConfirmationMatrix(context));
      allScenarioResults.push(await scenarioFailureRollback(context));
      allScenarioResults.push(await scenarioRollbackFailureRecovery(context));
      allScenarioResults.push(await scenarioMutationLock(context));
      allScenarioResults.push(await scenarioPackagedPath(context));
      allScenarioResults.push(await scenarioPostgresRuntimeProof());

      const interruptionResult = await scenarioInterruptionRecovery(context);

      await writeEvidence('restored-user-authentication-result.json', {
        scenarioName: 'restored_user_authentication',
        status: allScenarioResults[0]?.actualResult?.authentication?.admin?.ok
          ? 'passed'
          : 'failed',
        expectedResult:
          'Restored active users authenticate, inactive and locked users are rejected, and first-run setup is suppressed.',
        actualResult: allScenarioResults[0]?.actualResult?.authentication || null,
      });

      await writeEvidence(
        'packaged-path-result.json',
        allScenarioResults[allScenarioResults.length - 1]
      );
      const secretScan = await scanEvidenceForSecrets(Object.values(passwords));
      const certificationStatus = classifyCertificationStatus(allScenarioResults, secretScan, [
        interruptionResult,
      ]);

      await writeEvidence('test-results.json', {
        scenarioName: 'test_results',
        status: certificationStatus.status === 'technical_pass' ? 'passed' : 'partial',
        expectedResult: 'All DB-backed production Restore certification scenarios complete.',
        actualResult: {
          scenarioStatuses: certificationStatus.scenarioStatuses,
          blockers: certificationStatus.blockers,
        },
      });
    });
  } finally {
    if (!args.keepDatabase) {
      cleanupResult = await dropDatabase(databaseName).catch((error) => ({
        ok: false,
        error: error.message,
      }));
    } else {
      cleanupResult = { ok: true, databaseRetained: true, databaseName };
    }
    await writeEvidence('cleanup-result.json', {
      scenarioName: 'cleanup',
      status: cleanupResult.ok ? 'passed' : 'failed',
      expectedResult: 'Disposable certification target is removed unless explicitly retained.',
      actualResult: cleanupResult,
    }).catch(() => {});
  }

  const manifest = await buildEvidenceHashManifest();
  const approvalPacket = await writeApprovalPacket(
    {
      status: 'technical_partial',
    },
    manifest
  );
  const legalAudit = await writeLegalAudit();
  const secretScanPath = path.join(evidenceRoot, 'secret-scan-result.json');
  const secretScan = JSON.parse(await fs.readFile(secretScanPath, 'utf8'));
  const interruptionResultPath = path.join(evidenceRoot, 'interruption-recovery-matrix.json');
  const interruptionResult = JSON.parse(await fs.readFile(interruptionResultPath, 'utf8'));
  const certificationStatus = classifyCertificationStatus(allScenarioResults, secretScan, [
    interruptionResult,
  ]);
  const summaryFiles = (await fs.readdir(evidenceRoot)).filter((file) => file.endsWith('.json'));
  const summary = {
    scenarioName: 'certification_summary',
    status: certificationStatus.status,
    expectedResult: 'Real DB-backed production Restore route certification evidence generated.',
    actualResult: {
      runId,
      sourceCommit: SOURCE_COMMIT,
      databaseName,
      evidenceRoot,
      evidenceFiles: summaryFiles,
      evidenceManifestSha256: manifest.manifestHash,
      approvalPacket: redactPath(approvalPacket.packetPath),
      approvalTemplate: redactPath(approvalPacket.approvalTemplatePath),
      legalAudit: redactPath(legalAudit),
      committedActivationRecordChanged: false,
      productionRestoreFeatureEnabled: executionService.PRODUCTION_RESTORE_FEATURE_ENABLED,
      scenarioStatuses: certificationStatus.scenarioStatuses,
      cleanupResult,
      remainingBlockers:
        certificationStatus.status === 'technical_pass'
          ? ['human owner/release approval', 'human security/governance approval']
          : certificationStatus.blockers,
    },
  };
  await writeEvidence('certification-summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'technical_pass') process.exitCode = 2;
  return summary;
}

if (require.main === module) {
  run().catch(async (error) => {
    await writeEvidence('certification-summary.json', {
      scenarioName: 'certification_summary',
      status: 'failed',
      expectedResult: 'Production Restore certification should complete or fail safely.',
      actualResult: {
        code: error.code || 'PRODUCTION_RESTORE_CERTIFICATION_FAILED',
        message: String(error.message || error).slice(0, 800),
      },
    }).catch(() => {});
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  DB_PREFIX,
  REQUIRED_FLAG,
  parseArgs,
  createActivationRecord,
  createManagedIdentity,
  stableStringify,
};
