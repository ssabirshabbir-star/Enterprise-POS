(function SettingsRendererModule() {
  'use strict';

  let initialized = false;
  const listeners = [];

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
    }
    loadReadOnlyData().catch(() => {});
  }

  function updateUI(diff = {}) {
    if (diff.settings) renderSettings(diff.settings);
    if (diff.appInfo) renderAppInfo(diff.appInfo);
    if (diff.licenseUnavailable) renderLicenseUnavailable();
    if (diff.backups) renderBackups({ backups: diff.backups });
    if (diff.packageInspection) renderPackageInspection(diff.packageInspection);
    if (diff.packageVerification) renderPackageVerification(diff.packageVerification);
    if (diff.message) showMessage(diff.message, diff.type || 'success');
  }

  function destroyUI() {
    listeners.splice(0).forEach(({ target, eventName, handler, options }) => {
      target.removeEventListener(eventName, handler, options);
    });
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
