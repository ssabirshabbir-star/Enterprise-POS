const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { freezePlainData } = require('./immutable');
const { validateIdentifier, validateOptionalText } = require('./model-validation');
const { validatePreviewWindowContract } = require('./preview-window.contract');

const PREVIEW_WINDOW_MANAGER_STATES = Object.freeze({
  REGISTERED: 'registered',
  CLOSED: 'closed',
});

const DEFAULT_MAX_WINDOWS = 25;

function createPreviewWindowManager(options = {}) {
  const records = new Map();
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const maxWindows =
    Number.isInteger(options.maxWindows) && options.maxWindows > 0
      ? options.maxWindows
      : DEFAULT_MAX_WINDOWS;

  function register(previewWindowContract, metadata = {}) {
    const contract = validatePreviewWindowContract(previewWindowContract);
    if (records.has(contract.previewWindowId)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
        'Barcode preview window is already registered.',
        'previewWindowId'
      );
    }

    if (openRecordCount() >= maxWindows) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
        'Barcode preview window registry limit has been reached.',
        'previewWindow'
      );
    }

    const record = createRecord({
      contract,
      metadata,
      registeredAt: now(),
      state: PREVIEW_WINDOW_MANAGER_STATES.REGISTERED,
    });
    records.set(contract.previewWindowId, record);
    return record;
  }

  function get(previewWindowId) {
    const id = validateIdentifier(
      previewWindowId,
      'previewWindowId',
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW
    );
    return records.get(id) || null;
  }

  function list(input = {}) {
    const includeClosed = input.includeClosed === true;
    return Object.freeze(
      Array.from(records.values()).filter(
        (record) => includeClosed || record.state === PREVIEW_WINDOW_MANAGER_STATES.REGISTERED
      )
    );
  }

  function close(previewWindowId, reason = null) {
    const current = get(previewWindowId);
    if (!current) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
        'Barcode preview window is not registered.',
        'previewWindowId'
      );
    }
    if (current.state === PREVIEW_WINDOW_MANAGER_STATES.CLOSED) return current;

    const record = createRecord({
      contract: current.contract,
      metadata: current.metadata,
      registeredAt: current.registeredAt,
      state: PREVIEW_WINDOW_MANAGER_STATES.CLOSED,
      closedAt: now(),
      closeReason: validateOptionalText(
        reason,
        'closeReason',
        160,
        BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW
      ),
    });
    records.set(current.previewWindowId, record);
    return record;
  }

  function cleanupClosed() {
    let removedCount = 0;
    for (const [id, record] of records.entries()) {
      if (record.state === PREVIEW_WINDOW_MANAGER_STATES.CLOSED) {
        records.delete(id);
        removedCount += 1;
      }
    }
    return Object.freeze({
      kind: 'barcode_preview_window_cleanup_result',
      schemaVersion: 1,
      immutable: true,
      removedCount,
      remainingCount: records.size,
    });
  }

  function openRecordCount() {
    return Array.from(records.values()).filter(
      (record) => record.state === PREVIEW_WINDOW_MANAGER_STATES.REGISTERED
    ).length;
  }

  return Object.freeze({
    cleanupClosed,
    close,
    get,
    list,
    register,
  });
}

function createRecord(input) {
  const contract = assertNoExecutableSurface(validatePreviewWindowContract(input.contract));
  const metadata = freezePlainData(input.metadata || {}, 'previewWindowMetadata');
  const registeredAt = validateOptionalText(
    input.registeredAt,
    'registeredAt',
    40,
    BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW
  );
  const closedAt = validateOptionalText(
    input.closedAt,
    'closedAt',
    40,
    BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW
  );
  return Object.freeze({
    kind: 'barcode_preview_window_manager_record',
    schemaVersion: 1,
    immutable: true,
    previewWindowId: contract.previewWindowId,
    jobId: contract.jobId,
    requestId: contract.requestId,
    state: validateManagerState(input.state),
    contract,
    metadata,
    registeredAt,
    closedAt,
    closeReason: input.closeReason || null,
    executable: false,
    electronPreview: false,
    rendererDispatch: false,
    filesystemOutput: false,
    osPrint: false,
  });
}

function assertNoExecutableSurface(contract) {
  const seen = new Set();

  function visit(value) {
    if (value === null || value === undefined) return;
    if (typeof value === 'function') {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
        'Barcode preview window records must not contain executable values.',
        'previewWindow'
      );
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else {
      Object.values(value).forEach(visit);
    }
    seen.delete(value);
  }

  visit(contract);
  return contract;
}

function validateManagerState(state) {
  if (!Object.values(PREVIEW_WINDOW_MANAGER_STATES).includes(state)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'Barcode preview window state is invalid.',
      'state'
    );
  }
  return state;
}

module.exports = {
  PREVIEW_WINDOW_MANAGER_STATES,
  createPreviewWindowManager,
};
