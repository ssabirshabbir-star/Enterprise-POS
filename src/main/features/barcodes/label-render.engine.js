const { BARCODE_FORMATS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createBarcodeLabel } = require('./barcode-label.model');
const { encodeBarcode } = require('./barcode.encoder');

function roundMm(value) {
  return Number(value.toFixed(2));
}

function contentBounds(label) {
  const widthMm = label.labelSize.widthMm - label.margins.left - label.margins.right;
  const heightMm = label.labelSize.heightMm - label.margins.top - label.margins.bottom;
  if (widthMm <= 0 || heightMm <= 0) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.RENDER_FAILED,
      'Label margins leave no renderable area.',
      'margins'
    );
  }
  return Object.freeze({
    xMm: label.margins.left,
    yMm: label.margins.top,
    widthMm: roundMm(widthMm),
    heightMm: roundMm(heightMm),
  });
}

function textLine(role, value) {
  return Object.freeze({
    role,
    value: String(value),
    representation: 'plain_text',
  });
}

function renderText(label) {
  const lines = [textLine('product_name', label.product.name)];
  if (label.product.sku) lines.push(textLine('sku', label.product.sku));
  if (label.barcode.humanReadable) lines.push(textLine('barcode_value', label.barcode.value));
  if (label.priceDisplay) {
    lines.push(
      textLine('price', `${label.product.currency} ${label.product.salePrice.toFixed(2)}`)
    );
  }
  return Object.freeze(lines);
}

function symbolBounds(label, content, textLines) {
  const textHeightMm = textLines.length * 3.2;
  const gapMm = textLines.length ? 1 : 0;
  const availableHeight = roundMm(content.heightMm - textHeightMm - gapMm);
  if (availableHeight < 6) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.RENDER_FAILED,
      'Label is too small for the selected text content.',
      'labelSize'
    );
  }

  const squareSize = Math.min(content.widthMm, availableHeight);
  const widthMm = label.barcode.format === BARCODE_FORMATS.QRCODE ? squareSize : content.widthMm;
  return Object.freeze({
    xMm: roundMm(content.xMm + (content.widthMm - widthMm) / 2),
    yMm: content.yMm,
    widthMm: roundMm(widthMm),
    heightMm: availableHeight,
  });
}

function createLabelRenderDocument(input = {}) {
  const label = createBarcodeLabel(input);
  const encoded = encodeBarcode(label.barcode);
  const content = contentBounds(label);
  const text = renderText(label);
  const symbol = symbolBounds(label, content, text);

  return Object.freeze({
    kind: 'barcode_label_render_document',
    schemaVersion: 1,
    immutable: true,
    units: 'mm',
    page: Object.freeze({
      widthMm: label.labelSize.widthMm,
      heightMm: label.labelSize.heightMm,
      orientation: label.orientation,
      margins: label.margins,
      content,
    }),
    printer: label.printer,
    copies: label.copies,
    barcode: Object.freeze({
      format: label.barcode.format,
      value: label.barcode.value,
      humanReadable: label.barcode.humanReadable,
      bounds: symbol,
      encoded,
    }),
    product: label.product,
    priceDisplay: label.priceDisplay,
    text,
  });
}

module.exports = {
  createLabelRenderDocument,
};
