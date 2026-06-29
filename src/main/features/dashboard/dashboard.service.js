const authService = require('../auth/auth.service');
const dashboardRepository = require('./dashboard.repository');

const STAT_SOURCES = Object.freeze({
  todaySales: 'sales.grand_total where created_at::date = today',
  todayOrders: 'sales count where created_at::date = today',
  weekSales: 'sales.grand_total for trailing seven days',
  monthlySales: 'sales.grand_total from first day of current month through today',
  totalProfit: 'today sale item margin minus today expenses',
  productCount: 'products count where deleted_at is null',
  customerCount: 'customers count where deleted_at is null',
  customerDueTotal: 'customers.current_balance where current_balance > 0',
  customersWithDue: 'customers count where current_balance > 0',
  lowStockCount: 'products where current_stock > 0 and current_stock <= min_stock_level',
  outOfStockCount: 'products where current_stock <= 0',
  todayPurchases: 'purchases.grand_total where purchase_date = today',
  duePurchases: 'purchases.due_amount where deleted_at is null',
  supplierCount: 'suppliers count where deleted_at is null',
  todayExpenses: 'expenses.amount where expense_date = today',
  stockValue: 'products.current_stock * products.purchase_price',
  openReturns: 'returns count where status is not VOID',
  pendingPurchaseOrders: 'purchase_orders count in draft/pending/approved/sent statuses',
  activeLuckyDrawCampaigns: 'active lucky_draw_campaigns where deleted_at is null',
  luckyDrawCoupons: 'lucky_draw_entries joined to campaigns',
});

async function getDashboardOverview() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };

  const overview = await dashboardRepository.getOverviewData();
  return {
    ok: true,
    ...overview,
    sources: STAT_SOURCES,
  };
}

module.exports = { getDashboardOverview };
