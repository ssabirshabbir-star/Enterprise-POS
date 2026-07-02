const { randomUUID } = require('crypto');
const { getPool, withTransaction } = require('../../database/connection');

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockedUntil: row.locked_until,
  };
}

async function findUserByUsername(username) {
  const result = await getPool().query(
    `
      SELECT users.id, users.username, users.email, users.full_name, users.password_hash, users.is_active,
             users.failed_login_attempts, users.locked_until, roles.name AS role
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE LOWER(users.username) = LOWER($1)
      LIMIT 1
    `,
    [username]
  );

  return mapUser(result.rows[0]);
}

async function getUserPermissions(userId) {
  const result = await getPool().query(
    `
      SELECT permissions.permission_key
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      INNER JOIN role_permissions ON role_permissions.role_id = roles.id
      INNER JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE users.id = $1 AND users.is_active = TRUE AND roles.is_active = TRUE AND permissions.is_active = TRUE
      ORDER BY permissions.permission_key ASC
    `,
    [userId]
  );
  return result.rows.map((row) => row.permission_key);
}

async function findUserById(userId) {
  const result = await getPool().query(
    `
      SELECT users.id, users.username, users.email, users.full_name, users.password_hash, users.is_active,
             users.failed_login_attempts, users.locked_until, roles.name AS role
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.id = $1
      LIMIT 1
    `,
    [userId]
  );

  return mapUser(result.rows[0]);
}

async function markLoginSuccess(userId) {
  await getPool().query(
    `
      UPDATE users
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function markLoginFailure(username, maxAttempts = 5, lockMinutes = 15) {
  const result = await getPool().query(
    `
      UPDATE users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= $2 THEN NOW() + ($3::text || ' minutes')::interval
            ELSE locked_until
          END,
          updated_at = NOW()
      WHERE LOWER(username) = LOWER($1)
      RETURNING failed_login_attempts, locked_until
    `,
    [username, maxAttempts, lockMinutes]
  );
  return result.rows[0] || null;
}

async function createRefreshToken({ tokenId = randomUUID(), userId, tokenHash, expiresAt }) {
  await getPool().query(
    `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [tokenId, userId, tokenHash, expiresAt]
  );

  return tokenId;
}

async function findRefreshTokenById(tokenId) {
  const result = await getPool().query(
    `
      SELECT id, user_id, token_hash, expires_at, revoked_at
      FROM refresh_tokens
      WHERE id = $1
      LIMIT 1
    `,
    [tokenId]
  );

  return result.rows[0] || null;
}

async function rotateRefreshToken({
  oldTokenId,
  newTokenId = randomUUID(),
  userId,
  tokenHash,
  expiresAt,
}) {
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(), last_used_at = NOW() WHERE id = $1 AND user_id = $2',
      [oldTokenId, userId]
    );

    await client.query(
      `
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [newTokenId, userId, tokenHash, expiresAt]
    );
  });

  return newTokenId;
}

async function revokeRefreshToken(tokenId) {
  if (!tokenId) {
    return;
  }

  await getPool().query(
    'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), last_used_at = NOW() WHERE id = $1',
    [tokenId]
  );
}

async function cleanupStaleRefreshTokens({ revokedRetentionDays = 7 } = {}) {
  const retentionDays = Number.isFinite(Number(revokedRetentionDays))
    ? Math.max(1, Number(revokedRetentionDays))
    : 7;
  return await withTransaction(async (client) => {
    const expired = await client.query(
      `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW()
        RETURNING id
      `
    );
    const revoked = await client.query(
      `
        DELETE FROM refresh_tokens
        WHERE revoked_at IS NOT NULL
          AND revoked_at < NOW() - ($1::text || ' days')::interval
        RETURNING id
      `,
      [retentionDays]
    );
    const expiredCount = expired.rowCount || 0;
    const revokedCount = revoked.rowCount || 0;
    return {
      expired: expiredCount,
      revoked: revokedCount,
      total: expiredCount + revokedCount,
    };
  });
}

async function listActiveSessions() {
  const result = await getPool().query(
    `
      SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.expires_at,
             refresh_tokens.revoked_at, refresh_tokens.created_at, refresh_tokens.last_used_at,
             users.username, users.full_name, users.email, users.is_active
      FROM refresh_tokens
      INNER JOIN users ON users.id = refresh_tokens.user_id
      ORDER BY
        CASE
          WHEN refresh_tokens.revoked_at IS NOT NULL THEN 2
          WHEN refresh_tokens.expires_at < NOW() THEN 1
          ELSE 0
        END ASC,
        refresh_tokens.created_at DESC
      LIMIT 200
    `
  );
  const now = new Date();
  return result.rows.map((row) => {
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const status = row.revoked_at ? 'Revoked' : expiresAt && expiresAt < now ? 'Expired' : 'Active';
    return {
      sessionId: row.id,
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      userActive: row.is_active,
      status,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  });
}

module.exports = {
  cleanupStaleRefreshTokens,
  createRefreshToken,
  findRefreshTokenById,
  findUserByUsername,
  getUserPermissions,
  findUserById,
  listActiveSessions,
  markLoginFailure,
  markLoginSuccess,
  revokeRefreshToken,
  rotateRefreshToken,
};
