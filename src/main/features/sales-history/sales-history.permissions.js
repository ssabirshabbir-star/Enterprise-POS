const SALES_HISTORY_READ_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman', 'Accountant']);

function canReadSalesHistory(role) {
  return SALES_HISTORY_READ_ROLES.has(role);
}

module.exports = {
  canReadSalesHistory,
};
