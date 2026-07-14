const CSV_COLUMNS = Object.freeze([
  { header: 'Product Name', key: 'name', type: 'text' },
  { header: 'SKU', key: 'sku', type: 'text' },
  { header: 'Barcode', key: 'barcode', type: 'text' },
  { header: 'Category', key: 'categoryName', type: 'text' },
  { header: 'Brand', key: 'brandName', type: 'text' },
  { header: 'Unit', key: 'unitName', type: 'text' },
  { header: 'Batch Number', key: 'batchNumber', type: 'text' },
  { header: 'Expiration Date', key: 'expirationDate', type: 'date' },
  { header: 'Last Purchase Price', key: 'lastPurchasePrice', type: 'number' },
  { header: 'Cost Price', key: 'purchasePrice', type: 'number' },
  { header: 'Selling Price', key: 'salePrice', type: 'number' },
  { header: 'Stock Quantity', key: 'currentStock', type: 'number' },
  { header: 'Minimum Stock', key: 'minStockLevel', type: 'number' },
  { header: 'Stock Status', key: 'status', type: 'status' },
  { header: 'Active Status', key: 'isActive', type: 'booleanStatus' },
]);

const DANGEROUS_FORMULA_PREFIX = /^[\s]*[=+\-@]/;

function formatDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function formatStatus(value) {
  const status = String(value || '').trim();
  if (status === 'OUT_OF_STOCK') return 'Out of Stock';
  if (status === 'LOW_STOCK') return 'Low Stock';
  if (status === 'IN_STOCK') return 'In Stock';
  return status;
}

function formatCellValue(value, column) {
  if (value === null || value === undefined) return '';
  if (column.type === 'date') return formatDate(value);
  if (column.type === 'number') return formatNumber(value);
  if (column.type === 'booleanStatus') return value === false ? 'Inactive' : 'Active';
  if (column.type === 'status') return formatStatus(value);
  return String(value);
}

function protectFormulaText(value, column) {
  if (!['text', 'status', 'booleanStatus'].includes(column.type)) return value;
  if (!value || !DANGEROUS_FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

function escapeCsvCell(value) {
  const text = String(value);
  const needsQuotes = /[",\r\n]/.test(text) || /^\s|\s$/.test(text) || /^'\s/.test(text);
  const escaped = text.replace(/"/g, '""').replace(/\r\n|\r|\n/g, '\r\n');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function serializeInventoryRowsToCsv(rows = []) {
  const header = CSV_COLUMNS.map((column) => escapeCsvCell(column.header)).join(',');
  const body = rows.map((row) =>
    CSV_COLUMNS.map((column) => {
      const formatted = formatCellValue(row[column.key], column);
      return escapeCsvCell(protectFormulaText(formatted, column));
    }).join(',')
  );
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

module.exports = {
  CSV_COLUMNS,
  serializeInventoryRowsToCsv,
};
