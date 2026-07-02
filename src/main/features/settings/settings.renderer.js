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

  function showUnavailable(featureName) {
    const result = A().unavailable(featureName);
    showMessage(result.message, 'error');
  }

  function handleBlockedAction(event) {
    const target = event.target.closest('[data-settings-tab], button[disabled]');
    if (!target || !$id('settingsModule')?.contains(target)) return;
    const label = target.textContent?.trim() || target.title || 'This action';
    showUnavailable(label.replace(/\s+Disabled$/i, ''));
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
    }
    loadReadOnlyData().catch(() => {});
  }

  function updateUI(diff = {}) {
    if (diff.settings) renderSettings(diff.settings);
    if (diff.appInfo) renderAppInfo(diff.appInfo);
    if (diff.licenseUnavailable) renderLicenseUnavailable();
    if (diff.backups) renderBackups({ backups: diff.backups });
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
