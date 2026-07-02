const crypto = require('crypto');
const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const settingsRepository = require('./settings.repository');

const SETTINGS_ROLES = new Set(['Admin']);
const RESTORE_AUTHORIZATION_ACKNOWLEDGEMENT =
  'I understand Restore is not available yet and this is authorization assessment only.';

async function requireSettingsAccess(permissionKey, adminOnly = false) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const role = profileResult.profile.role;
  if (adminOnly && role !== 'Admin')
    return { ok: false, message: 'Only Admin can perform restore.' };
  const permissions = Array.isArray(profileResult.profile.permissions)
    ? profileResult.profile.permissions
    : [];
  if (!SETTINGS_ROLES.has(role) && !permissions.includes(permissionKey))
    return { ok: false, message: 'You do not have permission to manage settings.' };
  return { ok: true, profile: profileResult.profile };
}

function cleanText(value, max = 500) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function moneyNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanSettings(payload = {}) {
  const paperWidth = ['58mm', '80mm', 'A4'].includes(payload.printer?.paperWidth)
    ? payload.printer.paperWidth
    : '80mm';
  const taxMode = payload.tax?.mode === 'included' ? 'included' : 'excluded';
  return {
    store: {
      storeName: cleanText(payload.store?.storeName, 140) || 'Enterprise POS',
      phone: cleanText(payload.store?.phone, 60),
      email: cleanText(payload.store?.email, 180),
      address: cleanText(payload.store?.address, 500),
      taxNumber: cleanText(payload.store?.taxNumber, 80),
      receiptFooterText:
        cleanText(payload.store?.receiptFooterText, 500) || 'Thank you for shopping',
      logoPath: cleanText(payload.store?.logoPath, 500),
    },
    tax: {
      enabled: Boolean(payload.tax?.enabled),
      defaultTaxPercentage: moneyNumber(payload.tax?.defaultTaxPercentage),
      mode: taxMode,
    },
    printer: {
      printerName: cleanText(payload.printer?.printerName, 220),
      paperWidth,
      autoPrint: Boolean(payload.printer?.autoPrint),
      silentPrint: Boolean(payload.printer?.silentPrint),
      receiptCopies: Math.max(
        1,
        Math.min(5, Math.trunc(moneyNumber(payload.printer?.receiptCopies, 1)))
      ),
      footerText: cleanText(payload.printer?.footerText, 500) || 'Thank you for shopping',
    },
    system: {
      currencySymbol: cleanText(payload.system?.currencySymbol, 12) || 'PKR',
      dateFormat: cleanText(payload.system?.dateFormat, 30) || 'DD/MM/YYYY',
      lowStockAlertThreshold: moneyNumber(payload.system?.lowStockAlertThreshold, 5),
      invoicePrefix: cleanText(payload.system?.invoicePrefix, 20) || 'POS',
      nextInvoiceNumber: Math.max(1, Math.trunc(moneyNumber(payload.system?.nextInvoiceNumber, 1))),
    },
  };
}

async function getSettings() {
  const access = await requireSettingsAccess('settings.view');
  if (!access.ok) return access;
  return { ok: true, settings: await settingsRepository.getSettings() };
}

async function saveSettings(payload = {}) {
  const access = await requireSettingsAccess('settings.update');
  if (!access.ok) return access;
  const settings = await settingsRepository.saveSettings(cleanSettings(payload), access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'settings.save',
    status: 'success',
    message: 'Settings saved',
  });
  return { ok: true, settings, message: 'Settings saved successfully.' };
}

async function createBackup(filePath) {
  const access = await requireSettingsAccess('backup.create');
  if (!access.ok) return access;
  if (!filePath) return { ok: false, message: 'Backup file was not selected.' };
  try {
    const backup = await settingsRepository.exportBackup(filePath, access.profile.id);
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'backup.create',
      status: 'success',
      message: 'Certified backup created',
      metadata: backup,
    });
    return { ok: true, backup, message: 'Certified backup created and verified successfully.' };
  } catch (error) {
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'backup.create',
      status: 'failed',
      message: 'Certified backup failed',
      metadata: {
        filePath,
        reason: error.message,
        verification: error.verification || null,
      },
    });
    throw error;
  }
}

async function listBackups() {
  const access = await requireSettingsAccess('backup.view');
  if (!access.ok) return access;
  return { ok: true, backups: await settingsRepository.listBackupLogs() };
}

async function inspectRestorePackage(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  return settingsRepository.inspectRestorePackage(filePath);
}

async function verifyRestorePackage(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  return settingsRepository.verifyRestorePackage(filePath);
}

async function assessRestoreEligibility(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  return settingsRepository.assessRestoreEligibility(filePath);
}

function authorizationCheck(name, passed, message, blockingReason) {
  return {
    name,
    passed: Boolean(passed),
    message,
    blockingReason: passed ? null : blockingReason || message,
  };
}

function authorizationResult(status, message, details = {}) {
  return {
    ok: status === 'authorization_assessment_passed',
    authorizationStatus: status,
    message,
    restoreEligible: false,
    ...details,
  };
}

