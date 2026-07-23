const fs = require('fs');
const path = require('path');

function packageJsonPath() {
  return path.join(__dirname, '..', '..', 'package.json');
}

function getPackageVersion() {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath(), 'utf8'));
  return String(parsed.version || '').trim();
}

function resolveAppVersion(app = null) {
  if (app && typeof app.getVersion === 'function') {
    const version = String(app.getVersion() || '').trim();
    if (version) return version;
  }
  return getPackageVersion();
}

module.exports = {
  getPackageVersion,
  packageJsonPath,
  resolveAppVersion,
};
