(function SalesHistoryApiModule() {
  'use strict';

  async function list(filters) {
    return window.posApi.salesHistory.list(filters || {});
  }

  async function getDetails(saleId) {
    return window.posApi.salesHistory.getDetails(saleId);
  }

  function checkFeature(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  async function reprint(receipt) {
    const gate = checkFeature('billing.reprint_receipt');
    if (!gate.ok) return { ok: false, message: gate.message };
    return window.posApi.printing.printReceipt(receipt, {});
  }

  window.SalesHistoryApi = {
    getDetails,
    list,
    reprint,
  };
})();
