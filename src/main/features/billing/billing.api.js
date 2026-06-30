/**
 * billing.api.js — Billing API Call Handler
 *
 * File:      src/main/features/billing/billing.api.js
 * Reason:    Centralised posApi call layer for billing module split
 * Risk:      LOW — calls existing IPC channels only, no new channels
 * Rollback:  Delete file; revert billing.renderer.js to pre-split version
 *
 * RESPONSIBILITY: All window.posApi.* calls for the billing module.
 *   Reads cart state via window.BillingCart.
 *   Updates UI via window.BillingCart after responses.
 * Exposes:   window.BillingApi
 *
 * Load order: must load AFTER billing.cart.js
 * Depends on: window.BillingCart, window.posApi
 *
 * NOT ALLOWED in this file:
 *   - Business rule validation
 *   - DOM state management (delegate to BillingCart)
 *   - Cart mutations other than via BillingCart
 *   - Cross-module changes
 */
(function BillingApiModule() {
  'use strict';

  /** Shorthand — all cart/display operations go through BillingCart */
  const C = () => window.BillingCart;

  function $id(id) {
    return document.getElementById(id);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = () => {};

  /**
   * Normalizes a posApi response into { ok, message }.
   * Handles the res.ok / res.success variation across IPC channels.
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

  // ── Product search ────────────────────────────────────────────────────────

  async function searchProducts(query) {
    const q = String(query || '').trim();
    const resultsEl = $id('posSearchResults');
    if (!resultsEl) return;
    if (!q) {
      C().clearSearchResults();
      return;
    }

    // Barcode exact lookup — intentionally silent on miss: falls through to text search
    if (q.length >= 4 && !/\s/.test(q)) {
      try {
        const res = await window.posApi.pos.lookupBarcode(q);
        if (res?.ok && res.product) {
          LOG('Barcode match:', q);
          C().addToCart(res.product);
          return;
        }
      } catch (_) {
        /* intentional: barcode miss falls through to text search */
      }
    }

    // Text / SKU / name search
    try {
      LOG('Product search:', q);
      const res = await window.posApi.pos.searchProducts({ search: q });
      const { ok } = apiOk(res, 'Search failed.'); // R1 fix: was direct !res?.ok
      if (!ok) {
        C().clearSearchResults();
        return;
      }

      const products = res.products || [];
      if (!products.length) {
        resultsEl.innerHTML = `<p style="padding:10px 14px;color:#6b7280;font-size:.83rem">No products found for "${C().esc(q)}".</p>`;
        resultsEl._products = [];
        return;
      }

      // Auto-add on unique match — mirrors barcode scan behaviour
      if (products.length === 1) {
        LOG('Single product match — auto-adding:', products[0].name);
        C().addToCart(products[0]);
        return;
      }

      resultsEl._products = products;
      resultsEl.innerHTML = products
        .slice(0, 15)
        .map((p) => {
          const price =
            C().getBillingMode() === 'wholesale' && Number(p.wholesalePrice) > 0
              ? Number(p.wholesalePrice)
              : Number(p.salePrice);
          const sc = p.currentStock <= 0 ? '#dc2626' : p.currentStock < 5 ? '#d97706' : '#16a34a';
          return `<button type="button" data-product-id="${p.id}"
          style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;text-align:left;border-bottom:1px solid #f3f4f6"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"
        ><span style="flex:1;min-width:0">
            <span style="display:block;font-weight:600;font-size:.83rem">${C().esc(p.name)}</span>
            ${p.sku ? `<span style="font-size:.7rem;color:#9ca3af">${C().esc(p.sku)}</span>` : ''}
          </span>
          <span style="font-weight:700;color:#1d4ed8;font-size:.83rem;white-space:nowrap">Rs.${C().fmt(price)}</span>
          <span style="font-size:.72rem;color:${sc};font-weight:600">${p.currentStock}</span>
        </button>`;
        })
        .join('');
    } catch (err) {
      LOG('Search error:', err);
      C().showMsg('Product search failed. Please try again.', true); // A2 fix: was silent on IPC error
    }
  }

  // ── Customer management ───────────────────────────────────────────────────

  async function loadCustomers(search) {
    try {
      LOG('Loading customers, search:', search || '(all)');
      const res = await window.posApi.pos.listCustomers(search || '');
      const { ok } = apiOk(res, 'Failed to load customers.');
      if (!ok) return;
      C().setCustomers(res.customers || []);
      C().renderCustomerSelect();
    } catch (err) {
      LOG('Load customers error:', err);
    }
  }

  async function saveCustomer(e) {
    e.preventDefault();
    const btn = $id('posCustomerModalSaveButton');
    if (btn) btn.disabled = true;

    const payload = {
      name: ($id('posCustomerNameInput')?.value || '').trim(),
      phone: ($id('posCustomerPhoneInput')?.value || '').trim() || undefined,
      email: ($id('posCustomerEmailInput')?.value || '').trim() || undefined,
      address: ($id('posCustomerAddressInput')?.value || '').trim() || undefined,
      creditLimit: parseFloat($id('posCustomerCreditLimitInput')?.value || '0') || 0,
    };

    try {
      LOG('Creating customer:', payload.name);
      const res = await window.posApi.pos.createCustomer(payload);
      const { ok, message } = apiOk(res, 'Failed to create customer.');
      if (!ok) {
        C().showModalMsg(message, true);
        return;
      }
      LOG('Customer created:', res.customer?.name);
      C().loadCustomerIntoCart(res.customer);
      C().closeCustomerModal();
      C().showMsg(`Customer "${C().esc(res.customer.name)}" added and selected.`);
    } catch (err) {
      LOG('Create customer error:', err);
      C().showModalMsg('Request failed. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Complete sale ─────────────────────────────────────────────────────────

  async function completeSale() {
    const btn = $id('completeSaleButton');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.7';
    }

    try {
      LOG('completeSale() — submitting cart payload');
      const payload = C().getCartPayload();
      if (!['Cash', 'Card', 'Bank', 'Credit'].includes(payload.paymentMethod)) {
        C().showMsg('Please select a valid payment method.', true);
        return;
      }
      if (payload.paymentMethod === 'Credit' && !payload.customerId) {
        C().showMsg('Credit sales require selecting a registered customer.', true);
        return;
      }
      const selectedCustomerId = C().getCart().customerId || $id('customerSelect')?.value;
      const receiptCustomer = C()
        .getCustomers()
        .find((c) => String(c.id) === String(selectedCustomerId));
      const res = await window.posApi.pos.completeSale(payload);
      const { ok, message } = apiOk(res, 'Sale failed. Please try again.');
      if (!ok) {
        C().showMsg(message, true);
        return;
      }

      LOG('Sale complete — invoice:', res.receipt?.invoiceNumber);
      if (receiptCustomer && res.receipt) {
        res.receipt.customerId = receiptCustomer.id;
        res.receipt.customerName = res.receipt.customerName || receiptCustomer.name;
        res.receipt.customerPhone = receiptCustomer.phone || '';
      }
      C().setLastReceipt(res.receipt);
      C().renderReceiptPreview(res.receipt);

      tryAutoPrint(res.receipt);

      // Clear cart BEFORE showing any post-sale messages — prevents stale message carryover
      C().clearCartDisplay();

      // Build a single combined message so showMsg is called once (one 4.5s timer)
      const invoicePart = `✅ Invoice: ${res.receipt?.invoiceNumber || ''}`;
      if (res.receipt?.luckyDrawCoupons?.length) {
        const coupon = res.receipt.luckyDrawCoupons[0];
        C().showMsg(`${invoicePart}  🎉 Lucky Draw: ${coupon.couponNo} — ${coupon.campaignName}`);
      } else {
        C().showMsg(invoicePart);
      }
    } catch (err) {
      LOG('completeSale error:', err);
      C().showMsg('Sale request failed. Please try again.', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    }
  }

  // ── Hold sale ─────────────────────────────────────────────────────────────

  async function holdSale() {
    const cart = C().getCart();
    const holdPayload = {
      items: cart.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: Number(i.displayTotal) || 0,
      })),
      customerId: cart.customerId || null,
      note: `Cart ${C().getActiveCart() + 1} — ${cart.items.length} items`,
    };

    try {
      LOG('holdSale() — holding cart', C().getActiveCart() + 1);
      const res = await window.posApi.pos.holdSale(holdPayload);
      const { ok, message } = apiOk(res, 'Hold failed.');
      if (!ok) {
        C().showMsg(message, true);
        return;
      }
      C().showMsg('Sale held. Use the held sales list to resume it.');
      C().clearCartDisplay();
      loadHeldSales();
    } catch (err) {
      LOG('holdSale error:', err);
      C().showMsg('Hold request failed.', true);
    }
  }

  async function loadHeldSales() {
    try {
      const res = await window.posApi.pos.listHeldSales();
      const { ok } = apiOk(res, 'Failed to load held sales.');
      if (!ok) return;
      C().renderHeldSalesList(res.holds || []);
    } catch (err) {
      LOG('loadHeldSales error:', err);
    }
  }

  async function restoreHold(holdId) {
    const holds = $id('heldSalesList')?._holds || [];
    const hold = holds.find((h) => String(h.id) === String(holdId));
    if (!hold?.payload?.items?.length) return;

    C().restoreHeldItemsToCart(hold);

    try {
      LOG('restoreHold() — deleting hold:', holdId);
      const res = await window.posApi.pos.deleteHeldSale(holdId);
      const { ok, message } = apiOk(res, 'Hold removed from queue.');
      if (!ok) LOG('deleteHeldSale non-ok after restore:', message);
      loadHeldSales();
      C().showMsg(`Sale restored (${hold.payload.items.length} items).`);
    } catch (err) {
      LOG('restoreHold error:', err);
      C().showMsg('Sale restored locally but hold queue could not be updated.', true);
    }
  }

  async function deleteHold(holdId) {
    let ok = false;
    try {
      ok = await window.posApi.dialog.confirm('Delete this held sale?');
    } catch (_) {
      ok = true;
    }
    if (!ok) return;
    try {
      LOG('deleteHold():', holdId);
      const res = await window.posApi.pos.deleteHeldSale(holdId);
      const { ok: deleted, message } = apiOk(res, 'Delete failed.');
      if (!deleted) {
        C().showMsg(message, true);
        return;
      }
      loadHeldSales();
      C().showMsg('Held sale deleted.');
    } catch (err) {
      LOG('deleteHold error:', err);
      C().showMsg('Delete request failed.', true);
    }
  }

  // ── Printing ──────────────────────────────────────────────────────────────

  async function tryAutoPrint(receipt) {
    try {
      const s = await window.posApi.printing.getSettings();
      if (s?.settings?.autoPrint || s?.autoPrint) await printReceipt(receipt);
    } catch (_) {}
  }

  async function printReceipt(receipt) {
    const r = receipt || C().getLastReceipt();
    if (!r) {
      C().showMsg('No receipt available to print.', true);
      return;
    }
    try {
      LOG('printReceipt() — invoice:', r.invoiceNumber);
      const res = await window.posApi.printing.printReceipt(r, {});
      const { ok, message } = apiOk(res, 'Print failed.');
      if (ok) C().showMsg('Receipt sent to printer.');
      else C().showMsg(message, true);
    } catch (err) {
      LOG('Print error:', err);
      C().showMsg('Print failed. Check printer settings.', true);
    }
  }

  async function downloadPdf() {
    if (!C().getLastReceipt()) {
      C().showMsg('Complete a sale first.', true);
      return;
    }
    try {
      LOG('downloadPdf()');
      const res = await window.posApi.printing.downloadReceiptPdf(C().getLastReceipt(), {});
      if (res?.canceled) return;
      const { ok, message } = apiOk(res, 'PDF export failed.');
      if (ok) C().showMsg('PDF downloaded.');
      else C().showMsg(message, true);
    } catch (err) {
      LOG('PDF error:', err);
      C().showMsg('PDF export failed.', true);
    }
  }

  async function reprintLastBill() {
    if (C().getLastReceipt()) {
      await printReceipt(C().getLastReceipt());
      return;
    }
    try {
      LOG('reprintLastBill() — fetching last receipt');
      const res = await window.posApi.pos.getLastReceipt();
      const { ok } = apiOk(res, 'No previous sale found.');
      if (!ok || !res.receipt) {
        C().showMsg('No previous sale found.', true);
        return;
      }
      C().setLastReceipt(res.receipt);
      C().renderReceiptPreview(res.receipt);
      await printReceipt(res.receipt);
    } catch (err) {
      LOG('Reprint error:', err);
      C().showMsg('Could not load last receipt.', true);
    }
  }

  // ── Sale actions (refund / exchange) ──────────────────────────────────────

  async function validateSaleAction(action) {
    C().showMsg(
      `${action === 'refund' ? 'Full refund' : 'Exchange'} workflow is coming soon. It is not implemented yet.`,
      true
    );
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  async function sendWhatsApp() {
    const r = C().getLastReceipt();
    if (!r) {
      C().showMsg('Complete a sale first.', true);
      return;
    }
    const customerId = r.customerId || $id('customerSelect')?.value;
    const customer = C()
      .getCustomers()
      .find((c) => String(c.id) === String(customerId));
    const customerName = r.customerName || customer?.name || 'Customer';
    const customerPhone = r.customerPhone || customer?.phone || '';
    if (!customerPhone) {
      C().showMsg('Receipt customer has no phone number.', true);
      return;
    }
    const digits = customerPhone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Dear ${customerName},\nInvoice: ${r.invoiceNumber}\nTotal: Rs.${C().fmt(r.grandTotal)}\nDate: ${new Date(r.createdAt || Date.now()).toLocaleDateString()}\nThank you!`
    );
    try {
      LOG('sendWhatsApp() — customer:', customerName);
      await window.posApi.shell.openExternal(`https://wa.me/${digits}?text=${text}`);
    } catch (_) {}
  }

  // ── Cart clear (needs dialog API) ─────────────────────────────────────────

  async function clearCartConfirm() {
    if (!C().getCart().items.length) return;
    let ok = false;
    try {
      ok = await window.posApi.dialog.confirm('Clear current cart?');
    } catch (_) {
      ok = true;
    }
    if (ok) {
      C().clearCartDisplay();
      C().showMsg('Cart cleared.');
    }
  }

  // ── Public surface ────────────────────────────────────────────────────────

  window.BillingApi = {
    searchProducts,
    loadCustomers,
    saveCustomer,
    completeSale,
    holdSale,
    loadHeldSales,
    restoreHold,
    deleteHold,
    printReceipt,
    downloadPdf,
    reprintLastBill,
    validateSaleAction,
    sendWhatsApp,
    clearCartConfirm,
  };
})();
