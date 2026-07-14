(function InventoryApiModule() {
  'use strict';

  function unavailable(message) {
    return { ok: false, locked: true, message };
  }

  function normalizeResult(result, fallbackMessage) {
    if (!result) return { ok: false, message: fallbackMessage };
    return result;
  }

  async function loadInventory(filters = {}) {
    return normalizeResult(
      await window.posApi.inventory.list(filters),
      'Failed to load inventory.'
    );
  }

  async function loadMovements(filters = {}) {
    return normalizeResult(
      await window.posApi.inventory.movements(filters),
      'Failed to load inventory movements.'
    );
  }

  async function adjustStock(payload = {}) {
    return normalizeResult(await window.posApi.inventory.adjust(payload), 'Adjustment failed.');
  }

  async function updateProductImage(payload = {}) {
    return normalizeResult(
      await window.posApi.inventory.updateImage(payload),
      'Product image update failed.'
    );
  }

  async function exportCsv(filters = {}) {
    return normalizeResult(await window.posApi.inventory.exportCsv(filters), 'CSV export failed.');
  }

  async function requestImportPreview() {
    return normalizeResult(
      await window.posApi.inventory.requestImportPreview(),
      'Inventory import preview failed.'
    );
  }

  async function getImportPreviewSession(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.getImportPreviewSession(sessionId),
      'Inventory import preview is unavailable.'
    );
  }

  async function analyzeImportPreview(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.analyzeImportPreview(sessionId),
      'Inventory import matching failed.'
    );
  }

  async function getMatchedImportPreviewSession(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.getMatchedImportPreviewSession(sessionId),
      'Inventory import matched preview is unavailable.'
    );
  }

  async function createImportCommitPlan(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.createImportCommitPlan(sessionId),
      'Inventory import commit plan failed.'
    );
  }

  async function getImportCommitPlanSession(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.getImportCommitPlanSession(sessionId),
      'Inventory import commit plan is unavailable.'
    );
  }

  async function createImportExecutionPreflight(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.createImportExecutionPreflight(sessionId),
      'Inventory import execution preflight failed.'
    );
  }

  async function getImportExecutionPreflightSession(sessionId) {
    return normalizeResult(
      await window.posApi.inventory.getImportExecutionPreflightSession(sessionId),
      'Inventory import execution preflight is unavailable.'
    );
  }

  async function executeCertifiedImport(payload) {
    return normalizeResult(
      await window.posApi.inventory.executeCertifiedImport(payload),
      'Inventory import execution failed.'
    );
  }

  function placeholder(action) {
    const messages = {
      bulk: 'Inventory bulk actions are coming soon. They are not implemented yet.',
      transfer: 'Stock transfer is coming soon. It is not implemented yet.',
      barcode: 'Inventory barcode printing is coming soon. It is not implemented yet.',
      import: 'Inventory import is coming soon. It is not implemented yet.',
      export: 'Inventory export is coming soon. It is not implemented yet.',
      movements: 'Movement history is coming soon. It is not implemented yet.',
    };
    return unavailable(messages[action] || 'This inventory action is not available yet.');
  }

  window.InventoryApi = {
    loadInventory,
    loadMovements,
    adjustStock,
    analyzeImportPreview,
    createImportCommitPlan,
    createImportExecutionPreflight,
    executeCertifiedImport,
    exportCsv,
    getImportExecutionPreflightSession,
    getImportCommitPlanSession,
    getMatchedImportPreviewSession,
    getImportPreviewSession,
    requestImportPreview,
    updateProductImage,
    placeholder,
  };
})();
