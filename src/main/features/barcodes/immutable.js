const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');

const MAX_DEPTH = 8;
const MAX_NODES = 1000;

function freezePlainData(value, field = 'value') {
  const seen = new Set();
  let nodeCount = 0;

  function visit(item, depth) {
    nodeCount += 1;
    if (nodeCount > MAX_NODES || depth > MAX_DEPTH) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_REQUEST,
        'Structured data exceeds the supported complexity.',
        field
      );
    }
    if (item === null || ['string', 'boolean'].includes(typeof item)) return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || seen.has(item)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_REQUEST,
        'Structured data contains an unsupported value.',
        field
      );
    }

    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      result = Object.freeze(item.map((entry) => visit(entry, depth + 1)));
    } else if (Object.getPrototypeOf(item) === Object.prototype) {
      result = Object.freeze(
        Object.fromEntries(
          Object.entries(item).map(([key, entry]) => [key, visit(entry, depth + 1)])
        )
      );
    } else {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_REQUEST,
        'Structured data must contain plain objects only.',
        field
      );
    }
    seen.delete(item);
    return result;
  }

  return visit(value, 0);
}

module.exports = {
  freezePlainData,
};
