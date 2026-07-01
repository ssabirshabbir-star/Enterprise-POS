const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const accessRepository = require('./access.repository');

const REQUIRED_SELF_MANAGEMENT_PERMISSIONS = [
  'roles.view',
  'roles.assignPermissions',
  'users.view',
  'users.update',
];

async function requirePermission(permissionKey) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const permissions = Array.isArray(profileResult.profile.permissions)
    ? profileResult.profile.permissions
    : [];
  if (profileResult.profile.role !== 'Admin' && !permissions.includes(permissionKey)) {
    return { ok: false, message: 'Permission denied.' };
  }
  return { ok: true, profile: profileResult.profile };
}

async function requirePermissions(permissionKeys) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  if (profileResult.profile.role === 'Admin') return { ok: true, profile: profileResult.profile };
  const permissions = Array.isArray(profileResult.profile.permissions)
    ? profileResult.profile.permissions
    : [];
  const allowed = permissionKeys.every((permissionKey) => permissions.includes(permissionKey));
  if (!allowed) return { ok: false, message: 'Permission denied.' };
  return { ok: true, profile: profileResult.profile };
}

function cleanUser(payload = {}, requirePassword = false) {
  const username = String(payload.username || '')
    .trim()
    .toLowerCase();
  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  const fullName = String(payload.fullName || payload.name || '').trim();
  const password = String(payload.password || '');
  const roleId = Number(payload.roleId);
  if (!/^[a-z0-9._-]{3,80}$/.test(username))
    return { ok: false, message: 'Valid username is required.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, message: 'Valid email is required.' };
  if (fullName.length < 2) return { ok: false, message: 'Full name is required.' };
  if (!Number.isInteger(roleId) || roleId <= 0) return { ok: false, message: 'Role is required.' };
  if (requirePassword && password.length < 8)
    return { ok: false, message: 'Password must be at least 8 characters.' };
  return {
    ok: true,
    payload: {
      username,
      email,
      fullName,
      phone: String(payload.phone || '').trim(),
      password,
      roleId,
      isActive: payload.isActive !== false,
    },
  };
}

function normalizePermissionIds(permissionIds = []) {
  return [
    ...new Set(permissionIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ].sort((a, b) => a - b);
}

function difference(left = [], right = []) {
  const rightSet = new Set(right.map(Number));
  return left.map(Number).filter((id) => !rightSet.has(id));
}

async function auditPermissionBlock(access, roleId, reason, metadata = {}) {
  if (!access?.profile?.id) return;
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'roles.permissions',
    status: 'blocked',
    message: reason,
    metadata: { roleId, reason, ...metadata },
  });
}

async function listUsers(filters = {}) {
  const access = await requirePermission('users.view');
  if (!access.ok) return access;
  return { ok: true, users: await accessRepository.listUsers(filters) };
}

async function listSecurityActivity() {
  const access = await requirePermission('users.view');
  if (!access.ok) return access;
  return {
    ok: true,
    policy: {
      minPasswordLength: 8,
      maxFailedLoginAttempts: 5,
      lockMinutes: 15,
      resetClearsLock: true,
    },
    activity: await accessRepository.listSecurityActivity(100),
  };
}

async function createUser(payload = {}) {
  const access = await requirePermission('users.create');
  if (!access.ok) return access;
  const clean = cleanUser(payload, true);
  if (!clean.ok) return clean;
  try {
    const userId = await accessRepository.createUser(clean.payload);
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'users.create',
      status: 'success',
      message: 'User created',
      metadata: { userId },
    });
    return { ok: true, userId, message: 'User created successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Username or email already exists.' };
    throw error;
  }
}

