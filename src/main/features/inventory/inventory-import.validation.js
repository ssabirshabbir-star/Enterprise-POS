const { FIELD_DEFINITIONS } = require('./inventory-import-template.contract');
const {
  IMPORT_ERROR_CODES,
  IMPORT_WARNING_CODES,
  importError,
  importWarning,
} = require('./inventory-import.errors');

const ROW_STATUSES = Object.freeze({
  STRUCTURALLY_VALID: 'STRUCTURALLY_VALID',
  STRUCTURALLY_INVALID: 'STRUCTURALLY_INVALID',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  EMPTY_ROW: 'EMPTY_ROW',
  PRODUCT_ONLY_CANDIDATE: 'PRODUCT_ONLY_CANDIDATE',
  STOCK_ROW_CANDIDATE: 'STOCK_ROW_CANDIDATE',
});

const SCIENTIFIC_NOTATION = /^[+-]?(?:\d+\.?\d*|\.\d+)e[+-]?\d+$/i;
const PLAIN_NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const SKU_PATTERN = /^[A-Za-z0-9._-]{2,80}$/;
const BARCODE_PATTERN = /^[A-Za-z0-9._-]{4,120}$/;
const EXPORTED_BARCODE_FORMULA_PATTERN = /^="([A-Za-z0-9._-]{4,120})"$/;
const DECIMAL_CONTRACTS = Object.freeze({
  money: { maxIntegerDigits: 12, maxDecimals: 2 },
  quantity: { maxIntegerDigits: 11, maxDecimals: 3 },
  integer: { maxIntegerDigits: 5, maxDecimals: 0 },
});

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n|\r|\n/g, '\n')
    .trim();
}

function isEmptyRow(cells) {
  return Object.values(cells || {}).every((value) => normalizeText(value) === '');
}

function hasControlCharacters(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}

function canonicalizeDecimal(text) {
  const [rawInteger, rawFraction = ''] = text.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  return rawFraction === '' ? integer : `${integer}.${rawFraction}`;
}

function exceedsDecimalRange(canonical, { maxIntegerDigits, maxDecimals }) {
  const [integer, fraction = ''] = canonical.split('.');
  const significantInteger = integer.replace(/^0+/, '');
  if (significantInteger.length > maxIntegerDigits) return true;
  if (fraction.length > maxDecimals) return true;
  return false;
}

function isPositiveDecimal(canonical) {
  return /[1-9]/.test(canonical.replace('.', ''));
}

function isZeroDecimal(canonical) {
  return !isPositiveDecimal(canonical || '0');
}

function parseDecimal(
  value,
  { column, contract, integer = false, allowEmpty = true, sourceRowNumber }
) {
  const text = normalizeText(value);
  if (!text)
    return allowEmpty
      ? { ok: true, value: null }
      : {
          ok: false,
          error: importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, { sourceRowNumber, column }),
        };
  if (SCIENTIFIC_NOTATION.test(text))
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.SCIENTIFIC_NOTATION, { sourceRowNumber, column }),
    };
  if (text.startsWith('-'))
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.NEGATIVE_NUMBER, { sourceRowNumber, column }),
    };
  if (/[,+$Rs]/i.test(text) || !PLAIN_NUMBER.test(text))
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.INVALID_NUMBER, { sourceRowNumber, column }),
    };
  const decimals = text.includes('.') ? text.slice(text.indexOf('.') + 1).length : 0;
  if (integer && decimals > 0)
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.INVALID_NUMBER, { sourceRowNumber, column }),
    };
  if (decimals > contract.maxDecimals)
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.TOO_MANY_DECIMALS, { sourceRowNumber, column }),
    };
  const canonical = canonicalizeDecimal(text);
  if (exceedsDecimalRange(canonical, contract)) {
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.NUMBER_OUT_OF_RANGE, { sourceRowNumber, column }),
    };
  }
  return { ok: true, value: canonical };
}

