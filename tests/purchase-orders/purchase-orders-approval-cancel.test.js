const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const apiPath = path.join(root, 'src/main/features/purchase-orders/purchase-orders.api.js');
const htmlPath = path.join(root, 'src/main/features/purchase-orders/index.html');
const rendererPath = path.join(
  root,
  'src/main/features/purchase-orders/purchase-orders.renderer.js'
);
const repositoryPath = path.join(root, 'src/main/features/purchase-orders/po.repository.js');
const servicePath = path.join(root, 'src/main/features/purchase-orders/po.service.js');
const activityRepositoryPath = path.join(root, 'src/main/features/activity/activity.repository.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadPurchaseOrdersApi(overrides = {}) {
  const calls = [];
  const purchaseOrders = {
    pageData: async () => ({ ok: true }),
    suppliers: async () => ({ ok: true, suppliers: [] }),
    products: async () => ({ ok: true, products: [] }),
    list: async () => ({ ok: true, orders: [] }),
    details: async () => ({ ok: true, order: {} }),
    create: async () => ({ ok: true }),
    approve: async (payload) => {
      calls.push(['approve', payload]);
      return { ok: true, order: { id: payload.id }, message: 'Approved.' };
    },
    cancel: async (payload) => {
      calls.push(['cancel', payload]);
      return { ok: true, order: { id: payload.id }, message: 'Cancelled.' };
    },
    ...overrides,
  };
  const context = {
    window: { posApi: { purchaseOrders } },
  };
  vm.runInNewContext(read(apiPath), context, { filename: apiPath });
  return { api: context.window.PurchaseOrdersApi, calls };
}

test('PurchaseOrdersApi exposes only approve and cancel action wrappers for this phase', async () => {
  const { api, calls } = loadPurchaseOrdersApi();
  assert.equal(typeof api.approve, 'function');
  assert.equal(typeof api.cancel, 'function');
  assert.equal(api.receive, undefined);
  assert.equal(api.createInvoice, undefined);
  assert.equal(api.listRequisitions, undefined);
  assert.equal(api.convertRequisition, undefined);

  await api.approve(7, { notes: 'checked' });
  await api.cancel('8', { notes: 'duplicate' });
  assert.deepEqual(plain(calls), [
    ['approve', { id: 7, notes: 'checked' }],
    ['cancel', { id: 8, notes: 'duplicate' }],
  ]);
});

test('PurchaseOrdersApi rejects invalid IDs and malformed success responses', async () => {
  const malformed = loadPurchaseOrdersApi({
    approve: async () => ({ ok: true, message: 'missing order' }),
  });
  assert.deepEqual(plain(await malformed.api.approve(1)), {
    ok: false,
    code: 'MALFORMED_PURCHASE_ORDER_RESPONSE',
    message: 'Purchase order could not be approved.',
  });

  const invalid = loadPurchaseOrdersApi();
  assert.deepEqual(plain(await invalid.api.cancel(0)), {
    ok: false,
    code: 'INVALID_PURCHASE_ORDER_ID',
    message: 'Invalid purchase order.',
  });
  assert.deepEqual(plain(invalid.calls), []);
});

test('PurchaseOrdersApi preserves backend error code and message', async () => {
  const { api } = loadPurchaseOrdersApi({
    approve: async () => ({
      ok: false,
      code: 'PO_APPROVAL_NOT_ALLOWED',
      message: 'No.',
    }),
  });
  assert.deepEqual(plain(await api.approve(5)), {
    ok: false,
    code: 'PO_APPROVAL_NOT_ALLOWED',
    message: 'No.',
  });
});

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.disabled = false;
    this.textContent = '';
    this._innerHTML = '';
    this.title = '';
    this.style = {};
    this.options = [];
    this.listeners = new Map();
    this.classList = {
      add() {},
      remove() {},
    };
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  async dispatch(type, event = {}) {
    const listeners = this.listeners.get(type) || [];
    await Promise.all(listeners.map((listener) => listener(event)));
  }

  async click() {
    await this.dispatch('click', { target: this, preventDefault() {} });
  }

  reset() {
    this.value = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.options = Array.from(this._innerHTML.matchAll(/<option[^>]*value="([^"]*)"/g)).map(
      (match) => ({ value: match[1] })
    );
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

