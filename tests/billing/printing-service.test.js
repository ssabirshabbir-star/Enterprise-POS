const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'printing',
  'printing.service.js'
);

const repositoryPath = path.join(
  repoRoot,
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

function tempLogoPath(ext = '.png') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-logo-'));
  const logoPath = path.join(dir, `brand${ext}`);
  fs.writeFileSync(logoPath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  return logoPath;
}

function loadPrintingService({ settingsRow, storeSettingsRow, printCallback }) {
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
        getStoreSettingsRow: async () => storeSettingsRow || {},
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

  assert.match(html, /<span>Item<\/span>/);
  assert.match(html, /<span>Qty<\/span>/);
  assert.match(html, /<span>Unit Price<\/span>/);
  assert.match(html, /<span>Total<\/span>/);
  assert.match(html, /aria-label="Transaction details"/);
  assert.match(html, /aria-label="Payment details"/);
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

test('Billing receipt HTML contains professional item columns and dynamic rows', () => {
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
  const headingIndexes = ['Item', 'Qty', 'Unit Price', 'Total'].map((heading) =>
    html.indexOf(heading)
  );

  assert.deepEqual(
    headingIndexes,
    [...headingIndexes].sort((a, b) => a - b),
    'receipt headings should follow item, quantity, unit price, total order'
  );
  assert.match(html, /class="item-line"/);
  assert.match(html, /Very Long Product Name That Should Remain Printable/);
  assert.match(html, /<span>2<\/span>/);
  assert.match(html, /<span>12\.50<\/span>/);
  assert.match(html, /<span>24\.00<\/span>/);
  assert.match(html, /Discount 1\.00/);
});

test('Billing receipt HTML keeps the refined professional thermal section structure', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: '80mm', footerText: 'Thanks' });
  const css = receiptCss(html);

  assert.match(css, /\.brand\s*\{[\s\S]*border-bottom:\s*2px solid #111;/);
  assert.match(css, /\.items-head\s*\{[\s\S]*border-top:\s*1px solid #111;/);
  assert.match(css, /\.items-head\s*\{[\s\S]*border-bottom:\s*1px solid #111;/);
  assert.match(css, /\.grand\s*\{[\s\S]*border-top:\s*2px solid #111;/);
  assert.match(css, /\.grand\s*\{[\s\S]*border-bottom:\s*2px solid #111;/);
  assert.match(css, /\.payment\s*\{[\s\S]*border-top:\s*1px dashed #777;/);
  assert.match(html, /<section class="totals" aria-label="Receipt totals">/);
  assert.match(html, /<span class="section-badge">Payment<\/span>/);
});

test('Billing receipt renders existing business settings and omits unsupported blank fields', async () => {
  const { service } = loadPrintingService({
    settingsRow: {
      printer_name: '',
      paper_width: '80mm',
      silent_print: false,
      auto_print: false,
      receipt_copies: 1,
      footer_text: 'Legacy footer should not render',
    },
    storeSettingsRow: {
      storeName: 'Grocery POS Market',
      address: '12 Market Road',
      phone: '+92 300 1234567',
      email: 'hello@example.test',
      taxNumber: 'NTN-123',
      website: '',
      logoPath: '',
    },
    printCallback: () => {},
  });

  const settings = await service.getPrinterSettings();
  const html = service.buildReceiptHtml(receipt, settings);
  const escpos = service.buildEscPosReceipt(receipt, settings);

  assert.match(html, /Grocery POS Market/);
  assert.match(html, /12 Market Road/);
  assert.match(html, /\+92 300 1234567/);
  assert.match(html, /hello@example\.test/);
  assert.match(html, /NTN-123/);
  assert.doesNotMatch(html, /website/i);
  assert.doesNotMatch(html, /Legacy footer should not render/);
  assert.match(escpos, /Grocery POS Market/);
  assert.match(escpos, /Address: 12 Market Road/);
  assert.match(escpos, /Tax No\.: NTN-123/);
});

test('Billing receipt renders a valid saved business logo in HTML and keeps ESC/POS text-only', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });
  const logoPath = tempLogoPath('.png');
  const html = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    businessName: 'Grocery POS Market',
    logoPath,
    receiptFooterText: 'Thanks',
  });
  const escpos = service.buildEscPosReceipt(receipt, {
    paperWidth: '80mm',
    businessName: 'Grocery POS Market',
    logoPath,
    receiptFooterText: 'Thanks',
  });

  assert.match(html, /<img class="brand-logo" src="file:\/\/\//);
  assert.match(html, /object-fit:\s*contain/);
  assert.match(html, /Grocery POS Market/);
  assert.doesNotMatch(escpos, /file:\/\//);
  assert.match(escpos, /Grocery POS Market/);
});

test('Billing receipt omits missing or unsupported logo paths without hiding business name', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });
  const unsupportedLogo = tempLogoPath('.gif');
  const corruptLogo = path.join(os.tmpdir(), `corrupt-business-logo-${Date.now()}.png`);
  const missingLogo = path.join(os.tmpdir(), 'missing-business-logo.png');
  fs.writeFileSync(corruptLogo, 'not a png');

  const unsupportedHtml = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    businessName: 'Grocery POS Market',
    logoPath: unsupportedLogo,
  });
  const missingHtml = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    businessName: 'Grocery POS Market',
    logoPath: missingLogo,
  });
  const corruptHtml = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    businessName: 'Grocery POS Market',
    logoPath: corruptLogo,
  });

  assert.doesNotMatch(unsupportedHtml, /<img class="brand-logo"/);
  assert.doesNotMatch(missingHtml, /<img class="brand-logo"/);
  assert.doesNotMatch(corruptHtml, /<img class="brand-logo"/);
  assert.match(unsupportedHtml, /Grocery POS Market/);
  assert.match(missingHtml, /Grocery POS Market/);
  assert.match(corruptHtml, /Grocery POS Market/);
});