function parseBoolean(
  value,
  { column, activeField = false, defaultValue = null, sourceRowNumber }
) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return { ok: true, value: defaultValue };
  if (['true', 'yes', '1'].includes(text)) return { ok: true, value: true };
  if (['false', 'no', '0'].includes(text)) return { ok: true, value: false };
  if (activeField && text === 'active') return { ok: true, value: true };
  if (activeField && text === 'inactive') return { ok: true, value: false };
  return {
    ok: false,
    error: importError(IMPORT_ERROR_CODES.INVALID_BOOLEAN, { sourceRowNumber, column }),
  };
}

function validateTextLength(value, field, errors, sourceRowNumber) {
  const definition = FIELD_DEFINITIONS[field];
  const text = normalizeText(value);
  if (hasControlCharacters(text)) {
    errors.push(
      importError(IMPORT_ERROR_CODES.BINARY_CONTENT, { sourceRowNumber, column: definition.header })
    );
  }
  if (definition.maxLength && text.length > definition.maxLength) {
    errors.push(
      importError(IMPORT_ERROR_CODES.TEXT_TOO_LONG, { sourceRowNumber, column: definition.header })
    );
  }
  return text;
}

function unwrapExportedBarcodeText(text) {
  const formulaMatch = EXPORTED_BARCODE_FORMULA_PATTERN.exec(text);
  if (formulaMatch) return formulaMatch[1];
  return text;
}

function validateIdentifierText(value, field, errors, sourceRowNumber) {
  const definition = FIELD_DEFINITIONS[field];
  const rawText = normalizeText(value);
  const text = field === 'barcode' ? unwrapExportedBarcodeText(rawText) : rawText;
  if (hasControlCharacters(text)) {
    errors.push(
      importError(IMPORT_ERROR_CODES.BINARY_CONTENT, { sourceRowNumber, column: definition.header })
    );
  }
  if (definition.maxLength && text.length > definition.maxLength) {
    errors.push(
      importError(IMPORT_ERROR_CODES.TEXT_TOO_LONG, { sourceRowNumber, column: definition.header })
    );
  }
  return text;
}

function normalizeIdentifier(value, field, pattern, errors, sourceRowNumber) {
  const text = validateIdentifierText(value, field, errors, sourceRowNumber);
  if (!text) return '';
  if (SCIENTIFIC_NOTATION.test(text)) {
    errors.push(
      importError(IMPORT_ERROR_CODES.SCIENTIFIC_NOTATION, {
        sourceRowNumber,
        column: FIELD_DEFINITIONS[field].header,
      })
    );
    return text;
  }
  if (!pattern.test(text)) {
    errors.push(
      importError(
        field === 'sku' ? IMPORT_ERROR_CODES.INVALID_SKU : IMPORT_ERROR_CODES.INVALID_BARCODE,
        {
          sourceRowNumber,
          column: FIELD_DEFINITIONS[field].header,
        }
      )
    );
  }
  return text;
}

function classifyRow(normalized) {
  if (isPositiveDecimal(normalized.openingQuantity || '0')) return ROW_STATUSES.STOCK_ROW_CANDIDATE;
  if (
    normalized.productName &&
    normalized.sku &&
    normalized.costPrice !== null &&
    normalized.sellingPrice !== null
  ) {
    return ROW_STATUSES.PRODUCT_ONLY_CANDIDATE;
  }
  return ROW_STATUSES.STRUCTURALLY_VALID;
}

