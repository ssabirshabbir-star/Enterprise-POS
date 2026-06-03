const WRITE_ROLES = new Set(['Admin', 'Manager']);
const READ_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman']);

function canReadProducts(role) {
  return READ_ROLES.has(role);
}

function canWriteProducts(role) {
  return WRITE_ROLES.has(role);
}

module.exports = {
  canReadProducts,
  canWriteProducts
};
