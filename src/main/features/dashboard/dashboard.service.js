const authService = require('../auth/auth.service');
const reportsRepository = require('../reports/reports.repository');
const { getPool } = require('../../database/connection');

async function getDashboardOverview() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const today = new Date().toISOString().slice(0, 10);
  const [summary, products, purchases, recentSales, activity, lowStock, customerDue, salesCount, suppliers, expenses, stockValue, duePurchases, topProducts, paymentMethods, categorySales] = await Promise.all([
    reportsRepository.getSummary({ from: today, to: today }),
    getPool().query('SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL'),
    getPool().query('SELECT COALESCE(SUM(grand_total), 0)::numeric AS total FROM purchases WHERE purchase_date = $1 AND deleted_at IS NULL', [today]),
    reportsRepository.getRecentSales(6),
    reportsRepository.getRecentActivity(6),
    getPool().query('SELECT name, sku, current_stock, min_stock_level FROM products WHERE deleted_at IS NULL AND current_stock <= min_stock_level ORDER BY current_stock ASC LIMIT 6'),
    getPool().query('SELECT COUNT(*)::int AS count, COALESCE(SUM(current_balance), 0)::numeric AS total_due FROM customers WHERE deleted_at IS NULL AND current_balance > 0'),
    getPool().query('SELECT COUNT(*)::int AS count FROM sales WHERE created_at::date = $1', [today]),
    getPool().query('SELECT COUNT(*)::int AS count FROM suppliers WHERE deleted_at IS NULL'),
    getPool().query('SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM expenses WHERE expense_date = $1 AND deleted_at IS NULL', [today]),
    getPool().query('SELECT COALESCE(SUM(current_stock * purchase_price), 0)::numeric AS total FROM products WHERE deleted_at IS NULL'),
    getPool().query('SELECT COALESCE(SUM(due_amount), 0)::numeric AS total FROM purchases WHERE deleted_at IS NULL'),
    getPool().query(`
      SELECT products.name, COALESCE(SUM(sale_items.quantity), 0)::numeric AS quantity,
             COALESCE(SUM(sale_items.total), 0)::numeric AS total
      FROM sale_items
      INNER JOIN products ON products.id = sale_items.product_id
      INNER JOIN sales ON sales.id = sale_items.sale_id
      WHERE sales.created_at::date = $1
      GROUP BY products.id, products.name
      ORDER BY quantity DESC, total DESC
      LIMIT 5
    `, [today]),
    getPool().query(`
      SELECT COALESCE(payment_method, 'Cash') AS method, COALESCE(SUM(grand_total), 0)::numeric AS total
      FROM sales
      WHERE created_at::date = $1
      GROUP BY payment_method
      ORDER BY total DESC
    `, [today]),
    getPool().query(`
      SELECT COALESCE(categories.name, 'Uncategorized') AS category, COALESCE(SUM(sale_items.total), 0)::numeric AS total
      FROM sale_items
      INNER JOIN sales ON sales.id = sale_items.sale_id
      INNER JOIN products ON products.id = sale_items.product_id
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE sales.created_at::date = $1
      GROUP BY categories.name
      ORDER BY total DESC
      LIMIT 5
    `, [today])
  ]);
  return {
    ok: true,
    stats: {
      todaySales: summary.totalSales,
      totalProfit: summary.totalProfit,
      productCount: products.rows[0]?.count || 0,
      lowStockCount: summary.lowStockCount,
      todayPurchases: Number(purchases.rows[0]?.total || 0),
      customerDueTotal: Number(customerDue.rows[0]?.total_due || 0),
      customersWithDue: Number(customerDue.rows[0]?.count || 0),
      todayOrders: Number(salesCount.rows[0]?.count || 0),
      supplierCount: Number(suppliers.rows[0]?.count || 0),
      todayExpenses: Number(expenses.rows[0]?.total || 0),
      stockValue: Number(stockValue.rows[0]?.total || 0),
      duePurchases: Number(duePurchases.rows[0]?.total || 0)
    },
    recentSales,
    recentActivity: activity,
    lowStock: lowStock.rows.map((row) => ({ name: row.name, sku: row.sku, currentStock: Number(row.current_stock), minStockLevel: Number(row.min_stock_level) })),
    topProducts: topProducts.rows.map((row) => ({ name: row.name, quantity: Number(row.quantity || 0), total: Number(row.total || 0) })),
    paymentMethods: paymentMethods.rows.map((row) => ({ method: row.method, total: Number(row.total || 0) })),
    categorySales: categorySales.rows.map((row) => ({ category: row.category, total: Number(row.total || 0) }))
  };
}

module.exports = { getDashboardOverview };
