const { getPool } = require('../../database/connection');

function dateRange(filters = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: filters.from || today,
    to: filters.to || today
  };
}

async function getSummary(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT
        COALESCE((SELECT SUM(grand_total) FROM sales WHERE created_at::date BETWEEN $1 AND $2), 0)::numeric AS total_sales,
        COALESCE((SELECT SUM(grand_total) FROM purchases WHERE purchase_date BETWEEN $1 AND $2 AND deleted_at IS NULL), 0)::numeric AS total_purchases,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN $1 AND $2 AND deleted_at IS NULL), 0)::numeric AS total_expenses,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE created_at::date BETWEEN $1 AND $2), 0)::numeric AS supplier_payments_out,
        COALESCE((SELECT SUM(amount) FROM customer_payments WHERE created_at::date BETWEEN $1 AND $2), 0)::numeric AS customer_payments_in,
        COALESCE((SELECT SUM(paid_amount) FROM sales WHERE created_at::date BETWEEN $1 AND $2), 0)::numeric AS sales_cash_in,
        COALESCE((SELECT SUM((sale_items.unit_price - products.purchase_price) * sale_items.quantity - sale_items.discount)
          FROM sale_items
          INNER JOIN sales ON sales.id = sale_items.sale_id
          INNER JOIN products ON products.id = sale_items.product_id
          WHERE sales.created_at::date BETWEEN $1 AND $2), 0)::numeric AS total_profit,
        COALESCE((SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND current_stock <= min_stock_level), 0)::int AS low_stock_count
    `,
    [from, to]
  );
  const row = result.rows[0];
  return {
    totalSales: Number(row.total_sales),
    totalPurchases: Number(row.total_purchases),
    totalExpenses: Number(row.total_expenses),
    grossProfit: Number(row.total_profit),
    totalProfit: Number(row.total_profit) - Number(row.total_expenses),
    cashFlow: {
      salesCashIn: Number(row.sales_cash_in),
      customerPaymentsIn: Number(row.customer_payments_in),
      supplierPaymentsOut: Number(row.supplier_payments_out),
      expensesOut: Number(row.total_expenses),
      netCash: Number(row.sales_cash_in) + Number(row.customer_payments_in) - Number(row.supplier_payments_out) - Number(row.total_expenses)
    },
    lowStockCount: Number(row.low_stock_count)
  };
}

async function getSalesReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT sales.invoice_number, sales.created_at, sales.grand_total, sales.paid_amount, sales.payment_method,
             users.full_name AS cashier_name, customers.name AS customer_name
      FROM sales
      LEFT JOIN users ON users.id = sales.cashier_id
      LEFT JOIN customers ON customers.id = sales.customer_id
      WHERE sales.created_at::date BETWEEN $1 AND $2
      ORDER BY sales.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    grandTotal: Number(row.grand_total),
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method,
    cashierName: row.cashier_name,
    customerName: row.customer_name
  }));
}

async function getPurchaseReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT purchases.invoice_number, purchases.purchase_date, purchases.grand_total, purchases.paid_amount,
             purchases.due_amount, suppliers.name AS supplier_name
      FROM purchases
      LEFT JOIN suppliers ON suppliers.id = purchases.supplier_id
      WHERE purchases.deleted_at IS NULL AND purchases.purchase_date BETWEEN $1 AND $2
      ORDER BY purchases.purchase_date DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    purchaseDate: row.purchase_date,
    grandTotal: Number(row.grand_total),
    paidAmount: Number(row.paid_amount),
    dueAmount: Number(row.due_amount),
    supplierName: row.supplier_name
  }));
}

async function getPurchaseOrderReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const requisitions = await getPool().query(
    `
      SELECT requisitions.requisition_number, requisitions.status, requisitions.priority,
             requisitions.requested_date, requisitions.department, users.full_name AS requested_by,
             COALESCE(SUM(items.required_qty), 0)::numeric AS requested_qty
      FROM purchase_requisitions requisitions
      LEFT JOIN users ON users.id = requisitions.requested_by
      LEFT JOIN purchase_requisition_items items ON items.requisition_id = requisitions.id
      WHERE requisitions.deleted_at IS NULL AND requisitions.created_at::date BETWEEN $1 AND $2
      GROUP BY requisitions.id, users.full_name
      ORDER BY requisitions.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  const orders = await getPool().query(
    `
      SELECT purchase_orders.po_number, purchase_orders.status, purchase_orders.expected_date,
             purchase_orders.total, purchase_orders.created_at, suppliers.name AS supplier_name,
             COALESCE(SUM(purchase_order_items.ordered_qty), 0)::numeric AS ordered_qty,
             COALESCE(SUM(purchase_order_items.received_qty), 0)::numeric AS received_qty
      FROM purchase_orders
      LEFT JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
      LEFT JOIN purchase_order_items ON purchase_order_items.purchase_order_id = purchase_orders.id
      WHERE purchase_orders.deleted_at IS NULL AND purchase_orders.created_at::date BETWEEN $1 AND $2
      GROUP BY purchase_orders.id, suppliers.name
      ORDER BY purchase_orders.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  const receipts = await getPool().query(
    `
      SELECT goods_receipts.receipt_number, goods_receipts.received_at, goods_receipts.total,
             purchase_orders.po_number, suppliers.name AS supplier_name
      FROM goods_receipts
      INNER JOIN purchase_orders ON purchase_orders.id = goods_receipts.purchase_order_id
      LEFT JOIN suppliers ON suppliers.id = goods_receipts.supplier_id
      WHERE goods_receipts.received_at::date BETWEEN $1 AND $2
      ORDER BY goods_receipts.received_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  const pendingInvoices = await getPool().query(
    `
      SELECT goods_receipts.receipt_number, goods_receipts.received_at, goods_receipts.total,
             purchase_orders.po_number, suppliers.name AS supplier_name
      FROM goods_receipts
      INNER JOIN purchase_orders ON purchase_orders.id = goods_receipts.purchase_order_id
      LEFT JOIN suppliers ON suppliers.id = goods_receipts.supplier_id
      WHERE goods_receipts.purchase_id IS NULL AND goods_receipts.received_at::date BETWEEN $1 AND $2
      ORDER BY goods_receipts.received_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  const supplierPayables = await getPool().query(
    `
      SELECT suppliers.name AS supplier_name, suppliers.current_balance
      FROM suppliers
      WHERE suppliers.deleted_at IS NULL AND suppliers.current_balance > 0
      ORDER BY suppliers.current_balance DESC
      LIMIT 100
    `
  );
  return {
    requisitions: requisitions.rows.map((row) => ({
      requisitionNumber: row.requisition_number,
      status: row.status,
      priority: row.priority,
      requestedDate: row.requested_date,
      department: row.department,
      requestedBy: row.requested_by,
      requestedQty: Number(row.requested_qty)
    })),
    orders: orders.rows.map((row) => ({
      poNumber: row.po_number,
      status: row.status,
      expectedDate: row.expected_date,
      total: Number(row.total),
      orderedQty: Number(row.ordered_qty),
      receivedQty: Number(row.received_qty),
      supplierName: row.supplier_name,
      createdAt: row.created_at
    })),
    pending: orders.rows
      .filter((row) => !['FULLY_RECEIVED', 'CANCELLED'].includes(row.status))
      .map((row) => ({ poNumber: row.po_number, status: row.status, supplierName: row.supplier_name, total: Number(row.total), expectedDate: row.expected_date })),
    supplierConfirmations: orders.rows
      .filter((row) => ['SENT_TO_SUPPLIER', 'SUPPLIER_CONFIRMED'].includes(row.status))
      .map((row) => ({ poNumber: row.po_number, status: row.status, supplierName: row.supplier_name, total: Number(row.total), expectedDate: row.expected_date })),
    receipts: receipts.rows.map((row) => ({
      receiptNumber: row.receipt_number,
      poNumber: row.po_number,
      supplierName: row.supplier_name,
      total: Number(row.total),
      receivedAt: row.received_at
    })),
    pendingInvoices: pendingInvoices.rows.map((row) => ({
      receiptNumber: row.receipt_number,
      poNumber: row.po_number,
      supplierName: row.supplier_name,
      total: Number(row.total),
      receivedAt: row.received_at
    })),
    supplierPayables: supplierPayables.rows.map((row) => ({
      supplierName: row.supplier_name,
      balance: Number(row.current_balance)
    }))
  };
}

async function getInventoryReport() {
  const result = await getPool().query(
    `
      SELECT products.name, products.sku, products.barcode, products.current_stock, products.min_stock_level,
             products.purchase_price, (products.current_stock * products.purchase_price) AS valuation,
             categories.name AS category_name
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.deleted_at IS NULL
      ORDER BY products.name ASC
      LIMIT 500
    `
  );
  return result.rows.map((row) => ({
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    currentStock: Number(row.current_stock),
    minStockLevel: Number(row.min_stock_level),
    purchasePrice: Number(row.purchase_price),
    valuation: Number(row.valuation),
    categoryName: row.category_name,
    status: Number(row.current_stock) <= 0 ? 'OUT_OF_STOCK' : Number(row.current_stock) <= Number(row.min_stock_level) ? 'LOW_STOCK' : 'IN_STOCK'
  }));
}

async function getCashierReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT users.full_name AS cashier_name, COUNT(sales.id)::int AS sales_count, COALESCE(SUM(sales.grand_total), 0)::numeric AS total_sales
      FROM sales
      LEFT JOIN users ON users.id = sales.cashier_id
      WHERE sales.created_at::date BETWEEN $1 AND $2
      GROUP BY users.full_name
      ORDER BY total_sales DESC
    `,
    [from, to]
  );
  return result.rows.map((row) => ({ cashierName: row.cashier_name || 'Unknown', salesCount: row.sales_count, totalSales: Number(row.total_sales) }));
}

