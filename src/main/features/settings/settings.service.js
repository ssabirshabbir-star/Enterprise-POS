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
  try {
    if (!profile) {
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
  generateRestoreDryRunCertificationReport,
  getSettings,
  inspectRestorePackage,
  getRestoreDryRunReport,
  getRestoreReadinessDashboard,
  getRestoreGovernanceAssessment,
  assessControlledRestoreEngineFoundation,
  listRestoreDryRunReports,
  listBackups,
  restoreBackup,
  saveSettings,
  verifyRestorePackage,
};
