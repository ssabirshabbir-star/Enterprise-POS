(function AccessControlApiModule() {
  'use strict';

  const api = () => window.posApi.accessControl;

  window.AccessControlApi = {
    listUsers: (filters) => api().listUsers(filters || {}),
    createUser: (payload) => api().createUser(payload || {}),
    updateUser: (id, payload) => api().updateUser(id, payload || {}),
    setUserActive: (id, isActive) => api().setUserActive(id, isActive),
    resetPassword: (id, password) => api().resetPassword(id, password),
    listRoles: () => api().listRoles(),
    securityActivity: () => api().securityActivity(),
  };
})();
