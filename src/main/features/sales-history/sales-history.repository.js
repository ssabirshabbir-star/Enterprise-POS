const { getPool } = require('../../database/connection');

function money(value) {
  return Number(value || 0);
}

function mapSaleRow(row) {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    customerName: row.customer_name || 'Walk-in Customer',
    cashierName: row.cashier_name || '-',
    itemCount: Number(row.item_count || 0),
    grandTotal: money(row.grand_total),
    paidAmount: money(row.paid_amount),
    changeAmount: money(row.change_amount),
    paymentMethod: row.payment_method,
    status: row.status,
    luckyDrawCouponCount: Number(row.lucky_draw_coupon_count || 0),
  };
}

function mapReceipt(sale, items, coupons, payments) {
  return {
    id: Number(sale.id),
    invoiceNumber: sale.invoice_number,
    createdAt: sale.created_at,
    cashierName: sale.cashier_name || '-',
    customerName: sale.customer_name || 'Walk-in Customer',
    subtotal: money(sale.subtotal),
    discount: money(sale.discount),
    tax: money(sale.tax),
    grandTotal: money(sale.grand_total),
    paidAmount: money(sale.paid_amount),
    changeAmount: money(sale.change_amount),
    paymentMethod: sale.payment_method,
    status: sale.status,
    payments: payments.map((payment) => ({
      id: Number(payment.id),
      paymentMethod: payment.payment_method,
      amount: money(payment.amount),
      createdAt: payment.created_at,
    })),
    luckyDrawCoupons: coupons.map((coupon) => ({
      campaignId: Number(coupon.campaign_id),
      campaignName: coupon.campaign_name,
      campaignCode: coupon.campaign_code,
      couponNo: coupon.coupon_no,
      qrValue: coupon.qr_value,
      barcodeValue: coupon.barcode_value,
      billAmount: money(coupon.bill_amount),
      verificationStatus: coupon.verification_status,
    })),
    items: items.map((item) => ({
      productName: item.product_name,
      sku: item.sku,
      quantity: money(item.quantity),
      unitPrice: money(item.unit_price),
      discount: money(item.discount),
      total: money(item.total),
    })),
  };
}

function addWhere(where, params, clause, value) {
  params.push(value);
  where.push(clause.replace('?', `$${params.length}`));
}

function addSearchWhere(where, params, search) {
  const value = `%${search}%`;
  params.push(value, value, value);
  const [invoiceParam, customerParam, phoneParam] = [
    `$${params.length - 2}`,
    `$${params.length - 1}`,
    `$${params.length}`,
  ];
  where.push(
    `(LOWER(sales.invoice_number) LIKE ${invoiceParam} OR LOWER(COALESCE(customers.name, '')) LIKE ${customerParam} OR COALESCE(customers.phone, '') LIKE ${phoneParam})`
  );
}

async function listSales(filters = {}) {
  const where = [];
  const params = [];
  const search = String(filters.search || '')
    .trim()
    .toLowerCase();
  const status = String(filters.status || '').trim();
  const paymentMethod = String(filters.paymentMethod || '').trim();
  const fromDate = String(filters.fromDate || '').trim();
  const toDate = String(filters.toDate || '').trim();

  if (search) {
    addSearchWhere(where, params, search);
  }
  if (status) addWhere(where, params, 'sales.status = ?', status);
  if (paymentMethod) addWhere(where, params, 'sales.payment_method = ?', paymentMethod);
  if (fromDate) addWhere(where, params, 'sales.created_at::date >= ?', fromDate);
  if (toDate) addWhere(where, params, 'sales.created_at::date <= ?', toDate);

  const result = await getPool().query(
    `
      SELECT
        sales.id,
        sales.invoice_number,
        sales.created_at,
        sales.grand_total,
        sales.paid_amount,
        sales.change_amount,
        sales.payment_method,
        sales.status,
        customers.name AS customer_name,
        users.full_name AS cashier_name,
        COUNT(DISTINCT sale_items.id)::int AS item_count,
        COUNT(DISTINCT lucky_draw_entries.id)::int AS lucky_draw_coupon_count
      FROM sales
      LEFT JOIN customers ON customers.id = sales.customer_id
      LEFT JOIN users ON users.id = sales.cashier_id
      LEFT JOIN sale_items ON sale_items.sale_id = sales.id
      LEFT JOIN lucky_draw_entries ON lucky_draw_entries.sale_id = sales.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY sales.id, customers.name, users.full_name
      ORDER BY sales.created_at DESC
      LIMIT 300
    `,
    params
  );

  return result.rows.map(mapSaleRow);
}

async function getDetails(saleId) {
  const id = Number(saleId);
  const saleResult = await getPool().query(
    `
      SELECT sales.*, users.full_name AS cashier_name, customers.name AS customer_name
      FROM sales
      LEFT JOIN users ON users.id = sales.cashier_id
      LEFT JOIN customers ON customers.id = sales.customer_id
      WHERE sales.id = $1
      LIMIT 1
    `,
    [id]
  );
  const sale = saleResult.rows[0];
  if (!sale) return null;

  const [items, coupons, payments] = await Promise.all([
    getPool().query(
      `
        SELECT sale_items.*, products.name AS product_name, products.sku
        FROM sale_items
        INNER JOIN products ON products.id = sale_items.product_id
        WHERE sale_items.sale_id = $1
        ORDER BY sale_items.id ASC
      `,
      [id]
    ),
    getPool().query(
      `
        SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code
        FROM lucky_draw_entries entries
        INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
        WHERE entries.sale_id = $1
        ORDER BY entries.created_at ASC
      `,
      [id]
    ),
    getPool().query(
      `
        SELECT id, payment_method, amount, created_at
        FROM payments
        WHERE sale_id = $1
        ORDER BY created_at ASC
      `,
      [id]
    ),
  ]);

  return mapReceipt(sale, items.rows, coupons.rows, payments.rows);
}

module.exports = {
  getDetails,
  listSales,
};
