(function AccessControlApiModule() {
  'use strict';

  const api = () => window.posApi.accessControl;
  const rolesApi = () => window.posApi.roles;

  window.AccessControlApi = {
    listUsers: (filters) => api().listUsers(filters || {}),
    createUser: (payload) => api().createUser(payload || {}),
    updateUser: (id, payload) => api().updateUser(id, payload || {}),
    setUserActive: (id, isActive) => api().setUserActive(id, isActive),
    resetPassword: (id, password) => api().resetPassword(id, password),
    listRoles: () => rolesApi().list(),
    createRole: (payload) => rolesApi().create(payload || {}),
    updateRole: (id, payload) => rolesApi().update(id, payload || {}),
    permissionsByRole: (roleId) => rolesApi().permissions(roleId),
    securityActivity: () => api().securityActivity(),
  };
})();
