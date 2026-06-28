(function SalesHistoryApiModule() {
  'use strict';

  async function list(filters) {
    return window.posApi.salesHistory.list(filters || {});
  }

  async function getDetails(saleId) {
    return window.posApi.salesHistory.getDetails(saleId);
  }

  async function reprint(receipt) {
    return window.posApi.printing.printReceipt(receipt, {});
  }

  window.SalesHistoryApi = {
    getDetails,
    list,
    reprint,
  };
})();
