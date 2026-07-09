const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validatePrintJobModel } = require('./print-job.model');
const { validateBarcodeValue } = require('./barcode.validation');

function sameMoney(left, right) {
  return Number(left).toFixed(2) === Number(right).toFixed(2);
}

async function validateAuthoritativeProducts(job, findProductById) {
  const validatedJob = validatePrintJobModel(job);
  if (typeof findProductById !== 'function') {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_REQUEST,
      'Authoritative product lookup is unavailable.',
      'products'
    );
  }

  const products = [];
  for (const item of validatedJob.items) {
    const snapshot = item.document.product;
    const authoritative = await findProductById(snapshot.id);
    if (!authoritative) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PRODUCT,
        'Product no longer exists.',
        `products.${snapshot.id}`
      );
    }
    if (!authoritative.isActive || !String(authoritative.barcode || '').trim()) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.PRODUCT_NOT_PRINTABLE,
        'Product is inactive or has no printable barcode.',
        `products.${snapshot.id}`
      );
    }

    const barcode = String(authoritative.barcode).trim();
    if (
      barcode !== snapshot.barcode ||
      barcode !== item.document.barcode.value ||
      authoritative.name !== snapshot.name ||
      String(authoritative.sku || '') !== String(snapshot.sku || '') ||
      !sameMoney(authoritative.salePrice, snapshot.salePrice) ||
      snapshot.currency !== 'PKR'
    ) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.STALE_PRODUCT,
        'Product label data changed after the print job was created.',
        `products.${snapshot.id}`
      );
    }

    validateBarcodeValue(item.document.barcode.format, barcode);
    products.push(
      Object.freeze({
        id: Number(authoritative.id),
        name: authoritative.name,
        sku: authoritative.sku || null,
        barcode,
        salePrice: Number(Number(authoritative.salePrice).toFixed(2)),
        isActive: true,
        printable: true,
        format: item.document.barcode.format,
      })
    );
  }
  return Object.freeze(products);
}

module.exports = {
  validateAuthoritativeProducts,
};
