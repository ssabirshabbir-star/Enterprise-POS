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
  let productSearchSeq = 0;
  let customerLoadSeq = 0;
  let heldSalesLoadSeq = 0;
  let cTimer = null; // customer search debounce — module-scoped for clarity
  let pendingPriceUnlock = null;

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = () => {};

  /** Live references — resolved at call-time so load order is safe */
  const C = () => window.BillingCart;
  const A = () => window.BillingApi;

  const UI = {
    ids: {
      posPanel: 'posModule',
      cartTableBody: 'cartTableBody',
      scanInput: 'posBarcodeInput',
      searchFocusButton: 'posSearchFocusButton',
      searchResults: 'posSearchResults',
      discountInput: 'cartDiscount',
      discountType: 'posDiscountType',
      taxInput: 'cartTax',
      paidAmount: 'paidAmount',
      autoAdvanceUnitPrice: 'posAutoAdvanceUnitPrice',
      subtotalDiscountButton: 'posSubtotalDiscountButton',
      holdSaleButton: 'holdSaleButton',
      heldSalesList: 'heldSalesList',
      customerSelect: 'customerSelect',
      customerSearch: 'customerSearch',
      completeSaleButton: 'completeSaleButton',
      clearCartButton: 'clearCartButton',
      thermalPrintButton: 'thermalPrintButton',
      priceUnlockModal: 'posPriceUnlockModal',
      priceUnlockForm: 'posPriceUnlockModalForm',
      priceUnlockReason: 'posPriceUnlockReason',
      priceUnlockProduct: 'posPriceUnlockProduct',
      priceUnlockMessage: 'posPriceUnlockMessage',
    },
    selectors: {
      hiddenControls: '.epos-billing-hidden-controls',
      hiddenInteractive:
        '.epos-billing-hidden-controls button, .epos-billing-hidden-controls input, .epos-billing-hidden-controls select, .epos-billing-hidden-controls textarea, .epos-billing-hidden-controls a, .epos-billing-hidden-controls [tabindex]',
      searchResultButton: '[data-product-id]',
      removeItem: '[data-remove-item]',
      incItem: '[data-inc-item]',
      decItem: '[data-dec-item]',
      paymentButton: '[data-payment-set]',
      cartTab: '[data-pos-cart]',
      customerClose: '[data-pos-customer-close]',
      priceUnlockClose: '[data-pos-price-unlock-close]',
      discountModeWrap: '.epos-invoice-summary-discount',
    },
  };

  function $id(key) {
    return document.getElementById(UI.ids[key] || key);
  }

  function isHiddenControlTarget(target) {
    return Boolean(target?.closest?.(UI.selectors.hiddenControls));
  }

  function blockHiddenControlEvent(e) {
    if (!isHiddenControlTarget(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function disableHiddenControls() {
    document.querySelectorAll(UI.selectors.hiddenInteractive).forEach((el) => {
      el.tabIndex = -1;
    });
  }

  function checkFeature(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  function requireFeature(featureId) {
    const gate = checkFeature(featureId);
    if (!gate.ok && gate.visible !== false) C().showMsg(gate.message, true);
    return gate.ok;
  }

  async function currentProfile() {
    try {
      const result = await window.AuthApi?.profile?.();
      return result?.ok ? result.profile : null;
    } catch {
      return null;
    }
  }

  function ensurePriceUnlockModal() {
    if ($id('priceUnlockModal')) return;
    const shell = document.querySelector('.epos-billing-shell');
    if (!shell) return;
    const modal = document.createElement('div');
    modal.id = UI.ids.priceUnlockModal;
    modal.className = 'epos-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'posPriceUnlockModalTitle');
    modal.innerHTML = `
      <div class="epos-modal-backdrop" data-pos-price-unlock-close></div>
      <form id="${UI.ids.priceUnlockForm}" class="epos-modal-card epos-modal-sm epos-form">
        <div class="epos-modal-head">
          <div>
            <span class="epos-modal-kicker">Authorized Price Override</span>
            <h3 id="posPriceUnlockModalTitle" class="epos-modal-title">Unlock Unit Price</h3>
          </div>
          <button type="button" class="epos-modal-close" data-pos-price-unlock-close aria-label="Close price unlock form">&times;</button>
        </div>
        <div class="epos-modal-body">
          <div class="epos-form-grid">
            <p id="${UI.ids.priceUnlockProduct}" class="epos-form-field wide"></p>
            <label class="epos-form-field wide">
              <span class="epos-form-label">Reason</span>
              <textarea id="${UI.ids.priceUnlockReason}" required maxlength="500" placeholder="Enter the reason for this unit price override"></textarea>
            </label>
          </div>
          <p id="${UI.ids.priceUnlockMessage}" class="hidden rounded-md px-3 py-2 text-sm" role="status"></p>
        </div>
        <div class="epos-form-actions">
          <button type="button" class="epos-form-action-secondary" data-pos-price-unlock-close>Cancel</button>
          <button type="submit" class="epos-form-action-primary">Unlock Price</button>
        </div>
      </form>`;
    shell.appendChild(modal);
  }

  async function unlockPriceFromUI(index) {
    const item = C().getCart().items[index];
    if (!item || item.allowSalePriceOverride !== true) {
      C().showMsg('This product price is locked by product policy.', true);
      return;
    }
    const profile = await currentProfile();
    if (profile?.role !== 'Admin') {
      C().showMsg('Only Admin can unlock unit price changes.', true);
      return;
    }
    let confirmed = false;
    try {
      confirmed = await window.posApi.dialog.confirm(
        `Unlock unit price for ${item.name}? This price change will be audited.`
      );
    } catch {
      confirmed = false;
    }
    if (!confirmed) return;
    openPriceUnlockReason(index, item);
  }

  function showPriceUnlockMessage(message) {
    const el = $id('priceUnlockMessage');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
  }

  function closePriceUnlockReason() {
    $id('priceUnlockModal')?.classList.add('hidden');
    $id('priceUnlockForm')?.reset();
    showPriceUnlockMessage('');
    pendingPriceUnlock = null;
  }

  function openPriceUnlockReason(index, item) {
    pendingPriceUnlock = { index, productId: Number(item.productId) };
    const product = $id('priceUnlockProduct');
    if (product) product.textContent = `Product: ${item.name}`;
    $id('priceUnlockForm')?.reset();
    showPriceUnlockMessage('');
    $id('priceUnlockModal')?.classList.remove('hidden');
    setTimeout(() => $id('priceUnlockReason')?.focus(), 0);
  }

  async function submitPriceUnlockReason(e) {
    e.preventDefault();
    const pending = pendingPriceUnlock;
    const item = pending ? C().getCart().items[pending.index] : null;
    if (
      !item ||
      Number(item.productId) !== pending.productId ||
      item.allowSalePriceOverride !== true
    ) {
      showPriceUnlockMessage('The selected cart item is no longer available for price override.');
      return;
    }
    const profile = await currentProfile();
    if (profile?.role !== 'Admin') {
      showPriceUnlockMessage('Only Admin can unlock unit price changes.');
      return;
    }
    const reason = String($id('priceUnlockReason')?.value || '').trim();
    if (!reason) {
      showPriceUnlockMessage('Price unlock reason is required.');
      return;
    }
    if (!C().unlockCartItemPrice(pending.index, reason)) {
      showPriceUnlockMessage('Unable to unlock this unit price.');
      return;
    }
    closePriceUnlockReason();
    C().showMsg('Unit price unlocked for this item.');
  }

  async function refreshBillingLiveState(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};

    C().renderCart();
    C().updateDisplayTotals();

    if (opts.receipt) C().renderReceiptPreview(opts.receipt);
    if (opts.refreshCustomers) await loadCustomersFromUI(opts.customerSearch || '');
    if (opts.refreshHeldSales) await loadHeldSalesFromUI();

    return { ok: true };
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  function onKeyDown(e) {
    // Only active when the POS panel is visible
    if ($id('posPanel')?.classList.contains('hidden')) return;
    if (!$id('priceUnlockModal')?.classList.contains('hidden')) {
      if (e.key === 'Escape') closePriceUnlockReason();
      return;
    }

    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const inInput =
      ['input', 'textarea', 'select'].includes(tag) &&
      document.activeElement?.id !== 'posBarcodeInput';

    // Function keys — always captured when POS is visible
    if (e.key === 'F4') {
      e.preventDefault();
      completeSaleFromUI();
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
      const el = $id('discountInput');
      el?.focus();
      el?.select();
      return;
    }
    if (e.key === 'F9') {
      e.preventDefault();
      requireFeature('billing.split_payment_placeholder');
      return;
    }
    if (e.key === 'F10') {
      e.preventDefault();
      printReceiptFromUI();
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      downloadPdfFromUI();
      return;
    }
    if (e.key === 'F12') {
      e.preventDefault();
      reprintLastBillFromUI();
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
      if (k === 'l') {
        e.preventDefault();
        const index = C().getActiveCartRowIndex?.();
        if (Number.isInteger(index) && index >= 0) unlockPriceFromUI(index);
        else C().showMsg('Select a cart row before unlocking unit price.', true);
        return;
      }
      if (k === 'w') {
        e.preventDefault();
        const whatsAppButton = $id('posWhatsappButton');
        if (whatsAppButton?.disabled || whatsAppButton?.getAttribute('aria-disabled') === 'true') {
          C().showMsg('WhatsApp sharing is not available yet.', true);
          return;
        }
        sendWhatsAppFromUI();
        return;
      }
      if (k === 'r') {
        e.preventDefault();
        validateSaleAction('refund');
        return;
      }
      if (k === 'e') {
        e.preventDefault();
        validateSaleAction('exchange');
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        clearCartConfirmFromUI();
        return;
      }
    }

    if (!inInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        C().moveActiveCartRow(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
    }

    // Auto-focus search bar on any printable key when not in a different input
    if (!inInput && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const src = $id('scanInput');
      if (src && document.activeElement !== src) src.focus();
    }
  }

  async function searchProductsFromUI(query) {
    const q = String(query || '').trim();
    const seq = ++productSearchSeq;
    if (!q) {
      C().clearSearchResults();
      return;
    }
    const res = await A().searchProducts(q);
    if (seq !== productSearchSeq) return;
    if (!res?.ok) {
      C().clearSearchResults();
      C().showMsg(res?.message || 'Unable to search products. Please try again.', true);
      return;
    }
    const products = res.products || [];
    if (res.exact && res.product) {
      C().addToCart(res.product);
      return;
    }
    if (!products.length) {
      C().renderSearchResults(q, []);
      return;
    }
    if (products.length === 1) {
      C().addToCart(products[0]);
      return;
    }
    C().renderSearchResults(q, products);
  }

  async function loadCustomersFromUI(search) {
    const seq = ++customerLoadSeq;
    const res = await A().loadCustomers(search || '');
    if (seq !== customerLoadSeq) return;
    if (!res?.ok) return;
    C().setCustomers(res.customers || []);
    C().renderCustomerSelect();
  }

  async function saveCustomerFromUI(e) {
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
      const res = await A().createCustomer(payload);
      if (!res?.ok) {
        C().showModalMsg(res?.message || 'Unable to add customer. Please try again.', true);
        return;
      }
      C().loadCustomerIntoCart(res.customer);
      C().closeCustomerModal();
      await refreshBillingLiveState();
      C().showMsg(`Customer "${C().esc(res.customer.name)}" added and selected.`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function completeSaleFromUI() {
    const btn = $id('completeSaleButton');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.7';
    }
    try {
      const payload = C().getCartPayload();
      if (!['Cash', 'Card', 'Bank', 'Credit'].includes(payload.paymentMethod)) {
        C().showMsg('Please select a valid payment method.', true);
        return;
      }
      if (payload.paymentMethod === 'Credit' && !payload.customerId) {
        C().showMsg('Credit payment requires selecting a registered customer.', true);
        return;
      }
      const selectedCustomerId = C().getCart().customerId || $id('customerSelect')?.value;
      const receiptCustomer = C()
        .getCustomers()
        .find((c) => String(c.id) === String(selectedCustomerId));
      const res = await A().completeSale(payload);
      if (!res?.ok) {
        C().showMsg(res?.message || 'Unable to complete the sale. Please try again.', true);
        return;
      }
      if (receiptCustomer && res.receipt) {
        res.receipt.customerId = receiptCustomer.id;
        res.receipt.customerName = res.receipt.customerName || receiptCustomer.name;
        res.receipt.customerPhone = receiptCustomer.phone || '';
      }
      C().setLastReceipt(res.receipt);
      await refreshBillingLiveState({ receipt: res.receipt });
      tryAutoPrint(res.receipt);
      C().clearCartDisplay();
      await refreshBillingLiveState({ refreshCustomers: true });
      const invoicePart = `Sale complete. Receipt: ${res.receipt?.invoiceNumber || ''}`;
      if (res.receipt?.luckyDrawCoupons?.length) {
        const coupon = res.receipt.luckyDrawCoupons[0];
        C().showMsg(`${invoicePart} Lucky Draw entry: ${coupon.couponNo} - ${coupon.campaignName}`);
      } else {
        C().showMsg(invoicePart);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    }
  }

  async function holdSaleFromUI() {
    if (!requireFeature('billing.hold_sale')) return;
    const cart = C().getCart();
    const holdPayload = {
      items: cart.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: Number(i.displayTotal) || 0,
        originalUnitPrice: i.originalUnitPrice,
        priceOverrideReason: i.priceOverrideReason,
        priceUnlocked: i.priceUnlocked === true,
        allowSalePriceOverride: i.allowSalePriceOverride === true,
      })),
      customerId: cart.customerId || null,
      note: `Cart ${C().getActiveCart() + 1} - ${cart.items.length} items`,
    };
    const res = await A().holdSale(holdPayload);
    if (!res?.ok) {
      C().showMsg(res?.message || 'Unable to hold this sale. Please try again.', true);
      return;
    }
    C().showMsg('Sale held. Use the held sales list to resume it.');
    C().clearCartDisplay();
    await refreshBillingLiveState({ refreshHeldSales: true });
  }

  async function loadHeldSalesFromUI() {
    const seq = ++heldSalesLoadSeq;
    const res = await A().loadHeldSales();
    if (seq !== heldSalesLoadSeq) return;
    if (res?.ok) C().renderHeldSalesList(res.holds || []);
  }

  async function restoreHoldFromUI(holdId) {
    if (!requireFeature('billing.held_sales_resume_delete')) return;
    const holds = $id('heldSalesList')?._holds || [];
    const hold = holds.find((h) => String(h.id) === String(holdId));
    if (!hold?.payload?.items?.length) return;
    C().restoreHeldItemsToCart(hold);
    await A().deleteHeldSale(holdId);
    await refreshBillingLiveState({ refreshHeldSales: true });
    C().showMsg(`Sale restored (${hold.payload.items.length} items).`);
  }

  async function deleteHoldFromUI(holdId) {
    if (!requireFeature('billing.held_sales_resume_delete')) return;
    let ok = false;
    try {
      ok = await window.posApi.dialog.confirm('Delete held sale?');
    } catch {
      ok = true;
    }
    if (!ok) return;
    const res = await A().deleteHeldSale(holdId);
    if (!res?.ok) {
      C().showMsg(res?.message || 'Unable to delete held sale.', true);
      return;
    }
    await refreshBillingLiveState({ refreshHeldSales: true });
    C().showMsg('Held sale deleted.');
  }

  async function tryAutoPrint(receipt) {
    const res = await A().getPrintSettings();
    const settings = res?.settings?.settings || res?.settings;
    if (settings?.autoPrint) await printReceiptFromUI(receipt);
  }

  async function printReceiptFromUI(receipt) {
    const r = receipt || C().getLastReceipt();
    if (!r) {
      C().showMsg('No receipt available to print.', true);
      return;
    }
    const res = await A().printReceipt(r);
    C().showMsg(res?.message || 'Unable to print receipt.', !res?.ok);
  }

  async function downloadPdfFromUI() {
    if (!requireFeature('billing.export_receipt_pdf')) return;
    const receipt = C().getLastReceipt();
    if (!receipt) {
      C().showMsg('Complete a sale first.', true);
      return;
    }
    const res = await A().downloadReceiptPdf(receipt);
    if (res?.canceled) return;
    C().showMsg(res?.message || 'Unable to export receipt PDF.', !res?.ok);
  }

  async function reprintLastBillFromUI() {
    if (!requireFeature('billing.reprint_receipt')) return;
    if (C().getLastReceipt()) {
      await printReceiptFromUI(C().getLastReceipt());
      return;
    }
    const res = await A().getLastReceipt();
    if (!res?.ok || !res.receipt) {
      C().showMsg(res?.message || 'No previous sale found.', true);
      return;
    }
    C().setLastReceipt(res.receipt);
    C().renderReceiptPreview(res.receipt);
    await printReceiptFromUI(res.receipt);
  }

  function validateSaleAction(action) {
    requireFeature(
      action === 'refund' ? 'billing.return_placeholder' : 'billing.exchange_placeholder'
    );
  }

  async function sendWhatsAppFromUI() {
    if (!requireFeature('billing.whatsapp_receipt_share')) return;
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
      `Dear ${customerName},\nReceipt: ${r.invoiceNumber}\nTotal: Rs.${C().fmt(r.grandTotal)}\nDate: ${new Date(r.createdAt || Date.now()).toLocaleDateString()}\nThank you!`
    );
    const res = await A().sendReceiptWhatsApp(`https://wa.me/${digits}?text=${text}`);
    if (!res?.ok) C().showMsg(res?.message || 'Unable to open link.', true);
  }

  async function clearCartConfirmFromUI() {
    if (!C().getCart().items.length) return;
    let ok = false;
    try {
      ok = await window.posApi.dialog.confirm('Clear current cart?');
    } catch {
      ok = true;
    }
    if (ok) {
      C().clearCartDisplay();
      C().showMsg('Cart cleared.');
    }
  }

  function renderUI() {
    C().renderCart();
    C().updateDisplayTotals();
  }

  function updateUI(diff) {
    if (diff?.paymentMethod) C().setPaymentMethod(diff.paymentMethod);
    renderUI();
  }

  function destroyUI() {
    // TODO: Add teardown when Billing gains route-level unmounting.
  }

  // ── Event binding (idempotent) ────────────────────────────────────────────

  function attachEvents() {
    if (eventsAttached) return; // idempotency guard — runs exactly once per session
    eventsAttached = true;
    disableHiddenControls();
    document.addEventListener('click', blockHiddenControlEvent, true);
    document.addEventListener('keydown', blockHiddenControlEvent, true);
    function syncDiscountMode() {
      const mode = $id('discountType')?.value || 'amount';
      document
        .querySelector(UI.selectors.discountModeWrap)
        ?.setAttribute('data-discount-mode', mode);
    }
    LOG('attachEvents() running — will not repeat this session');

    // ── Search ──────────────────────────────────────────────────────────────
    const si = $id('scanInput');
    if (si) {
      si.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const v = e.target.value.trim();
        if (!v) {
          C().clearSearchResults();
          return;
        }
        searchTimer = setTimeout(() => searchProductsFromUI(v), 220);
      });
      si.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(searchTimer);
          searchProductsFromUI(e.target.value.trim());
        }
        if (e.key === 'Escape') {
          e.target.value = '';
          C().clearSearchResults();
        }
        if (e.key === 'ArrowDown') {
          const first = document
            .getElementById(UI.ids.searchResults)
            ?.querySelector(UI.selectors.searchResultButton);
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }
      });
      $id('searchFocusButton')?.addEventListener('click', () => si.focus());
    }

    // ── Search results (event delegation) ───────────────────────────────────
    $id('searchResults')?.addEventListener('click', (e) => {
      const btn = e.target.closest(UI.selectors.searchResultButton);
      if (!btn) return;
      const products = $id('searchResults')?._products || [];
      const product = products.find((p) => String(p.id) === btn.dataset.productId);
      if (product) {
        C().addToCart(product);
        if (si) si.value = '';
      }
    });

    // ── Cart table (event delegation) ────────────────────────────────────────
    const tbody = $id('cartTableBody');
    if (tbody) {
      const updateCartInput = (e) => {
        const el = e.target;
        if (el.dataset.cartQty !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartQty), 'qty', el.value);
        if (el.dataset.cartPrice !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartPrice), 'price', el.value, {
            commit: e.type === 'change',
          });
        if (el.dataset.cartDisc !== undefined)
          C().refreshCartItemDisplay(Number(el.dataset.cartDisc), 'disc', el.value);
      };
      tbody.addEventListener('input', updateCartInput);
      tbody.addEventListener('change', updateCartInput);
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('[data-cart-row]');
        if (row) C().setActiveCartRow(Number(row.dataset.cartRow));

        const unlock = e.target.closest('[data-unlock-price]');
        if (unlock) {
          unlockPriceFromUI(Number(unlock.dataset.unlockPrice));
          return;
        }

        const btn = e.target.closest(UI.selectors.removeItem);
        if (btn) {
          C().removeCartItem(Number(btn.dataset.removeItem));
          return;
        }

        const inc = e.target.closest(UI.selectors.incItem);
        if (inc) {
          const idx = Number(inc.dataset.incItem);
          const item = C().getCart().items[idx];
          if (item) C().refreshCartItemDisplay(idx, 'qty', Number((item.quantity + 1).toFixed(3)));
          return;
        }

        const dec = e.target.closest(UI.selectors.decItem);
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
    [UI.ids.discountInput, UI.ids.taxInput].forEach((id) =>
      document.getElementById(id)?.addEventListener('input', () => C().updateDisplayTotals())
    );
    $id('paidAmount')?.addEventListener('input', () => {
      C().markPaidAmountManual();
      C().updateDisplayTotals();
    });
    $id('discountType')?.addEventListener('change', () => {
      syncDiscountMode();
      C().updateDisplayTotals();
    });
    const autoAdvanceToggle = $id('autoAdvanceUnitPrice');
    if (autoAdvanceToggle) {
      C().setAutoAdvanceUnitPrice(autoAdvanceToggle.checked);
      autoAdvanceToggle.addEventListener('change', () =>
        C().setAutoAdvanceUnitPrice(autoAdvanceToggle.checked)
      );
    }

    // ── Payment method buttons ───────────────────────────────────────────────
    document
      .querySelectorAll(UI.selectors.paymentButton)
      .forEach((btn) =>
        btn.addEventListener('click', () => C().setPaymentMethod(btn.dataset.paymentSet))
      );
    $id('subtotalDiscountButton')?.addEventListener('click', () => {
      const el = $id('discountInput');
      el?.focus();
      el?.select();
    });
    document
      .getElementById('syncPosButton')
      ?.addEventListener('click', () => requireFeature('billing.sync_placeholder'));

    // ── Sale action buttons ──────────────────────────────────────────────────
    document
      .getElementById(UI.ids.completeSaleButton)
      ?.addEventListener('click', completeSaleFromUI);
    $id('holdSaleButton')?.addEventListener('click', holdSaleFromUI);
    document
      .getElementById('thermalPrintButton')
      ?.addEventListener('click', () => printReceiptFromUI());
    document
      .getElementById('thermalPrintMirrorButton')
      ?.addEventListener('click', () => printReceiptFromUI());
    document.getElementById('posDownloadPdfButton')?.addEventListener('click', downloadPdfFromUI);
    document
      .getElementById('reprintLastBillButton')
      ?.addEventListener('click', reprintLastBillFromUI);
    document.getElementById('clearCartButton')?.addEventListener('click', clearCartConfirmFromUI);
    document
      .getElementById('refundSaleButton')
      ?.addEventListener('click', () => validateSaleAction('refund'));
    document
      .getElementById('exchangeSaleButton')
      ?.addEventListener('click', () => validateSaleAction('exchange'));
    document.getElementById('posWhatsappButton')?.addEventListener('click', sendWhatsAppFromUI);

    // ── Held sales list (event delegation) ───────────────────────────────────
    $id('heldSalesList')?.addEventListener('click', (e) => {
      const r = e.target.closest('[data-restore-hold]');
      if (r) {
        restoreHoldFromUI(r.dataset.restoreHold);
        return;
      }
      const d = e.target.closest('[data-delete-hold]');
      if (d) deleteHoldFromUI(d.dataset.deleteHold);
    });

    // ── Cart switcher ────────────────────────────────────────────────────────
    document
      .querySelectorAll(UI.selectors.cartTab)
      .forEach((btn) =>
        btn.addEventListener('click', () => C().switchToCart(Number(btn.dataset.posCart)))
      );

    // ── Billing mode ─────────────────────────────────────────────────────────
    document
      .getElementById('retailModeButton')
      ?.addEventListener('click', () => C().setBillingMode('retail'));
    document.getElementById('wholesaleModeButton')?.addEventListener('click', () => {
      if (requireFeature('billing.retail_wholesale_mode_toggle')) {
        C().setBillingMode('wholesale');
      }
    });

    // ── Customer select ───────────────────────────────────────────────────────
    $id('customerSelect')?.addEventListener('change', (e) => {
      C().setCartCustomer(e.target.value); // controlled setter — no raw cart mutation
      C().updateCustomerBalanceDisplay();
    });

    // ── Customer live search (hidden input) ───────────────────────────────────
    // cTimer is module-scoped (declared above) for clarity — not closure-local
    $id('customerSearch')?.addEventListener('input', (e) => {
      clearTimeout(cTimer);
      cTimer = setTimeout(() => loadCustomersFromUI(e.target.value), 300);
    });

    // ── Customer modal ────────────────────────────────────────────────────────
    document
      .getElementById('posCustomerAddButton')
      ?.addEventListener('click', () => C().openCustomerModal());
    document
      .getElementById('quickCustomerFocusButton')
      ?.addEventListener('click', () => C().openCustomerModal());
    document.getElementById('posCustomerModalForm')?.addEventListener('submit', saveCustomerFromUI);
    document
      .querySelectorAll(UI.selectors.customerClose)
      .forEach((el) => el.addEventListener('click', () => C().closeCustomerModal()));

    // ── Authorized unit-price override modal ─────────────────────────────────
    $id('priceUnlockForm')?.addEventListener('submit', submitPriceUnlockReason);
    document
      .querySelectorAll(UI.selectors.priceUnlockClose)
      .forEach((el) => el.addEventListener('click', closePriceUnlockReason));

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
    if (!$id('cartTableBody')) {
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
      ensurePriceUnlockModal();
      attachEvents(); // runs exactly once; inner guard as backup
    }

    // Refresh display state on every /pos navigation (safe — no listeners added)
    renderUI();
    C().setBillingMode(C().getBillingMode());
    document
      .querySelector(UI.selectors.discountModeWrap)
      ?.setAttribute('data-discount-mode', $id('discountType')?.value || 'amount');
    C().setPaymentMethod(C().getCart().paymentMethod || 'Cash');
    loadCustomersFromUI('');
    loadHeldSalesFromUI();
    setTimeout(() => $id('scanInput')?.focus(), 40);
    LOG('init() complete — module ready');
  }

  window.BillingRenderer = {
    renderUI,
    updateUI,
    refreshBillingLiveState,
    destroyUI,
  };

  window.initBillingModule = init;
})();
