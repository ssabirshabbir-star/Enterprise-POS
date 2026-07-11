const { BrowserWindow } = require('electron');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateResolvedPreviewLayout } = require('./preview-layout.model');
const { validatePreviewSession } = require('./preview-session.model');

function createBarcodePreviewPrintAdapter(dependencies = {}) {
  const BrowserWindowImpl = dependencies.BrowserWindow || BrowserWindow;
  const getPrinters =
    dependencies.getPrinters ||
    (async () => {
      const win = BrowserWindowImpl.getAllWindows()[0];
      return win?.webContents?.getPrintersAsync ? win.webContents.getPrintersAsync() : [];
    });

  async function printPreviewSession(session, options = {}) {
    const validSession = validatePreviewSession(session);
    const printerName = normalizePrinterName(options.printerName);
    await validatePrinterSelection(printerName);

    const html = buildPreviewPrintHtml(validSession.preview);
    const printWindow = new BrowserWindowImpl({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      if (printWindow.isDestroyed?.()) {
        throw new BarcodeDomainError(
          BARCODE_ERROR_CODES.INVALID_EXECUTION,
          'Barcode print window was destroyed before printing.',
          'printWindow'
        );
      }

      const result = await new Promise((resolve) => {
        let settled = false;
        const finish = (success, failureReason) => {
          if (settled) return;
          settled = true;
          resolve({ success, failureReason });
        };
        if (!printWindow.webContents?.print) {
          finish(false, 'Barcode print window is not available.');
          return;
        }
        printWindow.webContents.print(
          {
            silent: false,
            deviceName: printerName || undefined,
            printBackground: true,
            margins: { marginType: 'none' },
          },
          finish
        );
      });

      if (!result.success) {
        return {
          ok: false,
          canceled: isCancelReason(result.failureReason),
          message: isCancelReason(result.failureReason)
            ? 'Barcode printing was cancelled.'
            : result.failureReason || 'Barcode printing failed.',
        };
      }

      return {
        ok: true,
        message: 'Barcode labels sent to printer.',
      };
    } finally {
      if (!printWindow.isDestroyed?.()) printWindow.close();
    }
  }

  async function validatePrinterSelection(printerName) {
    const printers = await getPrinters();
    if (!Array.isArray(printers) || printers.length === 0) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PRINTER,
        'No printers are installed or available.',
        'printerName'
      );
    }
    if (!printerName) return;

    const exists = printers.some((printer) => printerDisplayName(printer) === printerName);
    if (!exists) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PRINTER,
        'Selected barcode printer is no longer available.',
        'printerName'
      );
    }
  }

  return Object.freeze({
    printPreviewSession,
  });
}

function normalizePrinterName(value) {
  const text = String(value || '').trim();
  return text === 'System default printer' ? '' : text;
}

function printerDisplayName(printer) {
  return String(printer?.name || printer?.displayName || printer || '').trim();
}