test('Billing receipt omits zero-value optional financial rows without changing totals', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, { paperWidth: '80mm', footerText: 'Thanks' });

  assert.match(html, /<span>Subtotal<\/span><span>10\.00<\/span>/);
  assert.match(html, /<span>Grand Total<\/span><span>10\.00<\/span>/);
  assert.doesNotMatch(html, /<span>Discount<\/span><span>0\.00<\/span>/);
  assert.doesNotMatch(html, /<span>Tax<\/span><span>0\.00<\/span>/);
});

test('Billing receipt removes Lucky Draw coupon values from the standard receipt', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });
  const couponReceipt = {
    ...receipt,
    luckyDrawCoupons: [
      {
        couponNo: 'LD-001',
        campaignName: 'Lucky Draw',
        barcodeValue: 'BAR-001-THERMAL',
        qrValue: 'QR-001',
      },
    ],
  };

  const html = service.buildReceiptHtml(couponReceipt, {
    paperWidth: '80mm',
    footerText: 'Thanks',
  });

  assert.doesNotMatch(html, /Lucky Draw/i);
  assert.doesNotMatch(html, /LD-001/);
  assert.doesNotMatch(html, /BAR-001-THERMAL/);
  assert.doesNotMatch(html, /QR-001/);
});

test('Billing receipt uses configured store receipt footer in HTML and ESC/POS output', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const settings = {
    paperWidth: '80mm',
    receiptFooterText: 'Thank you!\nWe hope to see you again soon.',
  };
  const html = service.buildReceiptHtml(receipt, settings);
  const escpos = service.buildEscPosReceipt(receipt, settings);

  assert.match(html, /<span class="footer-line">Thank you!<\/span>/);
  assert.match(html, /<span class="footer-line">We hope to see you again soon\.<\/span>/);
  assert.match(escpos, /Thank you!\nWe hope to see you again soon\./);
});

test('Billing receipt omits configured footer block when store footer is blank', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    receiptFooterText: '   ',
  });
  const escpos = service.buildEscPosReceipt(receipt, {
    paperWidth: '80mm',
    receiptFooterText: '',
  });

  assert.doesNotMatch(html, /class="footer"/);
  assert.doesNotMatch(html, /Thank you!/);
  assert.doesNotMatch(escpos, /Thank you!/);
});

test('Billing receipt escapes multiline footer text and avoids the old hardcoded footer', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });

  const html = service.buildReceiptHtml(receipt, {
    paperWidth: '80mm',
    receiptFooterText: 'Line <One>\nLine & Two\n' + 'Long '.repeat(24),
  });
  const source = fs.readFileSync(
    path.join(repoRoot, 'src', 'main', 'features', 'printing', 'printing.service.js'),
    'utf8'
  );

  assert.match(html, /Line &lt;One&gt;/);
  assert.match(html, /Line &amp; Two/);
  assert.match(html, /footer-line/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(source, /We hope to see you again soon/);
});

test('Completed Invoice reprint receipt shape uses the same thermal renderer contract', () => {
  const { service } = loadPrintingService({
    settingsRow: {},
    printCallback: () => {},
  });
  const completedInvoiceReceipt = {
    ...receipt,
    status: 'COMPLETED',
    payments: [{ paymentMethod: 'Cash', amount: 10, createdAt: receipt.createdAt }],
  };

  const html = service.buildReceiptHtml(completedInvoiceReceipt, {
    paperWidth: '80mm',
    receiptFooterText: 'Thanks',
  });

  assert.match(html, /Retail Receipt/);
  assert.match(html, /INV-PRINT-001/);
  assert.match(html, /class="items-head"/);
  assert.match(html, /class="total-row grand"/);
  assert.match(html, /<span class="footer-line">Thanks<\/span>/);
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
