(function AccessControlRendererModule() {
  'use strict';

  let initialized = false;
  let users = [];
  let roles = [];
  let messageTimer = null;
  let searchTimer = null;
  let editingUser = null;
  let editingRole = null;
  let selectedPermissionRoleId = '';
  let selectedPermissionRole = null;
  let activityRecords = [];
  let activityPolicy = null;

  const A = () => window.AccessControlApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dateOnly(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
  }

  function dateKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function showMessage(text, type = 'info', targetId = 'userToolbarMessage') {
    const el = $id(targetId);
    if (!el) return;
    clearTimeout(messageTimer);
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
    el.style.cssText =
      type === 'error'
        ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5'
        : 'display:block;background:#ecfdf5;color:#047857;border:1px solid #86efac';
    if (text) messageTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = value;
  }

  function recoverFocus(element = null) {
    window.focus?.();
    window.requestAnimationFrame?.(() => {
      if (element?.isConnected && typeof element.focus === 'function') element.focus();
    });
  }

  function selectedFilters() {
    return {
      search: $id('userSearch')?.value || '',
      roleId: $id('userRoleFilter')?.value || '',
      status: $id('userStatusFilter')?.value || '',
    };
  }

  function roleOptions(selectedId = '') {
    return (
      '<option value="">Select Role</option>' +
      roles
        .map((role) => {
          const selected = Number(selectedId) === Number(role.id) ? ' selected' : '';
          return `<option value="${esc(role.id)}"${selected}>${esc(role.name)}</option>`;
        })
        .join('')
    );
  }

  function renderRoleFilters() {
    const filter = $id('userRoleFilter');
    if (filter) {
      const current = filter.value;
      filter.innerHTML =
        '<option value="">All Roles</option>' +
        roles
          .map((role) => {
            const selected = String(current) === String(role.id) ? ' selected' : '';
            return `<option value="${esc(role.id)}"${selected}>${esc(role.name)}</option>`;
          })
          .join('');
    }

    const editorRole = $id('userRole');
    if (editorRole) editorRole.innerHTML = roleOptions(editorRole.value);
    renderRoleList();
    renderPermissionRoleList();
  }

  function roleStatus(role) {
    return role.isActive ? 'Active' : 'Inactive';
  }

  function roleActions(role) {
    if (role.isSystem) {
      return '<span class="epos-users-subtext" title="System roles cannot be edited or deleted.">System role - edit/delete unavailable</span>';
    }
    return `
      <div class="epos-users-row-actions">
        <button type="button" class="epos-users-icon-action" data-role-action="edit" data-role-id="${esc(
          role.id
        )}" title="Edit role">Edit</button>
      </div>
    `;
  }

  function renderRoleList() {
    const list = $id('roleList');
    if (!list) return;
    if (!roles.length) {
      list.innerHTML = '<p class="epos-users-subtext">No roles available.</p>';
      return;
    }
    list.innerHTML = roles
      .map(
        (role) => `
          <article>
            <div>
              <h3>${esc(role.name)}</h3>
              <p>${esc(role.description || 'No description')}</p>
              <small>${esc(roleStatus(role))} &middot; ${esc(role.userCount || 0)} assigned user${
                Number(role.userCount || 0) === 1 ? '' : 's'
              }${role.isSystem ? ' &middot; System' : ''}</small>
            </div>
            ${roleActions(role)}
          </article>
        `
      )
      .join('');
  }

  function renderPermissionRoleList() {
    const list = $id('permissionRoleList');
    if (!list) return;
    if (!roles.length) {
      list.innerHTML = '<p class="epos-users-subtext">No roles available.</p>';
      return;
    }
    list.innerHTML = roles
      .map((role) => {
        const active = String(selectedPermissionRoleId) === String(role.id);
        return `
          <article>
            <div>
              <h3>${esc(role.name)}</h3>
              <p>${role.isSystem ? 'System role' : 'Custom role'} &middot; ${esc(
                roleStatus(role)
              )}</p>
            </div>
            <button type="button" class="epos-users-icon-action ${
              active ? 'green' : ''
            }" data-permission-role-id="${esc(role.id)}" title="View permissions">View</button>
          </article>
        `;
      })
      .join('');
  }

  function canEditPermissions(role) {
    return Boolean(role && !role.isSystem && role.isActive);
  }

  function updatePermissionSaveButton(role) {
    const button = $id('saveRolePermissionsButton');
    if (!button) return;
    const enabled = canEditPermissions(role);
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', String(!enabled));
    button.title = enabled
      ? 'Save permissions for this role.'
      : 'Permission editing is available only for custom active roles.';
  }

  function renderPermissionMatrix(role, permissions) {
    const matrix = $id('permissionMatrix');
    if (!matrix) return;
    if (!role) {
      matrix.textContent = 'Select a role to view permissions.';
      updatePermissionSaveButton(null);
      return;
    }
    const editable = canEditPermissions(role);
    const groups = permissions.reduce((acc, permission) => {
      const category = permission.category || 'GENERAL';
      if (!acc[category]) acc[category] = [];
      acc[category].push(permission);
      return acc;
    }, {});
    const content = Object.keys(groups)
      .sort()
      .map(
        (category) => `
          <section>
            <h3>${esc(category)}</h3>
            ${groups[category]
              .map(
                (permission) => `
                  <label class="epos-users-check">
                    <input type="checkbox" data-permission-id="${esc(permission.id)}" ${
                      editable ? '' : 'disabled'
                    } ${permission.selected ? 'checked' : ''} />
                    <span>${esc(permission.label || permission.key)}</span>
                  </label>
                `
              )
              .join('')}
          </section>
        `
      )
      .join('');
    matrix.innerHTML = `
      <div>
        <h3>${esc(role.name)} Permissions</h3>
        <p class="epos-users-subtext">${
          editable
            ? 'Permission editing is enabled for this custom active role.'
            : 'Read-only permission view. System and inactive roles cannot be edited.'
        }</p>
      </div>
      ${content || '<p class="epos-users-subtext">No permissions available for this role.</p>'}
    `;
    updatePermissionSaveButton(role);
  }

  async function loadPermissionsForRole(roleId) {
    selectedPermissionRoleId = roleId;
    selectedPermissionRole = roles.find((item) => String(item.id) === String(roleId)) || null;
    renderPermissionRoleList();
    updatePermissionSaveButton(null);
    const matrix = $id('permissionMatrix');
    if (matrix) matrix.textContent = 'Loading permissions...';
    const result = await A().permissionsByRole(roleId);
    if (!result?.ok) {
      if (matrix) matrix.textContent = result?.message || 'Unable to load permissions.';
      return;
    }
    renderPermissionMatrix(
      selectedPermissionRole,
      Array.isArray(result.permissions) ? result.permissions : []
    );
  }

  function selectedPermissionIds() {
    return Array.from(
      document.querySelectorAll('#permissionMatrix input[data-permission-id]:checked')
    )
      .map((input) => Number(input.dataset.permissionId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  async function saveRolePermissions() {
    if (!selectedPermissionRoleId || !canEditPermissions(selectedPermissionRole)) {
      showMessage('Select a custom active role before saving permissions.', 'error');
      return;
    }
    const button = $id('saveRolePermissionsButton');
    if (button?.disabled) return;
    const permissionIds = selectedPermissionIds();
    const confirmed = await window.posApi.dialog.confirm(
      `Save permission changes for ${selectedPermissionRole.name}? This may change user access.`
    );
    recoverFocus(button);
    if (!confirmed) return;
    if (button) button.disabled = true;
    try {
      const result = await A().saveRolePermissions(selectedPermissionRoleId, permissionIds);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save permissions.', 'error');
        return;
      }
      showMessage(result.message || 'Permissions saved.');
      const roleId = selectedPermissionRoleId;
      await loadRoles();
      if (roles.some((role) => String(role.id) === String(roleId))) {
        await loadPermissionsForRole(roleId);
      } else {
        selectedPermissionRoleId = '';
        selectedPermissionRole = null;
        renderPermissionMatrix(null, []);
      }
    } finally {
      updatePermissionSaveButton(selectedPermissionRole);
    }
  }

  function renderStats() {
    const total = users.length;
    const active = users.filter((user) => user.isActive).length;
    const inactive = total - active;
    setText('userTotalCount', total);
    setText('userActiveCount', active);
    setText('userInactiveCount', inactive);
    setText('userRoleCount', roles.length);
    setText('userPillAll', total);
    setText('userPillActive', active);
    setText('userPillInactive', inactive);
    setText('userPillOnline', '0');
    setText('userResultSummary', `Showing ${total} user${total === 1 ? '' : 's'}`);
  }

  function renderEmpty(message) {
    const body = $id('userTableBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="11" class="text-center py-6 text-slate-500">${esc(
      message
    )}</td></tr>`;
  }

  function rowActions(user) {
    const statusLabel = user.isActive ? 'Deactivate' : 'Activate';
    return `
      <div class="epos-users-row-actions">
        <button type="button" class="epos-users-icon-action" data-user-action="edit" data-user-id="${esc(
          user.id
        )}" title="Edit user">Edit</button>
        <button type="button" class="epos-users-icon-action warning" data-user-action="password" data-user-id="${esc(
          user.id
        )}" title="Reset password">Pass</button>
        <button type="button" class="epos-users-icon-action ${
          user.isActive ? 'danger' : ''
        }" data-user-action="status" data-user-id="${esc(user.id)}" title="${esc(
          statusLabel
        )}">${esc(statusLabel)}</button>
      </div>
    `;
  }

  function renderUsers() {
    const body = $id('userTableBody');
    if (!body) return;
    if (!users.length) {
      renderEmpty('No users match the current filters.');
      renderStats();
      return;
    }
    body.innerHTML = users
      .map(
        (user, index) => `
          <tr>
            <td><input type="checkbox" disabled aria-label="Bulk selection is Phase 2" /></td>
            <td>${index + 1}</td>
            <td>
              <div class="epos-users-user-cell">
                <span class="epos-users-avatar">${esc((user.fullName || user.username || 'U')[0])}</span>
                <div><strong>${esc(user.fullName || user.username)}</strong><span>${esc(
                  user.username
                )}</span></div>
              </div>
            </td>
            <td><span class="epos-users-role-pill">${esc(user.role || '-')}</span></td>
            <td><span class="epos-users-subtext">Main</span></td>
            <td><span class="epos-users-subtext">General</span></td>
            <td>
              <strong>${esc(user.phone || '-')}</strong>
              <span class="epos-users-subtext">${esc(user.email || '')}</span>
            </td>
            <td><span class="epos-users-status-pill ${
              user.isActive ? 'active' : 'inactive'
            }">${user.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${esc(dateOnly(user.lastLoginAt))}</td>
            <td>${esc(dateOnly(user.createdAt))}</td>
            <td>${rowActions(user)}</td>
          </tr>
        `
      )
      .join('');
    renderStats();
  }

  async function loadUsers() {
    const body = $id('userTableBody');
    if (body)
      body.innerHTML = '<tr><td colspan="11" class="text-center py-6">Loading users...</td></tr>';
    const result = await A().listUsers(selectedFilters());
    if (!result?.ok) {
      users = [];
      renderEmpty(result?.message || 'Unable to load users.');
      showMessage(result?.message || 'Unable to load users.', 'error');
      return;
    }
    users = Array.isArray(result.users) ? result.users : [];
    renderUsers();
  }

  async function loadRoles() {
    const result = await A().listRoles();
    roles = result?.ok && Array.isArray(result.roles) ? result.roles : [];
    renderRoleFilters();
  }

  function activityFilters() {
    return {
      search: ($id('activitySearch')?.value || '').trim().toLowerCase(),
      action: $id('activityActionFilter')?.value || '',
      status: $id('activityStatusFilter')?.value || '',
      dateFrom: $id('activityDateFrom')?.value || '',
      dateTo: $id('activityDateTo')?.value || '',
    };
  }

  function updateActivityFilterOptions() {
    const actionFilter = $id('activityActionFilter');
    const statusFilter = $id('activityStatusFilter');
    const actions = [...new Set(activityRecords.map((item) => item.action).filter(Boolean))].sort();
    const statuses = [
      ...new Set(activityRecords.map((item) => item.status).filter(Boolean)),
    ].sort();
    if (actionFilter) {
      const current = actionFilter.value;
      actionFilter.innerHTML =
        '<option value="">All Actions</option>' +
        actions
          .map(
            (action) =>
              `<option value="${esc(action)}"${current === action ? ' selected' : ''}>${esc(
                action
              )}</option>`
          )
          .join('');
    }
    if (statusFilter) {
      const current = statusFilter.value;
      statusFilter.innerHTML =
        '<option value="">All Statuses</option>' +
        statuses
          .map(
            (status) =>
              `<option value="${esc(status)}"${current === status ? ' selected' : ''}>${esc(
                status
              )}</option>`
          )
          .join('');
    }
  }

  function filteredActivityRecords() {
    const filters = activityFilters();
    return activityRecords.filter((item) => {
      const action = String(item.action || '');
      const status = String(item.status || '');
      const itemDate = dateKey(item.createdAt);
      const searchable = [action, status, item.message, item.fullName, item.username]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      if (filters.search && !searchable.includes(filters.search)) return false;
      if (filters.action && action !== filters.action) return false;
      if (filters.status && status !== filters.status) return false;
      if (filters.dateFrom && itemDate && itemDate < filters.dateFrom) return false;
      if (filters.dateTo && itemDate && itemDate > filters.dateTo) return false;
      return true;
    });
  }

  function renderSecurityActivity() {
    const log = $id('userActivityLog');
    if (!log) return;
    const activity = filteredActivityRecords();
    if (!activityRecords.length) {
      log.textContent = 'No security activity yet.';
      return;
    }
    if (!activity.length) {
      log.textContent = 'No activity matches the current filters.';
      return;
    }
    log.innerHTML = activity
      .map(
        (item) => `
          <div>
            <h3>${esc(item.action)} <small>${esc(item.status)}</small></h3>
            <p>${esc(item.message || '-')}</p>
            <small>${esc(item.fullName || item.username || 'System')} - ${esc(dateOnly(item.createdAt))}</small>
          </div>
        `
      )
      .join('');
  }

  async function loadSecurityActivity() {
    const policy = $id('userSecurityPolicy');
    const log = $id('userActivityLog');
    if (policy) policy.innerHTML = '<article><span>Status</span><strong>Loading</strong></article>';
    if (log) log.textContent = 'Loading activity...';
    const result = await A().securityActivity();
    if (!result?.ok) {
      activityRecords = [];
      activityPolicy = null;
      if (policy) policy.innerHTML = '';
      if (log) log.textContent = result?.message || 'Unable to load activity.';
      return;
    }
    activityPolicy = result.policy || {};
    activityRecords = Array.isArray(result.activity) ? result.activity : [];
    updateActivityFilterOptions();
    const p = activityPolicy;
    if (policy) {
      policy.innerHTML = `
        <article><span>Password Length</span><strong>${esc(p.minPasswordLength || 8)}+</strong></article>
        <article><span>Failed Attempts</span><strong>${esc(p.maxFailedLoginAttempts || 5)}</strong></article>
        <article><span>Lock Window</span><strong>${esc(p.lockMinutes || 15)} min</strong></article>
      `;
    }
    const activity = filteredActivityRecords();
    if (log) {
      log.innerHTML = activity.length
        ? activity
            .map(
              (item) => `
                <div>
                  <h3>${esc(item.action)} <small>${esc(item.status)}</small></h3>
                  <p>${esc(item.message || '-')}</p>
                  <small>${esc(item.fullName || item.username || 'System')} · ${esc(
                    dateOnly(item.createdAt)
                  )}</small>
                </div>
              `
            )
            .join('')
        : activityRecords.length
          ? 'No activity matches the current filters.'
          : 'No security activity yet.';
    }
  }

  function resetRoleForm() {
    editingRole = null;
    $id('roleId').value = '';
    $id('roleName').value = '';
    $id('roleDescription').value = '';
    $id('roleActive').checked = true;
    $id('roleActive').disabled = true;
    $id('roleActive').title = 'Role status can be changed when editing a custom role.';
    $id('saveRoleButton').textContent = 'Save Role';
    $id('roleMessage')?.classList.add('hidden');
    recoverFocus($id('roleName'));
  }

  function openRoleEditor(role) {
    if (!role || role.isSystem) return;
    editingRole = role;
    $id('roleId').value = role.id;
    $id('roleName').value = role.name || '';
    $id('roleDescription').value = role.description || '';
    $id('roleActive').checked = role.isActive !== false;
    $id('roleActive').disabled = false;
    $id('roleActive').title = '';
    $id('saveRoleButton').textContent = 'Update Role';
    $id('roleMessage')?.classList.add('hidden');
    recoverFocus($id('roleName'));
  }

  function rolePayload() {
    return {
      name: $id('roleName')?.value || '',
      description: $id('roleDescription')?.value || '',
      isActive: Boolean($id('roleActive')?.checked),
    };
  }

  async function saveRole(event) {
    event.preventDefault();
    const id = $id('roleId')?.value;
    const isEdit = Boolean(id);
    const payload = rolePayload();
    if (!payload.name.trim()) {
      showMessage('Role name is required.', 'error', 'roleMessage');
      return;
    }
    if (isEdit && editingRole?.isSystem) {
      showMessage('System roles are read-only.', 'error', 'roleMessage');
      return;
    }
    const button = $id('saveRoleButton');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      if (isEdit && editingRole?.isActive !== false && payload.isActive === false) {
        const assignedUsers = Number(editingRole.userCount || 0);
        const confirmed = await window.posApi.dialog.confirm(
          assignedUsers > 0
            ? `Deactivate ${editingRole.name}? ${assignedUsers} assigned user${
                assignedUsers === 1 ? '' : 's'
              } may lose access.`
            : `Deactivate ${editingRole.name}?`
        );
        recoverFocus($id('roleActive'));
        if (!confirmed) return;
      }
      const result = isEdit ? await A().updateRole(id, payload) : await A().createRole(payload);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save role.', 'error', 'roleMessage');
        return;
      }
      resetRoleForm();
      showMessage(result.message || 'Role saved.');
      await loadRoles();
      await loadUsers();
    } finally {
      if (button) button.disabled = false;
    }
  }

  function openUserEditor(user = null) {
    const modal = $id('userEditorModal');
    if (!modal) return;
    editingUser = user;
    $id('userEditorTitle').textContent = user ? 'Edit User' : 'Add User';
    $id('userId').value = user?.id || '';
    $id('userFullName').value = user?.fullName || '';
    $id('userUsername').value = user?.username || '';
    $id('userEmail').value = user?.email || '';
    $id('userPhone').value = user?.phone || '';
    $id('userRole').innerHTML = roleOptions(user?.roleId || '');
    $id('userPassword').value = '';
    $id('userPassword').disabled = Boolean(user);
    $id('userPassword').required = !user;
    $id('userPassword').placeholder = user
      ? 'Use Pass action to reset password'
      : 'Password for new user';
    $id('userActive').checked = user ? Boolean(user.isActive) : true;
    $id('userMessage')?.classList.add('hidden');
    modal.classList.remove('hidden');
    setTimeout(() => $id('userFullName')?.focus(), 30);
  }

  function closeUserEditor() {
    editingUser = null;
    $id('userEditorModal')?.classList.add('hidden');
    recoverFocus($id('userAddButton'));
  }

  function userPayload(isEdit) {
    const payload = {
      fullName: $id('userFullName')?.value || '',
      username: $id('userUsername')?.value || '',
      email: $id('userEmail')?.value || '',
      phone: $id('userPhone')?.value || '',
      roleId: $id('userRole')?.value || '',
    };
    const isActive = Boolean($id('userActive')?.checked);
    if (!isEdit || isActive !== Boolean(editingUser?.isActive)) payload.isActive = isActive;
    const password = $id('userPassword')?.value || '';
    if (!isEdit && password) payload.password = password;
    return payload;
  }

  async function saveUser(event) {
    event.preventDefault();
    const id = $id('userId')?.value;
    const isEdit = Boolean(id);
    const password = $id('userPassword')?.value || '';
    if (!isEdit && !password.trim()) {
      showMessage('Password is required for a new user.', 'error', 'userMessage');
      return;
    }
    if (!isEdit && password.length < 8) {
      showMessage('Password must be at least 8 characters.', 'error', 'userMessage');
      return;
    }
    const payload = userPayload(isEdit);
    const button = $id('saveUserButton');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      if (isEdit && editingUser && String(payload.roleId) !== String(editingUser.roleId || '')) {
        const confirmed = await window.posApi.dialog.confirm(
          `Change role for ${editingUser.fullName || editingUser.username}? This may change their access.`
        );
        recoverFocus($id('userRole'));
        if (!confirmed) return;
      }
      const result = id ? await A().updateUser(id, payload) : await A().createUser(payload);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save user.', 'error', 'userMessage');
        return;
      }
      closeUserEditor();
      showMessage(result.message || 'User saved.');
      await loadUsers();
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function setUserStatus(user) {
    const nextActive = !user.isActive;
    const action = nextActive ? 'activate' : 'deactivate';
    const confirmed = await window.posApi.dialog.confirm(
      `Are you sure you want to ${action} ${user.fullName || user.username}?`
    );
    recoverFocus($id('userSearch'));
    if (!confirmed) return;
    const result = await A().setUserActive(user.id, nextActive);
    if (!result?.ok) {
      showMessage(result?.message || 'Unable to update user status.', 'error');
      return;
    }
    showMessage(result.message || 'User status updated.');
    await loadUsers();
  }

  function openPasswordModal(user) {
    const modal = $id('userPasswordModal');
    if (!modal) return;
    $id('passwordUserId').value = user.id;
    $id('passwordUserLabel').textContent = `Reset password for ${user.fullName || user.username}`;
    $id('newUserPassword').value = '';
    $id('confirmUserPassword').value = '';
    $id('userPasswordMessage')?.classList.add('hidden');
    modal.classList.remove('hidden');
    setTimeout(() => $id('newUserPassword')?.focus(), 30);
  }

  function closePasswordModal() {
    $id('userPasswordModal')?.classList.add('hidden');
    recoverFocus($id('userSearch'));
  }

  async function savePassword(event) {
    event.preventDefault();
    const userId = $id('passwordUserId')?.value;
    const password = $id('newUserPassword')?.value || '';
    const confirmPassword = $id('confirmUserPassword')?.value || '';
    if (!password.trim()) {
      showMessage('Password is required.', 'error', 'userPasswordMessage');
      return;
    }
    if (password.length < 8) {
      showMessage('Password must be at least 8 characters.', 'error', 'userPasswordMessage');
      return;
    }
    if (password !== confirmPassword) {
      showMessage('Passwords do not match.', 'error', 'userPasswordMessage');
      return;
    }
    const confirmed = await window.posApi.dialog.confirm(
      'Reset this user password now? The current password will no longer work.'
    );
    recoverFocus($id('newUserPassword'));
    if (!confirmed) return;
    const button = $id('saveUserPasswordButton');
    if (button) button.disabled = true;
    const result = await A().resetPassword(userId, password);
    if (button) button.disabled = false;
    if (!result?.ok) {
      showMessage(result?.message || 'Unable to reset password.', 'error', 'userPasswordMessage');
      return;
    }
    closePasswordModal();
    showMessage(result.message || 'Password reset.');
  }

  function switchTab(tab) {
    document.querySelectorAll('.userAdminTab').forEach((button) => {
      button.classList.toggle('active', button.dataset.userAdminTab === tab);
    });
    document.querySelectorAll('.userAdminPanel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.userAdminPanel !== tab);
    });
    if (tab === 'roles') loadRoles().catch(() => {});
    if (tab === 'permissions') {
      loadRoles()
        .then(() => {
          renderPermissionRoleList();
          if (selectedPermissionRoleId) return loadPermissionsForRole(selectedPermissionRoleId);
          updatePermissionSaveButton(null);
          return null;
        })
        .catch(() => {});
    }
    if (tab === 'activity') loadSecurityActivity().catch(() => {});
  }

  function disablePhaseTwoControls() {
    document.querySelectorAll('[data-user-admin-tab="map"], [data-page-tool]').forEach((button) => {
      button.disabled = true;
      if (!button.title) button.title = 'Unavailable';
      if (!button.textContent.includes('Unavailable'))
        button.textContent = `${button.textContent} · Unavailable`;
    });
    const selectAll = document.querySelector('.epos-users-table-wrap thead input[type="checkbox"]');
    if (selectAll) {
      selectAll.disabled = true;
      selectAll.title = 'Bulk actions are Phase 2';
    }
    document.querySelectorAll('.epos-users-status-pills button[disabled]').forEach((button) => {
      button.title = 'Unavailable';
      button.setAttribute('aria-disabled', 'true');
    });
  }

  function bindEvents() {
    $id('userAddButton')?.addEventListener('click', () => openUserEditor());
    $id('closeUserEditorButton')?.addEventListener('click', closeUserEditor);
    $id('userForm')?.addEventListener('submit', saveUser);
    $id('closeUserPasswordButton')?.addEventListener('click', closePasswordModal);
    $id('cancelUserPasswordButton')?.addEventListener('click', closePasswordModal);
    $id('userPasswordForm')?.addEventListener('submit', savePassword);
    $id('roleForm')?.addEventListener('submit', saveRole);
    $id('resetRoleButton')?.addEventListener('click', resetRoleForm);
    $id('saveRolePermissionsButton')?.addEventListener('click', saveRolePermissions);
    $id('refreshUserActivityButton')?.addEventListener('click', () => {
      loadSecurityActivity().catch(() => {
        const log = $id('userActivityLog');
        if (log) log.textContent = 'Unable to refresh activity.';
      });
    });
    $id('activitySearch')?.addEventListener('input', renderSecurityActivity);
    $id('activityActionFilter')?.addEventListener('change', renderSecurityActivity);
    $id('activityStatusFilter')?.addEventListener('change', renderSecurityActivity);
    $id('activityDateFrom')?.addEventListener('change', renderSecurityActivity);
    $id('activityDateTo')?.addEventListener('change', renderSecurityActivity);
    $id('resetUserButton')?.addEventListener('click', () => {
      const id = $id('userId')?.value;
      const user = users.find((item) => String(item.id) === String(id));
      openUserEditor(user || null);
    });
    $id('userSearch')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadUsers, 250);
    });
    $id('userRoleFilter')?.addEventListener('change', loadUsers);
    $id('userStatusFilter')?.addEventListener('change', loadUsers);
    document.querySelectorAll('[data-user-status-shortcut]').forEach((button) => {
      button.addEventListener('click', () => {
        $id('userStatusFilter').value = button.dataset.userStatusShortcut || '';
        loadUsers();
      });
    });
    document.querySelectorAll('.userAdminTab:not(:disabled)').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.userAdminTab || 'users'));
    });
    $id('userTableBody')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-user-action]');
      if (!button) return;
      const user = users.find((item) => String(item.id) === String(button.dataset.userId));
      if (!user) return;
      if (button.dataset.userAction === 'edit') openUserEditor(user);
      if (button.dataset.userAction === 'status') setUserStatus(user);
      if (button.dataset.userAction === 'password') openPasswordModal(user);
    });
    $id('roleList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-role-action]');
      if (!button) return;
      const role = roles.find((item) => String(item.id) === String(button.dataset.roleId));
      if (!role) return;
      if (button.dataset.roleAction === 'edit') openRoleEditor(role);
    });
    $id('permissionRoleList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-permission-role-id]');
      if (!button) return;
      loadPermissionsForRole(button.dataset.permissionRoleId).catch(() => {
        const matrix = $id('permissionMatrix');
        if (matrix) matrix.textContent = 'Unable to load permissions.';
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeUserEditor();
        closePasswordModal();
      }
    });
  }

  async function initAccessControlModule() {
    if (initialized) {
      await loadUsers();
      return;
    }
    initialized = true;
    disablePhaseTwoControls();
    bindEvents();
    await loadRoles();
    await loadUsers();
  }

  window.initAccessControlModule = initAccessControlModule;
})();
