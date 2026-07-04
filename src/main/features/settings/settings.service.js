const crypto = require('crypto');
const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const restoreEngineService = require('../restore-engine/restore-engine.service');
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

async function listBackups(filters = {}) {
  const access = await requireSettingsAccess('backup.view');
  if (!access.ok) return access;
  const result = await settingsRepository.listBackupLogs(sanitizeBackupHistoryFilters(filters));
  return {
    ok: true,
    backups: result.backups,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    message: 'Backup history loaded.',
  };
}

async function assessBackupPreflight(filePath) {
  const access = await requireSettingsAccess('backup.create');
  if (!access.ok) return access;
  let result;
  try {
    result = await settingsRepository.assessBackupPreflight(filePath);
  } catch (error) {
    activityRepository
      .createActivityLog({
        userId: access.profile.id,
        action: 'backup.preflight',
        status: 'failed',
        message: 'Backup preflight assessment failed unexpectedly.',
        metadata: {
          filePath: filePath || null,
          fileName: null,
          preflightStatus: 'failed',
          writableDestination: null,
          checks: [],
          warnings: [],
        },
      })
      .catch(() => {});
    throw error;
  }
  activityRepository
    .createActivityLog({
      userId: access.profile.id,
      action: 'backup.preflight',
      status: result.preflightStatus || 'failed',
      message: result.message || 'Backup preflight assessment completed.',
      metadata: {
        filePath: result.filePath || filePath || null,
        fileName: result.fileName || null,
        preflightStatus: result.preflightStatus || null,
        writableDestination: result.writableDestination ?? null,
        checks: Array.isArray(result.checks) ? result.checks : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      },
    })
    .catch(() => {});
  return result;
}

function sanitizeBackupHistoryFilters(filters = {}) {
  const allowedStatuses = new Set(['all', 'success', 'failed']);
  const allowedDatePresets = new Set(['all', 'today', 'last_7_days', 'last_30_days', 'custom']);
  const allowedSorts = new Set(['newest', 'oldest', 'status']);
  const status = allowedStatuses.has(filters.status) ? filters.status : 'all';
  const datePreset = allowedDatePresets.has(filters.datePreset) ? filters.datePreset : 'all';
  const now = new Date();
  let dateFrom = null;
  let dateTo = null;

  if (datePreset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    dateFrom = start.toISOString();
  } else if (datePreset === 'last_7_days' || datePreset === 'last_30_days') {
    const days = datePreset === 'last_7_days' ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    dateFrom = start.toISOString();
  } else if (datePreset === 'custom') {
    const customFrom = dateOnly(filters.dateFrom);
    const customTo = dateOnly(filters.dateTo);
    if (customFrom) dateFrom = `${customFrom}T00:00:00.000Z`;
    if (customTo) dateTo = nextDate(customTo);
  }

  return {
    search: cleanText(filters.search, 140),
    status,
    datePreset,
    dateFrom,
    dateTo,
    sort: allowedSorts.has(filters.sort) ? filters.sort : 'newest',
    page: Math.max(1, Math.trunc(Number(filters.page) || 1)),
    pageSize: Math.max(1, Math.min(200, Math.trunc(Number(filters.pageSize) || 100))),
  };
}

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function sanitizeDryRunReportFilters(filters = {}) {
  const allowedStatuses = new Set([
    'all',
    'certified',
    'blocked',
    'failed_verification',
    'failed_eligibility',
    'authorization_blocked',
  ]);
  const allowedDatePresets = new Set(['all', 'today', 'last_7_days', 'last_30_days', 'custom']);
  const allowedSorts = new Set(['newest', 'oldest', 'status', 'package_name']);
  const status = allowedStatuses.has(filters.status) ? filters.status : 'all';
  const datePreset = allowedDatePresets.has(filters.datePreset) ? filters.datePreset : 'all';
  const now = new Date();
  let dateFrom = null;
  let dateTo = null;

  if (datePreset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    dateFrom = start.toISOString();
  } else if (datePreset === 'last_7_days' || datePreset === 'last_30_days') {
    const days = datePreset === 'last_7_days' ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    dateFrom = start.toISOString();
  } else if (datePreset === 'custom') {
    const customFrom = dateOnly(filters.dateFrom);
    const customTo = dateOnly(filters.dateTo);
    if (customFrom) dateFrom = `${customFrom}T00:00:00.000Z`;
    if (customTo) dateTo = nextDate(customTo);
  }

  return {
    search: cleanText(filters.search, 140),
    status,
    datePreset,
    dateFrom,
    dateTo,
    sort: allowedSorts.has(filters.sort) ? filters.sort : 'newest',
    page: Math.max(1, Math.trunc(Number(filters.page) || 1)),
    pageSize: Math.max(5, Math.min(50, Math.trunc(Number(filters.pageSize) || 10))),
  };
}

async function listRestoreDryRunReports(filters = {}) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  const result = await settingsRepository.listRestoreDryRunReports(
    sanitizeDryRunReportFilters(filters)
  );
  return {
    ok: true,
    ...result,
    message: 'Restore dry-run certification report history loaded. Restore remains unavailable.',
  };
}

async function getRestoreDryRunReport(reportId) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: 'Report audit record was not selected.' };
  }
  const report = await settingsRepository.getRestoreDryRunReport(id);
  if (!report) {
    return { ok: false, message: 'Restore dry-run certification report was not found.' };
  }
  return {
    ok: true,
    report,
    message: 'Saved dry-run certification report loaded. Restore remains unavailable.',
  };
}

function restoreDashboardStatus(latestReport) {
  if (!latestReport) return 'No dry-run certification evidence available';
  if (latestReport.certificationStatus === 'dry_run_certification_passed') {
    return 'Dry-run certification evidence available - Restore unavailable';
  }
  return 'Restore readiness blocked - Restore unavailable';
}

function latestReportSummary(reportRow) {
  if (!reportRow) return null;
  const report = reportRow.report || {};
  return {
    id: reportRow.id,
    createdAt: reportRow.createdAt,
    createdBy: reportRow.createdBy,
    certificationStatus: reportRow.certificationStatus,
    reportCorrelationId: reportRow.reportCorrelationId,
    packageSummary: report.packageSummary || {},
    verificationSummary: report.verificationSummary || {},
    eligibilitySummary: report.eligibilitySummary || {},
    authorizationSummary: report.authorizationSummary || {},
    blockingReasons: Array.isArray(report.blockingReasons) ? report.blockingReasons : [],
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    futureRestoreQualification: report.futureRestoreQualification || null,
    noRestoreExecuted: reportRow.noRestoreExecuted === true,
    restoreUnavailable: reportRow.restoreUnavailable === true,
    restoreEligible: reportRow.restoreEligible === true ? true : false,
  };
}

async function getRestoreReadinessDashboard() {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  const evidence = await settingsRepository.getRestoreReadinessDashboardEvidence();
  const aggregate = evidence.aggregate || {};
  const reports = Array.isArray(evidence.reports) ? evidence.reports : [];
  const latest = reports[0] || null;
  const latestCertified =
    reports.find((report) => report.certificationStatus === 'dry_run_certification_passed') || null;
  const latestReport = latestReportSummary(latest);
  const latestCertifiedReport = latestReportSummary(latestCertified);
  const blockingReasons = latestReport?.blockingReasons || [];
  const warnings = latestReport?.warnings || [];
  return {
    ok: true,
    dashboard: {
      readOnly: true,
      governanceDashboard: true,
      noRestoreExecuted: true,
      restoreUnavailable: true,
      restoreEligible: false,
      overallReadiness: {
        currentRestoreReadiness: restoreDashboardStatus(latest),
        currentCertificationState: latest?.certificationStatus || 'no_certification_reports',
        latestCertificationDate: latest?.createdAt || null,
        latestCertificationResult: latest?.certificationStatus || null,
      },
      packageStatus: latestCertifiedReport?.packageSummary || latestReport?.packageSummary || {},
      verificationStatus: latestReport?.verificationSummary || {},
      eligibilityStatus: latestReport?.eligibilitySummary || {},
      authorizationStatus: latestReport?.authorizationSummary || {},
      blockingConditions: blockingReasons,
      warnings,
      certificationHistorySummary: {
        totalReports: aggregate.total_reports || 0,
        certified: aggregate.certified_reports || 0,
        blocked: aggregate.blocked_reports || 0,
        failedVerification: aggregate.failed_verification_reports || 0,
        failedEligibility: aggregate.failed_eligibility_reports || 0,
        authorizationBlocked: aggregate.authorization_blocked_reports || 0,
        latestReport: latestReport
          ? {
              id: latestReport.id,
              status: latestReport.certificationStatus,
              createdAt: latestReport.createdAt,
              packageName: latestReport.packageSummary.fileName || null,
            }
          : null,
      },
      auditSummary: {
        lastDryRun: latestReport
          ? {
              id: latestReport.id,
              createdAt: latestReport.createdAt,
              createdBy: latestReport.createdBy,
              status: latestReport.certificationStatus,
            }
          : null,
        lastCertification: latestCertifiedReport
          ? {
              id: latestCertifiedReport.id,
              createdAt: latestCertifiedReport.createdAt,
              createdBy: latestCertifiedReport.createdBy,
              status: latestCertifiedReport.certificationStatus,
            }
          : null,
        lastVerification: latestReport
          ? {
              reportId: latestReport.id,
              status: latestReport.verificationSummary.status || null,
              warnings: warnings.length,
            }
          : null,
      },
      latestReport,
      latestCertifiedReport,
      message:
        'Restore readiness dashboard loaded as read-only governance evidence. Restore remains unavailable.',
    },
  };
}

function governanceItem(name, status, evidence) {
  return { name, status, evidence };
}

function restoreGovernanceDecision(dashboard = {}) {
  const totalReports = dashboard.certificationHistorySummary?.totalReports || 0;
  const latestStatus = dashboard.overallReadiness?.latestCertificationResult || null;
  if (!totalReports) return 'Governance Pending - Activation Blocked';
  if (latestStatus === 'dry_run_certification_passed') {
    return 'Governance Complete for non-destructive Restore management - Activation Blocked';
  }
  return 'Governance Pending - Activation Blocked';
}

function restoreFoundationCheckpoint(name, state, message) {
  return { name, state, message };
}

function restoreFoundationResult(state, message, details = {}) {
  return {
    ok: state === 'ready_for_future_execution',
    foundationState: state,
    message,
    noRestoreExecuted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    ...details,
  };
}

function restoreTransactionCheckpoint(name, state, message) {
  return { name, state, message };
}

function restoreTransactionResult(state, message, details = {}) {
  return {
    ok: state === 'transaction_ready',
    transactionState: state,
    message,
    noRestoreTransactionExecuted: true,
    noDataCommitted: true,
    noRestoreExecuted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    ...details,
  };
}

