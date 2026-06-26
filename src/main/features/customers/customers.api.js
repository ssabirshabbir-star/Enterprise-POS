/**
 * customers.api.js — Customers API Call Handler
 *
 * File:      src/main/features/customers/customers.api.js
 * Reason:    Centralised posApi call layer for Customers module (Phase 5)
 * Risk:      LOW — calls existing IPC channels only, no new channels
 * Rollback:  Delete file; remove script tags from renderer/index.html
 *
 * RESPONSIBILITY: All window.posApi.customers.* calls.
 *   Reads display state via window.CustomersRenderer.
 *   Triggers UI updates by calling window.CustomersRenderer render functions.
 * Exposes: window.CustomersApi
 *
 * Depends on: window.posApi (preload), window.CustomersRenderer (runtime)
 *
 * NOT ALLOWED in this file:
 *   - Business rule validation   (belongs in customers.service.js)
 *   - DOM state management       (belongs in customers.renderer.js)
 *   - Cross-module state writes
 */
(function CustomersApiModule() {
  'use strict';

  /** Shorthand — all display operations go through CustomersRenderer */
  const R = () => window.CustomersRenderer;

  function $id(id) { return document.getElementById(id); }

  // ── Internal helpers (matches billing.api.js / products.api.js exactly) ───

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = (...args) => console.log('[CustomersApi]', ...args);

  /**
   * Normalizes a posApi response into { ok, message }.
   * Single point where response shape assumptions are documented.
   *
   * @param  {object|null} res       Raw IPC response
   * @param  {string}      fallback  User-facing error message if res provides none
   * @returns {{ ok: boolean, message: string }}
   */
  function apiOk(res, fallback) {
    const ok = Boolean(res?.ok || res?.success);
    const message = res?.message || res?.failureReason || fallback || 'Request failed.';
    return { ok, message };
  }

  // ── Customer list + stats ─────────────────────────────────────────────────

  async function loadCustomers(filters) {
    try {
      LOG('loadCustomers()', filters);
      const search = filters?.search || '';
      const res = await window.posApi.customers.list(search);
      const { ok, message } = apiOk(res, 'Failed to load customers.');
      if (!ok) { R().showMsg(message, true); return; }
      R().renderCustomerTable(res.customers || [], filters);
      LOG('loadCustomers() — received', (res.customers || []).length, 'records');
    } catch (err) {
      LOG('loadCustomers error:', err);
      R().showMsg('Failed to load customers. Please try again.', true);
    }
  }

  async function loadDueSummary() {
    try {
      LOG('loadDueSummary()');
      const res = await window.posApi.customers.dueSummary();
      const { ok } = apiOk(res, 'Failed to load summary.');
      if (!ok) return; // stats are non-critical
      R().renderStats(res.summary || {});
    } catch (err) {
      LOG('loadDueSummary error:', err); // non-critical — no user msg needed
    }
  }

  // ── Customer CRUD ─────────────────────────────────────────────────────────

  async function saveCustomer(e) {
    e.preventDefault();
    const customerId = $id('customerFormId')?.value;
    const isEdit     = Boolean(customerId);

    const payload = {
      name:           ($id('customerNameInput')?.value          || '').trim(),
      phone:          ($id('customerPhoneInput')?.value         || '').trim() || undefined,
      email:          ($id('customerEmailInput')?.value         || '').trim() || undefined,
      cnic:           ($id('customerCnicInput')?.value          || '').trim() || undefined,
      address:        ($id('customerAddressInput')?.value       || '').trim() || undefined,
      creditLimit:    parseFloat($id('customerCreditLimitInput')?.value   || '0') || 0,
      openingBalance: parseFloat($id('customerOpeningBalanceInput')?.value || '0') || 0,
      isActive:       $id('customerActiveInput')?.checked ?? true,
      group:          $id('customerGroupInput')?.value || undefined
    };

    // No renderer-side validation — customers.service.js enforces all rules

    const saveBtn = $id('saveCustomerButton');
    if (saveBtn) saveBtn.disabled = true;

    try {
      LOG(isEdit ? 'updateCustomer():' : 'createCustomer():', payload.name);
      const res = isEdit
        ? await window.posApi.customers.update(Number(customerId), payload)
        : await window.posApi.customers.create(payload);

      const { ok, message } = apiOk(res, isEdit ? 'Update failed.' : 'Create failed.');
      if (!ok) { R().showFormMsg(message, true); return; }

      LOG(isEdit ? 'Customer updated:' : 'Customer created:', res.customer?.name);
      R().showMsg(message || (isEdit ? 'Customer updated.' : 'Customer saved.'));
      R().closeEditorModal();
      await loadCustomers(R().getCurrentFilters());
      await loadDueSummary();
    } catch (err) {
      LOG('saveCustomer error:', err);
      R().showFormMsg('Request failed. Please try again.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteCustomer(customerId, customerName) {
    let confirmed = false;
    try {
      confirmed = await window.posApi.dialog.confirm(
        `Delete "${customerName}"? This cannot be undone.`);
    } catch (_) { confirmed = window.confirm(`Delete "${customerName}"?`); }
    if (!confirmed) return;

    try {
      LOG('deleteCustomer():', customerId);
      const res = await window.posApi.customers.delete(customerId);
      const { ok, message } = apiOk(res, 'Delete failed.');
      if (!ok) { R().showMsg(message, true); return; }
      R().showMsg(message || 'Customer deleted.');
      await loadCustomers(R().getCurrentFilters());
      await loadDueSummary();
    } catch (err) {
      LOG('deleteCustomer error:', err);
      R().showMsg('Delete request failed. Please try again.', true);
    }
  }

  async function deleteInactiveCustomers() {
    let confirmed = false;
    try {
      confirmed = await window.posApi.dialog.confirm(
        'Delete ALL inactive customers? This cannot be undone.');
    } catch (_) { confirmed = window.confirm('Delete all inactive customers?'); }
    if (!confirmed) return;

    try {
      LOG('deleteInactiveCustomers()');
      // Uses list to get inactive IDs then bulk-deletes via individual calls
      // No bulk-delete IPC exists — service handles soft-delete per record
      const res = await window.posApi.customers.list('');
      const { ok } = apiOk(res, 'Failed to load customers for bulk delete.');
      if (!ok) { R().showMsg('Could not fetch customers for deletion.', true); return; }

      const inactive = (res.customers || []).filter(c => !c.isActive);
      if (!inactive.length) { R().showMsg('No inactive customers found.'); return; }

      let deleted = 0;
      for (const c of inactive) {
        const dr = await window.posApi.customers.delete(c.id);
        if (dr?.ok) deleted++;
      }

      R().showMsg(`${deleted} inactive customer${deleted !== 1 ? 's' : ''} deleted.`);
      await loadCustomers(R().getCurrentFilters());
      await loadDueSummary();
    } catch (err) {
      LOG('deleteInactiveCustomers error:', err);
      R().showMsg('Bulk delete failed. Please try again.', true);
    }
  }

  // ── Customer details / ledger ─────────────────────────────────────────────

  async function loadCustomerDetails(customerId) {
    try {
      LOG('loadCustomerDetails():', customerId);
      const res = await window.posApi.customers.details(customerId);
      const { ok, message } = apiOk(res, 'Could not load customer details.');
      if (!ok) { R().showMsg(message, true); return; }
      R().renderCustomerDetails(res);
    } catch (err) {
      LOG('loadCustomerDetails error:', err);
      R().showMsg('Failed to load customer details.', true);
    }
  }

  // ── Customer payment ──────────────────────────────────────────────────────

  async function postPayment(customerId, payload) {
    try {
      LOG('postPayment():', customerId, payload);
      const res = await window.posApi.customers.payment(customerId, payload);
      const { ok, message } = apiOk(res, 'Payment failed.');
      if (!ok) { R().showMsg(message, true); return; }
      R().showMsg(message || 'Payment posted.');
      await loadCustomerDetails(customerId);
      await loadDueSummary();
    } catch (err) {
      LOG('postPayment error:', err);
      R().showMsg('Payment request failed. Please try again.', true);
    }
  }

  // ── WhatsApp integration ──────────────────────────────────────────────────

  async function sendWhatsApp(customerId, action, customText) {
    const customer = R().getSelectedCustomer();
    if (!customer?.phone) {
      R().showMsg('This customer has no phone number registered.', true);
      return;
    }

    const digits = customer.phone.replace(/\D/g, '');
    if (!digits) { R().showMsg('Invalid phone number for WhatsApp.', true); return; }

    const messages = {
      ledger:   `Dear ${customer.name},\nYour ledger statement is ready. Due balance: Rs.${Number(customer.currentBalance || 0).toFixed(2)}.\nPlease contact us for details.`,
      invoices: `Dear ${customer.name},\nYour invoice/purchase history is available. Contact us to get a copy.`,
      report:   `Dear ${customer.name},\nYour customer report has been prepared. Contact us for details.`,
      due:      `Dear ${customer.name},\nReminder: You have a due balance of Rs.${Number(customer.currentBalance || 0).toFixed(2)}. Please clear at your earliest convenience.`,
      payment:  `Dear ${customer.name},\nThank you for your recent payment. Your account has been updated.`,
      custom:   customText || ''
    };

    const text = messages[action] || '';
    if (!text.trim()) { R().showMsg('Message is empty.', true); return; }

    try {
      LOG('sendWhatsApp():', customer.name, action);
      await window.posApi.shell.openExternal(
        `https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
      R().closeWhatsAppModal();
    } catch (_) { /* silent — external URL open failure is non-critical */ }
  }

  // ── Import / Export ───────────────────────────────────────────────────────

  async function handleToolAction(action) {
    try {
      if (action === 'import') {
        LOG('tool: import customers');
        if (!window.posApi.dataTools?.importCustomers) {
          R().showMsg('Customer import is not yet available.'); return;
        }
        const res = await window.posApi.dataTools.importCustomers();
        const { ok, message } = apiOk(res, 'Import failed.');
        if (res?.canceled) return;
        if (ok) { R().showMsg(message || 'Import complete.'); await loadCustomers(R().getCurrentFilters()); await loadDueSummary(); }
        else     R().showMsg(message, true);
      } else if (action === 'excel') {
        LOG('tool: export customers');
        if (!window.posApi.dataTools?.exportCustomers) {
          R().showMsg('Customer export is not yet available.'); return;
        }
        const res = await window.posApi.dataTools.exportCustomers();
        const { ok, message } = apiOk(res, 'Export failed.');
        if (res?.canceled) return;
        if (ok) R().showMsg(message || 'Export complete.');
        else    R().showMsg(message, true);
      } else if (action === 'print') {
        LOG('tool: print customers');
        if (!window.posApi.printing?.printCustomerList) {
          R().showMsg('Customer print is not yet available.'); return;
        }
        const res = await window.posApi.printing.printCustomerList();
        const { ok, message } = apiOk(res, 'Print failed.');
        if (ok) R().showMsg('Print sent.');
        else    R().showMsg(message, true);
      }
    } catch (err) {
      LOG('handleToolAction error:', action, err);
      R().showMsg(`${action} failed. Please try again.`, true);
    }
  }

  // ── Public surface ────────────────────────────────────────────────────────

  window.CustomersApi = {
    loadCustomers, loadDueSummary,
    saveCustomer, deleteCustomer, deleteInactiveCustomers,
    loadCustomerDetails,
    postPayment,
    sendWhatsApp,
    handleToolAction
  };
})();
