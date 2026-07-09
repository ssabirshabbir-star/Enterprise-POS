const { validateLabelLayoutModel } = require('./label-layout.engine');
const { validatePrintJobModel } = require('./print-job.model');

function previewItem(job, placement) {
  const item = job.items[placement.itemIndex];
  return Object.freeze({
    placement,
    label: Object.freeze({
      product: item.document.product,
      barcode: item.document.barcode,
      priceDisplay: item.document.priceDisplay,
      text: item.document.text,
    }),
  });
}

function createPreviewDocument(job, layout) {
  const validatedJob = validatePrintJobModel(job);
  const validatedLayout = validateLabelLayoutModel(validatedJob, layout);
  const pages = validatedLayout.pages.map((page) =>
    Object.freeze({
      pageIndex: page.pageIndex,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      items: Object.freeze(
        page.placements.map((placement) => previewItem(validatedJob, placement))
      ),
    })
  );

  return Object.freeze({
    kind: 'barcode_preview_document',
    schemaVersion: 1,
    immutable: true,
    representation: 'plain_data',
    executable: false,
    jobId: validatedJob.jobId,
    printer: validatedJob.printer,
    pageCount: pages.length,
    itemCount: validatedJob.totalOutputLabels,
    pages: Object.freeze(pages),
  });
}

module.exports = {
  createPreviewDocument,
};