async function assessRestoreAuthorization(filePath, acknowledgementText = '') {
  const auditCorrelationId = crypto.randomUUID();
  const profileResult = await authService.getProfile();
  const profile = profileResult.ok ? profileResult.profile : null;
  const role = profile?.role || null;
  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : [];
  const acknowledgementMatches =
    String(acknowledgementText || '').trim() === RESTORE_AUTHORIZATION_ACKNOWLEDGEMENT;
  const accessAllowed =
    Boolean(profile) &&
    role === 'Admin' &&
    (SETTINGS_ROLES.has(role) || permissions.includes('backup.restore'));
  const shouldAssessPackage = accessAllowed && acknowledgementMatches && Boolean(filePath);
  const eligibility = shouldAssessPackage
    ? await settingsRepository.assessRestoreEligibility(filePath)
    : null;
  const summary = eligibility?.summary || {};
  const checks = [
    authorizationCheck(
      'user.authenticated',
      Boolean(profile),
      'Authenticated user is present.',
      'Authentication is required.'
    ),
    authorizationCheck(
      'user.permission',
      accessAllowed,
      'User has restore authorization assessment permission.',
      'User does not have permission to assess Restore authorization.'
    ),
    authorizationCheck(
      'user.admin',
      role === 'Admin',
      'Admin role requirement is satisfied.',
      'Admin role is required for Restore authorization assessment.'
    ),
    authorizationCheck(
      'confirmation.acknowledged',
      acknowledgementMatches,
      'Required confirmation acknowledgement was provided.',
      'Required confirmation acknowledgement was not provided.'
    ),
  ];
  if (accessAllowed && acknowledgementMatches) {
    checks.push(
      authorizationCheck(
        'package.eligibility',
        eligibility?.eligibilityStatus === 'eligible_for_authorization',
        'Package is eligible for future authorization.',
        'Package is not eligible for future authorization.'
      ),
      authorizationCheck(
        'package.verification',
        eligibility?.verificationStatus === 'passed',
        'Package verification passed.',
        'Package verification did not pass.'
      ),
      authorizationCheck(
        'backup.certified',
        summary.certificationStatus === 'Backup Certified',
        'Backup Certified status is present.',
        'Backup Certified status is missing or unacceptable.'
      ),
      authorizationCheck(
        'restore.blocked',
        eligibility?.restoreEligible === false,
        'Restore remains blocked for this phase.',
        'Restore block declaration is missing.'
      )
    );
  }
  if (accessAllowed && acknowledgementMatches && !filePath) {
    checks.push(
      authorizationCheck(
        'package.selected',
        false,
        'Backup package was selected.',
        'Backup package was not selected.'
      )
    );
  }
  const failedChecks = checks.filter((item) => !item.passed);
  const passedChecks = checks.filter((item) => item.passed);
  const blockingReasons = Array.from(
    new Set(
      [
        ...failedChecks.map((item) => item.blockingReason),
        ...(Array.isArray(eligibility?.blockingReasons) ? eligibility.blockingReasons : []),
      ].filter(Boolean)
    )
  );
  const warnings = [
    'Authorization assessment only. This assessment does not grant approval for any recovery operation. Restore remains unavailable until all governance and certification requirements have been completed.',
    ...(Array.isArray(eligibility?.warnings) ? eligibility.warnings : []),
  ];
  const passed = failedChecks.length === 0;
  const result = authorizationResult(
    passed ? 'authorization_assessment_passed' : 'authorization_assessment_blocked',
    passed
      ? 'Authorization assessment passed. Restore remains unavailable pending certification and activation.'
      : 'Authorization assessment blocked. Restore remains unavailable.',
    {
      auditCorrelationId,
      fileName: eligibility?.fileName || summary.fileName || null,
      filePath: eligibility?.filePath || summary.filePath || filePath || null,
      summary,
      eligibilityStatus: eligibility?.eligibilityStatus || 'blocked',
      verificationStatus: eligibility?.verificationStatus || null,
      passedAuthorizationChecks: passedChecks,
      failedAuthorizationChecks: failedChecks,
      warnings,
      blockingReasons,
    }
  );

  await activityRepository.createActivityLog({
    userId: profile?.id || null,
    action: 'backup.restore.authorization_assessment',
    status: passed ? 'success' : 'blocked',
    message: passed
      ? 'Restore authorization assessment passed; Restore remains unavailable.'
      : 'Restore authorization assessment blocked; Restore remains unavailable.',
    metadata: {
      auditCorrelationId,
      userId: profile?.id || null,
      role,
      permissionOutcome: accessAllowed ? 'passed' : 'blocked',
      packageId: summary.backupId || null,
      packageCorrelationId: summary.correlationId || null,
      eligibilityStatus: result.eligibilityStatus,
      verificationStatus: result.verificationStatus,
      authorizationStatus: result.authorizationStatus,
      blockingReasons,
    },
  });

  return result;
}

async function restoreBackup(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  const restore = await settingsRepository.restoreBackup(filePath, access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'backup.restore',
    status: 'blocked',
    message: 'Restore blocked by governance',
    metadata: restore,
  });
  return restore;
}

module.exports = {
  assessRestoreEligibility,
  assessRestoreAuthorization,
  createBackup,
  getSettings,
  inspectRestorePackage,
  listBackups,
  restoreBackup,
  saveSettings,
  verifyRestorePackage,
};
