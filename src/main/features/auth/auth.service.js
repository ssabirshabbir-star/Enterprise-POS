const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiry,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../security/token.service');

const sessionStore = require('../../security/session-store');
const activityRepository = require('../activity/activity.repository');
const authRepository = require('./auth.repository');
const { canRoleAccess } = require('./rbac');
const { logError } = require('../../utils/safe-logger');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

function sanitizeProfile(user = {}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions || [],
  };
}

function validateLoginInput({ username, password }) {
  const normalizedUsername = String(username || '')
    .trim()
    .toLowerCase();
  const rawPassword = String(password || '');

  if (!normalizedUsername || !rawPassword) {
    return { ok: false, message: 'Please enter username and password.' };
  }

  if (!/^[a-z0-9._-]{3,80}$/.test(normalizedUsername)) {
    return { ok: false, message: 'Please enter a valid username.' };
  }

  return { ok: true, username: normalizedUsername, password: rawPassword };
}

function cryptoRandomId() {
  return crypto.randomUUID();
}

async function auditAuthEvent({ userId = null, action, status, message, metadata = {} }) {
  try {
    await activityRepository.createActivityLog({
      userId,
      action,
      status,
      message,
      metadata,
    });
  } catch (err) {
    logError('Auth audit log failed:', err);
  }
}

async function cleanupStaleRefreshTokensSafely() {
  try {
    const result = await authRepository.cleanupStaleRefreshTokens();
    if (result?.total > 0) {
      await auditAuthEvent({
        action: 'auth.refreshToken.cleanup',
        status: 'success',
        message: 'Stale refresh tokens cleaned up',
        metadata: {
          expired: result.expired || 0,
          revoked: result.revoked || 0,
          total: result.total,
        },
      });
    }
  } catch (err) {
    logError('Refresh token cleanup failed:', err);
  }
}

async function persistFreshSession(user, oldRefreshTokenId = null) {
  try {
    const accessToken = createAccessToken(user);
    const expiresAt = getRefreshTokenExpiry();
    const tokenId = cryptoRandomId();

    const refreshToken = createRefreshToken({ user, tokenId });
    const tokenHash = hashToken(refreshToken);

    if (oldRefreshTokenId) {
      await authRepository.rotateRefreshToken({
        oldTokenId: oldRefreshTokenId,
        newTokenId: tokenId,
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    } else {
      await authRepository.createRefreshToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        tokenId,
      });
    }

    sessionStore.setAccessToken(accessToken);
    sessionStore.persistRefreshToken(refreshToken);

    return { accessToken, refreshToken };
  } catch (err) {
    logError('Session persist failed:', err);
    return null;
  }
}

async function login({ username, password }) {
  try {
    const input = validateLoginInput({ username, password });
    if (!input.ok) return input;

    const user = await authRepository.findUserByUsername(input.username);

    if (!user || !user.isActive) {
      await auditAuthEvent({
        action: 'auth.login',
        status: 'failed',
        message: 'Login failed',
        metadata: {
          username: input.username,
          reason: user ? 'inactive_user' : 'invalid_credentials',
        },
      });
      return { ok: false, message: 'Invalid username or password.' };
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await auditAuthEvent({
        userId: user.id,
        action: 'auth.login',
        status: 'blocked',
        message: 'Account locked login attempt',
        metadata: { username: input.username, reason: 'account_locked' },
      });
      return {
        ok: false,
        message: 'Account is temporarily locked.',
      };
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValidPassword) {
      await authRepository.markLoginFailure(
        input.username,
        MAX_FAILED_LOGIN_ATTEMPTS,
        LOGIN_LOCK_MINUTES
      );
      await auditAuthEvent({
        userId: user.id,
        action: 'auth.login',
        status: 'failed',
        message: 'Login failed',
        metadata: { username: input.username, reason: 'invalid_password' },
      });

      return { ok: false, message: 'Invalid username or password.' };
    }

    await authRepository.markLoginSuccess(user.id);

    await persistFreshSession(user);

    user.permissions = await authRepository.getUserPermissions(user.id);
    await auditAuthEvent({
      userId: user.id,
      action: 'auth.login',
      status: 'success',
      message: 'Login successful',
      metadata: { username: user.username },
    });
    await cleanupStaleRefreshTokensSafely();

    return {
      ok: true,
      profile: sanitizeProfile(user),
    };
  } catch (err) {
    logError('LOGIN ERROR:', err);
    return { ok: false, message: 'Login service temporarily unavailable.' };
  }
}

