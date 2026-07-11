(function BarcodeDesignerRendererModule() {
  'use strict';

  const SETTINGS_KEY = 'enterprise-pos.barcode-label-designer.settings.v1';
  const LAUNCH_KEY = 'enterprise-pos.barcode-label-designer.launch.v1';
  const DEFAULTS = Object.freeze({
    labelPrinter: '',
    showTitle: true,
    showSku: true,
    showPrice: true,
    showBarcodeDigits: true,
    showPacking: true,
    showExpiry: true,
    labelTitle: '',
    packingDate: '2026-06-09',
    expiryDate: '2026-06-30',
    columns: 3,
    gap: 6,
    labelWidth: 64,
    labelHeight: 34,
    titleSize: 11,
    barcodeHeight: 8,
    metaSize: 9,
    printMargin: 8,
  });
  const PREVIEW_MM_TO_PX = 3.8;
  const NUMERIC_BOUNDS = Object.freeze({
    columns: Object.freeze([1, 5]),
    gap: Object.freeze([0, 20]),
    labelWidth: Object.freeze([30, 100]),
    labelHeight: Object.freeze([18, 60]),
    titleSize: Object.freeze([8, 20]),
    barcodeHeight: Object.freeze([6, 30]),
    metaSize: Object.freeze([7, 16]),
    printMargin: Object.freeze([0, 20]),
  });

  let state = {
    launch: { mode: 'inventory', products: [] },
    products: [],
    productSearch: '',
    settings: { ...DEFAULTS },
    previewSeq: 0,
    lastPreview: null,
    printPending: false,
  };
  let previewTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function optionEsc(value) {
    return esc(value).replace(/'/g, '&#39;');
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(number)));
  }

  function normalizeSettings(raw = {}) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const next = { ...DEFAULTS };
    ['showTitle', 'showSku', 'showPrice', 'showBarcodeDigits', 'showPacking', 'showExpiry'].forEach(
      (key) => {
        if (Object.prototype.hasOwnProperty.call(input, key)) next[key] = input[key] === true;
      }
    );
    ['labelPrinter', 'labelTitle', 'packingDate', 'expiryDate'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(input, key)) next[key] = String(input[key] || '');
    });
    Object.entries(NUMERIC_BOUNDS).forEach(([key, bounds]) => {
      next[key] = clampNumber(input[key], DEFAULTS[key], bounds[0], bounds[1]);
    });
    return next;
  }

  function loadSettings(storage = window.localStorage) {
    try {
      return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || '{}'));
    } catch {
      return normalizeSettings();
    }
  }

  function saveSettings(settings, storage = window.localStorage) {
    const safe = normalizeSettings(settings);
    storage.setItem(SETTINGS_KEY, JSON.stringify(safe));
    return safe;
  }

  function printerName(printer) {
    return String(printer?.name || printer?.displayName || printer || '').trim();
  }

  function normalizePrinters(printers) {
    const names = [];
    const seen = new Set();
    (Array.isArray(printers) ? printers : []).forEach((printer) => {
      const name = printerName(printer);
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    return names;
  }

  function renderPrinterOptions(printers, savedPrinter = '') {
    const select = $('barcodeDesignerPrinter');
    if (!select) return '';
    const names = normalizePrinters(printers);
    const selected = names.includes(savedPrinter) ? savedPrinter : '';
    select.innerHTML =
      '<option value="">System default printer</option>' +
      names
        .map(
          (name) =>
            `<option value="${optionEsc(name)}" ${name === selected ? 'selected' : ''}>${esc(name)}</option>`
        )
        .join('');
    select.value = selected;
    state.settings = normalizeSettings({ ...state.settings, labelPrinter: selected });
    return selected;
  }

  async function loadPrinters() {
    const savedPrinter = state.settings.labelPrinter;
    renderPrinterOptions([], savedPrinter);
    try {
      const result = await window.posApi?.printing?.listPrinters?.();
      if (!result?.ok) return;
      renderPrinterOptions(result.printers || [], savedPrinter);
    } catch {
      renderPrinterOptions([], '');
    }
  }

  function normalizeLaunchPayload(raw = {}) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const products = (Array.isArray(input.products) ? input.products : [])
      .map((product) => {
        const productId = Number(product?.productId ?? product?.id);
        if (!Number.isInteger(productId) || productId <= 0) return null;
        return {
          productId,
          name: String(product.name || `Product ${productId}`),
          sku: String(product.sku || ''),
          barcode: String(product.barcode || ''),
          salePrice: Number(product.salePrice || 0) || 0,
          stock: Number(product.stock ?? product.currentStock ?? 0) || 0,
          copies: clampNumber(product.copies, 1, 1, 100),
          selected: product.selected !== false,
        };
      })
      .filter(Boolean);
    return {
      mode: input.mode === 'products' ? 'products' : 'inventory',
      products,
    };
  }

  function loadLaunch(storage = window.localStorage) {
    try {
      return normalizeLaunchPayload(JSON.parse(storage.getItem(LAUNCH_KEY) || '{}'));
    } catch {
      return normalizeLaunchPayload();
    }
  }

  function closestLabelSize(settings) {
    const width = Number(settings.labelWidth || 64);
    const height = Number(settings.labelHeight || 34);
    const sizes = [
      ['label_40x20', 40, 20],
      ['label_50x25', 50, 25],
      ['label_60x30', 60, 30],
      ['label_80x40', 80, 40],
      ['standard_70x37', 70, 37],
    ];
    return sizes
      .map(([id, w, h]) => ({ id, distance: Math.abs(width - w) + Math.abs(height - h) }))
      .sort((a, b) => a.distance - b.distance)[0].id;
  }

  function selectedProducts(products = state.products) {
    return products.filter((product) => product.selected && product.copies > 0);
  }

  function normalizeProductSearch(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function productMatchesSearch(product, query) {
    const search = normalizeProductSearch(query);
    if (!search) return true;
    return [product?.name, product?.sku, product?.barcode]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(search));
  }

  function visibleProductEntries(products = state.products, query = state.productSearch) {
    return products
      .map((product, index) => ({ product, index }))
      .filter(({ product }) => productMatchesSearch(product, query));
  }

  function buildPreviewRequest(products = state.products, settings = state.settings) {
    const safeSettings = normalizeSettings(settings);
    const labelSize = closestLabelSize(safeSettings);
    return {
      printer: {
        kind: 'standard_label',
        name: safeSettings.labelPrinter || 'System default printer',
        dpi: 300,
      },
      label: {
        labelSize,
        margins: { top: 1, right: 1, bottom: 1, left: 1 },
        format: 'CODE128',
        humanReadable: safeSettings.showBarcodeDigits,
        priceDisplay: safeSettings.showPrice,
      },
      presentation: {
        showTitle: safeSettings.showTitle,
        showSku: safeSettings.showSku,
        showPrice: safeSettings.showPrice,
        showBarcodeDigits: safeSettings.showBarcodeDigits,
        showPacking: safeSettings.showPacking,
        showExpiry: safeSettings.showExpiry,
        labelTitle: safeSettings.labelTitle,
        packingDate: safeSettings.packingDate,
        expiryDate: safeSettings.expiryDate,
        columns: safeSettings.columns,
        gap: safeSettings.gap,
        labelWidth: safeSettings.labelWidth,
        labelHeight: safeSettings.labelHeight,
        titleSize: safeSettings.titleSize,
        metaSize: safeSettings.metaSize,
        barcodeHeight: safeSettings.barcodeHeight,
        printMargin: safeSettings.printMargin,
      },
      items: selectedProducts(products).map((product) => ({
        productId: product.productId,
        copies: product.copies,
        labelSize,
        humanReadable: safeSettings.showBarcodeDigits,
        priceDisplay: safeSettings.showPrice,
      })),
    };
  }

  function applySettingsToForm(settings) {
    const map = {
      barcodeDesignerPrinter: 'labelPrinter',
      barcodeShowTitle: 'showTitle',
      barcodeShowSku: 'showSku',
      barcodeShowPrice: 'showPrice',
      barcodeShowBarcodeDigits: 'showBarcodeDigits',
      barcodeShowPacking: 'showPacking',
      barcodeShowExpiry: 'showExpiry',
      barcodeLabelTitle: 'labelTitle',
      barcodePackingDate: 'packingDate',
      barcodeExpiryDate: 'expiryDate',
      barcodeTitleSize: 'titleSize',
      barcodeMetaSize: 'metaSize',
      barcodeColumns: 'columns',
      barcodeGap: 'gap',
      barcodeLabelWidth: 'labelWidth',
      barcodeLabelHeight: 'labelHeight',
      barcodeBarcodeHeight: 'barcodeHeight',
      barcodePrintMargin: 'printMargin',
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = Boolean(settings[key]);
      else el.value = settings[key] ?? '';
    });
    updateDateFieldVisibility(settings);
  }

  function readSettingsFromForm() {
    return normalizeSettings({
      labelPrinter: $('barcodeDesignerPrinter')?.value || '',
      showTitle: $('barcodeShowTitle')?.checked === true,
      showSku: $('barcodeShowSku')?.checked === true,
      showPrice: $('barcodeShowPrice')?.checked === true,
      showBarcodeDigits: $('barcodeShowBarcodeDigits')?.checked === true,
      showPacking: $('barcodeShowPacking')?.checked === true,
      showExpiry: $('barcodeShowExpiry')?.checked === true,
      labelTitle: $('barcodeLabelTitle')?.value || '',
      packingDate: $('barcodePackingDate')?.value || '',
      expiryDate: $('barcodeExpiryDate')?.value || '',
      titleSize: $('barcodeTitleSize')?.value,
      metaSize: $('barcodeMetaSize')?.value,
      columns: $('barcodeColumns')?.value,
      gap: $('barcodeGap')?.value,
      labelWidth: $('barcodeLabelWidth')?.value,
      labelHeight: $('barcodeLabelHeight')?.value,
      barcodeHeight: $('barcodeBarcodeHeight')?.value,
      printMargin: $('barcodePrintMargin')?.value,
    });
  }

  function updateDateFieldVisibility(settings) {
    const dateRow = document.querySelector('.epos-barcode-date-pair');
    const dateFields = [
      ['barcodePackingDateField', 'barcodePackingDate', settings.showPacking],
      ['barcodeExpiryDateField', 'barcodeExpiryDate', settings.showExpiry],
    ];
    const hasVisibleDate = dateFields.some(([, , enabled]) => enabled);

    dateRow?.classList.toggle('is-hidden', !hasVisibleDate);
    dateFields.forEach(([fieldId, inputId, enabled]) => {
      const field = $(fieldId);
      const input = $(inputId);
      field?.classList.toggle('is-hidden', !enabled);
      if (input) input.disabled = !enabled;
    });
  }

  function renderProductRow(product, index) {
    return `
        <label class="epos-barcode-product-row">
          <input type="checkbox" data-product-selected="${index}" ${product.selected ? 'checked' : ''} />
          <span class="epos-barcode-product-details">
            <strong>${esc(product.name)}</strong>
            <small>${esc(product.sku || product.barcode || 'No code')} - Stock ${Number(product.stock || 0).toFixed(0)}</small>
          </span>
          <span class="epos-barcode-copy-stepper" aria-label="Copies for ${esc(product.name)}">
            <button type="button" data-product-copy-step="${index}:-1" aria-label="Decrease copies for ${esc(product.name)}">-</button>
            <input class="epos-barcode-copies" type="number" min="1" max="100" value="${product.copies}" data-product-copies="${index}" aria-label="Copies for ${esc(product.name)}" />
            <button type="button" data-product-copy-step="${index}:1" aria-label="Increase copies for ${esc(product.name)}">+</button>
          </span>
        </label>`;
  }

  function renderProductList(options = {}) {
    const section = $('barcodeDesignerProductsSection');
    if (section) section.hidden = false;
    const list = $('barcodeDesignerProductList');
    if (!list) return;
    const entries = visibleProductEntries();
    list.innerHTML = entries.length
      ? entries.map(({ product, index }) => renderProductRow(product, index)).join('')
      : '<p class="epos-barcode-empty">No matching products.</p>';
    if (options.resetScroll) list.scrollTop = 0;
  }

  function readCopiesValue(value) {
    if (String(value ?? '').trim() === '') return null;
    const copies = Number(value);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100) return null;
    return copies;
  }

  function rejectCopiesInput() {
    state.lastPreview = null;
    setMessage('Copies must be a whole number from 1 to 100.', true);
    renderPreviewError('Copies must be a whole number from 1 to 100.');
  }

  function monthName(month) {
    const names = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return names[Math.max(0, Math.min(11, Number(month) - 1))] || 'Jan';
  }

  function formatDate(value) {
    if (!value) return '';
    const parts = String(value).split('-');
    if (parts.length === 3) return `${parts[2]}-${monthName(parts[1])}-${parts[0]}`;
    return String(value);
  }

  function priceText(product) {
    return `PKR ${Number(product.salePrice || 0).toFixed(2)}`;
  }

  function barcodeBarsHtml(encoded) {
    const runs = Array.isArray(encoded?.runs) ? encoded.runs.slice(0, 180) : [];
    if (!runs.length) return '<span class="bar" style="--bar-run:1"></span>';
    return runs
      .map(
        (run, index) =>
          `<span class="${index % 2 === 0 ? 'bar' : ''}" style="--bar-run:${Math.max(1, Number(run) || 1)}"></span>`
      )
      .join('');
  }

  function finiteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function positiveNumber(value) {
    return finiteNumber(value) && Number(value) > 0;
  }

  function nonNegativeNumber(value) {
    return finiteNumber(value) && Number(value) >= 0;
  }

  function validMargin(margin) {
    return (
      margin &&
      nonNegativeNumber(margin.top) &&
      nonNegativeNumber(margin.right) &&
      nonNegativeNumber(margin.bottom) &&
      nonNegativeNumber(margin.left)
    );
  }

  function validBounds(bounds) {
    return (
      bounds &&
      nonNegativeNumber(bounds.xMm) &&
      nonNegativeNumber(bounds.yMm) &&
      positiveNumber(bounds.widthMm) &&
      positiveNumber(bounds.heightMm)
    );
  }

  function mmToPreviewPx(value) {
    return `${Number(value) * PREVIEW_MM_TO_PX}px`;
  }

  function readResolvedPreview(response) {
    const layout = response?.preview?.resolvedLayout;
    if (
      layout?.kind !== 'barcode_resolved_preview_layout' ||
      layout.schemaVersion !== 1 ||
      layout.executable !== false ||
      layout.immutable !== true ||
      layout.representation !== 'plain_data' ||
      !layout.presentation ||
      !validMargin(layout.presentation.marginMm) ||
      !Array.isArray(layout.pages)
    ) {
      return null;
    }

    const pages = [];
    let itemCount = 0;
    for (const page of layout.pages) {
      if (
        !page ||
        !positiveNumber(page.widthMm) ||
        !positiveNumber(page.heightMm) ||
        !Array.isArray(page.items)
      ) {
        return null;
      }
      const items = [];
      for (const item of page.items) {
        if (!item || !item.label || !validBounds(item.placement?.boundsMm)) return null;
        items.push(item);
        itemCount += 1;
      }
      pages.push({ ...page, items });
    }
    return { layout, pages, itemCount };
  }

  function renderLabelContent(label, settings) {
    const product = label.product || {};
    const barcode = label.barcode || {};
    const title = settings.labelTitle || product.name || 'Product';
    const dates = [];
    if (settings.showPacking) dates.push(`Pack: ${formatDate(settings.packingDate)}`);
    if (settings.showExpiry) dates.push(`Exp: ${formatDate(settings.expiryDate)}`);
    return `
        ${settings.showTitle ? `<strong class="epos-barcode-label-title">${esc(title)}</strong>` : ''}
        ${settings.showSku ? `<span class="epos-barcode-label-meta">${esc(product.sku || '')}</span>` : ''}
        <div class="epos-barcode-bars" aria-hidden="true">${barcodeBarsHtml(barcode.encoded)}</div>
        ${settings.showBarcodeDigits ? `<span class="epos-barcode-label-digits">${esc(barcode.value || product.barcode || '')}</span>` : ''}
        ${settings.showPrice ? `<span class="epos-barcode-label-price">${esc(priceText(product))}</span>` : ''}
        ${dates.length ? `<span class="epos-barcode-label-dates">${dates.map((date) => `<span>${esc(date)}</span>`).join('')}</span>` : ''}`;
  }

  function renderPlacedLabel(item, settings) {
    const bounds = item.placement.boundsMm;
    return `<article class="epos-barcode-label" data-layout-index="${Number(item.index)}" style="left:${mmToPreviewPx(bounds.xMm)};top:${mmToPreviewPx(bounds.yMm)};width:${mmToPreviewPx(bounds.widthMm)};height:${mmToPreviewPx(bounds.heightMm)};--barcode-title-size:${settings.titleSize}px;--barcode-meta-size:${settings.metaSize}px;--barcode-bar-height:${mmToPreviewPx(settings.barcodeHeightMm)};">${renderLabelContent(item.label, settings)}</article>`;
  }

  function renderPreviewPage(page, settings) {
    const margin = settings.marginMm;
    const items = page.items.map((item) => renderPlacedLabel(item, settings)).join('');
    return `<section class="epos-barcode-preview-page" data-page-index="${Number(page.pageIndex ?? 0)}" style="width:${mmToPreviewPx(page.widthMm)};height:${mmToPreviewPx(page.heightMm)};--barcode-page-margin-top:${mmToPreviewPx(margin.top)};--barcode-page-margin-right:${mmToPreviewPx(margin.right)};--barcode-page-margin-bottom:${mmToPreviewPx(margin.bottom)};--barcode-page-margin-left:${mmToPreviewPx(margin.left)};">${items}</section>`;
  }

  function renderEmptyPreview(message = 'No printable labels selected.') {
    const preview = $('barcodeDesignerPreview');
    if (!preview) return;
    const count = $('barcodeDesignerCount');
    if (count) count.textContent = '0 printable labels selected.';
    preview.innerHTML = `<p class="epos-barcode-empty">${esc(message)}</p>`;
  }

  function renderPreviewError(
    message = 'Preview layout is unavailable. Generate the preview again.'
  ) {
    const preview = $('barcodeDesignerPreview');
    if (!preview) return;
    const count = $('barcodeDesignerCount');
    if (count) count.textContent = '0 printable labels selected.';
    preview.innerHTML = `<p class="epos-barcode-empty">${esc(message)}</p>`;
  }

  function renderPreview(response) {
    const preview = $('barcodeDesignerPreview');
    if (!preview) return false;
    const resolved = readResolvedPreview(response);
    if (!resolved) {
      renderPreviewError();
      return false;
    }
    const { layout, pages, itemCount } = resolved;
    const settings = layout.presentation;
    const outputCount = Number.isFinite(layout.itemCount) ? layout.itemCount : itemCount;
    const count = $('barcodeDesignerCount');
    if (count)
      count.textContent = `${outputCount} printable label${outputCount === 1 ? '' : 's'} selected.`;

    if (!itemCount) {
      renderEmptyPreview();
      return true;
    }
    preview.innerHTML = pages.map((page) => renderPreviewPage(page, settings)).join('');
    return true;
  }

  function setMessage(text, isError) {
    const el = $('barcodeDesignerMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(requestPreview, 180);
  }

  async function requestPreview() {
    state.settings = readSettingsFromForm();
    updateDateFieldVisibility(state.settings);
    const request = buildPreviewRequest();
    if (!request.items.length) {
      state.lastPreview = null;
      renderEmptyPreview();
      return;
    }
    const seq = ++state.previewSeq;
    try {
      const result = await window.posApi?.barcodes?.requestPreview?.(request);
      if (seq !== state.previewSeq) return;
      if (!result?.ok) {
        state.lastPreview = null;
        setMessage(result?.message || 'Unable to generate barcode preview.', true);
        renderEmptyPreview();
        return;
      }
      const resolved = readResolvedPreview(result);
      if (!resolved) {
        state.lastPreview = null;
        setMessage('Preview layout is unavailable. Generate the preview again.', true);
        renderPreviewError();
        return;
      }
      state.lastPreview = result;
      setMessage('');
      renderPreview(result);
    } catch {
      if (seq !== state.previewSeq) return;
      state.lastPreview = null;
      setMessage('Unable to generate barcode preview.', true);
      renderPreviewError();
    }
  }

  function handleProductInput(event) {
    const selectedIndex = event.target?.dataset?.productSelected;
    const copiesIndex = event.target?.dataset?.productCopies;
    if (selectedIndex != null) {
      const index = Number(selectedIndex);
      state.products[index] = { ...state.products[index], selected: event.target.checked };
    }
    if (copiesIndex != null) {
      const index = Number(copiesIndex);
      const copies = readCopiesValue(event.target.value);
      if (!copies || !state.products[index]) {
        rejectCopiesInput(event.target);
        return;
      }
      state.products[index] = { ...state.products[index], copies };
    }
    schedulePreview();
  }

  function handleCopyStep(event) {
    const stepValue = event.target?.dataset?.productCopyStep;
    if (!stepValue) return;
    const [indexValue, directionValue] = stepValue.split(':');
    const index = Number(indexValue);
    const direction = Number(directionValue);
    if (!Number.isInteger(index) || !Number.isInteger(direction) || !state.products[index]) return;
    const nextCopies = clampNumber(Number(state.products[index].copies) + direction, 1, 1, 100);
    state.products[index] = { ...state.products[index], copies: nextCopies, selected: true };
    const input = document.querySelector(`[data-product-copies="${index}"]`);
    if (input) input.value = String(nextCopies);
    schedulePreview();
  }

  function handleProductSearch(event) {
    state.productSearch = String(event.target?.value || '');
    renderProductList({ resetScroll: true });
  }

  function updateVisibleSelection(selected) {
    const visibleIndexes = new Set(visibleProductEntries().map(({ index }) => index));
    if (!visibleIndexes.size) return;
    state.products = state.products.map((product, index) =>
      visibleIndexes.has(index) ? { ...product, selected } : product
    );
    renderProductList();
    schedulePreview();
  }

  function bindEvents() {
    document
      .querySelectorAll('input:not([data-product-copies]):not([data-product-search]), select')
      .forEach((el) => {
        el.addEventListener('input', schedulePreview);
        el.addEventListener('change', schedulePreview);
      });
    $('barcodeDesignerProductSearch')?.addEventListener('input', handleProductSearch);
    $('barcodeDesignerProductList')?.addEventListener('input', handleProductInput);
    $('barcodeDesignerProductList')?.addEventListener('change', handleProductInput);
    $('barcodeDesignerProductList')?.addEventListener('click', handleCopyStep);
    $('barcodeDesignerSelectAll')?.addEventListener('click', () => {
      updateVisibleSelection(true);
    });
    $('barcodeDesignerClear')?.addEventListener('click', () => {
      updateVisibleSelection(false);
    });
    $('barcodeDesignerReset')?.addEventListener('click', () => {
      state.settings = normalizeSettings();
      applySettingsToForm(state.settings);
      schedulePreview();
      setMessage('Designer settings reset.');
    });
    $('barcodeDesignerSave')?.addEventListener('click', () => {
      state.settings = saveSettings(readSettingsFromForm());
      setMessage('Designer settings saved.');
      schedulePreview();
    });
    ['barcodeDesignerPrint', 'barcodeDesignerPrintTop'].forEach((id) => {
      $(id)?.addEventListener('click', async () => {
        if (state.printPending) {
          setMessage('Barcode printing is already in progress for this preview.', true);
          return;
        }
        const sessionId = state.lastPreview?.previewSession?.sessionId;
        if (!sessionId) {
          setMessage('Generate a valid barcode preview before printing.', true);
          return;
        }
        state.printPending = true;
        try {
          const result = await window.posApi?.barcodes?.printPreview?.({
            sessionId,
            printerName: readSettingsFromForm().labelPrinter || '',
          });
          if (!result?.ok) {
            setMessage(
              result?.message || result?.error?.message || 'Barcode printing failed.',
              true
            );
            return;
          }
          setMessage(result.message || 'Barcode labels sent to printer.');
        } catch {
          setMessage('Barcode printing failed.', true);
        } finally {
          state.printPending = false;
        }
      });
    });
  }

  function init() {
    document.title = 'Barcode Label Preview';
    state.launch = loadLaunch();
    state.products = state.launch.products;
    state.settings = loadSettings();
    applySettingsToForm(state.settings);
    renderProductList();
    bindEvents();
    void loadPrinters().then(() => schedulePreview());
    requestPreview();
  }

  if (typeof window !== 'undefined') {
    window.BarcodeDesignerTestHooks = Object.freeze({
      SETTINGS_KEY,
      LAUNCH_KEY,
      buildPreviewRequest,
      closestLabelSize,
      loadPrinters,
      normalizePrinters,
      normalizeLaunchPayload,
      normalizeSettings,
      normalizeProductSearch,
      productMatchesSearch,
      visibleProductEntries,
      readResolvedPreview,
      renderPreview,
      renderProductList,
      renderPrinterOptions,
      readCopiesValue,
      saveSettings,
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', init);
    }
  }
})();
