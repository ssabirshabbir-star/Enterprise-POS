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
  const LOG = (...args) => console.log('[CustomersRenderer]', ...args);

  /** Live reference — resolved at call-time */
  const A = () => window.CustomersApi;

  let _currentTab = ''; // active tab key ('' = all)
  let _searchTimer = null; // debounce handle
  let _selectedCustomer = null; // customer selected for details/WhatsApp
  let _selectedIds = new Set(); // bulk-selection set

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
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No customers found.</td></tr>`;
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

  function renderCustomerDetails(data) {
    const panel = $id('customerDetailsPanel');
    if (!panel) return;
    const c = data.customer || data;
    const sales = data.sales || [];
    const ledger = data.ledger || [];
    const balance = Number(c.currentBalance || 0);
    const balColor = balance > 0 ? '#dc2626' : '#16a34a';
    setSelectedCustomer(c);
    highlightSelectedRow(c.id);
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div style="padding:10px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h3 style="margin:0;font-size:.92rem;font-weight:700">${esc(c.name)}</h3>
          <p style="margin:2px 0 0;font-size:.72rem;color:#6b7280">${esc(c.phone || '')}${c.email ? ' · ' + esc(c.email) : ''}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <p style="margin:0;font-size:.72rem;color:#9ca3af">Balance Due</p>
            <strong style="font-size:1rem;color:${balColor}">Rs.${fmt(balance)}</strong>
          </div>
          <button type="button" data-close-details
            style="padding:4px 10px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:5px;cursor:pointer;font-size:.8rem;color:#6b7280">✕ Close</button>
        </div>
      </div>
      <div style="padding:8px 16px;border-bottom:1px solid #e5e7eb;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.72rem;color:#6b7280">Credit Limit: <strong>Rs.${fmt(c.creditLimit)}</strong></span>
        <span style="font-size:.72rem;color:#6b7280">Total Purchases: <strong>Rs.${fmt(c.stats?.totalPurchases)}</strong></span>
        <button type="button" data-pay-customer="${c.id}"
          style="margin-left:auto;padding:4px 12px;background:#16a34a;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:.72rem;font-weight:600">+ Post Payment</button>
      </div>
      <div style="padding:10px 16px">
        <p style="margin:0 0 6px;font-size:.72rem;font-weight:600;color:#374151">Purchase History (${sales.length})</p>
        ${
          sales.length
            ? `<div style="max-height:220px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.71rem">
            <thead><tr style="background:#f9fafb"><th style="padding:3px 6px;text-align:left">Invoice</th><th style="padding:3px 6px;text-align:right">Total</th><th style="padding:3px 6px;text-align:right">Paid</th><th style="padding:3px 6px;text-align:right;color:#dc2626">Due</th><th style="padding:3px 6px;text-align:left">Date</th></tr></thead>
            <tbody>${sales
              .map(
                (s) => `<tr style="border-top:1px solid #f3f4f6">
              <td style="padding:3px 6px;color:#6366f1">${esc(s.invoiceNumber || '—')}</td><td style="padding:3px 6px;text-align:right">Rs.${fmt(s.grandTotal)}</td><td style="padding:3px 6px;text-align:right;color:#16a34a">Rs.${fmt(s.paidAmount)}</td><td style="padding:3px 6px;text-align:right;color:#dc2626">Rs.${fmt(s.dueAmount)}</td><td style="padding:3px 6px;color:#9ca3af">${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</td>
            </tr>`
              )
              .join('')}</tbody>
          </table></div>`
            : '<p style="color:#9ca3af;font-size:.72rem;margin:0">No purchases yet.</p>'
        }
        <p style="margin:12px 0 6px;font-size:.72rem;font-weight:600;color:#374151">Ledger (${ledger.length})</p>
        ${
          ledger.length
            ? `<div style="max-height:220px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.71rem">
            <thead><tr style="background:#f9fafb"><th style="padding:3px 6px;text-align:left">Type</th><th style="padding:3px 6px;text-align:right">Debit</th><th style="padding:3px 6px;text-align:right">Credit</th><th style="padding:3px 6px;text-align:right">Balance</th><th style="padding:3px 6px;text-align:left">Notes</th><th style="padding:3px 6px;text-align:left">Date</th></tr></thead>
            <tbody>${ledger
              .map(
                (row) => `<tr style="border-top:1px solid #f3f4f6">
              <td style="padding:3px 6px;color:#6366f1">${esc(row.entryType || '—')}</td><td style="padding:3px 6px;text-align:right;color:#dc2626">Rs.${fmt(row.debit)}</td><td style="padding:3px 6px;text-align:right;color:#16a34a">Rs.${fmt(row.credit)}</td><td style="padding:3px 6px;text-align:right;font-weight:600">Rs.${fmt(row.balance)}</td><td style="padding:3px 6px;color:#6b7280">${esc(row.notes || '—')}</td><td style="padding:3px 6px;color:#9ca3af">${row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td>
            </tr>`
              )
              .join('')}</tbody>
          </table></div>`
            : '<p style="color:#9ca3af;font-size:.72rem;margin:0">No ledger entries yet.</p>'
        }
      </div>`;
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

  // ── Payment prompt (inline in details panel) ──────────────────────────────

  async function promptPayment(customerId) {
    let amount = '';
    amount = await window.posApi.dialog.prompt('Enter payment amount (PKR):', '');
    window.focus?.();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      if (amount !== '' && amount !== null) showMsg('Invalid payment amount.', true);
      return;
    }

    let note = '';
    try {
      note = await window.posApi.dialog.prompt('Payment note (optional):', '');
      window.focus?.();
    } catch (_) {}

    A().postPayment(customerId, { amount: parsed, notes: (note || '').trim() || undefined });
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
      _searchTimer = setTimeout(() => A().loadCustomers(getCurrentFilters()), 300);
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
    $id('customerForm')?.addEventListener('submit', (e) => A().saveCustomer(e));

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
          A().loadCustomerDetails(Number(cust.id));
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
        A().deleteCustomer(Number(delBtn.dataset.deleteCustomer), delBtn.dataset.customerName);
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
      const pay = e.target.closest('[data-pay-customer]');
      if (pay) {
        promptPayment(Number(pay.dataset.payCustomer));
        return;
      }
      if (e.target.closest('[data-close-details]')) {
        $id('customerDetailsPanel')?.classList.add('hidden');
        highlightSelectedRow(-1); // clear all row highlights
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
      .forEach((btn) => btn.addEventListener('click', () => A().deleteInactiveCustomers()));

    // ── Customer Groups button (appears in topbar + bottom bar — bind both) ────
    document.querySelectorAll('#openCustomerGroupsButton').forEach((btn) =>
      btn.addEventListener('click', () => {
        showMsg('Customer groups are coming soon. They are not implemented yet.', true);
      })
    );
    $id('closeCustomerGroupsModal')?.addEventListener('click', () =>
      $id('customerGroupsModal')?.classList.add('hidden')
    );

    // ── WhatsApp buttons (topbar + bottom bar — bind both instances) ───────────
    document.querySelectorAll('#customerWhatsAppButton').forEach((btn) =>
      btn.addEventListener('click', () => {
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
          A().sendWhatsApp(_selectedCustomer?.id, action);
        }
      })
    );

    // ── Send custom WhatsApp message ──────────────────────────────────────────
    $id('customerWaSendCustom')?.addEventListener('click', () => {
      const text = $id('customerWaCustomText')?.value?.trim();
      A().sendWhatsApp(_selectedCustomer?.id, 'custom', text);
    });

    // ── Close WhatsApp modal ──────────────────────────────────────────────────
    document
      .querySelectorAll('[data-customer-whatsapp-close]')
      .forEach((el) => el.addEventListener('click', () => closeWhatsAppModal()));

    // ── Customer Ledger shortcut (topbar + bottom bar — bind both) ───────────
    document.querySelectorAll('#customerLedgerShortcut').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (_selectedCustomer) A().loadCustomerDetails(_selectedCustomer.id);
        else showMsg('Select a customer first to view their ledger.', true);
      })
    );

    // ── Import / Export / Print tool buttons ──────────────────────────────────
    document
      .querySelectorAll('[data-page-tool="customers"]')
      .forEach((btn) =>
        btn.addEventListener('click', () => A().handleToolAction(btn.dataset.toolAction))
      );

    // ── Bulk actions (topbar + bottom bar — bind both) ────────────────────────
    document.querySelectorAll('#customerBulkActionsButton').forEach((btn) =>
      btn.addEventListener('click', () => {
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
    A().loadCustomers(getCurrentFilters());
    A().loadDueSummary();
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
  };

  window.initCustomersModule = init;
})();
