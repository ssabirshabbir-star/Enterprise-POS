/**
 * customers.api.js - Customers API Call Handler
 *
 * RESPONSIBILITY: window.posApi calls for Customers only.
 * Returns structured data only. Renderer owns DOM, events, and UI state.
 */
(function CustomersApiModule() {
  'use strict';

  function apiOk(res, fallback) {
    const ok = Boolean(res?.ok || res?.success);
    const message = res?.message || res?.failureReason || fallback || 'Request failed.';
    return { ok, message };
  }

  function featureCheck(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  async function loadCustomers(filters) {
    try {
      const search = filters?.search || '';
      const res = await window.posApi.customers.list(search);
      const { ok, message } = apiOk(res, 'Failed to load customers.');
      return { ok, message, customers: ok ? res.customers || [] : [] };
    } catch {
      return { ok: false, message: 'Failed to load customers. Please try again.', customers: [] };
    }
  }

  async function loadDueSummary() {
    try {
      const res = await window.posApi.customers.dueSummary();
      const { ok, message } = apiOk(res, 'Failed to load summary.');
      return { ok, message, summary: ok ? res.summary || {} : {} };
    } catch {
      return { ok: false, message: 'Failed to load summary.', summary: {} };
    }
  }

  async function saveCustomer(customerId, payload) {
    const isEdit = Boolean(customerId);
    try {
      const res = isEdit
        ? await window.posApi.customers.update(Number(customerId), payload)
        : await window.posApi.customers.create(payload);
      const { ok, message } = apiOk(res, isEdit ? 'Update failed.' : 'Create failed.');
      return { ok, message, customer: res?.customer };
    } catch {
      return { ok: false, message: 'Request failed. Please try again.' };
    }
  }

  async function deleteCustomer(customerId) {
    try {
      const res = await window.posApi.customers.delete(customerId);
      const { ok, message } = apiOk(res, 'Delete failed.');
      return { ok, message };
    } catch {
      return { ok: false, message: 'Delete request failed. Please try again.' };
    }
  }

  async function deleteInactiveCustomers() {
    const gate = featureCheck('customers.delete_inactive_customers');
    return {
      ok: false,
      deleted: 0,
      message: gate.message || 'Delete inactive customers is unavailable in this release.',
    };
  }

  async function loadCustomerDetails(customerId) {
    try {
      const res = await window.posApi.customers.details(customerId);
      const { ok, message } = apiOk(res, 'Could not load customer details.');
      return {
        ok,
        message,
        customer: res?.customer,
        sales: res?.sales || [],
        ledger: res?.ledger || [],
      };
    } catch {
      return { ok: false, message: 'Failed to load customer details.' };
    }
  }

  async function postPayment(customerId, payload) {
    try {
      const res = await window.posApi.customers.payment(customerId, payload);
      const { ok, message } = apiOk(res, 'Payment failed.');
      return { ok, message };
    } catch {
      return { ok: false, message: 'Payment request failed. Please try again.' };
    }
  }

  async function openExternalWhatsApp(featureId, url) {
    const gate = featureCheck(featureId);
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      await window.posApi.shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Unable to open link.' };
    }
  }

  async function sendCustomerWhatsApp(url) {
    return openExternalWhatsApp('customers.whatsapp_customer_message', url);
  }

  function getToolActionMessage(action) {
    if (action === 'import') {
      const gate = featureCheck('customers.import_customers_placeholder');
      return { ok: false, message: gate.message };
    }
    if (action === 'excel') {
      const gate = featureCheck('customers.export_customers_placeholder');
      return { ok: false, message: gate.message };
    }
    if (action === 'print') {
      const gate = featureCheck('customers.print_customers_placeholder');
      return { ok: false, message: gate.message };
    }
    return {
      ok: false,
      message: 'This customer action is coming soon. It is not implemented yet.',
    };
  }

  window.CustomersApi = {
    loadCustomers,
    loadDueSummary,
    saveCustomer,
    deleteCustomer,
    deleteInactiveCustomers,
    loadCustomerDetails,
    postPayment,
    sendCustomerWhatsApp,
    getToolActionMessage,
  };
})();
