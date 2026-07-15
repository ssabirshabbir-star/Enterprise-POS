const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'src/main/features/access-control/index.html');
const cssPath = path.join(root, 'src/main/features/access-control/access-control.css');
const rendererPath = path.join(root, 'src/main/features/access-control/access-control.renderer.js');
const repositoryPath = path.join(root, 'src/main/features/access-control/access.repository.js');
const servicePath = path.join(root, 'src/main/features/access-control/access.service.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('User Management removes duplicate status shortcut row and keeps status dropdown filtering', () => {
  const html = read(htmlPath);
  const renderer = read(rendererPath);

  assert.doesNotMatch(html, /epos-users-status-pills/);
  assert.doesNotMatch(html, /data-user-status-shortcut/);
  assert.doesNotMatch(renderer, /data-user-status-shortcut/);
  assert.doesNotMatch(renderer, /userPill(All|Active|Inactive|Online)/);

  assert.match(html, /id="userStatusFilter"[\s\S]*<option value="">All Status<\/option>/);
  assert.match(html, /id="userStatusFilter"[\s\S]*<option value="active">Active<\/option>/);
  assert.match(html, /id="userStatusFilter"[\s\S]*<option value="inactive">Inactive<\/option>/);
  assert.match(renderer, /\$id\('userStatusFilter'\)\?\.addEventListener\('change', loadUsers\)/);
});

test('User Management summary cards include every certified status metric once', () => {
  const html = read(htmlPath);
  const labels = [
    'Total Users',
    'Active Users',
    'Inactive Users',
    'User Roles',
    'Online Now',
    'Locked Users',
  ];

  for (const label of labels) {
    const matches = html.match(new RegExp(label, 'g')) || [];
    assert.equal(matches.length, 1, `${label} should appear exactly once`);
  }

  assert.match(html, /id="userOnlineCount"/);
  assert.match(html, /id="userLockedCount"/);
});

test('User Management summary counts are repository-backed and not visible-row totals', () => {
  const renderer = read(rendererPath);
  const repository = read(repositoryPath);
  const service = read(servicePath);

  assert.match(service, /accessRepository\.userSummary\(\)/);
  assert.match(repository, /async function userSummary\(\)/);
  assert.match(
    repository,
    /COUNT\(\*\) FILTER \(WHERE users\.is_active = TRUE\)::int AS active_users/
  );
  assert.match(repository, /locked_until IS NOT NULL AND users\.locked_until > NOW\(\)/);
  assert.match(repository, /COUNT\(DISTINCT refresh_tokens\.user_id\)::int/);
  assert.match(renderer, /userSummary = result\.summary \|\| userSummary/);
  assert.doesNotMatch(renderer, /const total = users\.length;\s*const active = users\.filter/);
});

test('User Management compact summary layout and table shell contract remain intact', () => {
  const css = read(cssPath);
  const html = read(htmlPath);
  const renderer = read(rendererPath);

  assert.match(
    css,
    /\.epos-users-stats\s*{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/
  );
  assert.match(css, /\.epos-users-stats article\s*{[\s\S]*?min-height:\s*58px;/);
  assert.match(css, /\.epos-users-page\s*{[\s\S]*?gap:\s*5px;/);
  assert.doesNotMatch(css, /epos-users-status-pills/);

  assert.match(html, /class="epos-users-table-wrap"/);
  assert.match(html, /id="userTableBody"/);
  assert.match(html, /class="epos-users-footer"/);
  assert.match(html, /id="userAddButton"/);
  assert.match(renderer, /data-user-action="edit"/);
  assert.match(renderer, /data-user-action="password"/);
  assert.match(renderer, /data-user-action="status"/);
});

test('User Management filter row gives search the flexible track and preserves filters', () => {
  const css = read(cssPath);
  const html = read(htmlPath);

  const searchIndex = html.indexOf('id="userSearch"');
  const roleIndex = html.indexOf('id="userRoleFilter"');
  const statusIndex = html.indexOf('id="userStatusFilter"');
  const outletIndex = html.indexOf('All Outlets');
  const departmentIndex = html.indexOf('All Departments');
  assert(searchIndex > -1);
  assert(searchIndex < roleIndex);
  assert(roleIndex < statusIndex);
  assert(statusIndex < outletIndex);
  assert(outletIndex < departmentIndex);

  assert.match(
    css,
    /\.epos-users-filters\s*{[\s\S]*?grid-template-columns:\s*minmax\(300px, 420px\) repeat\(4, minmax\(108px, 1fr\)\)/
  );
  assert.match(html, /<span>Search User<\/span>/);
  assert.match(html, /<span>Role<\/span>/);
  assert.match(html, /<span>Status<\/span>/);
  assert.match(html, /<span>Outlet<\/span>/);
  assert.match(html, /<span>Department<\/span>/);
});

test('User Management action toolbar widens key buttons without forcing page overflow', () => {
  const css = read(cssPath);
  const html = read(htmlPath);

  assert.match(html, /data-user-admin-tab="roles"[^>]*>Roles<\/button>/);
  assert.match(html, /data-page-tool="users" data-tool-action="import"[^>]*>Import<\/button>/);
  assert.match(html, /data-page-tool="users" data-tool-action="excel"[^>]*>Export<\/button>/);
  assert.match(
    css,
    /\.epos-users-actions \.epos-users-action\[data-user-admin-tab="roles"\],\s*\.epos-users-actions \.epos-users-action\[data-page-tool="users"\]\s*{[\s\S]*?padding-inline:\s*17px;/
  );
  assert.doesNotMatch(css, /epos-users-actions \.epos-users-action\s*{[\s\S]*?min-width:\s*92px;/);
  assert.doesNotMatch(
    css,
    /epos-users-actions \.epos-users-action\[data-user-admin-tab="roles"\],[^{]*\{[^}]*min-width:\s*102px;/
  );
});

test('User Management table uses one colgroup model and keeps actions inside the table', () => {
  const html = read(htmlPath);
  const css = read(cssPath);
  const renderer = read(rendererPath);

  assert.match(html, /<colgroup>[\s\S]*epos-users-col-actions[\s\S]*<\/colgroup>/);
  assert.match(css, /\.epos-users-table\s*{[\s\S]*?table-layout:\s*fixed;/);
  assert.match(
    css,
    /\.epos-users-table-wrap\s*{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overflow-x:\s*hidden;/
  );
  assert.match(css, /\.epos-users-col-actions\s*{\s*width:\s*17%;\s*}/);
  assert.match(css, /\.epos-users-row-actions\s*{[\s\S]*?justify-content:\s*flex-end;/);
  assert.match(css, /\.epos-users-icon-action\s*{[\s\S]*?white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /width:\s*25px;/);

  assert.match(renderer, /colspan="10"/);
  assert.match(renderer, /data-user-action="edit"/);
  assert.match(renderer, /data-user-action="password"/);
  assert.match(renderer, /data-user-action="status"/);
});

test('User Management removes only the low-value Outlet table column', () => {
  const html = read(htmlPath);
  const renderer = read(rendererPath);

  const headerBlock = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || '';
  assert.doesNotMatch(headerBlock, /<th>Outlet<\/th>/);
  assert.match(headerBlock, /<th>Department<\/th>/);
  assert.match(html, /All Outlets/);
  assert.match(html, /All Departments/);
  assert.doesNotMatch(renderer, /<td><span class="epos-users-subtext">Main<\/span><\/td>/);
  assert.match(renderer, /<td><span class="epos-users-subtext">General<\/span><\/td>/);
});