class FakeDocument {
  constructor(ids = []) {
    this.elements = new Map();
    ids.forEach((id) => this.elements.set(id, new FakeElement(id)));
  }

  getElementById(id) {
    if (!this.elements.has(id)) this.elements.set(id, new FakeElement(id));
    return this.elements.get(id);
  }

  querySelectorAll(selector) {
    if (selector === '[data-po-tab]') return [];
    return [];
  }

  querySelector() {
    return null;
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadRendererHarness({ order, permissions, approveImpl, cancelImpl }) {
  const ids = [
    'poList',
    'poRequestApprovalButton',
    'poCancelCurrentButton',
    'poMessage',
    'poDetailsPanel',
    'poStatTotal',
    'poStatPending',
    'poStatGrn',
    'poStatSpent',
    'poNumber',
    'poDate',
    'poItemsList',
    'poSummaryItems',
    'poSummaryItemsTotal',
    'poSummaryDiscount',
    'poSummaryShipping',
    'poSummaryTotal',
    'poTotals',
  ];
  const document = new FakeDocument(ids);
  const calls = [];
  const context = {
    document,
    setTimeout,
    clearTimeout,
    window: {
      AbortController,
      confirm: () => true,
      PurchaseOrdersApi: {
        pageData: async () => ({ ok: true, stats: {}, warehouses: [], nextNumber: 'PO-1' }),
        suppliers: async () => ({ ok: true, suppliers: [] }),
        products: async () => ({ ok: true, products: [] }),
        list: async () => ({ ok: true, orders: [order], permissions }),
        details: async () => ({ ok: true, order }),
        approve: approveImpl || (async (id) => {
          calls.push(['approve', id]);
          return { ok: true, order: { ...order, status: 'APPROVED' } };
        }),
        cancel: cancelImpl || (async (id) => {
          calls.push(['cancel', id]);
          return { ok: true, order: { ...order, status: 'CANCELLED' } };
        }),
      },
    },
  };
  vm.runInNewContext(read(rendererPath), context, { filename: rendererPath });
  await context.window.initPurchaseOrdersModule();
  const viewTarget = { closest: () => ({ dataset: { poView: String(order.id) } }) };
  await document.getElementById('poList').dispatch('click', { target: viewTarget });
  return { context, document, calls };
}

test('renderer gates approve/cancel by permission and status', async () => {
  const allowed = await loadRendererHarness({
    order: { id: 11, poNumber: 'PO-11', status: 'PENDING_APPROVAL', total: 10, items: [] },
    permissions: { canApprove: true, canCancel: true },
  });
  assert.equal(allowed.document.getElementById('poRequestApprovalButton').disabled, false);
  assert.equal(allowed.document.getElementById('poCancelCurrentButton').disabled, false);

  const partial = await loadRendererHarness({
    order: { id: 12, poNumber: 'PO-12', status: 'PARTIALLY_RECEIVED', total: 10, items: [] },
    permissions: { canApprove: true, canCancel: true },
  });
  assert.equal(partial.document.getElementById('poRequestApprovalButton').disabled, true);
  assert.equal(partial.document.getElementById('poCancelCurrentButton').disabled, true);

  const noPermission = await loadRendererHarness({
    order: { id: 13, poNumber: 'PO-13', status: 'DRAFT', total: 10, items: [] },
    permissions: { canApprove: false, canCancel: false },
  });
  assert.equal(noPermission.document.getElementById('poRequestApprovalButton').disabled, true);
  assert.equal(noPermission.document.getElementById('poCancelCurrentButton').disabled, true);
});

test('renderer approve and cancel duplicate clicks issue one API call and restore state', async () => {
  const approveWait = deferred();
  const approveCalls = [];
  const approveHarness = await loadRendererHarness({
    order: { id: 21, poNumber: 'PO-21', status: 'DRAFT', total: 10, items: [] },
    permissions: { canApprove: true, canCancel: true },
    approveImpl: async (id) => {
      approveCalls.push(id);
      await approveWait.promise;
      return { ok: true, order: { id, status: 'APPROVED' } };
    },
  });
  const approveButton = approveHarness.document.getElementById('poRequestApprovalButton');
  const approveOne = approveButton.click();
  const approveTwo = approveButton.click();
  assert.equal(approveButton.disabled, true);
  approveWait.resolve();
  await Promise.all([approveOne, approveTwo]);
  assert.deepEqual(approveCalls, [21]);
  assert.equal(approveButton.textContent, 'Approve PO');

  const cancelWait = deferred();
  const cancelCalls = [];
  const cancelHarness = await loadRendererHarness({
    order: { id: 22, poNumber: 'PO-22', status: 'APPROVED', total: 10, items: [] },
    permissions: { canApprove: true, canCancel: true },
    cancelImpl: async (id) => {
      cancelCalls.push(id);
      await cancelWait.promise;
      return { ok: true, order: { id, status: 'CANCELLED' } };
    },
  });
  const cancelButton = cancelHarness.document.getElementById('poCancelCurrentButton');
  const cancelOne = cancelButton.click();
  const cancelTwo = cancelButton.click();
  assert.equal(cancelButton.disabled, true);
  cancelWait.resolve();
  await Promise.all([cancelOne, cancelTwo]);
  assert.deepEqual(cancelCalls, [22]);
  assert.equal(cancelButton.textContent, 'Cancel PO');
});

function loadRepositoryWithStubs() {
  delete require.cache[require.resolve(repositoryPath)];
  return require(repositoryPath);
}

function fakeTransitionClient({ status = 'DRAFT', rows = {} } = {}) {
  const calls = [];
  const row = { id: 1, po_number: 'PO-1', status, supplier_name: 'Supplier' };
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT \* FROM purchase_orders/.test(sql)) return { rows: rows.select || [row] };
      if (/UPDATE purchase_orders/.test(sql)) {
        return { rows: rows.update || [{ ...row, status: params?.[1] === 'CANCELLED' ? 'CANCELLED' : 'APPROVED' }] };
      }
      return { rows: [] };
    },
  };
}

