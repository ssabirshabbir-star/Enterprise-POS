(function SyncRendererModule() {
  'use strict';

  let initialized = false;
  const listeners = [];
  let state = {
    status: null,
    queue: [],
    logs: [],
  };

  const A = () => window.SyncApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function text(value, fallback = '-') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function dateTime(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  }

  function setText(id, value) {
    const el = $id(id);
    if (el) el.textContent = text(value);
  }

  function showMessage(message, type = 'error') {
    const el = $id('syncMessage');
    if (!el) return;
    const isError = type === 'error';
    el.textContent = message || '';
    el.classList.remove('hidden');
    el.style.background = isError ? '#fef2f2' : '#f0fdf4';
    el.style.color = isError ? '#b91c1c' : '#166534';
    el.style.border = isError ? '1px solid #fca5a5' : '1px solid #86efac';
  }

  function renderStatus(status = {}) {
    const terminal = status.terminal || {};
    const counts = status.counts || {};
    setText('syncTerminalCode', `Terminal: ${terminal.code || '-'}`);
    setText('syncPendingCount', counts.pending || 0);
    setText('syncSyncingCount', counts.syncing || 0);
    setText('syncFailedCount', counts.failed || 0);
    setText('syncSyncedCount', counts.synced || 0);

    const indicator = $id('syncStatusIndicator');
    if (indicator) {
      indicator.textContent = Number(counts.failed || 0) > 0 ? 'Sync attention' : 'Sync read-only';
      indicator.title = 'Sync is read-only until installer certification.';
    }
  }

  function renderQueue(rows = []) {
    const body = $id('syncQueueBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="px-3 py-6 text-center text-zinc-500">No queued operations.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map(
        (item) => `<tr>
          <td class="px-3 py-2">${esc(item.entityType || '-')} #${esc(item.entityId || '-')}</td>
          <td class="px-3 py-2">${esc(item.operation || '-')}</td>
          <td class="px-3 py-2">${esc(item.status || '-')}</td>
          <td class="px-3 py-2">${esc(item.terminalCode || '-')}</td>
          <td class="px-3 py-2">${esc(dateTime(item.updatedAt))}</td>
        </tr>`
      )
      .join('');
  }

  function renderLogs(logs = []) {
    const list = $id('syncLogsList');
    if (!list) return;
    if (!logs.length) {
      list.innerHTML =
        '<div class="px-3 py-6 text-center text-zinc-500">No sync logs available.</div>';
      return;
    }
    list.innerHTML = logs
      .map(
        (log) => `<div class="px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <strong>${esc(log.status || '-')}</strong>
            <span class="text-xs text-zinc-500">${esc(dateTime(log.startedAt))}</span>
          </div>
          <p class="mt-1 text-zinc-600">${esc(log.message || '-')}</p>
          <p class="mt-1 text-xs text-zinc-500">${esc(log.direction || '-')} | Processed: ${esc(log.processedCount || 0)} | Failed: ${esc(log.failedCount || 0)}</p>
        </div>`
      )
      .join('');
  }

  function updateUI(diff = {}) {
    state = { ...state, ...diff };
    renderStatus(state.status || {});
    renderQueue(state.queue || []);
    renderLogs(state.logs || []);
  }

  async function loadReadOnlyData() {
    showMessage('Sync execution and retry are disabled until workflow certification.', 'success');
    try {
      const [statusResult, queueResult] = await Promise.all([A().status(), A().queue()]);
      if (!statusResult?.ok && !queueResult?.ok) {
        showMessage(
          statusResult?.message || queueResult?.message || 'Unable to load sync status.',
          'error'
        );
        return;
      }
      const nextStatus = queueResult?.status || statusResult || null;
      updateUI({
        status: nextStatus,
        queue: queueResult?.queue || [],
        logs: queueResult?.logs || [],
      });
    } catch {
      showMessage('Unable to load sync status.', 'error');
    }
  }

  function showUnavailable(featureName) {
    const result = A().unavailable(featureName);
    showMessage(result.message, 'error');
  }

  function handleBlockedAction(event) {
    const target = event.target.closest('#runSyncButton, #retrySyncButton, #refreshSyncButton');
    if (!target) return;
    const label = target.textContent?.trim() || 'Sync action';
    showUnavailable(label.replace(/\s+Disabled$/i, ''));
  }

  function addListener(target, eventName, handler, options) {
    if (!target) return;
    target.addEventListener(eventName, handler, options);
    listeners.push({ target, eventName, handler, options });
  }

  function renderUI(nextState = {}) {
    if (!$id('syncModule')) return;
    if (!initialized) {
      initialized = true;
      addListener(document, 'click', handleBlockedAction, true);
    }
    updateUI(nextState);
    loadReadOnlyData().catch(() => {});
  }

  function destroyUI() {
    listeners.splice(0).forEach(({ target, eventName, handler, options }) => {
      target.removeEventListener(eventName, handler, options);
    });
    initialized = false;
    state = {
      status: null,
      queue: [],
      logs: [],
    };
  }

  function initSyncModule() {
    renderUI();
  }

  window.SyncRenderer = {
    destroyUI,
    renderUI,
    updateUI,
  };
  window.initSyncModule = initSyncModule;
})();
