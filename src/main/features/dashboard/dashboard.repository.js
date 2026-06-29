const { getPool } = require('../../database/connection');

function number(value) {
  return Number(value || 0);
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function getOverviewData() {
  const today = isoDate();
  const weekStart = isoDate(-6);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [
    summary,
    productCounts,
    customers,
    suppliers,
    purchases,
    expenses,
    returns,
    purchaseOrders,
    luckyDraw,
    lowStock,
    recentSales,
    topProducts,
    paymentMethods,
    categorySales,
    salesTrend,
  ] = await Promise.all([
    getPool().query(
      `
        SELECT
          COALESCE((SELECT SUM(grand_total) FROM sales WHERE created_at::date = $1), 0)::numeric AS today_sales,
          COALESCE((SELECT COUNT(*) FROM sales WHERE created_at::date = $1), 0)::int AS today_orders,
          COALESCE((SELECT SUM(grand_total) FROM sales WHERE created_at::date BETWEEN $2 AND $1), 0)::numeric AS week_sales,
          COALESCE((SELECT SUM(grand_total) FROM sales WHERE created_at::date BETWEEN $3 AND $1), 0)::numeric AS month_sales,
          COALESCE((
            SELECT SUM((sale_items.unit_price - products.purchase_price) * sale_items.quantity - sale_items.discount)
            FROM sale_items
            INNER JOIN sales ON sales.id = sale_items.sale_id
            INNER JOIN products ON products.id = sale_items.product_id
            WHERE sales.created_at::date = $1
          ), 0)::numeric AS gross_profit
      `,
      [today, weekStart, monthStart]
    ),
    getPool().query(
      `
        SELECT
          COUNT(*)::int AS total_products,
          COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock_level)::int AS low_stock,
          COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock,
          COALESCE(SUM(current_stock * purchase_price), 0)::numeric AS stock_value
        FROM products
        WHERE deleted_at IS NULL
      `
    ),
    getPool().query(
      `
        SELECT
          COUNT(*)::int AS total_customers,
          COUNT(*) FILTER (WHERE current_balance > 0)::int AS customers_with_due,
          COALESCE(SUM(current_balance) FILTER (WHERE current_balance > 0), 0)::numeric AS receivable_total
        FROM customers
        WHERE deleted_at IS NULL
      `
    ),
    getPool().query('SELECT COUNT(*)::int AS count FROM suppliers WHERE deleted_at IS NULL'),
    getPool().query(
      `
        SELECT
          COALESCE(SUM(grand_total) FILTER (WHERE purchase_date = $1), 0)::numeric AS today_purchases,
          COALESCE(SUM(due_amount), 0)::numeric AS due_purchases
        FROM purchases
        WHERE deleted_at IS NULL
      `,
      [today]
    ),
    getPool().query(
      'SELECT COALESCE(SUM(amount), 0)::numeric AS today_expenses FROM expenses WHERE expense_date = $1 AND deleted_at IS NULL',
      [today]
    ),
    getPool().query(
      `
        SELECT COUNT(*)::int AS open_returns
        FROM returns
        WHERE deleted_at IS NULL AND status <> 'VOID'
      `
    ),
    getPool().query(
      `
        SELECT COUNT(*)::int AS pending_purchase_orders
        FROM purchase_orders
        WHERE deleted_at IS NULL AND status IN ('DRAFT', 'PENDING', 'APPROVED', 'SENT')
      `
    ),
    getPool().query(
      `
        SELECT
          COUNT(DISTINCT campaigns.id) FILTER (WHERE campaigns.status = 'ACTIVE' AND campaigns.deleted_at IS NULL)::int AS active_campaigns,
          COUNT(entries.id)::int AS coupon_count
        FROM lucky_draw_campaigns campaigns
        LEFT JOIN lucky_draw_entries entries ON entries.campaign_id = campaigns.id
      `
    ),
    getPool().query(
      `
        SELECT name, sku, current_stock, min_stock_level
        FROM products
        WHERE deleted_at IS NULL
          AND current_stock > 0
          AND current_stock <= min_stock_level
        ORDER BY current_stock ASC, name ASC
        LIMIT 6
      `
    ),
    getPool().query(
      `
        SELECT sales.invoice_number, sales.created_at, sales.grand_total, sales.payment_method,
               customers.name AS customer_name
        FROM sales
        LEFT JOIN customers ON customers.id = sales.customer_id
        ORDER BY sales.created_at DESC
        LIMIT 6
      `
    ),
    getPool().query(
      `
        SELECT products.name,
               COALESCE(SUM(sale_items.quantity), 0)::numeric AS quantity,
               COALESCE(SUM(sale_items.total), 0)::numeric AS total
        FROM sale_items
        INNER JOIN products ON products.id = sale_items.product_id
        INNER JOIN sales ON sales.id = sale_items.sale_id
        WHERE sales.created_at::date = $1
        GROUP BY products.id, products.name
        ORDER BY quantity DESC, total DESC
        LIMIT 5
      `,
      [today]
    ),
    getPool().query(
      `
        SELECT COALESCE(payment_method, 'Cash') AS method,
               COALESCE(SUM(grand_total), 0)::numeric AS total
        FROM sales
        WHERE created_at::date = $1
        GROUP BY payment_method
        ORDER BY total DESC
      `,
      [today]
    ),
    getPool().query(
      `
        SELECT COALESCE(categories.name, 'Uncategorized') AS category,
               COALESCE(SUM(sale_items.total), 0)::numeric AS total
        FROM sale_items
        INNER JOIN sales ON sales.id = sale_items.sale_id
        INNER JOIN products ON products.id = sale_items.product_id
        LEFT JOIN categories ON categories.id = products.category_id
        WHERE sales.created_at::date = $1
        GROUP BY categories.name
        ORDER BY total DESC
        LIMIT 5
      `,
      [today]
    ),
    getPool().query(
      `
        SELECT days.sale_date,
               COALESCE(SUM(sales.grand_total), 0)::numeric AS total
        FROM generate_series($1::date, $2::date, interval '1 day') AS days(sale_date)
        LEFT JOIN sales ON sales.created_at::date = days.sale_date
        GROUP BY days.sale_date
        ORDER BY days.sale_date ASC
      `,
      [weekStart, today]
    ),
  ]);

  const summaryRow = summary.rows[0] || {};
  const productRow = productCounts.rows[0] || {};
  const customerRow = customers.rows[0] || {};
  const purchaseRow = purchases.rows[0] || {};
  const expensesRow = expenses.rows[0] || {};
  const returnsRow = returns.rows[0] || {};
  const poRow = purchaseOrders.rows[0] || {};
  const luckyRow = luckyDraw.rows[0] || {};

  return {
    stats: {
      todaySales: number(summaryRow.today_sales),
      todayOrders: number(summaryRow.today_orders),
      weekSales: number(summaryRow.week_sales),
      monthlySales: number(summaryRow.month_sales),
      totalProfit: number(summaryRow.gross_profit) - number(expensesRow.today_expenses),
      grossProfit: number(summaryRow.gross_profit),
      productCount: number(productRow.total_products),
      customerCount: number(customerRow.total_customers),
      customersWithDue: number(customerRow.customers_with_due),
      customerDueTotal: number(customerRow.receivable_total),
      lowStockCount: number(productRow.low_stock),
      outOfStockCount: number(productRow.out_of_stock),
      todayPurchases: number(purchaseRow.today_purchases),
      duePurchases: number(purchaseRow.due_purchases),
      supplierCount: number(suppliers.rows[0]?.count),
      todayExpenses: number(expensesRow.today_expenses),
      stockValue: number(productRow.stock_value),
      openReturns: number(returnsRow.open_returns),
      pendingPurchaseOrders: number(poRow.pending_purchase_orders),
      activeLuckyDrawCampaigns: number(luckyRow.active_campaigns),
      luckyDrawCoupons: number(luckyRow.coupon_count),
    },
    lowStock: lowStock.rows.map((row) => ({
      name: row.name,
      sku: row.sku,
      currentStock: number(row.current_stock),
      minStockLevel: number(row.min_stock_level),
    })),
    recentSales: recentSales.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      createdAt: row.created_at,
      grandTotal: number(row.grand_total),
      paymentMethod: row.payment_method,
      customerName: row.customer_name,
    })),
    topProducts: topProducts.rows.map((row) => ({
      name: row.name,
      quantity: number(row.quantity),
      total: number(row.total),
    })),
    paymentMethods: paymentMethods.rows.map((row) => ({
      method: row.method,
      total: number(row.total),
    })),
    categorySales: categorySales.rows.map((row) => ({
      category: row.category,
      total: number(row.total),
    })),
    salesTrend: salesTrend.rows.map((row) => ({
      date: row.sale_date,
      total: number(row.total),
    })),
  };
}

module.exports = {
  getOverviewData,
};