test('repository approve and cancel transitions lock rows and enforce statuses', async () => {
  const repo = loadRepositoryWithStubs();
  const approveClient = fakeTransitionClient({ status: 'PENDING_APPROVAL' });
  const approve = await repo.approveStatus(1, 2, 'ok', approveClient);
  assert.equal(approve.ok, true);
  assert.ok(approveClient.calls.some((call) => /FOR UPDATE/.test(call.sql)));
  assert.ok(approveClient.calls.some((call) => /status = ANY/.test(call.sql)));

  const invalidApprove = await repo.approveStatus(
    1,
    2,
    '',
    fakeTransitionClient({ status: 'APPROVED' })
  );
  assert.equal(invalidApprove.ok, false);
  assert.equal(invalidApprove.code, 'PO_ALREADY_APPROVED');

  const cancelClient = fakeTransitionClient({ status: 'SUPPLIER_CONFIRMED' });
  const cancel = await repo.cancelStatusSafely(1, 2, 'no longer needed', cancelClient);
  assert.equal(cancel.ok, true);
  assert.ok(cancelClient.calls.some((call) => /FOR UPDATE/.test(call.sql)));
  assert.ok(cancelClient.calls.some((call) => /status = ANY/.test(call.sql)));

  const partialCancel = await repo.cancelStatusSafely(
    1,
    2,
    '',
    fakeTransitionClient({ status: 'PARTIALLY_RECEIVED' })
  );
  assert.equal(partialCancel.ok, false);
  assert.equal(partialCancel.code, 'PO_CANCELLATION_NOT_ALLOWED');
});

function loadService({ profile, transition, activityError = null }) {
  const resolvedService = require.resolve(servicePath);
  delete require.cache[resolvedService];
  const originalLoad = Module._load;
  const calls = { activity: [], transaction: 0 };
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved.endsWith('auth.service.js')) {
      return { getProfile: async () => ({ ok: true, profile }) };
    }
    if (resolved.endsWith('activity.repository.js')) {
      return {
        createActivityLog: async (payload) => {
          calls.activity.push(payload);
          if (activityError) throw activityError;
          return { id: 1 };
        },
      };
    }
    if (resolved.endsWith('database\\connection.js') || resolved.endsWith('database/connection.js')) {
      return {
        withTransaction: async (callback) => {
          calls.transaction += 1;
          return callback({ tx: true });
        },
      };
    }
    if (resolved.endsWith('po.repository.js')) {
      return {
        approveStatus: async (...args) => transition('approve', ...args),
        cancelStatusSafely: async (...args) => transition('cancel', ...args),
      };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    const service = require(servicePath);
    return { service, calls };
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedService];
  }
}

