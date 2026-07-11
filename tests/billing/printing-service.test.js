const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const servicePath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'main',
  'features',
  'printing',
  'printing.service.js'
);

const repositoryPath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'main',
  'features',
  'printing',
  'printing.repository.js'
);

const receipt = {
  invoiceNumber: 'INV-PRINT-001',
  createdAt: '2026-01-01T10:00:00.000Z',
  cashierName: 'Cashier',
  customerName: 'Walk-in Customer',
  items: [
    {
      productName: 'Test Product',
      quantity: 1,
      unitPrice: 10,
      discount: 0,
      total: 10,
    },
  ],
  subtotal: 10,
  discount: 0,
  tax: 0,
  grandTotal: 10,
  paidAmount: 10,
  changeAmount: 0,
};

function receiptCss(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
}

function decodeDataUrl(url) {
  const encoded = String(url || '').replace(/^data:text\/html;charset=utf-8,/, '');
  return decodeURIComponent(encoded);
}

function receiptMm(css, property) {
  const match = css.match(new RegExp(`${property}:\\s*([0-9.]+)mm`));
  return match ? Number(match[1]) : null;
}

function loadPrintingService({ settingsRow, printCallback }) {
  delete require.cache[servicePath];
  delete require.cache[repositoryPath];

  const originalLoad = Module._load;
  const windows = [];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.closed = false;
      this.webContents = {
        print: (options, callback) => {
          printCallback(options);
          callback(true);
        },
      };
      windows.push(this);
    }

    async loadURL(url) {
      this.url = url;
    }

    close() {
      this.closed = true;
    }

    static getAllWindows() {
      return windows;
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (request === 'electron') {
      return { BrowserWindow: FakeBrowserWindow };
    }
    if (resolved === repositoryPath) {
      return {
        getPrinterSettingsRow: async () => settingsRow,
        savePrinterSettingsRow: async (settings) => settings,
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return {
      service: require(servicePath),
      windows,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('Billing receipt print uses hidden/direct Electron printing even when setting is false', async () => {
  let printOptions;
  const { service, windows } = loadPrintingService({
    settingsRow: {
      printer_name: '',
      paper_width: '58mm',
      silent_print: false,
      auto_print: false,
      receipt_copies: 1,
      footer_text: 'Thanks',
    },
    printCallback: (options) => {
      printOptions = options;
    },
  });

  const result = await service.printReceipt(receipt);

  assert.deepEqual(result, { success: true, failureReason: undefined });
  assert.equal(printOptions.silent, true);
  assert.equal(printOptions.deviceName, undefined);
  assert.equal(printOptions.printBackground, true);
  assert.deepEqual(printOptions.margins, { marginType: 'none' });
  assert.equal(windows[0].options.show, false);
  assert.equal(windows[0].closed, true);
});

test('Billing receipt print output uses the shared thermal HTML headings', async () => {
  const { service, windows } = loadPrintingService({
    settingsRow: {
      printer_name: '',
      paper_width: '80mm',
      silent_print: false,
      auto_print: false,
      receipt_copies: 1,
      footer_text: 'Thanks',
    },
    printCallback: () => {},
  });

  await service.printReceipt(receipt);
  const html = decodeDataUrl(windows[0].url);

  assert.match(html, /<div>Item<\/div>/);
  assert.match(html, /<div>Qty x Price - Discount = Total<\/div>/);
});

test('Billing receipt print passes configured printer name without enabling auto print', async () => {
  let printOptions;
  const { service } = loadPrintingService({
    settingsRow: {
      printer_name: 'Receipt Printer',
      paper_width: '80mm',
      silent_print: false,
      auto_print: false,
      receipt_copies: 1,
      footer_text: 'Thanks',
    },
    printCallback: (options) => {
      printOptions = options;
    },
  });

  await service.printReceipt(receipt);

  assert.equal(printOptions.silent, true);
  assert.equal(printOptions.deviceName, 'Receipt Printer');
});

test('Billing receipt HTML uses safe 58mm paper profile geometry', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: '58mm', footerText: 'Thanks' });
  const css = receiptCss(html);

  assert.doesNotMatch(css, /@page/);
  assert.match(css, /\*\s*\{\s*box-sizing:\s*border-box;\s*\}/);
  assert.doesNotMatch(css, /html,\s*body\s*\{[^}]*width:/);
  assert.match(css, /\.receipt\s*\{[^}]*width:\s*52mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*max-width:\s*52mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*margin:\s*0 0 0 3mm;/);
  assert.doesNotMatch(
    css,
    /margin-left:\s*auto|margin-right:\s*auto|justify-content:\s*center|align-items:\s*center|translate\(/
  );
  assert.doesNotMatch(css, /width:\s*220px/);
});

test('Billing receipt HTML uses safe 80mm paper profile geometry', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: '80mm', footerText: 'Thanks' });
  const css = receiptCss(html);

  assert.doesNotMatch(css, /@page/);
  assert.doesNotMatch(css, /html,\s*body\s*\{[^}]*width:/);
  assert.match(css, /\.receipt\s*\{[^}]*width:\s*69mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*max-width:\s*69mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*margin:\s*0 0 0 4mm;/);
  assert.doesNotMatch(
    css,
    /margin-left:\s*auto|margin-right:\s*auto|justify-content:\s*center|align-items:\s*center|translate\(/
  );
  assert.doesNotMatch(css, /width:\s*302px/);
});

