const fs = require('fs/promises');
const { BrowserWindow } = require('electron');
const printingRepository = require('./printing.repository');

function line(width, char = '-') {
  return char.repeat(width);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function receiptWidth(paperWidth) {
  return paperWidth === '58mm' ? 32 : 48;
}

async function getPrinterSettings() {
  const row = await printingRepository.getPrinterSettingsRow();
  return {
    printerName: row.printer_name || '',
    paperWidth: row.paper_width || '80mm',
    autoPrint: Boolean(row.auto_print),
    silentPrint: Boolean(row.silent_print),
    receiptCopies: Number(row.receipt_copies || 1),
    footerText: row.footer_text || 'Thank you for shopping',
  };
}

async function savePrinterSettings(settings = {}) {
  const paperWidth = ['58mm', '80mm', 'A4'].includes(settings.paperWidth)
    ? settings.paperWidth
    : '80mm';
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
  const coupons = receipt.luckyDrawCoupons || [];
  const rows = [
    '\x1b@',
    '\x1ba\x01',
    'Enterprise POS',
    'Retail Receipt',
    '\x1ba\x00',
    line(width),
    `Invoice: ${receipt.invoiceNumber}`,
    `Date: ${new Date(receipt.createdAt).toLocaleString()}`,
    `Cashier: ${receipt.cashierName || '-'}`,
    `Customer: ${receipt.customerName || 'Walk-in Customer'}`,
    line(width),
  ];

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
  if (coupons.length) {
    rows.push(line(width));
    rows.push('Lucky Draw Coupons');
    for (const coupon of coupons) {
      rows.push(coupon.campaignName || 'Lucky Draw');
      rows.push(coupon.couponNo);
      rows.push(`Barcode/QR: ${coupon.barcodeValue || coupon.qrValue || coupon.couponNo}`);
    }
  }
  rows.push(line(width));
  rows.push('\x1ba\x01');
  rows.push(settings.footerText);
  rows.push('Urdu Unicode ready');
  rows.push('\n\n\n\x1dV\x00');
  return rows.join('\n');
}

function buildReceiptHtml(receipt, settings) {
  const width = settings.paperWidth === '58mm' ? '220px' : '302px';
  const rows = (receipt.items || [])
    .map(
      (item) => `
    <div class="item">
      <div>${item.productName}</div>
      <div>${item.quantity} x ${formatMoney(item.unitPrice)} - ${formatMoney(item.discount)} = ${formatMoney(item.total)}</div>
    </div>
  `
    )
    .join('');
  const couponRows = (receipt.luckyDrawCoupons || [])
    .map(
      (coupon) => `
    <div class="item center">
      <strong>${coupon.couponNo}</strong><br/>
      ${coupon.campaignName || 'Lucky Draw'}<br/>
      <span>Barcode/QR: ${coupon.barcodeValue || coupon.qrValue || coupon.couponNo}</span>
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
          body { margin: 0; font-family: Consolas, 'Noto Nastaliq Urdu', monospace; }
          .receipt { width: ${width}; padding: 10px; font-size: 12px; color: #111; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #333; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; }
          .item { margin: 6px 0; }
          .total { font-weight: 700; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="center"><strong>Enterprise POS</strong><br/>Retail Receipt</div>
          <div class="line"></div>
          <div>Invoice: ${receipt.invoiceNumber}</div>
          <div>Date: ${new Date(receipt.createdAt).toLocaleString()}</div>
          <div>Cashier: ${receipt.cashierName || '-'}</div>
          <div>Customer: ${receipt.customerName || 'Walk-in Customer'}</div>
          <div class="line"></div>
          ${rows}
          <div class="line"></div>
          <div class="row"><span>Subtotal</span><span>${formatMoney(receipt.subtotal)}</span></div>
          <div class="row"><span>Discount</span><span>${formatMoney(receipt.discount)}</span></div>
          <div class="row"><span>Tax</span><span>${formatMoney(receipt.tax)}</span></div>
          <div class="row total"><span>Total</span><span>${formatMoney(receipt.grandTotal)}</span></div>
          <div class="row"><span>Paid</span><span>${formatMoney(receipt.paidAmount)}</span></div>
          <div class="row"><span>Change</span><span>${formatMoney(receipt.changeAmount)}</span></div>
          ${couponRows ? `<div class="line"></div><div class="center"><strong>Lucky Draw Coupons</strong></div>${couponRows}` : ''}
          <div class="line"></div>
          <div class="center">${settings.footerText}<br/>Urdu Unicode ready</div>
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

async function printReceipt(receipt, options = {}) {
  const settings = { ...(await getPrinterSettings()), ...options };
  const html = buildReceiptHtml(receipt, settings);
  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 640,
    webPreferences: { nodeIntegration: false },
  });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const printResult = await new Promise((resolve) => {
    printWindow.webContents.print(
      {
        silent: Boolean(settings.silentPrint),
        deviceName: settings.printerName || undefined,
        printBackground: true,
        margins: { marginType: 'none' },
      },
      (success, failureReason) => resolve({ success, failureReason })
    );
  });
  printWindow.close();
  return printResult;
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
