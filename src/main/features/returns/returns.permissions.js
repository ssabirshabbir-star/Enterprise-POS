const READ_ROLES = new Set(['Admin', 'Manager', 'Cashier']);
const WRITE_ROLES = new Set(['Admin', 'Manager', 'Cashier']);

function canReadReturns(role) {
  return READ_ROLES.has(role);
}

function canWriteReturns(role) {
  return WRITE_ROLES.has(role);
}

module.exports = {
  canReadReturns,
  canWriteReturns
};
