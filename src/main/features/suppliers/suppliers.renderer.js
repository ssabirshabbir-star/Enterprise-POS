/**
 * suppliers.renderer.js — Suppliers module UI controller
 *
 * Follows the same pattern as customers.renderer.js / products.renderer.js.
 * Exposes: window.initSuppliersModule (called by login.js navigateTo)
 * Load order: suppliers.renderer.js (self-contained — calls window.posApi directly)
 */
(function SuppliersRendererModule() {
  'use strict';

  let initialized = false;
  let initPending = false;
  let _allSuppliers = [];
  let _msgTimer = null;
  let _searchTimer = null;
  let _selectedSupplierId = null;

  const LOG = (...a) => console.log('[SuppliersRenderer]', ...a);

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
  function money(v) {
    return `Rs. ${Number(v || 0).toFixed(2)}`;
  }
  function supplierTotalPurchases(supplier) {
    return Number(supplier?.stats?.totalPurchases ?? supplier?.totalPurchases ?? 0);
  }
  function supplierTotalPayments(supplier) {
    return Number(
      supplier?.stats?.totalPaid ?? supplier?.stats?.totalPayments ?? supplier?.totalPayments ?? 0
    );
  }
  function supplierTotalDue(supplier) {
    return Number(supplier?.stats?.totalDue ?? supplier?.currentBalance ?? supplier?.totalDue ?? 0);
  }
  function supplierLastPurchase(supplier) {
    return supplier?.stats?.lastPurchaseDate || supplier?.lastPurchaseDate || null;
  }
  function supplierCity(supplier) {
    const direct = supplier?.city || supplier?.supplierCity;
    if (direct) return String(direct).trim();
    const address = String(supplier?.address || '').trim();
    if (!address) return '';
    return (
      address
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .pop() || ''
    );
  }

  // ── Feedback ─────────────────────────────────────────────────────────────

  function clearMsg() {
    const el = $id('supplierPageMessage');
    if (!el) return;
    clearTimeout(_msgTimer);
    _msgTimer = null;
    el.classList.add('hidden');
    el.textContent = '';
    el.removeAttribute('style');
  }

  function showMsg(text, type = 'success', options = {}) {
    const el = $id('supplierPageMessage');
    if (!el) return;
    const kind = typeof type === 'boolean' ? (type ? 'error' : 'success') : type || 'success';
    const styles = {
      success: 'background:#f0fdf4;color:#166534;border:1px solid #86efac',
      info: 'background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd',
      warning: 'background:#fffbeb;color:#92400e;border:1px solid #fcd34d',
      error: 'background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5',
    };
    const timeouts = { success: 3000, info: 4000, warning: 5000, error: 6000 };
    clearTimeout(_msgTimer);
    el.textContent = text;
    el.style.cssText = `display:block;${styles[kind] || styles.success};padding:5px 10px;border-radius:6px;margin:0;line-height:16px;max-height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;z-index:4`;
    el.classList.remove('hidden');
    _msgTimer = options.critical
      ? null
      : setTimeout(() => clearMsg(), timeouts[kind] || timeouts.success);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  function renderStats(suppliers) {
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('supplierStatTotal', suppliers.length);
    const totalPurchases = suppliers.reduce((s, x) => s + supplierTotalPurchases(x), 0);
    const totalPayments = suppliers.reduce((s, x) => s + supplierTotalPayments(x), 0);
    const totalDue = suppliers.reduce((s, x) => s + supplierTotalDue(x), 0);
    set('supplierStatPurchases', money(totalPurchases));
    set('supplierStatPayments', money(totalPayments));
    set('supplierStatDue', money(totalDue));
    set('supplierStatOverdue', money(totalDue)); // same field — no aging API
    set('supplierStatToday', money(0)); // no today-specific endpoint
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  function applyFilter(suppliers) {
    const search = ($id('supplierInlineSearch')?.value || '').trim().toLowerCase();
    const status = $id('supplierStatusFilter')?.value || '';
    const city = $id('supplierCityFilter')?.value || '';
    let list = suppliers;
    if (search) {
      list = list.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(search) ||
          (s.phone || '').toLowerCase().includes(search) ||
          (s.email || '').toLowerCase().includes(search) ||
          (s.address || '').toLowerCase().includes(search)
      );
    }
    if (status === 'active') list = list.filter((s) => s.isActive);
    if (status === 'inactive') list = list.filter((s) => !s.isActive);
    if (status === 'due') list = list.filter((s) => Number(s.currentBalance || 0) > 0);
    if (city) list = list.filter((s) => supplierCity(s) === city);
    return list;
  }

  function populateCityFilter(suppliers) {
    const select = $id('supplierCityFilter');
    if (!select) return;
    const previous = select.value;
    const cities = [...new Set(suppliers.map(supplierCity).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    if (!cities.length) {
      select.innerHTML = '<option value="">Cities not available yet</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML =
      '<option value="">All Cities</option>' +
      cities.map((city) => `<option value="${esc(city)}">${esc(city)}</option>`).join('');
    if (cities.includes(previous)) select.value = previous;
  }

  function renderTable(suppliers) {
    _allSuppliers = suppliers;
    renderStats(suppliers);
    const tbody = $id('supplierList');
    if (!tbody) return;
    const list = applyFilter(suppliers);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No suppliers found.</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map((s, i) => {
        const due = supplierTotalDue(s);
        const dueColor = due > 0 ? '#dc2626' : '#16a34a';
        const selected = String(s.id) === String(_selectedSupplierId);
        const lastPurchase = supplierLastPurchase(s);
        const badge = s.isActive
          ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Active</span>'
          : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Inactive</span>';
        return `<tr data-supplier-row="${s.id}" style="cursor:pointer${selected ? ';background:#eef3ff' : ''}">
        <td style="color:#9ca3af;font-size:.75rem">${i + 1}</td>
        <td style="font-weight:600;font-size:.82rem">${esc(s.name)}</td>
        <td style="font-size:.75rem">${esc(s.phone || '—')}</td>
        <td style="text-align:right;font-size:.78rem">${money(supplierTotalPurchases(s))}</td>
        <td style="text-align:right;font-size:.78rem">${money(supplierTotalPayments(s))}</td>
        <td style="text-align:right;font-weight:700;color:${dueColor};font-size:.82rem">${money(due)}</td>
        <td style="text-align:right;font-size:.75rem;color:${due > 0 ? '#dc2626' : '#6b7280'}">${money(due)}</td>
        <td style="font-size:.75rem;color:#9ca3af">${lastPurchase ? new Date(lastPurchase).toLocaleDateString() : '—'}</td>
        <td data-supplier-status>${badge}</td>
        <td class="epos-suppliers-row-actions">
          <button type="button" data-view-supplier="${s.id}" title="View supplier details">View</button>
          <button type="button" data-payment-supplier="${s.id}" title="Record supplier payment">Pay</button>
          <button type="button" data-whatsapp-supplier="${s.id}" title="Open WhatsApp options">WA</button>
          <button type="button" data-edit-supplier="${s.id}" title="Edit supplier">Edit</button>
          <button type="button" data-delete-supplier="${s.id}" data-supplier-name="${esc(s.name)}" title="Delete supplier">Del</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  // ── Load suppliers ────────────────────────────────────────────────────────

  async function loadSuppliers() {
    try {
      const res = await window.posApi.suppliers.list();
      if (!res?.ok) {
        showMsg(res?.message || 'Failed to load suppliers.', true);
        return;
      }
      populateCityFilter(res.suppliers || []);
      renderTable(res.suppliers || []);
      LOG('loaded', (res.suppliers || []).length, 'suppliers');
    } catch (err) {
      LOG('loadSuppliers error:', err);
      showMsg('Failed to load suppliers. Please try again.', true);
    }
  }

  // ── Editor modal ──────────────────────────────────────────────────────────

  function openEditor(supplier) {
    const modal = $id('supplierEditorModal');
    if (!modal) return;
    const title = $id('supplierEditorTitle');
    if (supplier) {
      if (title) title.textContent = 'Edit Supplier';
      const set = (id, v) => {
        const e = $id(id);
        if (e) e.value = v ?? '';
      };
      set('supplierPageId', supplier.id);
      set('supplierPageName', supplier.name);
      set('supplierPagePhone', supplier.phone);
      set('supplierPageEmail', supplier.email);
      set('supplierPageAddress', supplier.address);
      set('supplierOpeningBalance', 0);
      const activeEl = $id('supplierActive');
      if (activeEl) activeEl.checked = Boolean(supplier.isActive !== false);
    } else {
      if (title) title.textContent = 'New Supplier';
      $id('supplierPageForm')?.reset();
      const idEl = $id('supplierPageId');
      if (idEl) idEl.value = '';
    }
    modal.classList.remove('hidden');
    setTimeout(() => $id('supplierPageName')?.focus(), 40);
  }

  function closeEditor() {
    $id('supplierEditorModal')?.classList.add('hidden');
    $id('supplierPageForm')?.reset();
    const idEl = $id('supplierPageId');
    if (idEl) idEl.value = '';
  }

  async function saveSupplier(e) {
    e.preventDefault();
    const supplierId = $id('supplierPageId')?.value;
    const isEdit = Boolean(supplierId);
    const payload = {
      name: ($id('supplierPageName')?.value || '').trim(),
      phone: ($id('supplierPagePhone')?.value || '').trim() || undefined,
      email: ($id('supplierPageEmail')?.value || '').trim() || undefined,
      address: ($id('supplierPageAddress')?.value || '').trim() || undefined,
      isActive: $id('supplierActive')?.checked ?? true,
    };
    if (!isEdit) {
      payload.openingBalance = parseFloat($id('supplierOpeningBalance')?.value || '0') || 0;
    }
    const btn = $id('saveSupplierButton');
    if (btn) btn.disabled = true;
    try {
      const res = isEdit
        ? await window.posApi.suppliers.update(Number(supplierId), payload)
        : await window.posApi.suppliers.create(payload);
      if (!res?.ok) {
        if (!isEdit && payload.openingBalance > 0 && /request failed/i.test(res?.message || '')) {
          showMsg(
            'Opening balance could not be saved by the current database setup. Please save the supplier with zero opening balance or run database setup first.',
            true
          );
          return;
        }
        showMsg(res?.message || 'Save failed.', true);
        return;
      }
      showMsg(res.message || (isEdit ? 'Supplier updated.' : 'Supplier saved.'));
      closeEditor();
      await loadSuppliers();
    } catch (err) {
      LOG('saveSupplier error:', err);
      showMsg('Save failed. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteSupplier(id, name) {
    const ok = await window.posApi.dialog.confirm(`Delete "${name}"? This cannot be undone.`);
    window.focus?.();
    if (!ok) return;
    try {
      const res = await window.posApi.suppliers.delete(id);
      if (!res?.ok) {
        showMsg(res?.message || 'Delete failed.', true);
        return;
      }
      showMsg(res.message || 'Supplier deleted.');
      await loadSuppliers();
    } catch (err) {
      LOG('deleteSupplier error:', err);
      showMsg('Delete failed. Please try again.', true);
    }
  }

  // ── Payment modal ─────────────────────────────────────────────────────────

  function openPaymentModal(supplierId) {
    _selectedSupplierId = supplierId ? String(supplierId) : null;
    renderTable(_allSuppliers);
    const modal = $id('supplierPaymentModal');
    if (!modal) return;
    const select = $id('supplierPaymentSupplier');
    if (select) {
      // Pre-select this supplier in the dropdown
      Array.from(select.options).forEach((o) => {
        o.selected = String(o.value) === String(supplierId);
      });
    }
    const due = $id('supplierPaymentDue');
    const supplier = _allSuppliers.find((s) => String(s.id) === String(supplierId));
    if (due && supplier) due.textContent = money(supplier.currentBalance);
    modal.classList.remove('hidden');
    setTimeout(() => $id('supplierPaymentStandaloneAmount')?.focus(), 40);
  }

  function openPaymentForSupplier(supplierId) {
    if (!supplierId) {
      showMsg('Please select a supplier first.', 'warning');
      return;
    }
    populatePaymentDropdown();
    openPaymentModal(supplierId);
  }

  function closePaymentModal() {
    $id('supplierPaymentModal')?.classList.add('hidden');
    $id('supplierPaymentStandaloneForm')?.reset();
  }

  async function savePayment(e) {
    e.preventDefault();
    const supplierId = _selectedSupplierId || Number($id('supplierPaymentSupplier')?.value);
    if (!supplierId) {
      showMsg('Select a supplier.', 'warning');
      return;
    }
    const amount = parseFloat($id('supplierPaymentStandaloneAmount')?.value || '0');
    if (!amount || amount <= 0) {
      showMsg('Enter a valid payment amount.', 'warning');
      return;
    }
    const payload = {
      amount,
      paymentMethod: $id('supplierPaymentStandaloneMethod')?.value || 'Cash',
      notes: $id('supplierPaymentStandaloneNotes')?.value?.trim() || undefined,
    };
    const btn = $id('saveSupplierPaymentButton');
    if (btn) btn.disabled = true;
    try {
      const res = await window.posApi.suppliers.payment(supplierId, payload);
      if (!res?.ok) {
        showMsg(res?.message || 'Payment failed.', true);
        return;
      }
      showMsg(res.message || 'Payment recorded.');
      closePaymentModal();
      await loadSuppliers();
    } catch (err) {
      LOG('savePayment error:', err);
      showMsg('Payment failed. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Populate payment dropdown ─────────────────────────────────────────────

  function populatePaymentDropdown() {
    const select = $id('supplierPaymentSupplier');
    if (!select) return;
    select.innerHTML =
      '<option value="">-- Select Supplier --</option>' +
      _allSuppliers
        .map(
          (s) =>
            `<option value="${s.id}">${esc(s.name)}${Number(s.currentBalance || 0) > 0 ? ` (Due: ${money(s.currentBalance)})` : ''}</option>`
        )
        .join('');
  }

  // ── Ledger picker modal ───────────────────────────────────────────────────

  function closeLedgerPicker() {
    $id('supplierLedgerPickerModal')?.classList.add('hidden');
  }

  function renderLedgerPickerList(search) {
    const list = $id('supplierLedgerPickerList');
    if (!list) return;
    const filtered = _allSuppliers.filter(
      (s) => !search || (s.name || '').toLowerCase().includes(search.toLowerCase())
    );
    list.innerHTML =
      filtered
        .map(
          (s) =>
            `<li data-ledger-pick="${s.id}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6">
        <strong style="font-size:.82rem">${esc(s.name)}</strong>
        <span style="color:#6b7280;font-size:.72rem;margin-left:8px">${esc(s.phone || '')}</span>
        ${Number(s.currentBalance || 0) > 0 ? `<span style="float:right;color:#dc2626;font-size:.75rem;font-weight:700">${money(s.currentBalance)}</span>` : ''}
      </li>`
        )
        .join('') ||
      '<li style="padding:8px 12px;color:#9ca3af;font-size:.82rem">No suppliers found.</li>';
  }

  function renderSupplierDetails(data) {
    const panel = $id('supplierDetailsPanel');
    if (!panel) return;
    const supplier = data.supplier || {};
    const purchases = data.purchases || [];
    _selectedSupplierId = supplier.id;
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <h3 style="margin:0;font-size:.95rem;font-weight:700">${esc(supplier.name)}</h3>
            <p style="margin:3px 0 0;font-size:.72rem;color:#6b7280">${esc(supplier.phone || '')}${supplier.email ? ' - ' + esc(supplier.email) : ''}</p>
          </div>
          <button type="button" data-close-supplier-details style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:5px;padding:4px 8px;cursor:pointer">x</button>
        </div>
      </div>
      <div style="padding:12px 14px;display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;font-size:.78rem"><span>Total Purchases</span><strong>${money(supplierTotalPurchases(supplier))}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem"><span>Total Payments</span><strong>${money(supplierTotalPayments(supplier))}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem"><span>Outstanding</span><strong style="color:#dc2626">${money(supplierTotalDue(supplier))}</strong></div>
        <p style="margin:8px 0 4px;font-size:.75rem;font-weight:700;color:#374151">Purchase History (${purchases.length})</p>
        ${
          purchases.length
            ? `<div style="max-height:240px;overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.71rem">
            <thead><tr style="background:#f9fafb"><th style="padding:4px;text-align:left">Invoice</th><th style="padding:4px;text-align:right">Total</th><th style="padding:4px;text-align:right">Paid</th><th style="padding:4px;text-align:right">Due</th><th style="padding:4px;text-align:left">Date</th></tr></thead>
            <tbody>${purchases
              .map(
                (p) => `<tr style="border-top:1px solid #f3f4f6">
              <td style="padding:4px;color:#6366f1">${esc(p.invoiceNumber || '—')}</td><td style="padding:4px;text-align:right">${money(p.grandTotal)}</td><td style="padding:4px;text-align:right;color:#16a34a">${money(p.paidAmount)}</td><td style="padding:4px;text-align:right;color:#dc2626">${money(p.dueAmount)}</td><td style="padding:4px;color:#9ca3af">${p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString() : '—'}</td>
            </tr>`
              )
              .join('')}</tbody>
          </table></div>`
            : '<p style="color:#9ca3af;font-size:.72rem;margin:0">No purchases yet.</p>'
        }
      </div>`;
  }

  function renderSupplierLedger(supplierId, ledger) {
    const supplier = _allSuppliers.find((s) => String(s.id) === String(supplierId)) || {};
    const panel = $id('supplierDetailsPanel');
    if (!panel) return;
    _selectedSupplierId = supplierId;
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">
        <div><h3 style="margin:0;font-size:.95rem;font-weight:700">${esc(supplier.name || 'Supplier Ledger')}</h3><p style="margin:3px 0 0;font-size:.72rem;color:#6b7280">Ledger entries: ${ledger.length}</p></div>
        <button type="button" data-close-supplier-details style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:5px;padding:4px 8px;cursor:pointer">x</button>
      </div>
      <div style="padding:12px 14px">
        ${
          ledger.length
            ? `<div style="max-height:300px;overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.71rem">
            <thead><tr style="background:#f9fafb"><th style="padding:4px;text-align:left">Type</th><th style="padding:4px;text-align:left">Ref</th><th style="padding:4px;text-align:right">Debit</th><th style="padding:4px;text-align:right">Credit</th><th style="padding:4px;text-align:right">Balance</th><th style="padding:4px;text-align:left">Date</th></tr></thead>
            <tbody>${ledger
              .map(
                (row) => `<tr style="border-top:1px solid #f3f4f6">
              <td style="padding:4px;color:#6366f1">${esc(row.entryType || row.referenceType || '—')}</td><td style="padding:4px;color:#6b7280">${esc(row.invoiceNumber || row.paymentMethod || row.notes || '—')}</td><td style="padding:4px;text-align:right;color:#dc2626">${money(row.debit)}</td><td style="padding:4px;text-align:right;color:#16a34a">${money(row.credit)}</td><td style="padding:4px;text-align:right;font-weight:700">${money(row.balance)}</td><td style="padding:4px;color:#9ca3af">${row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td>
            </tr>`
              )
              .join('')}</tbody>
          </table></div>`
            : '<p style="color:#9ca3af;font-size:.72rem;margin:0">No ledger entries yet.</p>'
        }
      </div>`;
  }

  function selectSupplier(supplierId) {
    _selectedSupplierId = supplierId ? String(supplierId) : null;
    renderTable(_allSuppliers);
  }

  function openSupplierDetails(supplierId) {
    _selectedSupplierId = supplierId ? String(supplierId) : null;
    renderTable(_allSuppliers);
    return window.posApi.suppliers
      .details(_selectedSupplierId)
      .then((res) => {
        if (!res?.ok) {
          showMsg(res?.message || 'Could not load supplier details.', true);
          return;
        }
        renderSupplierDetails(res);
      })
      .catch(() => showMsg('Supplier details request failed.', true));
  }

  function openWhatsAppModal(supplierId) {
    if (!supplierId) {
      showMsg('Please select a supplier first.', 'warning');
      return;
    }
    _selectedSupplierId = String(supplierId);
    renderTable(_allSuppliers);
    const supplier = _allSuppliers.find((s) => String(s.id) === String(_selectedSupplierId));
    if (!supplier?.phone) {
      showMsg('Selected supplier has no phone number.', 'warning');
      return;
    }
    const modal = $id('supplierWhatsAppModal');
    const target = $id('supplierWhatsAppTarget');
    if (target) target.textContent = `${supplier.name} - ${supplier.phone}`;
    modal?.classList.remove('hidden');
  }

  function closeSupplierOverlays() {
    $id('supplierDetailsPanel')?.classList.add('hidden');
    $id('supplierLedgerPickerModal')?.classList.add('hidden');
    $id('supplierWhatsAppModal')?.classList.add('hidden');
    $id('supplierPaymentModal')?.classList.add('hidden');
    $id('supplierEditorModal')?.classList.add('hidden');
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  function attachEvents() {
    LOG('attachEvents()');

    // Search / filter
    $id('supplierInlineSearch')?.addEventListener('input', () => {
      clearMsg();
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => renderTable(_allSuppliers), 280);
    });
    $id('supplierStatusFilter')?.addEventListener('change', () => {
      clearMsg();
      renderTable(_allSuppliers);
    });
    $id('supplierCityFilter')?.addEventListener('change', () => {
      clearMsg();
      renderTable(_allSuppliers);
    });
    ['supplierFromDateFilter', 'supplierToDateFilter'].forEach((id) =>
      $id(id)?.addEventListener('change', () =>
        showMsg('Advanced supplier filters are coming soon. They are not implemented yet.', 'info')
      )
    );
    $id('supplierResetFilterButton')?.addEventListener('click', () => {
      clearMsg();
      const s = $id('supplierInlineSearch');
      if (s) s.value = '';
      const f = $id('supplierStatusFilter');
      if (f) f.value = '';
      ['supplierCityFilter', 'supplierFromDateFilter', 'supplierToDateFilter'].forEach((id) => {
        const el = $id(id);
        if (el) el.value = '';
      });
      renderTable(_allSuppliers);
    });

    document.querySelectorAll('[data-supplier-view]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const view = btn.dataset.supplierView;
        if (view === 'list') {
          document
            .querySelectorAll('[data-supplier-view]')
            .forEach((b) => b.classList.toggle('active', b === btn));
          renderTable(_allSuppliers);
          return;
        }
        showMsg('Supplier tabs are coming soon. They are not implemented yet.', 'info');
      })
    );

    // New supplier buttons
    ['supplierBottomNewButton'].forEach((id) =>
      $id(id)?.addEventListener('click', () => openEditor(null))
    );

    // Form submit
    $id('supplierPageForm')?.addEventListener('submit', (e) => saveSupplier(e));

    // Close editor
    document
      .querySelectorAll('[data-supplier-editor-close]')
      .forEach((el) => el.addEventListener('click', () => closeEditor()));

    // Table delegation — edit / delete
    $id('supplierList')?.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view-supplier]');
      if (viewBtn) {
        openSupplierDetails(viewBtn.dataset.viewSupplier);
        return;
      }
      const paymentBtn = e.target.closest('[data-payment-supplier]');
      if (paymentBtn) {
        openPaymentForSupplier(paymentBtn.dataset.paymentSupplier);
        return;
      }
      const whatsappBtn = e.target.closest('[data-whatsapp-supplier]');
      if (whatsappBtn) {
        openWhatsAppModal(whatsappBtn.dataset.whatsappSupplier);
        return;
      }
      const editBtn = e.target.closest('[data-edit-supplier]');
      if (editBtn) {
        const supplier = _allSuppliers.find((s) => String(s.id) === editBtn.dataset.editSupplier);
        if (supplier) openEditor(supplier);
        return;
      }
      const delBtn = e.target.closest('[data-delete-supplier]');
      if (delBtn) {
        deleteSupplier(Number(delBtn.dataset.deleteSupplier), delBtn.dataset.supplierName);
      }
    });
    // Payment button
    $id('supplierBottomPaymentButton')?.addEventListener('click', () => {
      openPaymentForSupplier(_selectedSupplierId);
    });
    $id('supplierPaymentStandaloneForm')?.addEventListener('submit', (e) => savePayment(e));
    document
      .querySelectorAll('[data-supplier-payment-close]')
      .forEach((el) => el.addEventListener('click', () => closePaymentModal()));

    // Ledger picker
    $id('supplierAgingButton')?.addEventListener('click', () =>
      showMsg('Supplier aging report is coming soon. It is not implemented yet.', 'info')
    );
    $id('supplierStatementButton')?.addEventListener('click', () =>
      showMsg('Supplier statement is coming soon. It is not implemented yet.', 'info')
    );
    document
      .querySelectorAll('[data-ledger-picker-close]')
      .forEach((el) => el.addEventListener('click', () => closeLedgerPicker()));
    $id('supplierLedgerPickerSearch')?.addEventListener('input', (e) =>
      renderLedgerPickerList(e.target.value)
    );
    $id('supplierLedgerPickerList')?.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-ledger-pick]');
      if (!li) return;
      const supplierId = li.dataset.ledgerPick;
      closeLedgerPicker();
      try {
        const res = await window.posApi.suppliers.ledger(supplierId);
        if (!res?.ok) {
          showMsg('Could not load ledger.', true);
          return;
        }
        const ledger = res.ledger || res.entries || [];
        renderSupplierLedger(supplierId, ledger);
        showMsg(`Ledger loaded for supplier. ${ledger.length} entries.`);
        LOG('ledger entries:', ledger.length);
      } catch (err) {
        showMsg('Ledger request failed.', true);
      }
    });

    $id('supplierExportButton')?.addEventListener('click', () =>
      showMsg('Supplier export is coming soon. It is not implemented yet.', 'info')
    );
    $id('supplierPrintButton')?.addEventListener('click', () =>
      showMsg('Supplier print is coming soon. It is not implemented yet.', 'info')
    );
    // WhatsApp modal
    $id('supplierWhatsAppButton')?.addEventListener('click', () => {
      openWhatsAppModal(_selectedSupplierId);
    });
    document
      .querySelectorAll('[data-whatsapp-modal-close]')
      .forEach((el) =>
        el.addEventListener('click', () => $id('supplierWhatsAppModal')?.classList.add('hidden'))
      );
    document.querySelectorAll('.epos-suppliers-wa-btn').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const action = btn.dataset.waAction;
        const supplier = _allSuppliers.find((s) => String(s.id) === String(_selectedSupplierId));
        if (!supplier?.phone) return;
        const digits = supplier.phone.replace(/\D/g, '');
        const messages = {
          ledger: `Dear ${supplier.name},\nYour ledger statement is ready. Outstanding balance: Rs.${Number(supplier.currentBalance || 0).toFixed(2)}.\nPlease contact us for details.`,
          invoices: `Dear ${supplier.name},\nYour purchase invoice history is available. Contact us to get a copy.`,
          due: `Dear ${supplier.name},\nReminder: Your outstanding balance is Rs.${Number(supplier.currentBalance || 0).toFixed(2)}. Please clear at your earliest convenience.`,
          payment: `Dear ${supplier.name},\nThank you for your payment. Your account has been updated.`,
          custom: '',
        };
        if (action === 'custom') {
          $id('supplierWaCustomBox')?.classList.remove('hidden');
          return;
        }
        try {
          await window.posApi.shell.openExternal(
            `https://wa.me/${digits}?text=${encodeURIComponent(messages[action] || '')}`
          );
          $id('supplierWhatsAppModal')?.classList.add('hidden');
        } catch (_) {}
      })
    );
    $id('supplierWaSendCustom')?.addEventListener('click', async () => {
      const text = $id('supplierWaCustomText')?.value?.trim();
      const supplier = _allSuppliers.find((s) => String(s.id) === String(_selectedSupplierId));
      if (!text || !supplier?.phone) return;
      const digits = supplier.phone.replace(/\D/g, '');
      try {
        await window.posApi.shell.openExternal(
          `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        );
      } catch (_) {}
    });

    // Row click — select supplier
    $id('supplierList')?.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (
        !row ||
        e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('[data-supplier-status]')
      )
        return;
      // Find first button with data-edit-supplier to get id
      const editBtn = row.querySelector('[data-edit-supplier]');
      if (editBtn) {
        selectSupplier(editBtn.dataset.editSupplier);
      }
    });

    $id('supplierDetailsPanel')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-supplier-details]')) {
        $id('supplierDetailsPanel')?.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSupplierOverlays();
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!$id('supplierList')) {
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
    loadSuppliers();
    LOG('init() complete');
  }

  window.initSuppliersModule = init;
})();
