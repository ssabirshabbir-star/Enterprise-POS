(function PurchasesApiModule() {
  'use strict';

  const api = () => window.posApi.purchases;

  async function list() {
    return api().list();
  }

  async function suppliers() {
    return api().suppliers();
  }

  async function products() {
    return api().products();
  }

  async function createSupplier(payload) {
    return api().createSupplier(payload || {});
  }

  async function details(id) {
    return api().details(id);
  }

  async function create(payload) {
    return api().create(payload || {});
  }

  window.PurchasesApi = {
    create,
    createSupplier,
    details,
    list,
    products,
    suppliers,
  };
})();
