/**
 * billing.api.js - Billing API Call Handler
 *
 * RESPONSIBILITY: window.posApi calls for Billing only.
 * Returns structured data only. Renderer/cart modules own DOM, events, and UI state.
 */
(function BillingApiModule() {
  'use strict';

  const LOG = () => {};

  function apiOk(res, fallback) {
    const ok = Boolean(res?.ok || res?.success);
    const message =
      res?.message || res?.failureReason || fallback || 'Something went wrong. Please try again.';
    return { ok, message };
  }

  function featureCheck(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  async function searchProducts(query) {
    const q = String(query || '').trim();
    if (!q) return { ok: true, query: q, products: [] };

    if (q.length >= 4 && !/\s/.test(q)) {
      try {
        const barcodeRes = await window.posApi.pos.lookupBarcode(q);
        if (barcodeRes?.ok && barcodeRes.product) {
          return {
            ok: true,
            query: q,
            exact: true,
            product: barcodeRes.product,
            products: [barcodeRes.product],
          };
        }
      } catch {
        /* barcode miss falls through to text search */
      }
    }

    try {
      LOG('Product search:', q);
      const res = await window.posApi.pos.searchProducts({ search: q });
      const { ok, message } = apiOk(res, 'Unable to search products. Please try again.');
      if (!ok) return { ok: false, message, query: q, products: [] };
      return { ok: true, query: q, products: res.products || [] };
    } catch {
      return {
        ok: false,
        message: 'Unable to search products. Please try again.',
        query: q,
        products: [],
      };
    }
  }

  async function loadCustomers(search) {
    try {
      const res = await window.posApi.pos.listCustomers(search || '');
      const { ok, message } = apiOk(res, 'Unable to load customers. Please try again.');
      return { ok, message, customers: ok ? res.customers || [] : [] };
    } catch {
      return { ok: false, message: 'Unable to load customers. Please try again.', customers: [] };
    }
  }

  async function createCustomer(payload) {
    try {
      const res = await window.posApi.pos.createCustomer(payload);
      const { ok, message } = apiOk(res, 'Unable to add customer. Please try again.');
      return { ok, message, customer: res?.customer };
    } catch {
      return { ok: false, message: 'Unable to add customer. Please try again.' };
    }
  }

  async function completeSale(payload) {
    try {
      const res = await window.posApi.pos.completeSale(payload);
      const { ok, message } = apiOk(res, 'Unable to complete the sale. Please try again.');
      return { ok, message, receipt: res?.receipt };
    } catch {
      return { ok: false, message: 'Unable to process the sale request. Please try again.' };
    }
  }

  async function holdSale(payload) {
    const gate = featureCheck('billing.hold_sale');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.pos.holdSale(payload);
      const { ok, message } = apiOk(res, 'Unable to hold this sale. Please try again.');
      return { ok, message };
    } catch {
      return { ok: false, message: 'Unable to hold this sale. Please try again.' };
    }
  }

  async function loadHeldSales() {
    const gate = featureCheck('billing.held_sales_resume_delete');
    if (!gate.ok) return { ok: false, message: gate.message, holds: [] };
    try {
      const res = await window.posApi.pos.listHeldSales();
      const { ok, message } = apiOk(res, 'Unable to load held sales.');
      return { ok, message, holds: ok ? res.holds || [] : [] };
    } catch {
      return { ok: false, message: 'Unable to load held sales.', holds: [] };
    }
  }

  async function deleteHeldSale(holdId) {
    const gate = featureCheck('billing.held_sales_resume_delete');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.pos.deleteHeldSale(holdId);
      const { ok, message } = apiOk(res, 'Unable to delete held sale.');
      return { ok, message };
    } catch {
      return { ok: false, message: 'Unable to delete held sale.' };
    }
  }

  async function getPrintSettings() {
    try {
      return { ok: true, settings: await window.posApi.printing.getSettings() };
    } catch {
      return { ok: false, settings: null };
    }
  }

  async function printReceipt(receipt) {
    try {
      const res = await window.posApi.printing.printReceipt(receipt, {});
      const { ok, message } = apiOk(res, 'Unable to print receipt.');
      return { ok, message: ok ? 'Receipt sent to printer.' : message };
    } catch {
      return { ok: false, message: 'Unable to print receipt. Check printer settings.' };
    }
  }

  async function downloadReceiptPdf(receipt) {
    const gate = featureCheck('billing.export_receipt_pdf');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.printing.downloadReceiptPdf(receipt, {});
      if (res?.canceled) return { ok: true, canceled: true };
      const { ok, message } = apiOk(res, 'Unable to export receipt PDF.');
      return { ok, message: ok ? 'Receipt PDF saved.' : message };
    } catch {
      return { ok: false, message: 'Unable to export receipt PDF.' };
    }
  }

  async function getLastReceipt() {
    const gate = featureCheck('billing.reprint_receipt');
    if (!gate.ok) return { ok: false, message: gate.message };
    try {
      const res = await window.posApi.pos.getLastReceipt();
      const { ok, message } = apiOk(res, 'No previous sale found.');
      return { ok, message, receipt: res?.receipt };
    } catch {
      return { ok: false, message: 'Unable to load last receipt.' };
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

  async function sendReceiptWhatsApp(url) {
    return openExternalWhatsApp('billing.whatsapp_receipt_share', url);
  }

  window.BillingApi = {
    searchProducts,
    loadCustomers,
    createCustomer,
    completeSale,
    holdSale,
    loadHeldSales,
    deleteHeldSale,
    getPrintSettings,
    printReceipt,
    downloadReceiptPdf,
    getLastReceipt,
    sendReceiptWhatsApp,
  };
})();
