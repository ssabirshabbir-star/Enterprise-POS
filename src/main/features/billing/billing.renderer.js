/**
 * billing.renderer.js — Billing Module Entry Point
 *
 * File:      src/main/features/billing/billing.renderer.js
 * Reason:    Final piece of billing module split — init and event binding only
 * Risk:      LOW — no API calls, no state management, pure event routing
 * Rollback:  Revert to pre-split single-file version
 *
 * RESPONSIBILITY: Module initialization and DOM event binding ONLY.
 *   Delegates all cart/display operations to window.BillingCart.
 *   Delegates all API calls to window.BillingApi.
 * Exposes: window.initBillingModule (called by login.js on /pos navigation)
 *
 * Load order (all three must be loaded before use):
 *   1. billing.cart.js    → defines window.BillingCart
 *   2. billing.api.js     → defines window.BillingApi
 *   3. billing.renderer.js → registers events, exposes initBillingModule
 *
 * NOT ALLOWED in this file:
 *   - window.posApi calls  (belongs in billing.api.js)
 *   - Cart state mutations  (belongs in billing.cart.js)
 *   - Business logic        (belongs in billing.service.js)
 *   - Rendering functions   (belongs in billing.cart.js)
 */
(function BillingRendererModule() {
  'use strict';

  // ── Module lifecycle flags ────────────────────────────────────────────────
  // initialized:    set true after first successful init() — prevents re-binding
  // eventsAttached: inner guard inside attachEvents() — belt-and-suspenders
  // initPending:    prevents concurrent retry chains when init() is called
  //                 multiple times before the billing fragment has loaded
  let initialized = false;
  let eventsAttached = false;
  let initPending = false; // ← F1 fix: concurrent retry guard
  let searchTimer = null;
  let cTimer = null; // customer search debounce — module-scoped for clarity

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = (...args) => console.log('[BillingRenderer]', ...args);

  /** Live references — resolved at call-time so load order is safe */
  const C = () => window.BillingCart;
  const A = () => window.BillingApi;

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  function onKeyDown(e) {
    // Only active when the POS panel is visible
    if (document.getElementById('posModule')?.classList.contains('hidden')) return;

    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const inInput =
      ['input', 'textarea', 'select'].includes(tag) &&
      document.activeElement?.id !== 'posBarcodeInput';

    // Function keys — always captured when POS is visible
    if (e.key === 'F4') {
      e.preventDefault();
      A().completeSale();
      return;
    }
    if (e.key === 'F6') {
      e.preventDefault();
      C().setPaymentMethod('Cash');
      return;
    }
    if (e.key === 'F7') {
      e.preventDefault();
      C().setPaymentMethod('Card');
      return;
    }
    if (e.key === 'F8') {
      e.preventDefault();
      const el = document.getElementById('cartDiscount');
      el?.focus();
      el?.select();
      return;
    }
    if (e.key === 'F9') {
      e.preventDefault();
      C().showMsg('Split payment is coming soon. It is not implemented yet.', true);
      return;
    }
    if (e.key === 'F10') {
      e.preventDefault();
      A().printReceipt();
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      A().downloadPdf();
      return;
    }
    if (e.key === 'F12') {
      e.preventDefault();
      A().reprintLastBill();
      return;
    }

    // Ctrl shortcuts
    if (e.ctrlKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        C().setPaymentMethod('Bank');
        return;
      }
      if (k === 'w') {
        e.preventDefault();
        A().sendWhatsApp();
        return;
      }
      if (k === 's') {
        e.preventDefault();
        A().holdSale();
        return;
      }
      if (k === 'r') {
        e.preventDefault();
        A().validateSaleAction('refund');
        return;
      }
      if (k === 'e') {
        e.preventDefault();
        A().validateSaleAction('exchange');
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        A().clearCartConfirm();
        return;
      }
    }

    // Auto-focus search bar on any printable key when not in a different input
    if (!inInput && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const src = document.getElementById('posBarcodeInput');
      if (src && document.activeElement !== src) src.focus();
    }
  }

  // ── Event binding (idempotent) ────────────────────────────────────────────

  function attachEvents() {
    if (eventsAttached) return; // idempotency guard — runs exactly once per session
    eventsAttached = true;
    function syncDiscountMode() {
      const mode = document.getElementById('posDiscountType')?.value || 'amount';
      document
        .querySelector('.epos-invoice-summary-discount')
        ?.setAttribute('data-discount-mode', mode);
    }
    LOG('attachEvents() running — will not repeat this session');

    // ── Search ──────────────────────────────────────────────────────────────
    const si = document.getElementById('posBarcodeInput');
    if (si) {
      si.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const v = e.target.value.trim();
        if (!v) {
          C().clearSearchResults();
          return;
        }
        searchTimer = setTimeout(() => A().searchProducts(v), 220);
      });
      si.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(searchTimer);
          A().searchProducts(e.target.value.trim());
        }
        if (e.key === 'Escape') {
          e.target.value = '';
          C().clearSearchResults();
        }
        if (e.key === 'ArrowDown') {
          const first = document
            .getElementById('posSearchResults')
            ?.querySelector('[data-product-id]');
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }
      });
      document.getElementById('posSearchFocusButton')?.addEventListener('click', () => si.focus());
    }

    // ── Search results (event delegation) ───────────────────────────────────
    document.getElementById('posSearchResults')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-product-id]');
      if (!btn) return;
      const products = document.getElementById('posSearchResults')?._products || [];
      const product = products.find((p) => String(p.id) === btn.dataset.productId);
      if (product) {
        C().addToCart(product);
        if (si) si.value = '';
      }
    });

    // ── Cart table (event delegation) ────────────────────────────────────────
    const tbody = document.getElementById('cartTableBody');
    if (tbody) {
      const updateCartInput = (e) => {
        const el = e.target;
        if (el.dataset.cartQty !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartQty), 'qty', el.value);
        if (el.dataset.cartPrice !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartPrice), 'price', el.value);
        if (el.dataset.cartDisc !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartDisc), 'disc', el.value);
      };
      tbody.addEventListener('input', updateCartInput);
      tbody.addEventListener('change', updateCartInput);
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-item]');
        if (btn) {
          C().removeCartItem(Number(btn.dataset.removeItem));
          return;
        }

        const inc = e.target.closest('[data-inc-item]');
        if (inc) {
          const idx = Number(inc.dataset.incItem);
          const item = C().getCart().items[idx];
          if (item) C().refreshCartItemDisplay(idx, 'qty', Number((item.quantity + 1).toFixed(3)));
          return;
        }

        const dec = e.target.closest('[data-dec-item]');
        if (dec) {
          const idx = Number(dec.dataset.decItem);
          const item = C().getCart().items[idx];
          if (!item) return;
          const newQty = Number((item.quantity - 1).toFixed(3));
          if (newQty < 1)
            C().showMsg('Quantity must be at least 1. Use remove to delete the item.', true);
          else C().refreshCartItemDisplay(idx, 'qty', newQty);
        }
      });
    }

    // ── Display total triggers ───────────────────────────────────────────────
    ['cartDiscount', 'cartTax'].forEach((id) =>
      document.getElementById(id)?.addEventListener('input', () => C().updateDisplayTotals())
    );
    document.getElementById('paidAmount')?.addEventListener('input', () => {
      C().markPaidAmountManual();
      C().updateDisplayTotals();
    });
    document.getElementById('posDiscountType')?.addEventListener('change', () => {
      syncDiscountMode();
      C().updateDisplayTotals();
    });

    // ── Payment method buttons ───────────────────────────────────────────────
    document
      .querySelectorAll('[data-payment-set]')
      .forEach((btn) =>
        btn.addEventListener('click', () => C().setPaymentMethod(btn.dataset.paymentSet))
      );
    document.getElementById('posSubtotalDiscountButton')?.addEventListener('click', () => {
      const el = document.getElementById('cartDiscount');
      el?.focus();
      el?.select();
    });
    document
      .getElementById('syncPosButton')
      ?.addEventListener('click', () =>
        C().showMsg('POS sync is coming soon. It is not implemented yet.', true)
      );

    // ── Sale action buttons ──────────────────────────────────────────────────
    document
      .getElementById('completeSaleButton')
      ?.addEventListener('click', () => A().completeSale());
    document.getElementById('holdSaleButton')?.addEventListener('click', () => A().holdSale());
    document
      .getElementById('thermalPrintButton')
      ?.addEventListener('click', () => A().printReceipt());
    document
      .getElementById('posDownloadPdfButton')
      ?.addEventListener('click', () => A().downloadPdf());
    document
      .getElementById('reprintLastBillButton')
      ?.addEventListener('click', () => A().reprintLastBill());
    document
      .getElementById('clearCartButton')
      ?.addEventListener('click', () => A().clearCartConfirm());
    document
      .getElementById('refundSaleButton')
      ?.addEventListener('click', () => A().validateSaleAction('refund'));
    document
      .getElementById('exchangeSaleButton')
      ?.addEventListener('click', () => A().validateSaleAction('exchange'));
    document
      .getElementById('posWhatsappButton')
      ?.addEventListener('click', () => A().sendWhatsApp());

    // ── Held sales list (event delegation) ───────────────────────────────────
    document.getElementById('heldSalesList')?.addEventListener('click', (e) => {
      const r = e.target.closest('[data-restore-hold]');
      if (r) {
        A().restoreHold(r.dataset.restoreHold);
        return;
      }
      const d = e.target.closest('[data-delete-hold]');
      if (d) A().deleteHold(d.dataset.deleteHold);
    });

    // ── Cart switcher ────────────────────────────────────────────────────────
    document
      .querySelectorAll('[data-pos-cart]')
      .forEach((btn) =>
        btn.addEventListener('click', () => C().switchToCart(Number(btn.dataset.posCart)))
      );

    // ── Billing mode ─────────────────────────────────────────────────────────
    document
      .getElementById('retailModeButton')
      ?.addEventListener('click', () => C().setBillingMode('retail'));
    document
      .getElementById('wholesaleModeButton')
      ?.addEventListener('click', () => C().setBillingMode('wholesale'));

    // ── Customer select ───────────────────────────────────────────────────────
    document.getElementById('customerSelect')?.addEventListener('change', (e) => {
      C().setCartCustomer(e.target.value); // controlled setter — no raw cart mutation
      C().updateCustomerBalanceDisplay();
    });

    // ── Customer live search (hidden input) ───────────────────────────────────
    // cTimer is module-scoped (declared above) for clarity — not closure-local
    document.getElementById('customerSearch')?.addEventListener('input', (e) => {
      clearTimeout(cTimer);
      cTimer = setTimeout(() => A().loadCustomers(e.target.value), 300);
    });

    // ── Customer modal ────────────────────────────────────────────────────────
    document
      .getElementById('posCustomerAddButton')
      ?.addEventListener('click', () => C().openCustomerModal());
    document
      .getElementById('quickCustomerFocusButton')
      ?.addEventListener('click', () => C().openCustomerModal());
    document
      .getElementById('posCustomerModalForm')
      ?.addEventListener('submit', (e) => A().saveCustomer(e));
    document
      .querySelectorAll('[data-pos-customer-close]')
      .forEach((el) => el.addEventListener('click', () => C().closeCustomerModal()));

    // ── Global keyboard handler ───────────────────────────────────────────────
    document.addEventListener('keydown', onKeyDown);
  }

  // ── Module init ───────────────────────────────────────────────────────────
  // Called by login.js after /pos navigation (safe to call multiple times).
  //
  // Lifecycle:
  //   1st call (fragment not yet in DOM) → schedules retry, sets initPending
  //   2nd call before retry fires        → returns immediately (initPending guard)
  //   retry fires                        → clears initPending, re-enters init()
  //   fragment now in DOM                → runs attachEvents() once, then refresh
  //   subsequent calls (re-navigation)   → skips attachEvents(), only refreshes

  function init() {
    // F1 fix: prevent multiple concurrent retry chains on fast re-navigation
    if (!document.getElementById('cartTableBody')) {
      if (initPending) return; // a retry is already scheduled — bail out
      initPending = true;
      setTimeout(() => {
        initPending = false;
        init();
      }, 80);
      return;
    }

    // Fragment is in DOM — proceed with one-time setup and per-navigation refresh
    if (!initialized) {
      initialized = true;
      attachEvents(); // runs exactly once; inner guard as backup
    }

    // Refresh display state on every /pos navigation (safe — no listeners added)
    C().renderCart();
    C().updateDisplayTotals();
    C().setBillingMode(C().getBillingMode());
    document
      .querySelector('.epos-invoice-summary-discount')
      ?.setAttribute(
        'data-discount-mode',
        document.getElementById('posDiscountType')?.value || 'amount'
      );
    C().setPaymentMethod(C().getCart().paymentMethod || 'Cash');
    A().loadCustomers('');
    A().loadHeldSales();
    setTimeout(() => document.getElementById('posBarcodeInput')?.focus(), 40);
    LOG('init() complete — module ready');
  }

  window.initBillingModule = init;
})();