async function getCustomerDueReport() {
  const result = await getPool().query(
    `
      SELECT id, name, phone, current_balance, credit_limit
      FROM customers
      WHERE deleted_at IS NULL AND current_balance > 0
      ORDER BY current_balance DESC
      LIMIT 300
    `
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    currentBalance: Number(row.current_balance),
    creditLimit: Number(row.credit_limit)
  }));
}

async function getCreditSalesReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT sales.invoice_number, sales.created_at, sales.grand_total, sales.paid_amount,
             (sales.grand_total - sales.paid_amount) AS due_amount,
             customers.name AS customer_name
      FROM sales
      INNER JOIN customers ON customers.id = sales.customer_id
      WHERE sales.created_at::date BETWEEN $1 AND $2
        AND sales.grand_total > sales.paid_amount
      ORDER BY sales.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    customerName: row.customer_name,
    grandTotal: Number(row.grand_total),
    paidAmount: Number(row.paid_amount),
    dueAmount: Number(row.due_amount)
  }));
}

async function getReturnsReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT returns.return_number, returns.created_at, returns.total_refund, returns.refund_method,
             returns.reason, sales.invoice_number, customers.name AS customer_name
      FROM returns
      INNER JOIN sales ON sales.id = returns.sale_id
      LEFT JOIN customers ON customers.id = returns.customer_id
      WHERE returns.created_at::date BETWEEN $1 AND $2
      ORDER BY returns.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    returnNumber: row.return_number,
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    refundTotal: Number(row.total_refund),
    refundMethod: row.refund_method,
    customerName: row.customer_name,
    reason: row.reason
  }));
}

