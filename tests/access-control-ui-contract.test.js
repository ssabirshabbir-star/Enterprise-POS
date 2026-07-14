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
  assert.match(css, /\.epos-users-page\s*{[\s\S]*?gap:\s*6px;/);
  assert.doesNotMatch(css, /epos-users-status-pills/);

  assert.match(html, /class="epos-users-table-wrap"/);
  assert.match(html, /id="userTableBody"/);
  assert.match(html, /class="epos-users-footer"/);
  assert.match(html, /id="userAddButton"/);
  assert.match(renderer, /data-user-action="edit"/);
  assert.match(renderer, /data-user-action="password"/);
  assert.match(renderer, /data-user-action="status"/);
});
