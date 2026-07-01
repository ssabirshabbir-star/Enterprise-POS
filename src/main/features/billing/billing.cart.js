/**
 * billing.cart.js — Billing Cart UI State Manager
 *
 * File:      src/main/features/billing/billing.cart.js
 * Reason:    Isolated cart display state for billing module split
 * Risk:      LOW — UI state only, no IPC, no backend
 * Rollback:  Delete file; revert billing.renderer.js to pre-split version
 *
 * RESPONSIBILITY: Cart display state management (presentation layer only).
 * Exposes:   window.BillingCart
 * Depends on: nothing (self-contained UI state)
 *
 * NOT ALLOWED in this file:
 *   - window.posApi calls
 *   - Business rule enforcement
 *   - Validation logic
 *   - Cross-module state
 */
(function BillingCartModule() {
  'use strict';

  // ── Presentation-only state ───────────────────────────────────────────────

  const MAX_CARTS = 3;
  const carts = Array.from({ length: MAX_CARTS }, makeEmptyCart);
  let activeCart = 0;
  let billingMode = 'retail'; // price column selection — display only
  let customers = [];
  let lastReceipt = null;
  let paidAmountManual = false;
  let autoAdvanceUnitPrice = true;

  const UI = {
    ids: {
      message: 'posMessage',
      modalMessage: 'posCustomerModalMessage',
      scanInput: 'posBarcodeInput',
      searchResults: 'posSearchResults',
      cartTableBody: 'cartTableBody',
      cartEmptyState: 'cartEmptyState',
      cartCountLabel: 'posCartCountLabel',
      discountInput: 'cartDiscount',
      discountType: 'posDiscountType',
      taxInput: 'cartTax',
      paidAmount: 'paidAmount',
      grandTotal: 'posGrandTotal',
      payButtonAmount: 'posPayButtonAmount',
      subtotal: 'posSubtotal',
      changeAmount: 'changeAmount',
      totalItems: 'posTotalItems',
      totalQuantity: 'posTotalQuantity',
      paymentMethod: 'paymentMethod',
      retailModeButton: 'retailModeButton',
      wholesaleModeButton: 'wholesaleModeButton',
      customerSelect: 'customerSelect',
      customerBalance: 'posCustomerBalance',
      customerModal: 'posCustomerModal',
      customerModalForm: 'posCustomerModalForm',
      customerNameInput: 'posCustomerNameInput',
      receiptPreview: 'receiptPreview',
      heldSalesList: 'heldSalesList',
    },
    selectors: {
      cartTab: '[data-pos-cart]',
      paymentButton: '[data-payment-set]',
      cartRow: (index) => `tr[data-cart-row="${index}"]`,
      cartQty: (index) => `[data-cart-qty="${index}"]`,
      cartDisc: (index) => `[data-cart-disc="${index}"]`,
      cartLineTotal: '[data-cart-line-total]',
      cartLineTotalWrap: '.epos-cart-line-total',
      discountModeWrap: '.epos-invoice-summary-discount',
      searchResultButton: '[data-product-id]',
    },
    data: {
      productId: 'productId',
    },
  };

  function makeEmptyCart() {
    return { items: [], customerId: null, paymentMethod: 'Cash' };
  }

  // ── DOM / format utilities ────────────────────────────────────────────────

  function $id(id) {
    return document.getElementById(id);
  }

  function ui(idKey) {
    return $id(UI.ids[idKey]);
  }

  function uiAll(selectorKey) {
    return document.querySelectorAll(UI.selectors[selectorKey]);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Presentation-only number format — not a business rule */
  function fmt(v) {
    return Number(v || 0).toFixed(2);
  }

  function setEl(id, v) {
    const e = $id(id);
    if (e) e.textContent = v;
  }

  // ── Feedback display (UI messages only) ───────────────────────────────────

  let _msgTimer = null;

  function showMsg(text, isError) {
    const el = ui('message');
    if (!el) return;
    el.textContent = text;
    el.className = `epos-pos-message ${isError ? 'epos-pos-message-error' : 'epos-pos-message-success'}`;
    el.removeAttribute('style');
    el.classList.remove('hidden');
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  function getPayableTotal() {
    const items = getCart().items;
    const displaySub = items.reduce((s, i) => s + (Number(i.displayTotal) || 0), 0);
    const rawDiscount = parseFloat(ui('discountInput')?.value || '0') || 0;
    const discType = ui('discountType')?.value || 'amount';
    const displayDisc = discType === 'percentage' ? (displaySub * rawDiscount) / 100 : rawDiscount;
    const displayTax = parseFloat(ui('taxInput')?.value || '0') || 0;
    return Math.max(displaySub - displayDisc + displayTax, 0);
  }

  function showModalMsg(text, isError) {
    const el = ui('modalMessage');
    if (!el) return;
    el.textContent = text;
    el.style.cssText = isError ? 'color:#b91c1c' : 'color:#166534';
    el.classList.remove('hidden');
  }

  // ── State accessors ───────────────────────────────────────────────────────

  function getCart() {
    return carts[activeCart];
  }
  function getActiveCart() {
    return activeCart;
  }
  function getCustomers() {
    return customers;
  }
  function setCustomers(arr) {
    customers = Array.isArray(arr) ? arr : [];
  }
  function getLastReceipt() {
    return lastReceipt;
  }
  function setLastReceipt(r) {
    lastReceipt = r;
  }
  function getBillingMode() {
    return billingMode;
  }
  function setAutoAdvanceUnitPrice(enabled) {
    autoAdvanceUnitPrice = enabled !== false;
  }
  function getAutoAdvanceUnitPrice() {
    return autoAdvanceUnitPrice;
  }

  /**
   * Controlled setter for cart customer ID.
   * All external and internal writes to cart.customerId must go through here.
   * Keeps customer ID changes as a single source of truth within BillingCart.
   */
  function setCartCustomer(id) {
    carts[activeCart].customerId = id || null;
  }

  function readyScanInput() {
    const si = ui('scanInput');
    if (!si) return;
    si.value = '';
    si.focus({ preventScroll: true });
  }

  function pulseElement(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    clearTimeout(el._eposPulseTimer);
    el._eposPulseTimer = setTimeout(() => el.classList.remove(className), 700);
  }

  function pulseCartRow(index) {
    const row = ui('cartTableBody')?.querySelector(UI.selectors.cartRow(index));
    pulseElement(row, 'epos-cart-row-updated');
    pulseElement(row?.querySelector(UI.selectors.cartLineTotalWrap), 'epos-cart-total-updated');
  }

  function pulseSummaryTotals() {
    pulseElement(ui('grandTotal'), 'epos-cart-total-updated');
    pulseElement(ui('payButtonAmount'), 'epos-cart-total-updated');
  }

  // ── Cart mutations ────────────────────────────────────────────────────────

  function addToCart(product) {
    const stock = Number(product.currentStock);
    if (Number.isFinite(stock) && stock <= 0) {
      showMsg('This product is out of stock.', true);
      return;
    }
    const price =
      billingMode === 'wholesale' && Number(product.wholesalePrice) > 0
        ? Number(product.wholesalePrice)
        : Number(product.salePrice);

    const existingIndex = getCart().items.findIndex((i) => i.productId === product.id);
    const existing = getCart().items[existingIndex];
    let changedIndex = existingIndex;
    if (existing) {
      if (Number.isFinite(stock) && existing.quantity + 1 > stock) {
        showMsg('Quantity cannot exceed available stock.', true);
        return;
      }
      existing.quantity = Number((existing.quantity + 1).toFixed(3));
      existing.displayTotal = Math.max(
        existing.quantity * existing.unitPrice - existing.discount,
        0
      );
    } else {
      changedIndex = getCart().items.length;
      getCart().items.push({
        productId: product.id,
        name: product.name,
        sku: product.sku || '',
        currentStock: Number(product.currentStock || 0),
        quantity: 1,
        unitPrice: price,
        discount: 0,
        displayTotal: Number(price.toFixed(2)),
        unit: product.unit || 'pcs',
        allowSalePriceOverride: product.allowSalePriceOverride === true,
        trackExpiry: product.trackExpiry === true,
        expiryRequired: product.expiryRequired === true,
      });
    }
    renderCart();
    pulseCartRow(changedIndex);
    pulseSummaryTotals();
    clearSearchResults();
    readyScanInput();
  }

  function removeCartItem(index) {
    getCart().items.splice(index, 1);
    renderCart();
  }

  function clearCartDisplay() {
    carts[activeCart] = makeEmptyCart();
    paidAmountManual = false;
    renderCart();
    renderCustomerSelect();
    [UI.ids.discountInput, UI.ids.taxInput, UI.ids.paidAmount].forEach((id) => {
      const e = $id(id);
      if (e) e.value = '0';
    });
    setPaymentMethod('Cash');
    // Always clear stale feedback messages on full cart reset
    clearTimeout(_msgTimer);
    const msgEl = ui('message');
    if (msgEl) msgEl.classList.add('hidden');
  }

  function switchToCart(index) {
    activeCart = Math.max(0, Math.min(index, MAX_CARTS - 1));
    paidAmountManual = false;
    uiAll('cartTab').forEach((btn) => {
      const on = Number(btn.dataset.posCart) === activeCart;
      btn.classList.toggle('epos-cart-tab-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    renderCart();
    renderCustomerSelect();
    setPaymentMethod(getCart().paymentMethod);
    [UI.ids.discountInput, UI.ids.paidAmount].forEach((id) => {
      const e = $id(id);
      if (e) e.value = '0';
    });
  }

  /**
   * Update one cart item field from user input, then refresh display totals.
   * displayTotal arithmetic is presentation-only; billing.service.js
   * recalculates authoritatively when completeSale is called.
   */
  function updateCartRowDisplay(index) {
    const item = getCart().items[index];
    const row = ui('cartTableBody')?.querySelector(UI.selectors.cartRow(index));
    if (!item || !row) return;
    const qtyInput = row.querySelector(UI.selectors.cartQty(index));
    const discInput = row.querySelector(UI.selectors.cartDisc(index));
    const totalEl = row.querySelector(UI.selectors.cartLineTotal);
    if (qtyInput) qtyInput.value = item.quantity;
    if (discInput) discInput.value = item.discount;
    if (totalEl) totalEl.textContent = fmt(item.displayTotal);
  }

  function refreshCartItemDisplay(index, field, value) {
    const item = getCart().items[index];
    if (!item) return;
    if (field === 'qty' && String(value).trim() === '') return;
    const v = parseFloat(value) || 0;
    if (field === 'qty') {
      if (v < 1) {
        showMsg('Quantity must be at least 1.', true);
        updateCartRowDisplay(index);
        return;
      }
      if (
        Number.isFinite(Number(item.currentStock)) &&
        Number(item.currentStock) >= 0 &&
        v > Number(item.currentStock)
      ) {
        showMsg('Quantity cannot exceed available stock.', true);
        updateCartRowDisplay(index);
        return;
      }
      item.quantity = v;
    }
    if (field === 'price') item.unitPrice = v;
    if (field === 'disc') item.discount = v;
    item.displayTotal = Math.max(item.quantity * item.unitPrice - item.discount, 0);
    updateCartRowDisplay(index);
    updateDisplayTotals();
    if (field === 'qty' || field === 'disc') {
      pulseCartRow(index);
      pulseSummaryTotals();
    }
    if (field === 'price' && autoAdvanceUnitPrice) renderCart();
  }

  // ── Cart rendering ────────────────────────────────────────────────────────

  function renderCart() {
    const tbody = ui('cartTableBody');
    const emptyEl = ui('cartEmptyState');
    const countLbl = ui('cartCountLabel');
    if (!tbody) return;

    const items = getCart().items;
    const count = items.length;

    if (countLbl) countLbl.textContent = `(${count} Item${count !== 1 ? 's' : ''})`;
    const badge = document.querySelector(
      `${UI.selectors.cartTab}[data-pos-cart="${activeCart}"] strong`
    );
    if (badge) badge.textContent = String(count);

    if (!count) {
      tbody.innerHTML = '';
      emptyEl && emptyEl.classList.remove('hidden');
      updateDisplayTotals();
      return;
    }
    emptyEl && emptyEl.classList.add('hidden');

    tbody.innerHTML = items
      .map(
        (item, i) => `
      <tr data-cart-row="${i}">
        <td style="text-align:center;color:#9ca3af;font-size:.78rem">${i + 1}</td>
        <td>
          <div style="font-weight:600;font-size:.83rem">${esc(item.name)}</div>
          ${item.sku ? `<div style="font-size:.7rem;color:#9ca3af">${esc(item.sku)}</div>` : ''}
          <div class="epos-cart-policy-badges">
            ${item.allowSalePriceOverride ? '<span class="epos-cart-badge epos-cart-badge-editable">Price editable</span>' : '<span class="epos-cart-badge epos-cart-badge-locked">Price locked</span>'}
            ${item.expiryRequired ? '<span class="epos-cart-badge epos-cart-badge-required">Expiry required</span>' : item.trackExpiry ? '<span class="epos-cart-badge epos-cart-badge-expiry">Expiry tracked</span>' : ''}
          </div>
        </td>
        <td style="text-align:center">
          <span style="font-size:.78rem;font-weight:700;color:${
            item.currentStock <= 0 ? '#dc2626' : item.currentStock < 5 ? '#d97706' : '#16a34a'
          }">${item.currentStock}</span>
        </td>
        <td>
          <div class="epos-cart-qty">
            <button type="button" data-dec-item="${i}">−</button>
            <input type="number" min="1" step="1" value="${item.quantity}"
              data-cart-qty="${i}" />
            <button type="button" data-inc-item="${i}">+</button>
          </div>
        </td>
        <td><input type="number" min="0" step="0.01" value="${item.unitPrice}"
          data-cart-price="${i}" class="epos-cart-discount ${item.allowSalePriceOverride ? 'epos-cart-price-editable' : 'epos-cart-price-locked'}" style="text-align:right" ${item.allowSalePriceOverride ? '' : 'readonly title="Sale price is locked by product policy."'} /></td>
        <td>
          <input type="number" min="0" step="0.01" value="${item.discount}"
            data-cart-disc="${i}" class="epos-cart-discount" style="text-align:right"/>
        </td>
        <td style="text-align:right;font-weight:700;font-size:.83rem">
          <span class="epos-cart-line-total"><span>Rs</span><strong data-cart-line-total>${fmt(item.displayTotal)}</strong></span>
        </td>
        <td style="text-align:center">
          <button type="button" data-remove-item="${i}" class="epos-cart-remove">✕</button>
        </td>
      </tr>`
      )
      .join('');

    updateDisplayTotals();
  }

  /**
   * Display-only totals — numbers shown on screen for cashier reference.
   * billing.service.js recalculates independently and is the authoritative source.
   */
  function updateDisplayTotals() {
    const items = getCart().items;
    const displaySub = items.reduce((s, i) => s + (Number(i.displayTotal) || 0), 0);
    const rawDiscount = parseFloat(ui('discountInput')?.value || '0') || 0;
    const discType = ui('discountType')?.value || 'amount';
    const displayDisc = discType === 'percentage' ? (displaySub * rawDiscount) / 100 : rawDiscount;
    const displayTax = parseFloat(ui('taxInput')?.value || '0') || 0;
    const displayGrand = Math.max(displaySub - displayDisc + displayTax, 0);
    const paidInput = ui('paidAmount');
    if (
      paidInput &&
      ['Cash', 'Card', 'Bank'].includes(getCart().paymentMethod) &&
      !paidAmountManual
    ) {
      paidInput.value = displayGrand.toFixed(2);
    }
    const displayPaid = parseFloat(paidInput?.value || '0') || 0;
    const displayChange = Math.max(displayPaid - displayGrand, 0);

    setEl(UI.ids.subtotal, fmt(displaySub));
    setEl(UI.ids.grandTotal, fmt(displayGrand));
    setEl(UI.ids.changeAmount, fmt(displayChange));
    setEl(UI.ids.totalItems, String(items.length));
    setEl(UI.ids.totalQuantity, fmt(items.reduce((s, i) => s + Number(i.quantity || 0), 0)));

    const payBtn = ui('payButtonAmount');
    if (payBtn)
      payBtn.textContent = `Rs. ${displayGrand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ── Payment method display ────────────────────────────────────────────────

  function setPaymentMethod(method) {
    if (method === 'Mixed') {
      showMsg('Split payment is planned for a future phase.', true);
      return;
    }
    getCart().paymentMethod = method;
    const sel = ui('paymentMethod');
    if (sel) sel.value = method;
    uiAll('paymentButton').forEach((btn) => {
      const on = btn.dataset.paymentSet === method;
      btn.classList.toggle('epos-payment-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (['Cash', 'Card', 'Bank'].includes(method)) {
      const paid = ui('paidAmount');
      if (paid) {
        paidAmountManual = false;
        paid.value = getPayableTotal().toFixed(2);
        updateDisplayTotals();
      }
    }
    if (method === 'Credit') {
      const paid = ui('paidAmount');
      if (paid) {
        paidAmountManual = false;
        paid.value = '0.00';
        updateDisplayTotals();
      }
    }
  }

  function markPaidAmountManual() {
    paidAmountManual = true;
  }

  // ── Billing mode (price column display) ───────────────────────────────────

  function setBillingMode(mode) {
    billingMode = mode;
    ui('retailModeButton')?.classList.toggle('epos-billing-mode-active', mode === 'retail');
    ui('wholesaleModeButton')?.classList.toggle('epos-billing-mode-active', mode === 'wholesale');
    renderCart();
  }

  // ── Customer display ──────────────────────────────────────────────────────

  function renderCustomerSelect() {
    const sel = ui('customerSelect');
    if (!sel) return;
    const savedId = String(getCart().customerId || '');
    sel.innerHTML =
      '<option value="">Walk-in Customer</option>' +
      customers
        .map(
          (c) =>
            `<option value="${c.id}" ${String(c.id) === savedId ? 'selected' : ''}>${esc(c.name)}${c.phone ? ` — ${c.phone}` : ''}</option>`
        )
        .join('');
    updateCustomerBalanceDisplay();
  }

  function updateCustomerBalanceDisplay() {
    const sel = ui('customerSelect');
    const el = ui('customerBalance');
    if (!sel || !el) return;
    const c = customers.find((c) => String(c.id) === String(sel.value));
    el.textContent = c
      ? `Due: ${fmt(c.currentBalance)} | Limit: ${fmt(c.creditLimit)}`
      : 'Due: 0.00 | Limit: 0.00';
  }

  function loadCustomerIntoCart(customer) {
    customers.unshift(customer);
    setCartCustomer(customer.id); // use controlled setter — no raw mutation
    renderCustomerSelect();
  }

  // ── Customer modal display ────────────────────────────────────────────────

  function openCustomerModal() {
    const m = ui('customerModal');
    if (!m) return;
    m.classList.remove('hidden');
    ui('modalMessage')?.classList.add('hidden');
    ui('customerModalForm')?.reset();
    setTimeout(() => ui('customerNameInput')?.focus(), 40);
  }

  function closeCustomerModal() {
    ui('customerModal')?.classList.add('hidden');
    ui('customerModalForm')?.reset();
  }

  // ── Receipt preview display ───────────────────────────────────────────────

  function renderReceiptPreview(receipt) {
    const el = ui('receiptPreview');
    if (!el || !receipt) return;
    const coupons = receipt.luckyDrawCoupons || [];
    el.innerHTML = `<div style="font-family:Consolas,monospace;font-size:.72rem;line-height:1.7;white-space:pre-wrap;background:#fafaf9;border:1px solid #e5e7eb;border-radius:7px;padding:10px">Receipt:  ${esc(receipt.invoiceNumber || '')}
Date:     ${receipt.createdAt ? new Date(receipt.createdAt).toLocaleString() : new Date().toLocaleString()}
Customer: ${esc(receipt.customerName || 'Walk-in')}
────────────────────────
${(receipt.items || [])
  .map(
    (i) =>
      `${esc(i.productName).slice(0, 18).padEnd(18)} ${fmt(i.quantity).padStart(5)} x ${fmt(i.unitPrice).padStart(7)} = ${fmt(i.total)}`
  )
  .join('\n')}
────────────────────────
Subtotal: ${fmt(receipt.subtotal)}  Discount: ${fmt(receipt.discount)}
Tax: ${fmt(receipt.tax)}  TOTAL: ${fmt(receipt.grandTotal)}
Paid: ${fmt(receipt.paidAmount)}  Change: ${fmt(receipt.changeAmount)}
Method: ${receipt.paymentMethod || 'Cash'}${
      coupons.length
        ? '\n────────────────────────\n' +
          coupons.map((c) => `Coupon: ${c.couponNo} — ${c.campaignName}`).join('\n')
        : ''
    }
────────────────────────</div>`;
  }

  // ── Held sales display ────────────────────────────────────────────────────

  function renderHeldSalesList(holds) {
    const el = ui('heldSalesList');
    if (!el) return;
    el._holds = holds;
    if (!holds.length) {
      el.innerHTML =
        '<p style="padding:6px 10px;color:#9ca3af;font-size:.75rem">No held sales.</p>';
      return;
    }
    el.innerHTML = holds
      .map((h) => {
        const items = h.payload?.items || [];
        const total = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const label = h.payload?.note || h.holdNumber || `Hold #${h.id}`;
        return `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid #f3f4f6">
          <button type="button" data-restore-hold="${h.id}"
            style="flex:1;text-align:left;background:none;border:none;cursor:pointer;font-size:.76rem">
            <strong>${esc(label)}</strong><br>
            <span style="color:#6b7280">${items.length} items · Rs.${fmt(total)}</span>
          </button>
          <button type="button" data-delete-hold="${h.id}"
            style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:.82rem">✕</button>
        </div>`;
      })
      .join('');
  }

  // ── Restore held sale items into cart display ─────────────────────────────

  function restoreHeldItemsToCart(hold) {
    carts[activeCart].items = (hold.payload?.items || []).map((i) => ({
      productId: i.productId,
      name: i.name || '',
      sku: i.sku || '',
      currentStock: Number(i.currentStock || 0),
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discount: Number(i.discount || 0),
      displayTotal: Number(i.total) || 0,
      unit: i.unit || 'pcs',
    }));
    carts[activeCart].customerId = hold.customerId || null;
    renderCart();
    renderCustomerSelect();
  }

  // ── Search results ────────────────────────────────────────────────────────

  function clearSearchResults() {
    const el = ui('searchResults');
    if (el) {
      el.innerHTML = '';
      el._products = null;
    }
  }

  function renderSearchResults(query, products) {
    const el = ui('searchResults');
    if (!el) return;
    const list = Array.isArray(products) ? products : [];
    if (!list.length) {
      el.innerHTML = `<p style="padding:10px 14px;color:#6b7280;font-size:.83rem">No products found for "${esc(query)}".</p>`;
      el._products = [];
      return;
    }

    el._products = list;
    el.innerHTML = list
      .slice(0, 15)
      .map((p) => {
        const price =
          billingMode === 'wholesale' && Number(p.wholesalePrice) > 0
            ? Number(p.wholesalePrice)
            : Number(p.salePrice);
        const sc = p.currentStock <= 0 ? '#dc2626' : p.currentStock < 5 ? '#d97706' : '#16a34a';
        return `<button type="button" data-product-id="${p.id}"
          style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;text-align:left;border-bottom:1px solid #f3f4f6"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"
        ><span style="flex:1;min-width:0">
            <span style="display:block;font-weight:600;font-size:.83rem">${esc(p.name)}</span>
            ${p.sku ? `<span style="font-size:.7rem;color:#9ca3af">${esc(p.sku)}</span>` : ''}
          </span>
          <span style="font-weight:700;color:#1d4ed8;font-size:.83rem;white-space:nowrap">Rs.${fmt(price)}</span>
          <span style="font-size:.72rem;color:${sc};font-weight:600">${p.currentStock}</span>
        </button>`;
      })
      .join('');
  }

  // ── API payload builder ───────────────────────────────────────────────────
  // Reads current display state and formats it for posApi calls.
  // No business rules here — service layer validates the payload server-side.

  function getCartPayload() {
    const items = getCart().items;
    const subtotal = items.reduce((s, i) => s + (Number(i.displayTotal) || 0), 0);
    const rawDiscount = parseFloat(ui('discountInput')?.value || '0') || 0;
    const discType = ui('discountType')?.value || 'amount';
    const discount = discType === 'percentage' ? (subtotal * rawDiscount) / 100 : rawDiscount;
    const tax = parseFloat(ui('taxInput')?.value || '0') || 0;
    const grandTotal = Math.max(subtotal - discount + tax, 0);
    const paidAmount = parseFloat(ui('paidAmount')?.value || '0') || 0;
    const customerId = ui('customerSelect')?.value;

    return {
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: Number(i.displayTotal) || 0,
      })),
      customerId: customerId ? Number(customerId) : null,
      subtotal,
      discount,
      tax,
      grandTotal,
      paidAmount,
      paymentMethod: getCart().paymentMethod || 'Cash',
    };
  }

  // ── Public surface ────────────────────────────────────────────────────────

  window.BillingCart = {
    // State accessors
    getCart,
    getActiveCart,
    getCustomers,
    setCustomers,
    getLastReceipt,
    setLastReceipt,
    getBillingMode,
    getAutoAdvanceUnitPrice,
    // Cart mutations
    addToCart,
    removeCartItem,
    clearCartDisplay,
    switchToCart,
    refreshCartItemDisplay,
    setCartCustomer, // controlled customer ID setter
    // Rendering
    renderCart,
    updateDisplayTotals,
    setBillingMode,
    setPaymentMethod,
    setAutoAdvanceUnitPrice,
    // Customer display
    renderCustomerSelect,
    updateCustomerBalanceDisplay,
    loadCustomerIntoCart,
    openCustomerModal,
    closeCustomerModal,
    // Receipt + holds display
    renderReceiptPreview,
    renderHeldSalesList,
    restoreHeldItemsToCart,
    clearSearchResults,
    renderSearchResults,
    // Payload + utilities
    getCartPayload,
    getPayableTotal,
    markPaidAmountManual,
    showMsg,
    showModalMsg,
    esc,
    fmt,
  };
})();
