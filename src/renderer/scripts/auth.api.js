(function AuthApiModule() {
  'use strict';

  const api = () => window.posApi?.auth;

  async function login(credentials) {
    return api().login(credentials || {});
  }

  async function profile() {
    return api().profile();
  }

  async function logout() {
    return api().logout();
  }

  async function canAccess(route) {
    return api().canAccess(route);
  }

  window.AuthApi = {
    canAccess,
    login,
    logout,
    profile,
  };
})();