test('service enforces permission keys and writes activity logs in the transaction', async () => {
  const denied = loadService({
    profile: { id: 1, role: 'Manager', permissions: [] },
    transition: async () => ({ ok: true }),
  });
  assert.deepEqual(await denied.service.approveOrder(1), {
    ok: false,
    code: 'PURCHASE_ORDER_PERMISSION_DENIED',
    message: 'You do not have permission for this procurement action.',
  });

  const allowed = loadService({
    profile: { id: 2, role: 'Manager', permissions: ['purchaseOrders.approve', 'purchaseOrders.cancel'] },
    transition: async (type, id, userId, notes, client) => ({
      ok: true,
      previousStatus: type === 'approve' ? 'DRAFT' : 'APPROVED',
      order: { id, poNumber: `PO-${id}`, status: type === 'approve' ? 'APPROVED' : 'CANCELLED' },
      client,
      userId,
      notes,
    }),
  });
  const approved = await allowed.service.approveOrder(4, 'reviewed');
  assert.equal(approved.ok, true);
  assert.equal(allowed.calls.transaction, 1);
  assert.equal(allowed.calls.activity[0].client.tx, true);
  assert.equal(allowed.calls.activity[0].metadata.previousStatus, 'DRAFT');

  const cancelled = await allowed.service.cancelOrder(4, 'supplier declined');
  assert.equal(cancelled.ok, true);
  assert.equal(allowed.calls.transaction, 2);
  assert.equal(allowed.calls.activity[1].metadata.newStatus, 'CANCELLED');
});

test('service maps missing and invalid transition codes safely', async () => {
  const service = loadService({
    profile: { id: 1, role: 'Admin', permissions: [] },
    transition: async (type) => ({
      ok: false,
      code: type === 'approve' ? 'PO_APPROVAL_NOT_ALLOWED' : 'PO_CANCELLATION_NOT_ALLOWED',
    }),
  }).service;
  assert.deepEqual(await service.approveOrder(3), {
    ok: false,
    code: 'PO_APPROVAL_NOT_ALLOWED',
    message: 'Only draft or pending approval POs can be approved.',
  });
  assert.deepEqual(await service.cancelOrder(3), {
    ok: false,
    code: 'PO_CANCELLATION_NOT_ALLOWED',
    message:
      'Purchase order could not be cancelled. It may already be received, invoiced, closed, or cancelled.',
  });
});

test('HTML activates only certified approve and cancel labels while keeping default disabled', () => {
  const html = read(htmlPath);
  const approveMatches = html.match(/id="poRequestApprovalButton"/g) || [];
  const cancelMatches = html.match(/id="poCancelCurrentButton"/g) || [];
  assert.equal(approveMatches.length, 1);
  assert.equal(cancelMatches.length, 1);
  assert.match(html, /id="poRequestApprovalButton"[^>]*disabled[^>]*>Approve PO<\/button>/);
  assert.match(html, /id="poCancelCurrentButton"[^>]*disabled[^>]*>Cancel PO<\/button>/);
  assert.doesNotMatch(html, /Approval workflow is planned for Phase 2|Cancel PO Phase 2/);
  assert.match(html, /Goods receiving is planned for Phase 2/);
});

test('activity repository can write through a transaction client', async () => {
  delete require.cache[activityRepositoryPath];
  const activityRepository = require(activityRepositoryPath);
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ id: 7 }] };
    },
  };
  const result = await activityRepository.createActivityLog({
    client,
    userId: 1,
    action: 'purchase_order.approve',
    status: 'success',
    message: 'ok',
    metadata: { purchaseOrderId: 1 },
  });
  assert.equal(result.id, 7);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO activity_logs/);
});
