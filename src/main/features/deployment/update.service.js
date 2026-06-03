const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const repository = require('./deployment.repository');
const versionService = require('./version.service');

function compareVersions(a, b) {
  const left = String(a || '0').split('.').map(Number);
  const right = String(b || '0').split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function providerCheck(currentVersion) {
  const provider = process.env.UPDATE_PROVIDER || 'manual';
  const latestVersion = process.env.UPDATE_LATEST_VERSION || currentVersion;
  const downloadUrl = process.env.UPDATE_DOWNLOAD_URL || '';
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  return {
    provider,
    currentVersion,
    latestVersion,
    downloadUrl,
    state: hasUpdate ? 'update-available' : 'up-to-date',
    message: hasUpdate
      ? `Version ${latestVersion} is available. Download URL is configured by update provider.`
      : 'Enterprise POS is up to date.'
  };
}

async function check(app) {
  const profile = await authService.getProfile();
  const version = versionService.getVersionInfo(app);
  try {
    const result = await providerCheck(version.version);
    await repository.logUpdateCheck({
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      status: result.state,
      provider: result.provider,
      message: result.message,
      userId: profile.ok ? profile.profile.id : null
    });
    if (profile.ok) {
      await activityRepository.createActivityLog({ userId: profile.profile.id, action: 'updates.check', status: 'success', message: result.message, metadata: { latestVersion: result.latestVersion, provider: result.provider } });
    }
    return { ok: true, update: result };
  } catch (error) {
    await repository.logUpdateCheck({ currentVersion: version.version, status: 'failed', provider: process.env.UPDATE_PROVIDER || 'manual', message: 'Update check failed.', userId: profile.ok ? profile.profile.id : null });
    return { ok: false, message: 'Update check failed. Please try again later.', update: { state: 'failed', currentVersion: version.version } };
  }
}

module.exports = { check };
