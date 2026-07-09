const { isDeepStrictEqual } = require('node:util');
const { ORIENTATIONS, PRINTER_TARGET_KINDS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validatePrintJobModel } = require('./print-job.model');

const A4 = Object.freeze({
  widthMm: 210,
  heightMm: 297,
});

function roundMm(value) {
  return Number(value.toFixed(2));
}

function mmToPx(value, dpi) {
  return Math.round((value * dpi) / 25.4);
}

function pixelBounds(xMm, yMm, widthMm, heightMm, dpi) {
  return Object.freeze({
    x: mmToPx(xMm, dpi),
    y: mmToPx(yMm, dpi),
    width: mmToPx(widthMm, dpi),
    height: mmToPx(heightMm, dpi),
  });
}

function placement(itemIndex, copyIndex, productId, bounds, dpi) {
  return Object.freeze({
    itemIndex,
    copyIndex,
    productId,
    boundsMm: Object.freeze(bounds),
    boundsPx: pixelBounds(bounds.xMm, bounds.yMm, bounds.widthMm, bounds.heightMm, dpi),
  });
}

function expandedItems(job) {
  const output = [];
  for (const item of job.items) {
    for (let copyIndex = 0; copyIndex < item.copies; copyIndex += 1) {
      output.push({ item, copyIndex });
    }
  }
  return output;
}

function labelPageLayout(job) {
  const pages = expandedItems(job).map(({ item, copyIndex }, pageIndex) => {
    const { widthMm, heightMm } = item.document.page;
    const bounds = { xMm: 0, yMm: 0, widthMm, heightMm };
    return Object.freeze({
      pageIndex,
      widthMm,
      heightMm,
      widthPx: mmToPx(widthMm, job.printer.dpi),
      heightPx: mmToPx(heightMm, job.printer.dpi),
      placements: Object.freeze([
        placement(item.itemIndex, copyIndex, item.document.product.id, bounds, job.printer.dpi),
      ]),
    });
  });
  return Object.freeze(pages);
}

function a4PageSize(orientation) {
  return orientation === ORIENTATIONS.LANDSCAPE
    ? { widthMm: A4.heightMm, heightMm: A4.widthMm }
    : A4;
}

function assertInsidePage(bounds, page, margins) {
  const epsilon = 0.001;
  if (
    bounds.xMm < margins.left - epsilon ||
    bounds.yMm < margins.top - epsilon ||
    bounds.xMm + bounds.widthMm > page.widthMm - margins.right + epsilon ||
    bounds.yMm + bounds.heightMm > page.heightMm - margins.bottom + epsilon
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LAYOUT,
      'Label placement exceeds the printable A4 boundary.',
      'layout'
    );
  }
}

function a4SheetLayout(job) {
  const page = a4PageSize(job.printer.orientation);
  const margins = job.printer.sheetMargins;
  const gap = job.printer.gapMm;
  const first = job.items[0].document.page;
  const usableWidth = page.widthMm - margins.left - margins.right;
  const usableHeight = page.heightMm - margins.top - margins.bottom;
  const columns = Math.floor((usableWidth + gap) / (first.widthMm + gap));
  const rows = Math.floor((usableHeight + gap) / (first.heightMm + gap));
  const capacity = columns * rows;
  if (capacity < 1) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LAYOUT,
      'Selected label size does not fit the A4 printable area.',
      'layout'
    );
  }

  const outputs = expandedItems(job);
  const pageCount = Math.ceil(outputs.length / capacity);
  const pages = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const placements = [];
    const start = pageIndex * capacity;
    const end = Math.min(start + capacity, outputs.length);
    for (let outputIndex = start; outputIndex < end; outputIndex += 1) {
      const slot = outputIndex - start;
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const bounds = {
        xMm: roundMm(margins.left + column * (first.widthMm + gap)),
        yMm: roundMm(margins.top + row * (first.heightMm + gap)),
        widthMm: first.widthMm,
        heightMm: first.heightMm,
      };
      assertInsidePage(bounds, page, margins);
      const { item, copyIndex } = outputs[outputIndex];
      placements.push(
        placement(item.itemIndex, copyIndex, item.document.product.id, bounds, job.printer.dpi)
      );
    }
    pages.push(
      Object.freeze({
        pageIndex,
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        widthPx: mmToPx(page.widthMm, job.printer.dpi),
        heightPx: mmToPx(page.heightMm, job.printer.dpi),
        grid: Object.freeze({ columns, rows, capacity, gapMm: gap }),
        placements: Object.freeze(placements),
      })
    );
  }
  return Object.freeze(pages);
}

function createLabelLayout(job) {
  const validatedJob = validatePrintJobModel(job);
  const pages =
    validatedJob.printer.kind === PRINTER_TARGET_KINDS.A4_SHEET
      ? a4SheetLayout(validatedJob)
      : labelPageLayout(validatedJob);

  return Object.freeze({
    kind: 'barcode_print_layout',
    schemaVersion: 1,
    immutable: true,
    units: Object.freeze({ physical: 'mm', device: 'px' }),
    jobId: validatedJob.jobId,
    printer: validatedJob.printer,
    labelSizeId: validatedJob.labelSizeId,
    pageCount: pages.length,
    placementCount: validatedJob.totalOutputLabels,
    pages,
  });
}

function validateLabelLayoutModel(job, layout) {
  const validatedJob = validatePrintJobModel(job);
  if (
    !layout ||
    layout.kind !== 'barcode_print_layout' ||
    layout.schemaVersion !== 1 ||
    layout.immutable !== true ||
    !Object.isFrozen(layout)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LAYOUT,
      'An immutable barcode label layout is required.',
      'layout'
    );
  }
  const rebuilt = createLabelLayout(validatedJob);
  if (!isDeepStrictEqual(layout, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LAYOUT,
      'Barcode label layout failed deterministic validation.',
      'layout'
    );
  }
  return rebuilt;
}

module.exports = {
  createLabelLayout,
  validateLabelLayoutModel,
};
