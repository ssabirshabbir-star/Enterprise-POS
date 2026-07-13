const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const rendererPath = path.join(repoRoot, 'src/main/features/inventory/inventory.renderer.js');
const htmlPath = path.join(repoRoot, 'src/main/features/inventory/index.html');
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
    this.element.className = Array.from(this.values).join(' ');
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
    this.element.className = Array.from(this.values).join(' ');
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force == null ? !this.values.has(name) : Boolean(force);
    if (shouldAdd) this.values.add(name);
    else this.values.delete(name);
    this.element.className = Array.from(this.values).join(' ');
    return shouldAdd;
  }
}

class FakeElement {
  constructor(document, tagName, id = '') {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.selectedIndex = 0;
    this.options = [{ text: 'All' }];
    this.colSpan = 1;
    this._textContent = '';
    this._innerHTML = '';
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this._textContent = this._innerHTML;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') {
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((item) => this.classList.add(item));
    }
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  async click() {
    if (this.disabled) return;
    const event = {
      currentTarget: this,
      target: this,
      preventDefault() {},
    };
    for (const listener of this.listeners.get('click') || []) {
      await listener(event);
    }
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  reset() {
    this.value = '';
  }

  closest(selector) {
    if (selector === '[data-adjust-product]' && this.dataset.adjustProduct) return this;
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.activeElement = null;
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createRegisteredElement(id, tagName = 'div') {
    const element = new FakeElement(this, tagName, id);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelectorAll(selector) {
    const elements = Array.from(this.elements.values());
    if (selector === '[data-inventory-tab]') {
      return elements.filter((element) => element.dataset.inventoryTab);
    }
    if (selector === '[data-close-inventory-modal]') {
      return elements.filter((element) => element.dataset.closeInventoryModal != null);
    }
    if (selector === '[data-close-import-preview]') {
      return elements.filter((element) => element.dataset.closeImportPreview != null);
    }
    if (selector === '[data-cancel-import-execution]') {
      return elements.filter((element) => element.dataset.cancelImportExecution != null);
    }
    if (selector === '[data-page-tool="inventory"]') {
      return elements.filter((element) => element.dataset.pageTool === 'inventory');
    }
    return [];
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
}

function createDom() {
  const document = new FakeDocument();
  [
    'inventoryMessage',
    'lowStockOnly',
    'outOfStockOnly',
    'inventoryStatProducts',
    'inventoryStatValue',
    'inventoryStatLow',
    'inventoryStatOut',
    'inventoryStatVariants',
    'inventorySearch',
    'inventoryCategoryFilter',
    'inventoryBrandFilter',
    'inventorySupplierFilter',
    'inventoryStockStatusFilter',
    'inventoryResetFiltersButton',
    'inventoryBulkButton',
    'openInventoryAdjustmentButton',
    'inventoryTransferButton',
    'inventoryBarcodeButton',
    'inventoryImportPreviewButton',
    'inventoryAddProductButton',
    'inventoryTableBody',
    'inventoryResultSummary',
    'inventoryRowsPerPage',
    'inventoryAdjustmentModal',
    'stockAdjustmentForm',
    'adjustProductId',
    'adjustmentType',
    'adjustQuantity',
    'adjustReason',
    'saveAdjustmentButton',
    'inventoryImportPreviewModal',
    'closeImportPreviewButton',
    'inventoryImportPreviewStatus',
    'importPreviewFileName',
    'importPreviewRowCount',
    'importPreviewExpiresAt',
    'importPreviewSummary',
    'importPreviewRows',
    'restartImportPreviewButton',
    'closeImportPreviewFooterButton',
    'inventoryImportExecutionStatus',
    'importExecutionSummary',
    'executeInventoryImportButton',
    'inventoryImportExecutionConfirmModal',
    'inventoryImportExecutionConfirmSummary',
    'cancelImportExecutionTopButton',
    'cancelImportExecutionButton',
    'confirmImportExecutionButton',
  ].forEach((id) => document.createRegisteredElement(id));

  document.getElementById('inventoryImportPreviewModal').classList.add('hidden');
  document.getElementById('inventoryImportExecutionConfirmModal').classList.add('hidden');
  document.getElementById('inventoryAdjustmentModal').classList.add('hidden');
  document.getElementById('inventoryRowsPerPage').value = '50';
  document.getElementById('executeInventoryImportButton').disabled = true;
  document.getElementById('executeInventoryImportButton').setAttribute('aria-disabled', 'true');

  const allTab = document.createRegisteredElement('inventoryTabAll', 'button');
  allTab.dataset.inventoryTab = 'all';
  allTab.classList.add('active');
  const lowTab = document.createRegisteredElement('inventoryTabLow', 'button');
  lowTab.dataset.inventoryTab = 'low';

  const closeAdjustment = document.createRegisteredElement('closeInventoryAdjustmentButton', 'button');
  closeAdjustment.dataset.closeInventoryModal = '';

  const importButton = document.getElementById('inventoryImportPreviewButton');
  importButton.dataset.pageTool = 'inventory';
  importButton.dataset.toolAction = 'import-preview';

  const exportButton = document.createRegisteredElement('inventoryExportButton', 'button');
  exportButton.dataset.pageTool = 'inventory';
  exportButton.dataset.toolAction = 'excel';
  exportButton.disabled = true;

  document.getElementById('closeImportPreviewButton').dataset.closeImportPreview = '';
  document.getElementById('cancelImportExecutionTopButton').dataset.cancelImportExecution = '';
  document.getElementById('cancelImportExecutionButton').dataset.cancelImportExecution = '';
  return document;
}

function commitReadyPreflight(overrides = {}) {
  const summary = {
    totalRows: 1,
    eligibleRows: 1,
    createProductRows: 1,
    existingProductRows: 0,
    openingStockRows: 1,
    noStockRows: 0,
    blockedRows: 0,
    ...overrides.summary,
  };
  return {
    commitReady: true,
    preflightDigest: DIGEST_A,
    executionContractDigest: DIGEST_B,
    summary,
    rows: [
      {
        rowNumber: 2,
        originalProductAction: 'CREATE_PRODUCT',
        originalStockAction: 'APPLY_OPENING_STOCK',
        currentlyEligible: true,
      },
    ],
    ...overrides,
    summary,
  };
}

function createApi(overrides = {}) {
  return {
    loadInventory: async () => ({ ok: true, items: [] }),
    adjustStock: async () => ({ ok: true }),
    placeholder: () => ({ ok: false, message: 'placeholder' }),
    requestImportPreview: async () => ({
      ok: true,
      previewSession: { sessionId: 'inventory-import-preview-source' },
    }),
    analyzeImportPreview: async () => ({
      ok: true,
      matchedPreviewSession: {
        sessionId: 'inventory-import-matched-preview-123e4567-e89b-12d3-a456-426614174000',
        expiresAt: '2026-07-13T10:10:00.000Z',
      },
      matchedPreview: {
        sourceBasename: 'inventory.csv',
        rowCount: 1,
        matchingSummary: {
          totalRows: 1,
          matchingEligibleRows: 1,
          existingProductCandidates: 1,
          potentialNewProducts: 0,
          warningCount: 0,
          errorCount: 0,
        },
        matchedRows: [
          {
            sourceRowNumber: 2,
            status: 'MATCHING_ELIGIBLE',
            eligible: true,
            phase3Row: { normalized: { productName: 'Tea', sku: '000123', barcode: '0999' } },
            matchingFindings: [{ code: 'INFO_MATCHED_BY_SKU', severity: 'info' }],
          },
        ],
      },
    }),
    createImportCommitPlan: async () => ({
      ok: true,
      sessionId: 'inventory-import-commit-plan-123e4567-e89b-42d3-a456-426614174000',
    }),
    createImportExecutionPreflight: async () => {
      const executionPreflight = commitReadyPreflight();
      return {
        ok: true,
        sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174001',
        executionPreflight,
        preflightDigest: executionPreflight.preflightDigest,
        commitReady: true,
      };
    },
    executeCertifiedImport: async () => ({
      ok: true,
      executionResult: {
        databaseWrite: true,
        transactionCommitted: true,
        executionComplete: true,
        batchId: 50,
        summary: {
          totalRows: 1,
          createdProductCount: 1,
          existingProductCount: 0,
          stockAppliedCount: 1,
          skippedCount: 0,
        },
        rowResults: [],
      },
      lifecycleWarning: null,
    }),
    ...overrides,
  };
}

async function loadRenderer(apiOverrides = {}) {
  const document = createDom();
  const window = {
    InventoryApi: createApi(apiOverrides),
    BarcodeDesignerLauncher: { open: () => ({ ok: false, message: 'Unavailable' }) },
    confirm: () => false,
    location: { reload: () => { throw new Error('reload should not be called'); } },
  };
  const context = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    Date,
  };
  vm.runInNewContext(fs.readFileSync(rendererPath, 'utf8'), context, { filename: rendererPath });
  await window.initInventoryModule();
  return { document, window };
}

test('matched preview UI contract keeps import preview visible with certified execution controls disabled by default', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="inventoryImportPreviewButton"/);
  assert.match(html, />Import CSV</);
  assert.doesNotMatch(html, /Import Unavailable/);
  assert.match(html, /Execution is available only after backend preflight confirms/i);
  assert.match(html, /id="executeInventoryImportButton"[^>]*disabled/);
  assert.match(html, /Confirm Inventory Import/);
  assert.doesNotMatch(html, /id="inventoryImportPreviewButton"[^>]*disabled/);
  assert.doesNotMatch(html, /Finalize Import|Commit Import|Import Now/);
});

test('toolbar Import CSV launcher exists once, starts CSV selection, and is reusable after success', async () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const launcherMarkup = html.match(/<button\b[^>]*id="inventoryImportPreviewButton"[^>]*>Import CSV<\/button>/)?.[0] || '';
  assert.equal((html.match(/id="inventoryImportPreviewButton"/g) || []).length, 1);
  assert.match(launcherMarkup, /type="button"/);
  assert.match(launcherMarkup, />Import CSV<\/button>/);
  assert.doesNotMatch(launcherMarkup, /\sdisabled\b/);

  let previewCalls = 0;
  let executeCalls = 0;
  const { document } = await loadRenderer({
    requestImportPreview: async () => {
      previewCalls += 1;
      return { ok: true, previewSession: { sessionId: `inventory-import-preview-source-${previewCalls}` } };
    },
    executeCertifiedImport: async () => {
      executeCalls += 1;
      return {
        ok: true,
        executionResult: {
          databaseWrite: true,
          transactionCommitted: true,
          executionComplete: true,
          batchId: 50 + executeCalls,
          summary: {
            totalRows: 1,
            createdProductCount: 1,
            existingProductCount: 0,
            stockAppliedCount: 1,
            skippedCount: 0,
          },
          rowResults: [],
        },
      };
    },
  });

  const launcher = document.getElementById('inventoryImportPreviewButton');
  assert.equal(launcher.disabled, false);
  await launcher.click();
  assert.equal(previewCalls, 1);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);

