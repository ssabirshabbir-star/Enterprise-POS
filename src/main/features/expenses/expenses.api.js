(function ExpensesApiModule() {
  'use strict';

  const api = () => window.posApi?.expenses;

  async function listCategories() {
    return api().listCategories();
  }

  async function createCategory(payload) {
    return api().createCategory(payload || {});
  }

  async function list(filters) {
    return api().list(filters || {});
  }

  async function create(payload) {
    return api().create(payload || {});
  }

  async function update(id, payload) {
    return api().update(id, payload || {});
  }

  async function remove(id) {
    return api().delete(id);
  }

  window.ExpensesApi = {
    create,
    createCategory,
    list,
    listCategories,
    remove,
    update,
  };
})();
