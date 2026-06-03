const fs = require('fs');
const path = require('path');
let safeStorage = null;

try {
  safeStorage = require('electron').safeStorage;
} catch (error) {
  safeStorage = null;
}

let accessToken = null;
let sessionPath = null;

function initializeSessionStore(app) {
  sessionPath = path.join(app.getPath('userData'), 'secure-session.dat');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
}

function setAccessToken(token) {
  accessToken = token;
}

function getAccessToken() {
  return accessToken;
}

function persistRefreshToken(refreshToken) {
  if (!sessionPath) {
    throw new Error('Session store is not initialized');
  }

  const payload = safeStorage?.isEncryptionAvailable?.()
    ? safeStorage.encryptString(refreshToken)
    : Buffer.from(refreshToken, 'utf8');

  fs.writeFileSync(sessionPath, payload, { mode: 0o600 });
}

function readRefreshToken() {
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return null;
  }

  const payload = fs.readFileSync(sessionPath);

  try {
    return safeStorage?.isEncryptionAvailable?.()
      ? safeStorage.decryptString(payload)
      : payload.toString('utf8');
  } catch (error) {
    clearSession();
    return null;
  }
}

function clearSession() {
  accessToken = null;

  if (sessionPath && fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

module.exports = {
  clearSession,
  getAccessToken,
  initializeSessionStore,
  persistRefreshToken,
  readRefreshToken,
  setAccessToken
};