async function updateUser(id, payload = {}) {
  const requiredPermissions = Object.prototype.hasOwnProperty.call(payload, 'isActive')
    ? ['users.update', 'users.deactivate']
    : ['users.update'];
  const access = await requirePermissions(requiredPermissions);
  if (!access.ok) return access;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: 'Invalid user id.' };
  if (userId === access.profile.id && payload.isActive === false)
    return { ok: false, message: 'You cannot deactivate your own admin account.' };
  const clean = cleanUser(payload, false);
  if (!clean.ok) return clean;
  const currentRole = await accessRepository.userRoleName(userId);
  const nextRole = await accessRepository.roleName(clean.payload.roleId);
  if (userId === access.profile.id && currentRole === 'Admin' && nextRole !== 'Admin')
    return { ok: false, message: 'You cannot remove your own Admin role.' };
  if (
    currentRole === 'Admin' &&
    (clean.payload.isActive === false || nextRole !== 'Admin') &&
    (await accessRepository.activeAdminCount(userId)) === 0
  ) {
    return { ok: false, message: 'At least one active Admin user is required.' };
  }
  try {
    const updated = await accessRepository.updateUser(userId, clean.payload);
    if (!updated) return { ok: false, message: 'User not found.' };
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'users.update',
      status: 'success',
      message: 'User updated',
      metadata: { userId },
    });
    return { ok: true, message: 'User updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Username or email already exists.' };
    throw error;
  }
}

async function setUserActive(id, isActive) {
  const access = await requirePermission('users.deactivate');
  if (!access.ok) return access;
  const userId = Number(id);
  if (userId === access.profile.id && isActive === false)
    return { ok: false, message: 'You cannot deactivate your own admin account.' };
  if (isActive === false && (await accessRepository.activeAdminCount(userId)) === 0)
    return { ok: false, message: 'At least one active Admin user is required.' };
  const updated = await accessRepository.setUserActive(userId, Boolean(isActive));
  if (!updated) return { ok: false, message: 'User not found.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'users.status',
    status: 'success',
    message: 'User status changed',
    metadata: { userId, isActive },
  });
  return { ok: true, message: 'User status updated.' };
}

async function resetPassword(id, password) {
  const access = await requirePermission('users.update');
  if (!access.ok) return access;
  const userId = Number(id);
  if (String(password || '').length < 8)
    return { ok: false, message: 'Password must be at least 8 characters.' };
  const updated = await accessRepository.resetPassword(userId, String(password));
  if (!updated) return { ok: false, message: 'User not found.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'users.password.reset',
    status: 'success',
    message: 'Password reset',
    metadata: { userId },
  });
  return { ok: true, message: 'Password reset successfully.' };
}

async function listRoles() {
  const access = await requirePermission('roles.view');
  if (!access.ok) return access;
  return { ok: true, roles: await accessRepository.listRoles() };
}

async function createRole(payload = {}) {
  const access = await requirePermission('roles.create');
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Role name is required.' };
  try {
    const roleId = await accessRepository.createRole({
      name,
      description: String(payload.description || '').trim(),
    });
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'roles.create',
      status: 'success',
      message: 'Role created',
      metadata: { roleId },
    });
    return { ok: true, roleId, message: 'Role created successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Role already exists.' };
    throw error;
  }
}

async function updateRole(id, payload = {}) {
  const access = await requirePermission('roles.update');
  if (!access.ok) return access;
  const roleId = Number(id);
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Role name is required.' };
  if (name === 'Admin' && payload.isActive === false)
    return { ok: false, message: 'Admin role cannot be deactivated.' };
  const updated = await accessRepository.updateRole(roleId, {
    name,
    description: String(payload.description || '').trim(),
    isActive: payload.isActive !== false,
  });
  if (!updated) return { ok: false, message: 'Role not found.' };
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'roles.update',
    status: 'success',
    message: 'Role updated',
    metadata: { roleId },
  });
  return { ok: true, message: 'Role updated successfully.' };
}

async function permissionsByRole(roleId) {
  const access = await requirePermission('roles.view');
  if (!access.ok) return access;
  return { ok: true, permissions: await accessRepository.permissionsByRole(Number(roleId)) };
}

