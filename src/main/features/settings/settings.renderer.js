(function SettingsRendererModule() {
  'use strict';

  let initialized = false;
  const listeners = [];
  let reportSearchTimer = null;
  const dryRunReportState = {
    search: '',
    status: 'all',
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    sort: 'newest',
    page: 1,
    pageSize: 10,
    total: 0,
  };

  const A = () => window.SettingsApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function text(value, fallback = '-') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function esc(value) {
    return text(value, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setValue(id, value) {
    const el = $id(id);
    if (el) el.value = text(value, '');
  }

  function setChecked(id, value) {
    const el = $id(id);
    if (el) el.checked = Boolean(value);
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = text(value);
  }

  function showMessage(message, type = 'error') {
    const el = $id('settingsMessage');
    if (!el) return;
    const isError = type === 'error';
    el.textContent = message || '';
    el.classList.remove('hidden');
    el.style.background = isError ? '#fef2f2' : '#f0fdf4';
    el.style.color = isError ? '#b91c1c' : '#166534';
    el.style.border = isError ? '1px solid #fca5a5' : '1px solid #86efac';
  }

  function renderSettings(settings = {}) {
    const store = settings.store || {};
    const tax = settings.tax || {};
    const printer = settings.printer || {};
    const system = settings.system || {};

    setValue('storeName', store.storeName);
    setValue('storePhone', store.phone);
    setValue('storeEmail', store.email);
    setValue('storeTaxNumber', store.taxNumber);
    setValue('storeLogoPath', store.logoPath);
    setValue('storeReceiptFooter', store.receiptFooterText);
    setValue('storeAddress', store.address);

    setChecked('taxEnabled', tax.enabled);
    setValue('defaultTaxPercentage', tax.defaultTaxPercentage);
    setValue('taxMode', tax.mode || 'excluded');

    setValue('paperWidth', printer.paperWidth || '80mm');
    setChecked('autoPrintAfterSale', printer.autoPrint);
    setChecked('silentPrint', printer.silentPrint);
    setValue('receiptCopies', printer.receiptCopies || 1);
    setValue('printerFooter', printer.footerText);
    const printerSelect = $id('printerSelect');
    if (printerSelect) {
      const printerName = text(printer.printerName, 'No printer selected');
      printerSelect.innerHTML = `<option>${esc(printerName)}</option>`;
    }

    setValue('currencySymbol', system.currencySymbol);
    setValue('dateFormat', system.dateFormat);
    setValue('lowStockAlertThreshold', system.lowStockAlertThreshold);
    setValue('invoicePrefix', system.invoicePrefix);
    setValue('nextInvoiceNumber', system.nextInvoiceNumber);
  }

  function renderAppInfo(result = {}) {
    const info = result.info || {};
    setText('updateCurrentVersion', info.version || info.packageVersion);
    setText('updateLatestVersion', info.version || info.packageVersion);
    setText('updateState', 'Unavailable');
    setText('aboutVersion', info.version || info.packageVersion);
    setText('aboutBuildDate', info.buildDate);
    setText('aboutEnvironment', info.environment);
    setText('aboutSyncStatus', 'Unavailable');
  }

  function renderLicenseUnavailable() {
    setText('licenseState', 'Unavailable');
    setText('licenseStatus', 'Disabled');
    setText('licenseExpires', '-');
    setText('licenseMachineId', '-');
  }

  function renderBackups(result = {}) {
    const tbody = $id('backupHistoryBody');
    if (!tbody) return;
    const backups = Array.isArray(result.backups) ? result.backups : [];
    if (!backups.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="px-3 py-6 text-center text-zinc-500">No backup history available.</td></tr>';
      return;
    }
    tbody.innerHTML = backups
      .map(
        (backup) => `<tr>
          <td class="px-3 py-2">${esc(backup.fileName || '-')}</td>
          <td class="px-3 py-2">${esc(backup.action || '-')}</td>
          <td class="px-3 py-2">${esc(backup.createdBy || '-')}</td>
          <td class="px-3 py-2">${esc(backup.status || '-')}</td>
          <td class="px-3 py-2">${esc(backup.createdAt || '-')}</td>
          <td class="px-3 py-2">${esc(backup.filePath || '-')}</td>
        </tr>`
      )
      .join('');
  }

  function renderPackageInspection(result = {}) {
    const panel = $id('restorePackageInspection');
    if (!panel) return;
    if (!result.status) {
      panel.textContent = 'Package Inspection Only — Restore is not available.';
      return;
    }
    const lines = [
      result.message || 'Package inspection completed.',
      `Status: ${text(result.status)}`,
      `File: ${text(result.fileName)}`,
      `Backup ID: ${text(result.backupId)}`,
      `Correlation ID: ${text(result.correlationId)}`,
      `Backup Class: ${text(result.backupClass)}`,
      `Workflow Version: ${text(result.workflowVersion)}`,
      `Manifest Version: ${text(result.manifestVersion)}`,
      `Tables Declared: ${text(result.tableCount)}`,
      `Integrity Declared: ${result.integrityDeclared ? 'Yes' : 'No'}`,
      'Restore: Not available',
    ];
    panel.textContent = lines.join('\n');
  }

  function renderPackageVerification(result = {}) {
    const panel = $id('restorePackageVerification');
    if (!panel) return;
    if (!result.verificationStatus) {
      panel.textContent = 'Verification Only - Restore is not available.';
      return;
    }
    const summary = result.summary || {};
    const passedChecks = Array.isArray(result.passedChecks) ? result.passedChecks : [];
    const failedChecks = Array.isArray(result.failedChecks) ? result.failedChecks : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const lines = [
      result.message || 'Package verification completed. Restore is not available.',
      `Verification Status: ${text(result.verificationStatus)}`,
      `File: ${text(result.fileName || summary.fileName)}`,
      `Backup ID: ${text(summary.backupId)}`,
      `Correlation ID: ${text(summary.correlationId)}`,
      `Backup Class: ${text(summary.backupClass)}`,
      `Workflow Version: ${text(summary.workflowVersion)}`,
      `Manifest Version: ${text(summary.manifestVersion)}`,
      `Included Tables: ${text(summary.includedTableCount ?? summary.tableCount)}`,
      `Excluded Tables: ${text(summary.excludedTableCount)}`,
      `Payload Tables: ${text(summary.payloadTableCount)}`,
      `Certification Status: ${text(summary.certificationStatus)}`,
      `Passed Checks: ${passedChecks.length}`,
      `Failed Checks: ${failedChecks.length}`,
      `Warnings: ${warnings.length}`,
      'Restore: Not available',
    ];
    if (failedChecks.length) {
      lines.push(
        'Failed:',
        ...failedChecks.map((item) => `- ${text(item.name)}: ${text(item.message)}`)
      );
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderEligibilityAssessment(result = {}) {
    const panel = $id('restoreEligibilityAssessment');
    if (!panel) return;
    if (!result.eligibilityStatus) {
      panel.textContent = 'Eligibility Assessment Only - Restore is not available.';
      return;
    }
    const summary = result.summary || {};
    const passedConditions = Array.isArray(result.passedConditions) ? result.passedConditions : [];
    const failedConditions = Array.isArray(result.failedConditions) ? result.failedConditions : [];
    const blockingReasons = Array.isArray(result.blockingReasons) ? result.blockingReasons : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const lines = [
      result.message || 'Eligibility assessment completed. Restore remains unavailable.',
      `Eligibility Status: ${text(result.eligibilityStatus)}`,
      `Verification Status: ${text(result.verificationStatus)}`,
      `File: ${text(result.fileName || summary.fileName)}`,
      `Backup ID: ${text(summary.backupId)}`,
      `Correlation ID: ${text(summary.correlationId)}`,
      `Backup Class: ${text(summary.backupClass)}`,
      `Workflow Version: ${text(summary.workflowVersion)}`,
      `Manifest Version: ${text(summary.manifestVersion)}`,
      `Schema Version: ${text(summary.schemaVersion)}`,
      `Application Version: ${text(summary.applicationVersion)}`,
      `Certification Status: ${text(summary.certificationStatus)}`,
      `Passed Conditions: ${passedConditions.length}`,
      `Failed Conditions: ${failedConditions.length}`,
      `Blocking Reasons: ${blockingReasons.length}`,
      `Warnings: ${warnings.length}`,
      'Restore: Not available',
    ];
    if (blockingReasons.length) {
      lines.push('Blocking Reasons:', ...blockingReasons.map((reason) => `- ${text(reason)}`));
    }
    if (failedConditions.length) {
      lines.push(
        'Failed Conditions:',
        ...failedConditions.map((item) => `- ${text(item.name)}: ${text(item.message)}`)
      );
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderAuthorizationAssessment(result = {}) {
    const panel = $id('restoreAuthorizationAssessment');
    if (!panel) return;
    if (!result.authorizationStatus) {
      panel.textContent = 'Authorization Assessment Only - Restore is not available.';
      return;
    }
    const summary = result.summary || {};
    const passedChecks = Array.isArray(result.passedAuthorizationChecks)
      ? result.passedAuthorizationChecks
      : [];
    const failedChecks = Array.isArray(result.failedAuthorizationChecks)
      ? result.failedAuthorizationChecks
      : [];
    const blockingReasons = Array.isArray(result.blockingReasons) ? result.blockingReasons : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const lines = [
      result.message || 'Authorization assessment completed. Restore remains unavailable.',
      `Authorization Status: ${text(result.authorizationStatus)}`,
      `Eligibility Status: ${text(result.eligibilityStatus)}`,
      `Verification Status: ${text(result.verificationStatus)}`,
      `Audit Correlation ID: ${text(result.auditCorrelationId)}`,
      `File: ${text(result.fileName || summary.fileName)}`,
      `Backup ID: ${text(summary.backupId)}`,
      `Correlation ID: ${text(summary.correlationId)}`,
      `Certification Status: ${text(summary.certificationStatus)}`,
      `Passed Authorization Checks: ${passedChecks.length}`,
      `Failed Authorization Checks: ${failedChecks.length}`,
      `Blocking Reasons: ${blockingReasons.length}`,
      `Warnings: ${warnings.length}`,
      'Restore: Not available',
    ];
    if (blockingReasons.length) {
      lines.push('Blocking Reasons:', ...blockingReasons.map((reason) => `- ${text(reason)}`));
    }
    if (failedChecks.length) {
      lines.push(
        'Failed Authorization Checks:',
        ...failedChecks.map((item) => `- ${text(item.name)}: ${text(item.message)}`)
      );
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderDryRunCertificationReport(result = {}) {
    const panel = $id('restoreDryRunCertificationReport');
    if (!panel) return;
    if (!result.certificationStatus) {
      panel.textContent = 'Dry-Run Certification Report Only - Restore is not available.';
      return;
    }
    const packageSummary = result.packageSummary || {};
    const reader = result.packageReaderSummary || {};
    const verification = result.verificationSummary || {};
    const eligibility = result.eligibilitySummary || {};
    const authorization = result.authorizationSummary || {};
    const passedChecks = Array.isArray(result.passedChecks) ? result.passedChecks : [];
    const failedChecks = Array.isArray(result.failedChecks) ? result.failedChecks : [];
    const blockingReasons = Array.isArray(result.blockingReasons) ? result.blockingReasons : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const lines = [
      result.message || 'Dry-run certification report completed. Restore remains unavailable.',
      `Overall Certification Status: ${text(result.certificationStatus)}`,
      `Report Correlation ID: ${text(result.reportCorrelationId)}`,
      `File: ${text(packageSummary.fileName)}`,
      `Backup ID: ${text(packageSummary.backupId)}`,
      `Correlation ID: ${text(packageSummary.correlationId)}`,
      `Backup Class: ${text(packageSummary.backupClass)}`,
      `Workflow Version: ${text(packageSummary.workflowVersion)}`,
      `Manifest Version: ${text(packageSummary.manifestVersion)}`,
      `Schema Version: ${text(packageSummary.schemaVersion)}`,
      `Application Version: ${text(packageSummary.applicationVersion)}`,
      `Certification Status: ${text(packageSummary.certificationStatus)}`,
      `Included Tables: ${text(packageSummary.includedTableCount)}`,
      `Excluded Tables: ${text(packageSummary.excludedTableCount)}`,
      `Payload Tables: ${text(packageSummary.payloadTableCount)}`,
      `Package Reader: ${text(reader.status)}`,
      `Verification: ${text(verification.status)} (${text(verification.passedChecks)} passed / ${text(verification.failedChecks)} failed)`,
      `Eligibility: ${text(eligibility.status)} (${text(eligibility.passedConditions)} passed / ${text(eligibility.failedConditions)} failed)`,
      `Authorization Governance: ${text(authorization.authorizationAssessmentStatus)}`,
      `Permission Outcome: ${text(authorization.permissionOutcome)}`,
      `Acknowledgement Provided: ${authorization.acknowledgementProvided ? 'Yes' : 'No'}`,
      `Passed Checks: ${passedChecks.length}`,
      `Failed Checks: ${failedChecks.length}`,
      `Blocking Reasons: ${blockingReasons.length}`,
      `Warnings: ${warnings.length}`,
      `Future Restore Qualification: ${text(result.futureRestoreQualification)}`,
      `No Restore Executed: ${result.noRestoreExecuted ? 'Yes' : 'No'}`,
      'Restore: Not available',
    ];
    if (blockingReasons.length) {
      lines.push('Blocking Reasons:', ...blockingReasons.map((reason) => `- ${text(reason)}`));
    }
    if (failedChecks.length) {
      lines.push(
        'Failed Checks:',
        ...failedChecks.map((item) => `- ${text(item.name)}: ${text(item.message)}`)
      );
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderRestoreReadinessDashboard(result = {}) {
    const panel = $id('restoreReadinessDashboard');
    if (!panel) return;
    const dashboard = result.dashboard || result;
    if (!dashboard.overallReadiness) {
      panel.textContent =
        'Read Only Governance Dashboard - No Restore Executed - Restore Unavailable.';
      return;
    }
    const overall = dashboard.overallReadiness || {};
    const packageStatus = dashboard.packageStatus || {};
    const verification = dashboard.verificationStatus || {};
    const eligibility = dashboard.eligibilityStatus || {};
    const authorization = dashboard.authorizationStatus || {};
    const history = dashboard.certificationHistorySummary || {};
    const audit = dashboard.auditSummary || {};
    const blockingConditions = Array.isArray(dashboard.blockingConditions)
      ? dashboard.blockingConditions
      : [];
    const warnings = Array.isArray(dashboard.warnings) ? dashboard.warnings : [];
    const lines = [
      'Read Only Governance Dashboard - No Restore Executed - Restore Unavailable.',
      `Current Restore Readiness: ${text(overall.currentRestoreReadiness)}`,
      `Current Certification State: ${text(overall.currentCertificationState)}`,
      `Latest Certification Date: ${text(overall.latestCertificationDate)}`,
      `Latest Certification Result: ${text(overall.latestCertificationResult)}`,
      '',
      'Package Status',
      `Package: ${text(packageStatus.fileName)}`,
      `Backup ID: ${text(packageStatus.backupId)}`,
      `Package Correlation ID: ${text(packageStatus.correlationId)}`,
      `Backup Class: ${text(packageStatus.backupClass)}`,
      `Workflow Version: ${text(packageStatus.workflowVersion)}`,
      `Manifest Version: ${text(packageStatus.manifestVersion)}`,
      '',
      'Verification Status',
      `Status: ${text(verification.status)}`,
      `Passed Checks: ${text(verification.passedChecks)}`,
      `Failed Checks: ${text(verification.failedChecks)}`,
      '',
      'Eligibility Status',
      `Status: ${text(eligibility.status)}`,
      `Passed Conditions: ${text(eligibility.passedConditions)}`,
      `Failed Conditions: ${text(eligibility.failedConditions)}`,
      '',
      'Authorization Status',
      `Status: ${text(authorization.authorizationAssessmentStatus)}`,
      `Permission Outcome: ${text(authorization.permissionOutcome)}`,
      `Acknowledgement Provided: ${authorization.acknowledgementProvided ? 'Yes' : 'No'}`,
      '',
      'Certification History Summary',
      `Total Reports: ${text(history.totalReports, '0')}`,
      `Certified: ${text(history.certified, '0')}`,
      `Blocked: ${text(history.blocked, '0')}`,
      `Failed Verification: ${text(history.failedVerification, '0')}`,
      `Failed Eligibility: ${text(history.failedEligibility, '0')}`,
      `Authorization Blocked: ${text(history.authorizationBlocked, '0')}`,
      '',
      'Audit Summary',
      `Last Dry-Run: ${text(audit.lastDryRun?.createdAt)}`,
      `Last Certification: ${text(audit.lastCertification?.createdAt)}`,
      `Last Verification: ${text(audit.lastVerification?.status)}`,
      `Restore Eligible: ${dashboard.restoreEligible === true ? 'Yes' : 'No'}`,
    ];
    if (blockingConditions.length) {
      lines.push(
        '',
        'Blocking Conditions:',
        ...blockingConditions.map((reason) => `- ${text(reason)}`)
      );
    }
    if (warnings.length) {
      lines.push('', 'Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderDryRunReportHistory(result = {}) {
    const tbody = $id('dryRunReportHistoryBody');
    if (!tbody) return;
    const reports = Array.isArray(result.reports) ? result.reports : [];
    dryRunReportState.page = Number(result.page || dryRunReportState.page || 1);
    dryRunReportState.pageSize = Number(result.pageSize || dryRunReportState.pageSize || 10);
    dryRunReportState.total = Number(result.total || 0);
    if (!reports.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="px-3 py-6 text-center text-zinc-500">No saved dry-run certification reports available.</td></tr>';
      renderDryRunReportHistorySummary();
      return;
    }
    tbody.innerHTML = reports
      .map(
        (report) => `<tr>
          <td class="px-3 py-2">${esc(report.reportCorrelationId || report.id || '-')}</td>
          <td class="px-3 py-2">${esc(report.certificationStatus || report.status || '-')}</td>
          <td class="px-3 py-2">${esc(report.fileName || report.backupId || '-')}</td>
          <td class="px-3 py-2">${esc(report.verificationStatus || '-')}</td>
          <td class="px-3 py-2">${esc(report.eligibilityStatus || '-')}</td>
          <td class="px-3 py-2">${esc(report.createdAt || '-')}</td>
          <td class="px-3 py-2"><button type="button" class="epos-btn epos-btn-sm epos-btn-outline" data-dry-run-report-id="${esc(report.id)}">View</button></td>
        </tr>`
      )
      .join('');
    renderDryRunReportHistorySummary();
  }

  function renderDryRunReportHistorySummary() {
    const summary = $id('dryRunReportHistorySummary');
    const previous = $id('prevDryRunReportPageButton');
    const next = $id('nextDryRunReportPageButton');
    const total = dryRunReportState.total;
    const pageSize = dryRunReportState.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(dryRunReportState.page, totalPages);
    if (summary) {
      summary.textContent = `Read Only Audit Evidence - Page ${page} of ${totalPages}, ${total} report(s). No Restore was executed. Restore remains unavailable.`;
    }
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  function syncDryRunReportDateControls() {
    const isCustom = ($id('dryRunReportDatePreset')?.value || 'all') === 'custom';
    const from = $id('dryRunReportDateFrom');
    const to = $id('dryRunReportDateTo');
    if (from) from.disabled = !isCustom;
    if (to) to.disabled = !isCustom;
  }

  function collectDryRunReportFilters(page = dryRunReportState.page) {
    dryRunReportState.search = $id('dryRunReportSearch')?.value || '';
    dryRunReportState.status = $id('dryRunReportStatusFilter')?.value || 'all';
    dryRunReportState.datePreset = $id('dryRunReportDatePreset')?.value || 'all';
    dryRunReportState.dateFrom = $id('dryRunReportDateFrom')?.value || '';
    dryRunReportState.dateTo = $id('dryRunReportDateTo')?.value || '';
    dryRunReportState.sort = $id('dryRunReportSort')?.value || 'newest';
    dryRunReportState.pageSize = Number($id('dryRunReportPageSize')?.value || 10);
    dryRunReportState.page = Math.max(1, Number(page) || 1);
    return { ...dryRunReportState };
  }

  function renderSavedDryRunReportDetail(result = {}) {
    const panel = $id('restoreDryRunSavedReportDetail');
    if (!panel) return;
    const audit = result.report || result;
    const report = audit.report || {};
    if (!audit.id && !report.certificationStatus) {
      panel.textContent =
        'Select a saved dry-run certification report to view audit evidence. Restore remains unavailable.';
      return;
    }
    const packageSummary = report.packageSummary || {};
    const verification = report.verificationSummary || {};
    const eligibility = report.eligibilitySummary || {};
    const authorization = report.authorizationSummary || {};
    const blockingReasons = Array.isArray(report.blockingReasons) ? report.blockingReasons : [];
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    const lines = [
      'Saved dry-run certification report audit record. This record does not approve, enable, or execute Restore.',
      `Audit ID: ${text(audit.id)}`,
      `Created: ${text(audit.createdAt)}`,
      `Created By: ${text(audit.createdBy)}`,
      `Overall Certification Status: ${text(report.certificationStatus || audit.certificationStatus)}`,
      `Report Correlation ID: ${text(report.reportCorrelationId || audit.reportCorrelationId)}`,
      `File: ${text(packageSummary.fileName || audit.fileName)}`,
      `Backup ID: ${text(packageSummary.backupId || audit.backupId)}`,
      `Correlation ID: ${text(packageSummary.correlationId || audit.packageCorrelationId)}`,
      `Backup Class: ${text(packageSummary.backupClass || audit.backupClass)}`,
      `Verification: ${text(verification.status || audit.verificationStatus)}`,
      `Eligibility: ${text(eligibility.status || audit.eligibilityStatus)}`,
      `Authorization Governance: ${text(
        authorization.authorizationAssessmentStatus || audit.authorizationStatus
      )}`,
      `Blocking Reasons: ${blockingReasons.length || audit.blockingReasonCount || 0}`,
      `Warnings: ${warnings.length || audit.warningCount || 0}`,
      `Future Restore Qualification: ${text(report.futureRestoreQualification)}`,
      `No Restore Executed: ${report.noRestoreExecuted || audit.noRestoreExecuted ? 'Yes' : 'No'}`,
      `Restore Unavailable: ${report.restoreUnavailable || audit.restoreUnavailable ? 'Yes' : 'No'}`,
      `Restore Eligible: ${report.restoreEligible === true ? 'Yes' : 'No'}`,
    ];
    if (blockingReasons.length) {
      lines.push('Blocking Reasons:', ...blockingReasons.map((reason) => `- ${text(reason)}`));
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function setBackupBusy(isBusy) {
    const button = $id('createBackupButton');
    if (!button) return;
    button.disabled = Boolean(isBusy);
    button.setAttribute('aria-disabled', String(Boolean(isBusy)));
    button.textContent = isBusy ? 'Creating Backup...' : 'Create Certified Backup';
  }

  function showUnavailable(featureName) {
    const result = A().unavailable(featureName);
    showMessage(result.message, 'error');
  }

  function handleBlockedAction(event) {
    const target = event.target.closest('[data-settings-tab][disabled], button[disabled]');
    if (!target || !$id('settingsModule')?.contains(target)) return;
    const label = target.textContent?.trim() || target.title || 'This action';
    showUnavailable(label.replace(/\s+Disabled$/i, ''));
  }

  function switchSettingsTab(tabName) {
    document.querySelectorAll('#settingsModule [data-settings-tab]').forEach((tab) => {
      const isActive = tab.dataset.settingsTab === tabName;
      tab.classList.toggle('epos-btn-primary', isActive);
      tab.classList.toggle('epos-btn-outline', !isActive);
    });
    document.querySelectorAll('#settingsModule [data-settings-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tabName);
    });
  }

  function handleTabClick(event) {
    const target = event.target.closest('[data-settings-tab]');
    if (!target || target.disabled || !$id('settingsModule')?.contains(target)) return;
    switchSettingsTab(target.dataset.settingsTab);
  }

  async function handleCreateBackup() {
    setBackupBusy(true);
    try {
      const result = await A().createBackup();
      if (!result?.ok) {
        showMessage(result?.message || 'Certified backup failed.', 'error');
        return;
      }
      showMessage(
        result.message || 'Certified backup created and verified successfully.',
        'success'
      );
      const backups = await A().listBackups();
      if (backups?.ok) renderBackups(backups);
    } catch {
      showMessage('Certified backup failed. Review audit logs before retrying.', 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRefreshBackups() {
    try {
      const backups = await A().listBackups();
      if (backups?.ok) {
        renderBackups(backups);
        showMessage('Backup history refreshed.', 'success');
        return;
      }
      showMessage(backups?.message || 'Unable to refresh backup history.', 'error');
    } catch {
      showMessage('Unable to refresh backup history.', 'error');
    }
  }

  async function handleInspectRestorePackage() {
    try {
      const result = await A().inspectRestorePackage();
      renderPackageInspection(result || {});
      showMessage(
        result?.message || 'Package inspection completed.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Package inspection failed. Restore remains unavailable.', 'error');
    }
  }

  async function handleVerifyRestorePackage() {
    try {
      const result = await A().verifyRestorePackage();
      renderPackageVerification(result || {});
      showMessage(
        result?.message || 'Package verification completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Package verification failed. Restore remains unavailable.', 'error');
    }
  }

  async function handleAssessRestoreEligibility() {
    try {
      const result = await A().assessRestoreEligibility();
      renderEligibilityAssessment(result || {});
      showMessage(
        result?.message || 'Eligibility assessment completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Eligibility assessment failed. Restore remains unavailable.', 'error');
    }
  }

  async function handleAssessRestoreAuthorization() {
    try {
      const acknowledgementText = $id('restoreAuthorizationAcknowledgement')?.value || '';
      const result = await A().assessRestoreAuthorization(acknowledgementText);
      renderAuthorizationAssessment(result || {});
      showMessage(
        result?.message || 'Authorization assessment completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Authorization assessment failed. Restore remains unavailable.', 'error');
    }
  }

  async function handleDryRunCertificationReport() {
    try {
      const acknowledgementText = $id('restoreAuthorizationAcknowledgement')?.value || '';
      const result = await A().dryRunCertificationReport(acknowledgementText);
      renderDryRunCertificationReport(result || {});
      const reports = await A().listDryRunCertificationReports(collectDryRunReportFilters(1));
      if (reports?.ok) renderDryRunReportHistory(reports);
      const dashboard = await A().restoreReadinessDashboard();
      if (dashboard?.ok) renderRestoreReadinessDashboard(dashboard);
      showMessage(
        result?.message || 'Dry-run certification report completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Dry-run certification report failed. Restore remains unavailable.', 'error');
    }
  }

  async function handleRefreshDryRunReportHistory(page = dryRunReportState.page) {
    try {
      const result = await A().listDryRunCertificationReports(collectDryRunReportFilters(page));
      if (result?.ok) {
        renderDryRunReportHistory(result);
        showMessage('Dry-run certification report history refreshed.', 'success');
        return;
      }
      showMessage(result?.message || 'Unable to refresh dry-run report history.', 'error');
    } catch {
      showMessage('Unable to refresh dry-run report history.', 'error');
    }
  }

  async function handleRefreshRestoreReadinessDashboard() {
    try {
      const result = await A().restoreReadinessDashboard();
      if (result?.ok) {
        renderRestoreReadinessDashboard(result);
        showMessage(
          'Restore readiness dashboard refreshed. Restore remains unavailable.',
          'success'
        );
        return;
      }
      showMessage(result?.message || 'Unable to refresh Restore readiness dashboard.', 'error');
    } catch {
      showMessage('Unable to refresh Restore readiness dashboard.', 'error');
    }
  }

  function scheduleDryRunReportSearch() {
    clearTimeout(reportSearchTimer);
    reportSearchTimer = setTimeout(() => {
      handleRefreshDryRunReportHistory(1).catch(() => {});
    }, 250);
  }

  function handleDryRunReportDatePresetChange() {
    syncDryRunReportDateControls();
    handleRefreshDryRunReportHistory(1).catch(() => {});
  }

  function handleApplyDryRunReportFilters() {
    handleRefreshDryRunReportHistory(1).catch(() => {});
  }

  function handlePreviousDryRunReportPage() {
    const previousPage = Math.max(1, dryRunReportState.page - 1);
    handleRefreshDryRunReportHistory(previousPage).catch(() => {});
  }

  function handleNextDryRunReportPage() {
    const totalPages = Math.max(1, Math.ceil(dryRunReportState.total / dryRunReportState.pageSize));
    const nextPage = Math.min(totalPages, dryRunReportState.page + 1);
    handleRefreshDryRunReportHistory(nextPage).catch(() => {});
  }

  async function handleViewDryRunReport(event) {
    const target = event.target.closest('[data-dry-run-report-id]');
    if (!target || !$id('settingsModule')?.contains(target)) return;
    try {
      const result = await A().getDryRunCertificationReport(target.dataset.dryRunReportId);
      if (result?.ok) {
        renderSavedDryRunReportDetail(result);
        showMessage(
          'Saved dry-run certification report loaded. Restore remains unavailable.',
          'success'
        );
        return;
      }
      showMessage(result?.message || 'Unable to load saved dry-run report.', 'error');
    } catch {
      showMessage('Unable to load saved dry-run report.', 'error');
    }
  }

  function addListener(target, eventName, handler, options) {
    if (!target) return;
    target.addEventListener(eventName, handler, options);
    listeners.push({ target, eventName, handler, options });
  }

  async function loadReadOnlyData() {
    try {
      const [settings, appInfo, backups] = await Promise.all([
        A().getSettings(),
        A().appInfo(),
        A().listBackups(),
      ]);

      if (settings?.ok) renderSettings(settings.settings || {});
      if (appInfo?.ok) renderAppInfo(appInfo);
      if (backups?.ok) renderBackups(backups);
      A()
        .restoreReadinessDashboard()
        .then((dashboard) => {
          if (dashboard?.ok) renderRestoreReadinessDashboard(dashboard);
        })
        .catch(() => {});
      A()
        .listDryRunCertificationReports(collectDryRunReportFilters())
        .then((reports) => {
          if (reports?.ok) renderDryRunReportHistory(reports);
        })
        .catch(() => {});
      renderLicenseUnavailable();
    } catch {
      showMessage('Unable to load read-only settings data.', 'error');
    }
  }

  function renderUI() {
    if (!$id('settingsModule')) return;
    if (!initialized) {
      initialized = true;
      addListener(document, 'click', handleBlockedAction, true);
      addListener($id('settingsModule'), 'click', handleTabClick);
      addListener($id('createBackupButton'), 'click', handleCreateBackup);
      addListener($id('refreshBackupHistoryButton'), 'click', handleRefreshBackups);
      addListener($id('inspectRestorePackageButton'), 'click', handleInspectRestorePackage);
      addListener($id('verifyRestorePackageButton'), 'click', handleVerifyRestorePackage);
      addListener($id('assessRestoreEligibilityButton'), 'click', handleAssessRestoreEligibility);
      addListener(
        $id('assessRestoreAuthorizationButton'),
        'click',
        handleAssessRestoreAuthorization
      );
      addListener($id('dryRunCertificationReportButton'), 'click', handleDryRunCertificationReport);
      addListener(
        $id('refreshRestoreReadinessDashboardButton'),
        'click',
        handleRefreshRestoreReadinessDashboard
      );
      addListener(
        $id('refreshDryRunReportHistoryButton'),
        'click',
        handleRefreshDryRunReportHistory
      );
      addListener($id('dryRunReportSearch'), 'input', scheduleDryRunReportSearch);
      addListener($id('dryRunReportStatusFilter'), 'change', handleRefreshDryRunReportHistory);
      addListener($id('dryRunReportDatePreset'), 'change', handleDryRunReportDatePresetChange);
      addListener($id('dryRunReportDateFrom'), 'change', handleRefreshDryRunReportHistory);
      addListener($id('dryRunReportDateTo'), 'change', handleRefreshDryRunReportHistory);
      addListener($id('dryRunReportSort'), 'change', handleRefreshDryRunReportHistory);
      addListener($id('dryRunReportPageSize'), 'change', handleRefreshDryRunReportHistory);
      addListener($id('applyDryRunReportFiltersButton'), 'click', handleApplyDryRunReportFilters);
      addListener($id('prevDryRunReportPageButton'), 'click', handlePreviousDryRunReportPage);
      addListener($id('nextDryRunReportPageButton'), 'click', handleNextDryRunReportPage);
      addListener($id('settingsModule'), 'click', handleViewDryRunReport);
    }
    syncDryRunReportDateControls();
    loadReadOnlyData().catch(() => {});
  }

  function updateUI(diff = {}) {
    if (diff.settings) renderSettings(diff.settings);
    if (diff.appInfo) renderAppInfo(diff.appInfo);
    if (diff.licenseUnavailable) renderLicenseUnavailable();
    if (diff.backups) renderBackups({ backups: diff.backups });
    if (diff.packageInspection) renderPackageInspection(diff.packageInspection);
    if (diff.packageVerification) renderPackageVerification(diff.packageVerification);
    if (diff.restoreEligibility) renderEligibilityAssessment(diff.restoreEligibility);
    if (diff.restoreAuthorization) renderAuthorizationAssessment(diff.restoreAuthorization);
    if (diff.dryRunCertificationReport) {
      renderDryRunCertificationReport(diff.dryRunCertificationReport);
    }
    if (diff.restoreReadinessDashboard) {
      renderRestoreReadinessDashboard(diff.restoreReadinessDashboard);
    }
    if (diff.dryRunReportHistory) renderDryRunReportHistory(diff.dryRunReportHistory);
    if (diff.savedDryRunReport) renderSavedDryRunReportDetail(diff.savedDryRunReport);
    if (diff.message) showMessage(diff.message, diff.type || 'success');
  }

  function destroyUI() {
    listeners.splice(0).forEach(({ target, eventName, handler, options }) => {
      target.removeEventListener(eventName, handler, options);
    });
    clearTimeout(reportSearchTimer);
    reportSearchTimer = null;
    initialized = false;
  }

  function initSettingsModule() {
    renderUI();
  }

  window.SettingsRenderer = {
    destroyUI,
    renderUI,
    updateUI,
  };
  window.initSettingsModule = initSettingsModule;
})();