async function getRefundSummary(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT refund_method, COUNT(*)::int AS count, COALESCE(SUM(total_refund), 0)::numeric AS total
      FROM returns
      WHERE created_at::date BETWEEN $1 AND $2
      GROUP BY refund_method
      ORDER BY total DESC
    `,
    [from, to]
  );
  return result.rows.map((row) => ({ refundMethod: row.refund_method, count: row.count, total: Number(row.total) }));
}

async function getCustomerLedgerReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT customer_ledger.entry_type, customer_ledger.debit, customer_ledger.credit,
             customer_ledger.balance, customer_ledger.notes, customer_ledger.created_at,
             customers.name AS customer_name
      FROM customer_ledger
      INNER JOIN customers ON customers.id = customer_ledger.customer_id
      WHERE customer_ledger.created_at::date BETWEEN $1 AND $2
      ORDER BY customer_ledger.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    customerName: row.customer_name,
    entryType: row.entry_type,
    debit: Number(row.debit),
    credit: Number(row.credit),
    balance: Number(row.balance),
    notes: row.notes,
    createdAt: row.created_at
  }));
}

async function getSupplierBalanceReport() {
  const result = await getPool().query(
    `
      SELECT id, name, phone, current_balance
      FROM suppliers
      WHERE deleted_at IS NULL AND current_balance > 0
      ORDER BY current_balance DESC
      LIMIT 300
    `
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, currentBalance: Number(row.current_balance) }));
}

async function getSupplierPaymentReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT supplier_payments.amount, supplier_payments.payment_method, supplier_payments.notes, supplier_payments.created_at,
             suppliers.name AS supplier_name
      FROM supplier_payments
      INNER JOIN suppliers ON suppliers.id = supplier_payments.supplier_id
      WHERE supplier_payments.created_at::date BETWEEN $1 AND $2
      ORDER BY supplier_payments.created_at DESC
      LIMIT 300
    `,
    [from, to]
  );
  return result.rows.map((row) => ({
    supplierName: row.supplier_name,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at
  }));
}