  await document.getElementById('executeInventoryImportButton').click();
  await document.getElementById('confirmImportExecutionButton').click();
  assert.equal(executeCalls, 1);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, true);
  assert.equal(launcher.disabled, false);

  await launcher.click();
  assert.equal(previewCalls, 2);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);
});

test('matched preview workflow selects CSV then analyzes only backend session id', async () => {
  const calls = [];
  const { document } = await loadRenderer({
    requestImportPreview: async (...args) => {
      calls.push(['request', args]);
      return { ok: true, previewSession: { sessionId: 'inventory-import-preview-source' } };
    },
    analyzeImportPreview: async (...args) => {
      calls.push(['analyze', args]);
      return {
        ok: true,
        matchedPreviewSession: {
          sessionId: 'inventory-import-matched-preview-123e4567-e89b-12d3-a456-426614174000',
          expiresAt: '2026-07-13T10:10:00.000Z',
        },
        matchedPreview: {
          sourceBasename: '<img src=x onerror=alert(1)>.csv',
          rowCount: 2,
          matchingSummary: {
            totalRows: 2,
            matchingEligibleRows: 1,
            existingProductCandidates: 1,
            potentialNewProducts: 1,
            warningCount: 1,
            errorCount: 0,
          },
          matchedRows: [
            {
              sourceRowNumber: 2,
              status: 'MATCHING_ELIGIBLE',
              eligible: true,
              phase3Row: {
                normalized: {
                  productName: '<b>Tea</b>',
                  sku: '000123',
                  barcode: '0999',
                },
              },
              matchingFindings: [{ code: 'INFO_MATCHED_BY_SKU', severity: 'info' }],
            },
          ],
        },
      };
    },
    createImportCommitPlan: async (...args) => {
      calls.push(['commitPlan', args]);
      return { ok: true, sessionId: 'inventory-import-commit-plan-123e4567-e89b-42d3-a456-426614174000' };
    },
    createImportExecutionPreflight: async (...args) => {
      calls.push(['preflight', args]);
      const executionPreflight = commitReadyPreflight();
      return { ok: true, sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174001', executionPreflight };
    },
  });

  await document.getElementById('inventoryImportPreviewButton').click();

  assert.deepEqual(calls, [
    ['request', []],
    ['analyze', ['inventory-import-preview-source']],
    ['commitPlan', ['inventory-import-matched-preview-123e4567-e89b-12d3-a456-426614174000']],
    ['preflight', ['inventory-import-commit-plan-123e4567-e89b-42d3-a456-426614174000']],
  ]);
  assert.equal(document.getElementById('inventoryImportPreviewModal').classList.contains('hidden'), false);
  assert.match(document.getElementById('inventoryImportPreviewStatus').textContent, /commit-ready/i);
  assert.equal(document.getElementById('importPreviewFileName').textContent, '<img src=x onerror=alert(1)>.csv');
  assert.match(document.getElementById('importPreviewRows').textContent, /<b>Tea<\/b>/);
  assert.match(document.getElementById('importPreviewRows').textContent, /SKU 000123 \/ Barcode 0999/);
  assert.match(document.getElementById('importPreviewRows').textContent, /INFO_MATCHED_BY_SKU/);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);
});

