const bcrypt = require('bcryptjs');
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

function sanitizeProfile(user) {
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

async function persistFreshSession(user, oldRefreshTokenId = null) {
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
    await authRepository.createRefreshToken({ userId: user.id, tokenHash, expiresAt, tokenId });
  }

  sessionStore.setAccessToken(accessToken);
  sessionStore.persistRefreshToken(refreshToken);

  return { accessToken, refreshToken };
}

function cryptoRandomId() {
  return require('crypto').randomUUID();
}

async function login({ username, password }) {
  const input = validateLoginInput({ username, password });
  if (!input.ok) {
    return { ok: false, message: input.message };
  }

  const user = await authRepository.findUserByUsername(input.username);
  if (!user || !user.isActive) {
    await activityRepository.createActivityLog({
      action: 'auth.login',
      status: 'failed',
      message: 'Invalid login attempt',
      metadata: { username: input.username }
    });
    return { ok: false, message: 'Invalid username or password.' };
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    await authRepository.markLoginFailure(input.username);
    await activityRepository.createActivityLog({
      userId: user.id,
      action: 'auth.login',
      status: 'failed',
      message: 'Invalid password',
      metadata: { username: input.username }
    });
    return { ok: false, message: 'Invalid username or password.' };
  }

  await authRepository.markLoginSuccess(user.id);
  await persistFreshSession(user);
  user.permissions = await authRepository.getUserPermissions(user.id);
  await activityRepository.createActivityLog({
    userId: user.id,
    action: 'auth.login',
    status: 'success',
    message: 'User logged in'
  });

  return { ok: true, profile: sanitizeProfile(user) };
}

async function refreshSession() {
  const refreshToken = sessionStore.readRefreshToken();
  if (!refreshToken) {
    return { ok: false, message: 'No saved session.' };
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const savedToken = await authRepository.findRefreshTokenById(payload.jti);

    if (!savedToken || savedToken.revoked_at || new Date(savedToken.expires_at) <= new Date()) {
      sessionStore.clearSession();
      return { ok: false, message: 'Session expired. Please login again.' };
    }

    if (savedToken.token_hash !== hashToken(refreshToken)) {
      sessionStore.clearSession();
      return { ok: false, message: 'Session could not be verified.' };
    }

    const user = await authRepository.findUserById(Number(payload.sub));
    if (!user || !user.isActive) {
      sessionStore.clearSession();
      return { ok: false, message: 'User account is inactive.' };
    }

    await persistFreshSession(user, payload.jti);
    user.permissions = await authRepository.getUserPermissions(user.id);
    await activityRepository.createActivityLog({
      userId: user.id,
      action: 'auth.refresh',
      status: 'success',
      message: 'Session refreshed'
    });

    return { ok: true, profile: sanitizeProfile(user) };
  } catch (error) {
    sessionStore.clearSession();
    return { ok: false, message: 'Session expired. Please login again.' };
  }
}

async function getProfile() {
  const accessToken = sessionStore.getAccessToken();

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      const user = await authRepository.findUserById(Number(payload.sub));

      if (user && user.isActive) {
        user.permissions = await authRepository.getUserPermissions(user.id);
        return { ok: true, profile: sanitizeProfile(user) };
      }
    } catch (error) {
      return refreshSession();
    }
  }

  return refreshSession();
}

async function logout() {
  const refreshToken = sessionStore.readRefreshToken();

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await authRepository.revokeRefreshToken(payload.jti);
      await activityRepository.createActivityLog({
        userId: Number(payload.sub),
        action: 'auth.logout',
        status: 'success',
        message: 'User logged out'
      });
    } catch (error) {
      await activityRepository.createActivityLog({
        action: 'auth.logout',
        status: 'failed',
        message: 'Logout token verification failed'
      });
    }
  }

  sessionStore.clearSession();
  return { ok: true };
}

async function canAccess(route) {
  const profileResult = await getProfile();
  if (!profileResult.ok) {
    return { ok: false, allowed: false, message: 'Authentication required.' };
  }

  const permissions = await authRepository.getUserPermissions(profileResult.profile.id);
  return {
    ok: true,
    allowed: canRoleAccess(profileResult.profile.role, route, permissions),
    profile: { ...profileResult.profile, permissions }
  };
}

module.exports = {
  canAccess,
  getProfile,
  login,
  logout,
  refreshSession
};