async function assignPermissions(roleId, permissionIds = []) {
  const access = await requirePermission('roles.assignPermissions');
  if (!access.ok) return access;
  const targetRoleId = Number(roleId);
  if (!Number.isInteger(targetRoleId) || targetRoleId <= 0) {
    await auditPermissionBlock(access, roleId, 'Invalid role id.');
    return { ok: false, message: 'Invalid role id.' };
  }

  const targetRole = await accessRepository.roleById(targetRoleId);
  if (!targetRole) {
    await auditPermissionBlock(access, targetRoleId, 'Role not found.');
    return { ok: false, message: 'Role not found.' };
  }
  if (!targetRole.isActive) {
    await auditPermissionBlock(
      access,
      targetRoleId,
      'Inactive role permissions cannot be changed.',
      {
        targetRoleName: targetRole.name,
      }
    );
    return { ok: false, message: 'Inactive role permissions cannot be changed.' };
  }
  if (targetRole.isSystem || targetRole.name === 'Admin') {
    await auditPermissionBlock(access, targetRoleId, 'System role permissions cannot be changed.', {
      targetRoleName: targetRole.name,
      isSystem: targetRole.isSystem,
    });
    return { ok: false, message: 'System role permissions cannot be changed.' };
  }

  const cleanIds = normalizePermissionIds(permissionIds);
  if (!cleanIds.length) {
    await auditPermissionBlock(access, targetRoleId, 'At least one permission is required.', {
      targetRoleName: targetRole.name,
    });
    return { ok: false, message: 'At least one permission is required.' };
  }

  const activePermissions = await accessRepository.activePermissionsByIds(cleanIds);
  const activeIds = activePermissions
    .map((permission) => Number(permission.id))
    .sort((a, b) => a - b);
  if (activeIds.length !== cleanIds.length) {
    await auditPermissionBlock(
      access,
      targetRoleId,
      'One or more permissions are invalid or inactive.',
      {
        targetRoleName: targetRole.name,
        requestedPermissionIds: cleanIds,
        validPermissionIds: activeIds,
      }
    );
    return { ok: false, message: 'One or more permissions are invalid or inactive.' };
  }

  const currentUserRoleId = await accessRepository.userRoleId(access.profile.id);
  if (Number(currentUserRoleId) === targetRoleId) {
    const requiredIds = await accessRepository.permissionIdsByKeys(
      REQUIRED_SELF_MANAGEMENT_PERMISSIONS
    );
    const missingRequiredIds = difference(requiredIds, activeIds);
    if (missingRequiredIds.length) {
      await auditPermissionBlock(
        access,
        targetRoleId,
        'You cannot remove your own user management access.',
        {
          targetRoleName: targetRole.name,
          requiredPermissionKeys: REQUIRED_SELF_MANAGEMENT_PERMISSIONS,
          missingRequiredPermissionIds: missingRequiredIds,
        }
      );
      return { ok: false, message: 'You cannot remove your own user management access.' };
    }
  }

  const beforeIds = await accessRepository.permissionIdsByRole(targetRoleId);
  const addedIds = difference(activeIds, beforeIds);
  const removedIds = difference(beforeIds, activeIds);

  await accessRepository.assignPermissions(targetRoleId, activeIds);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'roles.permissions',
    status: 'success',
    message: 'Role permissions assigned',
    metadata: {
      roleId: targetRoleId,
      targetRoleName: targetRole.name,
      beforePermissionIds: beforeIds,
      afterPermissionIds: activeIds,
      addedPermissionIds: addedIds,
      removedPermissionIds: removedIds,
      count: activeIds.length,
    },
  });
  return { ok: true, message: 'Permissions updated successfully.' };
}

module.exports = {
  assignPermissions,
  createRole,
  createUser,
  listRoles,
  listSecurityActivity,
  listUsers,
  permissionsByRole,
  resetPassword,
  setUserActive,
  updateRole,
  updateUser,
};
