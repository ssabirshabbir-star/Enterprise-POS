const accessService = require('./access.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Access control request failed. Please try again.' };
}

function registerAccessControlRoutes(ipcMain) {
  ipcMain.handle('/users/list', async (_event, filters) => {
    try {
      return await accessService.listUsers(filters || {});
    } catch (error) {
      return safeError(error, 'Users list error:');
    }
  });
  ipcMain.handle('/users/create', async (_event, payload) => {
    try {
      return await accessService.createUser(payload || {});
    } catch (error) {
      return safeError(error, 'Users create error:');
    }
  });
  ipcMain.handle('/users/update', async (_event, { id, payload }) => {
    try {
      return await accessService.updateUser(id, payload || {});
    } catch (error) {
      return safeError(error, 'Users update error:');
    }
  });
  ipcMain.handle('/users/status', async (_event, { id, isActive }) => {
    try {
      return await accessService.setUserActive(id, isActive);
    } catch (error) {
      return safeError(error, 'Users status error:');
    }
  });
  ipcMain.handle('/users/reset-password', async (_event, { id, password }) => {
    try {
      return await accessService.resetPassword(id, password);
    } catch (error) {
      return safeError(error, 'Users reset password error:');
    }
  });
  ipcMain.handle('/users/security-activity', async () => {
    try {
      return await accessService.listSecurityActivity();
    } catch (error) {
      return safeError(error, 'Users security activity error:');
    }
  });
  ipcMain.handle('/roles/list', async () => {
    try {
      return await accessService.listRoles();
    } catch (error) {
      return safeError(error, 'Roles list error:');
    }
  });
  ipcMain.handle('/roles/create', async (_event, payload) => {
    try {
      return await accessService.createRole(payload || {});
    } catch (error) {
      return safeError(error, 'Roles create error:');
    }
  });
  ipcMain.handle('/roles/update', async (_event, { id, payload }) => {
    try {
      return await accessService.updateRole(id, payload || {});
    } catch (error) {
      return safeError(error, 'Roles update error:');
    }
  });
  ipcMain.handle('/roles/permissions', async (_event, roleId) => {
    try {
      return await accessService.permissionsByRole(roleId);
    } catch (error) {
      return safeError(error, 'Role permissions error:');
    }
  });
  ipcMain.handle('/roles/permissions/save', async (_event, { roleId, permissionIds }) => {
    try {
      return await accessService.assignPermissions(roleId, permissionIds || []);
    } catch (error) {
      return safeError(error, 'Role permissions save error:');
    }
  });
}

module.exports = { registerAccessControlRoutes };
