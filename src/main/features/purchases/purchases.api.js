(function PurchasesApiModule() {
  'use strict';

  const api = () => window.posApi.purchases;

  function unavailable(message) {
    return { ok: false, locked: true, message };
  }

  function normalizeResult(result, fallbackMessage) {
    if (!result) return { ok: false, message: fallbackMessage };
    return result;
  }

  async function list(filters) {
    return normalizeResult(await api().list(filters || {}), 'Could not load purchases.');
  }

  async function suppliers() {
    return normalizeResult(await api().suppliers(), 'Supplier dropdown could not be loaded.');
  }

  async function products() {
    return normalizeResult(await api().products(), 'Product lookup could not be loaded.');
  }

  async function createSupplier(payload) {
    return normalizeResult(
      await api().createSupplier(payload || {}),
      'Supplier could not be saved.'
    );
  }

  async function details(id) {
    return normalizeResult(await api().details(id), 'Purchase details not found.');
  }

  async function create(payload) {
    return normalizeResult(await api().create(payload || {}), 'Purchase could not be saved.');
  }

  function placeholder(action) {
    const messages = {
      pagination: 'Purchase pagination is planned for a future phase.',
      import: 'Purchase import is planned for a future phase.',
      export: 'Purchase export is planned for a future phase.',
      print: 'Purchase printing is planned for a future phase.',
      whatsapp: 'WhatsApp purchase records are planned for a future phase.',
      payment: 'Payment settlement is planned for a future purchase phase.',
      moreActions: 'More purchase actions are planned for a future phase.',
      columns: 'Column customization is planned for a future purchase phase.',
      quickRange: 'Quick date ranges are planned for a future purchase phase.',
      overdue: 'Overdue shortcut is planned for a future purchase phase.',
      dueToday: 'Due Today shortcut is planned for a future purchase phase.',
    };
    return unavailable(messages[action] || 'This purchase action is not available yet.');
  }

  window.PurchasesApi = {
    create,
    createSupplier,
    details,
    list,
    placeholder,
    products,
    suppliers,
  };
})();
