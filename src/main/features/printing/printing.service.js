const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { BrowserWindow, nativeImage } = require('electron');
const printingRepository = require('./printing.repository');
const LOGO_RECEIPT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const LOGO_RECEIPT_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ESC_POS_MIN_DIMENSION = 64;
const LOGO_ESC_POS_MAX_DIMENSION = 3000;
const LOGO_ESC_POS_MAX_BYTES = 2 * 1024 * 1024;
const ESC_POS_LOGO_MAX_WIDTH_DOTS = 240;
const ESC_POS_LOGO_MAX_HEIGHT_DOTS = 160;
const ESC_POS_TINY_LOGO_MAX_UPSCALE = 2;
const RECEIPT_PRINT_READY_TIMEOUT_MS = 2500;
const RECEIPT_PRINT_CALLBACK_TIMEOUT_MS = 30000;
const HTML_LOGO_MAX_WIDTH_PX = 150;
const HTML_LOGO_MAX_HEIGHT_PX = 90;

const RECEIPT_PAPER_PROFILES = Object.freeze({
  '58mm': Object.freeze({
    paperWidth: '58mm',
    pageWidthMm: 58,
    printableInsetMm: 3,
    receiptColumns: 32,
    fontSizePx: 11,
    printableDots: 384,
  }),
  '80mm': Object.freeze({
    paperWidth: '80mm',
    pageWidthMm: 80,
    printableInsetMm: 4,
    receiptWidthMm: 69,
    receiptColumns: 48,
    fontSizePx: 12,
    printableDots: 576,
  }),
  A4: Object.freeze({
    paperWidth: 'A4',
    pageWidthMm: 210,
    printableInsetMm: 8,
    receiptColumns: 72,
    fontSizePx: 12,
    printableDots: 576,
  }),
});

function receiptPaperProfile(paperWidth) {
  return RECEIPT_PAPER_PROFILES[paperWidth] || RECEIPT_PAPER_PROFILES['80mm'];
}

