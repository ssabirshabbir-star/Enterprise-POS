const BARCODE_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: 'barcode.access_denied',
  AUTHENTICATION_REQUIRED: 'barcode.authentication_required',
  DUPLICATE_LIFECYCLE_EVENT: 'barcode.duplicate_lifecycle_event',
  ENCODING_FAILED: 'barcode.encoding_failed',
  INVALID_BARCODE: 'barcode.invalid_value',
  INVALID_BATCH: 'barcode.invalid_batch',
  INVALID_COPIES: 'barcode.invalid_copies',
  INVALID_DPI: 'barcode.invalid_dpi',
  INVALID_EXECUTION: 'barcode.invalid_execution',
  INVALID_FORMAT: 'barcode.invalid_format',
  INVALID_JOB: 'barcode.invalid_job',
  INVALID_LABEL_SIZE: 'barcode.invalid_label_size',
  INVALID_LAYOUT: 'barcode.invalid_layout',
  INVALID_LIFECYCLE: 'barcode.invalid_lifecycle',
  INVALID_MARGIN: 'barcode.invalid_margin',
  INVALID_ORIENTATION: 'barcode.invalid_orientation',
  INVALID_PRINTER: 'barcode.invalid_printer',
  INVALID_PREVIEW: 'barcode.invalid_preview',
  INVALID_PRODUCT: 'barcode.invalid_product',
  INVALID_REQUEST: 'barcode.invalid_request',
  INVALID_TRANSITION: 'barcode.invalid_transition',
  INVALID_ADAPTER_RESULT: 'barcode.invalid_adapter_result',
  PRODUCT_NOT_PRINTABLE: 'barcode.product_not_printable',
  RENDER_FAILED: 'barcode.render_failed',
  STALE_PRODUCT: 'barcode.stale_product',
});

class BarcodeDomainError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'BarcodeDomainError';
    this.code = code;
    this.field = field;
  }

  toResult() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        field: this.field,
      },
    };
  }
}

function errorResult(error) {
  if (error instanceof BarcodeDomainError) return error.toResult();
  return {
    ok: false,
    error: {
      code: BARCODE_ERROR_CODES.INVALID_REQUEST,
      message: 'Barcode request could not be validated.',
      field: null,
    },
  };
}

module.exports = {
  BARCODE_ERROR_CODES,
  BarcodeDomainError,
  errorResult,
};
