(function SuppliersApiModule() {
  'use strict';

  const WHATSAPP_FEATURE_ID = 'suppliers.whatsapp_supplier_message';

  function unavailable(message) {
    return { ok: false, locked: true, message };
  }

  function normalizeResult(result, fallbackMessage) {
    if (!result) return { ok: false, message: fallbackMessage };
    return result;
  }

  function checkFeature(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  async function confirm(message) {
    return Boolean(await window.posApi.dialog.confirm(message));
  }

  async function loadSuppliers() {
    return normalizeResult(await window.posApi.suppliers.list(), 'Failed to load suppliers.');
  }

  async function saveSupplier(supplierId, payload) {
    const result = supplierId
      ? await window.posApi.suppliers.update(Number(supplierId), payload)
      : await window.posApi.suppliers.create(payload);
    return normalizeResult(result, 'Save failed.');
  }

  async function deleteSupplier(id) {
    return normalizeResult(await window.posApi.suppliers.delete(id), 'Delete failed.');
  }

  async function recordPayment(supplierId, payload) {
    return normalizeResult(
      await window.posApi.suppliers.payment(supplierId, payload),
      'Payment failed.'
    );
  }

  async function loadSupplierDetails(supplierId) {
    return normalizeResult(
      await window.posApi.suppliers.details(supplierId),
      'Could not load supplier details.'
    );
  }

  async function loadSupplierLedger(supplierId) {
    return normalizeResult(
      await window.posApi.suppliers.ledger(supplierId),
      'Could not load ledger.'
    );
  }

  async function sendSupplierWhatsApp(url) {
    const gate = checkFeature(WHATSAPP_FEATURE_ID);
    if (!gate.ok)
      return { ok: false, message: gate.message || 'Supplier WhatsApp is unavailable.' };
    try {
      await window.posApi.shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Unable to open WhatsApp. Please try again.' };
    }
  }

  function placeholder(action) {
    const messages = {
      advancedFilters: 'Advanced supplier filters are coming soon. They are not implemented yet.',
      tabs: 'Supplier tabs are coming soon. They are not implemented yet.',
      aging: 'Supplier aging report is coming soon. It is not implemented yet.',
      statement: 'Supplier statement is coming soon. It is not implemented yet.',
      export: 'Supplier export is coming soon. It is not implemented yet.',
      print: 'Supplier print is coming soon. It is not implemented yet.',
    };
    return unavailable(messages[action] || 'This supplier action is not available yet.');
  }

  window.SuppliersApi = {
    checkFeature,
    confirm,
    loadSuppliers,
    saveSupplier,
    deleteSupplier,
    recordPayment,
    loadSupplierDetails,
    loadSupplierLedger,
    sendSupplierWhatsApp,
    placeholder,
  };
})();