function line(width, char = '-') {
  return char.repeat(width);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanReceiptFooterText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function receiptFooterLines(value) {
  const footer = cleanReceiptFooterText(value);
  if (!footer) return [];
  return footer.split('\n');
}

function buildReceiptFooterHtml(value) {
  const lines = receiptFooterLines(value);
  if (!lines.length) return '';
  const markup = lines
    .map((line) => `<span class="footer-line">${line ? escapeHtml(line) : '&nbsp;'}</span>`)
    .join('');
  return `<div class="rule"></div><div class="footer">${markup}</div>`;
}

function validateReceiptLogoPath(logoPath) {
  const normalizedPath = cleanText(logoPath);
  if (!normalizedPath) return { ok: false, reason: 'empty' };
  try {
    const ext = path.extname(normalizedPath).toLowerCase();
    if (!LOGO_RECEIPT_EXTENSIONS.has(ext)) return { ok: false, reason: 'unsupported_type' };
    if (!fsSync.existsSync(normalizedPath)) return { ok: false, reason: 'missing' };
    const stat = fsSync.statSync(normalizedPath);
    if (!stat.isFile()) return { ok: false, reason: 'not_file' };
    if (stat.size <= 0) return { ok: false, reason: 'empty_file' };
    if (stat.size > LOGO_ESC_POS_MAX_BYTES) return { ok: false, reason: 'oversized_file' };
    const buffer = fsSync.readFileSync(normalizedPath, { encoding: null });
    const header = buffer.subarray(0, 24);
    const isPng =
      ext === '.png' &&
      header.length >= 24 &&
      header.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
      header.subarray(12, 16).toString('ascii') === 'IHDR';
    const isJpeg =
      (ext === '.jpg' || ext === '.jpeg') &&
      header.length >= 3 &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff;
    if (!isPng && !isJpeg) return { ok: false, reason: 'invalid_signature' };
    return { ok: true, path: normalizedPath, ext, size: stat.size };
  } catch (_error) {
    return { ok: false, reason: 'unreadable' };
  }
}

function logoMimeType(ext) {
  return ext === '.png' ? 'image/png' : 'image/jpeg';
}

function imageContentBounds(bitmap, width, height) {
  if (!Buffer.isBuffer(bitmap) || width <= 0 || height <= 0) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const blue = bitmap[offset] || 0;
      const green = bitmap[offset + 1] || 0;
      const red = bitmap[offset + 2] || 0;
      const alpha = bitmap[offset + 3] ?? 255;
      const isContent = alpha > 12 && (red < 242 || green < 242 || blue < 242);
      if (isContent) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const padding = 2;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  return {
    x,
    y,
    width: Math.min(width - x, maxX - minX + 1 + padding * 2),
    height: Math.min(height - y, maxY - minY + 1 + padding * 2),
  };
}

function optimizedLogoDataUrl(image, fallbackBuffer, mime) {
  try {
    let workingImage = image;
    const size = workingImage.getSize();
    if (typeof workingImage.toBitmap === 'function' && typeof workingImage.crop === 'function') {
      const bitmap = workingImage.toBitmap();
      const bounds = imageContentBounds(bitmap, size.width, size.height);
      if (
        bounds &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        (bounds.width < size.width || bounds.height < size.height)
      ) {
        workingImage = workingImage.crop(bounds);
      }
    }
    const croppedSize = workingImage.getSize();
    const scale = Math.min(
      HTML_LOGO_MAX_WIDTH_PX / croppedSize.width,
      HTML_LOGO_MAX_HEIGHT_PX / croppedSize.height,
      croppedSize.width < HTML_LOGO_MAX_WIDTH_PX ? 1.35 : 1
    );
    const targetWidth = Math.max(1, Math.round(croppedSize.width * scale));
    const targetHeight = Math.max(1, Math.round(croppedSize.height * scale));
    if (typeof workingImage.resize === 'function') {
      workingImage = workingImage.resize({
        width: targetWidth,
        height: targetHeight,
        quality: 'best',
      });
    }
    if (workingImage && !workingImage.isEmpty() && typeof workingImage.toDataURL === 'function') {
      return workingImage.toDataURL();
    }
  } catch (_error) {
    // Fall back to the validated source bytes. Logo optimization must never block printing.
  }
  return `data:${mime};base64,${fallbackBuffer.toString('base64')}`;
}

function safeLogoDataUrl(logoPath) {
  const logo = validateReceiptLogoPath(logoPath);
  if (!logo.ok || logo.size > LOGO_RECEIPT_MAX_BYTES) return '';
  try {
    const image = nativeImage.createFromPath(logo.path);
    if (!image || image.isEmpty()) return '';
    const size = image.getSize();
    const smallest = Math.min(size.width, size.height);
    const largest = Math.max(size.width, size.height);
    if (
      !Number.isFinite(smallest) ||
      !Number.isFinite(largest) ||
      smallest < LOGO_ESC_POS_MIN_DIMENSION ||
      largest > LOGO_ESC_POS_MAX_DIMENSION
    ) {
      return '';
    }
    const buffer = fsSync.readFileSync(logo.path, { encoding: null });
    return optimizedLogoDataUrl(image, buffer, logoMimeType(logo.ext));
  } catch (_error) {
    return '';
  }
}

function logoTargetSize(sourceSize, printableDots) {
  const sourceWidth = Math.max(1, Number(sourceSize.width || 0));
  const sourceHeight = Math.max(1, Number(sourceSize.height || 0));
  const maxWidth = Math.min(ESC_POS_LOGO_MAX_WIDTH_DOTS, Math.max(64, printableDots - 32));
  const maxHeight = ESC_POS_LOGO_MAX_HEIGHT_DOTS;
  const scale = Math.min(
    maxWidth / sourceWidth,
    maxHeight / sourceHeight,
    sourceWidth < maxWidth ? ESC_POS_TINY_LOGO_MAX_UPSCALE : 1
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function escPosRasterCommandFromBitmap(bitmap, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const raster = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const blue = bitmap[offset] || 0;
      const green = bitmap[offset + 1] || 0;
      const red = bitmap[offset + 2] || 0;
      const alpha = bitmap[offset + 3] ?? 255;
      const luminance = alpha === 0 ? 255 : red * 0.299 + green * 0.587 + blue * 0.114;
      if (luminance < 176) {
        raster[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]),
    raster,
  ]);
}

function buildEscPosLogoCommand(settings = {}) {
  const logo = validateReceiptLogoPath(settings.logoPath);
  if (!logo.ok) return null;
  try {
    const sourceImage = nativeImage.createFromPath(logo.path);
    if (!sourceImage || sourceImage.isEmpty()) return null;
    const sourceSize = sourceImage.getSize();
    const smallest = Math.min(sourceSize.width, sourceSize.height);
    const largest = Math.max(sourceSize.width, sourceSize.height);
    if (
      smallest < LOGO_ESC_POS_MIN_DIMENSION ||
      largest > LOGO_ESC_POS_MAX_DIMENSION ||
      !Number.isFinite(smallest) ||
      !Number.isFinite(largest)
    ) {
      return null;
    }
    const profile = receiptPaperProfile(settings.paperWidth);
    const target = logoTargetSize(sourceSize, profile.printableDots || 576);
    const resized = sourceImage.resize({
      width: target.width,
      height: target.height,
      quality: 'best',
    });
    if (!resized || resized.isEmpty()) return null;
    const bitmap = resized.toBitmap();
    if (!Buffer.isBuffer(bitmap) || bitmap.length < target.width * target.height * 4) return null;
    return {
      command: Buffer.concat([
        Buffer.from([0x1b, 0x61, 0x01]),
        escPosRasterCommandFromBitmap(bitmap, target.width, target.height),
        Buffer.from([0x0a, 0x1b, 0x61, 0x00]),
      ]),
      width: target.width,
      height: target.height,
      printableDots: profile.printableDots || 576,
    };
  } catch (_error) {
    return null;
  }
}

function formatQuantity(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDateTimeParts(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    date: safeDate.toLocaleDateString(),
    time: safeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    full: safeDate.toLocaleString(),
  };
}

function receiptWidth(paperWidth) {
  return receiptPaperProfile(paperWidth).receiptColumns;
}

async function getPrinterSettings() {
  const row = await printingRepository.getPrinterSettingsRow();
  const store =
    typeof printingRepository.getStoreSettingsRow === 'function'
      ? await printingRepository.getStoreSettingsRow()
      : {};
  return {
    printerName: row.printer_name || '',
    paperWidth: row.paper_width || '80mm',
    autoPrint: Boolean(row.auto_print),
    silentPrint: Boolean(row.silent_print),
    receiptCopies: Number(row.receipt_copies || 1),
    footerText: row.footer_text || 'Thank you for shopping',
    receiptFooterText: cleanReceiptFooterText(store.receiptFooterText),
    businessName: cleanText(store.storeName),
    businessDescription: cleanText(store.businessDescription),
    storeAddress: cleanText(store.address),
    storePhone: cleanText(store.phone),
    storeEmail: cleanText(store.email),
    storeTaxNumber: cleanText(store.taxNumber),
    logoPath: cleanText(store.logoPath),
  };
}

async function savePrinterSettings(settings = {}) {
  const paperWidth = receiptPaperProfile(settings.paperWidth).paperWidth;
  return printingRepository.savePrinterSettingsRow({
    printerName: String(settings.printerName || '').trim() || null,
    paperWidth,
    silentPrint: Boolean(settings.silentPrint),
    footerText: String(settings.footerText || 'Thank you for shopping').trim(),
    autoPrint: Boolean(settings.autoPrint),
    receiptCopies: Math.max(1, Math.min(5, Number(settings.receiptCopies || 1))),
  });
}

function buildEscPosReceipt(receipt, settings) {
  const width = receiptWidth(settings.paperWidth);
  const businessName = cleanText(settings.businessName || settings.storeName) || 'Enterprise POS';
  const businessDescription = cleanText(settings.businessDescription);
  const logoCommand = buildEscPosLogoCommand(settings);
  const rows = [Buffer.from([0x1b, 0x40])];
  if (logoCommand) rows.push(logoCommand.command);
  rows.push('\x1ba\x01', businessName);
  if (businessDescription) rows.push(businessDescription);
  rows.push('Retail Receipt', '\x1ba\x00', line(width));
  if (settings.storeAddress) rows.push(`Address: ${settings.storeAddress}`);
  if (settings.storePhone) rows.push(`Phone: ${settings.storePhone}`);
  if (settings.storeEmail) rows.push(`Email: ${settings.storeEmail}`);
  if (settings.storeTaxNumber) rows.push(`Tax No.: ${settings.storeTaxNumber}`);
  if (rows[rows.length - 1] !== line(width)) rows.push(line(width));
  rows.push(
    `Invoice: ${receipt.invoiceNumber}`,
    `Date: ${new Date(receipt.createdAt).toLocaleString()}`,
    `Cashier: ${receipt.cashierName || '-'}`,
    `Customer: ${receipt.customerName || 'Walk-in Customer'}`,
    line(width)
  );

  for (const item of receipt.items || []) {
    rows.push(item.productName);
    rows.push(
      `${item.quantity} x ${formatMoney(item.unitPrice)}  Disc ${formatMoney(item.discount)}  ${formatMoney(item.total)}`
    );
  }

  rows.push(line(width));
  rows.push(`Subtotal: ${formatMoney(receipt.subtotal)}`);
  rows.push(`Discount: ${formatMoney(receipt.discount)}`);
  rows.push(`Tax: ${formatMoney(receipt.tax)}`);
  rows.push(`Total: ${formatMoney(receipt.grandTotal)}`);
  rows.push(`Paid: ${formatMoney(receipt.paidAmount)}`);
  rows.push(`Change: ${formatMoney(receipt.changeAmount)}`);
  const footerLines = receiptFooterLines(settings.receiptFooterText);
  if (footerLines.length) {
    rows.push(line(width));
    rows.push('\x1ba\x01');
    rows.push(...footerLines);
  }
  rows.push('\n\n\n\x1dV\x00');
  return Buffer.concat(
    rows.map((row) => (Buffer.isBuffer(row) ? row : Buffer.from(`${String(row)}\n`, 'latin1')))
  );
}

function buildReceiptHtml(receipt, settings) {
  const paperProfile = receiptPaperProfile(settings.paperWidth);
  const receiptWidthMm =
    paperProfile.receiptWidthMm || paperProfile.pageWidthMm - paperProfile.printableInsetMm * 2;
  const dateParts = formatDateTimeParts(receipt.createdAt);
  const hasLineDiscount = (receipt.items || []).some((item) => Number(item.discount || 0) > 0);
  const businessName = escapeHtml(settings.businessName || settings.storeName || 'Enterprise POS');
  const businessDescription = cleanText(settings.businessDescription);
  const logoSrc = safeLogoDataUrl(settings.logoPath);
  const footerHtml = buildReceiptFooterHtml(settings.receiptFooterText);
  const contactRows = [
    settings.storeAddress ? ['Address', settings.storeAddress] : null,
    settings.storePhone ? ['Phone', settings.storePhone] : null,
    settings.storeEmail ? ['Email', settings.storeEmail] : null,
    settings.storeTaxNumber ? ['Tax No.', settings.storeTaxNumber] : null,
  ]
    .filter(Boolean)
    .map(
      ([label, value]) =>
        `<div class="brand-contact-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join('');
  const rows = (receipt.items || [])
    .map(
      (item) => `
    <div class="item-row">
      <div class="item-line">
        <div class="item-name">${escapeHtml(item.productName || 'Item')}</div>
        <span>${formatQuantity(item.quantity)}</span>
        <span>${formatMoney(item.unitPrice)}</span>
        <span>${formatMoney(item.total)}</span>
      </div>
      ${
        hasLineDiscount && Number(item.discount || 0) > 0
          ? `<div class="item-discount">Discount ${formatMoney(item.discount)}</div>`
          : ''
      }
    </div>
  `
    )
    .join('');
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body {
            color: #111;
            background: #fff;
            font-family: Arial, 'Segoe UI', sans-serif;
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt {
            width: ${receiptWidthMm}mm;
            max-width: ${receiptWidthMm}mm;
            margin: 0 0 0 ${paperProfile.printableInsetMm}mm;
            padding: 2mm 0;
            font-size: ${paperProfile.fontSizePx}px;
            color: #111;
            overflow-wrap: anywhere;
          }
          .center { text-align: center; }
          .brand {
            margin-bottom: 2.6mm;
            padding-bottom: 1.8mm;
            border-bottom: 2px solid #111;
            text-align: left;
          }
          .brand-identity {
            display: grid;
            grid-template-columns: ${logoSrc ? '19mm minmax(0, 1fr)' : 'minmax(0, 1fr)'};
            gap: 2.8mm;
            align-items: center;
            margin-bottom: ${contactRows ? '1.8mm' : '0'};
          }
          .brand-logo {
            display: block;
            width: auto;
            max-width: 18mm;
            max-height: 15mm;
            margin: 0;
            object-fit: contain;
            filter: grayscale(1) contrast(1.85) brightness(.78);
          }
          .brand-title {
            min-width: 0;
            text-align: ${logoSrc ? 'left' : 'center'};
          }
          .brand strong {
            display: block;
            font-size: 17px;
            font-weight: 900;
            letter-spacing: .02em;
            text-transform: uppercase;
            line-height: 1.08;
          }
          .brand-description {
            display: block;
            width: max-content;
            max-width: 100%;
            margin-top: .9mm;
            border: 1px solid #111;
            border-radius: 2px;
            padding: .45mm 1.2mm;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: .08em;
            line-height: 1.15;
            text-transform: uppercase;
            overflow-wrap: anywhere;
          }
          .brand-title.centered {
            display: grid;
            justify-items: center;
          }
          .brand-contact {
            display: grid;
            gap: .65mm;
            text-align: left;
          }
          .brand-contact-row {
            display: grid;
            grid-template-columns: 13mm minmax(0, 1fr);
            gap: 2mm;
            font-size: 10.5px;
            line-height: 1.25;
          }
          .brand-contact-row span {
            font-weight: 800;
            text-transform: uppercase;
          }
          .brand-contact-row strong {
            display: block;
            font-size: 10.5px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: none;
            word-break: break-word;
          }
          .rule { border-top: 1px dashed #777; margin: 2.2mm 0; }
          .meta {
            display: grid;
            gap: .85mm;
            padding: .2mm 0;
          }
          .meta-row,
          .total-row,
          .payment-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 3mm;
          }
          .meta-row span:first-child,
          .total-row span:first-child,
          .payment-row span:first-child {
            color: #333;
            font-weight: 700;
            white-space: nowrap;
          }
          .meta-row span:last-child,
          .total-row span:last-child,
          .payment-row span:last-child {
            text-align: right;
            font-weight: 700;
          }
          .items-head,
          .item-line {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 7mm 13mm 15mm;
            gap: 1.5mm;
            align-items: baseline;
          }
          .items-head {
            margin-bottom: .4mm;
            border-top: 1px solid #111;
            border-bottom: 1px solid #111;
            padding: 1mm 0;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .03em;
            text-transform: uppercase;
          }
          .items-head span:not(:first-child),
          .item-line span {
            text-align: right;
          }
          .item-row {
            display: grid;
            gap: .7mm;
            padding: 1.35mm 0;
            border-bottom: 1px dashed #aaa;
          }
          .item-name {
            font-weight: 750;
            line-height: 1.25;
            word-break: break-word;
          }
          .item-line {
            font-family: Consolas, 'Courier New', monospace;
            font-size: 11px;
          }
          .item-name { font-family: Arial, 'Segoe UI', sans-serif; }
          .item-discount {
            color: #333;
            font-size: 10px;
            text-align: right;
          }
          .totals {
            display: grid;
            gap: .4mm;
          }
          .total-row { padding: .45mm 0; }
          .grand {
            margin-top: 1.2mm;
            border-top: 2px solid #111;
            border-bottom: 2px solid #111;
            padding: 1.4mm 0;
            font-size: 16px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .section-badge {
            display: inline-block;
            margin-bottom: 1mm;
            border: 1px solid #111;
            padding: .8mm 1.6mm;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: .08em;
            text-transform: uppercase;
          }
          .payment {
            display: grid;
            gap: .65mm;
            margin-top: 2.2mm;
            border-top: 1px dashed #777;
            padding-top: 1.6mm;
          }
          .footer {
            display: grid;
            gap: .8mm;
            margin-top: 2.4mm;
            border: 1px dashed #777;
            padding: 1.6mm;
            text-align: center;
            font-size: 11px;
            font-weight: 800;
          }
          .footer strong {
            display: block;
            font-size: 14px;
            font-weight: 900;
          }
          .footer span {
            display: block;
            font-size: 11px;
            font-weight: 700;
          }
          .footer-line {
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <header class="brand">
            <div class="brand-identity">
              ${logoSrc ? `<img class="brand-logo" src="${escapeHtml(logoSrc)}" alt="" />` : ''}
              <div class="brand-title ${logoSrc ? '' : 'centered'}">
                <strong>${businessName}</strong>
                ${businessDescription ? `<span class="brand-description">${escapeHtml(businessDescription)}</span>` : ''}
              </div>
            </div>
            ${contactRows ? `<div class="brand-contact">${contactRows}</div>` : ''}
          </header>
          <section class="meta" aria-label="Transaction details">
            <div class="meta-row"><span>Invoice</span><span>${escapeHtml(receipt.invoiceNumber || '-')}</span></div>
            <div class="meta-row"><span>Date</span><span>${escapeHtml(dateParts.date)}</span></div>
            <div class="meta-row"><span>Time</span><span>${escapeHtml(dateParts.time)}</span></div>
            <div class="meta-row"><span>Cashier</span><span>${escapeHtml(receipt.cashierName || '-')}</span></div>
            <div class="meta-row"><span>Customer</span><span>${escapeHtml(receipt.customerName || 'Walk-in Customer')}</span></div>
          </section>
          <div class="rule"></div>
          <section aria-label="Receipt items">
            <div class="items-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit Price</span>
              <span>Total</span>
            </div>
            ${rows || '<div class="item-row"><div class="item-name">No items found.</div></div>'}
          </section>
          <div class="rule"></div>
          <section class="totals" aria-label="Receipt totals">
            <div class="total-row"><span>Subtotal</span><span>${formatMoney(receipt.subtotal)}</span></div>
            ${
              Number(receipt.discount || 0) > 0
                ? `<div class="total-row"><span>Discount</span><span>${formatMoney(receipt.discount)}</span></div>`
                : ''
            }
            ${
              Number(receipt.tax || 0) > 0
                ? `<div class="total-row"><span>Tax</span><span>${formatMoney(receipt.tax)}</span></div>`
                : ''
            }
            <div class="total-row grand"><span>Grand Total</span><span>${formatMoney(receipt.grandTotal)}</span></div>
          </section>
          <section class="payment" aria-label="Payment details">
            <div><span class="section-badge">Payment</span></div>
            <div class="payment-row"><span>Payment</span><span>${escapeHtml(receipt.paymentMethod || '-')}</span></div>
            <div class="payment-row"><span>Paid</span><span>${formatMoney(receipt.paidAmount)}</span></div>
            <div class="payment-row"><span>Change</span><span>${formatMoney(receipt.changeAmount)}</span></div>
          </section>
          ${footerHtml}
        </div>
      </body>
    </html>
  `;
}

function buildInvoicePdfHtml(receipt, settings) {
  const rows = (receipt.items || [])
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>
        <strong>${item.productName}</strong>
        <span>${item.sku || item.barcode || ''}</span>
      </td>
      <td class="right">${formatMoney(item.quantity)}</td>
      <td class="right">${formatMoney(item.unitPrice)}</td>
      <td class="right">${formatMoney(item.discount)}</td>
      <td class="right">${formatMoney(item.total)}</td>
    </tr>
  `
    )
    .join('');
  const couponRows = (receipt.luckyDrawCoupons || [])
    .map(
      (coupon) => `
    <div class="coupon">
      <strong>${coupon.couponNo}</strong>
      <span>${coupon.campaignName || 'Lucky Draw'} - ${coupon.barcodeValue || coupon.qrValue || coupon.couponNo}</span>
    </div>
  `
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, 'Segoe UI', sans-serif; }
          .page { width: 100%; min-height: 100vh; padding: 34px; background: #fff; }
          .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f766e; padding-bottom: 18px; }
          .brand h1 { margin: 0; color: #0f766e; font-size: 26px; letter-spacing: 0.16em; text-transform: uppercase; }
          .brand p, .meta p { margin: 5px 0 0; color: #475569; font-size: 12px; }
          .meta { text-align: right; }
          .meta strong { display: block; color: #111827; font-size: 20px; margin-bottom: 5px; }
          .info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 22px 0; }
          .box { border: 1px solid #dbe4ef; border-radius: 10px; padding: 13px; background: #f8fafc; }
          .box h2 { margin: 0 0 9px; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
          .box p { margin: 5px 0; color: #334155; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { background: #0f172a; color: #fff; padding: 10px 8px; text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; }
          td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; vertical-align: top; }
          td span { display: block; color: #64748b; font-size: 10px; margin-top: 3px; }
          .right { text-align: right; }
          .summary { width: 330px; margin-left: auto; margin-top: 20px; border: 1px solid #dbe4ef; border-radius: 12px; padding: 14px; }
          .summary .row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; color: #334155; }
          .summary .total { border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 12px; color: #0f766e; font-size: 20px; font-weight: 800; }
          .coupon { margin-top: 8px; border: 1px dashed #94a3b8; border-radius: 8px; padding: 9px; color: #334155; }
          .footer { margin-top: 28px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 14px; }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="header">
            <div class="brand">
              <h1>Enterprise POS</h1>
              <p>${settings.storeAddress || 'Retail Invoice'}</p>
              <p>${settings.storePhone || ''}</p>
            </div>
            <div class="meta">
              <strong>Invoice</strong>
              <p>${receipt.invoiceNumber}</p>
              <p>${new Date(receipt.createdAt).toLocaleString()}</p>
            </div>
          </section>

          <section class="info">
            <div class="box">
              <h2>Customer</h2>
              <p>${receipt.customerName || 'Walk-in Customer'}</p>
            </div>
            <div class="box">
              <h2>Sale Details</h2>
              <p>Cashier: ${receipt.cashierName || '-'}</p>
              <p>Payment: ${receipt.paymentMethod || '-'}</p>
            </div>
          </section>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th class="right">Qty</th>
                <th class="right">Price</th>
                <th class="right">Discount</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">No items found.</td></tr>'}</tbody>
          </table>

          <section class="summary">
            <div class="row"><span>Subtotal</span><strong>PKR ${formatMoney(receipt.subtotal)}</strong></div>
            <div class="row"><span>Discount</span><strong>PKR ${formatMoney(receipt.discount)}</strong></div>
            <div class="row"><span>Tax</span><strong>PKR ${formatMoney(receipt.tax)}</strong></div>
            <div class="row total"><span>Total</span><strong>PKR ${formatMoney(receipt.grandTotal)}</strong></div>
            <div class="row"><span>Paid</span><strong>PKR ${formatMoney(receipt.paidAmount)}</strong></div>
            <div class="row"><span>Change</span><strong>PKR ${formatMoney(receipt.changeAmount)}</strong></div>
          </section>

          ${couponRows ? `<section class="box" style="margin-top: 20px;"><h2>Lucky Draw Coupons</h2>${couponRows}</section>` : ''}
          <footer class="footer">${settings.footerText || 'Thank you for shopping'}</footer>
        </main>
      </body>
    </html>
  `;
}

async function listPrinters() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  return win.webContents.getPrintersAsync();
}

async function exportReceiptPdf(receipt, filePath, options = {}) {
  const settings = { ...(await getPrinterSettings()), ...options };
  const html = buildInvoicePdfHtml(receipt, settings);
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { nodeIntegration: false },
  });
  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    });
    await fs.writeFile(filePath, buffer);
    return { ok: true, filePath };
  } finally {
    pdfWindow.close();
  }
}

