/** customers.renderer.js — UI orchestration, event binding, display state ONLY.
 * Risk: LOW | Rollback: delete file + remove script tags + remove login.js hook
 * Exposes: window.CustomersRenderer | window.initCustomersModule
 * Load order: customers.api.js → customers.renderer.js
 * NOT ALLOWED: posApi calls · business logic · validation */
(function CustomersRendererModule() {
  'use strict';

  // ── Module lifecycle flags ────────────────────────────────────────────────
  let initialized = false;
  let initPending = false;

  /** Lightweight, removable logger — non-intrusive, no side effects */
  const LOG = () => {};

  /** Live reference — resolved at call-time */
  const A = () => window.CustomersApi;
  const UIX = () => window.EposUI;

  let _currentTab = ''; // active tab key ('' = all)
  let _searchTimer = null; // debounce handle
  let _selectedCustomer = null; // customer selected for details/WhatsApp
  let _selectedIds = new Set(); // bulk-selection set
  let _customerRefreshSeq = 0; // prevents stale async list responses from repainting the table
  let _customerDetailRefreshSeq = 0; // prevents stale async detail responses from repainting the panel

  function getCurrentFilters() {
    return {
      search: document.getElementById('customerPageSearch')?.value?.trim() || '',
      tab: _currentTab,
    };
  }

  function getSelectedCustomer() {
    return _selectedCustomer;
  }
  function setSelectedCustomer(c) {
    _selectedCustomer = c;
  }
  function isDetailsPanelOpen() {
    const panel = $id('customerDetailsPanel');
    return Boolean(panel && !panel.classList.contains('hidden') && _selectedCustomer?.id);
  }
  function closeDetailsPanel() {
    $id('customerDetailsPanel')?.classList.add('hidden');
    setSelectedCustomer(null);
    highlightSelectedRow(-1);
  }

  function $id(id) {
    return document.getElementById(id);
  }
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmt(v) {
    return Number(v || 0).toFixed(2);
  }
  function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString() : '—';
  }
  function moneyClass(value) {
    const amount = Number(value || 0);
    if (amount > 0) return 'is-due';
    if (amount < 0) return 'is-credit';
    return 'is-settled';
  }

  let _msgTimer = null;

  function showMsg(text, isError) {
    const el = $id('customerPageMessage');
    if (!el) return;
    el.textContent = text;
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;padding:8px 12px;border-radius:6px;margin-bottom:8px'
      : 'display:block;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:8px 12px;border-radius:6px;margin-bottom:8px';
    el.classList.remove('hidden');
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  function checkFeature(featureId) {
    if (!window.FeatureGate?.check) {
      return { ok: false, message: 'Feature activation gate is unavailable.' };
    }
    return window.FeatureGate.check(featureId);
  }

  function requireFeature(featureId) {
    const gate = checkFeature(featureId);
    if (!gate.ok && gate.visible !== false) showMsg(gate.message, true);
    return gate.ok;
  }

  function showFormMsg(text, isError) {
    let el = $id('customerFormMsg');
    if (!el) {
      const actions = document.querySelector('.epos-customers-form-actions');
      if (!actions) return;
      el = document.createElement('p');
      el.id = 'customerFormMsg';
      el.style.cssText = 'margin:6px 0 0;font-size:.78rem;font-weight:600';
      actions.before(el);
    }
    el.textContent = text;
    el.style.color = isError ? '#b91c1c' : '#166534';
  }

  function renderStats(summary) {
    // dueSummary: { customersWithDue, totalDue } — only creditCount comes from here
    if (!summary) return;
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('customerCreditCount', summary.customersWithDue ?? 0);
  }
  function renderListStats(customers) {
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('customerTotalCount', customers.length);
    set('customerActiveCount', customers.filter((c) => c.isActive).length);
    set('customerInactiveCount', customers.filter((c) => !c.isActive).length);
    const totalSales = customers.reduce((s, c) => s + Number(c.stats?.totalPurchases || 0), 0);
    set(
      'customerTotalSales',
      `PKR ${totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    );
  }
  function applyTabFilter(customers, tab) {
    if (!tab) return customers;
    const now = Date.now();
    const DAY = 86400000;
    switch (tab) {
      case 'active':
        return customers.filter((c) => c.isActive);
      case 'inactive':
        return customers.filter((c) => !c.isActive);
      case 'vip':
        return customers.filter((c) => c.group === 'vip');
      case 'recent':
        return customers.filter((c) => {
          const d = c.stats?.lastPurchaseDate;
          return d && now - new Date(d).getTime() < 30 * DAY;
        });
      case 'regular':
        return customers.filter((c) => c.group === 'regular');
      case 'credit':
        return customers.filter((c) => Number(c.currentBalance || 0) > 0);
      default:
        return customers;
    }
  }
  let _allCustomers = []; // cached for tab/bulk operations

  function renderCustomerTable(customers, filters) {
    renderListStats(customers); // derive total/active/inactive/totalSales from list
    _allCustomers = customers;
    _selectedIds.clear();

    const tab = filters?.tab || _currentTab;
    const filtered = applyTabFilter(customers, tab);

    const tbody = $id('customerPageList');
    const summary = $id('customerResultSummary');
    if (!tbody) return;

    if (summary)
      summary.textContent = `Showing ${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
      tbody.innerHTML = UIX().Table.emptyRow({ columns: 11, message: 'No customers found.' });
      return;
    }

    tbody.innerHTML = filtered
      .map((c, i) => {
        const balance = Number(c.currentBalance || 0);
        const balColor = balance > 0 ? '#dc2626' : '#16a34a';
        const groupBadge = c.group
          ? `<span style="background:#ede9fe;color:#7c3aed;padding:1px 7px;border-radius:9px;font-size:.7rem">${esc(c.group)}</span>`
          : '<span style="color:#9ca3af;font-size:.75rem">—</span>';
        const statusBadge = c.isActive
          ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Active</span>'
          : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Inactive</span>';

        return `<tr data-row-customer-id="${c.id}" style="cursor:pointer">
        <td style="text-align:center"><input type="checkbox" class="customer-row-check" data-customer-id="${c.id}" /></td>
        <td style="color:#9ca3af;font-size:.75rem">${i + 1}</td>
        <td style="font-weight:600;font-size:.82rem">${esc(c.name)}</td>
        <td style="color:#6b7280;font-size:.75rem">#${c.id}</td>
        <td style="font-size:.78rem">${esc(c.phone || '—')}</td>
        <td>${groupBadge}</td>
        <td style="font-size:.75rem">${esc(c.address?.split(',').pop()?.trim() || '—')}</td>
        <td style="text-align:right;font-size:.78rem">Rs.${fmt(c.stats?.totalPurchases)}</td>
        <td style="text-align:right;font-weight:700;font-size:.82rem;color:${balColor}">Rs.${fmt(balance)}</td>
        <td style="text-align:center">${statusBadge}</td>
        <td style="text-align:center;white-space:nowrap">
          <button type="button" data-view-customer="${c.id}"
            style="padding:3px 8px;border:1px solid #6366f1;color:#6366f1;background:none;border-radius:5px;cursor:pointer;font-size:.72rem;margin-right:3px">View</button>
          <button type="button" data-edit-customer="${c.id}"
            style="padding:3px 8px;border:1px solid #3b82f6;color:#3b82f6;background:none;border-radius:5px;cursor:pointer;font-size:.72rem;margin-right:3px">Edit</button>
          <button type="button" data-delete-customer="${c.id}" data-customer-name="${esc(c.name)}"
            style="padding:3px 8px;border:1px solid #ef4444;color:#ef4444;background:none;border-radius:5px;cursor:pointer;font-size:.72rem">Del</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  function highlightSelectedRow(customerId) {
    document
      .querySelectorAll('#customerPageList tr')
      .forEach(
        (tr) =>
          (tr.style.background = tr.dataset.rowCustomerId === String(customerId) ? '#eef3ff' : '')
      );
  }

  function renderCustomerLedgerWorkspace(panel, data) {
    const c = data.customer || data;
    const sales = data.sales || [];
    const ledger = data.ledger || [];
    const balance = Number(c.currentBalance || 0);
    const creditLimit = Number(c.creditLimit || 0);
    const availableCredit = Math.max(creditLimit - Math.max(balance, 0), 0);
    const initials = String(c.name || 'C')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

    setSelectedCustomer(c);
    highlightSelectedRow(c.id);
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="epos-ledger-workspace" role="dialog" aria-label="Customer Ledger">
        <header class="epos-ledger-hero">
          <div class="epos-ledger-hero-copy">
            <span class="epos-ledger-kicker">Customer Account</span>
            <h2 class="epos-ledger-hero-title">Customer Ledger</h2>
            <p class="epos-ledger-hero-subtitle">Review customer identity, balance, sales history, and account ledger entries.</p>
          </div>
          <button type="button" class="epos-ledger-close-btn" data-close-details aria-label="Close customer ledger">Close</button>
        </header>

        <section class="epos-ledger-summary-card">
          <div class="epos-ledger-avatar" aria-hidden="true">${esc(initials || 'C')}</div>
          <div class="epos-ledger-identity">
            <div class="epos-ledger-name-row">
              <h3>${esc(c.name || 'Customer')}</h3>
              <span class="epos-ledger-status ${c.isActive ? 'active' : 'inactive'}">${c.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <dl class="epos-ledger-contact-grid">
              <div><dt>Customer ID</dt><dd>#${esc(c.id || '—')}</dd></div>
              <div><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd></div>
              <div><dt>Email</dt><dd>${esc(c.email || '—')}</dd></div>
              <div><dt>Address</dt><dd>${esc(c.address || '—')}</dd></div>
            </dl>
          </div>
        </section>

        <section class="epos-ledger-stat-grid" aria-label="Customer financial summary">
          <article class="epos-ledger-stat-card sales"><span aria-hidden="true">Rs</span><div><p>Total Sales</p><strong>Rs.${fmt(c.stats?.totalPurchases)}</strong><small>From stored sales history</small></div></article>
          <article class="epos-ledger-stat-card payments"><span aria-hidden="true">✓</span><div><p>Total Payments</p><strong>Rs.${fmt(c.stats?.totalPaid)}</strong><small>Paid against invoices</small></div></article>
          <article class="epos-ledger-stat-card balance"><span aria-hidden="true">!</span><div><p>Current Balance</p><strong class="${moneyClass(balance)}">Rs.${fmt(balance)}</strong><small>${balance > 0 ? 'Balance due' : 'Settled account'}</small></div></article>
          <article class="epos-ledger-stat-card credit"><span aria-hidden="true">CL</span><div><p>Credit Limit</p><strong>Rs.${fmt(creditLimit)}</strong><small>Available: Rs.${fmt(availableCredit)}</small></div></article>
        </section>

        <div class="epos-ledger-main-grid">
          <main class="epos-ledger-main-column">
            <section class="epos-ledger-section epos-ledger-transactions">
              <div class="epos-ledger-section-head">
                <div>
                  <span class="epos-ledger-tab active">Ledger Transactions</span>
                  <p>${ledger.length} account ${ledger.length === 1 ? 'entry' : 'entries'} from the authoritative ledger.</p>
                </div>
                <button type="button" class="epos-ledger-pay-disabled" data-payment-unavailable disabled aria-disabled="true" title="Payment posting requires workflow completion">Post Payment</button>
              </div>
              ${
                ledger.length
                  ? `<div class="epos-ledger-table-wrap">
                <table class="epos-ledger-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th class="money">Debit</th><th class="money">Credit</th><th class="money">Running Balance</th><th>Status</th></tr></thead>
                  <tbody>${ledger
                    .map(
                      (row) => `<tr>
                    <td>${fmtDate(row.createdAt)}</td>
                    <td><span class="epos-ledger-type">${esc(row.entryType || '—')}</span></td>
                    <td>${esc(row.saleId ? `Sale #${row.saleId}` : row.paymentId ? `Payment #${row.paymentId}` : row.returnId ? `Return #${row.returnId}` : '—')}</td>
                    <td>${esc(row.notes || '—')}</td>
                    <td class="money debit">Rs.${fmt(row.debit)}</td>
                    <td class="money credit">Rs.${fmt(row.credit)}</td>
                    <td class="money balance ${moneyClass(row.balance)}">Rs.${fmt(row.balance)}</td>
                    <td><span class="epos-ledger-status-pill">Posted</span></td>
                  </tr>`
                    )
                    .join('')}</tbody>
                </table>
              </div>`
                  : '<div class="epos-ledger-empty"><strong>No ledger entries yet.</strong><span>Transactions will appear here after sales, payments, returns, or opening balance postings.</span></div>'
              }
            </section>

            <section class="epos-ledger-section">
              <div class="epos-ledger-section-head">
                <div>
                  <span class="epos-ledger-tab">Sales History</span>
                  <p>${sales.length} stored ${sales.length === 1 ? 'invoice' : 'invoices'} for this customer.</p>
                </div>
              </div>
              ${
                sales.length
                  ? `<div class="epos-ledger-table-wrap compact">
                <table class="epos-ledger-table">
                  <thead><tr><th>Invoice</th><th>Date</th><th>Payment</th><th class="money">Total</th><th class="money">Paid</th><th class="money">Due</th></tr></thead>
                  <tbody>${sales
                    .map(
                      (s) => `<tr>
                    <td>${esc(s.invoiceNumber || '—')}</td>
                    <td>${fmtDate(s.createdAt)}</td>
                    <td>${esc(s.paymentMethod || '—')}</td>
                    <td class="money">Rs.${fmt(s.grandTotal)}</td>
                    <td class="money credit">Rs.${fmt(s.paidAmount)}</td>
                    <td class="money debit">Rs.${fmt(s.dueAmount)}</td>
                  </tr>`
                    )
                    .join('')}</tbody>
                </table>
              </div>`
                  : '<div class="epos-ledger-empty compact"><strong>No sales history yet.</strong><span>Completed invoices for this customer will appear here.</span></div>'
              }
            </section>
          </main>

          <aside class="epos-ledger-balance-panel" aria-label="Balance summary">
            <h3>Balance Summary</h3>
            <dl>
              <div><dt>Opening Balance</dt><dd>Rs.${fmt(c.openingBalance)}</dd></div>
              <div><dt>Total Sales</dt><dd>Rs.${fmt(c.stats?.totalPurchases)}</dd></div>
              <div><dt>Total Payments</dt><dd>Rs.${fmt(c.stats?.totalPaid)}</dd></div>
              <div><dt>Current Balance</dt><dd class="${moneyClass(balance)}">Rs.${fmt(balance)}</dd></div>
              <div><dt>Credit Limit</dt><dd>Rs.${fmt(creditLimit)}</dd></div>
              <div><dt>Available Credit</dt><dd class="is-credit">Rs.${fmt(availableCredit)}</dd></div>
            </dl>
            <div class="epos-ledger-note">
              <strong>Payment workflow</strong>
              <span>Payment posting requires workflow completion and is intentionally disabled in this visual phase.</span>
            </div>
          </aside>
        </div>
      </div>`;
  }

  function renderCustomerDetails(data) {
    const panel = $id('customerDetailsPanel');
    if (!panel) return;
    renderCustomerLedgerWorkspace(panel, data);
  }
  function openEditorModal(customer) {
    const modal = $id('customerEditorModal');
    const title = $id('customerEditorTitle');
    if (!modal) return;

    if (customer) {
      if (title) title.textContent = 'Edit Customer';
      const set = (id, v) => {
        const e = $id(id);
        if (e) e.value = v ?? '';
      };
      set('customerFormId', customer.id);
      set('customerNameInput', customer.name);
      set('customerPhoneInput', customer.phone);
      set('customerEmailInput', customer.email);
      set('customerCnicInput', customer.cnic);
      set('customerAddressInput', customer.address);
      set('customerCreditLimitInput', customer.creditLimit);
      set('customerOpeningBalanceInput', 0); // not editable on update
      set('customerGroupInput', customer.group);
      const activeEl = $id('customerActiveInput');
      if (activeEl) activeEl.checked = Boolean(customer.isActive);
    } else {
      if (title) title.textContent = 'Add Customer';
      $id('customerForm')?.reset();
      const idEl = $id('customerFormId');
      if (idEl) idEl.value = '';
    }

    const msgEl = $id('customerFormMsg');
    if (msgEl) msgEl.textContent = '';
    modal.classList.remove('hidden');
    setTimeout(() => $id('customerNameInput')?.focus(), 40);
  }

  function closeEditorModal() {
    $id('customerEditorModal')?.classList.add('hidden');
    $id('customerForm')?.reset();
    const idEl = $id('customerFormId');
    if (idEl) idEl.value = '';
  }

  // ── WhatsApp modal ────────────────────────────────────────────────────────

  function openWhatsAppModal(customer) {
    setSelectedCustomer(customer);
    const modal = $id('customerWhatsAppModal');
    const targetEl = $id('customerWhatsAppTarget');
    if (!modal) return;
    if (targetEl)
      targetEl.textContent = `${customer.name}${customer.phone ? ' — ' + customer.phone : ''}`;
    $id('customerWaCustomBox')?.classList.add('hidden');
    modal.classList.remove('hidden');
  }

  function closeWhatsAppModal() {
    $id('customerWhatsAppModal')?.classList.add('hidden');
    $id('customerWaCustomBox')?.classList.add('hidden');
  }

  function buildCustomerPayload() {
    return {
      name: ($id('customerNameInput')?.value || '').trim(),
      phone: ($id('customerPhoneInput')?.value || '').trim() || undefined,
      email: ($id('customerEmailInput')?.value || '').trim() || undefined,
      cnic: ($id('customerCnicInput')?.value || '').trim() || undefined,
      address: ($id('customerAddressInput')?.value || '').trim() || undefined,
      creditLimit: parseFloat($id('customerCreditLimitInput')?.value || '0') || 0,
      openingBalance: parseFloat($id('customerOpeningBalanceInput')?.value || '0') || 0,
      isActive: $id('customerActiveInput')?.checked ?? true,
      group: $id('customerGroupInput')?.value || undefined,
    };
  }

  async function refreshCustomers(filters) {
    const activeFilters = filters || getCurrentFilters();
    const seq = ++_customerRefreshSeq;
    const res = await A().loadCustomers(activeFilters);
    if (seq !== _customerRefreshSeq) return res;
    if (!res?.ok) {
      showMsg(res?.message || 'Failed to load customers. Please try again.', true);
      return res;
    }
    renderCustomerTable(res.customers || [], activeFilters);
    return res;
  }

  async function refreshCustomerLiveState(options = {}) {
    const opts =
      options && typeof options === 'object' && !Array.isArray(options)
        ? options
        : { filters: options };
    const selectedId = Number(opts.selectedCustomerId || _selectedCustomer?.id || 0);
    const shouldRefreshDetails = Boolean(opts.refreshDetails ?? isDetailsPanelOpen());
    const [customersRes, summaryRes] = await Promise.all([
      refreshCustomers(opts.filters || getCurrentFilters()),
      opts.includeSummary === false ? Promise.resolve(null) : refreshDueSummary(),
    ]);

    if (selectedId && customersRes?.ok) {
      const selectedStillVisible = (customersRes.customers || []).some(
        (c) => Number(c.id) === selectedId
      );
      if (selectedStillVisible) {
        if (shouldRefreshDetails) await loadCustomerDetailsFromUI(selectedId);
        else highlightSelectedRow(selectedId);
      } else if (opts.closeMissingSelected) {
        closeDetailsPanel();
      }
    }

    return { customers: customersRes, summary: summaryRes };
  }

  async function refreshDueSummary() {
    const res = await A().loadDueSummary();
    if (res?.ok) renderStats(res.summary || {});
    return res;
  }

  async function saveCustomerFromForm(e) {
    e.preventDefault();
    const customerId = $id('customerFormId')?.value;
    const isEdit = Boolean(customerId);
    const saveBtn = $id('saveCustomerButton');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res = await A().saveCustomer(customerId, buildCustomerPayload());
      if (!res?.ok) {
        showFormMsg(res?.message || (isEdit ? 'Update failed.' : 'Create failed.'), true);
        return;
      }
      showMsg(res.message || (isEdit ? 'Customer updated.' : 'Customer saved.'));
      closeEditorModal();
      await refreshCustomerLiveState({ filters: getCurrentFilters() });
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteCustomerFromUI(customerId, customerName) {
    const confirmed = await window.posApi.dialog.confirm(
      `Delete "${customerName}"? This cannot be undone.`
    );
    window.focus?.();
    if (!confirmed) return;
    const res = await A().deleteCustomer(customerId);
    if (!res?.ok) {
      showMsg(res?.message || 'Delete failed.', true);
      return;
    }
    showMsg(res.message || 'Customer deleted.');
    await refreshCustomerLiveState({
      filters: getCurrentFilters(),
      selectedCustomerId: customerId,
      closeMissingSelected: true,
    });
  }

  async function deleteInactiveCustomersFromUI() {
    if (!requireFeature('customers.delete_inactive_customers')) return;
    const confirmed = await window.posApi.dialog.confirm(
      'Delete ALL inactive customers? This cannot be undone.'
    );
    window.focus?.();
    if (!confirmed) return;
    const res = await A().deleteInactiveCustomers();
    showMsg(res?.message || 'Bulk delete failed. Please try again.', !res?.ok);
    if (res?.ok && res.deleted) {
      await refreshCustomerLiveState({ filters: getCurrentFilters(), closeMissingSelected: true });
    }
  }

  async function loadCustomerDetailsFromUI(customerId) {
    const requestedId = Number(customerId);
    const seq = ++_customerDetailRefreshSeq;
    const res = await A().loadCustomerDetails(customerId);
    if (seq !== _customerDetailRefreshSeq || Number(_selectedCustomer?.id || 0) !== requestedId) {
      return res;
    }
    if (!res?.ok) {
      showMsg(res?.message || 'Failed to load customer details.', true);
      return;
    }
    renderCustomerDetails(res);
  }

  async function sendWhatsAppFromUI(action, customText) {
    if (!requireFeature('customers.whatsapp_customer_message')) return;
    const customer = getSelectedCustomer();
    if (!customer?.phone) {
      showMsg('This customer has no phone number registered.', true);
      return;
    }
    const digits = customer.phone.replace(/\D/g, '');
    if (!digits) {
      showMsg('Invalid phone number for WhatsApp.', true);
      return;
    }

    const messages = {
      ledger: `Dear ${customer.name},\nYour ledger statement is ready. Due balance: Rs.${Number(customer.currentBalance || 0).toFixed(2)}.\nPlease contact us for details.`,
      invoices: `Dear ${customer.name},\nYour invoice/purchase history is available. Contact us to get a copy.`,
      report: `Dear ${customer.name},\nYour customer report has been prepared. Contact us for details.`,
      due: `Dear ${customer.name},\nReminder: You have a due balance of Rs.${Number(customer.currentBalance || 0).toFixed(2)}. Please clear at your earliest convenience.`,
      payment: `Dear ${customer.name},\nThank you for your recent payment. Your account has been updated.`,
      custom: customText || '',
    };
    const text = messages[action] || '';
    if (!text.trim()) {
      showMsg('Message is empty.', true);
      return;
    }
    const res = await A().sendCustomerWhatsApp(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    );
    if (!res?.ok) {
      showMsg(res?.message || 'Unable to open link.', true);
      return;
    }
    closeWhatsAppModal();
  }

  function handleToolActionFromUI(action) {
    const res = A().getToolActionMessage(action);
    showMsg(res.message, true);
  }

  function renderUI(state) {
    if (state?.customers)
      renderCustomerTable(state.customers, state.filters || getCurrentFilters());
    if (state?.summary) renderStats(state.summary);
    if (state?.details) renderCustomerDetails(state.details);
  }

  function updateUI(diff) {
    renderUI(diff || {});
  }

  function destroyUI() {
    // TODO: Add teardown when Customers gains route-level unmounting.
  }

  // ── Tab state ─────────────────────────────────────────────────────────────

  function setActiveTab(tab) {
    if (tab === 'vip' || tab === 'regular') {
      showMsg('Customer group tabs are coming soon. They are not implemented yet.', true);
      return;
    }
    _currentTab = tab;
    document.querySelectorAll('[data-customer-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.customerTab === tab);
    });
    // Re-filter already-loaded customers client-side (no extra IPC call)
    if (_allCustomers.length) renderCustomerTable(_allCustomers, { tab });
  }

  // ── Event binding (idempotent — runs exactly once per session) ─────────────

  function attachEvents() {
    LOG('attachEvents() — runs once per session');

    // ── Search ────────────────────────────────────────────────────────────────
    $id('customerPageSearch')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => refreshCustomers(getCurrentFilters()), 300);
    });

    // ── Tab buttons ───────────────────────────────────────────────────────────
    document
      .querySelectorAll('[data-customer-tab]')
      .forEach((btn) => btn.addEventListener('click', () => setActiveTab(btn.dataset.customerTab)));

    // ── Add customer (both top + bottom buttons share same IDs — use delegation) ─
    // Note: HTML has duplicate #customerBottomAddButton and #customerAddButton
    ['customerAddButton', 'customerBottomAddButton'].forEach((id) =>
      $id(id)?.addEventListener('click', () => openEditorModal(null))
    );

    // ── Customer form submit ──────────────────────────────────────────────────
    $id('customerForm')?.addEventListener('submit', saveCustomerFromForm);

    // ── Reset form button ─────────────────────────────────────────────────────
    $id('resetCustomerButton')?.addEventListener('click', () => {
      $id('customerForm')?.reset();
      const idEl = $id('customerFormId');
      if (idEl) idEl.value = '';
      const msgEl = $id('customerFormMsg');
      if (msgEl) msgEl.textContent = '';
      $id('customerEditorTitle') && ($id('customerEditorTitle').textContent = 'Add Customer');
    });

    // ── Close editor modal ────────────────────────────────────────────────────
    document
      .querySelectorAll('[data-customer-modal-close]')
      .forEach((el) => el.addEventListener('click', () => closeEditorModal()));

    // ── Customer table (view / edit / delete via delegation) ──────────────────
    $id('customerPageList')?.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view-customer]');
      if (viewBtn) {
        const cust = _allCustomers.find((c) => String(c.id) === viewBtn.dataset.viewCustomer);
        if (cust) {
          setSelectedCustomer(cust);
          loadCustomerDetailsFromUI(Number(cust.id));
        }
        return;
      }
      const editBtn = e.target.closest('[data-edit-customer]');
      if (editBtn) {
        const cust = _allCustomers.find((c) => String(c.id) === editBtn.dataset.editCustomer);
        if (cust) openEditorModal(cust);
        return;
      }
      const delBtn = e.target.closest('[data-delete-customer]');
      if (delBtn) {
        deleteCustomerFromUI(Number(delBtn.dataset.deleteCustomer), delBtn.dataset.customerName);
        return;
      }
      // Row click (not a button) — set selected customer and highlight row
      const row = e.target.closest('tr[data-row-customer-id]');
      if (row) {
        const cust = _allCustomers.find((c) => String(c.id) === row.dataset.rowCustomerId);
        if (cust) {
          setSelectedCustomer(cust);
          highlightSelectedRow(cust.id);
        }
      }
    });

    // ── Details panel — pay button + close button (delegation) ───────────────────────
    $id('customerDetailsPanel')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-payment-unavailable]')) {
        showMsg('Payment posting requires workflow completion.', true);
        return;
      }
      if (e.target.closest('[data-close-details]')) {
        closeDetailsPanel();
      }
    });

    // ── Select all checkbox ───────────────────────────────────────────────────
    $id('customerSelectAll')?.addEventListener('change', (e) => {
      document.querySelectorAll('.customer-row-check').forEach((chk) => {
        chk.checked = e.target.checked;
        const id = Number(chk.dataset.customerId);
        e.target.checked ? _selectedIds.add(id) : _selectedIds.delete(id);
      });
    });

    // ── Per-row checkbox ──────────────────────────────────────────────────────
    $id('customerPageList')?.addEventListener('change', (e) => {
      if (!e.target.classList.contains('customer-row-check')) return;
      const id = Number(e.target.dataset.customerId);
      e.target.checked ? _selectedIds.add(id) : _selectedIds.delete(id);
    });

    // ── Delete inactive button (appears in topbar + bottom bar — bind both) ────
    document
      .querySelectorAll('#customerDeleteInactiveButton')
      .forEach((btn) => btn.addEventListener('click', deleteInactiveCustomersFromUI));

    // ── Customer Groups button (appears in topbar + bottom bar — bind both) ────
    document.querySelectorAll('#openCustomerGroupsButton').forEach((btn) =>
      btn.addEventListener('click', () => {
        requireFeature('customers.customer_groups_placeholder');
      })
    );
    $id('closeCustomerGroupsModal')?.addEventListener('click', () =>
      $id('customerGroupsModal')?.classList.add('hidden')
    );

    // ── WhatsApp buttons (topbar + bottom bar — bind both instances) ───────────
    document.querySelectorAll('#customerWhatsAppButton').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!requireFeature('customers.whatsapp_customer_message')) return;
        if (_selectedCustomer) {
          openWhatsAppModal(_selectedCustomer);
        } else showMsg('Select a customer first (click View) to use WhatsApp.', true);
      })
    );

    // ── WhatsApp action buttons (inside modal) ────────────────────────────────
    document.querySelectorAll('[data-customer-wa-action]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const action = btn.dataset.customerWaAction;
        if (action === 'custom') {
          $id('customerWaCustomBox')?.classList.remove('hidden');
        } else {
          sendWhatsAppFromUI(action);
        }
      })
    );

    // ── Send custom WhatsApp message ──────────────────────────────────────────
    $id('customerWaSendCustom')?.addEventListener('click', () => {
      const text = $id('customerWaCustomText')?.value?.trim();
      sendWhatsAppFromUI('custom', text);
    });

    // ── Close WhatsApp modal ──────────────────────────────────────────────────
    document
      .querySelectorAll('[data-customer-whatsapp-close]')
      .forEach((el) => el.addEventListener('click', () => closeWhatsAppModal()));

    // ── Customer Ledger shortcut (topbar + bottom bar — bind both) ───────────
    document.querySelectorAll('#customerLedgerShortcut').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (_selectedCustomer) loadCustomerDetailsFromUI(_selectedCustomer.id);
        else showMsg('Select a customer first to view their ledger.', true);
      })
    );

    // ── Import / Export / Print tool buttons ──────────────────────────────────
    document
      .querySelectorAll('[data-page-tool="customers"]')
      .forEach((btn) =>
        btn.addEventListener('click', () => handleToolActionFromUI(btn.dataset.toolAction))
      );

    // ── Bulk actions (topbar + bottom bar — bind both) ────────────────────────
    document.querySelectorAll('#customerBulkActionsButton').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!requireFeature('customers.bulk_actions_placeholder')) return;
        if (!_selectedIds.size) {
          showMsg('Select at least one customer for bulk actions.', true);
          return;
        }
        showMsg(
          `${_selectedIds.size} customer${_selectedIds.size !== 1 ? 's' : ''} selected. Bulk actions are coming soon. They are not implemented yet.`,
          true
        );
      })
    );
  }

  // ── Module init ───────────────────────────────────────────────────────────
  // Called by login.js after /customers navigation (safe to call multiple times).
  //
  // Lifecycle:
  //   1st call (fragment not yet in DOM) → schedules retry, sets initPending
  //   2nd call before retry fires        → returns immediately (initPending guard)
  //   retry fires                        → clears initPending, re-enters init()
  //   fragment now in DOM                → runs attachEvents() once, then refresh
  //   subsequent calls (re-navigation)   → skips attachEvents(), only reloads data

  function init() {
    if (!$id('customerPageList')) {
      if (initPending) return;
      initPending = true;
      setTimeout(() => {
        initPending = false;
        init();
      }, 80);
      return;
    }

    if (!initialized) {
      initialized = true;
      attachEvents();
    }

    // Reload data on every /customers navigation
    refreshCustomers(getCurrentFilters());
    refreshDueSummary();
    LOG('init() complete — module ready');
  }

  // ── Public surface ────────────────────────────────────────────────────────

  window.CustomersRenderer = {
    // State accessors
    getCurrentFilters,
    getSelectedCustomer,
    setSelectedCustomer,
    // Rendering
    renderStats,
    renderCustomerTable,
    renderCustomerDetails,
    // Modal management
    openEditorModal,
    closeEditorModal,
    openWhatsAppModal,
    closeWhatsAppModal,
    // Feedback
    showMsg,
    showFormMsg,
    // Utilities
    esc,
    fmt,
    renderUI,
    updateUI,
    destroyUI,
  };

  window.initCustomersModule = init;
})();
