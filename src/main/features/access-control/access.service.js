const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const accessRepository = require('./access.repository');

async function requireAdmin() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  if (profileResult.profile.role !== 'Admin' && !profileResult.profile.permissions?.includes('users.view')) {
    return { ok: false, message: 'Admin permission is required.' };
  }
  return { ok: true, profile: profileResult.profile };
}

function cleanUser(payload = {}, requirePassword = false) {
  const username = String(payload.username || '').trim().toLowerCase();
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || payload.name || '').trim();
  const password = String(payload.password || '');
  const roleId = Number(payload.roleId);
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) return { ok: false, message: 'Valid username is required.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: 'Valid email is required.' };
  if (fullName.length < 2) return { ok: false, message: 'Full name is required.' };
  if (!Number.isInteger(roleId) || roleId <= 0) return { ok: false, message: 'Role is required.' };
  if (requirePassword && password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  return { ok: true, payload: { username, email, fullName, phone: String(payload.phone || '').trim(), password, roleId, isActive: payload.isActive !== false } };
}

async function listUsers(filters = {}) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  return { ok: true, users: await accessRepository.listUsers(filters) };
}

async function listSecurityActivity() {
  const access = await requireAdmin();
  if (!access.ok) return access;
  return {
    ok: true,
    policy: {
      minPasswordLength: 8,
      maxFailedLoginAttempts: 5,
      lockMinutes: 15,
      resetClearsLock: true
    },
    activity: await accessRepository.listSecurityActivity(100)
  };
}

async function createUser(payload = {}) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const clean = cleanUser(payload, true);
  if (!clean.ok) return clean;
  try {
    const userId = await accessRepository.createUser(clean.payload);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'users.create', status: 'success', message: 'User created', metadata: { userId } });
    return { ok: true, userId, message: 'User created successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Username or email already exists.' };
    throw error;
  }
}

async function updateUser(id, payload = {}) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: 'Invalid user id.' };
  if (userId === access.profile.id && payload.isActive === false) return { ok: false, message: 'You cannot deactivate your own admin account.' };
  const clean = cleanUser(payload, false);
  if (!clean.ok) return clean;
  const currentRole = await accessRepository.userRoleName(userId);
  const nextRole = await accessRepository.roleName(clean.payload.roleId);
  if (userId === access.profile.id && currentRole === 'Admin' && nextRole !== 'Admin') return { ok: false, message: 'You cannot remove your own Admin role.' };
  if (currentRole === 'Admin' && (clean.payload.isActive === false || nextRole !== 'Admin') && await accessRepository.activeAdminCount(userId) === 0) {
    return { ok: false, message: 'At least one active Admin user is required.' };
  }
  try {
    const updated = await accessRepository.updateUser(userId, clean.payload);
    if (!updated) return { ok: false, message: 'User not found.' };
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'users.update', status: 'success', message: 'User updated', metadata: { userId } });
    return { ok: true, message: 'User updated successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Username or email already exists.' };
    throw error;
  }
}

async function setUserActive(id, isActive) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const userId = Number(id);
  if (userId === access.profile.id && isActive === false) return { ok: false, message: 'You cannot deactivate your own admin account.' };
  if (isActive === false && await accessRepository.activeAdminCount(userId) === 0) return { ok: false, message: 'At least one active Admin user is required.' };
  const updated = await accessRepository.setUserActive(userId, Boolean(isActive));
  if (!updated) return { ok: false, message: 'User not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'users.status', status: 'success', message: 'User status changed', metadata: { userId, isActive } });
  return { ok: true, message: 'User status updated.' };
}

async function resetPassword(id, password) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const userId = Number(id);
  if (String(password || '').length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  const updated = await accessRepository.resetPassword(userId, String(password));
  if (!updated) return { ok: false, message: 'User not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'users.password.reset', status: 'success', message: 'Password reset', metadata: { userId } });
  return { ok: true, message: 'Password reset successfully.' };
}

async function listRoles() {
  const access = await requireAdmin();
  if (!access.ok) return access;
  return { ok: true, roles: await accessRepository.listRoles() };
}

async function createRole(payload = {}) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Role name is required.' };
  try {
    const roleId = await accessRepository.createRole({ name, description: String(payload.description || '').trim() });
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'roles.create', status: 'success', message: 'Role created', metadata: { roleId } });
    return { ok: true, roleId, message: 'Role created successfully.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Role already exists.' };
    throw error;
  }
}

async function updateRole(id, payload = {}) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const roleId = Number(id);
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Role name is required.' };
  if (name === 'Admin' && payload.isActive === false) return { ok: false, message: 'Admin role cannot be deactivated.' };
  const updated = await accessRepository.updateRole(roleId, { name, description: String(payload.description || '').trim(), isActive: payload.isActive !== false });
  if (!updated) return { ok: false, message: 'Role not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'roles.update', status: 'success', message: 'Role updated', metadata: { roleId } });
  return { ok: true, message: 'Role updated successfully.' };
}

async function permissionsByRole(roleId) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  return { ok: true, permissions: await accessRepository.permissionsByRole(Number(roleId)) };
}

async function assignPermissions(roleId, permissionIds = []) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const cleanIds = permissionIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  await accessRepository.assignPermissions(Number(roleId), cleanIds);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'roles.permissions', status: 'success', message: 'Role permissions assigned', metadata: { roleId, count: cleanIds.length } });
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
  updateUser
};
