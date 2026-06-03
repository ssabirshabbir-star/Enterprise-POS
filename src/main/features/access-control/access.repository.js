const bcrypt = require('bcryptjs');
const { getPool, withTransaction } = require('../../database/connection');

function mapUser(row) {
  return row && {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    roleId: row.role_id,
    role: row.role_name,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  };
}

function mapRole(row) {
  return row && {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    isActive: row.is_active,
    userCount: Number(row.user_count || 0)
  };
}

async function listUsers(filters = {}) {
  const search = `%${String(filters.search || '').trim()}%`;
  const roleId = filters.roleId ? Number(filters.roleId) : null;
  const status = filters.status || '';
  const result = await getPool().query(
    `
      SELECT users.id, users.username, users.email, users.full_name, users.phone, users.role_id,
             users.is_active, users.last_login_at, users.created_at, roles.name AS role_name
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE ($1 = '%%' OR users.username ILIKE $1 OR users.email ILIKE $1 OR users.full_name ILIKE $1 OR COALESCE(users.phone, '') ILIKE $1)
        AND ($2::int IS NULL OR users.role_id = $2)
        AND ($3::text = '' OR ($3 = 'active' AND users.is_active = TRUE) OR ($3 = 'inactive' AND users.is_active = FALSE))
      ORDER BY users.created_at DESC
      LIMIT 500
    `,
    [search, roleId, status]
  );
  return result.rows.map(mapUser);
}

async function activeAdminCount(excludingUserId = null) {
  const result = await getPool().query(
    `
      SELECT COUNT(*)::int AS count
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.is_active = TRUE AND roles.name = 'Admin' AND ($1::int IS NULL OR users.id <> $1)
    `,
    [excludingUserId]
  );
  return result.rows[0]?.count || 0;
}

async function userRoleName(userId) {
  const result = await getPool().query(
    'SELECT roles.name FROM users INNER JOIN roles ON roles.id = users.role_id WHERE users.id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0]?.name || null;
}

async function roleName(roleId) {
  const result = await getPool().query('SELECT name FROM roles WHERE id = $1 LIMIT 1', [roleId]);
  return result.rows[0]?.name || null;
}

async function createUser(payload) {
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const result = await getPool().query(
    `
      INSERT INTO users (username, email, full_name, phone, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [payload.username, payload.email, payload.fullName, payload.phone || null, passwordHash, payload.roleId, payload.isActive !== false]
  );
  return result.rows[0].id;
}

async function updateUser(id, payload) {
  const result = await getPool().query(
    `
      UPDATE users
      SET username = $2, email = $3, full_name = $4, phone = $5, role_id = $6, is_active = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [id, payload.username, payload.email, payload.fullName, payload.phone || null, payload.roleId, payload.isActive !== false]
  );
  return result.rowCount > 0;
}

async function setUserActive(id, isActive) {
  const result = await getPool().query('UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING id', [id, isActive]);
  return result.rowCount > 0;
}

async function resetPassword(id, password) {
  const hash = await bcrypt.hash(password, 12);
  const result = await getPool().query(
    `
      UPDATE users
      SET password_hash = $2, failed_login_attempts = 0, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [id, hash]
  );
  return result.rowCount > 0;
}

async function listRoles() {
  const result = await getPool().query(
    `
      SELECT roles.*, COUNT(users.id)::int AS user_count
      FROM roles
      LEFT JOIN users ON users.role_id = roles.id
      GROUP BY roles.id
      ORDER BY roles.is_system DESC, roles.name ASC
    `
  );
  return result.rows.map(mapRole);
}

async function createRole(payload) {
  const result = await getPool().query(
    'INSERT INTO roles (name, description, is_system, is_active) VALUES ($1, $2, FALSE, TRUE) RETURNING id',
    [payload.name, payload.description || null]
  );
  return result.rows[0].id;
}

async function updateRole(id, payload) {
  const result = await getPool().query(
    'UPDATE roles SET name = $2, description = $3, is_active = $4, updated_at = NOW() WHERE id = $1 RETURNING id',
    [id, payload.name, payload.description || null, payload.isActive !== false]
  );
  return result.rowCount > 0;
}

async function permissionsByRole(roleId) {
  const [permissions, selected] = await Promise.all([
    getPool().query('SELECT * FROM permissions WHERE is_active = TRUE ORDER BY category, permission_key'),
    getPool().query('SELECT permission_id FROM role_permissions WHERE role_id = $1', [roleId])
  ]);
  const selectedIds = new Set(selected.rows.map((row) => row.permission_id));
  return permissions.rows.map((row) => ({
    id: row.id,
    key: row.permission_key,
    category: row.category,
    label: row.label,
    selected: selectedIds.has(row.id)
  }));
}

async function assignPermissions(roleId, permissionIds) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const permissionId of permissionIds) {
      await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, permissionId]);
    }
  });
}

module.exports = {
  activeAdminCount,
  assignPermissions,
  createRole,
  createUser,
  listRoles,
  listUsers,
  permissionsByRole,
  resetPassword,
  setUserActive,
  updateRole,
  updateUser,
  userRoleName,
  roleName
};
