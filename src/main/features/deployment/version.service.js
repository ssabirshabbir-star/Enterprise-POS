const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function packageJson() {
  const packagePath = path.join(__dirname, '..', '..', '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function getBuildDate() {
  if (process.env.BUILD_DATE) return process.env.BUILD_DATE;
  try {
    const packagePath = path.join(__dirname, '..', '..', '..', '..', 'package.json');
    return fs.statSync(packagePath).mtime.toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

function getVersionInfo(app = null) {
  const pkg = packageJson();
  return {
    appName: pkg.build?.productName || 'Enterprise POS',
    version: app?.getVersion ? app.getVersion() : pkg.version,
    packageVersion: pkg.version,
    buildDate: getBuildDate(),
    environment: process.env.NODE_ENV || 'development',
    isPackaged: Boolean(app?.isPackaged || process.env.ELECTRON_IS_PACKAGED === 'true'),
    platform: process.platform,
    arch: process.arch
  };
}

function getMachineId() {
  const source = [
    os.hostname(),
    os.userInfo().username,
    os.platform(),
    os.arch(),
    process.env.POS_TERMINAL_CODE || ''
  ].join('|');
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32).toUpperCase();
}

function getMachineInfo() {
  return {
    machineId: getMachineId(),
    machineName: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
}

module.exports = {
  getMachineId,
  getMachineInfo,
  getVersionInfo
};
