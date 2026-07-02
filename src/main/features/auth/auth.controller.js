const authService = require('./auth.service');
const { logError } = require('../../utils/safe-logger');

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
      logError('Auth login error:', error);
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
      logError('Auth profile error:', error);
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
      logError('Auth refresh error:', error);
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
      logError('Auth logout error:', error);
      return safeError('Logout failed.');
    }
  });

  ipcMain.handle('/auth/sessions', async () => {
    try {
      if (!authService?.listActiveSessions) {
        return safeError('Auth service not initialized.');
      }
      return await authService.listActiveSessions();
    } catch (error) {
      logError('Auth sessions error:', error);
      return safeError('Unable to load active sessions.');
    }
  });

  ipcMain.handle('/auth/can-access', async (_event, route) => {
    try {
      if (!authService?.canAccess) {
        return { ok: false, allowed: false, message: 'Access denied.' };
      }
      return await authService.canAccess(route);
    } catch (error) {
      logError('Auth RBAC error:', error);
      return { ok: false, allowed: false, message: 'Access denied.' };
    }
  });
}

module.exports = {
  registerAuthRoutes,
};
