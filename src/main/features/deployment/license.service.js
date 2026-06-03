const crypto = require('crypto');
const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const repository = require('./deployment.repository');
const versionService = require('./version.service');

function hashLicenseKey(licenseKey) {
  return crypto.createHash('sha256').update(String(licenseKey || '')).digest('hex');
}

function signCache(payload) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET || 'local-license-cache';
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

function mapLicense(row, machineId) {
  const now = new Date();
  const trialEndsAt = row?.trial_ends_at ? new Date(row.trial_ends_at) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
  let activationState = row?.activation_state || 'trial';
  if (activationState === 'activated' && expiresAt && expiresAt < now) activationState = 'expired';
  if (activationState === 'trial' && trialEndsAt < now) activationState = 'expired';
  const payload = {
    machineId,
    status: row?.license_status || activationState,
    activationState,
    activatedAt: row?.activated_at || null,
    expiresAt: row?.expires_at || null,
    trialEndsAt: row?.trial_ends_at || trialEndsAt.toISOString(),
    lastVerifiedAt: row?.last_verified_at || null,
    verificationPayload: row?.verification_payload || {}
  };
  const expected = row?.cache_signature ? signCache({
    machineId,
    licenseKeyHash: row.license_key_hash,
    activationState: row.activation_state,
    expiresAt: row.expires_at,
    trialEndsAt: row.trial_ends_at
  }) : null;
  return { ...payload, cacheValid: !row?.cache_signature || expected === row.cache_signature };
}

async function status(app) {
  const machine = versionService.getMachineInfo();
  const version = versionService.getVersionInfo(app);
  await repository.upsertDevice(machine, version.version);
  const license = await repository.getLicense(machine.machineId);
  return { ok: true, machine, license: mapLicense(license, machine.machineId) };
}

async function requireAdmin() {
  const profile = await authService.getProfile();
  if (!profile.ok) return { ok: false, message: 'Authentication required.' };
  if (profile.profile.role !== 'Admin') return { ok: false, message: 'Only Admin can manage license activation.' };
  return profile;
}

async function activate(payload = {}, app) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const licenseKey = String(payload.licenseKey || '').trim();
  if (licenseKey.length < 12) return { ok: false, message: 'Enter a valid license key.' };
  const machine = versionService.getMachineInfo();
  const version = versionService.getVersionInfo(app);
  await repository.upsertDevice(machine, version.version);
  const expiresAt = payload.expiresAt || null;
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const cachePayload = {
    machineId: machine.machineId,
    licenseKeyHash: hashLicenseKey(licenseKey),
    activationState: 'activated',
    expiresAt,
    trialEndsAt
  };
  const licenseId = await repository.saveLicense({
    machineId: machine.machineId,
    licenseKeyHash: cachePayload.licenseKeyHash,
    licenseStatus: 'activated',
    activationState: 'activated',
    activatedAt: new Date().toISOString(),
    expiresAt,
    trialEndsAt,
    verificationPayload: {
      provider: process.env.LICENSE_PROVIDER || 'local-foundation',
      serverVerification: 'pending',
      appVersion: version.version
    },
    cacheSignature: signCache(cachePayload)
  });
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'license.activate', status: 'success', message: 'License activated locally', metadata: { licenseId, machineId: machine.machineId } });
  return status(app);
}

async function refresh(app) {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const result = await status(app);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'license.refresh', status: 'success', message: 'License cache refreshed', metadata: { machineId: result.machine.machineId } });
  return result;
}

module.exports = {
  activate,
  refresh,
  status
};