function buildPreviewPrintHtml(preview) {
  if (
    !preview ||
    preview.kind !== 'barcode_preview_document' ||
    preview.executable !== false ||
    !Array.isArray(preview.pages)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'A valid barcode preview document is required for printing.',
      'preview'
    );
  }

  const layout = validateResolvedPreviewLayout(preview.resolvedLayout);
  const pages = layout.pages.map(normalizePrintPage).filter((page) => page.items.length);
  if (!pages.length) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview contains no printable labels.',
      'preview'
    );
  }

  const presentation = layout.presentation;
  const pageHtml = pages.map((page) => renderPage(page, presentation)).join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      @page { margin: 0; }
      body { margin: 0; background: #fff; color: #0f172a; font-family: Arial, sans-serif; }
      .page { position: relative; page-break-after: always; break-after: page; overflow: hidden; background: #fff; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .label { position: absolute; border: var(--label-border, 0.25mm dashed #94a3b8); padding: var(--label-padding, 1mm); text-align: center; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
      .title { display: block; font-size: var(--title-size, 11px); font-weight: 800; margin-bottom: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .meta, .digits, .date { display: block; color: #334155; font-size: var(--meta-size, 9px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bars { display: flex; justify-content: center; align-items: stretch; gap: 0; height: var(--barcode-height, 8mm); margin: 1mm auto 0.5mm; max-width: 100%; overflow: hidden; }
      .bar { display: inline-block; width: calc(var(--bar-run, 1) * 1px); background: #000; }
      .space { display: inline-block; width: calc(var(--bar-run, 1) * 1px); }
      .price { display: block; color: #008a52; font-size: var(--meta-size, 9px); font-weight: 800; margin-top: 0.5mm; }
      .dates { display: flex; justify-content: space-between; gap: 1mm; margin-top: 0.8mm; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>${pageHtml}</body>
</html>`;
}

function normalizePrintPage(page) {
  return {
    widthMm: positiveNumber(page.widthMm),
    heightMm: positiveNumber(page.heightMm),
    items: (Array.isArray(page.items) ? page.items : []).map((item) => ({
      placement: item.placement || {},
      label: item.label || {},
    })),
  };
}

function renderPage(page, presentation) {
  const items = page.items
    .map((item) => renderPlacedLabel(item.label, item.placement, presentation))
    .join('');
  return `<section class="page" style="width:${page.widthMm}mm;height:${page.heightMm}mm;">${items}</section>`;
}

function renderPlacedLabel(label, placement, presentation) {
  const bounds = normalizeBounds(placement.boundsMm);
  const margin = presentation.marginMm?.top ?? 0;
  const border = presentation.border === false ? '0' : '0.25mm dashed #94a3b8';
  return `<article class="label" style="left:${bounds.xMm}mm;top:${bounds.yMm}mm;width:${bounds.widthMm}mm;height:${bounds.heightMm}mm;--title-size:${presentation.titleSize}px;--meta-size:${presentation.metaSize}px;--barcode-height:${presentation.barcodeHeightMm}mm;--label-padding:${margin / 4}mm;--label-border:${border};">${renderLabel(label, presentation)}</article>`;
}

function normalizeBounds(bounds) {
  return {
    xMm: nonNegativeNumber(bounds?.xMm),
    yMm: nonNegativeNumber(bounds?.yMm),
    widthMm: positiveNumber(bounds?.widthMm),
    heightMm: positiveNumber(bounds?.heightMm),
  };
}

function renderLabel(label, presentation) {
  const product = label.product || {};
  const barcode = label.barcode || {};
  const encoded = barcode.encoded || {};
  const text = textMap(label.text);
  const title = presentation.labelTitle || text.product_name || product.name || 'Product';
  const dates = [];
  if (presentation.showPacking) dates.push(['Pack:', presentation.packingDate]);
  if (presentation.showExpiry) dates.push(['Exp:', presentation.expiryDate]);
  return `
    ${presentation.showTitle ? `<strong class="title">${escapeHtml(title)}</strong>` : ''}
    ${presentation.showSku ? `<span class="meta">${escapeHtml(text.sku || product.sku || '')}</span>` : ''}
    <div class="bars" aria-hidden="true">${barsHtml(encoded)}</div>
    ${presentation.showBarcodeDigits ? `<span class="digits">${escapeHtml(text.barcode_value || barcode.value || product.barcode || '')}</span>` : ''}
    ${presentation.showPrice ? `<span class="price">${escapeHtml(text.price || priceText(product))}</span>` : ''}
    ${dates.length ? `<span class="dates">${dates.map(([labelText, value]) => `<span class="date">${escapeHtml(labelText)} ${escapeHtml(formatDate(value))}</span>`).join('')}</span>` : ''}`;
}

function textMap(lines) {
  const output = {};
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    if (!line || line.representation !== 'plain_text') return;
    output[line.role] = String(line.value || '');
  });
  return output;
}

function priceText(product) {
  return `${String(product.currency || 'PKR')} ${Number(product.salePrice || 0).toFixed(2)}`;
}

function formatDate(value) {
  const parts = String(value || '').split('-');
  if (parts.length === 3) return `${parts[2]}-${monthName(parts[1])}-${parts[0]}`;
  return String(value || '');
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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : 1;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : 0;
}

function barsHtml(encoded) {
  const runs = Array.isArray(encoded.runs) ? encoded.runs.slice(0, 180) : [];
  if (!runs.length) return '<span class="bar" style="--bar-run:1"></span>';
  return runs
    .map((run, index) => {
      const size = Math.max(1, Number(run) || 1);
      return `<span class="${index % 2 === 0 ? 'bar' : 'space'}" style="--bar-run:${size}"></span>`;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isCancelReason(reason) {
  return /cancel/i.test(String(reason || ''));
}

module.exports = {
  buildPreviewPrintHtml,
  createBarcodePreviewPrintAdapter,
};