test('Billing receipt HTML contains item headings in receipt column order', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });
  const longNameReceipt = {
    ...receipt,
    items: [
      {
        productName: 'Very Long Product Name That Should Remain Printable',
        quantity: 2,
        unitPrice: 12.5,
        discount: 1,
        total: 24,
      },
    ],
  };

  const html = service.buildReceiptHtml(longNameReceipt, {
    paperWidth: '80mm',
    footerText: 'Thanks',
  });
  const headingIndexes = ['Item', 'Qty', 'Price', 'Discount', 'Total'].map((heading) =>
    html.indexOf(heading)
  );

  assert.deepEqual(
    headingIndexes,
    [...headingIndexes].sort((a, b) => a - b),
    'receipt headings should follow item, quantity, price, discount, total order'
  );
  assert.match(html, /<div>Qty x Price - Discount = Total<\/div>/);
  assert.match(html, /Very Long Product Name That Should Remain Printable/);
  assert.match(html, /2 x 12\.50 - 1\.00 = 24\.00/);
});

test('Billing receipt heading fix preserves accepted 80mm geometry', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const css = receiptCss(
    service.buildReceiptHtml(receipt, { paperWidth: '80mm', footerText: 'Thanks' })
  );

  assert.match(css, /\.receipt\s*\{[^}]*width:\s*69mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*max-width:\s*69mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*margin:\s*0 0 0 4mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*padding:\s*2mm 0;/);
  assert.doesNotMatch(css, /@page/);
  assert.doesNotMatch(css, /html,\s*body\s*\{[^}]*width:/);
  assert.doesNotMatch(
    css,
    /margin-left:\s*auto|margin-right:\s*auto|justify-content:\s*center|align-items:\s*center|translate\(/
  );
});

test('unknown Billing receipt paper width falls back to safe 80mm profile', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: 'unknown', footerText: 'Thanks' });
  const css = receiptCss(html);

  assert.doesNotMatch(css, /@page/);
  assert.match(css, /\.receipt\s*\{[^}]*width:\s*69mm;/);
  assert.match(css, /\.receipt\s*\{[^}]*margin:\s*0 0 0 4mm;/);
});

test('80mm Billing receipt calibration keeps the right boundary at 73mm', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    receiptRow: receipt,
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: '80mm', footerText: 'Thanks' });
  const css = receiptCss(html);
  const width = Number(css.match(/width:\s*(\d+)mm;/)?.[1]);
  const inset = Number(css.match(/margin:\s*0 0 0 (\d+)mm;/)?.[1]);

  assert.equal(width, 69);
  assert.equal(inset, 4);
  assert.equal(width + inset, 73);
});

test('Billing receipt geometry remains inside each selected paper profile', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  for (const [paperWidth, expectedPageWidth] of [
    ['58mm', 58],
    ['80mm', 80],
    ['A4', 210],
    ['unknown', 80],
  ]) {
    const css = receiptCss(service.buildReceiptHtml(receipt, { paperWidth, footerText: 'Thanks' }));
    const widthMm = receiptMm(css, 'width');
    const marginMatch = css.match(/margin:\s*0 0 0 ([0-9.]+)mm/);
    const leftInsetMm = marginMatch ? Number(marginMatch[1]) : null;

    assert.equal(Number.isFinite(widthMm), true, `${paperWidth} width should be measurable`);
    assert.equal(Number.isFinite(leftInsetMm), true, `${paperWidth} inset should be measurable`);
    assert.ok(widthMm + leftInsetMm <= expectedPageWidth, `${paperWidth} exceeds paper width`);
  }
});