async function waitForReceiptPrintReady(printWindow, timeoutMs = RECEIPT_PRINT_READY_TIMEOUT_MS) {
  const readinessScript = `
    (async () => {
      const images = Array.from(document.images || []);
      await Promise.all(images.map(async (img) => {
        if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }
        if (typeof img.decode === 'function') {
          try { await img.decode(); } catch (_error) {}
        }
      }));
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_error) {}
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const logo = document.querySelector('.brand-logo');
      const logoRect = logo ? logo.getBoundingClientRect() : null;
      const receipt = document.querySelector('.receipt');
      const receiptRect = receipt ? receipt.getBoundingClientRect() : null;
      return {
        imageCount: images.length,
        logoReady: !logo || (
          logo.complete &&
          logo.naturalWidth > 0 &&
          logo.naturalHeight > 0 &&
          logoRect.width > 0 &&
          logoRect.height > 0
        ),
        logoRenderedWidth: logoRect ? logoRect.width : 0,
        logoRenderedHeight: logoRect ? logoRect.height : 0,
        receiptWidth: receiptRect ? receiptRect.width : 0,
        receiptHeight: receiptRect ? receiptRect.height : 0,
      };
    })()
  `;
  try {
    return await Promise.race([
      printWindow.webContents.executeJavaScript(readinessScript, true),
      new Promise((resolve) => {
        setTimeout(() => resolve({ timeout: true }), timeoutMs);
      }),
    ]);
  } catch (_error) {
    return { error: true };
  }
}

async function printReceipt(receipt, options = {}) {
  const settings = { ...(await getPrinterSettings()), ...options };
  const html = buildReceiptHtml(receipt, settings);
  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 640,
    webPreferences: { nodeIntegration: false },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const readiness = await waitForReceiptPrintReady(printWindow);
    const printResult = await new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ success: false, failureReason: 'Print timed out.' });
      }, RECEIPT_PRINT_CALLBACK_TIMEOUT_MS);
      printWindow.webContents.print(
        {
          silent: true,
          deviceName: settings.printerName || undefined,
          printBackground: true,
          margins: { marginType: 'none' },
        },
        (success, failureReason) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ success, failureReason });
        }
      );
    });
    return { ...printResult, readiness };
  } finally {
    if (typeof printWindow.isDestroyed === 'function') {
      if (!printWindow.isDestroyed()) printWindow.close();
    } else {
      printWindow.close();
    }
  }
}

module.exports = {
  buildEscPosReceipt,
  buildInvoicePdfHtml,
  buildReceiptHtml,
  exportReceiptPdf,
  getPrinterSettings,
  listPrinters,
  printReceipt,
  savePrinterSettings,
};
