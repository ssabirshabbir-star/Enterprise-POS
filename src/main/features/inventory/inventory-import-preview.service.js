const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const { canAdjustInventory } = require('./inventory.permissions');
const { canWriteProducts } = require('../products/product.permissions');
const { IMPORT_LIMITS, TEMPLATE_VERSION } = require('./inventory-import-template.contract');
const { parseInventoryImportCsv } = require('./inventory-import-csv.parser');
const { validateInventoryImportRows } = require('./inventory-import.validation');
const {
  createImportPreviewDocument,
  createImportPreviewSession,
  validateImportPreviewSession,
} = require('./inventory-import-preview-session.model');
const { logError } = require('../../utils/safe-logger');

const PREVIEW_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEW_SESSIONS = 25;
const BOUNDED_READ_CHUNK_BYTES = 64 * 1024;

class InventoryImportFileTooLargeError extends Error {
  constructor() {
    super('Inventory import CSV exceeds the configured file size limit.');
    this.name = 'InventoryImportFileTooLargeError';
    this.code = 'INVENTORY_IMPORT_FILE_TOO_LARGE';
  }
}

function safeBasename(filePath) {
  return path.basename(String(filePath || 'inventory-import.csv'));
}

function csvExtensionIsValid(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.csv';
}

async function safeActivityLog(activity, entry) {
  try {
    await activity.createActivityLog(entry);
  } catch (error) {
    logError('Inventory import preview activity log error:', error);
  }
}

async function readBoundedFile(fileSystem, filePath, maxBytes) {
  const handle = await fileSystem.open(filePath, 'r');
  const chunks = [];
  let totalBytes = 0;

  try {
    while (totalBytes <= maxBytes) {
      const remainingAllowed = maxBytes + 1 - totalBytes;
      const chunkSize = Math.min(BOUNDED_READ_CHUNK_BYTES, remainingAllowed);
      const chunk = Buffer.alloc(chunkSize);
      const result = await handle.read(chunk, 0, chunk.length, null);
      const bytesRead = Number(result?.bytesRead || 0);
      if (bytesRead <= 0) break;

      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw new InventoryImportFileTooLargeError();
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }

    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

function summarizeRows(rows) {
  const summary = {
    totalRows: rows.length,
    emptyRows: 0,
    structurallyInvalidRows: 0,
    duplicateRows: 0,
    stockCandidateRows: 0,
    productOnlyCandidateRows: 0,
    structurallyValidRows: 0,
    errorRows: 0,
    warningRows: 0,
    errorCount: 0,
    warningCount: 0,
  };
  rows.forEach((row) => {
    if (row.status === 'EMPTY_ROW') summary.emptyRows += 1;
    if (row.status === 'STRUCTURALLY_INVALID') summary.structurallyInvalidRows += 1;
    if (row.status === 'DUPLICATE_IN_FILE') summary.duplicateRows += 1;
    if (row.status === 'STOCK_ROW_CANDIDATE') summary.stockCandidateRows += 1;
    if (row.status === 'PRODUCT_ONLY_CANDIDATE') summary.productOnlyCandidateRows += 1;
    if (row.status === 'STRUCTURALLY_VALID') summary.structurallyValidRows += 1;
    if (row.errors.length) summary.errorRows += 1;
    if (row.warnings.length) summary.warningRows += 1;
    summary.errorCount += row.errors.length;
    summary.warningCount += row.warnings.length;
  });
  return summary;
}

function serializeRows(rows) {
  return rows.map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    status: row.status,
    normalized: row.normalized,
    errors: row.errors,
    warnings: row.warnings,
  }));
}

