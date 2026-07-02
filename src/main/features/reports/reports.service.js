const authService = require('../auth/auth.service');
const reportsRepository = require('./reports.repository');

const REPORT_ROLES = new Set(['Admin', 'Manager']);

async function requireReportsAccess() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  if (!REPORT_ROLES.has(profileResult.profile.role))
    return { ok: false, message: 'You do not have permission to view reports.' };
  return { ok: true, profile: profileResult.profile };
}

async function getReports(filters = {}) {
  const access = await requireReportsAccess();
  if (!access.ok) return access;
  const [
    summary,
    sales,
    purchases,
    purchaseOrders,
    inventory,
    cashiers,
    customerDue,
    creditSales,
    returns,
    refundSummary,
    customerLedger,
    supplierBalances,
    supplierPayments,
    expenseReport,
  ] = await Promise.all([
    reportsRepository.getSummary(filters),
    reportsRepository.getSalesReport(filters),
    reportsRepository.getPurchaseReport(filters),
    reportsRepository.getPurchaseOrderReport(filters),
    reportsRepository.getInventoryReport(),
    reportsRepository.getCashierReport(filters),
    reportsRepository.getCustomerDueReport(),
    reportsRepository.getCreditSalesReport(filters),
    reportsRepository.getReturnsReport(filters),
    reportsRepository.getRefundSummary(filters),
    reportsRepository.getCustomerLedgerReport(filters),
    reportsRepository.getSupplierBalanceReport(),
    reportsRepository.getSupplierPaymentReport(filters),
    reportsRepository.getExpenseReport(filters),
  ]);
  return {
    ok: true,
    summary,
    sales,
    purchases,
    purchaseOrders: purchaseOrders.orders,
    purchaseRequisitions: purchaseOrders.requisitions,
    pendingPurchaseOrders: purchaseOrders.pending,
    supplierConfirmationPurchaseOrders: purchaseOrders.supplierConfirmations,
    goodsReceipts: purchaseOrders.receipts,
    pendingPurchaseInvoices: purchaseOrders.pendingInvoices,
    supplierPayables: purchaseOrders.supplierPayables,
    inventory,
    lowStock: inventory.filter(
      (item) => item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK'
    ),
    cashiers,
    customerDue,
    creditSales,
    returns,
    refundSummary,
    customerLedger,
    supplierBalances,
    supplierPayments,
    expenses: expenseReport.items,
    expenseByCategory: expenseReport.byCategory,
    profitLoss: {
      salesRevenue: summary.totalSales,
      costOfGoodsSold: Number((summary.totalSales - summary.grossProfit).toFixed(2)),
      grossProfit: summary.grossProfit,
      expenses: summary.totalExpenses,
      netProfit: summary.totalProfit,
    },
    cashFlow: summary.cashFlow,
    export: { pdfReady: false, excelReady: false },
    charts: {
      salesByCashier: cashiers.map((item) => ({ label: item.cashierName, value: item.totalSales })),
    },
  };
}

module.exports = { getReports };