function buildRestoreTransactionBoundaryMetadata(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    assessmentOnly: true,
    transactionBoundaryStatus: blocked ? 'boundary_blocked' : 'boundary_ready_for_future_planning',
    entryBoundary: {
      state: blocked ? 'blocked' : 'ready_for_future_planning',
      message: blocked
        ? 'Transaction entry boundary is blocked by governance or foundation evidence.'
        : 'Transaction entry boundary metadata is ready for future planning only.',
    },
    pauseBoundary: {
      state: 'metadata_only',
      message:
        'Pause boundary is metadata only. No transaction can pause because no transaction executes.',
    },
    abortBoundary: {
      state: blocked ? 'available_before_execution' : 'available_before_future_execution',
      message: 'Abort boundary is metadata only before any Restore transaction execution.',
    },
    commitBoundary: {
      state: 'blocked',
      message: 'Commit boundary is blocked. No restored data may be committed in this phase.',
    },
    failureBoundary: {
      state: blocked ? 'active' : 'monitoring',
      message:
        'Failure boundary maps assessment failures only. No Restore transaction execution exists.',
    },
  };
}

function buildRestoreTransactionCheckpointSequence(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return [
    restoreTransactionCheckpoint(
      'checkpoint_context_created',
      'transaction_not_started',
      'Assessment context created without entering a Restore transaction.'
    ),
    restoreTransactionCheckpoint(
      'checkpoint_governance_precheck',
      'transaction_precheck',
      'Governance and foundation evidence reviewed for transaction planning only.'
    ),
    restoreTransactionCheckpoint(
      'checkpoint_boundary_mapping',
      blocked ? 'transaction_blocked' : 'transaction_ready',
      blocked
        ? 'Transaction boundary metadata remains blocked by governance evidence.'
        : 'Transaction boundary metadata is ready for future orchestration planning only.'
    ),
    restoreTransactionCheckpoint(
      'checkpoint_commit_guard',
      'transaction_blocked',
      'Commit boundary remains blocked. No Restore data can be committed.'
    ),
    restoreTransactionCheckpoint(
      'checkpoint_rollback_metadata',
      'transaction_not_started',
      'Rollback plan metadata recorded only. No rollback execution exists.'
    ),
  ];
}

function buildRestoreTransactionFailureMap(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    preTransaction: {
      state: blocked ? 'blocked' : 'clear_for_future_planning',
      reasons: blockers,
      response: blocked
        ? 'Stop before transaction entry.'
        : 'Future transaction entry remains unavailable until later approval.',
    },
    transactionStart: {
      state: 'blocked',
      response: 'Transaction start is blocked in Phase 3B.2.',
    },
    midTransaction: {
      state: 'not_applicable',
      response: 'No mid-transaction failure can occur because no transaction executes.',
    },
    postTransaction: {
      state: 'not_applicable',
      response: 'No post-transaction failure can occur because no transaction commits.',
    },
    auditFinalization: {
      state: 'audit_only',
      response: 'Assessment audit evidence is recorded without Restore execution.',
    },
    unexpectedFailure: {
      state: 'blocked',
      response: 'Unexpected assessment failure must stop before any transaction boundary.',
    },
  };
}

function buildRestoreRollbackPlanMetadata(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    rollbackPlanStatus: 'metadata_only',
    rollbackExecutionAvailable: false,
    rollbackRequired: false,
    rollbackBlocked: true,
    rollbackImpossible: false,
    rollbackBoundary: blocked ? 'pre_transaction_blocked' : 'pre_transaction_planning_only',
    message:
      'Rollback plan is metadata only. No rollback execution exists because no Restore transaction executes.',
  };
}

function buildRestoreRollbackReadinessMetadata(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    rollbackReadinessStatus: blocked ? 'rollback_readiness_blocked' : 'metadata_ready',
    rollbackEligibilityAssessment: blocked ? 'blocked' : 'eligible_for_future_planning_only',
    rollbackExecutionAvailable: false,
    rollbackAuthorityRequired: true,
    rollbackEvidenceRequired: true,
    rollbackSafetyDecision: blocked
      ? 'Rollback readiness is blocked because transaction foundation is not ready.'
      : 'Rollback readiness metadata is prepared for future planning only.',
    blockingReasons: blockers,
    message:
      'Rollback readiness assessment is metadata only. No rollback execution is available in this phase.',
  };
}

function buildRestoreRecoveryCheckpointMetadata(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return [
    restoreTransactionCheckpoint(
      'recovery_checkpoint_context',
      'metadata_only',
      'Recovery context metadata is recorded without runtime recovery.'
    ),
    restoreTransactionCheckpoint(
      'recovery_checkpoint_transaction_boundary',
      blocked ? 'blocked' : 'ready_for_future_planning',
      blocked
        ? 'Recovery checkpoint remains blocked by transaction foundation blockers.'
        : 'Recovery checkpoint is available for future planning only.'
    ),
    restoreTransactionCheckpoint(
      'recovery_checkpoint_runtime_state',
      'blocked',
      'Runtime recovery remains blocked and is not executed.'
    ),
    restoreTransactionCheckpoint(
      'recovery_checkpoint_completion',
      'blocked',
      'Recovery completion cannot be declared because no Restore or runtime recovery executes.'
    ),
  ];
}

function buildRestoreFailureRecoveryClassification(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    governanceFailure: {
      state: blocked ? 'active' : 'monitoring',
      recoveryResponse: blocked
        ? 'Remain blocked before transaction entry.'
        : 'Monitor only; future recovery remains unavailable.',
    },
    transactionFailure: {
      state: 'not_applicable',
      recoveryResponse: 'No transaction failure can occur because no Restore transaction executes.',
    },
    rollbackFailure: {
      state: 'not_applicable',
      recoveryResponse: 'No rollback failure can occur because rollback execution is unavailable.',
    },
    runtimeRecoveryFailure: {
      state: 'blocked',
      recoveryResponse: 'Runtime recovery is blocked in Phase 3B.3.',
    },
    auditRecoveryFailure: {
      state: 'audit_only',
      recoveryResponse: 'Assessment audit evidence is the only recovery-related persistence.',
    },
    unknownRecoveryFailure: {
      state: 'blocked',
      recoveryResponse: 'Unknown recovery failure must remain blocked before execution.',
    },
  };
}

function buildRestoreRecoveryMetadata(state, blockers = []) {
  const blocked = blockers.length > 0 || state !== 'transaction_ready';
  return {
    recoveryMetadataStatus: blocked ? 'recovery_metadata_blocked' : 'metadata_ready',
    runtimeRecoveryAvailable: false,
    runtimeRecoveryExecuted: false,
    recoveryCompletionAvailable: false,
    recoveryStateReconciliationAvailable: false,
    recoveryCheckpointMetadata: buildRestoreRecoveryCheckpointMetadata(state, blockers),
    failureRecoveryClassification: buildRestoreFailureRecoveryClassification(state, blockers),
    message: blocked
      ? 'Recovery metadata remains blocked by transaction foundation blockers. No runtime recovery executed.'
      : 'Recovery metadata is prepared for future planning only. No runtime recovery executed.',
  };
}

function buildRestoreTransactionCertificationSnapshot({
  transactionState,
  transactionPrecheckResult,
  foundationState = null,
  governanceDecision = null,
  activationReadiness = null,
  blockers = [],
  boundaryMetadata = {},
  checkpointSequence = [],
  failureStateMap = {},
  rollbackPlanMetadata = {},
  rollbackReadinessMetadata = {},
  recoveryMetadata = {},
  outstandingRequirements = [],
} = {}) {
  const blocked = blockers.length > 0 || transactionState !== 'transaction_ready';
  return {
    snapshotType: 'transaction_certification_snapshot',
    snapshotStatus: blocked
      ? 'transaction_certification_snapshot_blocked'
      : 'transaction_certification_snapshot_ready_for_future_review',
    readOnly: true,
    assessmentOnly: true,
    noRestoreTransactionExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    governanceEvidenceSummary: {
      foundationState,
      governanceDecision,
      activationReadiness,
      blockersPropagated: blockers.length,
      outstandingRequirements: outstandingRequirements.length,
    },
    transactionReadinessSummary: {
      transactionState,
      transactionPrecheckResult,
      transactionBoundaryStatus: boundaryMetadata.transactionBoundaryStatus || null,
      checkpointCount: checkpointSequence.length,
      failureMapCategories: Object.keys(failureStateMap || {}).length,
      commitBoundaryState: boundaryMetadata.commitBoundary?.state || null,
    },
    rollbackRecoveryReadinessSummary: {
      rollbackPlanStatus: rollbackPlanMetadata.rollbackPlanStatus || null,
      rollbackReadinessStatus: rollbackReadinessMetadata.rollbackReadinessStatus || null,
      rollbackEligibilityAssessment:
        rollbackReadinessMetadata.rollbackEligibilityAssessment || null,
      rollbackExecutionAvailable: false,
      recoveryMetadataStatus: recoveryMetadata.recoveryMetadataStatus || null,
      runtimeRecoveryAvailable: false,
      runtimeRecoveryExecuted: false,
    },
    blockerSnapshot: blockers,
    certificationStatement: blocked
      ? 'Transaction certification snapshot is blocked. No Restore transaction was executed, no data was committed, and Restore remains unavailable.'
      : 'Transaction certification snapshot is ready for future governance review only. No Restore transaction was executed, no data was committed, and Restore remains unavailable.',
  };
}