test('cancelled CSV selection does not analyze or return an error state', async () => {
  let analyzeCalls = 0;
  const { document } = await loadRenderer({
    requestImportPreview: async () => ({ ok: false, canceled: true, status: 'canceled' }),
    analyzeImportPreview: async () => {
      analyzeCalls += 1;
      return { ok: false };
    },
  });

  await document.getElementById('inventoryImportPreviewButton').click();

  assert.equal(analyzeCalls, 0);
  assert.match(document.getElementById('inventoryImportPreviewStatus').textContent, /cancelled/i);
  assert.equal(document.getElementById('inventoryImportPreviewStatus').classList.contains('error'), false);
});

test('loading guard prevents duplicate preview requests', async () => {
  let resolvePreview;
  let requestCalls = 0;
  const pendingPreview = new Promise((resolve) => {
    resolvePreview = resolve;
  });
  const { document } = await loadRenderer({
    requestImportPreview: async () => {
      requestCalls += 1;
      return pendingPreview;
    },
  });

  const firstClick = document.getElementById('inventoryImportPreviewButton').click();
  await document.getElementById('inventoryImportPreviewButton').click();
  resolvePreview({ ok: false, canceled: true, status: 'canceled' });
  await firstClick;

  assert.equal(requestCalls, 1);
});

