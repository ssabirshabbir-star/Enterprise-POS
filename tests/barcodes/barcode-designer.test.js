const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rendererPath = path.join(
  __dirname,
  '../../src/main/features/barcodes/barcode-designer.renderer.js'
);
const launcherPath = path.join(
  __dirname,
  '../../src/main/features/barcodes/barcode-designer.launcher.js'
);
const productsApiPath = path.join(__dirname, '../../src/main/features/products/products.api.js');
const designerHtmlPath = path.join(
  __dirname,
  '../../src/main/features/barcodes/barcode-designer.html'
);

function loadRendererHooks(options = {}) {
  const storage = memoryStorage();
  const context = {
    window: { localStorage: storage },
    console,
    localStorage: storage,
  };
  if (options.document) context.document = options.document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(rendererPath, 'utf8'), context, { filename: rendererPath });
  return context.window.BarcodeDesignerTestHooks;
}

function loadLauncher() {
  const storage = memoryStorage();
  const context = {
    window: {
      open: () => ({ closed: false }),
      localStorage: storage,
    },
    localStorage: storage,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(launcherPath, 'utf8'), context, { filename: launcherPath });
  return context;
}

function loadProductsApi() {
  const context = {
    capturedLaunch: null,
    window: {
      FeatureGate: { check: () => ({ ok: true, status: 'safe', message: 'ok' }) },
      posApi: {
        products: {
          list: async () => ({
            ok: true,
            products: [
              {
                id: 12,
                name: 'Wheat Flour 5kg',
                sku: 'GROC-003',
                barcode: '8801000000003',
                salePrice: 84,
                currentStock: 27,
              },
              {
                id: 33,
                name: 'Honey Bottle',
                sku: 'GROC-036',
                barcode: '8801000000036',
                salePrice: 100,
                currentStock: 54,
              },
            ],
          }),
        },
      },
      BarcodeDesignerLauncher: {
        open(payload) {
          context.capturedLaunch = payload;
          return { ok: true, message: 'opened' };
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(productsApiPath, 'utf8'), context, { filename: productsApiPath });
  return context;
}

function memoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function createPreviewDocument() {
  const elements = {
    barcodeDesignerPreview: {
      innerHTML: '',
      style: {
        values: {},
        setProperty(name, value) {
          this.values[name] = value;
        },
      },
    },
    barcodeDesignerCount: { textContent: '' },
  };
  return {
    elements,
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener() {},
  };
}

function validResolvedPreviewResponse() {
  return {
    ok: true,
    previewSession: { sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111' },
    preview: {
      resolvedLayout: {
        kind: 'barcode_resolved_preview_layout',
        schemaVersion: 1,
        executable: false,
        immutable: true,
        representation: 'plain_data',
        itemCount: 1,
        presentation: {
          columns: 3,
          columnGapMm: 6,
          labelWidthMm: 64,
          labelHeightMm: 34,
          titleSize: 11,
          metaSize: 9,
          barcodeHeightMm: 8,
          marginMm: {
            top: 8,
            right: 8,
            bottom: 8,
            left: 8,
          },
          showTitle: true,
          showSku: true,
          showPrice: true,
          showBarcodeDigits: true,
          showPacking: true,
          showExpiry: true,
          labelTitle: '',
          packingDate: '2026-06-09',
          expiryDate: '2026-06-30',
        },
        pages: [
          {
            pageIndex: 0,
            widthMm: 120,
            heightMm: 80,
            pageNumber: 1,
            items: [
              {
                index: 0,
                placement: {
                  boundsMm: {
                    xMm: 8,
                    yMm: 9,
                    widthMm: 64,
                    heightMm: 34,
                  },
                },
                label: {
                  product: {
                    name: 'Almonds 250g',
                    sku: 'GROC-096',
                    barcode: '8801000000096',
                    salePrice: 260,
                  },
                  barcode: {
                    value: '8801000000096',
                    encoded: { runs: [1, 2, 1, 3] },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  };
}

function irregularResolvedPreviewResponse() {
  const response = validResolvedPreviewResponse();
  response.preview.resolvedLayout.itemCount = 3;
  response.preview.resolvedLayout.presentation.columns = 2;
  response.preview.resolvedLayout.presentation.columnGapMm = 13;
  response.preview.resolvedLayout.pages = [
    {
      pageIndex: 0,
      widthMm: 123,
      heightMm: 77,
      items: [
        {
          index: 0,
          placement: { boundsMm: { xMm: 7, yMm: 11, widthMm: 37, heightMm: 19 } },
          label: {
            product: { name: 'First Product', sku: 'FIRST', barcode: '111', salePrice: 1 },
            barcode: { value: '111', encoded: { runs: [1, 1, 2] } },
          },
        },
        {
          index: 1,
          placement: { boundsMm: { xMm: 62, yMm: 29, widthMm: 41, heightMm: 22 } },
          label: {
            product: { name: 'Second Product', sku: 'SECOND', barcode: '222', salePrice: 2 },
            barcode: { value: '222', encoded: { runs: [2, 1, 2] } },
          },
        },
      ],
    },
    {
      pageIndex: 1,
      widthMm: 99,
      heightMm: 65,
      items: [
        {
          index: 2,
          placement: { boundsMm: { xMm: 5, yMm: 6, widthMm: 38, heightMm: 20 } },
          label: {
            product: { name: 'Third Product', sku: 'THIRD', barcode: '333', salePrice: 3 },
            barcode: { value: '333', encoded: { runs: [3, 1, 1] } },
          },
        },
      ],
    },
  ];
  return response;
}

test('barcode designer normalizes corrupt or unsafe settings to bounded plain data', () => {
  const hooks = loadRendererHooks();
  const settings = hooks.normalizeSettings({
    showTitle: false,
    showPrice: true,
    columns: 99,
    gap: -4,
    labelWidth: 'bad',
    labelHeight: 999,
    titleSize: 2,
    barcodeHeight: 1000,
    metaSize: 1,
    printMargin: 999,
    labelTitle: '<Unsafe>',
  });

  assert.equal(settings.showTitle, false);
  assert.equal(settings.showPrice, true);
  assert.equal(settings.columns, 5);
  assert.equal(settings.gap, 0);
  assert.equal(settings.labelWidth, 64);
  assert.equal(settings.labelHeight, 60);
  assert.equal(settings.titleSize, 8);
  assert.equal(settings.barcodeHeight, 30);
  assert.equal(settings.metaSize, 7);
  assert.equal(settings.printMargin, 20);
  assert.equal(settings.labelTitle, '<Unsafe>');
});

test('barcode designer normalizes products and inventory launch context', () => {
  const hooks = loadRendererHooks();
  const launch = hooks.normalizeLaunchPayload({
    mode: 'inventory',
    products: [
      {
        productId: '7',
        name: 'Almonds 250g',
        sku: 'GROC-096',
        barcode: '8801000000096',
        copies: 2,
      },
      { productId: 0, name: 'Invalid' },
    ],
  });

  assert.equal(launch.mode, 'inventory');
  assert.equal(launch.products.length, 1);
  assert.equal(launch.products[0].productId, 7);
  assert.equal(launch.products[0].copies, 2);
  assert.equal(launch.products[0].selected, true);
});

test('barcode designer builds certified preview request payload without legacy print dependency', () => {
  const hooks = loadRendererHooks();
  const products = [
    { productId: 1, selected: true, copies: 3 },
    { productId: 2, selected: false, copies: 1 },
  ];
  const request = hooks.buildPreviewRequest(products, {
    ...hooks.normalizeSettings(),
    showBarcodeDigits: false,
    showPrice: true,
    labelPrinter: 'System default printer',
  });

  assert.deepEqual(Object.keys(request).sort(), ['items', 'label', 'presentation', 'printer']);
  assert.equal(request.printer.kind, 'standard_label');
  assert.equal(request.printer.dpi, 300);
  assert.equal(request.label.format, 'CODE128');
  assert.equal(request.label.humanReadable, false);
  assert.equal(request.label.priceDisplay, true);
  assert.equal(request.presentation.showBarcodeDigits, false);
  assert.equal(request.presentation.showPrice, true);
  assert.equal(request.presentation.showPacking, true);
  assert.equal(request.presentation.showExpiry, true);
  assert.equal(request.presentation.labelTitle, '');
  assert.equal(request.presentation.columns, 3);
  assert.equal(request.presentation.gap, 6);
  assert.equal(request.presentation.labelWidth, 64);
  assert.equal(request.presentation.labelHeight, 34);
  assert.equal(
    JSON.stringify(request.items),
    JSON.stringify([
      {
        productId: 1,
        copies: 3,
        labelSize: request.label.labelSize,
        humanReadable: false,
        priceDisplay: true,
      },
    ])
  );

  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const launcherSource = fs.readFileSync(launcherPath, 'utf8');
  const legacyPrintApi = ['printing', 'printBarcode'].join('.');
  const browserPrintApi = ['window', 'print'].join('.');
  assert(!rendererSource.includes(legacyPrintApi));
  assert(!rendererSource.includes(browserPrintApi));
  assert(!launcherSource.includes(legacyPrintApi));
  assert(!launcherSource.includes(browserPrintApi));
});

test('barcode designer saves only normalized settings data', () => {
  const hooks = loadRendererHooks();
  const storage = memoryStorage();
  const saved = hooks.saveSettings(
    { columns: 4, printMargin: 9, showSku: false, showPrintDate: true, printDate: '2026-07-10' },
    storage
  );
  const stored = JSON.parse(storage.getItem(hooks.SETTINGS_KEY));

  assert.equal(saved.columns, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, 'showPrintDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, 'printDate'), false);
  assert.equal(stored.columns, 4);
  assert.equal(stored.printMargin, 9);
  assert.equal(stored.showSku, false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'showPrintDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'printDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'callback'), false);
});

test('barcode designer normalizes printer options and falls back when saved printer is missing', () => {
  const select = { innerHTML: '', value: '' };
  const hooks = loadRendererHooks({
    document: {
      getElementById(id) {
        return id === 'barcodeDesignerPrinter' ? select : null;
      },
      addEventListener() {},
    },
  });

  const selected = hooks.renderPrinterOptions(
    [{ name: 'Hewlett-Packard HP LaserJet' }, { displayName: 'Thermal Label' }, 'Thermal Label'],
    'Missing Printer'
  );

  assert.equal(selected, '');
  assert.equal(select.value, '');
  assert(select.innerHTML.includes('System default printer'));
  assert(select.innerHTML.includes('Hewlett-Packard HP LaserJet'));
  assert(select.innerHTML.includes('Thermal Label'));
  assert.equal(
    JSON.stringify(hooks.normalizePrinters([{ name: 'A' }, { name: 'A' }, { displayName: 'B' }])),
    JSON.stringify(['A', 'B'])
  );
});

test('barcode designer printer enumeration failure keeps system default safely available', async () => {
  const select = { innerHTML: '', value: '' };
  const hooks = loadRendererHooks({
    document: {
      getElementById(id) {
        return id === 'barcodeDesignerPrinter' ? select : null;
      },
      addEventListener() {},
    },
  });

  await hooks.loadPrinters();

  assert.equal(select.value, '');
  assert(select.innerHTML.includes('System default printer'));
});

test('barcode designer launcher stores plain launch context and opens dedicated page', () => {
  const context = loadLauncher();
  const result = context.window.BarcodeDesignerLauncher.open({
    mode: 'products',
    products: [
      { id: '9', name: 'Honey Bottle', sku: 'GROC-036', barcode: '8801000000036' },
      { id: '10', name: 'Jelly Pack', sku: 'GROC-100', barcode: '8801000000100', selected: false },
    ],
  });
  const stored = JSON.parse(
    context.localStorage.getItem(context.window.BarcodeDesignerLauncher.LAUNCH_KEY)
  );

  assert.equal(result.ok, true);
  assert.equal(stored.mode, 'products');
  assert.equal(stored.products.length, 2);
  assert.equal(stored.products[0].productId, 9);
  assert.equal(stored.products[0].selected, true);
  assert.equal(stored.products[1].productId, 10);
  assert.equal(stored.products[1].selected, false);
});

test('products barcode action opens the shared designer with all products and one initial selection', async () => {
  const context = loadProductsApi();
  const result = await context.window.ProductsApi.printBarcode({
    productId: 12,
    name: 'Ignored renderer name',
    barcode: 'Ignored renderer barcode',
  });

  assert.equal(result.ok, true);
  assert.equal(
    JSON.stringify(context.capturedLaunch),
    JSON.stringify({
      mode: 'products',
      products: [
        {
          productId: 12,
          name: 'Wheat Flour 5kg',
          sku: 'GROC-003',
          barcode: '8801000000003',
          salePrice: 84,
          currentStock: 27,
          copies: 1,
          selected: true,
        },
        {
          productId: 33,
          name: 'Honey Bottle',
          sku: 'GROC-036',
          barcode: '8801000000036',
          salePrice: 100,
          currentStock: 54,
          copies: 1,
          selected: false,
        },
      ],
    })
  );
});

test('products barcode action rejects stale product identity before opening designer', async () => {
  const context = loadProductsApi();
  const result = await context.window.ProductsApi.printBarcode(999);

  assert.equal(result.ok, false);
  assert.equal(context.capturedLaunch, null);
  assert.match(result.message, /not available/);
});

test('products barcode action rejects unsaved products without opening designer', async () => {
  const context = loadProductsApi();
  const result = await context.window.ProductsApi.printBarcode({ productId: 0 });

  assert.equal(result.ok, false);
  assert.equal(context.capturedLaunch, null);
  assert.match(result.message, /Save the product first/);
});

test('products table exposes a saved-product barcode launch action without form state', () => {
  const renderer = fs.readFileSync(
    path.join(__dirname, '../../src/main/features/products/products.renderer.js'),
    'utf8'
  );
  const productsCss = fs.readFileSync(
    path.join(__dirname, '../../src/main/features/products/products.css'),
    'utf8'
  );

  assert(renderer.includes("printBarcodeProduct: '[data-print-barcode-product]'"));
  assert(renderer.includes("'data-print-barcode-product': p.id"));
  assert(renderer.includes('epos-products-barcode-action'));
  assert(renderer.includes('function printBarcodeFromTable(productId)'));
  assert(renderer.includes('A().printBarcode({ productId: Number(productId), copies: 1 })'));
  assert(renderer.includes('barcodeBtn.dataset.printBarcodeProduct'));
  assert(!renderer.includes('window.posApi.products.printBarcode'));
  assert(!renderer.includes('require('));
  assert(productsCss.includes('.epos-products-table [data-print-barcode-product]'));
  assert(productsCss.includes('min-width: 82px;'));
  assert(productsCss.includes('white-space: nowrap;'));
  assert(productsCss.includes('width: 190px;'));
  assert(renderer.includes('data-edit-product'));
  assert(renderer.includes('data-delete-product'));
});

test('barcode designer keeps packing and expiry dates in one paired row', () => {
  const html = fs.readFileSync(designerHtmlPath, 'utf8');
  const packingToggleStart = html.indexOf('id="barcodeShowPacking"');
  const expiryToggleStart = html.indexOf('id="barcodeShowExpiry"');
  const pairStart = html.indexOf('class="epos-barcode-date-pair"');
  const customTitleStart = html.indexOf('id="barcodeLabelTitle"');
  const layoutStart = html.indexOf('aria-label="Layout"');

  assert(packingToggleStart > -1);
  assert(expiryToggleStart > packingToggleStart);
  assert(pairStart > -1);
  assert(pairStart > expiryToggleStart);
  assert(customTitleStart > pairStart);
  assert(layoutStart > pairStart);
  assert(layoutStart > customTitleStart);

  const dateBlock = html.slice(pairStart, customTitleStart);
  assert(dateBlock.includes('barcodePackingDateField'));
  assert(dateBlock.includes('barcodeExpiryDateField'));
  assert(!dateBlock.includes('<span>Packing date</span>'));
  assert(!dateBlock.includes('<span>Expiry date</span>'));
  assert(dateBlock.includes('aria-label="Packing date"'));
  assert(dateBlock.includes('aria-label="Expiry date"'));
  assert(!dateBlock.includes('barcodePrintDateField'));
  assert(!html.includes('barcodeShowPrintDate'));
  assert(!html.includes('barcodePrintDate'));
  assert(!html.includes('Print date'));
});

test('barcode designer product rows use one checkbox, details area, and copies input', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  assert(renderer.includes('data-product-selected'));
  assert(renderer.includes('class="epos-barcode-product-details"'));
  assert(renderer.includes('class="epos-barcode-copies"'));
  assert(renderer.includes('min="1" max="100"'));
});

test('barcode designer uses the same product list in inventory and products launches', () => {
  const html = fs.readFileSync(designerHtmlPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const css = fs.readFileSync(
    path.join(__dirname, '../../src/main/features/barcodes/barcode-designer.css'),
    'utf8'
  );

  assert(html.includes('barcodeDesignerProductsSection'));
  assert(!html.includes('barcodeDesignerSingleProductSection'));
  assert(!html.includes('barcodeDesignerSingleProduct'));
  assert(renderer.includes('function renderProductList()'));
  assert(renderer.includes('if (section) section.hidden = false;'));
  assert(!renderer.includes('function renderSingleProductControl()'));
  assert(!renderer.includes('hydrateSingleProductFromPreview'));
  assert(renderer.includes('data-product-copy-step="${index}:-1"'));
  assert(renderer.includes('data-product-copy-step="${index}:1"'));
  assert(renderer.includes('data-product-copies="${index}"'));
  assert(
    renderer.includes("document.querySelectorAll('input:not([data-product-copies]), select')")
  );
  assert(!css.includes('.epos-barcode-single-product-card'));
  assert(css.includes('.epos-barcode-copy-stepper'));
});

test('barcode designer validates copy edits before requesting preview', () => {
  const hooks = loadRendererHooks();

  assert.equal(hooks.readCopiesValue('1'), 1);
  assert.equal(hooks.readCopiesValue('2'), 2);
  assert.equal(hooks.readCopiesValue('100'), 100);
  assert.equal(hooks.readCopiesValue(''), null);
  assert.equal(hooks.readCopiesValue('0'), null);
  assert.equal(hooks.readCopiesValue('-1'), null);
  assert.equal(hooks.readCopiesValue('1.5'), null);
  assert.equal(hooks.readCopiesValue('101'), null);
  assert.equal(hooks.readCopiesValue('not-a-number'), null);

  const request = hooks.buildPreviewRequest([{ productId: 12, selected: true, copies: 2 }], {
    showTitle: true,
    showSku: true,
    showPrice: true,
    showBarcodeDigits: false,
    showPacking: false,
    showExpiry: false,
    labelTitle: '',
    packingDate: '',
    expiryDate: '',
    columns: 3,
    gap: 6,
    labelWidth: 64,
    labelHeight: 34,
    titleSize: 11,
    barcodeHeight: 8,
    metaSize: 9,
    printMargin: 8,
    labelPrinter: '',
  });
  assert.equal(request.items.length, 1);
  assert.equal(request.items[0].copies, 2);
});

test('barcode designer routes print buttons through certified barcode preview print API', () => {
  const html = fs.readFileSync(designerHtmlPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  assert(html.includes('id="barcodeDesignerPrint"'));
  assert(html.includes('id="barcodeDesignerPrintTop"'));
  assert(html.includes('aria-disabled="false"'));
  assert(html.includes('Print the current barcode label preview.'));
  assert(!html.includes('id="barcodeDesignerPrint" type="button" class="primary" disabled'));
  assert(!html.includes('id="barcodeDesignerPrintTop" type="button" disabled'));
  assert(renderer.includes('state.lastPreview?.previewSession?.sessionId'));
  assert(renderer.includes('window.posApi?.barcodes?.printPreview?.'));
  assert(renderer.includes('state.printPending'));
  assert(renderer.includes('Barcode printing is already in progress for this preview.'));
  assert(renderer.includes('Generate a valid barcode preview before printing.'));
  assert(renderer.includes('sessionId,'));
  assert(renderer.includes("printerName: readSettingsFromForm().labelPrinter || ''"));
  assert(!renderer.includes('html:'));
  assert(!renderer.includes('previewHtml'));
  assert(!renderer.includes('window.print'));
  assert(!renderer.includes('printing.printBarcode'));
  assert(!renderer.includes('printing?.printBarcode'));
});

test('barcode designer consumes the backend resolved preview layout for visible preview sizing', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  assert(renderer.includes('response?.preview?.resolvedLayout'));
  assert(renderer.includes("layout?.kind !== 'barcode_resolved_preview_layout'"));
  assert(renderer.includes('validBounds(item.placement?.boundsMm)'));
  assert(renderer.includes('readResolvedPreview(result)'));
  assert(renderer.includes('state.lastPreview = null;'));
  assert(renderer.includes('layout.itemCount'));
  assert(renderer.includes('renderPreviewPage(page, settings)'));
  assert(renderer.includes('renderPlacedLabel(item, settings)'));
  assert(renderer.includes('bounds.xMm'));
  assert(renderer.includes('page.widthMm'));
  assert(renderer.includes('page.heightMm'));
  assert(!renderer.includes('function flattenPreviewItems'));
  assert(!renderer.includes('const pages = response?.preview?.pages'));
  assert(!renderer.includes('layout?.presentation || state.settings'));
  assert(!renderer.includes('settings.columnGapMm ?? settings.gap'));
  assert(!renderer.includes('settings.labelWidthMm ?? settings.labelWidth'));
  assert(!renderer.includes('settings.labelHeightMm ?? settings.labelHeight'));
  assert(!renderer.includes('settings.barcodeHeightMm ?? settings.barcodeHeight'));
});

test('barcode designer renders only certified resolved preview layout data', () => {
  const document = createPreviewDocument();
  const hooks = loadRendererHooks({ document });
  const response = validResolvedPreviewResponse();

  assert.equal(hooks.renderPreview(response), true);

  const preview = document.elements.barcodeDesignerPreview;
  assert(preview.innerHTML.includes('Almonds 250g'));
  assert(preview.innerHTML.includes('GROC-096'));
  assert.equal(document.elements.barcodeDesignerCount.textContent, '1 printable label selected.');
  assert(preview.innerHTML.includes('class="epos-barcode-preview-page"'));
  assert(preview.innerHTML.includes('width:456px;height:304px;'));
  assert(
    preview.innerHTML.includes('left:30.4px;top:34.199999999999996px;width:243.2px;height:129.2px;')
  );
});

test('barcode designer fails closed when resolved preview layout is absent or malformed', () => {
  const document = createPreviewDocument();
  const hooks = loadRendererHooks({ document });

  assert.equal(hooks.renderPreview(validResolvedPreviewResponse()), true);
  assert(document.elements.barcodeDesignerPreview.innerHTML.includes('Almonds 250g'));

  const pagesOnly = {
    ok: true,
    preview: {
      pages: [{ items: [{ label: { product: { name: 'Fallback Product' } } }] }],
    },
  };
  assert.equal(hooks.readResolvedPreview(pagesOnly), null);
  assert.equal(hooks.renderPreview(pagesOnly), false);
  assert(
    document.elements.barcodeDesignerPreview.innerHTML.includes('Preview layout is unavailable')
  );
  assert(!document.elements.barcodeDesignerPreview.innerHTML.includes('Fallback Product'));
  assert.equal(document.elements.barcodeDesignerCount.textContent, '0 printable labels selected.');

  const malformed = validResolvedPreviewResponse();
  malformed.preview.resolvedLayout.presentation = null;
  assert.equal(hooks.readResolvedPreview(malformed), null);
  assert.equal(hooks.renderPreview(malformed), false);

  const malformedPage = validResolvedPreviewResponse();
  malformedPage.preview.resolvedLayout.pages[0].widthMm = 0;
  assert.equal(hooks.readResolvedPreview(malformedPage), null);

  const malformedMargin = validResolvedPreviewResponse();
  malformedMargin.preview.resolvedLayout.presentation.marginMm = null;
  assert.equal(hooks.readResolvedPreview(malformedMargin), null);

  const malformedPlacement = validResolvedPreviewResponse();
  delete malformedPlacement.preview.resolvedLayout.pages[0].items[0].placement;
  assert.equal(hooks.readResolvedPreview(malformedPlacement), null);
});

test('barcode designer uses resolved page membership and irregular placement geometry', () => {
  const document = createPreviewDocument();
  const hooks = loadRendererHooks({ document });
  const response = irregularResolvedPreviewResponse();

  assert.equal(hooks.renderPreview(response), true);

  const html = document.elements.barcodeDesignerPreview.innerHTML;
  assert.equal((html.match(/epos-barcode-preview-page/g) || []).length, 2);
  assert(html.includes('data-page-index="0"'));
  assert(html.includes('data-page-index="1"'));
  assert(html.includes('width:467.4px;height:292.59999999999997px;'));
  assert(html.includes('width:376.2px;height:247px;'));
  assert(html.includes('left:26.599999999999998px;top:41.8px;width:140.6px;height:72.2px;'));
  assert(
    html.includes('left:235.6px;top:110.19999999999999px;width:155.79999999999998px;height:83.6px;')
  );
  assert(html.includes('left:19px;top:22.799999999999997px;width:144.4px;height:76px;'));
  assert(html.indexOf('First Product') < html.indexOf('Second Product'));
  assert(html.indexOf('Second Product') < html.indexOf('Third Product'));
});

test('barcode designer hides date calendars without losing stored values', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');

  assert(renderer.includes('function updateDateFieldVisibility(settings)'));
  assert(!renderer.includes('function toggleDateFields(settings)'));
  assert(renderer.includes("document.querySelector('.epos-barcode-date-pair')"));
  assert(renderer.includes("dateRow?.classList.toggle('is-hidden', !hasVisibleDate)"));
  assert(renderer.includes("field?.classList.toggle('is-hidden', !enabled)"));
  assert(renderer.includes('if (input) input.disabled = !enabled;'));
  assert(renderer.includes("packingDate: $('barcodePackingDate')?.value || ''"));
  assert(renderer.includes("expiryDate: $('barcodeExpiryDate')?.value || ''"));
});

test('barcode designer CSS keeps date pair stable and product list compact', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '../../src/main/features/barcodes/barcode-designer.css'),
    'utf8'
  );

  assert(css.includes('grid-template-columns: 15px minmax(0, 1fr) 82px;'));
  assert(css.includes('min-height: 34px;'));
  assert(css.includes('min-width: 0;'));
  assert(css.includes('width: 100%;'));
  assert(css.includes('max-width: 100%;'));
  assert(css.includes('place-self: center end;'));
  assert(css.includes('height: 22px;'));
  assert(css.includes('min-height: 0;'));
  assert(css.includes('margin: auto 0;'));
  assert(css.includes('line-height: 20px;'));
  assert(css.includes('vertical-align: middle;'));
  assert(css.includes('appearance: textfield;'));
  assert(css.includes('.epos-barcode-copy-stepper'));
  assert(css.includes('grid-template-columns: 20px 34px 20px;'));
  assert(css.includes('::-webkit-inner-spin-button'));
  assert(css.includes('scrollbar-gutter: stable;'));
  assert(css.includes('#barcodePackingDateField'));
  assert(css.includes('grid-column: 1;'));
  assert(css.includes('#barcodeExpiryDateField'));
  assert(css.includes('grid-column: 2;'));
  assert(css.includes('.epos-barcode-date-pair.is-hidden'));
  assert(css.includes('.epos-barcode-date-pair .is-hidden'));
  assert(css.includes('.epos-barcode-preview-page'));
  assert(css.includes('position: relative;'));
  assert(css.includes('position: absolute;'));
  assert(!css.includes('grid-template-columns: repeat(var(--barcode-columns'));
  assert(!css.includes('.epos-barcode-date-pair .is-disabled'));
  assert(!css.includes('.epos-barcode-date-pair .hidden'));
  assert(!css.includes('!important'));
  assert(!css.includes('translateY'));
  assert(!css.includes('margin-top: -'));
  assert(!css.includes('margin-bottom: -'));
});