function buildRestoreOrchestrationPlanningMetadata({
  transactionState,
  blockers = [],
  checkpointSequence = [],
  transactionBoundaryMetadata = {},
  rollbackReadinessMetadata = {},
  recoveryMetadata = {},
  transactionCertificationSnapshot = {},
} = {}) {
  const blocked = blockers.length > 0 || transactionState !== 'transaction_ready';
  const stageGraph = [
    {
      name: 'governance_review',
      state: blocked ? 'blocked_or_reviewed' : 'ready_for_future_planning',
      dependsOn: [],
      executionAllowed: false,
    },
    {
      name: 'transaction_boundary_review',
      state: transactionBoundaryMetadata.transactionBoundaryStatus || 'unknown',
      dependsOn: ['governance_review'],
      executionAllowed: false,
    },
    {
      name: 'checkpoint_review',
      state: checkpointSequence.length ? 'metadata_available' : 'metadata_missing',
      dependsOn: ['transaction_boundary_review'],
      executionAllowed: false,
    },
    {
      name: 'rollback_readiness_review',
      state: rollbackReadinessMetadata.rollbackReadinessStatus || 'unknown',
      dependsOn: ['checkpoint_review'],
      executionAllowed: false,
    },
    {
      name: 'recovery_metadata_review',
      state: recoveryMetadata.recoveryMetadataStatus || 'unknown',
      dependsOn: ['rollback_readiness_review'],
      executionAllowed: false,
    },
    {
      name: 'certification_snapshot_review',
      state: transactionCertificationSnapshot.snapshotStatus || 'unknown',
      dependsOn: ['recovery_metadata_review'],
      executionAllowed: false,
    },
  ];
  return {
    orchestrationPlanStatus: blocked
      ? 'orchestration_plan_blocked'
      : 'orchestration_plan_ready_for_future_review',
    readOnly: true,
    metadataOnly: true,
    schedulerAvailable: false,
    jobExecutionAvailable: false,
    restoreExecutionAvailable: false,
    stageGraph,
    stageDependencies: stageGraph.map((stage) => ({
      stage: stage.name,
      dependsOn: stage.dependsOn,
      state: stage.state,
    })),
    executionOrderingPlan: stageGraph.map((stage, index) => ({
      order: index + 1,
      stage: stage.name,
      executionAllowed: false,
      message:
        'Ordering metadata only. No Restore execution, scheduler, retry, or resume is available.',
    })),
    governanceDecisionGraph: {
      blockersPropagated: blockers,
      transactionState,
      transactionBoundaryStatus: transactionBoundaryMetadata.transactionBoundaryStatus || null,
      rollbackReadinessStatus: rollbackReadinessMetadata.rollbackReadinessStatus || null,
      recoveryMetadataStatus: recoveryMetadata.recoveryMetadataStatus || null,
      snapshotStatus: transactionCertificationSnapshot.snapshotStatus || null,
      restoreUnavailable: true,
      restoreEligible: false,
    },
    checkpointDependencyValidation: {
      checkpointCount: checkpointSequence.length,
      dependencyStatus:
        !blocked && checkpointSequence.length > 0 ? 'metadata_valid' : 'metadata_blocked',
      missingDependencies: [],
      blockedDependencies: blocked ? blockers : [],
    },
    message: blocked
      ? 'Orchestration planning metadata is blocked by transaction governance blockers. No Restore execution is available.'
      : 'Orchestration planning metadata is ready for future review only. No Restore execution is available.',
  };
}

function restoreExecutionPreconditionGate({
  id,
  category,
  title,
  status,
  dependsOn = [],
  evidence = [],
  blockers = [],
} = {}) {
  return {
    id,
    category,
    title,
    status,
    dependsOn,
    evidence,
    blockers,
    restoreExecutionAvailable: false,
  };
}