function validateRow(row) {
  const sourceRowNumber = row.sourceRowNumber;
  const cells = row.cells || {};
  const errors = [];
  const warnings = [];

  if (isEmptyRow(cells)) {
    return { sourceRowNumber, status: ROW_STATUSES.EMPTY_ROW, normalized: {}, errors, warnings };
  }

  const normalized = {
    productName: validateTextLength(cells.productName, 'productName', errors, sourceRowNumber),
    sku: normalizeIdentifier(cells.sku, 'sku', SKU_PATTERN, errors, sourceRowNumber),
    barcode: normalizeIdentifier(
      cells.barcode,
      'barcode',
      BARCODE_PATTERN,
      errors,
      sourceRowNumber
    ),
    category: validateTextLength(cells.category, 'category', errors, sourceRowNumber),
    brand: validateTextLength(cells.brand, 'brand', errors, sourceRowNumber),
    unit: validateTextLength(cells.unit, 'unit', errors, sourceRowNumber),
    variant: validateTextLength(cells.variant, 'variant', errors, sourceRowNumber),
    remarks: validateTextLength(cells.remarks, 'remarks', errors, sourceRowNumber),
  };

  const costPrice = parseDecimal(cells.costPrice, {
    column: 'Cost Price',
    contract: DECIMAL_CONTRACTS.money,
    sourceRowNumber,
  });
  const sellingPrice = parseDecimal(cells.sellingPrice, {
    column: 'Selling Price',
    contract: DECIMAL_CONTRACTS.money,
    sourceRowNumber,
  });
  const wholesalePrice = parseDecimal(cells.wholesalePrice, {
    column: 'Wholesale Price',
    contract: DECIMAL_CONTRACTS.money,
    sourceRowNumber,
  });
  const openingQuantity = parseDecimal(cells.openingQuantity, {
    column: 'Opening Quantity',
    contract: DECIMAL_CONTRACTS.quantity,
    sourceRowNumber,
  });
  const minimumStock = parseDecimal(cells.minimumStock, {
    column: 'Minimum Stock',
    contract: DECIMAL_CONTRACTS.quantity,
    sourceRowNumber,
  });
  const expiryAlertDays = parseDecimal(cells.expiryAlertDays, {
    column: 'Expiry Alert Days',
    contract: DECIMAL_CONTRACTS.integer,
    integer: true,
    sourceRowNumber,
  });
  [costPrice, sellingPrice, wholesalePrice, openingQuantity, minimumStock, expiryAlertDays]
    .filter((result) => !result.ok)
    .forEach((result) => errors.push(result.error));

  normalized.costPrice = costPrice.ok ? costPrice.value : null;
  normalized.sellingPrice = sellingPrice.ok ? sellingPrice.value : null;
  normalized.wholesalePrice = wholesalePrice.ok ? wholesalePrice.value : null;
  normalized.openingQuantity = openingQuantity.ok ? openingQuantity.value || '0' : null;
  normalized.minimumStock = minimumStock.ok ? minimumStock.value || '0' : null;
  normalized.expiryAlertDays = expiryAlertDays.ok ? expiryAlertDays.value : null;

  const active = parseBoolean(cells.active, {
    column: 'Active',
    activeField: true,
    defaultValue: true,
    sourceRowNumber,
  });
  const trackExpiry = parseBoolean(cells.trackExpiry, {
    column: 'Track Expiry',
    defaultValue: false,
    sourceRowNumber,
  });
  const expiryRequired = parseBoolean(cells.expiryRequired, {
    column: 'Expiry Required',
    defaultValue: false,
    sourceRowNumber,
  });
  const allowPriceChange = parseBoolean(cells.allowPriceChange, {
    column: 'Allow Price Change',
    defaultValue: false,
    sourceRowNumber,
  });
  [active, trackExpiry, expiryRequired, allowPriceChange]
    .filter((result) => !result.ok)
    .forEach((result) => errors.push(result.error));

  normalized.active = active.ok ? active.value : true;
  normalized.trackExpiry = trackExpiry.ok ? trackExpiry.value : false;
  normalized.expiryRequired = expiryRequired.ok ? expiryRequired.value : false;
  normalized.allowPriceChange = allowPriceChange.ok ? allowPriceChange.value : false;

  if (normalized.expiryRequired && !normalized.trackExpiry) {
    errors.push(
      importError(IMPORT_ERROR_CODES.EXPIRY_POLICY_CONFLICT, {
        sourceRowNumber,
        column: 'Expiry Required',
      })
    );
  }

  const hasIdentity = Boolean(normalized.sku || normalized.barcode);
  if (!hasIdentity) {
    errors.push(importError(IMPORT_ERROR_CODES.MISSING_IDENTITY, { sourceRowNumber }));
  }

  const hasProductFields = Boolean(
    normalized.productName ||
    normalized.category ||
    normalized.brand ||
    normalized.unit ||
    normalized.variant
  );
  const newProductCandidate = Boolean(normalized.productName && normalized.sku);
  if (hasProductFields && !normalized.sku) {
    warnings.push(
      importWarning(IMPORT_WARNING_CODES.PRODUCT_NAME_WITHOUT_STABLE_ID, {
        sourceRowNumber,
        column: 'SKU',
      })
    );
  }
  if (newProductCandidate) {
    if (!normalized.productName)
      errors.push(
        importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, {
          sourceRowNumber,
          column: 'Product Name',
        })
      );
    if (!normalized.sku)
      errors.push(
        importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, { sourceRowNumber, column: 'SKU' })
      );
    if (normalized.costPrice === null)
      errors.push(
        importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, {
          sourceRowNumber,
          column: 'Cost Price',
        })
      );
    if (normalized.sellingPrice === null)
      errors.push(
        importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, {
          sourceRowNumber,
          column: 'Selling Price',
        })
      );
  }

  if (isPositiveDecimal(normalized.openingQuantity || '0')) {
    if (normalized.costPrice === null)
      errors.push(
        importError(IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD, {
          sourceRowNumber,
          column: 'Cost Price',
        })
      );
    if (normalized.costPrice !== null && isZeroDecimal(normalized.costPrice))
      errors.push(
        importError(IMPORT_ERROR_CODES.ZERO_COST_WITH_STOCK, {
          sourceRowNumber,
          column: 'Cost Price',
        })
      );
  }

  return {
    sourceRowNumber,
    status: errors.length ? ROW_STATUSES.STRUCTURALLY_INVALID : classifyRow(normalized),
    normalized,
    errors,
    warnings,
  };
}