async function refreshSession() {
  try {
    const refreshToken = sessionStore.readRefreshToken();

    if (!refreshToken) {
      await auditAuthEvent({
        action: 'auth.refresh',
        status: 'failed',
        message: 'Session refresh failed',
        metadata: { reason: 'no_session' },
      });
      return { ok: false, message: 'No session found.' };
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      await auditAuthEvent({
        action: 'auth.refresh',
        status: 'failed',
        message: 'Session refresh failed',
        metadata: { reason: 'invalid_refresh_token' },
      });
      sessionStore.clearSession();
      return { ok: false, message: 'Session expired.' };
    }

    const savedToken = await authRepository.findRefreshTokenById(payload.jti);

    if (!savedToken || savedToken.revoked_at) {
      await auditAuthEvent({
        userId: Number(payload.sub) || null,
        action: 'auth.refresh',
        status: 'failed',
        message: 'Session refresh failed',
        metadata: {
          reason: savedToken?.revoked_at ? 'revoked_refresh_token' : 'missing_refresh_token',
        },
      });
      sessionStore.clearSession();
      return { ok: false, message: 'Session invalid.' };
    }

    const user = await authRepository.findUserById(Number(payload.sub));

    if (!user || !user.isActive) {
      await auditAuthEvent({
        userId: Number(payload.sub) || null,
        action: 'auth.refresh',
        status: 'failed',
        message: 'Session refresh failed',
        metadata: { reason: user ? 'inactive_user' : 'missing_user' },
      });
      sessionStore.clearSession();
      return { ok: false, message: 'User inactive.' };
    }

    await persistFreshSession(user, payload.jti);

    user.permissions = await authRepository.getUserPermissions(user.id);
    await auditAuthEvent({
      userId: user.id,
      action: 'auth.refresh',
      status: 'success',
      message: 'Session refreshed',
      metadata: { username: user.username },
    });
    await cleanupStaleRefreshTokensSafely();

    return {
      ok: true,
      profile: sanitizeProfile(user),
    };
  } catch (err) {
    logError('REFRESH ERROR:', err);
    sessionStore.clearSession();
    return { ok: false, message: 'Session expired.' };
  }
}

async function getProfile() {
  try {
    const accessToken = sessionStore.getAccessToken();

    if (!accessToken) {
      return await refreshSession();
    }

    let payload;
    try {
      payload = verifyAccessToken(accessToken);
    } catch {
      return await refreshSession();
    }

    const user = await authRepository.findUserById(Number(payload.sub));

    if (!user || !user.isActive) {
      return await refreshSession();
    }

    user.permissions = await authRepository.getUserPermissions(user.id);

    return {
      ok: true,
      profile: sanitizeProfile(user),
    };
  } catch (err) {
    logError('PROFILE ERROR:', err);
    return await refreshSession();
  }
}

async function logout() {
  try {
    const refreshToken = sessionStore.readRefreshToken();

    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      await authRepository.revokeRefreshToken(payload.jti);
      await auditAuthEvent({
        userId: Number(payload.sub) || null,
        action: 'auth.logout',
        status: 'success',
        message: 'Logout successful',
        metadata: { username: payload.username },
      });
    }

    await cleanupStaleRefreshTokensSafely();
    sessionStore.clearSession();
    return { ok: true };
  } catch (err) {
    sessionStore.clearSession();
    return { ok: true };
  }
}

async function canAccess(route) {
  const profileResult = await getProfile();

  if (!profileResult.ok) {
    return { ok: false, allowed: false };
  }

  const permissions = await authRepository.getUserPermissions(profileResult.profile.id);

  return {
    ok: true,
    allowed: canRoleAccess(profileResult.profile.role, route, permissions),
    profile: { ...profileResult.profile, permissions },
  };
}

module.exports = {
  login,
  refreshSession,
  getProfile,
  logout,
  canAccess,
};
