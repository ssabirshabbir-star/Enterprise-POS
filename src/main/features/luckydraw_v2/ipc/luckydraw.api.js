/**
 * luckydraw.api.js — Lucky Draw V2 Renderer-Side IPC Wrapper
 *
 * File:      src/main/features/luckydraw_v2/ipc/luckydraw.api.js
 * Risk:      LOW — calls /ld-v2/* IPC channels only, isolated namespace
 * Rollback:  Remove <script> tag; no side effects on other modules
 *
 * Exposes:   window.LuckyDrawV2Api
 * Load after: window.posApi (preload), window.LuckyDrawV2Renderer
 *
 * Pattern:   Mirrors billing.api.js exactly
 *   - All window.posApi.luckyDrawV2.* calls centralised here
 *   - No DOM manipulation (delegated to LuckyDrawV2Renderer)
 *   - No business logic
 */
(function LuckyDrawV2ApiModule() {
  'use strict';

  const LOG = (...a) => console.log('[LuckyDrawV2Api]', ...a);
  const R   = () => window.LuckyDrawV2Renderer;
  const api = () => window.posApi?.luckyDrawV2;

  // ── Response normalizer ───────────────────────────────────────────────────

  function ok(res, fallback) {
    const isOk  = Boolean(res?.ok || res?.success);
    const msg   = res?.message || res?.failureReason || fallback || 'Request failed.';
    return { ok: isOk, message: msg };
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────

  async function loadCampaigns() {
    LOG('loadCampaigns()');
    if (!api()?.listCampaigns) { R().showMsg('Lucky Draw API not available.', true); return; }
    const res = await api().listCampaigns();
    const { ok: isOk, message } = ok(res, 'Failed to load campaigns.');
    if (!isOk) { R().showMsg(message, true); return; }
    R().renderCampaigns(res.campaigns || []);
  }

  async function saveCampaign(payload) {
    LOG('saveCampaign()', payload);
    if (!api()) { R().showMsg('Lucky Draw API not available.', true); return; }
    const isEdit = Boolean(payload.id);
    const res = isEdit
      ? await api().updateCampaign({ id: payload.id, data: payload })
      : await api().createCampaign(payload);
    const { ok: isOk, message } = ok(res, isEdit ? 'Update failed.' : 'Create failed.');
    R().showMsg(message, !isOk);
    if (isOk) {
      R().closeCampaignForm();
      await loadCampaigns();
      loadReports();
    }
  }

  async function deleteCampaign(id) {
    LOG('deleteCampaign()', id);
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    const res = await api().deleteCampaign(id);
    const { ok: isOk, message } = ok(res, 'Delete failed.');
    R().showMsg(message, !isOk);
    if (isOk) { loadCampaigns(); loadReports(); }
  }

  // ── Participants ──────────────────────────────────────────────────────────

  async function loadParticipants(filters = {}) {
    LOG('loadParticipants()', filters);
    if (!api()?.listParticipants) { R().showMsg('Lucky Draw API not available.', true); return; }
    const res = await api().listParticipants(filters);
    const { ok: isOk, message } = ok(res, 'Failed to load participants.');
    if (!isOk) { R().showMsg(message, true); return; }
    R().renderParticipants(res.participants || []);
  }

  async function addParticipant(payload) {
    LOG('addParticipant()', payload);
    const res = await api().addParticipant(payload);
    const { ok: isOk, message } = ok(res, 'Failed to add participant.');
    R().showMsg(message, !isOk);
    if (isOk) {
      R().clearParticipantForm();
      await loadParticipants({ campaignId: payload.campaignId });
      loadReports();
    }
  }

  async function removeParticipant(id, campaignId) {
    LOG('removeParticipant()', id);
    if (!confirm('Remove this participant? This cannot be undone.')) return;
    const res = await api().removeParticipant(id);
    const { ok: isOk, message } = ok(res, 'Remove failed.');
    R().showMsg(message, !isOk);
    if (isOk) { loadParticipants({ campaignId }); loadReports(); }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  async function runDraw(payload) {
    LOG('runDraw()', payload);
    const btn = document.getElementById('ldv2RunDrawBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Drawing…'; }
    try {
      const res = await api().runDraw(payload);
      const { ok: isOk, message } = ok(res, 'Draw failed.');
      R().showMsg(message, !isOk);
      if (isOk) {
        R().renderDrawResult(res.winners || []);
        R().updateDrawRemaining?.(res.campaign, (res.winners || []).length);
        await loadWinners(payload.campaignId);
        loadReports();
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🎰 Run Draw'; }
    }
  }

  // ── Winners ───────────────────────────────────────────────────────────────

  async function loadWinners(campaignId) {
    LOG('loadWinners()', campaignId);
    if (!api()?.listWinners) { R().showMsg('Lucky Draw API not available.', true); return; }
    const res = await api().listWinners(campaignId || null);
    const { ok: isOk, message } = ok(res, 'Failed to load winners.');
    if (!isOk) { R().showMsg(message, true); return; }
    R().renderWinners(res.winners || []);
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async function loadReports() {
    LOG('loadReports()');
    if (!api()?.getReports) return;
    const res = await api().getReports();
    if (res?.ok) R().renderReports(res.reports);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.LuckyDrawV2Api = {
    loadCampaigns,
    saveCampaign,
    deleteCampaign,
    loadParticipants,
    addParticipant,
    removeParticipant,
    runDraw,
    loadWinners,
    loadReports,
  };

  LOG('module loaded → window.LuckyDrawV2Api ready');
})();
