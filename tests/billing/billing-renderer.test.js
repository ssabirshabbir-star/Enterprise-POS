const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FakeEvent {
  constructor(type, target) {
    this.type = type;
    this.target = target;
    this.defaultPrevented = false;
    this._stopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopImmediatePropagation() {
    this._stopped = true;
  }
}

class FakeElement {
  constructor(document, id, options = {}) {
    this.ownerDocument = document;
    this.id = id;
    this.dataset = options.dataset || {};
    this._hiddenControl = Boolean(options.hiddenControl);
    this._listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = {};
    this.value = options.value || '';
    this.checked = Boolean(options.checked);
    this.disabled = Boolean(options.disabled);
    this.tabIndex = 0;
  }

  addEventListener(type, handler) {
    const listeners = this._listeners.get(type) || [];
    listeners.push(handler);
    this._listeners.set(type, listeners);
  }

  click() {
    this.ownerDocument.dispatchEventFrom(this, 'click');
  }

  focus() {}

  reset() {}

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  closest(selector) {
    if (selector === '.epos-billing-hidden-controls') {
      return this._hiddenControl ? this : null;
    }
    return null;
  }

  _dispatch(event) {
    for (const handler of this._listeners.get(event.type) || []) {
      if (event._stopped) return;
      handler(event);
    }
  }
}

class FakeDocument {
  constructor() {
    this._elements = new Map();
    this._listeners = new Map();
  }

  add(id, options) {
    const element = new FakeElement(this, id, options);
    this._elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this._elements.get(id) || null;
  }

  createElement() {
    return new FakeElement(this, '');
  }

  querySelector(selector) {
    if (selector === '.epos-billing-shell') return null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector.includes('.epos-billing-hidden-controls')) {
      return [...this._elements.values()].filter((element) => element._hiddenControl);
    }
    return [];
  }

  addEventListener(type, handler, useCapture = false) {
    const listeners = this._listeners.get(type) || [];
    listeners.push({ handler, useCapture: Boolean(useCapture) });
    this._listeners.set(type, listeners);
  }

  dispatchEventFrom(target, type) {
    const event = new FakeEvent(type, target);
    const listeners = this._listeners.get(type) || [];
    for (const listener of listeners.filter((entry) => entry.useCapture)) {
      if (event._stopped) return event;
      listener.handler(event);
    }
    if (!event._stopped) target._dispatch(event);
    for (const listener of listeners.filter((entry) => !entry.useCapture)) {
      if (event._stopped) return event;
      listener.handler(event);
    }
    return event;
  }
}

function loadBillingRenderer() {
  const document = new FakeDocument();
  document.add('cartTableBody');
  document.add('thermalPrintButton', { hiddenControl: true });
  document.add('thermalPrintMirrorButton');
  document.add('reprintLastBillButton');
  document.add('completeSaleButton');
  document.add('posMessage');
  document.add('posBarcodeInput');
  document.add('discountType', { value: 'amount' });
  document.add('paymentMethod', { hiddenControl: true, value: 'Cash' });

  const receipt = { invoiceNumber: 'INV-TEST-001', items: [] };
  const calls = [];
  const cart = {
    clearSearchResults() {},
    getCart: () => ({ items: [], paymentMethod: 'Cash' }),
    getBillingMode: () => 'retail',
    getLastReceipt: () => receipt,
    renderCart() {},
    renderCustomerSelect() {},
    renderHeldSalesList() {},
    renderReceiptPreview() {},
    setBillingMode() {},
    setCartCustomer() {},
    setCustomers() {},
    setLastReceipt() {},
    setPaymentMethod() {},
    showMsg(message, isError) {
      calls.push({ type: 'message', message, isError: Boolean(isError) });
    },
    updateCustomerBalanceDisplay() {},
    updateDisplayTotals() {},
  };
  const api = {
    deleteHeldSale: async () => ({ ok: true }),
    getLastReceipt: async () => ({ ok: true, receipt }),
    getPrintSettings: async () => ({ ok: true, settings: { autoPrint: false } }),
    loadCustomers: async () => ({ ok: true, customers: [] }),
    loadHeldSales: async () => ({ ok: true, holds: [] }),
    printReceipt: async (printedReceipt) => {
      calls.push({ type: 'printReceipt', receipt: printedReceipt });
      return { ok: true, message: 'Receipt sent to printer.' };
    },
  };
  const window = {
    BillingApi: api,
    BillingCart: cart,
    FeatureGate: {
      check: () => ({ ok: true, visible: true, message: 'ok' }),
    },
    posApi: {
      dialog: { confirm: async () => true },
    },
  };
  const context = vm.createContext({
    document,
    setTimeout,
    window,
  });
  const rendererPath = path.join(
    __dirname,
    '..',
    '..',
    'src',
    'main',
    'features',
    'billing',
    'billing.renderer.js'
  );
  vm.runInContext(fs.readFileSync(rendererPath, 'utf8'), context, {
    filename: rendererPath,
  });
  window.initBillingModule();
  return { calls, document, window };
}

test('cart footer Print Receipt invokes shared receipt print directly', async () => {
  const { calls, document } = loadBillingRenderer();
  const hiddenButton = document.getElementById('thermalPrintButton');
  let hiddenClickCount = 0;
  const originalHiddenClick = hiddenButton.click.bind(hiddenButton);
  hiddenButton.click = () => {
    hiddenClickCount += 1;
    originalHiddenClick();
  };

  document.getElementById('thermalPrintMirrorButton').click();
  await Promise.resolve();

  assert.equal(hiddenClickCount, 0);
  assert.equal(calls.filter((call) => call.type === 'printReceipt').length, 1);
  assert.equal(
    calls.find((call) => call.type === 'printReceipt').receipt.invoiceNumber,
    'INV-TEST-001'
  );
});

test('hidden-control blocker still prevents legacy hidden print button', async () => {
  const { calls, document } = loadBillingRenderer();

  const event = document.dispatchEventFrom(document.getElementById('thermalPrintButton'), 'click');
  await Promise.resolve();

  assert.equal(event.defaultPrevented, true);
  assert.equal(calls.filter((call) => call.type === 'printReceipt').length, 0);
});

test('Reprint Receipt keeps the shared print workflow and does not duplicate calls', async () => {
  const { calls, document } = loadBillingRenderer();

  document.getElementById('reprintLastBillButton').click();
  await Promise.resolve();

  assert.equal(calls.filter((call) => call.type === 'printReceipt').length, 1);
  assert.equal(
    calls.find((call) => call.type === 'printReceipt').receipt.invoiceNumber,
    'INV-TEST-001'
  );
});