function applyFileDuplicateErrors(rows) {
  const seenSku = new Map();
  const seenBarcode = new Map();
  rows.forEach((row) => {
    const skuKey = row.normalized.sku ? row.normalized.sku.toLowerCase() : '';
    const barcodeKey = row.normalized.barcode ? row.normalized.barcode.toLowerCase() : '';
    if (skuKey) {
      if (seenSku.has(skuKey)) {
        row.errors.push(
          importError(IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE, {
            sourceRowNumber: row.sourceRowNumber,
            column: 'SKU',
            referenceRowNumber: seenSku.get(skuKey),
          })
        );
        if (row.status !== ROW_STATUSES.STRUCTURALLY_INVALID)
          row.status = ROW_STATUSES.DUPLICATE_IN_FILE;
      } else {
        seenSku.set(skuKey, row.sourceRowNumber);
      }
    }
    if (barcodeKey) {
      if (seenBarcode.has(barcodeKey)) {
        row.errors.push(
          importError(IMPORT_ERROR_CODES.DUPLICATE_BARCODE_IN_FILE, {
            sourceRowNumber: row.sourceRowNumber,
            column: 'Barcode',
            referenceRowNumber: seenBarcode.get(barcodeKey),
          })
        );
        if (row.status !== ROW_STATUSES.STRUCTURALLY_INVALID)
          row.status = ROW_STATUSES.DUPLICATE_IN_FILE;
      } else {
        seenBarcode.set(barcodeKey, row.sourceRowNumber);
      }
    }
  });
}

function validateInventoryImportRows(sourceRows = []) {
  const rows = sourceRows.map(validateRow);
  applyFileDuplicateErrors(rows);
  const errors = rows.flatMap((row) => row.errors);
  const warnings = rows.flatMap((row) => row.warnings);
  return { ok: errors.length === 0, rows, errors, warnings };
}

module.exports = {
  ROW_STATUSES,
  validateInventoryImportRows,
};