test('malformed or expired backend sessions fail closed in the modal', async () => {
  const missingSession = await loadRenderer({
    requestImportPreview: async () => ({ ok: true, previewSession: {} }),
  });
  await missingSession.document.getElementById('inventoryImportPreviewButton').click();
  assert.match(
    missingSession.document.getElementById('inventoryImportPreviewStatus').textContent,
    /could not be created/i
  );
  assert.equal(
    missingSession.document.getElementById('inventoryImportPreviewStatus').classList.contains('error'),
    true
  );

  const expired = await loadRenderer({
    analyzeImportPreview: async () => ({ ok: false, code: 'INVENTORY_IMPORT_PREVIEW_SESSION_EXPIRED' }),
  });
  await expired.document.getElementById('inventoryImportPreviewButton').click();
  assert.match(expired.document.getElementById('inventoryImportPreviewStatus').textContent, /expired/i);
});

test('closing preview does not reset inventory filters or reload the inventory list', async () => {
  let loadCalls = 0;
  const { document } = await loadRenderer({
    loadInventory: async () => {
      loadCalls += 1;
      return { ok: true, items: [] };
    },
  });
  document.getElementById('inventorySearch').value = 'tea';
  document.getElementById('inventoryCategoryFilter').value = 'cat-1';

  await document.getElementById('inventoryImportPreviewButton').click();
  await document.getElementById('closeImportPreviewFooterButton').click();

  assert.equal(document.getElementById('inventorySearch').value, 'tea');
  assert.equal(document.getElementById('inventoryCategoryFilter').value, 'cat-1');
  assert.equal(loadCalls, 1);
  assert.equal(document.getElementById('inventoryImportPreviewModal').classList.contains('hidden'), true);
});

