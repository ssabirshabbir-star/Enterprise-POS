const WRITE_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);
const READ_ROLES = new Set(['Admin', 'Manager', 'Warehouse']);

function profilePermission(profileOrRole, permissionKey) {
  if (typeof profileOrRole === 'string') return null;
  if (!profileOrRole) return null;
  if (profileOrRole.role === 'Admin') return true;
  const permissions = Array.isArray(profileOrRole.permissions) ? profileOrRole.permissions : [];
  return permissions.includes(permissionKey);
}

function roleName(profileOrRole) {
  return typeof profileOrRole === 'string' ? profileOrRole : profileOrRole?.role;
}

function canReadPurchases(profileOrRole) {
  const permissionAllowed = profilePermission(profileOrRole, 'purchases.view');
  if (permissionAllowed !== null) return permissionAllowed;
  return READ_ROLES.has(roleName(profileOrRole));
}

function canCreatePurchases(profileOrRole) {
  const permissionAllowed = profilePermission(profileOrRole, 'purchases.create');
  if (permissionAllowed !== null) return permissionAllowed;
  return WRITE_ROLES.has(roleName(profileOrRole));
}

function canUpdatePurchases(profileOrRole) {
  const permissionAllowed = profilePermission(profileOrRole, 'purchases.update');
  if (permissionAllowed !== null) return permissionAllowed;
  return WRITE_ROLES.has(roleName(profileOrRole));
}

function canDeletePurchases(profileOrRole) {
  const permissionAllowed = profilePermission(profileOrRole, 'purchases.delete');
  if (permissionAllowed !== null) return permissionAllowed;
  return WRITE_ROLES.has(roleName(profileOrRole));
}

function canWritePurchases(profileOrRole) {
  return (
    canCreatePurchases(profileOrRole) ||
    canUpdatePurchases(profileOrRole) ||
    canDeletePurchases(profileOrRole)
  );
}

module.exports = {
  canCreatePurchases,
  canDeletePurchases,
  canReadPurchases,
  canUpdatePurchases,
  canWritePurchases,
};
