const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');

function createResolvedPreviewLayout(preview, presentation = preview?.presentation) {
  validatePreviewDocumentShape(preview);
  const resolvedPresentation = normalizePresentation(presentation);
  const labels = flattenLabels(preview);
  const columns = resolvedPresentation.columns;
  const rows = labels.length ? Math.ceil(labels.length / columns) : 0;
  const page = createPage(labels, resolvedPresentation, columns, rows);

  return deepFreeze({
    kind: 'barcode_resolved_preview_layout',
    schemaVersion: 1,
    immutable: true,
    representation: 'plain_data',
    executable: false,
    units: Object.freeze({ physical: 'mm', device: 'px' }),
    sourceJobId: preview.jobId,
    pageCount: page.items.length ? 1 : 0,
    itemCount: labels.length,
    presentation: resolvedPresentation,
    pages: Object.freeze(page.items.length ? [page] : []),
  });
}

function validateResolvedPreviewLayout(layout) {
  if (
    !layout ||
    layout.kind !== 'barcode_resolved_preview_layout' ||
    layout.schemaVersion !== 1 ||
    layout.immutable !== true ||
    layout.executable !== false ||
    !Object.isFrozen(layout) ||
    !Array.isArray(layout.pages) ||
    !layout.presentation
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'An immutable resolved barcode preview layout is required.',
      'resolvedLayout'
    );
  }
  assertPlainData(layout, 'resolvedLayout');
  return layout;
}

function createPage(labels, presentation, columns, rows) {
  const widthMm = roundMm(
    presentation.marginMm.left +
      presentation.marginMm.right +
      columns * presentation.labelWidthMm +
      Math.max(0, columns - 1) * presentation.columnGapMm
  );
  const heightMm = roundMm(
    presentation.marginMm.top +
      presentation.marginMm.bottom +
      rows * presentation.labelHeightMm +
      Math.max(0, rows - 1) * presentation.rowGapMm
  );
  const items = labels.map((label, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const boundsMm = Object.freeze({
      xMm: roundMm(
        presentation.marginMm.left + column * (presentation.labelWidthMm + presentation.columnGapMm)
      ),
      yMm: roundMm(
        presentation.marginMm.top + row * (presentation.labelHeightMm + presentation.rowGapMm)
      ),
      widthMm: presentation.labelWidthMm,
      heightMm: presentation.labelHeightMm,
    });
    return Object.freeze({
      index,
      row,
      column,
      placement: Object.freeze({
        row,
        column,
        boundsMm,
      }),
      label,
    });
  });

  return Object.freeze({
    pageIndex: 0,
    widthMm,
    heightMm,
    rows,
    columns,
    items: Object.freeze(items),
  });
}

function normalizePresentation(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const gapMm = boundedNumber(source.gap ?? source.columnGapMm, 6, 0, 20);
  const margin = boundedNumber(source.printMargin, 8, 0, 20);
  return Object.freeze({
    columns: boundedNumber(source.columns, 3, 1, 5),
    rowGapMm: gapMm,
    columnGapMm: gapMm,
    labelWidthMm: boundedNumber(source.labelWidth ?? source.labelWidthMm, 64, 30, 100),
    labelHeightMm: boundedNumber(source.labelHeight ?? source.labelHeightMm, 34, 18, 60),
    marginMm: Object.freeze({
      top: margin,
      right: margin,
      bottom: margin,
      left: margin,
    }),
    showTitle: source.showTitle !== false,
    showSku: source.showSku !== false,
    showPrice: source.showPrice === true,
    showBarcodeDigits: source.showBarcodeDigits !== false,
    showPacking: source.showPacking === true,
    showExpiry: source.showExpiry === true,
    labelTitle: safeText(source.labelTitle, 120),
    packingDate: safeText(source.packingDate, 32),
    expiryDate: safeText(source.expiryDate, 32),
    titleSize: boundedNumber(source.titleSize, 11, 8, 20),
    metaSize: boundedNumber(source.metaSize, 9, 7, 16),
    barcodeHeightMm: boundedNumber(source.barcodeHeight ?? source.barcodeHeightMm, 8, 6, 30),
    border: source.border === false ? false : true,
  });
}

function flattenLabels(preview) {
  const labels = [];
  preview.pages.forEach((page) => {
    (Array.isArray(page.items) ? page.items : []).forEach((item) => {
      if (item?.label) labels.push(item.label);
    });
  });
  return labels;
}

function validatePreviewDocumentShape(preview) {
  if (
    !preview ||
    preview.kind !== 'barcode_preview_document' ||
    preview.schemaVersion !== 1 ||
    preview.immutable !== true ||
    preview.executable !== false ||
    typeof preview.jobId !== 'string' ||
    !Array.isArray(preview.pages)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'A valid barcode preview document is required.',
      'preview'
    );
  }
  assertPlainData(preview, 'preview');
}

function assertPlainData(value, field) {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview layout must contain plain data only.',
        field
      );
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) return;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview layout must contain plain data only.',
        field
      );
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    seen.delete(item);
  }

  visit(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, maxLength);
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function roundMm(value) {
  return Number(Number(value).toFixed(2));
}

module.exports = {
  createResolvedPreviewLayout,
  validateResolvedPreviewLayout,
};
