const {
  HEADER_TO_FIELD,
  IMPORT_LIMITS,
  TEMPLATE_HEADERS,
  canonicalizeHeader,
} = require('./inventory-import-template.contract');
const { TextDecoder } = require('node:util');
const { IMPORT_ERROR_CODES, importError } = require('./inventory-import.errors');

function normalizeInput(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return { ok: true, text: decoder.decode(input) };
    } catch {
      return { ok: false, error: importError(IMPORT_ERROR_CODES.INVALID_UTF8) };
    }
  }
  return { ok: true, text: String(input ?? '') };
}

function isBlankRecord(cells) {
  return cells.every((cell) => String(cell || '').trim() === '');
}

function parseRecords(text) {
  const records = [];
  let cells = [];
  let field = '';
  let raw = '';
  let inQuotes = false;
  let quotedField = false;
  let rowNumber = 1;
  let fieldStarted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    raw += char;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          raw += text[index + 1];
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (fieldStarted && field !== '') {
        return {
          ok: false,
          error: importError(IMPORT_ERROR_CODES.MALFORMED_CSV, { sourceRowNumber: rowNumber }),
        };
      }
      inQuotes = true;
      quotedField = true;
      fieldStarted = true;
      continue;
    }

    if (char === ',') {
      cells.push(field);
      field = '';
      quotedField = false;
      fieldStarted = false;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') {
        raw += text[index + 1];
        index += 1;
      }
      cells.push(field);
      records.push({
        sourceRowNumber: rowNumber,
        cells,
        rawRecord: raw.replace(/\r\n$|\r$|\n$/, ''),
      });
      rowNumber += 1;
      cells = [];
      field = '';
      raw = '';
      quotedField = false;
      fieldStarted = false;
      continue;
    }

    if (quotedField) {
      return {
        ok: false,
        error: importError(IMPORT_ERROR_CODES.MALFORMED_CSV, { sourceRowNumber: rowNumber }),
      };
    }

    field += char;
    fieldStarted = true;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: importError(IMPORT_ERROR_CODES.UNMATCHED_QUOTE, { sourceRowNumber: rowNumber }),
    };
  }

  if (field !== '' || cells.length > 0 || raw !== '') {
    cells.push(field);
    records.push({ sourceRowNumber: rowNumber, cells, rawRecord: raw });
  }

  return { ok: true, records };
}

function validateHeaders(rawHeaders) {
  const headers = [];
  const seen = new Set();
  const errors = [];

  rawHeaders.forEach((header, index) => {
    const canonical = canonicalizeHeader(header);
    if (!canonical) {
      errors.push(
        importError(IMPORT_ERROR_CODES.UNKNOWN_HEADER, {
          column: String(header || '').trim() || `Column ${index + 1}`,
        })
      );
      return;
    }
    if (seen.has(canonical)) {
      errors.push(importError(IMPORT_ERROR_CODES.DUPLICATE_HEADER, { column: canonical }));
      return;
    }
    seen.add(canonical);
    headers.push(canonical);
  });

  TEMPLATE_HEADERS.forEach((header) => {
    if (!seen.has(header)) {
      errors.push(importError(IMPORT_ERROR_CODES.MISSING_HEADER, { column: header }));
    }
  });

  headers.forEach((header, index) => {
    if (TEMPLATE_HEADERS[index] !== header) {
      errors.push(importError(IMPORT_ERROR_CODES.INVALID_HEADER, { column: header }));
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, headers };
}

function parseInventoryImportCsv(input, options = {}) {
  const limits = { ...IMPORT_LIMITS, ...(options.limits || {}) };
  if (
    (Buffer.isBuffer(input) || input instanceof Uint8Array) &&
    input.byteLength > limits.maxFileBytes
  ) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.FILE_TOO_LARGE)] };
  }
  const normalized = normalizeInput(input);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };

  const text = normalized.text;
  if (Buffer.byteLength(text, 'utf8') > limits.maxFileBytes) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.FILE_TOO_LARGE)] };
  }
  if (text.includes('\u0000')) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.NUL_BYTE)] };
  }
  if (/[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.BINARY_CONTENT)] };
  }
  if (!text.replace(/^\uFEFF/, '').trim()) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.EMPTY_FILE)] };
  }

  const parsed = parseRecords(text);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };

  const meaningfulRecords = [...parsed.records];
  while (
    meaningfulRecords.length > 1 &&
    isBlankRecord(meaningfulRecords[meaningfulRecords.length - 1].cells)
  ) {
    meaningfulRecords.pop();
  }
  if (!meaningfulRecords.length || isBlankRecord(meaningfulRecords[0].cells)) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.EMPTY_FILE)] };
  }

  const headerResult = validateHeaders(meaningfulRecords[0].cells);
  if (!headerResult.ok) return { ok: false, errors: headerResult.errors };

  const dataRecords = meaningfulRecords.slice(1);
  if (dataRecords.length > limits.maxRows) {
    return { ok: false, errors: [importError(IMPORT_ERROR_CODES.TOO_MANY_ROWS)] };
  }

  const errors = [];
  const sourceRows = [];
  dataRecords.forEach((record) => {
    if (record.cells.length !== headerResult.headers.length) {
      errors.push(
        importError(IMPORT_ERROR_CODES.COLUMN_COUNT_MISMATCH, {
          sourceRowNumber: record.sourceRowNumber,
        })
      );
      return;
    }
    const cells = {};
    headerResult.headers.forEach((header, index) => {
      cells[HEADER_TO_FIELD[header]] = record.cells[index];
    });
    sourceRows.push({
      sourceRowNumber: record.sourceRowNumber,
      cells,
      rawRecord: record.rawRecord,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, headers: headerResult.headers, sourceRows, warnings: [] };
}

module.exports = {
  parseInventoryImportCsv,
};