test('Phase 5K keeps Import disabled until a commit-ready execution preflight exists', async () => {
  const { document } = await loadRenderer({
    createImportExecutionPreflight: async () => {
      const executionPreflight = commitReadyPreflight({
        commitReady: false,
        summary: { blockedRows: 1, eligibleRows: 0, createProductRows: 0, openingStockRows: 0 },
        rows: [{ currentlyEligible: false }],
      });
      return { ok: true, sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174001', executionPreflight };
    },
  });

  assert.equal(document.getElementById('executeInventoryImportButton').disabled, true);
  await document.getElementById('inventoryImportPreviewButton').click();

  assert.equal(document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(document.getElementById('inventoryImportExecutionStatus').textContent, /not currently eligible/i);
});

test('Phase 5K fails closed when commit-ready preflight is missing certified execution evidence', async () => {
  const missingContract = await loadRenderer({
    createImportExecutionPreflight: async () => {
      const executionPreflight = commitReadyPreflight({ executionContractDigest: undefined });
      delete executionPreflight.executionContractDigest;
      return {
        ok: true,
        sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174001',
        executionPreflight,
        preflightDigest: executionPreflight.preflightDigest,
      };
    },
    executeCertifiedImport: async () => {
      throw new Error('execution should not be called');
    },
  });
  await missingContract.document.getElementById('inventoryImportPreviewButton').click();
  assert.equal(missingContract.document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(missingContract.document.getElementById('inventoryImportExecutionStatus').textContent, /not currently eligible/i);

  const missingSummary = await loadRenderer({
    createImportExecutionPreflight: async () => {
      const executionPreflight = commitReadyPreflight({ summary: undefined });
      delete executionPreflight.summary;
      return {
        ok: true,
        sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174002',
        executionPreflight,
        preflightDigest: executionPreflight.preflightDigest,
      };
    },
    executeCertifiedImport: async () => {
      throw new Error('execution should not be called');
    },
  });
  await missingSummary.document.getElementById('inventoryImportPreviewButton').click();
  assert.equal(missingSummary.document.getElementById('executeInventoryImportButton').disabled, true);

  const malformedSummary = await loadRenderer({
    createImportExecutionPreflight: async () => {
      const executionPreflight = commitReadyPreflight({ summary: { totalRows: '1', blockedRows: 0 } });
      return {
        ok: true,
        sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174003',
        executionPreflight,
        preflightDigest: executionPreflight.preflightDigest,
      };
    },
    executeCertifiedImport: async () => {
      throw new Error('execution should not be called');
    },
  });
  await malformedSummary.document.getElementById('inventoryImportPreviewButton').click();
  assert.equal(malformedSummary.document.getElementById('executeInventoryImportButton').disabled, true);
});

test('Phase 5K confirmation cancel sends no execution request and confirmed execution sends strict digest payload once', async () => {
  const executeCalls = [];
  let loadCalls = 0;
  let resolveExecution;
  const pendingExecution = new Promise((resolve) => {
    resolveExecution = resolve;
  });
  const { document } = await loadRenderer({
    loadInventory: async () => {
      loadCalls += 1;
      return { ok: true, items: [] };
    },
    executeCertifiedImport: async (payload) => {
      executeCalls.push(payload);
      return pendingExecution;
    },
  });

  await document.getElementById('inventoryImportPreviewButton').click();
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);

  await document.getElementById('executeInventoryImportButton').click();
  assert.equal(document.getElementById('inventoryImportExecutionConfirmModal').classList.contains('hidden'), false);
  assert.match(document.getElementById('inventoryImportExecutionConfirmSummary').textContent, /Products to create1/);
  await document.getElementById('cancelImportExecutionButton').click();
  assert.equal(executeCalls.length, 0);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);

  await document.getElementById('executeInventoryImportButton').click();
  const firstConfirm = document.getElementById('confirmImportExecutionButton').click();
  await document.getElementById('confirmImportExecutionButton').click();
  assert.deepEqual(JSON.parse(JSON.stringify(executeCalls)), [
    {
      sessionId: 'inventory-import-execution-preflight-123e4567-e89b-42d3-a456-426614174001',
      expectedPreflightDigest: DIGEST_A,
      expectedContractDigest: DIGEST_B,
    },
  ]);
  assert.deepEqual(Object.keys(executeCalls[0]).sort(), ['expectedContractDigest', 'expectedPreflightDigest', 'sessionId']);
  resolveExecution({
    ok: true,
    executionResult: {
      databaseWrite: true,
      transactionCommitted: true,
      executionComplete: true,
      batchId: 50,
      summary: {
        totalRows: 1,
        createdProductCount: 1,
        existingProductCount: 0,
        stockAppliedCount: 1,
        skippedCount: 0,
      },
      rowResults: [{ sourceRowNumber: 2, status: 'COMMITTED' }],
    },
  });
  await firstConfirm;

  assert.equal(document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(document.getElementById('inventoryImportExecutionStatus').textContent, /committed/i);
  assert.equal(loadCalls, 2);
});

test('Phase 5K lifecycle warning remains committed success with one refresh and no retry', async () => {
  const executeCalls = [];
  let loadCalls = 0;
  const { document } = await loadRenderer({
    loadInventory: async () => {
      loadCalls += 1;
      return { ok: true, items: [] };
    },
    executeCertifiedImport: async (payload) => {
      executeCalls.push(payload);
      return {
        ok: true,
        lifecycleWarning: 'Execution committed, but preflight session cleanup could not be confirmed.',
        executionResult: {
          databaseWrite: true,
          transactionCommitted: true,
          executionComplete: true,
          batchId: 51,
          summary: {
            totalRows: 1,
            createdProductCount: 1,
            existingProductCount: 0,
            stockAppliedCount: 1,
            skippedCount: 0,
          },
          rowResults: [],
        },
      };
    },
  });

  await document.getElementById('inventoryImportPreviewButton').click();
  await document.getElementById('executeInventoryImportButton').click();
  await document.getElementById('confirmImportExecutionButton').click();

  assert.equal(executeCalls.length, 1);
  assert.equal(loadCalls, 2);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(document.getElementById('inventoryImportExecutionStatus').textContent, /committed/i);
  assert.match(document.getElementById('inventoryImportExecutionStatus').textContent, /do not retry/i);
});

test('Phase 5K replay and stale preflight failures clear authority without retry', async () => {
  const replayCalls = [];
  const replay = await loadRenderer({
    executeCertifiedImport: async (payload) => {
      replayCalls.push(payload);
      return { ok: false, code: 'INVENTORY_IMPORT_EXECUTION_REPLAY_CONFLICT', message: 'already committed' };
    },
  });
  await replay.document.getElementById('inventoryImportPreviewButton').click();
  await replay.document.getElementById('executeInventoryImportButton').click();
  await replay.document.getElementById('confirmImportExecutionButton').click();
  assert.equal(replayCalls.length, 1);
  assert.equal(replay.document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(replay.document.getElementById('inventoryImportExecutionStatus').textContent, /already been committed/i);

  const staleCalls = [];
  const stale = await loadRenderer({
    executeCertifiedImport: async (payload) => {
      staleCalls.push(payload);
      return { ok: false, code: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_NOT_READY', message: 'digest mismatch' };
    },
  });
  await stale.document.getElementById('inventoryImportPreviewButton').click();
  await stale.document.getElementById('executeInventoryImportButton').click();
  await stale.document.getElementById('confirmImportExecutionButton').click();
  assert.equal(staleCalls.length, 1);
  assert.equal(stale.document.getElementById('executeInventoryImportButton').disabled, true);
  assert.match(stale.document.getElementById('inventoryImportExecutionStatus').textContent, /no longer valid/i);
});

test('Phase 5K uncommitted transaction failure does not refresh or automatically retry', async () => {
  const executeCalls = [];
  let loadCalls = 0;
  const { document } = await loadRenderer({
    loadInventory: async () => {
      loadCalls += 1;
      return { ok: true, items: [] };
    },
    executeCertifiedImport: async (payload) => {
      executeCalls.push(payload);
      return { ok: false, code: 'INVENTORY_IMPORT_EXECUTION_FAILED', message: 'Inventory import execution failed safely.' };
    },
  });

  await document.getElementById('inventoryImportPreviewButton').click();
  await document.getElementById('executeInventoryImportButton').click();
  await document.getElementById('confirmImportExecutionButton').click();

  assert.equal(executeCalls.length, 1);
  assert.equal(loadCalls, 1);
  assert.equal(document.getElementById('executeInventoryImportButton').disabled, false);
  assert.match(document.getElementById('inventoryImportExecutionStatus').textContent, /failed safely/i);
});

test('renderer source preserves backend authority boundary for certified execution', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(source, /location\.reload|window\.location/);
  assert.doesNotMatch(source, /ipcRenderer|require\(['"]fs['"]\)|require\(['"]path['"]\)/);
  assert.doesNotMatch(source, /ownerId|userId|permissions|warehouseId|productIds/);
  assert.doesNotMatch(source, /commitImport|finalizeImport|executeImport/);
  assert.match(source, /executeCertifiedImport\(request\)/);
  assert.doesNotMatch(source, /productAction:\s*|stockAction:\s*|openingQuantity:\s*|quantity:\s*|actorId:\s*|ownerId:\s*|role:\s*|permissions:\s*/);
});
