/**
 * inventory.renderer.js — Inventory module UI controller
 *
 * Follows the same pattern as customers.renderer.js / suppliers.renderer.js.
 * Exposes: window.initInventoryModule (called by login.js navigateTo)
 * Load order: inventory.api.js, then inventory.renderer.js
 */
(function InventoryRendererModule() {
  'use strict';

  let initialized = false;
  let initPending = false;
  let _allItems = [];
  let _msgTimer = null;
  let _searchTimer = null;
  let _currentTab = 'all';
  let _page = 1;
  let _exportInFlight = false;
  let _importPreviewLoading = false;
  let _importPreviewOpen = false;
  let _previewSessionId = null;
  let _matchedPreviewSessionId = null;
  let _matchedPreviewDocument = null;
  let _commitPlanSessionId = null;
  let _executionPreflightSessionId = null;
  let _executionPreflightDocument = null;
  let _executionPreflightDigest = null;
  let _executionContractDigest = null;
  let _executionPreflightGeneration = 0;
  let _importWorkflowGeneration = 0;
  let _importExecutionInFlight = false;
  let _importExecutionCommitted = false;
  let _executionConfirmGeneration = null;
  let _importPreviewTrigger = null;
  const PAGE_SIZE = 50;

  const LOG = () => {};

  function api() {
    return window.InventoryApi;
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
  function money(v) {
    return `PKR ${Number(v || 0).toFixed(2)}`;
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = value == null || value === '' ? '-' : String(value);
  }

  function clearNode(node) {
    if (node) node.replaceChildren();
  }

  function createTextEl(tagName, className, text) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  }

  // ── Feedback ─────────────────────────────────────────────────────────────

  function showMsg(text, isError) {
    const el = $id('inventoryMessage');
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

  function renderStats(items) {
    const set = (id, v) => {
      const e = $id(id);
      if (e) e.textContent = v;
    };
    set('inventoryStatProducts', items.length);
    const value = items.reduce(
      (s, x) =>
        s + Number(x.currentStock || 0) * Number(x.lastPurchasePrice ?? x.purchasePrice ?? 0),
      0
    );
    const low = items.filter(
      (x) =>
        Number(x.currentStock || 0) > 0 &&
        Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
    ).length;
    const out = items.filter((x) => Number(x.currentStock || 0) <= 0).length;
    set('inventoryStatValue', money(value));
    set('inventoryStatLow', low);
    set('inventoryStatOut', out);
    set('inventoryStatVariants', items.length); // no variant model — same as total
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  function applyFilters(items) {
    const search = ($id('inventorySearch')?.value || '').trim().toLowerCase();
    const catId = $id('inventoryCategoryFilter')?.value || '';
    const brandId = $id('inventoryBrandFilter')?.value || '';
    const supplierId = $id('inventorySupplierFilter')?.value || '';
    const stockStat = $id('inventoryStockStatusFilter')?.value || '';
    let list = items;

    if (search) {
      list = list.filter(
        (x) =>
          (x.name || '').toLowerCase().includes(search) ||
          (x.sku || '').toLowerCase().includes(search) ||
          (x.barcode || '').toLowerCase().includes(search)
      );
    }
    if (catId) list = list.filter((x) => String(x.categoryId || '') === catId);
    if (brandId) list = list.filter((x) => String(x.brandId || '') === brandId);
    if (supplierId) list = list.filter((x) => String(x.supplierId || '') === supplierId);

    if (stockStat === 'in')
      list = list.filter((x) => Number(x.currentStock || 0) > Number(x.minStockLevel || 0));
    if (stockStat === 'low')
      list = list.filter(
        (x) =>
          Number(x.currentStock || 0) > 0 &&
          Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
      );
    if (stockStat === 'out') list = list.filter((x) => Number(x.currentStock || 0) <= 0);

    if (_currentTab === 'low')
      list = list.filter(
        (x) =>
          Number(x.currentStock || 0) > 0 &&
          Number(x.currentStock || 0) <= Number(x.minStockLevel || 0)
      );
    if (_currentTab === 'out') list = list.filter((x) => Number(x.currentStock || 0) <= 0);
    if (_currentTab === 'recent') list = list.slice(0, 50);

    return list;
  }

  function currentExportFilters() {
    return {
      search: ($id('inventorySearch')?.value || '').trim(),
      categoryId: $id('inventoryCategoryFilter')?.value || '',
      brandId: $id('inventoryBrandFilter')?.value || '',
      supplierId: $id('inventorySupplierFilter')?.value || '',
      stockStatus: $id('inventoryStockStatusFilter')?.value || '',
      inventoryTab: _currentTab,
    };
  }

  function populateDropdown(selectId, items, labelKey, valKey) {
    const sel = $id(selectId);
    if (!sel) return;
    const current = sel.value;
    const seen = new Set();
    const opts = items
      .filter((x) => {
        const v = String(x[valKey] || '');
        if (!v || seen.has(v)) return false;
        seen.add(v);
        return true;
      })
      .map((x) => `<option value="${esc(x[valKey])}">${esc(x[labelKey])}</option>`);
    sel.innerHTML = `<option value="">${sel.options[0]?.text || 'All'}</option>` + opts.join('');
    sel.value = current;
  }

  function renderTable(items) {
    _allItems = items;
    renderStats(items);
    populateDropdown('inventoryCategoryFilter', items, 'categoryName', 'categoryId');
    populateDropdown('inventoryBrandFilter', items, 'brandName', 'brandId');
    populateDropdown('inventorySupplierFilter', items, 'supplierName', 'supplierId');

    const filtered = applyFilters(items);
    const rowsPerPage = Number($id('inventoryRowsPerPage')?.value || PAGE_SIZE);
    const start = (_page - 1) * rowsPerPage;
    const page = filtered.slice(start, start + rowsPerPage);

    const summary = $id('inventoryResultSummary');
    if (summary)
      summary.textContent = `Showing ${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

    const tbody = $id('inventoryTableBody');
    if (!tbody) return;
    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No items found.</td></tr>`;
      return;
    }
    tbody.innerHTML = page
      .map((x, i) => {
        const stock = Number(x.currentStock || 0);
        const minStock = Number(x.minStockLevel || 0);
        const isOut = stock <= 0;
        const isLow = !isOut && stock <= minStock;
        const statusColor = isOut ? '#dc2626' : isLow ? '#d97706' : '#16a34a';
        const statusLabel = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
        return `<tr>
        <td style="color:#9ca3af;font-size:.75rem">${start + i + 1}</td>
        <td style="text-align:center">
          ${
            x.productImage
              ? `<img src="${esc(x.productImage)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px" />`
              : `<span style="display:inline-block;width:36px;height:36px;background:#f3f4f6;border-radius:4px;font-size:18px;line-height:36px;text-align:center">📦</span>`
          }
        </td>
        <td style="font-weight:600;font-size:.82rem">
          ${esc(x.name)}<br>
          <small style="color:#9ca3af;font-weight:400">${esc(x.sku || '—')}</small>
        </td>
        <td style="font-size:.75rem;color:#6b7280">${esc(x.batchNumber || '—')}</td>
        <td style="font-size:.75rem;color:#6b7280">${x.expirationDate ? new Date(x.expirationDate).toLocaleDateString() : '—'}</td>
        <td style="text-align:right;font-size:.78rem">${money(x.lastPurchasePrice ?? x.purchasePrice)}</td>
        <td style="text-align:right;font-size:.78rem">${money(x.purchasePrice)}</td>
        <td style="text-align:right;font-size:.78rem;font-weight:600">${money(x.salePrice)}</td>
        <td style="text-align:right;font-weight:700;font-size:.9rem;color:${statusColor}">${stock.toFixed(3)}</td>
        <td>
          <span style="padding:2px 8px;border-radius:9px;font-size:.72rem;font-weight:600;background:${statusColor}20;color:${statusColor}">${statusLabel}</span>
        </td>
        <td style="white-space:nowrap;text-align:center">
          <button type="button" data-adjust-product="${x.productId}" data-product-name="${esc(x.name)}"
            style="padding:3px 8px;border:1px solid #f59e0b;color:#d97706;background:none;border-radius:5px;cursor:pointer;font-size:.72rem;margin-right:3px">Adjust</button>
        </td>
      </tr>`;
      })
      .join('');
  }

  // ── Load inventory ────────────────────────────────────────────────────────

  async function loadInventory(filters) {
    try {
      const res = await api().loadInventory(filters || {});
      if (!res?.ok) {
        showMsg(res?.message || 'Failed to load inventory.', true);
        return;
      }
      renderUI({ items: res.items || res.inventory || [] });
      LOG('loaded', (res.items || res.inventory || []).length, 'items');
    } catch (err) {
      LOG('loadInventory error:', err);
      showMsg('Failed to load inventory. Please try again.', true);
    }
  }

  // ── Stock Adjustment modal ────────────────────────────────────────────────

  // Matched import preview is read-only. Backend sessions remain authoritative.

  function formatImportDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  async function exportInventoryCsv(button) {
    if (_exportInFlight) return;
    _exportInFlight = true;
    const originalText = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Exporting...';
    try {
      const result = await api().exportCsv(currentExportFilters());
      if (result?.canceled) {
        showMsg(result.message || 'CSV export cancelled.');
        return;
      }
      if (!result?.ok) {
        showMsg(result?.message || 'CSV export failed.', true);
        return;
      }
      const rowCount = Number(result.rowCount || 0);
      showMsg(`Exported ${rowCount} inventory item${rowCount === 1 ? '' : 's'} to CSV.`);
    } catch (error) {
      LOG('exportInventoryCsv error:', error);
      showMsg('CSV export failed. Please try again.', true);
    } finally {
      _exportInFlight = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = originalText;
    }
  }

  function importStatusText(row) {
    const code = row?.status || row?.classification || 'UNKNOWN';
    const labels = {
      MATCHING_ELIGIBLE: 'Eligible for future import',
      EXISTING_PRODUCT_CANDIDATE: 'Matched existing product',
      POTENTIAL_NEW_PRODUCT: 'Eligible for future product creation',
      OPENING_STOCK_NOT_ALLOWED: 'Blocked',
      PRIMITIVE_INVALID: 'Invalid CSV row',
      DUPLICATE_INPUT: 'Duplicate in file',
      IDENTIFIER_CONFLICT: 'Ambiguous identifiers',
      DUPLICATE_IN_DATABASE: 'Duplicate database match',
      INACTIVE_PRODUCT_MATCH: 'Inactive product',
      DELETED_PRODUCT_MATCH: 'Deleted product',
      MISSING_CATALOG_REFERENCE: 'Missing catalog reference',
      INACTIVE_CATALOG_REFERENCE: 'Inactive catalog reference',
      DUPLICATE_CATALOG_REFERENCE: 'Duplicate catalog reference',
      INVENTORY_TARGET_MISSING: 'Inventory target missing',
      DUPLICATE_PRODUCT_TARGET: 'Duplicate product target',
      PERMISSION_RESTRICTED: 'Permission restricted',
      MATCHING_FAILED: 'Matching failed',
    };
    return labels[code] || String(code).replace(/_/g, ' ').toLowerCase();
  }

  function importStatusTone(row) {
    const code = row?.status || row?.classification || '';
    if (row?.eligible === true || code === 'MATCHING_ELIGIBLE') return 'ok';
    if (
      [
        'PRIMITIVE_INVALID',
        'OPENING_STOCK_NOT_ALLOWED',
        'IDENTIFIER_CONFLICT',
        'DUPLICATE_IN_DATABASE',
        'DELETED_PRODUCT_MATCH',
        'MISSING_CATALOG_REFERENCE',
        'DUPLICATE_CATALOG_REFERENCE',
        'INVENTORY_TARGET_MISSING',
        'DUPLICATE_PRODUCT_TARGET',
        'PERMISSION_RESTRICTED',
        'MATCHING_FAILED',
      ].includes(code)
    ) {
      return 'bad';
    }
    if (code === 'DUPLICATE_INPUT' || code === 'INACTIVE_PRODUCT_MATCH' || code === 'INACTIVE_CATALOG_REFERENCE') {
      return 'warn';
    }
    return 'neutral';
  }

  function rowNormalized(row) {
    return row?.phase3Row?.normalized || row?.normalized || {};
  }

  function rowProductText(row) {
    const normalized = rowNormalized(row);
    return normalized.productName || row?.matchedProduct?.productName || row?.matchedProduct?.name || '-';
  }

  function rowIdentifierText(row) {
    const normalized = rowNormalized(row);
    const sku = normalized.sku || row?.matchedProduct?.sku || '';
    const barcode = normalized.barcode || row?.matchedProduct?.barcode || '';
    if (sku && barcode) return `SKU ${sku} / Barcode ${barcode}`;
    if (sku) return `SKU ${sku}`;
    if (barcode) return `Barcode ${barcode}`;
    return '-';
  }

  function findingLabel(finding) {
    if (!finding) return '';
    if (typeof finding === 'string') return finding;
    const parts = [];
    if (finding.severity) parts.push(String(finding.severity).toUpperCase());
    if (finding.code) parts.push(finding.code);
    if (finding.field) parts.push(`field ${finding.field}`);
    if (finding.sourceRowNumber) parts.push(`row ${finding.sourceRowNumber}`);
    return parts.join(' - ') || 'Review required';
  }

  function importPreviewSummaryValue(summary, keys, fallback) {
    for (const key of keys) {
      if (summary && summary[key] != null) return summary[key];
    }
    return fallback;
  }

  function renderImportPreviewSummary(documentModel) {
    const container = $id('importPreviewSummary');
    if (!container) return;
    clearNode(container);
    const summary = documentModel?.matchingSummary || {};
    const cards = [
      ['Total rows', importPreviewSummaryValue(summary, ['totalRows', 'rowCount'], documentModel?.rowCount || 0)],
      ['Eligible', importPreviewSummaryValue(summary, ['matchingEligibleRows', 'eligibleRows'], 0)],
      ['Existing matches', importPreviewSummaryValue(summary, ['existingProductCandidates', 'existingProductRows'], 0)],
      ['Potential new products', importPreviewSummaryValue(summary, ['potentialNewProducts', 'newProductCandidates'], 0)],
      ['Needs review', importPreviewSummaryValue(summary, ['warningCount', 'warningRows'], 0)],
      ['Blocked', importPreviewSummaryValue(summary, ['errorCount', 'blockedRows'], 0)],
    ];
    cards.forEach(([label, value]) => {
      const card = createTextEl('article', 'epos-inventory-import-summary-card');
      card.appendChild(createTextEl('span', '', label));
      card.appendChild(createTextEl('strong', '', value));
      container.appendChild(card);
    });
  }

  function renderImportPreviewRows(documentModel) {
    const tbody = $id('importPreviewRows');
    if (!tbody) return;
    clearNode(tbody);
    const rows = Array.isArray(documentModel?.matchedRows) ? documentModel.matchedRows : [];
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = createTextEl('td', '', 'No rows returned.');
      td.colSpan = 5;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.appendChild(createTextEl('td', 'epos-inventory-import-row-number', row?.sourceRowNumber || '-'));
      tr.appendChild(createTextEl('td', '', rowProductText(row)));
      tr.appendChild(createTextEl('td', '', rowIdentifierText(row)));
      const statusCell = document.createElement('td');
      statusCell.appendChild(createTextEl('span', `epos-inventory-import-status-badge ${importStatusTone(row)}`, importStatusText(row)));
      tr.appendChild(statusCell);
      const findingCell = document.createElement('td');
      const findings = []
        .concat(Array.isArray(row?.matchingFindings) ? row.matchingFindings : [])
        .concat(Array.isArray(row?.findings) ? row.findings : []);
      if (!findings.length) {
        findingCell.textContent = 'No findings.';
      } else {
        const list = document.createElement('ul');
        list.className = 'epos-inventory-import-findings';
        findings.slice(0, 4).forEach((finding) => {
          list.appendChild(createTextEl('li', '', findingLabel(finding)));
        });
        if (findings.length > 4) {
          list.appendChild(createTextEl('li', '', `${findings.length - 4} more finding(s)`));
        }
        findingCell.appendChild(list);
      }
      tr.appendChild(findingCell);
      tbody.appendChild(tr);
    });
  }

  function setImportPreviewStatus(text, isError) {
    const el = $id('inventoryImportPreviewStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', Boolean(isError));
  }

  function setImportExecutionStatus(text, isError) {
    const el = $id('inventoryImportExecutionStatus');
    if (!el) return;
    if (!text) {
      el.textContent = '';
      el.classList.add('hidden');
      el.classList.remove('error');
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('error', Boolean(isError));
  }

  function summaryValue(summary, key, fallbackKeys = []) {
    const sourceKey = [key, ...fallbackKeys].find((candidate) => summary?.[candidate] !== undefined);
    const value = Number(summary?.[sourceKey] || 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function executionNoStockRows(summary) {
    if (summary?.noStockRows !== undefined) return summaryValue(summary, 'noStockRows');
    const eligibleRows = summaryValue(summary, 'currentlyEligibleRows', ['eligibleRows']);
    const openingStockRows = summaryValue(summary, 'openingStockRows');
    return Math.max(0, eligibleRows - openingStockRows);
  }

  function hasValidExecutionSummary(summary, rowCount) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
    const requiredKeys = [
      'totalRows',
      'blockedRows',
      'createProductRows',
      'existingProductRows',
      'openingStockRows',
      'currentlyEligibleRows',
    ];
    return (
      requiredKeys.every((key) => {
        const value = summary[key];
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
      }) &&
      summary.totalRows === rowCount &&
      summary.blockedRows === 0
    );
  }

  function executionPreflightRows(preflight) {
    return Array.isArray(preflight?.rows) ? preflight.rows : [];
  }

  function currentExecutionSummary() {
    return _executionPreflightDocument?.summary || {};
  }

  function hasCommitReadyExecutionPreflight() {
    return Boolean(
      _executionPreflightSessionId &&
        _executionPreflightDigest &&
        _executionPreflightDocument?.commitReady === true &&
        executionPreflightRows(_executionPreflightDocument).length > 0 &&
        _executionPreflightGeneration === _importWorkflowGeneration &&
        !_importPreviewLoading &&
        !_importExecutionInFlight &&
        !_importExecutionCommitted
    );
  }

  function updateImportExecutionButton() {
    const button = $id('executeInventoryImportButton');
    if (!button) return;
    const enabled = hasCommitReadyExecutionPreflight();
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.textContent = _importExecutionInFlight ? 'Importing...' : 'Import';
  }

  function closeImportExecutionConfirmation() {
    const modal = $id('inventoryImportExecutionConfirmModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    _executionConfirmGeneration = null;
    const trigger = $id('executeInventoryImportButton');
    if (trigger && !trigger.disabled && trigger.focus) trigger.focus();
  }

  function invalidateExecutionAuthority(message, isError, options = {}) {
    _commitPlanSessionId = null;
    _executionPreflightSessionId = null;
    _executionPreflightDocument = null;
    _executionPreflightDigest = null;
    _executionContractDigest = null;
    _executionPreflightGeneration = 0;
    _importExecutionInFlight = false;
    if (options.committed) _importExecutionCommitted = true;
    else if (options.resetCommitted !== false) _importExecutionCommitted = false;
    _importWorkflowGeneration += 1;
    closeImportExecutionConfirmation();
    renderExecutionSummary(null);
    updateImportExecutionButton();
    if (message) setImportExecutionStatus(message, isError);
  }

  function renderExecutionSummary(preflight) {
    const container = $id('importExecutionSummary');
    if (!container) return;
    clearNode(container);
    const summary = preflight?.summary || {};
    const cards = [
      ['Ready rows', summaryValue(summary, 'currentlyEligibleRows', ['eligibleRows'])],
      ['Products to create', summaryValue(summary, 'createProductRows')],
      ['Existing products', summaryValue(summary, 'existingProductRows')],
      ['Opening stock', summaryValue(summary, 'openingStockRows')],
      ['No stock action', executionNoStockRows(summary)],
      ['Blocked', summaryValue(summary, 'blockedRows')],
    ];
    cards.forEach(([label, value]) => {
      const card = createTextEl('article', 'epos-inventory-import-summary-card');
      card.appendChild(createTextEl('span', '', label));
      card.appendChild(createTextEl('strong', '', value));
      container.appendChild(card);
    });
  }

  function normalizeCommitPlanResponse(result) {
    if (!result?.ok) return null;
    const sessionId = result.sessionId || result.commitPlanSession?.sessionId;
    return typeof sessionId === 'string' && sessionId.trim() ? { sessionId } : null;
  }

  function normalizeExecutionPreflightResponse(result) {
    if (!result?.ok) return null;
    const sessionId = result.sessionId || result.executionPreflightSession?.sessionId;
    const preflight = result.executionPreflight;
    const preflightDigest = result.preflightDigest || preflight?.preflightDigest;
    const contractDigest = preflight?.executionContractDigest || result.executionContractDigest;
    const rows = executionPreflightRows(preflight);
    if (typeof sessionId !== 'string' || !sessionId.trim()) return null;
    if (typeof preflightDigest !== 'string' || !/^[0-9a-f]{64}$/i.test(preflightDigest)) return null;
    if (typeof contractDigest !== 'string' || !/^[0-9a-f]{64}$/i.test(contractDigest)) return null;
    if (!preflight || preflight.commitReady !== true || !rows.length) return null;
    if (!hasValidExecutionSummary(preflight.summary, rows.length)) return null;
    return { sessionId, preflight, preflightDigest, contractDigest: contractDigest || null };
  }

  function buildCertifiedExecutionRequest() {
    if (!hasCommitReadyExecutionPreflight()) return null;
    const request = {
      sessionId: _executionPreflightSessionId,
      expectedPreflightDigest: _executionPreflightDigest,
    };
    if (_executionContractDigest) request.expectedContractDigest = _executionContractDigest;
    return request;
  }

  function executionErrorMessage(result) {
    const code = result?.code || result?.error?.code || '';
    if (/REPLAY_CONFLICT/i.test(code)) {
      return 'This import appears to have already been committed. The current execution authority was cleared; refresh Inventory or rebuild the import workflow.';
    }
    if (/SESSION|EXPIRED|OWNER|DIGEST|CONTRACT|PREFLIGHT|STALE/i.test(code)) {
      return 'The certified import preflight is no longer valid. Rebuild the import workflow before importing.';
    }
    if (/ACCESS_DENIED|AUTHENTICATION|PERMISSION/i.test(code)) {
      return 'You do not currently have permission to execute this import.';
    }
    if (/FAILED|CONFLICT|UNSUPPORTED/i.test(code)) {
      return result?.message || 'Inventory import execution failed safely. Review the import and try again only if the preflight is still valid.';
    }
    return result?.message || 'Inventory import execution failed safely. Please review the import before trying again.';
  }

  function executionSucceeded(result) {
    const executionResult = result?.executionResult || result?.result || result;
    return Boolean(
      result?.ok === true &&
        executionResult?.transactionCommitted === true &&
        executionResult?.executionComplete === true &&
        executionResult?.databaseWrite === true &&
        executionResult?.batchId != null &&
        executionResult?.summary
    );
  }

  function renderExecutionConfirmation() {
    const summary = currentExecutionSummary();
    const container = $id('inventoryImportExecutionConfirmSummary');
    if (!container) return;
    clearNode(container);
    [
      ['Total rows', summaryValue(summary, 'totalRows')],
      ['Products to create', summaryValue(summary, 'createProductRows')],
      ['Existing products retained', summaryValue(summary, 'existingProductRows')],
      ['Opening stock rows', summaryValue(summary, 'openingStockRows')],
      ['Rows without stock action', executionNoStockRows(summary)],
      ['Blocked rows', summaryValue(summary, 'blockedRows')],
    ].forEach(([label, value]) => {
      const row = document.createElement('p');
      row.appendChild(createTextEl('span', '', label));
      row.appendChild(createTextEl('strong', '', value));
      container.appendChild(row);
    });
  }

  function resetImportPreviewContent() {
    _previewSessionId = null;
    _matchedPreviewSessionId = null;
    _matchedPreviewDocument = null;
    invalidateExecutionAuthority('', false);
    setText('importPreviewFileName', '-');
    setText('importPreviewRowCount', '0');
    setText('importPreviewExpiresAt', '-');
    setImportPreviewStatus('Select a CSV file to preview.', false);
    setImportExecutionStatus('', false);
    renderImportPreviewSummary({ matchingSummary: {}, rowCount: 0 });
    renderImportPreviewRows({ matchedRows: [] });
  }

  function setImportPreviewLoading(isLoading, text) {
    _importPreviewLoading = Boolean(isLoading);
    ['inventoryImportPreviewButton', 'restartImportPreviewButton', 'closeImportPreviewButton', 'closeImportPreviewFooterButton'].forEach((id) => {
      const button = $id(id);
      if (button) button.disabled = _importPreviewLoading;
    });
    updateImportExecutionButton();
    if (text) setImportPreviewStatus(text, false);
  }

  function openImportPreviewModal(trigger) {
    const modal = $id('inventoryImportPreviewModal');
    if (!modal) return;
    _importPreviewOpen = true;
    _importPreviewTrigger = trigger || document.activeElement || _importPreviewTrigger;
    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    $id('closeImportPreviewButton')?.focus();
  }

  function closeImportPreviewModal() {
    const modal = $id('inventoryImportPreviewModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    _importPreviewOpen = false;
    setImportPreviewLoading(false);
    closeImportExecutionConfirmation();
    if (_importPreviewTrigger?.focus) _importPreviewTrigger.focus();
  }

  function getPreviewSessionId(result) {
    const id = result?.previewSession?.sessionId || result?.sessionId;
    return typeof id === 'string' && id.trim() ? id : null;
  }

  function normalizeMatchedPreviewResponse(result) {
    if (!result?.ok) return null;
    const documentModel = result.matchedPreview;
    const session = result.matchedPreviewSession;
    if (!documentModel || !Array.isArray(documentModel.matchedRows)) return null;
    if (!session || typeof session.sessionId !== 'string' || !session.sessionId.trim()) return null;
    return { documentModel, session };
  }

  function renderMatchedPreview(documentModel, session) {
    _matchedPreviewDocument = documentModel;
    _matchedPreviewSessionId = session.sessionId;
    setText('importPreviewFileName', documentModel.sourceBasename || documentModel.sourceFilename || '-');
    setText('importPreviewRowCount', documentModel.rowCount ?? documentModel.sourceRowCount ?? 0);
    setText('importPreviewExpiresAt', formatImportDate(session.expiresAt));
    renderImportPreviewSummary(documentModel);
    renderImportPreviewRows(documentModel);
    setImportPreviewStatus('Matched preview loaded. Preparing certified execution preflight...', false);
  }

  async function prepareExecutionPreflightForCurrentMatch(generation) {
    if (!_matchedPreviewSessionId || generation !== _importWorkflowGeneration) return;
    setImportExecutionStatus('Building certified import commit plan...', false);
    const commitPlan = await api().createImportCommitPlan(_matchedPreviewSessionId);
    if (generation !== _importWorkflowGeneration) return;
    const normalizedPlan = normalizeCommitPlanResponse(commitPlan);
    if (!normalizedPlan) {
      invalidateExecutionAuthority(previewErrorMessage(commitPlan, 'Unable to create an import commit plan. Select the CSV again.'), true);
      return;
    }
    _commitPlanSessionId = normalizedPlan.sessionId;
    setImportExecutionStatus('Checking current database state before import...', false);
    const preflight = await api().createImportExecutionPreflight(_commitPlanSessionId);
    if (generation !== _importWorkflowGeneration) return;
    const normalizedPreflight = normalizeExecutionPreflightResponse(preflight);
    if (!normalizedPreflight) {
      invalidateExecutionAuthority(previewErrorMessage(preflight, 'This import is not currently eligible for execution. Rebuild the preview after resolving blocked rows.'), true);
      return;
    }
    _executionPreflightSessionId = normalizedPreflight.sessionId;
    _executionPreflightDocument = normalizedPreflight.preflight;
    _executionPreflightDigest = normalizedPreflight.preflightDigest;
    _executionContractDigest = normalizedPreflight.contractDigest;
    _executionPreflightGeneration = generation;
    _importExecutionCommitted = false;
    renderExecutionSummary(_executionPreflightDocument);
    setImportPreviewStatus('Certified execution preflight is commit-ready. Review the summary and choose Import to continue.', false);
    setImportExecutionStatus('Import is ready for final confirmation. No changes occur until you confirm.', false);
    updateImportExecutionButton();
  }

  function previewErrorMessage(result, fallback) {
    const code = result?.code || result?.error?.code || '';
    if (/EXPIRED|STALE|NOT_FOUND/i.test(code)) return 'Preview expired or unavailable. Select the CSV again.';
    return result?.message || fallback;
  }

  async function startImportPreviewWorkflow(event) {
    if (_importPreviewLoading) return;
    openImportPreviewModal(event?.currentTarget || event?.target || null);
    resetImportPreviewContent();
    const generation = _importWorkflowGeneration;
    setImportPreviewLoading(true, 'Selecting CSV file...');
    try {
      const preview = await api().requestImportPreview();
      if (preview?.canceled || preview?.status === 'canceled') {
        setImportPreviewStatus('CSV selection cancelled.', false);
        return;
      }
      if (!preview?.ok) {
        setImportPreviewStatus(previewErrorMessage(preview, 'Unable to create an import preview.'), true);
        return;
      }
      const previewSessionId = getPreviewSessionId(preview);
      if (!previewSessionId) {
        setImportPreviewStatus('Preview session could not be created. Select the CSV again.', true);
        return;
      }
      _previewSessionId = previewSessionId;
      setImportPreviewStatus('Analyzing matched preview...', false);
      const matched = await api().analyzeImportPreview(previewSessionId);
      const normalized = normalizeMatchedPreviewResponse(matched);
      if (!normalized) {
        setImportPreviewStatus(previewErrorMessage(matched, 'Unable to analyze the import preview.'), true);
        return;
      }
      renderMatchedPreview(normalized.documentModel, normalized.session);
      await prepareExecutionPreflightForCurrentMatch(generation);
    } catch (err) {
      LOG('import preview error:', err);
      setImportPreviewStatus('Unable to preview this CSV import. Please try again.', true);
    } finally {
      setImportPreviewLoading(false);
    }
  }

  function restartImportPreviewWorkflow(event) {
    if (_importPreviewLoading) return;
    resetImportPreviewContent();
    startImportPreviewWorkflow(event);
  }

  function openImportExecutionConfirmation() {
    if (!hasCommitReadyExecutionPreflight()) {
      setImportExecutionStatus('Import is not ready. Rebuild the certified preflight before importing.', true);
      updateImportExecutionButton();
      return;
    }
    renderExecutionConfirmation();
    _executionConfirmGeneration = _importWorkflowGeneration;
    const modal = $id('inventoryImportExecutionConfirmModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    $id('confirmImportExecutionButton')?.focus();
  }

  function executionResultSummary(result) {
    const executionResult = result?.executionResult || result?.result || result;
    const summary = executionResult?.summary || {};
    const batch = executionResult?.batchId != null ? ` Batch ${executionResult.batchId}.` : '';
    return `Inventory import committed.${batch} ${summaryValue(summary, 'totalRows')} row(s) processed, ${summaryValue(summary, 'createdProductCount')} product(s) created, ${summaryValue(summary, 'stockAppliedCount')} opening-stock movement(s) applied.`;
  }

  async function executeConfirmedImport() {
    if (_importExecutionInFlight) return;
    if (_executionConfirmGeneration !== _importWorkflowGeneration || !hasCommitReadyExecutionPreflight()) {
      closeImportExecutionConfirmation();
      setImportExecutionStatus('This import confirmation is stale. Rebuild the certified preflight before importing.', true);
      updateImportExecutionButton();
      return;
    }
    const request = buildCertifiedExecutionRequest();
    if (!request) {
      closeImportExecutionConfirmation();
      setImportExecutionStatus('Import is not ready. Rebuild the certified preflight before importing.', true);
      updateImportExecutionButton();
      return;
    }
    _importExecutionInFlight = true;
    updateImportExecutionButton();
    const confirmButton = $id('confirmImportExecutionButton');
    if (confirmButton) confirmButton.disabled = true;
    setImportExecutionStatus('Importing certified rows...', false);
    try {
      const result = await api().executeCertifiedImport(request);
      if (executionSucceeded(result)) {
        const warning = result.lifecycleWarning || result.executionResult?.lifecycleWarning || '';
        invalidateExecutionAuthority(
          `${executionResultSummary(result)}${warning ? ` ${warning} The import was committed; do not retry this preflight.` : ''}`,
          false,
          { committed: true }
        );
        await loadInventory();
        return;
      }
      const code = result?.code || result?.error?.code || '';
      if (/REPLAY_CONFLICT|SESSION|EXPIRED|OWNER|DIGEST|CONTRACT|PREFLIGHT|STALE|ACCESS_DENIED|AUTHENTICATION|PERMISSION/i.test(code)) {
        invalidateExecutionAuthority(executionErrorMessage(result), true);
        return;
      }
      _importExecutionInFlight = false;
      closeImportExecutionConfirmation();
      setImportExecutionStatus(executionErrorMessage(result), true);
      updateImportExecutionButton();
    } catch (err) {
      LOG('execute import error:', err);
      _importExecutionInFlight = false;
      closeImportExecutionConfirmation();
      setImportExecutionStatus('Inventory import execution failed safely. Please try again only after verifying the preflight is still valid.', true);
      updateImportExecutionButton();
    } finally {
      if (confirmButton) confirmButton.disabled = false;
    }
  }

  function openAdjustModal(productId, productName) {
    const modal = $id('inventoryAdjustmentModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    const sel = $id('adjustProductId');
    if (sel) {
      // Populate with all products
      sel.innerHTML = _allItems
        .map(
          (x) =>
            `<option value="${x.productId}" ${String(x.productId) === String(productId) ? 'selected' : ''}>${esc(x.name)} (${Number(x.currentStock || 0).toFixed(2)})</option>`
        )
        .join('');
    }
    const reason = $id('adjustReason');
    if (reason) reason.value = '';
    const qty = $id('adjustQuantity');
    if (qty) {
      qty.value = '';
      qty.focus();
    }
  }

  function closeAdjustModal() {
    const modal = $id('inventoryAdjustmentModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    $id('stockAdjustmentForm')?.reset();
  }

  async function saveAdjustment(e) {
    e.preventDefault();
    const productId = Number($id('adjustProductId')?.value);
    const adjustmentType = $id('adjustmentType')?.value || 'IN';
    const quantity = parseFloat($id('adjustQuantity')?.value || '0');
    const reason = ($id('adjustReason')?.value || '').trim();
    if (!productId) {
      showMsg('Select a product.', true);
      return;
    }
    if (!quantity || quantity <= 0) {
      showMsg('Enter a valid quantity.', true);
      return;
    }
    if (!reason) {
      showMsg('Enter a reason for adjustment.', true);
      return;
    }
    const confirmed = window.confirm(
      'Stock adjustment changes inventory quantities. Continue only after verifying product, quantity, and reason.'
    );
    if (!confirmed) {
      showMsg('Stock adjustment cancelled.', true);
      return;
    }
    const btn = $id('saveAdjustmentButton');
    if (btn) btn.disabled = true;
    try {
      const res = await api().adjustStock({
        productId,
        movementType: adjustmentType,
        quantity,
        reason,
      });
      if (!res?.ok) {
        showMsg(res?.message || 'Adjustment failed.', true);
        return;
      }
      showMsg(res.message || 'Stock adjusted.');
      closeAdjustModal();
      await loadInventory();
    } catch (err) {
      LOG('saveAdjustment error:', err);
      showMsg('Adjustment failed. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderUI(state = {}) {
    if (Array.isArray(state.items)) {
      renderTable(state.items);
    }
  }

  function updateUI(diff = {}) {
    renderUI(diff);
  }

  function destroyUI() {
    clearTimeout(_searchTimer);
    _searchTimer = null;
    clearTimeout(_msgTimer);
    _msgTimer = null;
    $id('inventoryMessage')?.classList.add('hidden');
    closeAdjustModal();
    closeImportPreviewModal();
    invalidateExecutionAuthority('', false);
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  function attachEvents() {
    LOG('attachEvents()');

    // Search
    $id('inventorySearch')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => renderTable(_allItems), 280);
    });

    // Filters
    [
      'inventoryCategoryFilter',
      'inventoryBrandFilter',
      'inventorySupplierFilter',
      'inventoryStockStatusFilter',
    ].forEach((id) =>
      $id(id)?.addEventListener('change', () => {
        _page = 1;
        renderTable(_allItems);
      })
    );
    $id('inventoryResetFiltersButton')?.addEventListener('click', () => {
      [
        'inventoryCategoryFilter',
        'inventoryBrandFilter',
        'inventorySupplierFilter',
        'inventoryStockStatusFilter',
      ].forEach((id) => {
        const el = $id(id);
        if (el) el.selectedIndex = 0;
      });
      const s = $id('inventorySearch');
      if (s) s.value = '';
      _page = 1;
      renderTable(_allItems);
    });

    // Tabs
    document.querySelectorAll('[data-inventory-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        _currentTab = btn.dataset.inventoryTab;
        document
          .querySelectorAll('[data-inventory-tab]')
          .forEach((b) => b.classList.toggle('active', b.dataset.inventoryTab === _currentTab));
        _page = 1;
        renderTable(_allItems);
      })
    );

    // Rows per page
    $id('inventoryRowsPerPage')?.addEventListener('change', () => {
      _page = 1;
      renderTable(_allItems);
    });

    // Table delegation — Adjust button
    $id('inventoryTableBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-adjust-product]');
      if (btn) openAdjustModal(btn.dataset.adjustProduct, btn.dataset.productName);
    });

    // Adjustment modal
    $id('openInventoryAdjustmentButton')?.addEventListener('click', () =>
      openAdjustModal(null, null)
    );
    document
      .querySelectorAll('[data-close-inventory-modal]')
      .forEach((el) => el.addEventListener('click', () => closeAdjustModal()));
    $id('stockAdjustmentForm')?.addEventListener('submit', (e) => saveAdjustment(e));

    // Read-only CSV import matched preview
    $id('inventoryImportPreviewButton')?.addEventListener('click', (event) =>
      startImportPreviewWorkflow(event)
    );
    $id('restartImportPreviewButton')?.addEventListener('click', (event) =>
      restartImportPreviewWorkflow(event)
    );
    $id('closeImportPreviewButton')?.addEventListener('click', () => closeImportPreviewModal());
    $id('closeImportPreviewFooterButton')?.addEventListener('click', () =>
      closeImportPreviewModal()
    );
    $id('executeInventoryImportButton')?.addEventListener('click', () =>
      openImportExecutionConfirmation()
    );
    $id('confirmImportExecutionButton')?.addEventListener('click', () =>
      executeConfirmedImport()
    );
    document
      .querySelectorAll('[data-cancel-import-execution]')
      .forEach((el) => el.addEventListener('click', () => closeImportExecutionConfirmation()));
    document
      .querySelectorAll('[data-close-import-preview]')
      .forEach((el) => el.addEventListener('click', () => closeImportPreviewModal()));
    document.addEventListener('keydown', (event) => {
      if (
        event.key === 'Enter' &&
        _executionConfirmGeneration === _importWorkflowGeneration &&
        !$id('inventoryImportExecutionConfirmModal')?.classList.contains('hidden')
      ) {
        event.preventDefault();
        executeConfirmedImport();
        return;
      }
      if (
        event.key === 'Escape' &&
        !$id('inventoryImportExecutionConfirmModal')?.classList.contains('hidden') &&
        !_importExecutionInFlight
      ) {
        closeImportExecutionConfirmation();
        return;
      }
      if (event.key === 'Escape' && _importPreviewOpen && !_importPreviewLoading) {
        closeImportPreviewModal();
      }
    });

    // Toolbar placeholders
    $id('inventoryBulkButton')?.addEventListener('click', () => {
      showMsg(api().placeholder('bulk').message, true);
    });
    $id('inventoryTransferButton')?.addEventListener('click', () => {
      showMsg(api().placeholder('transfer').message, true);
    });
    $id('inventoryBarcodeButton')?.addEventListener('click', () => {
      const products = _allItems
        .filter((item) => item?.productId && item?.barcode)
        .map((item) => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          salePrice: item.salePrice,
          currentStock: item.currentStock,
          copies: 1,
        }));
      const result = window.BarcodeDesignerLauncher?.open
        ? window.BarcodeDesignerLauncher.open({ mode: 'inventory', products })
        : { ok: false, message: 'Barcode designer is unavailable.' };
      showMsg(result.message || 'Unable to open barcode designer.', !result.ok);
    });
    document.querySelectorAll('[data-page-tool="inventory"]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (btn.dataset.toolAction === 'import-preview') return;
        if (btn.dataset.toolAction === 'export-csv') {
          exportInventoryCsv(btn);
          return;
        }
        const action = btn.dataset.toolAction === 'import' ? 'import' : 'export';
        showMsg(api().placeholder(action).message, true);
      })
    );
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!$id('inventoryTableBody')) {
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
    _page = 1;
    _currentTab = 'all';
    loadInventory();
    LOG('init() complete');
  }

  window.initInventoryModule = init;
  window.InventoryRenderer = {
    renderUI,
    updateUI,
    destroyUI,
    loadInventory,
  };
})();
