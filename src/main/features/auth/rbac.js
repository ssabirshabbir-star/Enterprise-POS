const ROLE_ACCESS = Object.freeze({
  Admin: ['dashboard', 'pos', 'products', 'inventory', 'purchases', 'purchase_orders', 'suppliers', 'expenses', 'customers', 'returns', 'reports', 'lucky_draw', 'settings', 'users', 'roles', 'permissions', 'printing', 'sync'],
  Manager: ['dashboard', 'pos', 'products', 'inventory', 'purchases', 'purchase_orders', 'suppliers', 'expenses', 'customers', 'returns', 'reports', 'lucky_draw', 'printing', 'sync'],
  Cashier: ['dashboard', 'pos', 'products', 'customers', 'returns', 'lucky_draw', 'printing', 'sync'],
  Saleman: ['dashboard', 'pos', 'products', 'customers', 'lucky_draw', 'printing'],
  Warehouse: ['dashboard', 'products', 'inventory', 'purchases', 'purchase_orders', 'suppliers', 'printing', 'sync']
});

const ROUTE_PERMISSIONS = Object.freeze({
  dashboard: 'dashboard.view',
  pos: 'pos.view',
  products: 'products.view',
  inventory: 'inventory.view',
  purchases: 'purchases.view',
  purchase_orders: 'purchaseOrders.view',
  suppliers: 'suppliers.view',
  expenses: 'expenses.view',
  customers: 'customers.view',
  returns: 'pos.refund.create',
  reports: 'reports.view',
  lucky_draw: 'lucky_draw.view',
  settings: 'settings.view',
  users: 'users.view',
  roles: 'roles.view',
  permissions: 'roles.view',
  printing: 'pos.view',
  sync: 'sync.view'
});

function canRoleAccess(role, route, permissions = []) {
  const permission = ROUTE_PERMISSIONS[route];
  if (permission && permissions.includes(permission)) return true;
  return Boolean(ROLE_ACCESS[role]?.includes(route));
}

module.exports = {
  ROLE_ACCESS,
  ROUTE_PERMISSIONS,
  canRoleAccess
};