async function getExpenseReport(filters = {}) {
  const { from, to } = dateRange(filters);
  const result = await getPool().query(
    `
      SELECT expenses.title, expenses.amount, expenses.payment_method, expenses.expense_date,
             expense_categories.name AS category_name
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      WHERE expenses.deleted_at IS NULL AND expenses.expense_date BETWEEN $1 AND $2
      ORDER BY expenses.expense_date DESC, expenses.id DESC
      LIMIT 300
    `,
    [from, to]
  );
  const byCategory = await getPool().query(
    `
      SELECT expense_categories.name AS category_name, COALESCE(SUM(expenses.amount), 0)::numeric AS total
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      WHERE expenses.deleted_at IS NULL AND expenses.expense_date BETWEEN $1 AND $2
      GROUP BY expense_categories.name
      ORDER BY total DESC
    `,
    [from, to]
  );
  return {
    items: result.rows.map((row) => ({
      title: row.title,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      expenseDate: row.expense_date,
      categoryName: row.category_name
    })),
    byCategory: byCategory.rows.map((row) => ({ categoryName: row.category_name || 'Uncategorized', total: Number(row.total) }))
  };
}

async function getRecentSales(limit = 8) {
  const result = await getPool().query(
    `
      SELECT sales.invoice_number, sales.grand_total, sales.created_at, sales.payment_method,
             customers.name AS customer_name
      FROM sales
      LEFT JOIN customers ON customers.id = sales.customer_id
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map((row) => ({
    invoiceNumber: row.invoice_number,
    grandTotal: Number(row.grand_total),
    createdAt: row.created_at,
    paymentMethod: row.payment_method,
    customerName: row.customer_name
  }));
}

async function getRecentActivity(limit = 8) {
  const result = await getPool().query('SELECT action, status, message, created_at FROM activity_logs ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows.map((row) => ({ action: row.action, status: row.status, message: row.message, createdAt: row.created_at }));
}

module.exports = {
  getCashierReport,
  getCreditSalesReport,
  getCustomerDueReport,
  getCustomerLedgerReport,
  getInventoryReport,
  getPurchaseReport,
  getPurchaseOrderReport,
  getRefundSummary,
  getRecentActivity,
  getRecentSales,
  getReturnsReport,
  getSalesReport,
  getSummary,
  getSupplierBalanceReport,
  getSupplierPaymentReport,
  getExpenseReport
};
