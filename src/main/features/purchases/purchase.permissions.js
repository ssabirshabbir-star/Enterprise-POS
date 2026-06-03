const WRITE_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);
const READ_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);

function canReadPurchases(role) {
  return READ_ROLES.has(role);
}

function canWritePurchases(role) {
  return WRITE_ROLES.has(role);
}

module.exports = {
  canReadPurchases,
  canWritePurchases
};
