(function AccessControlRendererModule() {
  'use strict';

  let initialized = false;
  let users = [];
  let roles = [];
  let messageTimer = null;
  let searchTimer = null;
  let editingUser = null;

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

  async function loadSecurityActivity() {
    const policy = $id('userSecurityPolicy');
    const log = $id('userActivityLog');
    if (policy) policy.innerHTML = '<article><span>Status</span><strong>Loading</strong></article>';
    const result = await A().securityActivity();
    if (!result?.ok) {
      if (policy) policy.innerHTML = '';
      if (log) log.textContent = result?.message || 'Unable to load activity.';
      return;
    }
    const p = result.policy || {};
    if (policy) {
      policy.innerHTML = `
        <article><span>Password Length</span><strong>${esc(p.minPasswordLength || 8)}+</strong></article>
        <article><span>Failed Attempts</span><strong>${esc(p.maxFailedLoginAttempts || 5)}</strong></article>
        <article><span>Lock Window</span><strong>${esc(p.lockMinutes || 15)} min</strong></article>
      `;
    }
    const activity = Array.isArray(result.activity) ? result.activity : [];
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
        : 'No security activity yet.';
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
    const payload = userPayload(Boolean(id));
    const result = id ? await A().updateUser(id, payload) : await A().createUser(payload);
    if (!result?.ok) {
      showMessage(result?.message || 'Unable to save user.', 'error', 'userMessage');
      return;
    }
    closeUserEditor();
    showMessage(result.message || 'User saved.');
    await loadUsers();
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
    if (tab === 'activity') loadSecurityActivity().catch(() => {});
  }

  function disablePhaseTwoControls() {
    document
      .querySelectorAll(
        '[data-user-admin-tab="roles"], [data-user-admin-tab="permissions"], [data-user-admin-tab="map"], [data-page-tool]'
      )
      .forEach((button) => {
        button.disabled = true;
        button.title = 'Phase 2';
        if (!button.textContent.includes('Phase 2'))
          button.textContent = `${button.textContent} · Phase 2`;
      });
    const selectAll = document.querySelector('.epos-users-table-wrap thead input[type="checkbox"]');
    if (selectAll) {
      selectAll.disabled = true;
      selectAll.title = 'Bulk actions are Phase 2';
    }
    document.querySelectorAll('.epos-users-status-pills button[disabled]').forEach((button) => {
      button.title = 'Phase 2';
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
