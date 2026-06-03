const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getAuthConfig } = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createAccessToken(user) {
  const config = getAuthConfig();

  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      email: user.email,
      role: user.role,
      type: 'access'
    },
    config.accessTokenSecret,
    { expiresIn: config.accessTokenTtl }
  );
}

function createRefreshToken({ user, tokenId }) {
  const config = getAuthConfig();

  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      email: user.email,
      role: user.role,
      jti: tokenId,
      type: 'refresh'
    },
    config.refreshTokenSecret,
    { expiresIn: config.refreshTokenTtl }
  );
}

function verifyAccessToken(token) {
  const config = getAuthConfig();
  const payload = jwt.verify(token, config.accessTokenSecret);

  if (payload.type !== 'access') {
    throw new Error('Invalid access token type');
  }

  return payload;
}

function verifyRefreshToken(token) {
  const config = getAuthConfig();
  const payload = jwt.verify(token, config.refreshTokenSecret);

  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }

  return payload;
}

function getRefreshTokenExpiry() {
  return addDays(new Date(), 7);
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiry,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken
};
