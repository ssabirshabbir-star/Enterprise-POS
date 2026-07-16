const { getPool } = require('../../database/connection');

async function getPrinterSettingsRow() {
  const result = await getPool().query('SELECT * FROM printer_settings ORDER BY id ASC LIMIT 1');
  return result.rows[0] || {};
}

async function getStoreSettingsRow() {
  const result = await getPool().query(
    "SELECT value FROM app_settings WHERE key = 'store' LIMIT 1"
  );
  return result.rows[0]?.value || {};
}

async function savePrinterSettingsRow(settings) {
  const result = await getPool().query(
    `
      UPDATE printer_settings
      SET printer_name = $1, paper_width = $2, silent_print = $3, footer_text = $4,
          auto_print = $5, receipt_copies = $6, updated_at = NOW()
      WHERE id = (SELECT id FROM printer_settings ORDER BY id ASC LIMIT 1)
      RETURNING *
    `,
    [
      settings.printerName,
      settings.paperWidth,
      settings.silentPrint,
      settings.footerText,
      settings.autoPrint,
      settings.receiptCopies,
    ]
  );
  return result.rows[0];
}

module.exports = {
  getPrinterSettingsRow,
  getStoreSettingsRow,
  savePrinterSettingsRow,
};
