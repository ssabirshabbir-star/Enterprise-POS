/**
 * suppliers.renderer.js — Suppliers module UI controller
 *
 * Follows the same pattern as customers.renderer.js / products.renderer.js.
 * Exposes: window.initSuppliersModule (called by login.js navigateTo)
 * Load order: suppliers.renderer.js (self-contained — calls window.posApi directly)
 */
(function SuppliersRendererModule() {
  'use strict';

  let initialized  = false;
  let initPending  = false;
  let _allSuppliers = [];
  let _msgTimer     = null;
  let _searchTimer  = null;
  let _selectedSupplierId = null;

  const LOG = (...a) => console.log('[SuppliersRenderer]', ...a);

  function $id(id)  { return document.getElementById(id); }
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function money(v) { return `Rs. ${Number(v || 0).toFixed(2)}`; }

  // ── Feedback ─────────────────────────────────────────────────────────────

  function showMsg(text, isError) {
    const el = $id('supplierPageMessage');
    if (!el) return;
    el.textContent = text;
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;padding:8px 12px;border-radius:6px;margin-bottom:8px'
      : 'display:block;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:8px 12px;border-radius:6px;margin-bottom:8px';
    el.classList.remove('hidden');
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  function renderStats(suppliers) {
    const set = (id, v) => { const e = $id(id); if (e) e.textContent = v; };
    set('supplierStatTotal', suppliers.length);
    const totalPurchases = suppliers.reduce((s, x) => s + Number(x.totalPurchases || 0), 0);
    const totalPayments  = suppliers.reduce((s, x) => s + Number(x.totalPayments  || 0), 0);
    const totalDue       = suppliers.reduce((s, x) => s + Number(x.currentBalance || 0), 0);
    set('supplierStatPurchases', money(totalPurchases));
    set('supplierStatPayments',  money(totalPayments));
    set('supplierStatDue',       money(totalDue));
    set('supplierStatOverdue',   money(totalDue));   // same field — no aging API
    set('supplierStatToday',     money(0));           // no today-specific endpoint
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  function applyFilter(suppliers) {
    const search = ($id('supplierInlineSearch')?.value || '').trim().toLowerCase();
    const status = $id('supplierStatusFilter')?.value || '';
    let list = suppliers;
    if (search) {
      list = list.filter(s =>
        (s.name   || '').toLowerCase().includes(search) ||
        (s.phone  || '').toLowerCase().includes(search) ||
        (s.email  || '').toLowerCase().includes(search) ||
        (s.address|| '').toLowerCase().includes(search)
      );
    }
    if (status === 'active')   list = list.filter(s => s.isActive);
    if (status === 'inactive') list = list.filter(s => !s.isActive);
    if (status === 'due')      list = list.filter(s => Number(s.currentBalance || 0) > 0);
    return list;
  }

  function renderTable(suppliers) {
    _allSuppliers = suppliers;
    renderStats(suppliers);
    const tbody = $id('supplierList');
    if (!tbody) return;
    const list = applyFilter(suppliers);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No suppliers found.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map((s, i) => {
      const due      = Number(s.currentBalance || 0);
      const dueColor = due > 0 ? '#dc2626' : '#16a34a';
      const badge    = s.isActive
        ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Active</span>'
        : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600">Inactive</span>';
      return `<tr style="cursor:pointer">
        <td><input type="checkbox" /></td>
        <td style="color:#9ca3af;font-size:.75rem">${i + 1}</td>
        <td style="font-weight:600;font-size:.82rem">${esc(s.name)}</td>
        <td style="font-size:.75rem">${esc(s.phone || '—')}<br><small style="color:#9ca3af">${esc(s.email || '')}</small></td>
        <td style="text-align:right;font-size:.78rem">${money(s.totalPurchases)}</td>
        <td style="text-align:right;font-size:.78rem">${money(s.totalPayments)}</td>
        <td style="text-align:right;font-weight:700;color:${dueColor};font-size:.82rem">${money(due)}</td>
        <td style="text-align:right;font-size:.75rem;color:${due > 0 ? '#dc2626' : '#6b7280'}">${money(due)}</td>
        <td style="font-size:.75rem;color:#9ca3af">—</td>
        <td>${badge}</td>
        <td style="white-space:nowrap;text-align:center">
          <button type="button" data-edit-supplier="${s.id}"
            style="padding:3px 8px;border:1px solid #3b82f6;color:#3b82f6;background:none;border-radius:5px;cursor:pointer;font-size:.72rem;margin-right:3px">Edit</button>
          <button type="button" data-delete-supplier="${s.id}" data-supplier-name="${esc(s.name)}"
            style="padding:3px 8px;border:1px solid #ef4444;color:#ef4444;background:none;border-radius:5px;cursor:pointer;font-size:.72rem">Del</button>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Load suppliers ────────────────────────────────────────────────────────

  async function loadSuppliers() {
    try {
      const res = await window.posApi.suppliers.list();
      if (!res?.ok) { showMsg(res?.message || 'Failed to load suppliers.', true); return; }
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
      const set = (id, v) => { const e = $id(id); if (e) e.value = v ?? ''; };
      set('supplierPageId',      supplier.id);
      set('supplierPageName',    supplier.name);
      set('supplierPagePhone',   supplier.phone);
      set('supplierPageEmail',   supplier.email);
      set('supplierPageAddress', supplier.address);
      set('supplierOpeningBalance', 0);
      const activeEl = $id('supplierActive');
      if (activeEl) activeEl.checked = Boolean(supplier.isActive !== false);
    } else {
      if (title) title.textContent = 'New Supplier';
      $id('supplierPageForm')?.reset();
      const idEl = $id('supplierPageId'); if (idEl) idEl.value = '';
    }
    modal.classList.remove('hidden');
    setTimeout(() => $id('supplierPageName')?.focus(), 40);
  }

  function closeEditor() {
    $id('supplierEditorModal')?.classList.add('hidden');
    $id('supplierPageForm')?.reset();
    const idEl = $id('supplierPageId'); if (idEl) idEl.value = '';
  }

  async function saveSupplier(e) {
    e.preventDefault();
    const supplierId = $id('supplierPageId')?.value;
    const isEdit     = Boolean(supplierId);
    const payload = {
      name:    ($id('supplierPageName')?.value    || '').trim(),
      phone:   ($id('supplierPagePhone')?.value   || '').trim() || undefined,
      email:   ($id('supplierPageEmail')?.value   || '').trim() || undefined,
      address: ($id('supplierPageAddress')?.value || '').trim() || undefined,
      isActive: $id('supplierActive')?.checked ?? true,
    };
    const btn = $id('saveSupplierButton');
    if (btn) btn.disabled = true;
    try {
      const res = isEdit
        ? await window.posApi.suppliers.update(Number(supplierId), payload)
        : await window.posApi.suppliers.create(payload);
      if (!res?.ok) { showMsg(res?.message || 'Save failed.', true); return; }
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
    let ok = false;
    try   { ok = await window.posApi.dialog.confirm(`Delete "${name}"? This cannot be undone.`); }
    catch { ok = window.confirm(`Delete "${name}"?`); }
    if (!ok) return;
    try {
      const res = await window.posApi.suppliers.delete(id);
      if (!res?.ok) { showMsg(res?.message || 'Delete failed.', true); return; }
      showMsg(res.message || 'Supplier deleted.');
      await loadSuppliers();
    } catch (err) {
      LOG('deleteSupplier error:', err);
      showMsg('Delete failed. Please try again.', true);
    }
  }

  // ── Payment modal ─────────────────────────────────────────────────────────

  function openPaymentModal(supplierId) {
    _selectedSupplierId = supplierId;
    const modal = $id('supplierPaymentModal');
    if (!modal) return;
    const select = $id('supplierPaymentSupplier');
    if (select) {
      // Pre-select this supplier in the dropdown
      Array.from(select.options).forEach(o => {
        o.selected = String(o.value) === String(supplierId);
      });
    }
    const due = $id('supplierPaymentDue');
    const supplier = _allSuppliers.find(s => String(s.id) === String(supplierId));
    if (due && supplier) due.textContent = money(supplier.currentBalance);
    modal.classList.remove('hidden');
    setTimeout(() => $id('supplierPaymentStandaloneAmount')?.focus(), 40);
  }

  function closePaymentModal() {
    $id('supplierPaymentModal')?.classList.add('hidden');
    $id('supplierPaymentStandaloneForm')?.reset();
  }

  async function savePayment(e) {
    e.preventDefault();
    const supplierId = _selectedSupplierId ||
      Number($id('supplierPaymentSupplier')?.value);
    if (!supplierId) { showMsg('Select a supplier.', true); return; }
    const amount = parseFloat($id('supplierPaymentStandaloneAmount')?.value || '0');
    if (!amount || amount <= 0) { showMsg('Enter a valid payment amount.', true); return; }
    const payload = {
      amount,
      paymentMethod: $id('supplierPaymentStandaloneMethod')?.value || 'Cash',
      notes: $id('supplierPaymentStandaloneNotes')?.value?.trim() || undefined,
    };
    const btn = $id('saveSupplierPaymentButton');
    if (btn) btn.disabled = true;
    try {
      const res = await window.posApi.suppliers.payment(supplierId, payload);
      if (!res?.ok) { showMsg(res?.message || 'Payment failed.', true); return; }
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
    select.innerHTML = '<option value="">-- Select Supplier --</option>' +
      _allSuppliers.map(s =>
        `<option value="${s.id}">${esc(s.name)}${Number(s.currentBalance || 0) > 0 ? ` (Due: ${money(s.currentBalance)})` : ''}</option>`
      ).join('');
  }

  // ── Ledger picker modal ───────────────────────────────────────────────────

  function openLedgerPicker() {
    const modal = $id('supplierLedgerPickerModal');
    if (!modal) return;
    renderLedgerPickerList('');
    modal.classList.remove('hidden');
    setTimeout(() => $id('supplierLedgerPickerSearch')?.focus(), 40);
  }

  function closeLedgerPicker() {
    $id('supplierLedgerPickerModal')?.classList.add('hidden');
  }

  function renderLedgerPickerList(search) {
    const list = $id('supplierLedgerPickerList');
    if (!list) return;
    const filtered = _allSuppliers.filter(s =>
      !search || (s.name || '').toLowerCase().includes(search.toLowerCase())
    );
    list.innerHTML = filtered.map(s =>
      `<li data-ledger-pick="${s.id}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6">
        <strong style="font-size:.82rem">${esc(s.name)}</strong>
        <span style="color:#6b7280;font-size:.72rem;margin-left:8px">${esc(s.phone || '')}</span>
        ${Number(s.currentBalance || 0) > 0 ? `<span style="float:right;color:#dc2626;font-size:.75rem;font-weight:700">${money(s.currentBalance)}</span>` : ''}
      </li>`
    ).join('') || '<li style="padding:8px 12px;color:#9ca3af;font-size:.82rem">No suppliers found.</li>';
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  function attachEvents() {
    LOG('attachEvents()');

    // Search / filter
    $id('supplierInlineSearch')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => renderTable(_allSuppliers), 280);
    });
    $id('supplierStatusFilter')?.addEventListener('change', () => renderTable(_allSuppliers));
    $id('supplierResetFilterButton')?.addEventListener('click', () => {
      const s = $id('supplierInlineSearch'); if (s) s.value = '';
      const f = $id('supplierStatusFilter'); if (f) f.value = '';
      renderTable(_allSuppliers);
    });

    // New supplier buttons
    ['supplierBottomNewButton'].forEach(id =>
      $id(id)?.addEventListener('click', () => openEditor(null))
    );

    // Form submit
    $id('supplierPageForm')?.addEventListener('submit', e => saveSupplier(e));

    // Close editor
    document.querySelectorAll('[data-supplier-editor-close]').forEach(el =>
      el.addEventListener('click', () => closeEditor())
    );

    // Table delegation — edit / delete
    $id('supplierList')?.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit-supplier]');
      if (editBtn) {
        const supplier = _allSuppliers.find(s => String(s.id) === editBtn.dataset.editSupplier);
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
      populatePaymentDropdown();
      openPaymentModal(_selectedSupplierId || null);
    });
    $id('supplierPaymentStandaloneForm')?.addEventListener('submit', e => savePayment(e));
    document.querySelectorAll('[data-supplier-payment-close]').forEach(el =>
      el.addEventListener('click', () => closePaymentModal())
    );

    // Ledger picker
    $id('supplierNewPurchaseButton')?.addEventListener('click', () =>
      showMsg('Open the Purchases module to record a new purchase.', false)
    );
    $id('supplierBottomPaymentButton') && $id('supplierLedgerPickerModal') &&
      $id('supplierAgingButton')?.addEventListener('click', () => openLedgerPicker());
    $id('supplierStatementButton')?.addEventListener('click', () => openLedgerPicker());
    document.querySelectorAll('[data-ledger-picker-close]').forEach(el =>
      el.addEventListener('click', () => closeLedgerPicker())
    );
    $id('supplierLedgerPickerSearch')?.addEventListener('input', e =>
      renderLedgerPickerList(e.target.value)
    );
    $id('supplierLedgerPickerList')?.addEventListener('click', async e => {
      const li = e.target.closest('[data-ledger-pick]');
      if (!li) return;
      const supplierId = li.dataset.ledgerPick;
      closeLedgerPicker();
      try {
        const res = await window.posApi.suppliers.ledger(supplierId);
        if (!res?.ok) { showMsg('Could not load ledger.', true); return; }
        showMsg(`Ledger loaded for supplier. ${(res.entries || []).length} entries.`);
        LOG('ledger entries:', res.entries?.length);
      } catch (err) { showMsg('Ledger request failed.', true); }
    });

    // WhatsApp modal
    $id('supplierWhatsAppButton')?.addEventListener('click', () => {
      if (!_selectedSupplierId) { showMsg('Select a supplier row to use WhatsApp.', true); return; }
      const supplier = _allSuppliers.find(s => String(s.id) === String(_selectedSupplierId));
      if (!supplier?.phone) { showMsg('Selected supplier has no phone number.', true); return; }
      const modal = $id('supplierWhatsAppModal');
      const target = $id('supplierWhatsAppTarget');
      if (target) target.textContent = `${supplier.name} — ${supplier.phone}`;
      modal?.classList.remove('hidden');
    });
    document.querySelectorAll('[data-whatsapp-modal-close]').forEach(el =>
      el.addEventListener('click', () => $id('supplierWhatsAppModal')?.classList.add('hidden'))
    );
    document.querySelectorAll('.epos-suppliers-wa-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const action = btn.dataset.waAction;
        const supplier = _allSuppliers.find(s => String(s.id) === String(_selectedSupplierId));
        if (!supplier?.phone) return;
        const digits = supplier.phone.replace(/\D/g, '');
        const messages = {
          ledger:  `Dear ${supplier.name},\nYour ledger statement is ready. Outstanding balance: Rs.${Number(supplier.currentBalance || 0).toFixed(2)}.\nPlease contact us for details.`,
          invoices:`Dear ${supplier.name},\nYour purchase invoice history is available. Contact us to get a copy.`,
          due:     `Dear ${supplier.name},\nReminder: Your outstanding balance is Rs.${Number(supplier.currentBalance || 0).toFixed(2)}. Please clear at your earliest convenience.`,
          payment: `Dear ${supplier.name},\nThank you for your payment. Your account has been updated.`,
          custom:  '',
        };
        if (action === 'custom') {
          $id('supplierWaCustomBox')?.classList.remove('hidden');
          return;
        }
        try {
          await window.posApi.shell.openExternal(`https://wa.me/${digits}?text=${encodeURIComponent(messages[action] || '')}`);
          $id('supplierWhatsAppModal')?.classList.add('hidden');
        } catch (_) {}
      })
    );
    $id('supplierWaSendCustom')?.addEventListener('click', async () => {
      const text = $id('supplierWaCustomText')?.value?.trim();
      const supplier = _allSuppliers.find(s => String(s.id) === String(_selectedSupplierId));
      if (!text || !supplier?.phone) return;
      const digits = supplier.phone.replace(/\D/g, '');
      try { await window.posApi.shell.openExternal(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`); } catch(_) {}
    });

    // Row click — select supplier
    $id('supplierList')?.addEventListener('click', e => {
      const row = e.target.closest('tr');
      if (!row || e.target.closest('button')) return;
      const cells = row.querySelectorAll('td');
      // Find first button with data-edit-supplier to get id
      const editBtn = row.querySelector('[data-edit-supplier]');
      if (editBtn) _selectedSupplierId = editBtn.dataset.editSupplier;
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!$id('supplierList')) {
      if (initPending) return;
      initPending = true;
      setTimeout(() => { initPending = false; init(); }, 80);
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
