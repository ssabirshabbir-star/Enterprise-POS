const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiry,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken
} = require('../../security/token.service');

const sessionStore = require('../../security/session-store');
const activityRepository = require('../activity/activity.repository');
const authRepository = require('./auth.repository');
const { canRoleAccess } = require('./rbac');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

function sanitizeProfile(user = {}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions || []
  };
}

function validateLoginInput({ username, password }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
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
        expiresAt
      });
    } else {
      await authRepository.createRefreshToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        tokenId
      });
    }

    sessionStore.setAccessToken(accessToken);
    sessionStore.persistRefreshToken(refreshToken);

    return { accessToken, refreshToken };
  } catch (err) {
    console.error('Session persist failed:', err);
    return null;
  }
}

async function login({ username, password }) {
  try {
    const input = validateLoginInput({ username, password });
    if (!input.ok) return input;

    const user = await authRepository.findUserByUsername(input.username);

    if (!user || !user.isActive) {
      return { ok: false, message: 'Invalid username or password.' };
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return {
        ok: false,
        message: 'Account is temporarily locked.'
      };
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValidPassword) {
      await authRepository.markLoginFailure(
        input.username,
        MAX_FAILED_LOGIN_ATTEMPTS,
        LOGIN_LOCK_MINUTES
      );

      return { ok: false, message: 'Invalid username or password.' };
    }

    await authRepository.markLoginSuccess(user.id);

    await persistFreshSession(user);

    user.permissions = await authRepository.getUserPermissions(user.id);

    return {
      ok: true,
      profile: sanitizeProfile(user)
    };

  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return { ok: false, message: 'Login service temporarily unavailable.' };
  }
}

async function refreshSession() {
  try {
    const refreshToken = sessionStore.readRefreshToken();

    if (!refreshToken) {
      return { ok: false, message: 'No session found.' };
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      sessionStore.clearSession();
      return { ok: false, message: 'Session expired.' };
    }

    const savedToken = await authRepository.findRefreshTokenById(payload.jti);

    if (!savedToken || savedToken.revoked_at) {
      sessionStore.clearSession();
      return { ok: false, message: 'Session invalid.' };
    }

    const user = await authRepository.findUserById(Number(payload.sub));

    if (!user || !user.isActive) {
      sessionStore.clearSession();
      return { ok: false, message: 'User inactive.' };
    }

    await persistFreshSession(user, payload.jti);

    user.permissions = await authRepository.getUserPermissions(user.id);

    return {
      ok: true,
      profile: sanitizeProfile(user)
    };

  } catch (err) {
    console.error('REFRESH ERROR:', err);
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
      profile: sanitizeProfile(user)
    };

  } catch (err) {
    console.error('PROFILE ERROR:', err);
    return await refreshSession();
  }
}

async function logout() {
  try {
    const refreshToken = sessionStore.readRefreshToken();

    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      await authRepository.revokeRefreshToken(payload.jti);
    }

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
    profile: { ...profileResult.profile, permissions }
  };
}

module.exports = {
  login,
  refreshSession,
  getProfile,
  logout,
  canAccess
};