const TEMPLATE_VERSION = 'inventory-import-v1';
const UTF8_BOM = '\uFEFF';

const IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 10000,
  maxColumns: 18,
  maxRemarksLength: 500,
});

const TEMPLATE_HEADERS = Object.freeze([
  'Product Name',
  'SKU',
  'Barcode',
  'Category',
  'Brand',
  'Unit',
  'Variant',
  'Cost Price',
  'Selling Price',
  'Wholesale Price',
  'Opening Quantity',
  'Minimum Stock',
  'Active',
  'Track Expiry',
  'Expiry Required',
  'Expiry Alert Days',
  'Allow Price Change',
  'Remarks',
]);

const HEADER_ALIASES = Object.freeze({
  cost: 'Cost Price',
  'sale price': 'Selling Price',
  qty: 'Opening Quantity',
});

const FIELD_DEFINITIONS = Object.freeze({
  productName: {
    header: 'Product Name',
    type: 'text',
    maxLength: 220,
    appliesTo: ['newProduct', 'allRows'],
    required: 'newProduct',
    example: 'Wheat Flour 5kg',
  },
  sku: {
    header: 'SKU',
    type: 'identifier',
    maxLength: 80,
    appliesTo: ['newProduct', 'existingProduct', 'allRows'],
    required: 'newProduct',
    example: 'FLOUR-5KG',
  },
  barcode: {
    header: 'Barcode',
    type: 'identifier',
    maxLength: 120,
    appliesTo: ['existingProduct', 'allRows'],
    required: false,
    example: '0123456789012',
  },
  category: {
    header: 'Category',
    type: 'reference',
    maxLength: 140,
    appliesTo: ['newProduct'],
    required: false,
    example: 'Grocery',
  },
  brand: {
    header: 'Brand',
    type: 'reference',
    maxLength: 140,
    appliesTo: ['newProduct'],
    required: false,
    example: 'Local',
  },
  unit: {
    header: 'Unit',
    type: 'reference',
    maxLength: 80,
    appliesTo: ['newProduct'],
    required: false,
    example: 'Piece',
  },
  variant: {
    header: 'Variant',
    type: 'reference',
    maxLength: 140,
    appliesTo: ['newProduct'],
    required: false,
    example: '',
  },
  costPrice: {
    header: 'Cost Price',
    type: 'money',
    maxDecimals: 2,
    appliesTo: ['newProduct', 'stockProposal'],
    required: 'newProductOrPositiveStock',
    example: '100.00',
  },
  sellingPrice: {
    header: 'Selling Price',
    type: 'money',
    maxDecimals: 2,
    appliesTo: ['newProduct'],
    required: 'newProduct',
    example: '120.00',
  },
  wholesalePrice: {
    header: 'Wholesale Price',
    type: 'money',
    maxDecimals: 2,
    appliesTo: ['newProduct'],
    required: false,
    example: '110.00',
  },
  openingQuantity: {
    header: 'Opening Quantity',
    type: 'quantity',
    maxDecimals: 3,
    appliesTo: ['stockProposal'],
    required: false,
    example: '10',
  },
  minimumStock: {
    header: 'Minimum Stock',
    type: 'quantity',
    maxDecimals: 3,
    appliesTo: ['newProduct', 'stockProposal'],
    required: false,
    example: '5',
  },
  active: {
    header: 'Active',
    type: 'boolean',
    appliesTo: ['newProduct'],
    required: false,
    defaultValue: true,
    example: 'true',
  },
  trackExpiry: {
    header: 'Track Expiry',
    type: 'boolean',
    appliesTo: ['newProduct'],
    required: false,
    defaultValue: false,
    example: 'false',
  },
  expiryRequired: {
    header: 'Expiry Required',
    type: 'boolean',
    appliesTo: ['newProduct'],
    required: false,
    defaultValue: false,
    example: 'false',
  },
  expiryAlertDays: {
    header: 'Expiry Alert Days',
    type: 'integer',
    appliesTo: ['newProduct'],
    required: false,
    example: '30',
  },
  allowPriceChange: {
    header: 'Allow Price Change',
    type: 'boolean',
    appliesTo: ['newProduct'],
    required: false,
    defaultValue: false,
    example: 'false',
  },
  remarks: {
    header: 'Remarks',
    type: 'text',
    maxLength: IMPORT_LIMITS.maxRemarksLength,
    appliesTo: ['previewAudit'],
    required: false,
    example: 'Opening stock migration',
  },
});

const HEADER_TO_FIELD = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS).map(([field, definition]) => [definition.header, field])
  )
);

function escapeTemplateCell(value) {
  const text = String(value ?? '');
  const escaped = text.replace(/"/g, '""').replace(/\r\n|\r|\n/g, '\r\n');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function generateInventoryImportTemplateCsv({ includeBom = true } = {}) {
  const header = TEMPLATE_HEADERS.map(escapeTemplateCell).join(',');
  return `${includeBom ? UTF8_BOM : ''}${header}\r\n`;
}

function canonicalizeHeader(header) {
  const text = String(header || '')
    .replace(/^\uFEFF/, '')
    .trim();
  const normalized = text.toLowerCase();
  return (
    HEADER_ALIASES[normalized] ||
    TEMPLATE_HEADERS.find((item) => item.toLowerCase() === normalized) ||
    null
  );
}

module.exports = {
  FIELD_DEFINITIONS,
  HEADER_ALIASES,
  HEADER_TO_FIELD,
  IMPORT_LIMITS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
  UTF8_BOM,
  canonicalizeHeader,
  generateInventoryImportTemplateCsv,
};