function buildRestoreExecutionPreconditionGateMatrix({
  transactionState,
  transactionPrecheckResult,
  blockers = [],
  foundationState,
  governanceDecision,
  activationReadiness,
  boundaryMetadata = {},
  rollbackReadinessMetadata = {},
  recoveryMetadata = {},
  transactionCertificationSnapshot = {},
  orchestrationPlanningMetadata = {},
} = {}) {
  const blockerList = Array.from(new Set(blockers.filter(Boolean)));
  const transactionReady = transactionState === 'transaction_ready';
  const foundationReady = foundationState === 'ready_for_future_execution';
  const snapshotReady =
    transactionCertificationSnapshot.snapshotStatus ===
    'transaction_certification_snapshot_ready_for_future_review';
  const orchestrationReady =
    orchestrationPlanningMetadata.orchestrationPlanStatus ===
    'orchestration_plan_ready_for_future_review';
  const rollbackMetadataReady =
    rollbackReadinessMetadata.rollbackReadinessStatus === 'metadata_ready';
  const recoveryMetadataReady = recoveryMetadata.recoveryMetadataStatus === 'metadata_ready';
  const matrixBlocked =
    blockerList.length > 0 ||
    !transactionReady ||
    !foundationReady ||
    !snapshotReady ||
    !orchestrationReady;
  const inheritedBlockers = blockerList.length
    ? blockerList
    : ['Restore execution activation remains blocked by governance.'];

  const gates = [
    restoreExecutionPreconditionGate({
      id: 'GOV-001',
      category: 'governance',
      title: 'Restore governance evidence complete',
      status: foundationReady ? 'satisfied' : 'blocked',
      evidence: [
        `Foundation state: ${foundationState || 'unknown'}`,
        `Governance decision: ${governanceDecision || 'unknown'}`,
        `Activation readiness: ${activationReadiness || 'unknown'}`,
      ],
      blockers: foundationReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'GOV-002',
      category: 'governance',
      title: 'Final Restore activation approval',
      status: 'blocked',
      dependsOn: ['GOV-001'],
      evidence: ['Restore execution has not been approved for activation.'],
      blockers: ['Final Restore activation approval is not complete.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'SAFE-001',
      category: 'safety',
      title: 'Restore unavailable guard remains active',
      status: 'satisfied',
      dependsOn: ['GOV-001'],
      evidence: ['restoreUnavailable is true.', 'restoreEligible is false.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'SAFE-002',
      category: 'safety',
      title: 'No public Restore execution surface',
      status: 'satisfied',
      dependsOn: ['SAFE-001'],
      evidence: ['Settings API wrapper does not expose restoreBackup.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'VER-001',
      category: 'verification',
      title: 'Verification and certification evidence available',
      status: snapshotReady ? 'satisfied' : 'blocked',
      dependsOn: ['GOV-001'],
      evidence: [
        `Snapshot status: ${transactionCertificationSnapshot.snapshotStatus || 'unknown'}`,
      ],
      blockers: snapshotReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'AUTH-001',
      category: 'authorization',
      title: 'Authorization governance assessment evidence available',
      status: transactionReady ? 'satisfied' : 'blocked',
      dependsOn: ['VER-001'],
      evidence: [`Transaction precheck result: ${transactionPrecheckResult || 'unknown'}`],
      blockers: transactionReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'TX-001',
      category: 'transaction',
      title: 'Transaction foundation precheck',
      status: transactionReady ? 'satisfied' : 'blocked',
      dependsOn: ['AUTH-001'],
      evidence: [
        `Transaction state: ${transactionState || 'unknown'}`,
        `Boundary status: ${boundaryMetadata.transactionBoundaryStatus || 'unknown'}`,
      ],
      blockers: transactionReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'TX-002',
      category: 'transaction',
      title: 'Commit boundary certification',
      status: 'not_implemented',
      dependsOn: ['TX-001'],
      evidence: [`Commit boundary state: ${boundaryMetadata.commitBoundary?.state || 'unknown'}`],
      blockers: ['No Restore data commit boundary has been implemented or certified.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'RB-001',
      category: 'rollback',
      title: 'Rollback readiness metadata',
      status: rollbackMetadataReady ? 'satisfied' : 'blocked',
      dependsOn: ['TX-001'],
      evidence: [
        `Rollback readiness status: ${
          rollbackReadinessMetadata.rollbackReadinessStatus || 'unknown'
        }`,
      ],
      blockers: rollbackMetadataReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'RB-002',
      category: 'rollback',
      title: 'Rollback execution capability',
      status: 'not_implemented',
      dependsOn: ['RB-001'],
      evidence: ['Rollback execution remains prohibited in the current phase.'],
      blockers: ['Rollback execution is not implemented or certified.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'RUN-001',
      category: 'runtime',
      title: 'Runtime recovery metadata',
      status: recoveryMetadataReady ? 'satisfied' : 'blocked',
      dependsOn: ['RB-001'],
      evidence: [
        `Recovery metadata status: ${recoveryMetadata.recoveryMetadataStatus || 'unknown'}`,
      ],
      blockers: recoveryMetadataReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'RUN-002',
      category: 'runtime',
      title: 'Runtime recovery execution',
      status: 'not_implemented',
      dependsOn: ['RUN-001'],
      evidence: ['Runtime recovery execution remains prohibited in the current phase.'],
      blockers: ['Runtime recovery execution is not implemented or certified.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'INF-001',
      category: 'infrastructure',
      title: 'Orchestration planning metadata',
      status: orchestrationReady ? 'satisfied' : 'blocked',
      dependsOn: ['RUN-001'],
      evidence: [
        `Orchestration plan status: ${
          orchestrationPlanningMetadata.orchestrationPlanStatus || 'unknown'
        }`,
      ],
      blockers: orchestrationReady ? [] : inheritedBlockers,
    }),
    restoreExecutionPreconditionGate({
      id: 'INF-002',
      category: 'infrastructure',
      title: 'Scheduler and job execution',
      status: 'not_implemented',
      dependsOn: ['INF-001'],
      evidence: ['No scheduler, job execution, retry, or resume path is available.'],
      blockers: ['Scheduler/job execution is outside the approved non-destructive phase.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'EXE-001',
      category: 'execution',
      title: 'Restore execution API',
      status: 'not_implemented',
      dependsOn: ['GOV-002', 'TX-002', 'RB-002', 'RUN-002', 'INF-002'],
      evidence: ['Public Restore execution API remains unavailable.'],
      blockers: ['Restore execution API is not implemented or exposed.'],
    }),
    restoreExecutionPreconditionGate({
      id: 'EXE-002',
      category: 'execution',
      title: 'Restore execution certification',
      status: 'blocked',
      dependsOn: ['EXE-001'],
      evidence: ['Restore execution certification is not complete.'],
      blockers: ['Future Restore execution certification is required before activation.'],
    }),
  ];
  const summary = gates.reduce(
    (acc, gate) => {
      acc.total += 1;
      if (gate.status === 'satisfied') acc.satisfied += 1;
      if (gate.status === 'blocked') acc.blocked += 1;
      if (gate.status === 'not_implemented') acc.notImplemented += 1;
      acc.byCategory[gate.category] = acc.byCategory[gate.category] || {
        total: 0,
        satisfied: 0,
        blocked: 0,
        notImplemented: 0,
      };
      acc.byCategory[gate.category].total += 1;
      if (gate.status === 'satisfied') acc.byCategory[gate.category].satisfied += 1;
      if (gate.status === 'blocked') acc.byCategory[gate.category].blocked += 1;
      if (gate.status === 'not_implemented') {
        acc.byCategory[gate.category].notImplemented += 1;
      }
      return acc;
    },
    { total: 0, satisfied: 0, blocked: 0, notImplemented: 0, byCategory: {} }
  );

  const hasUnsatisfiedGates = summary.blocked > 0 || summary.notImplemented > 0;

  return {
    matrixStatus: matrixBlocked || hasUnsatisfiedGates ? 'blocked' : 'satisfied',
    readOnly: true,
    assessmentOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    summary,
    gates,
    dependencyGraph: gates.map((gate) => ({
      gateId: gate.id,
      category: gate.category,
      dependsOn: gate.dependsOn,
      status: gate.status,
    })),
    blockerExplanations: gates
      .filter((gate) => gate.status !== 'satisfied')
      .map((gate) => ({
        gateId: gate.id,
        category: gate.category,
        blockers: gate.blockers,
      })),
    governanceEvidenceAggregation: {
      foundationState: foundationState || null,
      transactionState: transactionState || null,
      transactionPrecheckResult: transactionPrecheckResult || null,
      governanceDecision: governanceDecision || null,
      activationReadiness: activationReadiness || null,
      snapshotStatus: transactionCertificationSnapshot.snapshotStatus || null,
      orchestrationPlanStatus: orchestrationPlanningMetadata.orchestrationPlanStatus || null,
      rollbackReadinessStatus: rollbackReadinessMetadata.rollbackReadinessStatus || null,
      recoveryMetadataStatus: recoveryMetadata.recoveryMetadataStatus || null,
      inheritedBlockers: blockerList,
    },
    message:
      'Execution preconditions gate matrix is read-only governance evidence. Restore remains unavailable and no Restore execution path is available.',
  };
}

function restoreBlockerOwner(category) {
  const owners = {
    authorization: 'Authorization Governance',
    execution: 'Restore Activation Authority',
    governance: 'Governance Review',
    infrastructure: 'Infrastructure Planning',
    rollback: 'Rollback Governance',
    runtime: 'Recovery Runtime',
    safety: 'Safety Certification',
    transaction: 'Restore Transaction Framework',
    verification: 'Verification Certification',
  };
  return owners[category] || 'Restore Governance';
}

function restoreBlockerSeverity(gate = {}) {
  if (gate.category === 'execution') return 'critical';
  if (gate.category === 'rollback' || gate.category === 'runtime') return 'high';
  if (gate.status === 'not_implemented') return 'high';
  if (gate.category === 'governance' || gate.category === 'transaction') return 'high';
  return 'medium';
}

function buildRestoreExecutionBlockerResolutionPlan({ gateMatrix = {} } = {}) {
  const gates = Array.isArray(gateMatrix.gates) ? gateMatrix.gates : [];
  const unresolvedGates = gates.filter((gate) => gate.status !== 'satisfied');
  const resolutionItems = unresolvedGates.map((gate, index) => ({
    sequence: index + 1,
    gateId: gate.id,
    gateCategory: gate.category,
    gateTitle: gate.title,
    currentStatus: gate.status,
    severity: restoreBlockerSeverity(gate),
    ownerCategory: restoreBlockerOwner(gate.category),
    dependencies: Array.isArray(gate.dependsOn) ? gate.dependsOn : [],
    blockerReasons: Array.isArray(gate.blockers) ? gate.blockers : [],
    requiredOutcome:
      gate.status === 'not_implemented'
        ? 'Future implementation and certification required before this gate can be satisfied.'
        : 'Governance blocker must be resolved before this gate can be satisfied.',
    restoreExecutionAvailable: false,
  }));
  const severitySummary = resolutionItems.reduce(
    (acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );
  const ownerSummary = resolutionItems.reduce((acc, item) => {
    acc[item.ownerCategory] = (acc[item.ownerCategory] || 0) + 1;
    return acc;
  }, {});
  const categorySummary = resolutionItems.reduce((acc, item) => {
    acc[item.gateCategory] = (acc[item.gateCategory] || 0) + 1;
    return acc;
  }, {});
  const prerequisiteSequencing = resolutionItems.map((item) => ({
    sequence: item.sequence,
    gateId: item.gateId,
    ownerCategory: item.ownerCategory,
    severity: item.severity,
    dependsOn: item.dependencies,
    currentStatus: item.currentStatus,
    requiredOutcome: item.requiredOutcome,
  }));
  const executionActivationRoadmap = [
    {
      stage: 'governance_blocker_resolution',
      status: resolutionItems.some((item) => item.gateCategory === 'governance')
        ? 'blocked'
        : 'metadata_ready',
      restoreExecutionAvailable: false,
      message: 'Governance blockers must be resolved before Restore execution can be considered.',
    },
    {
      stage: 'transaction_and_rollback_certification',
      status: resolutionItems.some((item) =>
        ['transaction', 'rollback'].includes(item.gateCategory)
      )
        ? 'blocked'
        : 'metadata_ready',
      restoreExecutionAvailable: false,
      message:
        'Transaction and rollback gates must be implemented, certified, and reviewed before execution activation.',
    },
    {
      stage: 'runtime_recovery_certification',
      status: resolutionItems.some((item) => item.gateCategory === 'runtime')
        ? 'blocked'
        : 'metadata_ready',
      restoreExecutionAvailable: false,
      message:
        'Runtime recovery governance must be implemented and certified before execution activation.',
    },
    {
      stage: 'infrastructure_execution_certification',
      status: resolutionItems.some((item) =>
        ['infrastructure', 'execution'].includes(item.gateCategory)
      )
        ? 'blocked'
        : 'metadata_ready',
      restoreExecutionAvailable: false,
      message:
        'Execution infrastructure and final Restore activation certification remain unavailable.',
    },
  ];

  return {
    planStatus: resolutionItems.length ? 'blocked' : 'no_unresolved_blockers',
    readOnly: true,
    planningOnly: true,
    auditEvidenceOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    unresolvedBlockerSummary: {
      total: resolutionItems.length,
      bySeverity: severitySummary,
      byOwnerCategory: ownerSummary,
      byGateCategory: categorySummary,
    },
    resolutionItems,
    prerequisiteSequencing,
    executionActivationRoadmap,
    message: resolutionItems.length
      ? 'Execution blocker resolution plan is read-only planning evidence. Restore remains unavailable.'
      : 'No unresolved blockers were found in the planning matrix. Restore still remains unavailable until separately activated.',
  };
}

function restoreRiskLikelihood(item = {}) {
  if (item.currentStatus === 'not_implemented') return 'certain_until_implemented';
  if (item.severity === 'critical') return 'high';
  if (item.severity === 'high') return 'medium';
  return 'low';
}

function restoreRiskImpact(item = {}) {
  if (item.gateCategory === 'execution') return 'platform_restore_activation';
  if (item.gateCategory === 'rollback') return 'recovery_reversibility';
  if (item.gateCategory === 'runtime') return 'post_restore_runtime_consistency';
  if (item.gateCategory === 'transaction') return 'data_consistency_boundary';
  if (item.gateCategory === 'governance') return 'approval_and_certification_integrity';
  return 'restore_certification_readiness';
}

function restoreResidualRisk(item = {}) {
  if (item.severity === 'critical') return 'unacceptable_until_resolved';
  if (item.currentStatus === 'not_implemented') return 'high_until_certified';
  if (item.severity === 'high') return 'managed_only_after_certification';
  return 'monitor_until_resolved';
}

function buildRestoreExecutionActivationRiskRegister({ blockerPlan = {} } = {}) {
  const resolutionItems = Array.isArray(blockerPlan.resolutionItems)
    ? blockerPlan.resolutionItems
    : [];
  const risks = resolutionItems.map((item, index) => ({
    riskId: `RAR-${String(index + 1).padStart(3, '0')}`,
    linkedGateId: item.gateId,
    linkedGateCategory: item.gateCategory,
    linkedBlockerStatus: item.currentStatus,
    category: item.gateCategory,
    title: `${item.gateTitle} risk`,
    severity: item.severity,
    likelihood: restoreRiskLikelihood(item),
    impact: restoreRiskImpact(item),
    mitigationMetadata: [
      item.requiredOutcome,
      'Maintain Restore unavailable state until this risk is resolved and certified.',
      'Preserve audit evidence for all future risk resolution decisions.',
    ],
    residualRisk: restoreResidualRisk(item),
    ownerCategory: item.ownerCategory,
    blockerReasons: item.blockerReasons,
    restoreExecutionAvailable: false,
  }));
  const riskSummary = risks.reduce(
    (acc, risk) => {
      acc.total += 1;
      acc.bySeverity[risk.severity] = (acc.bySeverity[risk.severity] || 0) + 1;
      acc.byLikelihood[risk.likelihood] = (acc.byLikelihood[risk.likelihood] || 0) + 1;
      acc.byResidualRisk[risk.residualRisk] = (acc.byResidualRisk[risk.residualRisk] || 0) + 1;
      acc.byCategory[risk.category] = (acc.byCategory[risk.category] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byLikelihood: {},
      byResidualRisk: {},
      byCategory: {},
    }
  );

  return {
    registerStatus: risks.length ? 'active_risks_block_activation' : 'no_active_risks',
    readOnly: true,
    planningOnly: true,
    auditEvidenceOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    riskSummary,
    risks,
    blockerLinkage: risks.map((risk) => ({
      riskId: risk.riskId,
      linkedGateId: risk.linkedGateId,
      linkedGateCategory: risk.linkedGateCategory,
      linkedBlockerStatus: risk.linkedBlockerStatus,
      residualRisk: risk.residualRisk,
    })),
    mitigationSummary: {
      unresolvedMitigations: risks.length,
      requiredGovernanceState:
        'Restore must remain unavailable until risk mitigation, certification, and activation approval are complete.',
    },
    message: risks.length
      ? 'Execution activation risk register contains active unresolved risks. Restore remains unavailable.'
      : 'Execution activation risk register contains no active risks. Restore still remains unavailable until separately activated.',
  };
}

function buildRestoreExecutionReadinessCertificationAssessment({
  gateMatrix = {},
  blockerPlan = {},
  riskRegister = {},
} = {}) {
  const gates = Array.isArray(gateMatrix.gates) ? gateMatrix.gates : [];
  const risks = Array.isArray(riskRegister.risks) ? riskRegister.risks : [];
  const blockedGates = gates.filter((gate) => gate.status === 'blocked');
  const notImplementedGates = gates.filter((gate) => gate.status === 'not_implemented');
  const criticalRisks = risks.filter((risk) => risk.severity === 'critical');
  const highRisks = risks.filter((risk) => risk.severity === 'high');
  const requiredGateFailure = blockedGates.length > 0 || notImplementedGates.length > 0;
  const riskFailure = criticalRisks.length > 0 || highRisks.length > 0;
  let certificationOutcome = 'CERTIFIED';
  if (requiredGateFailure) {
    certificationOutcome = 'NOT CERTIFIED';
  } else if (riskFailure) {
    certificationOutcome = 'CONDITIONALLY CERTIFIED';
  }
  const criteria = [
    {
      id: 'CERT-GOV-001',
      category: 'governance',
      title: 'Governance gates satisfied',
      status: blockedGates.some((gate) => gate.category === 'governance') ? 'failed' : 'passed',
      evidence: `Governance blocked gates: ${
        blockedGates.filter((gate) => gate.category === 'governance').length
      }`,
    },
    {
      id: 'CERT-SAFE-001',
      category: 'safety',
      title: 'Restore remains safely unavailable during assessment',
      status:
        gateMatrix.restoreUnavailable === true &&
        gateMatrix.restoreEligible === false &&
        gateMatrix.restoreExecutionAvailable === false
          ? 'passed'
          : 'failed',
      evidence: 'Certification assessment is read-only and Restore execution remains unavailable.',
    },
    {
      id: 'CERT-VER-001',
      category: 'verification',
      title: 'Verification gates satisfied',
      status: blockedGates.some((gate) => gate.category === 'verification') ? 'failed' : 'passed',
      evidence: `Verification blocked gates: ${
        blockedGates.filter((gate) => gate.category === 'verification').length
      }`,
    },
    {
      id: 'CERT-AUTH-001',
      category: 'authorization',
      title: 'Authorization gates satisfied',
      status: blockedGates.some((gate) => gate.category === 'authorization') ? 'failed' : 'passed',
      evidence: `Authorization blocked gates: ${
        blockedGates.filter((gate) => gate.category === 'authorization').length
      }`,
    },
    {
      id: 'CERT-TX-001',
      category: 'transaction',
      title: 'Transaction gates implemented and satisfied',
      status: gates.some(
        (gate) =>
          gate.category === 'transaction' &&
          (gate.status === 'blocked' || gate.status === 'not_implemented')
      )
        ? 'failed'
        : 'passed',
      evidence: `Transaction unresolved gates: ${
        gates.filter(
          (gate) =>
            gate.category === 'transaction' &&
            (gate.status === 'blocked' || gate.status === 'not_implemented')
        ).length
      }`,
    },
    {
      id: 'CERT-RB-001',
      category: 'rollback',
      title: 'Rollback gates implemented and satisfied',
      status: gates.some(
        (gate) =>
          gate.category === 'rollback' &&
          (gate.status === 'blocked' || gate.status === 'not_implemented')
      )
        ? 'failed'
        : 'passed',
      evidence: `Rollback unresolved gates: ${
        gates.filter(
          (gate) =>
            gate.category === 'rollback' &&
            (gate.status === 'blocked' || gate.status === 'not_implemented')
        ).length
      }`,
    },
    {
      id: 'CERT-RUN-001',
      category: 'runtime',
      title: 'Runtime recovery gates implemented and satisfied',
      status: gates.some(
        (gate) =>
          gate.category === 'runtime' &&
          (gate.status === 'blocked' || gate.status === 'not_implemented')
      )
        ? 'failed'
        : 'passed',
      evidence: `Runtime unresolved gates: ${
        gates.filter(
          (gate) =>
            gate.category === 'runtime' &&
            (gate.status === 'blocked' || gate.status === 'not_implemented')
        ).length
      }`,
    },
    {
      id: 'CERT-INF-001',
      category: 'infrastructure',
      title: 'Infrastructure gates implemented and satisfied',
      status: gates.some(
        (gate) =>
          gate.category === 'infrastructure' &&
          (gate.status === 'blocked' || gate.status === 'not_implemented')
      )
        ? 'failed'
        : 'passed',
      evidence: `Infrastructure unresolved gates: ${
        gates.filter(
          (gate) =>
            gate.category === 'infrastructure' &&
            (gate.status === 'blocked' || gate.status === 'not_implemented')
        ).length
      }`,
    },
    {
      id: 'CERT-EXE-001',
      category: 'execution',
      title: 'Execution gates implemented, satisfied, and activation-approved',
      status: gates.some(
        (gate) =>
          gate.category === 'execution' &&
          (gate.status === 'blocked' || gate.status === 'not_implemented')
      )
        ? 'failed'
        : 'passed',
      evidence: `Execution unresolved gates: ${
        gates.filter(
          (gate) =>
            gate.category === 'execution' &&
            (gate.status === 'blocked' || gate.status === 'not_implemented')
        ).length
      }`,
    },
    {
      id: 'CERT-RISK-001',
      category: 'risk',
      title: 'Activation risks acceptable for certification',
      status: riskFailure ? 'failed' : 'passed',
      evidence: `Critical risks: ${criticalRisks.length}; high risks: ${highRisks.length}`,
    },
  ];
  const failedCriteria = criteria.filter((item) => item.status === 'failed');

  return {
    assessmentStatus: 'completed',
    certificationOutcome,
    readOnly: true,
    assessmentOnly: true,
    auditEvidenceOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    certificationCriteria: criteria,
    certificationSummary: {
      totalCriteria: criteria.length,
      passedCriteria: criteria.filter((item) => item.status === 'passed').length,
      failedCriteria: failedCriteria.length,
      blockedGateCount: blockedGates.length,
      notImplementedGateCount: notImplementedGates.length,
      unresolvedBlockerCount: blockerPlan.unresolvedBlockerSummary?.total || 0,
      riskCount: riskRegister.riskSummary?.total || 0,
      criticalRiskCount: criticalRisks.length,
      highRiskCount: highRisks.length,
    },
    gateAggregation: {
      matrixStatus: gateMatrix.matrixStatus || null,
      total: gateMatrix.summary?.total || 0,
      satisfied: gateMatrix.summary?.satisfied || 0,
      blocked: gateMatrix.summary?.blocked || 0,
      notImplemented: gateMatrix.summary?.notImplemented || 0,
    },
    blockerAggregation: blockerPlan.unresolvedBlockerSummary || {},
    riskAggregation: riskRegister.riskSummary || {},
    certificationDecisionMetadata: {
      rule: 'If any required gate remains blocked or not implemented, Restore execution readiness is NOT CERTIFIED.',
      conditionallyCertifiedRule:
        'CONDITIONALLY CERTIFIED is reserved only for assessments with all gates satisfied and remaining non-critical residual risks.',
      restoreActivationApproved: false,
    },
    message:
      certificationOutcome === 'NOT CERTIFIED'
        ? 'Restore execution readiness is NOT CERTIFIED. Required gates remain blocked or not implemented. Restore remains unavailable.'
        : 'Restore execution readiness assessment completed. Restore remains unavailable until separate activation approval.',
  };
}

async function getRestoreGovernanceAssessment() {
  const dashboardResult = await getRestoreReadinessDashboard();
  if (!dashboardResult.ok) return dashboardResult;
  const dashboard = dashboardResult.dashboard || {};
  const history = dashboard.certificationHistorySummary || {};
  const blockers = Array.isArray(dashboard.blockingConditions) ? dashboard.blockingConditions : [];
  const latestStatus = dashboard.overallReadiness?.latestCertificationResult || null;
  const hasReportEvidence = Number(history.totalReports || 0) > 0;
  const latestPassed = latestStatus === 'dry_run_certification_passed';
  const completionSummary = [
    governanceItem('Package Reader', 'Completed', 'Certified package inspection is implemented.'),
    governanceItem('Verification', 'Completed', 'Restore package verification is implemented.'),
    governanceItem('Eligibility', 'Completed', 'Restore eligibility assessment is implemented.'),
    governanceItem(
      'Authorization',
      'Completed',
      'Authorization and confirmation governance assessment is implemented.'
    ),
    governanceItem(
      'Dry-Run Certification',
      hasReportEvidence ? 'Completed' : 'Pending',
      hasReportEvidence
        ? 'Dry-run certification report evidence exists.'
        : 'No dry-run certification report evidence exists.'
    ),
    governanceItem(
      'Audit Persistence',
      hasReportEvidence ? 'Completed' : 'Pending',
      hasReportEvidence
        ? 'Dry-run certification reports are persisted as audit evidence.'
        : 'Audit evidence is pending dry-run report generation.'
    ),
    governanceItem(
      'Certification History',
      'Completed',
      'Certification history management is implemented.'
    ),
    governanceItem(
      'Readiness Dashboard',
      'Completed',
      'Restore readiness dashboard is implemented.'
    ),
  ];
  const checklist = [
    ...completionSummary,
    governanceItem(
      'Latest Dry-Run Certification Result',
      latestPassed ? 'Completed' : 'Blocked',
      latestStatus || 'No latest dry-run certification result.'
    ),
    governanceItem(
      'Restore Execution Authorization',
      'Blocked',
      'Restore execution has not been approved for activation.'
    ),
    governanceItem(
      'Runtime Recovery Execution',
      'Blocked',
      'Recovery-state execution remains outside completed Restore management phases.'
    ),
  ];
  const outstandingRequirements = [
    'Controlled Restore Engine phase must be completed and approved before execution can be considered.',
    'Recovery-state execution and runtime reconciliation must be completed and approved before execution can be considered.',
    'Final Restore activation approval must be granted before Restore can become available.',
  ];
  return {
    ok: true,
    assessment: {
      readOnly: true,
      governanceAssessment: true,
      noRestoreExecuted: true,
      restoreUnavailable: true,
      activationBlocked: true,
      restoreEligible: false,
      governanceCompletionSummary: completionSummary,
      governanceChecklist: checklist,
      blockingAssessment: blockers,
      activationReadinessAssessment: {
        status: latestPassed ? 'Governance Ready - Activation Blocked' : 'Governance Incomplete',
        governanceReady: latestPassed,
        governanceIncomplete: !latestPassed,
        activationBlocked: true,
        message:
          'Assessment only. Restore remains unavailable until future execution, recovery-state, and activation approvals are complete.',
      },
      technicalReadiness: {
        nonDestructiveInfrastructure: 'Completed',
        restoreTechnicallyExecutable: false,
        packageReader: 'Completed',
        verificationEngine: 'Completed',
        eligibilityEngine: 'Completed',
        authorizationEngine: 'Completed',
        dryRunReporting: 'Completed',
        auditHistory: 'Completed',
        readinessDashboard: 'Completed',
        note: 'Non-destructive Restore management infrastructure exists. Restore execution is not exposed or implemented for activation.',
      },
      outstandingRequirements,
      governanceDecision: restoreGovernanceDecision(dashboard),
      dashboard,
    },
  };
}

async function assessControlledRestoreEngineFoundation() {
  const auditCorrelationId = crypto.randomUUID();
  const profileResult = await authService.getProfile();
  const profile = profileResult.ok ? profileResult.profile : null;
  const checkpoints = [
    restoreFoundationCheckpoint(
      'initialize',
      'initializing',
      'Controlled Restore Engine foundation assessment initialized.'
    ),
  ];

  let result;
  let engineBoundary = null;
  try {
    if (!profile) {
      engineBoundary = restoreEngineService.assessBoundary({ profile: null });
      checkpoints.push(
        restoreFoundationCheckpoint(
          'authentication',
          'blocked',
          'Authentication is required before foundation assessment can continue.'
        )
      );
      result = restoreFoundationResult(
        'blocked',
        'Controlled Restore Engine foundation assessment blocked. No Restore was executed and Restore remains unavailable.',
        {
          auditCorrelationId,
          checkpoints,
          engineBoundary,
          blockingReasons: ['Authentication is required.'],
        }
      );
    } else {
      checkpoints.push(
        restoreFoundationCheckpoint(
          'governance',
          'validating_governance',
          'Existing Restore governance evidence is being evaluated.'
        )
      );
      engineBoundary = restoreEngineService.assessBoundary({ profile });
      const governance = await getRestoreGovernanceAssessment();
      const assessment = governance.assessment || {};
      const activation = assessment.activationReadinessAssessment || {};
      const blockers = Array.isArray(assessment.blockingAssessment)
        ? assessment.blockingAssessment
        : [];
      const ready = activation.governanceReady === true && assessment.activationBlocked === true;
      checkpoints.push(
        restoreFoundationCheckpoint(
          'governance_result',
          ready ? 'ready_for_future_execution' : 'blocked',
          ready
            ? 'Governance evidence supports future execution planning only; Restore remains unavailable.'
            : 'Governance evidence blocks future execution planning until blockers are resolved.'
        )
      );
      result = restoreFoundationResult(
        ready ? 'ready_for_future_execution' : 'blocked',
        ready
          ? 'Controlled Restore Engine foundation is ready for future execution planning only. No Restore was executed and Restore remains unavailable.'
          : 'Controlled Restore Engine foundation assessment blocked. No Restore was executed and Restore remains unavailable.',
        {
          auditCorrelationId,
          checkpoints,
          governanceDecision: assessment.governanceDecision || null,
          activationReadiness: activation.status || null,
          engineBoundary,
          technicalReadiness: assessment.technicalReadiness || {},
          outstandingRequirements: Array.isArray(assessment.outstandingRequirements)
            ? assessment.outstandingRequirements
            : [],
          blockingReasons: blockers,
        }
      );
    }
  } catch {
    checkpoints.push(
      restoreFoundationCheckpoint(
        'foundation_error',
        'failed',
        'Controlled Restore Engine foundation assessment failed before any Restore execution.'
      )
    );
    result = restoreFoundationResult(
      'failed',
      'Controlled Restore Engine foundation assessment failed. No Restore was executed and Restore remains unavailable.',
      {
        auditCorrelationId,
        checkpoints,
        engineBoundary,
        blockingReasons: ['Foundation assessment failed before Restore execution.'],
      }
    );
  }

  await activityRepository.createActivityLog({
    userId: profile?.id || null,
    action: 'backup.restore.engine_foundation_assessment',
    status:
      result.foundationState === 'ready_for_future_execution' ? 'success' : result.foundationState,
    message: `${result.message} Foundation assessment only.`,
    metadata: {
      auditCorrelationId,
      foundationState: result.foundationState,
      noRestoreExecuted: true,
      restoreUnavailable: true,
      restoreEligible: false,
      checkpoints: result.checkpoints,
      governanceDecision: result.governanceDecision || null,
      activationReadiness: result.activationReadiness || null,
      engineBoundary: result.engineBoundary || null,
      blockingReasons: result.blockingReasons || [],
    },
  });

  return {
    ...result,
    auditLogged: true,
  };
}

async function assessRestoreTransactionFoundation() {
  const auditCorrelationId = crypto.randomUUID();
  const profileResult = await authService.getProfile();
  const profile = profileResult.ok ? profileResult.profile : null;
  const checkpoints = [
    restoreTransactionCheckpoint(
      'transaction_initialize',
      'transaction_not_started',
      'Restore transaction foundation assessment initialized.'
    ),
  ];

  let result;
  try {
    if (!profile) {
      checkpoints.push(
        restoreTransactionCheckpoint(
          'transaction_authentication',
          'transaction_blocked',
          'Authentication is required before transaction precheck can continue.'
        )
      );
      result = restoreTransactionResult(
        'transaction_blocked',
        'Restore transaction foundation assessment blocked. No Restore transaction was executed, no data was committed, and Restore remains unavailable.',
        {
          auditCorrelationId,
          transactionPrecheckResult: 'blocked',
          checkpoints,
          blockingReasons: ['Authentication is required.'],
          transactionBoundaryMetadata: buildRestoreTransactionBoundaryMetadata(
            'transaction_blocked',
            ['Authentication is required.']
          ),
          checkpointSequence: buildRestoreTransactionCheckpointSequence('transaction_blocked', [
            'Authentication is required.',
          ]),
          failureStateMap: buildRestoreTransactionFailureMap('transaction_blocked', [
            'Authentication is required.',
          ]),
          rollbackPlanMetadata: buildRestoreRollbackPlanMetadata('transaction_blocked', [
            'Authentication is required.',
          ]),
          rollbackReadinessMetadata: buildRestoreRollbackReadinessMetadata('transaction_blocked', [
            'Authentication is required.',
          ]),
          recoveryMetadata: buildRestoreRecoveryMetadata('transaction_blocked', [
            'Authentication is required.',
          ]),
        }
      );
      result.transactionCertificationSnapshot = buildRestoreTransactionCertificationSnapshot({
        transactionState: result.transactionState,
        transactionPrecheckResult: result.transactionPrecheckResult,
        blockers: result.blockingReasons || [],
        boundaryMetadata: result.transactionBoundaryMetadata,
        checkpointSequence: result.checkpointSequence,
        failureStateMap: result.failureStateMap,
        rollbackPlanMetadata: result.rollbackPlanMetadata,
        rollbackReadinessMetadata: result.rollbackReadinessMetadata,
        recoveryMetadata: result.recoveryMetadata,
      });
      result.orchestrationPlanningMetadata = buildRestoreOrchestrationPlanningMetadata({
        transactionState: result.transactionState,
        blockers: result.blockingReasons || [],
        checkpointSequence: result.checkpointSequence,
        transactionBoundaryMetadata: result.transactionBoundaryMetadata,
        rollbackReadinessMetadata: result.rollbackReadinessMetadata,
        recoveryMetadata: result.recoveryMetadata,
        transactionCertificationSnapshot: result.transactionCertificationSnapshot,
      });
      result.executionPreconditionGateMatrix = buildRestoreExecutionPreconditionGateMatrix({
        transactionState: result.transactionState,
        transactionPrecheckResult: result.transactionPrecheckResult,
        blockers: result.blockingReasons || [],
        foundationState: result.foundationState,
        governanceDecision: result.governanceDecision,
        activationReadiness: result.activationReadiness,
        boundaryMetadata: result.transactionBoundaryMetadata,
        rollbackReadinessMetadata: result.rollbackReadinessMetadata,
        recoveryMetadata: result.recoveryMetadata,
        transactionCertificationSnapshot: result.transactionCertificationSnapshot,
        orchestrationPlanningMetadata: result.orchestrationPlanningMetadata,
      });
      result.executionBlockerResolutionPlan = buildRestoreExecutionBlockerResolutionPlan({
        gateMatrix: result.executionPreconditionGateMatrix,
      });
      result.executionActivationRiskRegister = buildRestoreExecutionActivationRiskRegister({
        blockerPlan: result.executionBlockerResolutionPlan,
      });
      result.executionReadinessCertificationAssessment =
        buildRestoreExecutionReadinessCertificationAssessment({
          gateMatrix: result.executionPreconditionGateMatrix,
          blockerPlan: result.executionBlockerResolutionPlan,
          riskRegister: result.executionActivationRiskRegister,
        });
    } else {
      checkpoints.push(
        restoreTransactionCheckpoint(
          'transaction_precheck',
          'transaction_precheck',
          'Existing governance and Phase 3A foundation evidence is being evaluated.'
        )
      );
      const foundation = await assessControlledRestoreEngineFoundation();
      const blockers = [];
      if (foundation.foundationState !== 'ready_for_future_execution') {
        blockers.push(
          'Controlled Restore Engine foundation is not ready for future execution planning.'
        );
      }
      if (foundation.restoreUnavailable !== true) {
        blockers.push('Restore unavailable declaration is missing.');
      }
      if (foundation.restoreEligible !== false) {
        blockers.push('Restore eligibility blocking declaration is missing.');
      }
      if (Array.isArray(foundation.blockingReasons) && foundation.blockingReasons.length) {
        blockers.push(...foundation.blockingReasons);
      }
      const ready = blockers.length === 0;
      const transactionState = ready ? 'transaction_ready' : 'transaction_blocked';
      const boundaryMetadata = buildRestoreTransactionBoundaryMetadata(transactionState, blockers);
      const checkpointSequence = buildRestoreTransactionCheckpointSequence(
        transactionState,
        blockers
      );
      const failureStateMap = buildRestoreTransactionFailureMap(transactionState, blockers);
      const rollbackPlanMetadata = buildRestoreRollbackPlanMetadata(transactionState, blockers);
      const rollbackReadinessMetadata = buildRestoreRollbackReadinessMetadata(
        transactionState,
        blockers
      );
      const recoveryMetadata = buildRestoreRecoveryMetadata(transactionState, blockers);
      const snapshot = buildRestoreTransactionCertificationSnapshot({
        transactionState,
        transactionPrecheckResult: ready ? 'passed_for_future_planning' : 'blocked',
        foundationState: foundation.foundationState || null,
        governanceDecision: foundation.governanceDecision || null,
        activationReadiness: foundation.activationReadiness || null,
        blockers: Array.from(new Set(blockers)),
        boundaryMetadata,
        checkpointSequence,
        failureStateMap,
        rollbackPlanMetadata,
        rollbackReadinessMetadata,
        recoveryMetadata,
        outstandingRequirements: Array.isArray(foundation.outstandingRequirements)
          ? foundation.outstandingRequirements
          : [],
      });
      const orchestrationPlanningMetadata = buildRestoreOrchestrationPlanningMetadata({
        transactionState,
        blockers: Array.from(new Set(blockers)),
        checkpointSequence,
        transactionBoundaryMetadata: boundaryMetadata,
        rollbackReadinessMetadata,
        recoveryMetadata,
        transactionCertificationSnapshot: snapshot,
      });
      const executionPreconditionGateMatrix = buildRestoreExecutionPreconditionGateMatrix({
        transactionState,
        transactionPrecheckResult: ready ? 'passed_for_future_planning' : 'blocked',
        blockers: Array.from(new Set(blockers)),
        foundationState: foundation.foundationState || null,
        governanceDecision: foundation.governanceDecision || null,
        activationReadiness: foundation.activationReadiness || null,
        boundaryMetadata,
        rollbackReadinessMetadata,
        recoveryMetadata,
        transactionCertificationSnapshot: snapshot,
        orchestrationPlanningMetadata,
      });
      const executionBlockerResolutionPlan = buildRestoreExecutionBlockerResolutionPlan({
        gateMatrix: executionPreconditionGateMatrix,
      });
      const executionActivationRiskRegister = buildRestoreExecutionActivationRiskRegister({
        blockerPlan: executionBlockerResolutionPlan,
      });
      const executionReadinessCertificationAssessment =
        buildRestoreExecutionReadinessCertificationAssessment({
          gateMatrix: executionPreconditionGateMatrix,
          blockerPlan: executionBlockerResolutionPlan,
          riskRegister: executionActivationRiskRegister,
        });
      checkpoints.push(
        restoreTransactionCheckpoint(
          'transaction_precheck_result',
          transactionState,
          ready
            ? 'Transaction foundation precheck passed for future orchestration planning only.'
            : 'Transaction foundation precheck is blocked by governance or foundation evidence.'
        )
      );
      result = restoreTransactionResult(
        transactionState,
        ready
          ? 'Restore transaction foundation is ready for future orchestration planning only. No Restore transaction was executed, no data was committed, and Restore remains unavailable.'
          : 'Restore transaction foundation assessment blocked. No Restore transaction was executed, no data was committed, and Restore remains unavailable.',
        {
          auditCorrelationId,
          transactionPrecheckResult: ready ? 'passed_for_future_planning' : 'blocked',
          checkpoints,
          foundationState: foundation.foundationState || null,
          foundationAuditCorrelationId: foundation.auditCorrelationId || null,
          governanceDecision: foundation.governanceDecision || null,
          activationReadiness: foundation.activationReadiness || null,
          outstandingRequirements: Array.isArray(foundation.outstandingRequirements)
            ? foundation.outstandingRequirements
            : [],
          blockingReasons: Array.from(new Set(blockers)),
          transactionBoundaryMetadata: boundaryMetadata,
          checkpointSequence,
          failureStateMap,
          rollbackPlanMetadata,
          rollbackReadinessMetadata,
          recoveryMetadata,
          transactionCertificationSnapshot: snapshot,
          orchestrationPlanningMetadata,
          executionPreconditionGateMatrix,
          executionBlockerResolutionPlan,
          executionActivationRiskRegister,
          executionReadinessCertificationAssessment,
        }
      );
    }
  } catch {
    checkpoints.push(
      restoreTransactionCheckpoint(
        'transaction_error',
        'transaction_failed',
        'Restore transaction foundation assessment failed before any Restore transaction.'
      )
    );
    result = restoreTransactionResult(
      'transaction_failed',
      'Restore transaction foundation assessment failed. No Restore transaction was executed, no data was committed, and Restore remains unavailable.',
      {
        auditCorrelationId,
        transactionPrecheckResult: 'failed',
        checkpoints,
        blockingReasons: ['Transaction foundation assessment failed before Restore transaction.'],
        transactionBoundaryMetadata: buildRestoreTransactionBoundaryMetadata('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
        checkpointSequence: buildRestoreTransactionCheckpointSequence('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
        failureStateMap: buildRestoreTransactionFailureMap('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
        rollbackPlanMetadata: buildRestoreRollbackPlanMetadata('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
        rollbackReadinessMetadata: buildRestoreRollbackReadinessMetadata('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
        recoveryMetadata: buildRestoreRecoveryMetadata('transaction_failed', [
          'Transaction foundation assessment failed before Restore transaction.',
        ]),
      }
    );
    result.transactionCertificationSnapshot = buildRestoreTransactionCertificationSnapshot({
      transactionState: result.transactionState,
      transactionPrecheckResult: result.transactionPrecheckResult,
      blockers: result.blockingReasons || [],
      boundaryMetadata: result.transactionBoundaryMetadata,
      checkpointSequence: result.checkpointSequence,
      failureStateMap: result.failureStateMap,
      rollbackPlanMetadata: result.rollbackPlanMetadata,
      rollbackReadinessMetadata: result.rollbackReadinessMetadata,
      recoveryMetadata: result.recoveryMetadata,
    });
    result.orchestrationPlanningMetadata = buildRestoreOrchestrationPlanningMetadata({
      transactionState: result.transactionState,
      blockers: result.blockingReasons || [],
      checkpointSequence: result.checkpointSequence,
      transactionBoundaryMetadata: result.transactionBoundaryMetadata,
      rollbackReadinessMetadata: result.rollbackReadinessMetadata,
      recoveryMetadata: result.recoveryMetadata,
      transactionCertificationSnapshot: result.transactionCertificationSnapshot,
    });
    result.executionPreconditionGateMatrix = buildRestoreExecutionPreconditionGateMatrix({
      transactionState: result.transactionState,
      transactionPrecheckResult: result.transactionPrecheckResult,
      blockers: result.blockingReasons || [],
      foundationState: result.foundationState,
      governanceDecision: result.governanceDecision,
      activationReadiness: result.activationReadiness,
      boundaryMetadata: result.transactionBoundaryMetadata,
      rollbackReadinessMetadata: result.rollbackReadinessMetadata,
      recoveryMetadata: result.recoveryMetadata,
      transactionCertificationSnapshot: result.transactionCertificationSnapshot,
      orchestrationPlanningMetadata: result.orchestrationPlanningMetadata,
    });
    result.executionBlockerResolutionPlan = buildRestoreExecutionBlockerResolutionPlan({
      gateMatrix: result.executionPreconditionGateMatrix,
    });
    result.executionActivationRiskRegister = buildRestoreExecutionActivationRiskRegister({
      blockerPlan: result.executionBlockerResolutionPlan,
    });
    result.executionReadinessCertificationAssessment =
      buildRestoreExecutionReadinessCertificationAssessment({
        gateMatrix: result.executionPreconditionGateMatrix,
        blockerPlan: result.executionBlockerResolutionPlan,
        riskRegister: result.executionActivationRiskRegister,
      });
  }

  await activityRepository.createActivityLog({
    userId: profile?.id || null,
    action: 'backup.restore.transaction_foundation_assessment',
    status: result.transactionState === 'transaction_ready' ? 'success' : result.transactionState,
    message: `${result.message} Transaction foundation assessment only.`,
    metadata: {
      auditCorrelationId,
      transactionState: result.transactionState,
      transactionPrecheckResult: result.transactionPrecheckResult,
      foundationState: result.foundationState || null,
      noRestoreTransactionExecuted: true,
      noDataCommitted: true,
      noRestoreExecuted: true,
      restoreUnavailable: true,
      restoreEligible: false,
      checkpoints: result.checkpoints,
      checkpointSequence: result.checkpointSequence || [],
      transactionBoundaryMetadata: result.transactionBoundaryMetadata || null,
      failureStateMap: result.failureStateMap || null,
      rollbackPlanMetadata: result.rollbackPlanMetadata || null,
      rollbackReadinessMetadata: result.rollbackReadinessMetadata || null,
      recoveryMetadata: result.recoveryMetadata || null,
      transactionCertificationSnapshot: result.transactionCertificationSnapshot || null,
      orchestrationPlanningMetadata: result.orchestrationPlanningMetadata || null,
      executionPreconditionGateMatrix: result.executionPreconditionGateMatrix || null,
      executionBlockerResolutionPlan: result.executionBlockerResolutionPlan || null,
      executionActivationRiskRegister: result.executionActivationRiskRegister || null,
      executionReadinessCertificationAssessment:
        result.executionReadinessCertificationAssessment || null,
      governanceDecision: result.governanceDecision || null,
      activationReadiness: result.activationReadiness || null,
      blockingReasons: result.blockingReasons || [],
    },
  });

  return {
    ...result,
    auditLogged: true,
  };
}

async function inspectRestorePackage(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  let result;
  try {
    result = await settingsRepository.inspectRestorePackage(filePath);
  } catch (error) {
    activityRepository
      .createActivityLog({
        userId: access.profile.id,
        action: 'backup.restore.package_inspection',
        status: 'failed',
        message: 'Package inspection failed unexpectedly.',
        metadata: {
          status: null,
          fileName: null,
          backupId: null,
          correlationId: null,
          backupClass: null,
          restoreEligible: false,
        },
      })
      .catch(() => {});
    throw error;
  }
  activityRepository
    .createActivityLog({
      userId: access.profile.id,
      action: 'backup.restore.package_inspection',
      status: 'success',
      message: result.message || 'Package inspection completed.',
      metadata: {
        status: result.status || null,
        fileName: result.fileName || null,
        backupId: result.backupId || null,
        correlationId: result.correlationId || null,
        backupClass: result.backupClass || null,
        restoreEligible: false,
      },
    })
    .catch(() => {});
  return result;
}

async function verifyRestorePackage(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  let result;
  try {
    result = await settingsRepository.verifyRestorePackage(filePath);
  } catch (error) {
    activityRepository
      .createActivityLog({
        userId: access.profile.id,
        action: 'backup.restore.package_verification',
        status: 'failed',
        message: 'Package verification failed unexpectedly.',
        metadata: {
          verificationStatus: null,
          passedChecksCount: 0,
          failedChecksCount: 0,
          warningsCount: 0,
          restoreEligible: false,
        },
      })
      .catch(() => {});
    throw error;
  }
  activityRepository
    .createActivityLog({
      userId: access.profile.id,
      action: 'backup.restore.package_verification',
      status: result.verificationStatus || 'failed',
      message: result.message || 'Package verification completed.',
      metadata: {
        verificationStatus: result.verificationStatus || null,
        passedChecksCount: Array.isArray(result.passedChecks) ? result.passedChecks.length : 0,
        failedChecksCount: Array.isArray(result.failedChecks) ? result.failedChecks.length : 0,
        warningsCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
        restoreEligible: false,
      },
    })
    .catch(() => {});
  return result;
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

function reportCheck(name, passed, message, blockingReason) {
  return {
    name,
    passed: Boolean(passed),
    message,
    blockingReason: passed ? null : blockingReason || message,
  };
}

function dryRunReportResult(status, message, details = {}) {
  return {
    ok: status === 'dry_run_certification_passed',
    certificationStatus: status,
    message,
    noRestoreExecuted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    ...details,
  };
}

function dryRunReportAuditMetadata(report = {}) {
  const packageSummary = report.packageSummary || {};
  const verificationSummary = report.verificationSummary || {};
  const eligibilitySummary = report.eligibilitySummary || {};
  const authorizationSummary = report.authorizationSummary || {};
  const blockingReasons = Array.isArray(report.blockingReasons) ? report.blockingReasons : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return {
    reportType: 'restore_dry_run_certification_report',
    reportCorrelationId: report.reportCorrelationId || null,
    certificationStatus: report.certificationStatus || null,
    packageSummary,
    verificationSummary,
    eligibilitySummary,
    authorizationSummary,
    blockingReasons,
    warnings,
    futureRestoreQualification: report.futureRestoreQualification || null,
    noRestoreExecuted: report.noRestoreExecuted === true,
    restoreUnavailable: report.restoreUnavailable === true,
    restoreEligible: report.restoreEligible === false ? false : report.restoreEligible,
    report,
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

async function generateRestoreDryRunCertificationReport(filePath, acknowledgementText = '') {
  const reportCorrelationId = crypto.randomUUID();
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
  const shouldReadPackage = accessAllowed && acknowledgementMatches && Boolean(filePath);
  const packageInspection = shouldReadPackage
    ? await settingsRepository.inspectRestorePackage(filePath)
    : null;
  const verification = shouldReadPackage
    ? await settingsRepository.verifyRestorePackage(filePath)
    : null;
  const eligibility = shouldReadPackage
    ? await settingsRepository.assessRestoreEligibility(filePath)
    : null;
  const summary = eligibility?.summary || verification?.summary || packageInspection || {};
  const authorizationSummary = {
    userAuthenticated: Boolean(profile),
    role,
    permissionOutcome: accessAllowed ? 'passed' : 'blocked',
    acknowledgementProvided: acknowledgementMatches,
    authorizationAssessmentStatus:
      accessAllowed &&
      acknowledgementMatches &&
      eligibility?.eligibilityStatus === 'eligible_for_authorization'
        ? 'authorization_assessment_would_pass'
        : 'authorization_assessment_would_block',
  };
  const checks = [
    reportCheck(
      'user.authenticated',
      Boolean(profile),
      'Authenticated user is present.',
      'Authentication is required.'
    ),
    reportCheck(
      'user.admin',
      role === 'Admin',
      'Admin role requirement is satisfied.',
      'Admin role is required.'
    ),
    reportCheck(
      'user.permission',
      accessAllowed,
      'User has dry-run report permission.',
      'User does not have permission to generate this report.'
    ),
    reportCheck(
      'confirmation.acknowledged',
      acknowledgementMatches,
      'Required acknowledgement was provided.',
      'Required acknowledgement was not provided.'
    ),
    reportCheck(
      'package.selected',
      Boolean(filePath),
      'Backup package was selected.',
      'Backup package was not selected.'
    ),
    reportCheck(
      'package.readable',
      packageInspection?.ok === true,
      'Package reader completed successfully.',
      'Package reader did not complete successfully.'
    ),
    reportCheck(
      'verification.passed',
      verification?.verificationStatus === 'passed',
      'Verification engine passed.',
      'Verification engine did not pass.'
    ),
    reportCheck(
      'eligibility.passed',
      eligibility?.eligibilityStatus === 'eligible_for_authorization',
      'Eligibility engine passed.',
      'Eligibility engine did not pass.'
    ),
    reportCheck(
      'restore.blocked',
      eligibility?.restoreEligible === false || !shouldReadPackage,
      'Restore remains unavailable.',
      'Restore blocking declaration is missing.'
    ),
  ];
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
    'Dry-run certification report only. No recovery operation was performed.',
    'Future Restore requires separate certification, authorization, recovery-state validation, and activation.',
    ...(Array.isArray(eligibility?.warnings) ? eligibility.warnings : []),
    ...(Array.isArray(verification?.warnings) ? verification.warnings : []),
  ];
  const passed = failedChecks.length === 0;
  const report = dryRunReportResult(
    passed ? 'dry_run_certification_passed' : 'dry_run_certification_blocked',
    passed
      ? 'Dry-run certification report passed. Package may proceed to future Restore certification review. No Restore was executed and Restore remains unavailable.'
      : 'Dry-run certification report blocked. No Restore was executed and Restore remains unavailable.',
    {
      reportCorrelationId,
      packageSummary: {
        fileName: summary.fileName || null,
        filePath: summary.filePath || filePath || null,
        backupId: summary.backupId || null,
        correlationId: summary.correlationId || null,
        backupClass: summary.backupClass || null,
        workflowVersion: summary.workflowVersion || null,
        manifestVersion: summary.manifestVersion || null,
        schemaVersion: summary.schemaVersion || null,
        applicationVersion: summary.applicationVersion || null,
        certificationStatus: summary.certificationStatus || null,
        includedTableCount: summary.includedTableCount ?? summary.tableCount ?? null,
        excludedTableCount: summary.excludedTableCount ?? null,
        payloadTableCount: summary.payloadTableCount ?? null,
      },
      packageReaderSummary: {
        status: packageInspection?.status || 'not_run',
        ok: packageInspection?.ok === true,
        message: packageInspection?.message || null,
      },
      verificationSummary: {
        status: verification?.verificationStatus || 'not_run',
        passedChecks: Array.isArray(verification?.passedChecks)
          ? verification.passedChecks.length
          : 0,
        failedChecks: Array.isArray(verification?.failedChecks)
          ? verification.failedChecks.length
          : 0,
      },
      eligibilitySummary: {
        status: eligibility?.eligibilityStatus || 'not_run',
        passedConditions: Array.isArray(eligibility?.passedConditions)
          ? eligibility.passedConditions.length
          : 0,
        failedConditions: Array.isArray(eligibility?.failedConditions)
          ? eligibility.failedConditions.length
          : 0,
      },
      authorizationSummary,
      passedChecks,
      failedChecks,
      blockingReasons,
      warnings,
      futureRestoreQualification: passed
        ? 'Package qualifies for future Restore certification review only. Restore remains unavailable until all governance requirements are completed.'
        : 'Package does not qualify for future Restore certification review until blocking reasons are resolved.',
    }
  );
  const auditRecord = await activityRepository.createActivityLog({
    userId: profile?.id || null,
    action: 'backup.restore.dry_run_certification_report',
    status: passed ? 'success' : 'blocked',
    message: passed
      ? 'Restore dry-run certification report saved; Restore remains unavailable.'
      : 'Blocked Restore dry-run certification report saved; Restore remains unavailable.',
    metadata: dryRunReportAuditMetadata(report),
  });
  return {
    ...report,
    reportAuditId: auditRecord?.id || null,
    reportSaved: true,
  };
}

// ─── R2-C: restoreBackup — Service-Internal Only ─────────────────────────────
// NOT in module.exports. Not reachable from controller/preload/API/renderer.
// Will be exported only after a controller IPC channel is approved in R2-D.
// ─────────────────────────────────────────────────────────────────────────────

const RESTORE_EXECUTION_AUDIT_ACTION = 'backup.restore.execution';

async function restoreBackup(filePath, acknowledgementText) {
  const auditCorrelationId = crypto.randomUUID();

  // ── Gate 1: Auth + Admin + permission ──────────────────────────────────────
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'access_denied',
      message: access.message || 'Restore aborted: access denied.',
    };
  }
  const profile = access.profile;
  const userId = profile.id;

  // ── Gate 2: filePath present ────────────────────────────────────────────────
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'no_file_selected',
      message: 'Restore aborted: no backup file was selected.',
    };
  }

  // ── Gate 3: Re-check package eligibility (live, before execution) ───────────
  let eligibility;
  try {
    eligibility = await settingsRepository.assessRestoreEligibility(normalizedPath);
  } catch {
    await activityRepository.createActivityLog({
      userId,
      action: RESTORE_EXECUTION_AUDIT_ACTION,
      status: 'failed',
      message: 'Restore aborted: eligibility re-check threw unexpectedly. No data was changed.',
      metadata: {
        auditCorrelationId,
        reason: 'eligibility_check_failed',
        restoreExecuted: false,
        noDataCommitted: true,
      },
    });
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'eligibility_check_failed',
      message: 'Restore aborted: eligibility re-check failed unexpectedly. No data was changed.',
    };
  }
  if (eligibility?.eligibilityStatus !== 'eligible_for_authorization') {
    await activityRepository.createActivityLog({
      userId,
      action: RESTORE_EXECUTION_AUDIT_ACTION,
      status: 'blocked',
      message: 'Restore aborted: package eligibility re-check failed. No data was changed.',
      metadata: {
        auditCorrelationId,
        reason: 'eligibility_blocked',
        eligibilityStatus: eligibility?.eligibilityStatus || null,
        blockingReasons: Array.isArray(eligibility?.blockingReasons)
          ? eligibility.blockingReasons
          : [],
        restoreExecuted: false,
        noDataCommitted: true,
      },
    });
    return {
      ok: false,
      restoreExecuted: false,
      abortedBeforeTransaction: true,
      reason: 'eligibility_blocked',
      message:
        'Restore aborted: backup package does not pass eligibility checks. No data was changed.',
    };
  }

  // ── Audit entry 1: Pre-execution authorization record ──────────────────────
  await activityRepository.createActivityLog({
    userId,
    action: 'backup.restore.execution_authorization',
    status: 'initiated',
    message: 'Restore execution authorized. Repository execution starting. No data committed yet.',
    metadata: {
      auditCorrelationId,
      filePath: normalizedPath,
      userId,
      role: profile.role,
      permissionOutcome: 'passed',
      eligibilityStatus: eligibility.eligibilityStatus,
      restoreExecuted: false,
      noDataCommitted: true,
    },
  });

  // ── Repository call ─────────────────────────────────────────────────────────
  // acknowledgementText is passed through unchanged.
  // The repository validates it against RESTORE_EXECUTION_ACKNOWLEDGEMENT.
  // On any throw, the transaction has already been rolled back by withTransaction.
  let result;
  try {
    result = await settingsRepository.executeRestoreBackup(
      normalizedPath,
      acknowledgementText,
      userId
    );
  } catch (err) {
    await activityRepository.createActivityLog({
      userId,
      action: RESTORE_EXECUTION_AUDIT_ACTION,
      status: 'failed',
      message: `Restore execution threw unexpectedly. ${err.message || ''} No data was changed.`,
      metadata: {
        auditCorrelationId,
        reason: err.message || 'unexpected_throw',
        restoreExecuted: false,
        rolledBack: true,
        noDataCommitted: true,
      },
    });
    throw err;
  }

  // ── Audit entry 2: Post-execution result record ─────────────────────────────
  await activityRepository.createActivityLog({
    userId,
    action: RESTORE_EXECUTION_AUDIT_ACTION,
    status: result.ok ? 'success' : 'failed',
    message: result.message,
    metadata: {
      auditCorrelationId,
      restoreExecuted: result.restoreExecuted,
      rolledBack: result.rolledBack ?? false,
      tablesRestored: result.tablesRestored ?? null,
      rowsRestored: result.rowsRestored ?? null,
      backupId: result.backupId ?? null,
      repositoryLogId: result.logId ?? null,
      reason: result.reason ?? null,
      mismatches: result.mismatches ?? null,
      noDataCommitted: !result.restoreExecuted,
    },
  });

  return {
    ok: result.ok,
    restoreExecuted: result.restoreExecuted,
    rolledBack: result.rolledBack ?? false,
    tablesRestored: result.tablesRestored ?? null,
    rowsRestored: result.rowsRestored ?? null,
    backupId: result.backupId ?? null,
    auditCorrelationId,
    message: result.message,
  };
}
// ─── End R2-C ─────────────────────────────────────────────────────────────────

module.exports = {
  assessBackupPreflight,
  assessRestoreEligibility,
  assessRestoreAuthorization,
  createBackup,
  generateRestoreDryRunCertificationReport,
  getSettings,
  inspectRestorePackage,
  getRestoreDryRunReport,
  getRestoreReadinessDashboard,
  getRestoreGovernanceAssessment,
  assessControlledRestoreEngineFoundation,
  assessRestoreTransactionFoundation,
  listRestoreDryRunReports,
  listBackups,
  restoreBackup,
  saveSettings,
  verifyRestorePackage,
};
