const READ_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman']);
const WRITE_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman']);
const DELETE_HOLD_ROLES = new Set(['Admin', 'Manager']);
const REFUND_EXCHANGE_ROLES = new Set(['Admin', 'Manager']);

function canReadSales(role) {
  return READ_ROLES.has(role);
}

function canWriteSales(role) {
  return WRITE_ROLES.has(role);
}

function canDeleteHeldSales(role) {
  return DELETE_HOLD_ROLES.has(role);
}

function canRefundOrExchangeSales(role) {
  return REFUND_EXCHANGE_ROLES.has(role);
}

function canOverrideSalePrice(profile = {}) {
  const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
  return profile.role === 'Admin' || permissions.includes('pos.sale.discount');
}

module.exports = {
  canOverrideSalePrice,
  canDeleteHeldSales,
  canRefundOrExchangeSales,
  canReadSales,
  canWriteSales,
};
