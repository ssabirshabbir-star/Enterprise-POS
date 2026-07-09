const barcodes = require('../../src/main/features/barcodes');

function product(id = 1, overrides = {}) {
  return {
    id,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    barcode: `BARCODE-${id}`,
    salePrice: 10 + id,
    isActive: true,
    ...overrides,
  };
}

function renderDocument({
  authoritativeProduct = product(),
  copies = 1,
  format = 'CODE128',
  printerName = 'Thermal Test',
  printerType = 'thermal',
  labelSize = 'label_40x20',
} = {}) {
  return barcodes.createLabelRenderDocument({
    printer: { type: printerType, name: printerName },
    labelSize,
    copies,
    margins: { top: 1, right: 1, bottom: 1, left: 1 },
    orientation: 'portrait',
    format,
    value: authoritativeProduct.barcode,
    humanReadable: false,
    priceDisplay: false,
    product: {
      id: authoritativeProduct.id,
      name: authoritativeProduct.name,
      sku: authoritativeProduct.sku,
      barcode: authoritativeProduct.barcode,
      salePrice: authoritativeProduct.salePrice,
      currency: 'PKR',
    },
  });
}

function printJob({
  jobId = 'job-1',
  documents = [renderDocument()],
  printer = { kind: 'thermal_label', name: 'Thermal Test', dpi: 203 },
} = {}) {
  return barcodes.createPrintJob({ jobId, printer, documents });
}

function lifecycle({
  eventId,
  jobId = 'job-1',
  state,
  occurredAt,
  previousEventId,
  errorCode,
} = {}) {
  return barcodes.createPrintLifecycleEvent({
    eventId,
    jobId,
    state,
    occurredAt,
    previousEventId,
    errorCode,
  });
}

module.exports = {
  barcodes,
  lifecycle,
  printJob,
  product,
  renderDocument,
};
