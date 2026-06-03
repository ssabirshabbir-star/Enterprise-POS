const fs = require('fs/promises');
const path = require('path');
const { getPool, withTransaction } = require('../../database/connection');

const SETTING_KEYS = ['store', 'tax', 'system'];
const BACKUP_TABLES = [
  'categories',
  'brands',
  'units',
  'products',
  'warehouses',
  'inventory',
  'stock_movements',
  'suppliers',
  'purchases',
  'purchase_items',
  'supplier_ledger',
  'customers',
  'sales',
  'sale_items',
  'payments',
  'customer_ledger',
  'customer_payments',
  'returns',
  'return_items',
  'refund_payments',
  'held_sales',
  'offline_queue',
  'printer_settings',
  'app_settings'
];
const RESTORE_SEQUENCE_TABLES = BACKUP_TABLES.filter((table) => table !== 'app_settings');

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error('Invalid database identifier.');
  }
  return `"${identifier}"`;
}

function mapPrinter(row = {}) {
  return {
    printerName: row.printer_name || '',
    paperWidth: row.paper_width || '80mm',
    autoPrint: Boolean(row.auto_print),
    silentPrint: Boolean(row.silent_print),
    receiptCopies: Number(row.receipt_copies || 1),
    footerText: row.footer_text || 'Thank you for shopping'
  };
}

async function getSettings() {
  const settingsResult = await getPool().query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [SETTING_KEYS]);
  const printerResult = await getPool().query('SELECT * FROM printer_settings ORDER BY id ASC LIMIT 1');
  const settings = Object.fromEntries(settingsResult.rows.map((row) => [row.key, row.value]));
  return {
    store: settings.store || {},
    tax: settings.tax || {},
    printer: mapPrinter(printerResult.rows[0]),
    system: settings.system || {}
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
        payload.printer.receiptCopies
      ]
    );

  });
  return getSettings();
}

async function exportBackup(filePath, userId) {
  const data = {};
  for (const table of BACKUP_TABLES) {
    const result = await getPool().query(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY 1 ASC`);
    data[table] = result.rows;
  }

  const backup = {
    metadata: {
      app: 'Enterprise POS',
      version: 1,
      createdAt: new Date().toISOString(),
      tables: BACKUP_TABLES
    },
    data
  };

  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
  const fileName = path.basename(filePath);
  const log = await createBackupLog({
    fileName,
    filePath,
    action: 'BACKUP',
    status: 'SUCCESS',
    message: 'Backup created successfully.',
    userId
  });
  return { fileName, filePath, logId: log.id };
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

async function listBackupLogs() {
  const result = await getPool().query(
    `
      SELECT backup_logs.*, users.full_name AS created_by_name
      FROM backup_logs
      LEFT JOIN users ON users.id = backup_logs.created_by
      ORDER BY backup_logs.created_at DESC
      LIMIT 100
    `
  );
  return result.rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path,
    action: row.action,
    status: row.status,
    message: row.message,
    createdBy: row.created_by_name || 'System',
    createdAt: row.created_at
  }));
}

async function restoreBackup(filePath, userId) {
  const raw = await fs.readFile(filePath, 'utf8');
  const backup = JSON.parse(raw);
  if (!backup?.metadata || backup.metadata.app !== 'Enterprise POS' || backup.metadata.version !== 1) {
    throw new Error('INVALID_BACKUP_FILE');
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(backup.data?.[table])) throw new Error('INVALID_BACKUP_FILE');
  }

  await withTransaction(async (client) => {
    await client.query(`TRUNCATE ${BACKUP_TABLES.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
    for (const table of BACKUP_TABLES) {
      for (const row of backup.data[table]) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map((_, index) => `$${index + 1}`);
        const values = columns.map((column) => row[column]);
        await client.query(
          `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`,
          values
        );
      }
      if (RESTORE_SEQUENCE_TABLES.includes(table)) {
        await client.query(
          `
            SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table)}), 1), COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table)}), 0) > 0)
            WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL
          `,
          [table]
        );
      }
    }
  });

  await createBackupLog({
    fileName: path.basename(filePath),
    filePath,
    action: 'RESTORE',
    status: 'SUCCESS',
    message: 'Backup restored successfully.',
    userId
  });
  return { fileName: path.basename(filePath), filePath };
}

module.exports = {
  exportBackup,
  getSettings,
  listBackupLogs,
  restoreBackup,
  saveSettings
};