function createInventoryImportPreviewService(dependencies = {}) {
  const auth = dependencies.authService || authService;
  const activity = dependencies.activityRepository || activityRepository;
  const fileSystem = dependencies.fs || fs;
  const sessions = dependencies.previewSessions || new Map();
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
  const ttlMs = Number.isFinite(dependencies.previewSessionTtlMs)
    ? Math.max(1000, Math.trunc(dependencies.previewSessionTtlMs))
    : PREVIEW_SESSION_TTL_MS;
  const maxSessions = Number.isFinite(dependencies.maxPreviewSessions)
    ? Math.max(1, Math.trunc(dependencies.maxPreviewSessions))
    : MAX_PREVIEW_SESSIONS;

  async function requirePreviewAccess() {
    const profileResult = await auth.getProfile();
    if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
    const profile = profileResult.profile || {};
    if (!canAdjustInventory(profile.role)) {
      return {
        ok: false,
        message: 'You do not have permission to preview inventory imports.',
      };
    }
    return {
      ok: true,
      profile,
      permissions: {
        canPreviewImport: true,
        canCreateProducts: canWriteProducts(profile.role),
        canCommitStock: canAdjustInventory(profile.role),
      },
    };
  }

  function cleanupExpiredPreviewSessions(referenceTime = now()) {
    for (const [sessionId, entry] of sessions.entries()) {
      if (!entry || Number(entry.expiresAt) <= referenceTime) {
        sessions.delete(sessionId);
      }
    }
  }

  function ensureCapacity() {
    if (sessions.size < maxSessions) return;
    let oldestSessionId = null;
    let oldestCreatedAt = Infinity;
    for (const [sessionId, entry] of sessions.entries()) {
      if (Number(entry?.createdAt) < oldestCreatedAt) {
        oldestSessionId = sessionId;
        oldestCreatedAt = Number(entry.createdAt);
      }
    }
    if (oldestSessionId) {
      sessions.delete(oldestSessionId);
      return;
    }
    throw new Error('Inventory import preview capacity is temporarily full.');
  }

  function storePreviewSession(session) {
    cleanupExpiredPreviewSessions();
    const validSession = validateImportPreviewSession(session);
    if (sessions.has(validSession.sessionId)) {
      throw new Error('Inventory import preview session identifier is already active.');
    }
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry?.ownerUserId === validSession.ownerUserId) {
        sessions.delete(sessionId);
      }
    }
    ensureCapacity();
    sessions.set(validSession.sessionId, {
      session: validSession,
      ownerUserId: validSession.ownerUserId,
      createdAt: validSession.createdAt,
      expiresAt: validSession.expiresAt,
    });
  }

  function publicSession(session) {
    return {
      kind: session.kind,
      sessionId: session.sessionId,
      previewId: session.previewId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      executable: false,
      rendererAuthoritative: false,
      databaseWrite: false,
    };
  }

  async function requestImportPreview({ filePath } = {}) {
    const access = await requirePreviewAccess();
    const selectedPath = String(filePath || '').trim();
    const fileName = safeBasename(selectedPath);

    if (!access.ok) {
      return { ok: false, canceled: false, message: access.message };
    }
    if (!selectedPath) {
      return { ok: false, canceled: false, message: 'Import CSV file is required.' };
    }
    if (!csvExtensionIsValid(selectedPath)) {
      await safeActivityLog(activity, {
        userId: access.profile.id,
        action: 'inventory.import.preview.failed',
        status: 'failed',
        message: 'Inventory import preview rejected non-CSV file',
        metadata: { fileName, reason: 'invalid_extension' },
      });
      return {
        ok: false,
        canceled: false,
        message: 'Select a CSV file generated from the official template.',
      };
    }

    try {
      const stat = await fileSystem.stat(selectedPath);
      if (!stat.isFile()) {
        return { ok: false, canceled: false, message: 'Select a readable CSV file.' };
      }
      if (stat.size > IMPORT_LIMITS.maxFileBytes) {
        return {
          ok: false,
          canceled: false,
          message: 'The selected CSV file is larger than the import limit.',
        };
      }

      const buffer = await readBoundedFile(fileSystem, selectedPath, IMPORT_LIMITS.maxFileBytes);
      const parsed = parseInventoryImportCsv(buffer);
      if (!parsed.ok) {
        await safeActivityLog(activity, {
          userId: access.profile.id,
          action: 'inventory.import.preview.failed',
          status: 'failed',
          message: 'Inventory import preview CSV parsing failed',
          metadata: { fileName, reason: parsed.errors[0]?.code || 'parse_failed' },
        });
        return {
          ok: false,
          canceled: false,
          status: 'invalid_file',
          message: 'The selected CSV file could not be parsed.',
          errors: parsed.errors,
        };
      }

      const validation = validateInventoryImportRows(parsed.sourceRows);
      const rows = serializeRows(validation.rows);
      const summary = summarizeRows(validation.rows);
      const createdAt = now();
      const preview = createImportPreviewDocument({
        previewId: `inventory-import-preview-document-${randomUUID()}`,
        createdAt: new Date(createdAt).toISOString(),
        templateVersion: TEMPLATE_VERSION,
        sourceFile: {
          fileName,
          sizeBytes: stat.size,
          lastModifiedMs: Number(stat.mtimeMs || 0),
        },
        permissions: access.permissions,
        summary: {
          ...summary,
          canCommit: false,
          databaseMatched: false,
        },
        rows,
        errors: validation.errors,
        warnings: validation.warnings,
      });
      const session = createImportPreviewSession({
        sessionId: `inventory-import-preview-${randomUUID()}`,
        ownerUserId: access.profile.id,
        createdAt,
        expiresAt: createdAt + ttlMs,
        preview,
      });
      storePreviewSession(session);
      await safeActivityLog(activity, {
        userId: access.profile.id,
        action: 'inventory.import.preview.created',
        status: validation.ok ? 'success' : 'warning',
        message: 'Inventory import preview created',
        metadata: {
          fileName,
          totalRows: summary.totalRows,
          errorRows: summary.errorRows,
          warningRows: summary.warningRows,
          sessionId: session.sessionId,
        },
      });
      return {
        ok: true,
        canceled: false,
        preview,
        previewSession: publicSession(session),
        message: validation.ok
          ? 'Inventory import preview is ready.'
          : 'Inventory import preview contains rows that need correction.',
      };
    } catch (error) {
      logError('Inventory import preview failed:', error);
      await safeActivityLog(activity, {
        userId: access.profile.id,
        action: 'inventory.import.preview.failed',
        status: 'failed',
        message: 'Inventory import preview failed',
        metadata: { fileName, reason: error.code || error.name || 'preview_failed' },
      });
      if (error?.code === 'INVENTORY_IMPORT_FILE_TOO_LARGE') {
        return {
          ok: false,
          canceled: false,
          message: 'The selected CSV file is larger than the import limit.',
        };
      }
      return {
        ok: false,
        canceled: false,
        message: 'Inventory import preview failed. Please try again.',
      };
    }
  }

  async function getImportPreviewSession({ sessionId } = {}) {
    const access = await requirePreviewAccess();
    if (!access.ok) return { ok: false, message: access.message };
    cleanupExpiredPreviewSessions();
    const entry = sessions.get(String(sessionId || '').trim());
    if (!entry || Number(entry.expiresAt) <= now()) {
      if (entry) sessions.delete(entry.session.sessionId);
      return {
        ok: false,
        stale: true,
        message: 'Inventory import preview expired or is no longer available.',
      };
    }
    if (entry.ownerUserId !== Number(access.profile.id)) {
      return {
        ok: false,
        stale: true,
        message: 'Inventory import preview expired or is no longer available.',
      };
    }
    return {
      ok: true,
      preview: entry.session.preview,
      previewSession: publicSession(entry.session),
    };
  }

  return Object.freeze({
    getImportPreviewSession,
    requestImportPreview,
    _cleanupExpiredPreviewSessions: cleanupExpiredPreviewSessions,
  });
}

const defaultService = createInventoryImportPreviewService();

module.exports = {
  createInventoryImportPreviewService,
  getImportPreviewSession: defaultService.getImportPreviewSession,
  requestImportPreview: defaultService.requestImportPreview,
};
