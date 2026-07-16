(function SettingsRendererModule() {
  'use strict';

  let initialized = false;
  const listeners = [];
  let reportSearchTimer = null;
  let backupSearchTimer = null;
  let restorePreparationBusy = false;
  let lastRestorePolicy = null;
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
  const backupHistoryState = {
    rows: [],
    search: '',
    selectedId: null,
    page: 1,
    pageSize: 100,
    total: 0,
  };
  const storeLogoState = {
    logoToken: '',
    logoAction: '',
    hasSavedLogo: false,
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

  function renderStoreLogoPreview(result = {}) {
    const img = $id('storeLogoPreview');
    const placeholder = $id('storeLogoPlaceholder');
    const status = $id('storeLogoStatus');
    const removeButton = $id('removeStoreLogoButton');
    const hasPreview = Boolean(result.previewDataUrl);
    storeLogoState.hasSavedLogo = Boolean(result.hasLogo);
    if (img) {
      img.src = hasPreview ? result.previewDataUrl : '';
      img.classList.toggle('hidden', !hasPreview);
    }
    if (placeholder) placeholder.classList.toggle('hidden', hasPreview);
    if (removeButton) {
      const canRemove =
        hasPreview || storeLogoState.hasSavedLogo || storeLogoState.logoAction === 'remove';
      removeButton.classList.toggle('hidden', !canRemove);
      removeButton.disabled = storeLogoState.logoAction === 'remove';
      removeButton.setAttribute('aria-disabled', String(removeButton.disabled));
    }
    if (status) {
      const fileName = result.fileName ? `${result.fileName}. ` : '';
      status.textContent =
        result.message ||
        (hasPreview
          ? `${fileName}PNG or JPEG, up to 2 MB. Save Store Settings to keep changes.`
          : 'PNG or JPEG, up to 2 MB. Recommended square or wide logo, at least 64 x 64 px.');
    }
  }

  async function loadStoreLogoPreview() {
    try {
      const result = await A().getStoreLogoPreview();
      if (result?.ok) {
        storeLogoState.logoToken = '';
        storeLogoState.logoAction = '';
        renderStoreLogoPreview(result);
      } else {
        renderStoreLogoPreview({
          hasLogo: false,
          message: result?.message || 'Logo preview unavailable.',
        });
      }
    } catch {
      renderStoreLogoPreview({ hasLogo: false, message: 'Logo preview unavailable.' });
    }
  }

  function renderSettings(settings = {}) {
    const store = settings.store || {};
    const tax = settings.tax || {};
    const printer = settings.printer || {};
    const system = settings.system || {};

    setValue('storeName', store.storeName);
    setValue('storeBusinessDescription', store.businessDescription);
    setValue('storePhone', store.phone);
    setValue('storeEmail', store.email);
    setValue('storeTaxNumber', store.taxNumber);
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

  function collectStoreSettings() {
    return {
      storeName: ($id('storeName')?.value || '').trim(),
      businessDescription: ($id('storeBusinessDescription')?.value || '').trim(),
      phone: ($id('storePhone')?.value || '').trim(),
      email: ($id('storeEmail')?.value || '').trim(),
      address: ($id('storeAddress')?.value || '').trim(),
      taxNumber: ($id('storeTaxNumber')?.value || '').trim(),
      receiptFooterText: ($id('storeReceiptFooter')?.value || '').replace(/\r\n?/g, '\n').trim(),
      logoToken: storeLogoState.logoToken,
      logoAction: storeLogoState.logoAction,
    };
  }

  function validateStoreForm(payload) {
    if (!payload.storeName) return 'Business name is required.';
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      return 'Enter a valid email address.';
    }
    if (payload.businessDescription.length > 120) {
      return 'Business description must be 120 characters or less.';
    }
    if (/[<>]/.test(payload.businessDescription)) {
      return 'Business description cannot contain HTML markup.';
    }
    if (payload.receiptFooterText.length > 500) {
      return 'Receipt footer must be 500 characters or less.';
    }
    if (/[<>]/.test(payload.receiptFooterText)) {
      return 'Receipt footer cannot contain HTML markup.';
    }
    return '';
  }

  function setStoreSaveBusy(isBusy) {
    const button = $id('saveStoreSettingsButton');
    if (!button) return;
    button.disabled = Boolean(isBusy);
    button.setAttribute('aria-disabled', String(Boolean(isBusy)));
    button.textContent = isBusy ? 'Saving...' : 'Save Store Settings';
  }

  async function handleSaveStoreSettings() {
    const payload = collectStoreSettings();
    const validationMessage = validateStoreForm(payload);
    if (validationMessage) {
      showMessage(validationMessage, 'error');
      return;
    }
    setStoreSaveBusy(true);
    try {
      const result = await A().saveStoreSettings(payload);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save Store Settings.', 'error');
        return;
      }
      if (result.settings) renderSettings(result.settings);
      await loadStoreLogoPreview();
      showMessage(result.message || 'Store Settings saved successfully.', 'success');
    } catch {
      showMessage('Unable to save Store Settings.', 'error');
    } finally {
      setStoreSaveBusy(false);
    }
  }

  async function handleChooseStoreLogo() {
    try {
      const result = await A().chooseStoreLogo();
      if (result?.cancelled) return;
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to select logo.', 'error');
        return;
      }
      storeLogoState.logoToken = result.logoToken || '';
      storeLogoState.logoAction = '';
      renderStoreLogoPreview({
        previewDataUrl: result.previewDataUrl,
        fileName: result.fileName,
        message: result.message || 'Logo selected. Save Store Settings to apply it.',
      });
      showMessage(result.message || 'Logo selected. Save Store Settings to apply it.', 'success');
    } catch {
      showMessage('Unable to select logo.', 'error');
    }
  }

  function handleRemoveStoreLogo() {
    storeLogoState.logoToken = '';
    storeLogoState.logoAction = 'remove';
    renderStoreLogoPreview({
      hasLogo: false,
      previewDataUrl: '',
      message: 'Logo will be removed when Save Store Settings succeeds.',
    });
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

  function collectBackupHistoryFilters(page = backupHistoryState.page) {
    backupHistoryState.search = $id('backupHistorySearch')?.value || '';
    backupHistoryState.page = Math.max(1, Number(page) || 1);
    return {
      search: backupHistoryState.search,
      status: $id('backupHistoryStatusFilter')?.value || 'all',
      datePreset: $id('backupHistoryDatePreset')?.value || 'all',
      dateFrom: $id('backupHistoryDateFrom')?.value || '',
      dateTo: $id('backupHistoryDateTo')?.value || '',
      sort: $id('backupHistorySort')?.value || 'newest',
      page: backupHistoryState.page,
      pageSize: backupHistoryState.pageSize,
    };
  }

  function setBackupHistoryBusy(isBusy) {
    const controls = [
      'backupHistorySearch',
      'clearBackupHistorySearchButton',
      'backupHistoryStatusFilter',
      'backupHistoryDatePreset',
      'backupHistorySort',
      'backupHistoryDateFrom',
      'backupHistoryDateTo',
      'prevBackupHistoryPageButton',
      'nextBackupHistoryPageButton',
      'refreshBackupHistoryButton',
    ];
    controls.forEach((id) => {
      const el = $id(id);
      if (el) el.disabled = Boolean(isBusy);
    });
    if (isBusy) {
      const tbody = $id('backupHistoryBody');
      if (tbody)
        tbody.innerHTML =
          '<tr><td colspan="8" class="px-3 py-6 text-center text-zinc-400">Loading backup history…</td></tr>';
      backupHistoryState.selectedId = null;
      renderBackupHistoryDetail(null);
      renderBackupHistorySummary();
    }
  }

  function renderBackupHistoryErrorRow(message) {
    const tbody = $id('backupHistoryBody');
    if (tbody)
      tbody.innerHTML = `<tr><td colspan="8" class="px-3 py-6 text-center text-red-500">${esc(message || 'Unable to load backup history.')}</td></tr>`;
    backupHistoryState.rows = [];
    backupHistoryState.total = 0;
    backupHistoryState.selectedId = null;
    renderBackupHistoryDetail(null);
    renderBackupHistorySummary();
  }

  function renderBackups(result = {}) {
    const tbody = $id('backupHistoryBody');
    if (!tbody) return;
    backupHistoryState.rows = Array.isArray(result.backups) ? result.backups : [];
    backupHistoryState.page = Number(result.page || backupHistoryState.page || 1);
    backupHistoryState.pageSize = Number(result.pageSize || backupHistoryState.pageSize || 100);
    backupHistoryState.total = Number(result.total || 0);
    renderBackupHistoryTable();
  }

  function backupHistoryId(backup = {}) {
    return text(backup.backupId || backup.id);
  }

  function formatBackupTimestamp(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  function backupHistorySearchText(backup = {}) {
    return [
      backupHistoryId(backup),
      backup.fileName,
      backup.action,
      backup.status,
      backup.filePath,
      backup.createdBy,
      backup.createdAt,
      backup.message,
    ]
      .map((value) => text(value, '').toLowerCase())
      .join(' ');
  }

  function filteredBackupHistory() {
    const query = backupHistoryState.search.trim().toLowerCase();
    if (!query) return backupHistoryState.rows;
    return backupHistoryState.rows.filter((backup) =>
      backupHistorySearchText(backup).includes(query)
    );
  }

  function renderBackupHistorySummary() {
    const summary = $id('backupHistorySummary');
    const previous = $id('prevBackupHistoryPageButton');
    const next = $id('nextBackupHistoryPageButton');
    const total = backupHistoryState.total;
    const pageSize = backupHistoryState.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(backupHistoryState.page, totalPages);
    const selected = backupHistoryState.selectedId
      ? ` Selected ID: ${backupHistoryState.selectedId}.`
      : '';
    if (summary) {
      summary.textContent = `Backup history is read-only. Page ${page} of ${totalPages}, ${total} record(s).${selected}`;
    }
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  function renderBackupHistoryDetail(backup = null) {
    const panel = $id('backupHistoryDetail');
    if (!panel) return;
    if (!backup) {
      panel.textContent = 'Select a backup history row to view read-only details.';
      return;
    }
    const lines = [
      'Backup History Detail - Read Only',
      `Backup ID: ${text(backup.backupId, 'Not available in backup_logs')}`,
      `Backup Log ID: ${backupHistoryId(backup)}`,
      `File: ${text(backup.fileName)}`,
      `Status: ${text(backup.status)}`,
      `Action: ${text(backup.action)}`,
      `Path: ${text(backup.filePath)}`,
      `Created By: ${text(backup.createdBy)}`,
      `Timestamp: ${formatBackupTimestamp(backup.createdAt)}`,
      `Message: ${text(backup.message)}`,
    ];
    panel.textContent = lines.join('\n');
  }

  function renderBackupHistoryTable() {
    const tbody = $id('backupHistoryBody');
    if (!tbody) return;
    const backups = filteredBackupHistory();
    if (!backups.length) {
      const hasActiveFilters =
        backupHistoryState.search.trim() ||
        ($id('backupHistoryStatusFilter')?.value || 'all') !== 'all' ||
        ($id('backupHistoryDatePreset')?.value || 'all') !== 'all';
      const emptyMessage = hasActiveFilters
        ? 'No records match the current filters.'
        : 'No backup history available.';
      tbody.innerHTML = `<tr><td colspan="8" class="px-3 py-6 text-center text-zinc-500">${esc(emptyMessage)}</td></tr>`;
      renderBackupHistoryDetail(null);
      backupHistoryState.selectedId = null;
      renderBackupHistorySummary();
      return;
    }
    const selected = backups.find(
      (backup) => backupHistoryId(backup) === backupHistoryState.selectedId
    );
    if (!selected) backupHistoryState.selectedId = backupHistoryId(backups[0]);
    tbody.innerHTML = backups
      .map(
        (backup) => `<tr>
          <td class="px-3 py-2">${esc(backupHistoryId(backup))}</td>
          <td class="px-3 py-2">${esc(backup.fileName || '-')}</td>
          <td class="px-3 py-2">${esc(backup.status || '-')}</td>
          <td class="px-3 py-2">${esc(backup.filePath || '-')}</td>
          <td class="px-3 py-2">${esc(backup.createdBy || '-')}</td>
          <td class="px-3 py-2">${esc(formatBackupTimestamp(backup.createdAt))}</td>
          <td class="px-3 py-2">${esc(backup.message || '-')}</td>
          <td class="px-3 py-2"><button type="button" class="epos-btn epos-btn-sm epos-btn-outline" data-backup-history-id="${esc(backupHistoryId(backup))}">View</button></td>
        </tr>`
      )
      .join('');
    renderBackupHistoryDetail(selected || backups[0]);
    renderBackupHistorySummary();
  }

  function renderBackupVerificationSummary(result = {}) {
    const panel = $id('backupVerificationSummary');
    if (!panel) return;
    const backup = result.backup || {};
    const lines = [
      'Latest Backup Verification Summary - Read Only',
      `Status: ${result.ok ? 'Success' : 'Not available'}`,
      `File Name: ${text(backup.fileName, 'Not available')}`,
      `File Path: ${text(backup.filePath, 'Not available')}`,
      `Table Count: ${text(backup.tableCount, 'Not available')}`,
      `Checksum: ${text(backup.integrityHash, 'Not available')}`,
      `Verification Status: ${text(backup.verificationStatus, 'Not available')}`,
      `Certification Status: ${text(backup.certificationStatus, 'Not available')}`,
      `Message: ${text(result.message, 'Not available')}`,
      'Restore: Not available',
    ];
    panel.textContent = lines.join('\n');
  }

  function renderBackupPreflightAssessment(result = {}) {
    const panel = $id('backupPreflightAssessment');
    if (!panel) return;
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const lines = [
      'Backup Preflight Assessment - Read Only',
      `Status: ${text(result.preflightStatus, 'Not available')}`,
      `Selected Path: ${text(result.filePath, 'Not available')}`,
      `File Name: ${text(result.fileName, 'Not available')}`,
      `Writable Destination: ${result.writableDestination === true ? 'Yes' : 'No'}`,
      `Estimated Backup Ready: ${result.estimatedBackupReady === true ? 'Yes' : 'No'}`,
      `Message: ${text(result.message, 'Not available')}`,
      'Backup Created: No',
      'Restore: Not available',
    ];
    if (checks.length) {
      lines.push(
        'Checks:',
        ...checks.map(
          (check) => `- ${text(check.name)}: ${text(check.status)} - ${text(check.message)}`
        )
      );
    }
    if (warnings.length) {
      lines.push('Warnings:', ...warnings.map((warning) => `- ${text(warning)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderPackageInspection(result = {}) {
    const panel = $id('restorePackageInspection');
    if (!panel) return;
    if (!result.status) {
      panel.textContent = 'Package Inspection Only — Restore is not available.';
      return;
    }
    if (result.status !== 'package_readable') {
      panel.textContent = [
        result.message || 'Package inspection completed.',
        `Status: ${text(result.status)}`,
        'Restore: Not available',
      ].join('\n');
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
      `Report Saved: ${result.reportSaved === true ? 'Yes' : 'No'}`,
      `Audit ID: ${text(result.reportAuditId)}`,
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

    // ── R2-F: Enable/disable restoreBackupButton based on live governance data ──
    // restoreEligible is set by the readiness dashboard backend only when all
    // governance gates pass. The button stays disabled at all other times.
    const restoreBtn = $id('restoreBackupButton');
    if (restoreBtn) {
      const eligible = dashboard.restoreEligible === true;
      restoreBtn.disabled = !eligible;
      restoreBtn.setAttribute('aria-disabled', String(!eligible));
    }
  }

  function renderRestoreGovernanceAssessment(result = {}) {
    const panel = $id('restoreGovernanceAssessment');
    if (!panel) return;
    const assessment = result.assessment || result;
    if (!assessment.governanceAssessment) {
      panel.textContent =
        'Governance Assessment - Read Only - No Restore Executed - Restore Unavailable - Activation Blocked.';
      return;
    }
    const completion = Array.isArray(assessment.governanceCompletionSummary)
      ? assessment.governanceCompletionSummary
      : [];
    const checklist = Array.isArray(assessment.governanceChecklist)
      ? assessment.governanceChecklist
      : [];
    const blockers = Array.isArray(assessment.blockingAssessment)
      ? assessment.blockingAssessment
      : [];
    const outstanding = Array.isArray(assessment.outstandingRequirements)
      ? assessment.outstandingRequirements
      : [];
    const activation = assessment.activationReadinessAssessment || {};
    const technical = assessment.technicalReadiness || {};
    const lines = [
      'Governance Assessment - Read Only - No Restore Executed - Restore Unavailable - Activation Blocked.',
      `Governance Decision: ${text(assessment.governanceDecision)}`,
      `Activation Readiness: ${text(activation.status)}`,
      `Restore Technically Executable: ${technical.restoreTechnicallyExecutable ? 'Yes' : 'No'}`,
      `Restore Permitted: ${assessment.activationBlocked ? 'No' : 'Yes'}`,
      '',
      'Governance Completion Summary:',
      ...completion.map(
        (item) => `- ${text(item.name)}: ${text(item.status)} - ${text(item.evidence)}`
      ),
      '',
      'Governance Checklist:',
      ...checklist.map(
        (item) => `- ${text(item.name)}: ${text(item.status)} - ${text(item.evidence)}`
      ),
      '',
      'Activation Readiness Assessment:',
      `- Governance Ready: ${activation.governanceReady ? 'Yes' : 'No'}`,
      `- Governance Incomplete: ${activation.governanceIncomplete ? 'Yes' : 'No'}`,
      `- Activation Blocked: ${activation.activationBlocked ? 'Yes' : 'No'}`,
      `- ${text(activation.message)}`,
      '',
      'Technical Readiness:',
      `- Non-Destructive Infrastructure: ${text(technical.nonDestructiveInfrastructure)}`,
      `- Package Reader: ${text(technical.packageReader)}`,
      `- Verification Engine: ${text(technical.verificationEngine)}`,
      `- Eligibility Engine: ${text(technical.eligibilityEngine)}`,
      `- Authorization Engine: ${text(technical.authorizationEngine)}`,
      `- Dry-Run Reporting: ${text(technical.dryRunReporting)}`,
      `- Audit History: ${text(technical.auditHistory)}`,
      `- Readiness Dashboard: ${text(technical.readinessDashboard)}`,
      `- ${text(technical.note)}`,
    ];
    if (blockers.length) {
      lines.push('', 'Blocking Assessment:', ...blockers.map((reason) => `- ${text(reason)}`));
    }
    if (outstanding.length) {
      lines.push('', 'Outstanding Requirements:', ...outstanding.map((item) => `- ${text(item)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderRestoreExecutionPolicy(result = {}) {
    const panel = $id('restoreExecutionPolicy');
    if (!panel) return;
    const policy = result.policy || result;
    lastRestorePolicy = policy;
    const recovery = policy.recoveryState || {};
    const blockers = Array.isArray(policy.blockers) ? policy.blockers : [];
    const warnings = Array.isArray(policy.warnings) ? policy.warnings : [];
    const requiredActions = Array.isArray(policy.requiredActions) ? policy.requiredActions : [];
    const safety = policy.safetyBackupReference || recovery.safetyBackupReference || {};
    const databaseIdentity =
      policy.databaseIdentity || policy.productionGovernance?.databaseIdentity || {};
    const startupRecovery =
      policy.startupRecovery || policy.productionGovernance?.startupRecovery || {};
    const finalAssessment =
      policy.finalCertificationAssessment ||
      policy.productionGovernance?.finalCertificationAssessment ||
      {};
    const lines = [
      'Restore Execution Policy - Read Only - No Restore Executed',
      `Execution Eligible: ${policy.executionEligible === true ? 'Yes' : 'No'}`,
      `Execution Certified: ${policy.executionCertified === true ? 'Yes' : 'No'}`,
      `Package Valid: ${policy.packageValid === true ? 'Yes' : 'No'}`,
      `Package Compatible: ${policy.packageCompatible === true ? 'Yes' : 'No'}`,
      `Operator Authorized: ${policy.operatorAuthorized === true ? 'Yes' : 'No'}`,
      `Operation Lock: ${text(policy.operationLockStatus)}`,
      `Database Health: ${text(policy.databaseHealth)}`,
      `Rollback Capability: ${text(policy.rollbackCapability)}`,
      `Safety Backup Required: ${policy.safetyBackupRequired ? 'Yes' : 'No'}`,
      `Safety Backup Verified: ${policy.safetyBackupVerified ? 'Yes' : 'No'}`,
      `Restart Required: ${policy.restartRequired ? 'Yes' : 'No'}`,
      `Database Identity: ${text(databaseIdentity.host)}:${text(databaseIdentity.port)}/${text(databaseIdentity.database)}`,
      `Database Fingerprint: ${text(databaseIdentity.fingerprint)}`,
      `Startup Lockout Required: ${startupRecovery.maintenanceModeRequired ? 'Yes' : 'No'}`,
      `Final Certification Blockers: ${
        Array.isArray(finalAssessment.blockers) ? finalAssessment.blockers.length : '-'
      }`,
      '',
      'Recovery State:',
      `- Operation ID: ${text(recovery.operationId)}`,
      `- Current State: ${text(recovery.currentState)}`,
      `- Previous State: ${text(recovery.previousState)}`,
      `- Active Operation: ${recovery.activeOperation ? 'Yes' : 'No'}`,
      `- Rollback Required: ${recovery.rollbackRequired ? 'Yes' : 'No'}`,
    ];
    if (safety && Object.keys(safety).length) {
      lines.push(
        '',
        'Safety Backup Reference:',
        `- Backup ID: ${text(safety.safetyBackupId)}`,
        `- Backup Log ID: ${text(safety.backupLogId)}`,
        `- Checksum: ${text(safety.checksum)}`,
        `- Path: ${text(safety.filePath)}`
      );
    }
    if (blockers.length) {
      lines.push(
        '',
        'Execution Blockers:',
        ...blockers.map((item) => `- ${text(item.code)}: ${text(item.message)}`)
      );
    }
    if (requiredActions.length) {
      lines.push(
        '',
        'Required Actions:',
        ...requiredActions.map((item) => `- ${text(item.code)}: ${text(item.message)}`)
      );
    }
    if (warnings.length) {
      lines.push('', 'Warnings:', ...warnings.map((item) => `- ${text(item.message)}`));
    }
    panel.textContent = lines.join('\n');
    syncRestorePreparationControls(policy);
    syncRestoreFinalConfirmationControls(policy);
  }

  function syncRestorePreparationControls(policy = lastRestorePolicy || {}) {
    const prepare = $id('prepareRestoreSafetyBackupButton');
    const cancel = $id('cancelRestorePreparationButton');
    const recovery = policy.recoveryState || {};
    const active = recovery.activeOperation === true;
    const canCancel =
      active &&
      ['PREFLIGHT_READY', 'SAFETY_BACKUP_VERIFIED', 'FAILED_RECOVERABLE'].includes(
        recovery.currentState
      );
    if (prepare) {
      prepare.disabled = restorePreparationBusy || active;
      prepare.setAttribute('aria-disabled', prepare.disabled ? 'true' : 'false');
    }
    if (cancel) {
      cancel.disabled = restorePreparationBusy || !canCancel;
      cancel.setAttribute('aria-disabled', cancel.disabled ? 'true' : 'false');
    }
  }

  function syncRestoreFinalConfirmationControls(policy = lastRestorePolicy || {}) {
    const button = $id('recordRestoreFinalConfirmationButton');
    const phrase = $id('restoreFinalConfirmationPhrase');
    const recovery = policy.recoveryState || {};
    const canRecord =
      recovery.currentState === 'SAFETY_BACKUP_VERIFIED' &&
      policy.safetyBackupVerified === true &&
      policy.restoreExecutionAvailable !== true;
    if (button) {
      button.disabled = restorePreparationBusy || !canRecord;
      button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    }
    if (phrase) phrase.disabled = restorePreparationBusy || !canRecord;
  }

  function renderRestoreStartupRecovery(result = {}) {
    const panel = $id('restoreStartupRecoveryStatus');
    if (!panel) return;
    const recovery = result.startupRecovery || {};
    panel.textContent = [
      'Startup Recovery Status - Read Only',
      `Startup Allowed: ${recovery.startupAllowed ? 'Yes' : 'No'}`,
      `Maintenance Mode Required: ${recovery.maintenanceModeRequired ? 'Yes' : 'No'}`,
      `Database Mutations Blocked: ${recovery.databaseMutationsBlocked ? 'Yes' : 'No'}`,
      `Operation ID: ${text(recovery.operationId)}`,
      `Current State: ${text(recovery.currentState)}`,
      `Message: ${text(recovery.message)}`,
      'Restore Execution: Unavailable',
    ].join('\n');
  }

  function renderRestoreRetentionAssessment(result = {}) {
    const panel = $id('restoreRetentionStatus');
    if (!panel) return;
    const retention = result.retention || {};
    panel.textContent = [
      'Safety Backup Retention Assessment - Read Only',
      `Artifact: ${text(retention.artifactPath)}`,
      `Test Only: ${retention.testOnly ? 'Yes' : 'No'}`,
      `Terminal Operation: ${retention.terminal ? 'Yes' : 'No'}`,
      `Dangerous State: ${retention.dangerous ? 'Yes' : 'No'}`,
      `Cleanup Eligible: ${retention.cleanupEligible ? 'Yes' : 'No'}`,
      `Retention Days: ${text(retention.retentionDays)}`,
      `Reason: ${text(retention.reason)}`,
      'Cleanup Action: Not performed from this screen.',
    ].join('\n');
  }

  function renderRestoreFinalConfirmation(result = {}) {
    const panel = $id('restoreFinalConfirmationStatus');
    if (!panel) return;
    const confirmation = result.confirmation || {};
    const blockers = Array.isArray(result.blockers) ? result.blockers : [];
    panel.textContent = [
      'Final Restore Confirmation Evidence',
      `Recorded: ${result.confirmationCreated ? 'Yes' : 'No'}`,
      `Confirmation ID: ${text(confirmation.confirmationId)}`,
      `Expires: ${text(confirmation.expiresAt)}`,
      `Database Fingerprint: ${text(confirmation.databaseFingerprint)}`,
      `Execution Available: ${result.restoreExecutionAvailable === true ? 'Yes' : 'No'}`,
      `Message: ${text(result.message)}`,
      ...(blockers.length ? ['Blockers:', ...blockers.map((item) => `- ${text(item)}`)] : []),
    ].join('\n');
  }

  function renderRestoreEngineFoundationStatus(result = {}) {
    const panel = $id('restoreEngineFoundationStatus');
    if (!panel) return;
    if (!result.foundationState) {
      panel.textContent =
        'Engine Foundation Status: idle. No Restore executed. Restore remains unavailable.';
      return;
    }
    const checkpoints = Array.isArray(result.checkpoints) ? result.checkpoints : [];
    const blockers = Array.isArray(result.blockingReasons) ? result.blockingReasons : [];
    const outstanding = Array.isArray(result.outstandingRequirements)
      ? result.outstandingRequirements
      : [];
    const engineBoundary = result.engineBoundary || {};
    const engineLayers = Array.isArray(engineBoundary.layers) ? engineBoundary.layers : [];
    const requestModel = engineBoundary.requestModel || {};
    const requestSession = requestModel.session || {};
    const requestSnapshot = requestModel.assessmentSnapshot || {};
    const executionContext = requestModel.executionContext || {};
    const requestValidation = requestModel.validation || {};
    const stateMachine = engineBoundary.stateMachine || {};
    const allowedStates = Array.isArray(stateMachine.allowedStates)
      ? stateMachine.allowedStates
      : [];
    const blockedTransitions = Array.isArray(stateMachine.blockedTransitions)
      ? stateMachine.blockedTransitions
      : [];
    const stateValidation = stateMachine.validation || {};
    const transactionAdapter = engineBoundary.transactionAdapter || {};
    const transactionCapability = transactionAdapter.capability || {};
    const transactionInterface = transactionAdapter.transactionBoundaryInterface || {};
    const beginOperation = transactionInterface.begin || {};
    const commitOperation = transactionInterface.commit || {};
    const rollbackOperation = transactionInterface.rollback || {};
    const transactionBlockers = Array.isArray(transactionCapability.blockers)
      ? transactionCapability.blockers
      : [];
    const lines = [
      result.message ||
        'Controlled Restore Engine foundation assessment completed. Restore remains unavailable.',
      `Engine Foundation Status: ${text(result.foundationState)}`,
      `Audit Correlation ID: ${text(result.auditCorrelationId)}`,
      `Governance Decision: ${text(result.governanceDecision)}`,
      `Activation Readiness: ${text(result.activationReadiness)}`,
      `Audit Logged: ${result.auditLogged ? 'Yes' : 'No'}`,
      `No Restore Executed: ${result.noRestoreExecuted ? 'Yes' : 'No'}`,
      `Restore Unavailable: ${result.restoreUnavailable ? 'Yes' : 'No'}`,
      `Restore Eligible: ${result.restoreEligible === true ? 'Yes' : 'No'}`,
      '',
      'Restore Engine Internal Boundary:',
      `- Module: ${text(engineBoundary.module)}`,
      `- Boundary Status: ${text(engineBoundary.boundaryStatus)}`,
      `- Read Only: ${engineBoundary.readOnly === true ? 'Yes' : 'No'}`,
      `- Internal Only: ${engineBoundary.internalOnly === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        engineBoundary.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- Public Restore API Available: ${
        engineBoundary.publicRestoreApiAvailable === true ? 'Yes' : 'No'
      }`,
      `- Settings Integration Only: ${
        engineBoundary.settingsIntegrationOnly === true ? 'Yes' : 'No'
      }`,
      `- Request Model Status: ${text(engineBoundary.requestModelStatus)}`,
      `- Transaction Adapter Status: ${text(engineBoundary.transactionAdapterStatus)}`,
      `- ${text(engineBoundary.message)}`,
      '',
      'Restore Engine Boundary Layers:',
      ...engineLayers.map(
        (layer) => `- ${text(layer.name)}: ${text(layer.status)} - ${text(layer.responsibility)}`
      ),
      '',
      'Restore Execution Request Model:',
      `- Request Status: ${text(requestModel.requestStatus)}`,
      `- Immutable: ${requestModel.immutable === true ? 'Yes' : 'No'}`,
      `- Internal Only: ${requestModel.internalOnly === true ? 'Yes' : 'No'}`,
      `- Read Only: ${requestModel.readOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Executed: ${requestModel.noRestoreExecuted === true ? 'Yes' : 'No'}`,
      `- No Data Committed: ${requestModel.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        requestModel.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      '',
      'Restore Request Session:',
      `- Session Status: ${text(requestSession.sessionStatus)}`,
      `- Operator ID: ${text(requestSession.operatorId)}`,
      `- Operator Role: ${text(requestSession.operatorRole)}`,
      `- Correlation ID: ${text(requestSession.correlationId)}`,
      '',
      'Assessment Snapshot Consumption:',
      `- Snapshot Status: ${text(requestSnapshot.sourceStatus)}`,
      `- Certification Outcome: ${text(requestSnapshot.certificationOutcome)}`,
      `- Restore Unavailable: ${requestSnapshot.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${requestSnapshot.restoreEligible === true ? 'Yes' : 'No'}`,
      '',
      'Execution Context Model:',
      `- Context Status: ${text(executionContext.contextStatus)}`,
      `- Read Only: ${executionContext.readOnly === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        executionContext.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      '',
      'Request Validation Shell:',
      `- Validation Status: ${text(requestValidation.validationStatus)}`,
      `- Valid For Execution: ${requestValidation.validForExecution === true ? 'Yes' : 'No'}`,
      `- ${text(requestValidation.message)}`,
      '',
      'Restore State Machine Shell:',
      `- State Machine Status: ${text(stateMachine.stateMachineStatus)}`,
      `- Current State: ${text(stateMachine.currentState)}`,
      `- Read Only: ${stateMachine.readOnly === true ? 'Yes' : 'No'}`,
      `- Internal Only: ${stateMachine.internalOnly === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        stateMachine.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(stateMachine.message)}`,
      '',
      'Allowed Restore Engine States:',
      ...allowedStates.map((state) => `- ${text(state)}`),
      '',
      'Blocked Destructive Transitions:',
      ...blockedTransitions.map(
        (transition) =>
          `- ${text(transition.fromState)} -> ${text(transition.toState)}: ${
            transition.transitionBlocked === true ? 'Blocked' : 'Allowed'
          } - ${text(transition.blockedReason)}`
      ),
      '',
      'State Transition Validation:',
      `- From: ${text(stateValidation.fromState)}`,
      `- To: ${text(stateValidation.toState)}`,
      `- Transition Allowed: ${stateValidation.transitionAllowed === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        stateValidation.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      '',
      'Restore Transaction Adapter Shell:',
      `- Adapter Status: ${text(transactionAdapter.adapterStatus)}`,
      `- Capability Status: ${text(transactionCapability.capabilityStatus)}`,
      `- Internal Only: ${transactionAdapter.internalOnly === true ? 'Yes' : 'No'}`,
      `- Read Only: ${transactionAdapter.readOnly === true ? 'Yes' : 'No'}`,
      `- Database Client Used: ${transactionAdapter.databaseClientUsed === true ? 'Yes' : 'No'}`,
      `- Transaction Client Used: ${
        transactionCapability.transactionClientUsed === true ? 'Yes' : 'No'
      }`,
      `- Restore Execution Available: ${
        transactionAdapter.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(transactionAdapter.message)}`,
      '',
      'Transaction Boundary Interface Shell:',
      `- Begin: ${text(beginOperation.operationStatus)} - ${text(beginOperation.blockedReason)}`,
      `- Commit: ${text(commitOperation.operationStatus)} - ${text(commitOperation.blockedReason)}`,
      `- Rollback: ${text(rollbackOperation.operationStatus)} - ${text(
        rollbackOperation.blockedReason
      )}`,
      '',
      'Transaction Capability Blockers:',
      ...transactionBlockers.map((reason) => `- ${text(reason)}`),
      '',
      'Lifecycle Checkpoints:',
      ...checkpoints.map(
        (item) => `- ${text(item.name)}: ${text(item.state)} - ${text(item.message)}`
      ),
    ];
    if (blockers.length) {
      lines.push(
        '',
        'Governance Blocking Reasons:',
        ...blockers.map((reason) => `- ${text(reason)}`)
      );
    }
    if (outstanding.length) {
      lines.push('', 'Outstanding Requirements:', ...outstanding.map((item) => `- ${text(item)}`));
    }
    panel.textContent = lines.join('\n');
  }

  function renderRestoreTransactionFoundationStatus(result = {}) {
    const panel = $id('restoreTransactionFoundationStatus');
    if (!panel) return;
    if (!result.transactionState) {
      panel.textContent =
        'Transaction Foundation Status: transaction_not_started. No Restore transaction executed. No data committed. Restore remains unavailable.';
      return;
    }
    const checkpoints = Array.isArray(result.checkpoints) ? result.checkpoints : [];
    const blockers = Array.isArray(result.blockingReasons) ? result.blockingReasons : [];
    const outstanding = Array.isArray(result.outstandingRequirements)
      ? result.outstandingRequirements
      : [];
    const boundary = result.transactionBoundaryMetadata || {};
    const entryBoundary = boundary.entryBoundary || {};
    const commitBoundary = boundary.commitBoundary || {};
    const failureBoundary = boundary.failureBoundary || {};
    const sequence = Array.isArray(result.checkpointSequence) ? result.checkpointSequence : [];
    const failureMap = result.failureStateMap || {};
    const rollbackPlan = result.rollbackPlanMetadata || {};
    const rollbackReadiness = result.rollbackReadinessMetadata || {};
    const recovery = result.recoveryMetadata || {};
    const recoveryCheckpoints = Array.isArray(recovery.recoveryCheckpointMetadata)
      ? recovery.recoveryCheckpointMetadata
      : [];
    const recoveryFailures = recovery.failureRecoveryClassification || {};
    const snapshot = result.transactionCertificationSnapshot || {};
    const governanceSummary = snapshot.governanceEvidenceSummary || {};
    const transactionSummary = snapshot.transactionReadinessSummary || {};
    const rollbackRecoverySummary = snapshot.rollbackRecoveryReadinessSummary || {};
    const snapshotBlockers = Array.isArray(snapshot.blockerSnapshot)
      ? snapshot.blockerSnapshot
      : [];
    const orchestration = result.orchestrationPlanningMetadata || {};
    const stageGraph = Array.isArray(orchestration.stageGraph) ? orchestration.stageGraph : [];
    const orderingPlan = Array.isArray(orchestration.executionOrderingPlan)
      ? orchestration.executionOrderingPlan
      : [];
    const decisionGraph = orchestration.governanceDecisionGraph || {};
    const dependencyValidation = orchestration.checkpointDependencyValidation || {};
    const gateMatrix = result.executionPreconditionGateMatrix || {};
    const gateSummary = gateMatrix.summary || {};
    const gateCategorySummary = gateSummary.byCategory || {};
    const gateMatrixGates = Array.isArray(gateMatrix.gates) ? gateMatrix.gates : [];
    const gateDependencyGraph = Array.isArray(gateMatrix.dependencyGraph)
      ? gateMatrix.dependencyGraph
      : [];
    const gateBlockers = Array.isArray(gateMatrix.blockerExplanations)
      ? gateMatrix.blockerExplanations
      : [];
    const gateEvidence = gateMatrix.governanceEvidenceAggregation || {};
    const blockerPlan = result.executionBlockerResolutionPlan || {};
    const blockerSummary = blockerPlan.unresolvedBlockerSummary || {};
    const severitySummary = blockerSummary.bySeverity || {};
    const ownerSummary = blockerSummary.byOwnerCategory || {};
    const blockerCategorySummary = blockerSummary.byGateCategory || {};
    const resolutionItems = Array.isArray(blockerPlan.resolutionItems)
      ? blockerPlan.resolutionItems
      : [];
    const prerequisiteSequencing = Array.isArray(blockerPlan.prerequisiteSequencing)
      ? blockerPlan.prerequisiteSequencing
      : [];
    const activationRoadmap = Array.isArray(blockerPlan.executionActivationRoadmap)
      ? blockerPlan.executionActivationRoadmap
      : [];
    const riskRegister = result.executionActivationRiskRegister || {};
    const riskSummary = riskRegister.riskSummary || {};
    const riskSeveritySummary = riskSummary.bySeverity || {};
    const riskLikelihoodSummary = riskSummary.byLikelihood || {};
    const residualRiskSummary = riskSummary.byResidualRisk || {};
    const riskCategorySummary = riskSummary.byCategory || {};
    const riskItems = Array.isArray(riskRegister.risks) ? riskRegister.risks : [];
    const riskBlockerLinkage = Array.isArray(riskRegister.blockerLinkage)
      ? riskRegister.blockerLinkage
      : [];
    const mitigationSummary = riskRegister.mitigationSummary || {};
    const certification = result.executionReadinessCertificationAssessment || {};
    const certificationCriteria = Array.isArray(certification.certificationCriteria)
      ? certification.certificationCriteria
      : [];
    const certificationSummary = certification.certificationSummary || {};
    const certificationGateAggregation = certification.gateAggregation || {};
    const certificationBlockerAggregation = certification.blockerAggregation || {};
    const certificationRiskAggregation = certification.riskAggregation || {};
    const certificationRiskSeverity = certificationRiskAggregation.bySeverity || {};
    const certificationDecision = certification.certificationDecisionMetadata || {};
    const lines = [
      result.message ||
        'Restore transaction foundation assessment completed. Restore remains unavailable.',
      `Transaction Foundation Status: ${text(result.transactionState)}`,
      `Transaction Precheck Result: ${text(result.transactionPrecheckResult)}`,
      `Transaction Boundary Status: ${text(boundary.transactionBoundaryStatus)}`,
      `Foundation State: ${text(result.foundationState)}`,
      `Audit Correlation ID: ${text(result.auditCorrelationId)}`,
      `Foundation Audit Correlation ID: ${text(result.foundationAuditCorrelationId)}`,
      `Governance Decision: ${text(result.governanceDecision)}`,
      `Activation Readiness: ${text(result.activationReadiness)}`,
      `Audit Logged: ${result.auditLogged ? 'Yes' : 'No'}`,
      `No Restore Transaction Executed: ${result.noRestoreTransactionExecuted ? 'Yes' : 'No'}`,
      `No Data Committed: ${result.noDataCommitted ? 'Yes' : 'No'}`,
      `No Restore Executed: ${result.noRestoreExecuted ? 'Yes' : 'No'}`,
      `Restore Unavailable: ${result.restoreUnavailable ? 'Yes' : 'No'}`,
      `Restore Eligible: ${result.restoreEligible === true ? 'Yes' : 'No'}`,
      '',
      'Transaction Lifecycle Checkpoints:',
      ...checkpoints.map(
        (item) => `- ${text(item.name)}: ${text(item.state)} - ${text(item.message)}`
      ),
      '',
      'Boundary Metadata:',
      `- Entry Boundary: ${text(entryBoundary.state)} - ${text(entryBoundary.message)}`,
      `- Commit Boundary: ${text(commitBoundary.state)} - ${text(commitBoundary.message)}`,
      `- Failure Boundary: ${text(failureBoundary.state)} - ${text(failureBoundary.message)}`,
      '',
      'Checkpoint Sequence:',
      ...sequence.map(
        (item) => `- ${text(item.name)}: ${text(item.state)} - ${text(item.message)}`
      ),
      '',
      'Failure-State Mapping:',
      `- Pre-Transaction: ${text(failureMap.preTransaction?.state)} - ${text(
        failureMap.preTransaction?.response
      )}`,
      `- Transaction Start: ${text(failureMap.transactionStart?.state)} - ${text(
        failureMap.transactionStart?.response
      )}`,
      `- Mid-Transaction: ${text(failureMap.midTransaction?.state)} - ${text(
        failureMap.midTransaction?.response
      )}`,
      `- Post-Transaction: ${text(failureMap.postTransaction?.state)} - ${text(
        failureMap.postTransaction?.response
      )}`,
      '',
      'Rollback Plan Metadata:',
      `- Status: ${text(rollbackPlan.rollbackPlanStatus)}`,
      `- Execution Available: ${rollbackPlan.rollbackExecutionAvailable === true ? 'Yes' : 'No'}`,
      `- Required: ${rollbackPlan.rollbackRequired === true ? 'Yes' : 'No'}`,
      `- Blocked: ${rollbackPlan.rollbackBlocked === true ? 'Yes' : 'No'}`,
      `- Boundary: ${text(rollbackPlan.rollbackBoundary)}`,
      `- ${text(rollbackPlan.message)}`,
      '',
      'Rollback Readiness Metadata:',
      `- Status: ${text(rollbackReadiness.rollbackReadinessStatus)}`,
      `- Eligibility Assessment: ${text(rollbackReadiness.rollbackEligibilityAssessment)}`,
      `- Execution Available: ${
        rollbackReadiness.rollbackExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- Authority Required: ${rollbackReadiness.rollbackAuthorityRequired === true ? 'Yes' : 'No'}`,
      `- Evidence Required: ${rollbackReadiness.rollbackEvidenceRequired === true ? 'Yes' : 'No'}`,
      `- Safety Decision: ${text(rollbackReadiness.rollbackSafetyDecision)}`,
      `- ${text(rollbackReadiness.message)}`,
      '',
      'Recovery Metadata:',
      `- Status: ${text(recovery.recoveryMetadataStatus)}`,
      `- Runtime Recovery Available: ${recovery.runtimeRecoveryAvailable === true ? 'Yes' : 'No'}`,
      `- Runtime Recovery Executed: ${recovery.runtimeRecoveryExecuted === true ? 'Yes' : 'No'}`,
      `- Recovery Completion Available: ${
        recovery.recoveryCompletionAvailable === true ? 'Yes' : 'No'
      }`,
      `- State Reconciliation Available: ${
        recovery.recoveryStateReconciliationAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(recovery.message)}`,
      '',
      'Recovery Checkpoint Metadata:',
      ...recoveryCheckpoints.map(
        (item) => `- ${text(item.name)}: ${text(item.state)} - ${text(item.message)}`
      ),
      '',
      'Failure Recovery Classification:',
      `- Governance Failure: ${text(recoveryFailures.governanceFailure?.state)} - ${text(
        recoveryFailures.governanceFailure?.recoveryResponse
      )}`,
      `- Transaction Failure: ${text(recoveryFailures.transactionFailure?.state)} - ${text(
        recoveryFailures.transactionFailure?.recoveryResponse
      )}`,
      `- Rollback Failure: ${text(recoveryFailures.rollbackFailure?.state)} - ${text(
        recoveryFailures.rollbackFailure?.recoveryResponse
      )}`,
      `- Runtime Recovery Failure: ${text(recoveryFailures.runtimeRecoveryFailure?.state)} - ${text(
        recoveryFailures.runtimeRecoveryFailure?.recoveryResponse
      )}`,
      '',
      'Transaction Certification Snapshot:',
      `- Snapshot Status: ${text(snapshot.snapshotStatus)}`,
      `- Read Only: ${snapshot.readOnly === true ? 'Yes' : 'No'}`,
      `- Assessment Only: ${snapshot.assessmentOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Transaction Executed: ${
        snapshot.noRestoreTransactionExecuted === true ? 'Yes' : 'No'
      }`,
      `- No Data Committed: ${snapshot.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Unavailable: ${snapshot.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${snapshot.restoreEligible === true ? 'Yes' : 'No'}`,
      `- Certification Statement: ${text(snapshot.certificationStatement)}`,
      '',
      'Snapshot Governance Evidence Summary:',
      `- Foundation State: ${text(governanceSummary.foundationState)}`,
      `- Governance Decision: ${text(governanceSummary.governanceDecision)}`,
      `- Activation Readiness: ${text(governanceSummary.activationReadiness)}`,
      `- Blockers Propagated: ${text(governanceSummary.blockersPropagated)}`,
      `- Outstanding Requirements: ${text(governanceSummary.outstandingRequirements)}`,
      '',
      'Snapshot Transaction Readiness Summary:',
      `- Transaction State: ${text(transactionSummary.transactionState)}`,
      `- Transaction Precheck: ${text(transactionSummary.transactionPrecheckResult)}`,
      `- Boundary Status: ${text(transactionSummary.transactionBoundaryStatus)}`,
      `- Checkpoint Count: ${text(transactionSummary.checkpointCount)}`,
      `- Failure Map Categories: ${text(transactionSummary.failureMapCategories)}`,
      `- Commit Boundary State: ${text(transactionSummary.commitBoundaryState)}`,
      '',
      'Snapshot Rollback / Recovery Summary:',
      `- Rollback Plan Status: ${text(rollbackRecoverySummary.rollbackPlanStatus)}`,
      `- Rollback Readiness: ${text(rollbackRecoverySummary.rollbackReadinessStatus)}`,
      `- Rollback Eligibility: ${text(rollbackRecoverySummary.rollbackEligibilityAssessment)}`,
      `- Rollback Execution Available: ${
        rollbackRecoverySummary.rollbackExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- Recovery Metadata Status: ${text(rollbackRecoverySummary.recoveryMetadataStatus)}`,
      `- Runtime Recovery Available: ${
        rollbackRecoverySummary.runtimeRecoveryAvailable === true ? 'Yes' : 'No'
      }`,
      `- Runtime Recovery Executed: ${
        rollbackRecoverySummary.runtimeRecoveryExecuted === true ? 'Yes' : 'No'
      }`,
      '',
      'Transaction Orchestration Planning:',
      `- Plan Status: ${text(orchestration.orchestrationPlanStatus)}`,
      `- Read Only: ${orchestration.readOnly === true ? 'Yes' : 'No'}`,
      `- Metadata Only: ${orchestration.metadataOnly === true ? 'Yes' : 'No'}`,
      `- Scheduler Available: ${orchestration.schedulerAvailable === true ? 'Yes' : 'No'}`,
      `- Job Execution Available: ${orchestration.jobExecutionAvailable === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        orchestration.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(orchestration.message)}`,
      '',
      'Transaction Stage Graph:',
      ...stageGraph.map(
        (stage) =>
          `- ${text(stage.name)}: ${text(stage.state)} - Depends on: ${text(
            Array.isArray(stage.dependsOn) && stage.dependsOn.length
              ? stage.dependsOn.join(', ')
              : 'none'
          )} - Execution: ${stage.executionAllowed === true ? 'Yes' : 'No'}`
      ),
      '',
      'Execution Ordering Plan:',
      ...orderingPlan.map(
        (item) =>
          `- ${text(item.order)}. ${text(item.stage)} - Execution: ${
            item.executionAllowed === true ? 'Yes' : 'No'
          } - ${text(item.message)}`
      ),
      '',
      'Governance Decision Graph:',
      `- Transaction State: ${text(decisionGraph.transactionState)}`,
      `- Boundary Status: ${text(decisionGraph.transactionBoundaryStatus)}`,
      `- Rollback Readiness: ${text(decisionGraph.rollbackReadinessStatus)}`,
      `- Recovery Metadata: ${text(decisionGraph.recoveryMetadataStatus)}`,
      `- Snapshot Status: ${text(decisionGraph.snapshotStatus)}`,
      `- Restore Unavailable: ${decisionGraph.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${decisionGraph.restoreEligible === true ? 'Yes' : 'No'}`,
      '',
      'Checkpoint Dependency Validation:',
      `- Checkpoint Count: ${text(dependencyValidation.checkpointCount)}`,
      `- Dependency Status: ${text(dependencyValidation.dependencyStatus)}`,
      '',
      'Execution Preconditions Gate Matrix:',
      `- Matrix Status: ${text(gateMatrix.matrixStatus)}`,
      `- Read Only: ${gateMatrix.readOnly === true ? 'Yes' : 'No'}`,
      `- Assessment Only: ${gateMatrix.assessmentOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Executed: ${gateMatrix.noRestoreExecuted === true ? 'Yes' : 'No'}`,
      `- No Data Committed: ${gateMatrix.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Unavailable: ${gateMatrix.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${gateMatrix.restoreEligible === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        gateMatrix.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(gateMatrix.message)}`,
      '',
      'Gate Summary:',
      `- Total: ${text(gateSummary.total)}`,
      `- Satisfied: ${text(gateSummary.satisfied)}`,
      `- Blocked: ${text(gateSummary.blocked)}`,
      `- Not Implemented: ${text(gateSummary.notImplemented)}`,
      ...Object.keys(gateCategorySummary).map((category) => {
        const item = gateCategorySummary[category] || {};
        return `- ${text(category)}: ${text(item.satisfied)} satisfied, ${text(
          item.blocked
        )} blocked, ${text(item.notImplemented)} not implemented`;
      }),
      '',
      'Gate Results:',
      ...gateMatrixGates.map((gate) => {
        const blockersText =
          Array.isArray(gate.blockers) && gate.blockers.length
            ? ` - Blockers: ${gate.blockers.map(text).join('; ')}`
            : '';
        const evidenceText =
          Array.isArray(gate.evidence) && gate.evidence.length
            ? ` - Evidence: ${gate.evidence.map(text).join('; ')}`
            : '';
        return `- [${text(gate.category)}] ${text(gate.id)} ${text(gate.title)}: ${text(
          gate.status
        )}${evidenceText}${blockersText}`;
      }),
      '',
      'Gate Dependency Graph:',
      ...gateDependencyGraph.map(
        (gate) =>
          `- ${text(gate.gateId)} (${text(gate.category)}) depends on: ${text(
            Array.isArray(gate.dependsOn) && gate.dependsOn.length
              ? gate.dependsOn.join(', ')
              : 'none'
          )} - ${text(gate.status)}`
      ),
      '',
      'Gate Governance Evidence Aggregation:',
      `- Foundation State: ${text(gateEvidence.foundationState)}`,
      `- Transaction State: ${text(gateEvidence.transactionState)}`,
      `- Transaction Precheck: ${text(gateEvidence.transactionPrecheckResult)}`,
      `- Governance Decision: ${text(gateEvidence.governanceDecision)}`,
      `- Activation Readiness: ${text(gateEvidence.activationReadiness)}`,
      `- Snapshot Status: ${text(gateEvidence.snapshotStatus)}`,
      `- Orchestration Plan Status: ${text(gateEvidence.orchestrationPlanStatus)}`,
      `- Rollback Readiness Status: ${text(gateEvidence.rollbackReadinessStatus)}`,
      `- Recovery Metadata Status: ${text(gateEvidence.recoveryMetadataStatus)}`,
      '',
      'Execution Blocker Resolution Plan:',
      `- Plan Status: ${text(blockerPlan.planStatus)}`,
      `- Read Only: ${blockerPlan.readOnly === true ? 'Yes' : 'No'}`,
      `- Planning Only: ${blockerPlan.planningOnly === true ? 'Yes' : 'No'}`,
      `- Audit Evidence Only: ${blockerPlan.auditEvidenceOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Executed: ${blockerPlan.noRestoreExecuted === true ? 'Yes' : 'No'}`,
      `- No Data Committed: ${blockerPlan.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Unavailable: ${blockerPlan.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${blockerPlan.restoreEligible === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        blockerPlan.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(blockerPlan.message)}`,
      '',
      'Unresolved Blocker Summary:',
      `- Total: ${text(blockerSummary.total)}`,
      `- Critical: ${text(severitySummary.critical)}`,
      `- High: ${text(severitySummary.high)}`,
      `- Medium: ${text(severitySummary.medium)}`,
      `- Low: ${text(severitySummary.low)}`,
      ...Object.keys(ownerSummary).map(
        (owner) => `- Owner ${text(owner)}: ${text(ownerSummary[owner])}`
      ),
      ...Object.keys(blockerCategorySummary).map(
        (category) => `- Category ${text(category)}: ${text(blockerCategorySummary[category])}`
      ),
      '',
      'Blocker Resolution Items:',
      ...resolutionItems.map((item) => {
        const blockersText =
          Array.isArray(item.blockerReasons) && item.blockerReasons.length
            ? ` - Reasons: ${item.blockerReasons.map(text).join('; ')}`
            : '';
        return `- ${text(item.sequence)}. ${text(item.gateId)} ${text(
          item.gateTitle
        )}: ${text(item.currentStatus)} / ${text(item.severity)} / ${text(
          item.ownerCategory
        )}${blockersText} - ${text(item.requiredOutcome)}`;
      }),
      '',
      'Prerequisite Sequencing:',
      ...prerequisiteSequencing.map(
        (item) =>
          `- ${text(item.sequence)}. ${text(item.gateId)} depends on ${text(
            Array.isArray(item.dependsOn) && item.dependsOn.length
              ? item.dependsOn.join(', ')
              : 'none'
          )} - ${text(item.currentStatus)} - ${text(item.requiredOutcome)}`
      ),
      '',
      'Execution Activation Roadmap Metadata:',
      ...activationRoadmap.map(
        (stage) =>
          `- ${text(stage.stage)}: ${text(stage.status)} - Restore Execution: ${
            stage.restoreExecutionAvailable === true ? 'Yes' : 'No'
          } - ${text(stage.message)}`
      ),
      '',
      'Execution Activation Risk Register:',
      `- Register Status: ${text(riskRegister.registerStatus)}`,
      `- Read Only: ${riskRegister.readOnly === true ? 'Yes' : 'No'}`,
      `- Planning Only: ${riskRegister.planningOnly === true ? 'Yes' : 'No'}`,
      `- Audit Evidence Only: ${riskRegister.auditEvidenceOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Executed: ${riskRegister.noRestoreExecuted === true ? 'Yes' : 'No'}`,
      `- No Data Committed: ${riskRegister.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Unavailable: ${riskRegister.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${riskRegister.restoreEligible === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        riskRegister.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(riskRegister.message)}`,
      '',
      'Risk Summary:',
      `- Total: ${text(riskSummary.total)}`,
      `- Critical: ${text(riskSeveritySummary.critical)}`,
      `- High: ${text(riskSeveritySummary.high)}`,
      `- Medium: ${text(riskSeveritySummary.medium)}`,
      `- Low: ${text(riskSeveritySummary.low)}`,
      ...Object.keys(riskLikelihoodSummary).map(
        (likelihood) =>
          `- Likelihood ${text(likelihood)}: ${text(riskLikelihoodSummary[likelihood])}`
      ),
      ...Object.keys(residualRiskSummary).map(
        (risk) => `- Residual ${text(risk)}: ${text(residualRiskSummary[risk])}`
      ),
      ...Object.keys(riskCategorySummary).map(
        (category) => `- Risk Category ${text(category)}: ${text(riskCategorySummary[category])}`
      ),
      '',
      'Risk Items:',
      ...riskItems.map((risk) => {
        const mitigationText =
          Array.isArray(risk.mitigationMetadata) && risk.mitigationMetadata.length
            ? ` - Mitigation: ${risk.mitigationMetadata.map(text).join('; ')}`
            : '';
        return `- ${text(risk.riskId)} ${text(risk.title)}: ${text(risk.severity)} / ${text(
          risk.likelihood
        )} / ${text(risk.impact)} - Residual: ${text(risk.residualRisk)} - Owner: ${text(
          risk.ownerCategory
        )} - Linked Gate: ${text(risk.linkedGateId)}${mitigationText}`;
      }),
      '',
      'Risk Blocker Linkage:',
      ...riskBlockerLinkage.map(
        (risk) =>
          `- ${text(risk.riskId)} -> ${text(risk.linkedGateId)} (${text(
            risk.linkedGateCategory
          )}) ${text(risk.linkedBlockerStatus)} - Residual: ${text(risk.residualRisk)}`
      ),
      '',
      'Risk Mitigation Summary:',
      `- Unresolved Mitigations: ${text(mitigationSummary.unresolvedMitigations)}`,
      `- Required Governance State: ${text(mitigationSummary.requiredGovernanceState)}`,
      '',
      'Execution Readiness Certification Assessment:',
      `- Assessment Status: ${text(certification.assessmentStatus)}`,
      `- Certification Outcome: ${text(certification.certificationOutcome)}`,
      `- Read Only: ${certification.readOnly === true ? 'Yes' : 'No'}`,
      `- Assessment Only: ${certification.assessmentOnly === true ? 'Yes' : 'No'}`,
      `- Audit Evidence Only: ${certification.auditEvidenceOnly === true ? 'Yes' : 'No'}`,
      `- No Restore Executed: ${certification.noRestoreExecuted === true ? 'Yes' : 'No'}`,
      `- No Data Committed: ${certification.noDataCommitted === true ? 'Yes' : 'No'}`,
      `- Restore Unavailable: ${certification.restoreUnavailable === true ? 'Yes' : 'No'}`,
      `- Restore Eligible: ${certification.restoreEligible === true ? 'Yes' : 'No'}`,
      `- Restore Execution Available: ${
        certification.restoreExecutionAvailable === true ? 'Yes' : 'No'
      }`,
      `- ${text(certification.message)}`,
      '',
      'Certification Summary:',
      `- Total Criteria: ${text(certificationSummary.totalCriteria)}`,
      `- Passed Criteria: ${text(certificationSummary.passedCriteria)}`,
      `- Failed Criteria: ${text(certificationSummary.failedCriteria)}`,
      `- Blocked Gates: ${text(certificationSummary.blockedGateCount)}`,
      `- Not Implemented Gates: ${text(certificationSummary.notImplementedGateCount)}`,
      `- Unresolved Blockers: ${text(certificationSummary.unresolvedBlockerCount)}`,
      `- Risks: ${text(certificationSummary.riskCount)}`,
      `- Critical Risks: ${text(certificationSummary.criticalRiskCount)}`,
      `- High Risks: ${text(certificationSummary.highRiskCount)}`,
      '',
      'Certification Criteria Evaluation:',
      ...certificationCriteria.map(
        (item) =>
          `- ${text(item.id)} [${text(item.category)}] ${text(item.title)}: ${text(
            item.status
          )} - ${text(item.evidence)}`
      ),
      '',
      'Certification Gate Aggregation:',
      `- Matrix Status: ${text(certificationGateAggregation.matrixStatus)}`,
      `- Total: ${text(certificationGateAggregation.total)}`,
      `- Satisfied: ${text(certificationGateAggregation.satisfied)}`,
      `- Blocked: ${text(certificationGateAggregation.blocked)}`,
      `- Not Implemented: ${text(certificationGateAggregation.notImplemented)}`,
      '',
      'Certification Blocker Aggregation:',
      `- Total: ${text(certificationBlockerAggregation.total)}`,
      ...Object.keys(certificationBlockerAggregation.bySeverity || {}).map(
        (severity) =>
          `- Severity ${text(severity)}: ${text(
            certificationBlockerAggregation.bySeverity[severity]
          )}`
      ),
      '',
      'Certification Risk Aggregation:',
      `- Total: ${text(certificationRiskAggregation.total)}`,
      `- Critical: ${text(certificationRiskSeverity.critical)}`,
      `- High: ${text(certificationRiskSeverity.high)}`,
      `- Medium: ${text(certificationRiskSeverity.medium)}`,
      `- Low: ${text(certificationRiskSeverity.low)}`,
      '',
      'Certification Decision Metadata:',
      `- Rule: ${text(certificationDecision.rule)}`,
      `- Conditional Rule: ${text(certificationDecision.conditionallyCertifiedRule)}`,
      `- Restore Activation Approved: ${
        certificationDecision.restoreActivationApproved === true ? 'Yes' : 'No'
      }`,
    ];
    if (gateBlockers.length) {
      lines.push(
        '',
        'Gate Blocker Explanations:',
        ...gateBlockers.map(
          (item) =>
            `- ${text(item.gateId)} (${text(item.category)}): ${text(
              Array.isArray(item.blockers) && item.blockers.length
                ? item.blockers.join('; ')
                : 'No blockers'
            )}`
        )
      );
    }
    if (snapshotBlockers.length) {
      lines.push(
        '',
        'Snapshot Blocker Propagation:',
        ...snapshotBlockers.map((reason) => `- ${text(reason)}`)
      );
    }
    if (blockers.length) {
      lines.push(
        '',
        'Transaction Blocking Reasons:',
        ...blockers.map((reason) => `- ${text(reason)}`)
      );
    }
    if (outstanding.length) {
      lines.push('', 'Outstanding Requirements:', ...outstanding.map((item) => `- ${text(item)}`));
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
    const preflightBtn = $id('assessBackupPreflightButton');
    if (preflightBtn) preflightBtn.disabled = Boolean(isBusy);
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
        renderBackupVerificationSummary({});
        showMessage(result?.message || 'Certified backup failed.', 'error');
        return;
      }
      showMessage(
        result.message || 'Certified backup created and verified successfully.',
        'success'
      );
      renderBackupVerificationSummary(result);
      await handleRefreshBackups(1);
    } catch {
      renderBackupVerificationSummary({});
      showMessage('Certified backup failed. Review audit logs before retrying.', 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRefreshBackups(page = backupHistoryState.page) {
    setBackupHistoryBusy(true);
    try {
      const backups = await A().listBackups(collectBackupHistoryFilters(page));
      if (backups?.ok) {
        renderBackups(backups);
        showMessage('Backup history refreshed.', 'success');
        return;
      }
      const errMsg = backups?.message || 'Unable to refresh backup history.';
      renderBackupHistoryErrorRow(errMsg);
      showMessage(errMsg, 'error');
    } catch {
      renderBackupHistoryErrorRow('Unable to load backup history.');
      showMessage('Unable to refresh backup history.', 'error');
    } finally {
      setBackupHistoryBusy(false);
    }
  }

  function scheduleBackupHistorySearch() {
    clearTimeout(backupSearchTimer);
    backupSearchTimer = setTimeout(() => {
      handleRefreshBackups(1).catch(() => {});
    }, 250);
  }

  function syncBackupHistoryDateControls() {
    const isCustom = ($id('backupHistoryDatePreset')?.value || 'all') === 'custom';
    const from = $id('backupHistoryDateFrom');
    const to = $id('backupHistoryDateTo');
    if (from) from.disabled = !isCustom;
    if (to) to.disabled = !isCustom;
  }

  function handleBackupHistoryDatePresetChange() {
    syncBackupHistoryDateControls();
    handleRefreshBackups(1).catch(() => {});
  }

  function handlePreviousBackupHistoryPage() {
    const previousPage = Math.max(1, backupHistoryState.page - 1);
    handleRefreshBackups(previousPage).catch(() => {});
  }

  function handleNextBackupHistoryPage() {
    const totalPages = Math.max(
      1,
      Math.ceil(backupHistoryState.total / backupHistoryState.pageSize)
    );
    const nextPage = Math.min(totalPages, backupHistoryState.page + 1);
    handleRefreshBackups(nextPage).catch(() => {});
  }

  async function handleBackupPreflight() {
    const btn = $id('assessBackupPreflightButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Assessing...';
    }
    try {
      const result = await A().assessBackupPreflight();
      renderBackupPreflightAssessment(result || {});
      showMessage(
        result?.message || 'Backup preflight assessment completed.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Backup preflight assessment failed.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assess Backup Preflight';
      }
    }
  }

  function handleClearBackupHistorySearch() {
    backupHistoryState.search = '';
    const input = $id('backupHistorySearch');
    if (input) input.value = '';
    backupHistoryState.selectedId = null;
    handleRefreshBackups(1).catch(() => {});
  }

  function handleViewBackupHistory(event) {
    const target = event.target.closest('[data-backup-history-id]');
    if (!target || !$id('settingsModule')?.contains(target)) return;
    backupHistoryState.selectedId = target.dataset.backupHistoryId || null;
    const backup = backupHistoryState.rows.find(
      (item) => backupHistoryId(item) === backupHistoryState.selectedId
    );
    renderBackupHistoryDetail(backup || null);
    renderBackupHistorySummary();
  }

  async function handleInspectRestorePackage() {
    const btn = $id('inspectRestorePackageButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Inspecting...';
    }
    try {
      const result = await A().inspectRestorePackage();
      renderPackageInspection(result || {});
      showMessage(
        result?.message || 'Package inspection completed.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Package inspection failed. Restore remains unavailable.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Inspect Restore Package';
      }
    }
  }

  async function handleVerifyRestorePackage() {
    const btn = $id('verifyRestorePackageButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying...';
    }
    try {
      const result = await A().verifyRestorePackage();
      renderPackageVerification(result || {});
      showMessage(
        result?.message || 'Package verification completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Package verification failed. Restore remains unavailable.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Verify Restore Package';
      }
    }
  }

  async function handleAssessRestoreEligibility() {
    const btn = $id('assessRestoreEligibilityButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Assessing Eligibility...';
    }
    try {
      const result = await A().assessRestoreEligibility();
      renderEligibilityAssessment(result || {});
      showMessage(
        result?.message || 'Eligibility assessment completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Eligibility assessment failed. Restore remains unavailable.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assess Restore Eligibility';
      }
    }
  }

  async function handleAssessRestoreAuthorization() {
    const btn = $id('assessRestoreAuthorizationButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Assessing Authorization...';
    }
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
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assess Restore Authorization';
      }
    }
  }

  async function handleDryRunCertificationReport() {
    const btn = $id('dryRunCertificationReportButton');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating Report...';
    }
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
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate Dry-Run Certification Report';
      }
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

  async function handleRefreshRestoreGovernanceAssessment() {
    try {
      const result = await A().restoreGovernanceAssessment();
      if (result?.ok) {
        renderRestoreGovernanceAssessment(result);
        showMessage(
          'Restore governance assessment refreshed. Activation remains blocked.',
          'success'
        );
        return;
      }
      showMessage(result?.message || 'Unable to refresh Restore governance assessment.', 'error');
    } catch {
      showMessage('Unable to refresh Restore governance assessment.', 'error');
    }
  }

  async function handleRefreshRestoreExecutionPolicy() {
    try {
      const result = await A().restoreExecutionPolicy();
      if (result?.ok) {
        renderRestoreExecutionPolicy(result);
        showMessage(
          'Restore execution policy refreshed. Execution remains unavailable.',
          'success'
        );
        return;
      }
      showMessage(result?.message || 'Unable to refresh Restore execution policy.', 'error');
    } catch {
      showMessage('Unable to refresh Restore execution policy.', 'error');
    }
  }

  async function handlePrepareRestoreSafetyBackup() {
    if (restorePreparationBusy) return;
    restorePreparationBusy = true;
    syncRestorePreparationControls();
    try {
      const result = await A().prepareRestoreSafetyBackup();
      renderRestoreResult({
        ok: result?.ok === true,
        restoreExecuted: false,
        rolledBack: false,
        message:
          result?.message ||
          'Restore safety preparation completed. Restore execution remains unavailable.',
      });
      if (result?.recoveryState)
        renderRestoreExecutionPolicy({ policy: { recoveryState: result.recoveryState } });
      const policy = await A()
        .restoreExecutionPolicy()
        .catch(() => null);
      if (policy?.ok) renderRestoreExecutionPolicy(policy);
      if (result?.ok) {
        showMessage(
          'Pre-Restore safety backup verified. Restore execution remains unavailable.',
          'success'
        );
        handleRefreshBackups(1).catch(() => {});
        return;
      }
      showMessage(result?.message || 'Restore safety preparation did not complete.', 'error');
    } catch {
      showMessage(
        'Restore safety preparation failed. Restore execution remains unavailable.',
        'error'
      );
    } finally {
      restorePreparationBusy = false;
      syncRestorePreparationControls();
    }
  }

  async function handleCancelRestorePreparation() {
    if (restorePreparationBusy) return;
    const operationId = lastRestorePolicy?.recoveryState?.operationId || null;
    restorePreparationBusy = true;
    syncRestorePreparationControls();
    try {
      const result = await A().cancelRestorePreparation(operationId);
      if (result?.recoveryState)
        renderRestoreExecutionPolicy({ policy: { recoveryState: result.recoveryState } });
      const policy = await A()
        .restoreExecutionPolicy()
        .catch(() => null);
      if (policy?.ok) renderRestoreExecutionPolicy(policy);
      showMessage(
        result?.message ||
          'Restore safety preparation cancellation completed. Restore execution remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Unable to cancel Restore safety preparation.', 'error');
    } finally {
      restorePreparationBusy = false;
      syncRestorePreparationControls();
    }
  }

  async function handleRecordRestoreFinalConfirmation() {
    if (restorePreparationBusy) return;
    const phrase = $id('restoreFinalConfirmationPhrase')?.value || '';
    const operationId = lastRestorePolicy?.recoveryState?.operationId || null;
    restorePreparationBusy = true;
    syncRestoreFinalConfirmationControls();
    try {
      const result = await A().restoreFinalConfirmation({
        operationId,
        typedPhrase: phrase,
        preflightDigest: lastRestorePolicy?.recoveryState?.sourcePackageChecksum || null,
        executionPolicyDigest:
          lastRestorePolicy?.productionGovernance?.finalCertificationAssessment?.blockers?.join(
            '|'
          ) || null,
      });
      renderRestoreFinalConfirmation(result || {});
      const policy = await A()
        .restoreExecutionPolicy()
        .catch(() => null);
      if (policy?.ok) renderRestoreExecutionPolicy(policy);
      showMessage(
        result?.message ||
          'Restore final confirmation assessment completed. Production execution remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Unable to record Restore final confirmation evidence.', 'error');
    } finally {
      restorePreparationBusy = false;
      syncRestoreFinalConfirmationControls();
    }
  }

  async function handleRefreshRestoreStartupRecovery() {
    try {
      const result = await A().restoreStartupRecovery();
      renderRestoreStartupRecovery(result || {});
      showMessage(
        result?.message || 'Restore startup recovery status refreshed.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Unable to refresh Restore startup recovery status.', 'error');
    }
  }

  async function handleRefreshRestoreRetentionAssessment() {
    try {
      const result = await A().restoreRetentionAssessment();
      renderRestoreRetentionAssessment(result || {});
      showMessage(
        result?.message || 'Restore retention status refreshed.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage('Unable to refresh Restore retention status.', 'error');
    }
  }

  async function handleRestoreEngineFoundationAssessment() {
    try {
      const result = await A().restoreEngineFoundationAssessment();
      renderRestoreEngineFoundationStatus(result || {});
      showMessage(
        result?.message ||
          'Controlled Restore Engine foundation assessment completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage(
        'Controlled Restore Engine foundation assessment failed. Restore remains unavailable.',
        'error'
      );
    }
  }

  async function handleRestoreTransactionFoundationAssessment() {
    try {
      const result = await A().restoreTransactionFoundationAssessment();
      renderRestoreTransactionFoundationStatus(result || {});
      showMessage(
        result?.message ||
          'Restore transaction foundation assessment completed. Restore remains unavailable.',
        result?.ok ? 'success' : 'error'
      );
    } catch {
      showMessage(
        'Restore transaction foundation assessment failed. No data was committed and Restore remains unavailable.',
        'error'
      );
    }
  }

  // ── R2-F: Restore result display ──────────────────────────────────────────
  function renderRestoreResult(result = {}) {
    const panel = $id('restoreResult');
    if (!panel) return;
    if (!result || Object.keys(result).length === 0) {
      panel.textContent =
        'Restore has not been executed. Acknowledgement and governance readiness are required before Restore can be enabled.';
      return;
    }
    const lines = [
      result.message || (result.ok ? 'Restore completed.' : 'Restore did not complete.'),
      `Restore Executed: ${result.restoreExecuted ? 'Yes' : 'No'}`,
      `Rolled Back: ${result.rolledBack ? 'Yes' : 'No'}`,
    ];
    if (result.tablesRestored !== null && result.tablesRestored !== undefined) {
      lines.push(`Tables Restored: ${result.tablesRestored}`);
    }
    if (result.rowsRestored !== null && result.rowsRestored !== undefined) {
      lines.push(`Rows Restored: ${result.rowsRestored}`);
    }
    if (result.backupId) lines.push(`Backup ID: ${result.backupId}`);
    if (result.auditCorrelationId) lines.push(`Audit Correlation ID: ${result.auditCorrelationId}`);
    if (result.reason) lines.push(`Abort Reason: ${result.reason}`);
    panel.textContent = lines.join('\n');
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
        A().listBackups(collectBackupHistoryFilters(1)),
      ]);

      if (settings?.ok) renderSettings(settings.settings || {});
      await loadStoreLogoPreview();
      if (appInfo?.ok) renderAppInfo(appInfo);
      if (backups?.ok) renderBackups(backups);
      else renderBackupHistoryErrorRow(backups?.message || 'Unable to load backup history.');
      A()
        .restoreReadinessDashboard()
        .then((dashboard) => {
          if (dashboard?.ok) renderRestoreReadinessDashboard(dashboard);
        })
        .catch(() => {});
      A()
        .restoreGovernanceAssessment()
        .then((assessment) => {
          if (assessment?.ok) renderRestoreGovernanceAssessment(assessment);
        })
        .catch(() => {});
      A()
        .restoreExecutionPolicy()
        .then((policy) => {
          if (policy?.ok) renderRestoreExecutionPolicy(policy);
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
      addListener($id('saveStoreSettingsButton'), 'click', handleSaveStoreSettings);
      addListener($id('chooseStoreLogoButton'), 'click', handleChooseStoreLogo);
      addListener($id('removeStoreLogoButton'), 'click', handleRemoveStoreLogo);
      addListener($id('assessBackupPreflightButton'), 'click', handleBackupPreflight);
      addListener($id('createBackupButton'), 'click', handleCreateBackup);
      addListener($id('refreshBackupHistoryButton'), 'click', handleRefreshBackups);
      addListener($id('backupHistorySearch'), 'input', scheduleBackupHistorySearch);
      addListener($id('clearBackupHistorySearchButton'), 'click', handleClearBackupHistorySearch);
      addListener($id('settingsModule'), 'click', handleViewBackupHistory);
      addListener($id('backupHistoryStatusFilter'), 'change', () =>
        handleRefreshBackups(1).catch(() => {})
      );
      addListener($id('backupHistorySort'), 'change', () =>
        handleRefreshBackups(1).catch(() => {})
      );
      addListener($id('backupHistoryDatePreset'), 'change', handleBackupHistoryDatePresetChange);
      addListener($id('backupHistoryDateFrom'), 'change', () =>
        handleRefreshBackups(1).catch(() => {})
      );
      addListener($id('backupHistoryDateTo'), 'change', () =>
        handleRefreshBackups(1).catch(() => {})
      );
      addListener($id('prevBackupHistoryPageButton'), 'click', handlePreviousBackupHistoryPage);
      addListener($id('nextBackupHistoryPageButton'), 'click', handleNextBackupHistoryPage);
      addListener($id('inspectRestorePackageButton'), 'click', handleInspectRestorePackage);
      addListener($id('verifyRestorePackageButton'), 'click', handleVerifyRestorePackage);
      addListener($id('assessRestoreEligibilityButton'), 'click', handleAssessRestoreEligibility);
      addListener(
        $id('assessRestoreAuthorizationButton'),
        'click',
        handleAssessRestoreAuthorization
      );
      addListener($id('dryRunCertificationReportButton'), 'click', handleDryRunCertificationReport);
      [
        'inspectRestorePackageButton',
        'verifyRestorePackageButton',
        'assessRestoreEligibilityButton',
        'assessRestoreAuthorizationButton',
        'dryRunCertificationReportButton',
      ].forEach((id) => {
        const btn = $id(id);
        if (btn) btn.disabled = false;
      });
      addListener(
        $id('refreshRestoreReadinessDashboardButton'),
        'click',
        handleRefreshRestoreReadinessDashboard
      );
      addListener(
        $id('refreshRestoreGovernanceAssessmentButton'),
        'click',
        handleRefreshRestoreGovernanceAssessment
      );
      addListener(
        $id('refreshRestoreExecutionPolicyButton'),
        'click',
        handleRefreshRestoreExecutionPolicy
      );
      addListener(
        $id('prepareRestoreSafetyBackupButton'),
        'click',
        handlePrepareRestoreSafetyBackup
      );
      addListener($id('cancelRestorePreparationButton'), 'click', handleCancelRestorePreparation);
      addListener(
        $id('recordRestoreFinalConfirmationButton'),
        'click',
        handleRecordRestoreFinalConfirmation
      );
      addListener(
        $id('refreshRestoreStartupRecoveryButton'),
        'click',
        handleRefreshRestoreStartupRecovery
      );
      addListener(
        $id('refreshRestoreRetentionButton'),
        'click',
        handleRefreshRestoreRetentionAssessment
      );
      addListener(
        $id('restoreEngineFoundationAssessmentButton'),
        'click',
        handleRestoreEngineFoundationAssessment
      );
      addListener(
        $id('restoreTransactionFoundationAssessmentButton'),
        'click',
        handleRestoreTransactionFoundationAssessment
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
    if (diff.backups) {
      renderBackups(Array.isArray(diff.backups) ? { backups: diff.backups } : diff.backups);
    }
    if (diff.backupVerificationSummary) {
      renderBackupVerificationSummary(diff.backupVerificationSummary);
    }
    if (diff.backupPreflightAssessment)
      renderBackupPreflightAssessment(diff.backupPreflightAssessment);
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
    if (diff.restoreGovernanceAssessment) {
      renderRestoreGovernanceAssessment(diff.restoreGovernanceAssessment);
    }
    if (diff.restoreExecutionPolicy) {
      renderRestoreExecutionPolicy(diff.restoreExecutionPolicy);
    }
    if (diff.restoreEngineFoundationStatus) {
      renderRestoreEngineFoundationStatus(diff.restoreEngineFoundationStatus);
    }
    if (diff.restoreTransactionFoundationStatus) {
      renderRestoreTransactionFoundationStatus(diff.restoreTransactionFoundationStatus);
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
