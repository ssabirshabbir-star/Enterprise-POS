const authService = require('./auth.service');

function safeError(message = 'Request failed. Please try again.') {
  return { ok: false, message };
}

function registerAuthRoutes(ipcMain) {

  ipcMain.handle('/auth/login', async (_event, credentials) => {
    try {
      if (!authService?.login) {
        return safeError('Auth service not initialized.');
      }
      return await authService.login(credentials || {});
    } catch (error) {
      console.error('Auth login error:', error);
      return safeError('Cannot login right now. Please check the database connection.');
    }
  });

  ipcMain.handle('/auth/profile', async () => {
    try {
      if (!authService?.getProfile) {
        return safeError('Auth service not initialized.');
      }
      return await authService.getProfile();
    } catch (error) {
      console.error('Auth profile error:', error);
      return safeError('Authentication required.');
    }
  });

  ipcMain.handle('/auth/refresh', async () => {
    try {
      if (!authService?.refreshSession) {
        return safeError('Auth service not initialized.');
      }
      return await authService.refreshSession();
    } catch (error) {
      console.error('Auth refresh error:', error);
      return safeError('Session expired. Please login again.');
    }
  });

  ipcMain.handle('/auth/logout', async () => {
    try {
      if (!authService?.logout) {
        return safeError('Auth service not initialized.');
      }
      return await authService.logout();
    } catch (error) {
      console.error('Auth logout error:', error);
      return safeError('Logout failed.');
    }
  });

  ipcMain.handle('/auth/can-access', async (_event, route) => {
    try {
      if (!authService?.canAccess) {
        return { ok: false, allowed: false, message: 'Access denied.' };
      }
      return await authService.canAccess(route);
    } catch (error) {
      console.error('Auth RBAC error:', error);
      return { ok: false, allowed: false, message: 'Access denied.' };
    }
  });

}

module.exports = {
  registerAuthRoutes
};