(function ReturnsApiModule() {
  'use strict';

  async function lookupInvoice(filters) {
    return window.posApi.returns.lookupInvoice(filters || {});
  }

  async function list() {
    return window.posApi.returns.list();
  }

  async function create(payload) {
    return window.posApi.returns.create(payload || {});
  }

  window.ReturnsApi = {
    create,
    list,
    lookupInvoice,
  };
})();
