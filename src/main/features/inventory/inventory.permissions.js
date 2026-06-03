const WRITE_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);
const READ_ROLES = new Set(['Admin', 'Manager', 'Warehouse', 'Cashier', 'Saleman']);

function canReadInventory(role) {
  return READ_ROLES.has(role);
}

function canAdjustInventory(role) {
  return WRITE_ROLES.has(role);
}

module.exports = {
  canAdjustInventory,
  canReadInventory
};
