/**
 * luckydraw.renderer.js — Lucky Draw V2 UI Orchestration
 *
 * File:      src/main/features/luckydraw_v2/ui/luckydraw.renderer.js
 * Risk:      LOW — isolated renderer, no shared globals except window.LuckyDrawV2Renderer
 * Rollback:  Remove <script> tag; no side effects
 *
 * Exposes:   window.LuckyDrawV2Renderer | window.initLuckyDrawV2Module
 * Load order: luckydraw.api.js → luckydraw.renderer.js
 *
 * Responsibilities (UI ONLY):
 *   - DOM event binding
 *   - Table rendering
 *   - Form open/close
 *   - Feedback messages
 * NOT ALLOWED: IPC calls, business logic, posApi calls
 */
(function LuckyDrawV2RendererModule() {
  'use strict';

  const LOG = (...a) => console.log('[LuckyDrawV2Renderer]', ...a);
  const A   = () => window.LuckyDrawV2Api;

  // ── State ──────────────────────────────────────────────────────────────────
  let _activeCampaignId   = null;
  let _activeCampaignName = '';
  let _msgTimer           = null;

  // ── Utilities ──────────────────────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }
  function esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(v)  { return Number(v||0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // ── Feedback ───────────────────────────────────────────────────────────────
  function showMsg(text, isError = false) {
    const el = $id('ldv2Message');
    if (!el) return;
    el.textContent = text;
    el.style.cssText = isError
      ? 'display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;padding:8px 14px;border-radius:7px;font-size:.82rem;margin-bottom:8px'
      : 'display:block;background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:8px 14px;border-radius:7px;font-size:.82rem;margin-bottom:8px';
    clearTimeout(_msgTimer);
    _msgTimer = setTimeout(() => { el.style.cssText = ''; }, 5000);
  }

  // ── Panel navigation ───────────────────────────────────────────────────────
  function showPanel(panelId) {
    ['ldv2CampaignsPanel','ldv2ParticipantsPanel','ldv2DrawPanel','ldv2WinnersPanel']
      .forEach(id => { const el = $id(id); if (el) el.classList.add('hidden'); });
    const target = $id(panelId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('[data-ldv2-tab]').forEach(btn => {
      btn.classList.toggle('ldv2-tab-active', btn.dataset.ldv2Tab === panelId);
    });
  }

  // ── Campaign table ─────────────────────────────────────────────────────────
  function renderCampaigns(campaigns) {
    const tbody = $id('ldv2CampaignTbody');
    if (!tbody) return;

    const statusBadge = s => {
      const colors = { ACTIVE: '#16a34a', INACTIVE: '#6b7280', COMPLETED: '#7c3aed', EXPIRED: '#d97706' };
      return `<span style="padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:700;background:${colors[s]||'#6b7280'}20;color:${colors[s]||'#6b7280'}">${esc(s)}</span>`;
    };

    if (!campaigns.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No campaigns yet. Create one to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = campaigns.map(c => `
      <tr class="ldv2-row" data-campaign-id="${c.id}">
        <td>${esc(c.campaignCode)}</td>
        <td style="font-weight:600">${esc(c.campaignName)}</td>
        <td>${esc(c.startDate||'—')} → ${esc(c.endDate||'—')}</td>
        <td style="text-align:right">Rs.${fmt(c.minimumPurchase)}</td>
        <td style="text-align:center">${c.totalEntries}</td>
        <td style="text-align:center;font-size:.78rem"><span style="font-weight:700;color:#7c3aed">${c.totalWinnersDrawn}</span><span style="color:#94a3b8"> / ${c.totalWinners}</span></td>
        <td>${statusBadge(c.status)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button type="button" class="ldv2-act-btn ldv2-act-blue"
              data-ldv2-action="participants" data-campaign-id="${c.id}" data-campaign-name="${esc(c.campaignName)}">
              Participants
            </button>
            <button type="button" class="ldv2-act-btn ldv2-act-green"
              data-ldv2-action="draw" data-campaign-id="${c.id}" data-campaign-name="${esc(c.campaignName)}">
              Draw
            </button>
            <button type="button" class="ldv2-act-btn ldv2-act-gray"
              data-ldv2-action="edit" data-campaign-id="${c.id}"
              data-campaign='${JSON.stringify(c).replace(/'/g,"&#39;")}'>
              Edit
            </button>
            <button type="button" class="ldv2-act-btn ldv2-act-red"
              data-ldv2-action="delete" data-campaign-id="${c.id}">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── Campaign form ──────────────────────────────────────────────────────────
  function openCampaignForm(campaign = null) {
    const modal = $id('ldv2CampaignModal');
    const title = $id('ldv2CampaignModalTitle');
    if (!modal) return;
    if (title) title.textContent = campaign ? 'Edit Campaign' : 'New Campaign';
    $id('ldv2CampaignId').value          = campaign?.id          || '';
    $id('ldv2CampaignName').value        = campaign?.campaignName  || '';
    $id('ldv2CampaignStart').value       = campaign?.startDate     || '';
    $id('ldv2CampaignEnd').value         = campaign?.endDate       || '';
    $id('ldv2CampaignMinPurchase').value = campaign?.minimumPurchase || '0';
    $id('ldv2CampaignPrize').value       = campaign?.prizeDetails   || '';
    $id('ldv2CampaignWinners').value     = campaign?.totalWinners   || '1';
    $id('ldv2CampaignNotes').value       = campaign?.notes          || '';
    $id('ldv2CampaignStatus').value      = campaign?.status         || 'ACTIVE';
    modal.classList.remove('hidden');
  }

  function closeCampaignForm() {
    const modal = $id('ldv2CampaignModal');
    if (modal) modal.classList.add('hidden');
  }

  // ── Participant table ──────────────────────────────────────────────────────
  function renderParticipants(participants) {
    const tbody = $id('ldv2ParticipantTbody');
    if (!tbody) return;
    const head = $id('ldv2ParticipantPanelHead');
    if (head) head.textContent = `Participants — ${_activeCampaignName}`;

    if (!participants.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No participants yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = participants.map(p => `
      <tr class="ldv2-row">
        <td style="font-family:monospace;font-size:.78rem">${esc(p.couponNo)}</td>
        <td>${esc(p.customerName)}</td>
        <td style="text-align:right">Rs.${fmt(p.billAmount)}</td>
        <td style="font-size:.75rem;color:#6b7280">${esc(p.invoiceNumber||'—')}</td>
        <td style="font-size:.75rem;color:#6b7280">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td>
        <td>
          <button type="button" class="ldv2-act-btn ldv2-act-red"
            data-ldv2-action="remove-participant"
            data-entry-id="${p.id}" data-campaign-id="${p.campaignId}">
            Remove
          </button>
        </td>
      </tr>
    `).join('');
  }

  function clearParticipantForm() {
    ['ldv2PartCustomerName','ldv2PartBillAmount','ldv2PartCustomerId'].forEach(id => {
      const el = $id(id); if (el) el.value = '';
    });
  }

  // ── Draw panel ─────────────────────────────────────────────────────────────
  function renderDrawResult(winners) {
    const el = $id('ldv2DrawResult');
    if (!el) return;
    if (!winners.length) {
      el.innerHTML = `<p style="color:#9ca3af;font-size:.82rem">No winners were selected. There may be no eligible entries.</p>`;
      return;
    }
    el.innerHTML = winners.map((w, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;margin-bottom:8px">
        <span style="font-size:1.6rem">🏆</span>
        <div>
          <p style="margin:0;font-weight:700;color:#166534">Winner #${i+1}: ${esc(w.customerName)}</p>
          <p style="margin:2px 0 0;font-size:.76rem;color:#4b7a57">Coupon: ${esc(w.couponNo)} &nbsp;|&nbsp; Bill: Rs.${fmt(w.billAmount)}</p>
          <p style="margin:2px 0 0;font-size:.76rem;color:#4b7a57">Prize: ${esc(w.prizeName||'—')}</p>
        </div>
      </div>
    `).join('');
  }

  // ── Winners table ──────────────────────────────────────────────────────────
  function renderWinners(winners) {
    const tbody = $id('ldv2WinnersTbody');
    if (!tbody) return;
    if (!winners.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af;font-size:.82rem">No winners yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = winners.map(w => `
      <tr class="ldv2-row">
        <td style="font-weight:600;color:#7c3aed">${esc(w.campaignName)}</td>
        <td style="font-family:monospace;font-size:.78rem">${esc(w.couponNo)}</td>
        <td style="font-weight:600">${esc(w.customerName)}</td>
        <td style="text-align:right">Rs.${fmt(w.billAmount)}</td>
        <td style="font-size:.78rem">${esc(w.prizeName||'—')}</td>
        <td style="font-size:.75rem;color:#6b7280">${w.selectedAt ? new Date(w.selectedAt).toLocaleString() : '—'}</td>
      </tr>
    `).join('');
  }

  // ── Reports ────────────────────────────────────────────────────────────────
  function renderReports(r) {
    if (!r) return;
    [
      ['ldv2StatCampaigns', r.campaignCount],
      ['ldv2StatEntries',   r.entryCount],
      ['ldv2StatWinners',   r.winnerCount],
      ['ldv2StatSales',     `Rs.${fmt(r.totalSales)}`],
    ].forEach(([id, val]) => { const el = $id(id); if (el) el.textContent = val; });
  }

  // ── Draw remaining slots ───────────────────────────────────────────────────
  function updateDrawRemaining(campaign, newWinnersCount) {
    if (!campaign) return;
    const remaining = Math.max(0, (campaign.totalWinners || 0) - (campaign.totalWinnersDrawn || 0) - (newWinnersCount || 0));
    const remEl = $id('ldv2DrawRemaining');
    if (remEl) { remEl.textContent = `Remaining winner slots: ${remaining}`; remEl.style.display = ''; }
  }

  // ── Event binding ──────────────────────────────────────────────────────────
  function attachEvents() {
    // Tab navigation
    document.querySelectorAll('[data-ldv2-tab]').forEach(btn =>
      btn.addEventListener('click', () => {
        showPanel(btn.dataset.ldv2Tab);
        if (btn.dataset.ldv2Tab === 'ldv2WinnersPanel') A().loadWinners(null);
      })
    );

    // New Campaign button
    $id('ldv2NewCampaignBtn')?.addEventListener('click', () => openCampaignForm());

    // Campaign form submit
    $id('ldv2CampaignForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = $id('ldv2CampaignId').value;
      A().saveCampaign({
        id:              id ? Number(id) : null,
        campaignName:    $id('ldv2CampaignName').value,
        startDate:       $id('ldv2CampaignStart').value,
        endDate:         $id('ldv2CampaignEnd').value,
        minimumPurchase: $id('ldv2CampaignMinPurchase').value,
        prizeDetails:    $id('ldv2CampaignPrize').value,
        totalWinners:    $id('ldv2CampaignWinners').value,
        status:          $id('ldv2CampaignStatus').value,
        notes:           $id('ldv2CampaignNotes').value,
      });
    });

    // Campaign form close
    $id('ldv2CampaignModalClose')?.addEventListener('click', closeCampaignForm);
    $id('ldv2CampaignModalCancel')?.addEventListener('click', closeCampaignForm);
    $id('ldv2CampaignCancelBtn')?.addEventListener('click', closeCampaignForm);

    // Campaign table delegation
    $id('ldv2CampaignTbody')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ldv2-action]');
      if (!btn) return;
      const action     = btn.dataset.ldv2Action;
      const campaignId = Number(btn.dataset.campaignId);

      if (action === 'edit') {
        const data = JSON.parse(btn.dataset.campaign || '{}');
        openCampaignForm(data);
      } else if (action === 'delete') {
        A().deleteCampaign(campaignId);
      } else if (action === 'participants') {
        _activeCampaignId   = campaignId;
        _activeCampaignName = btn.dataset.campaignName || '';
        $id('ldv2PartCampaignId').value = campaignId;
        showPanel('ldv2ParticipantsPanel');
        A().loadParticipants({ campaignId });
      } else if (action === 'draw') {
        _activeCampaignId   = campaignId;
        _activeCampaignName = btn.dataset.campaignName || '';
        const head = $id('ldv2DrawPanelHead');
        if (head) head.textContent = `Draw \u2014 ${_activeCampaignName}`;
        $id('ldv2DrawCampaignId').value = campaignId;
        $id('ldv2DrawResult').innerHTML = '';
        const cData = (() => { try { return JSON.parse(btn.dataset.campaign || '{}'); } catch (_) { return {}; } })();
        const remEl = $id('ldv2DrawRemaining');
        if (remEl) {
          const slots = Math.max(0, (cData.totalWinners || 0) - (cData.totalWinnersDrawn || 0));
          remEl.textContent = `Remaining winner slots: ${slots}`;
          remEl.style.display = '';
        }
        showPanel('ldv2DrawPanel');
      }
    });

    // Participant filter
    $id('ldv2PartSearchInput')?.addEventListener('input', e => {
      clearTimeout(window.__ldv2SearchTimer);
      window.__ldv2SearchTimer = setTimeout(() =>
        A().loadParticipants({ campaignId: _activeCampaignId, search: e.target.value.trim() }), 350);
    });

    // Add participant form
    $id('ldv2PartForm')?.addEventListener('submit', e => {
      e.preventDefault();
      A().addParticipant({
        campaignId:   _activeCampaignId,
        customerName: $id('ldv2PartCustomerName').value,
        customerId:   $id('ldv2PartCustomerId').value || null,
        billAmount:   $id('ldv2PartBillAmount').value,
      });
    });

    // Participants table delegation
    $id('ldv2ParticipantTbody')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ldv2-action="remove-participant"]');
      if (!btn) return;
      A().removeParticipant(Number(btn.dataset.entryId), Number(btn.dataset.campaignId));
    });

    // Back to campaigns
    document.querySelectorAll('[data-ldv2-back="campaigns"]').forEach(btn =>
      btn.addEventListener('click', () => {
        showPanel('ldv2CampaignsPanel');
        A().loadCampaigns();
      })
    );

    // Run draw
    $id('ldv2RunDrawBtn')?.addEventListener('click', () => {
      const campaignId = Number($id('ldv2DrawCampaignId').value);
      const count      = Number($id('ldv2DrawCount').value || 1);
      if (!campaignId) { showMsg('Select a campaign first.', true); return; }
      A().runDraw({ campaignId, count });
    });

    // View winners tab
    $id('ldv2ViewWinnersBtn')?.addEventListener('click', () => {
      showPanel('ldv2WinnersPanel');
      A().loadWinners(_activeCampaignId);
    });

    // Winners filter
    $id('ldv2WinnersAllBtn')?.addEventListener('click', () => A().loadWinners(null));
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    LOG('init()');
    attachEvents();
    showPanel('ldv2CampaignsPanel');
    A().loadCampaigns();
    A().loadReports();
  }

  // ── Public surface ─────────────────────────────────────────────────────────
  window.LuckyDrawV2Renderer = {
    showMsg,
    renderCampaigns,
    renderParticipants,
    renderDrawResult,
    renderWinners,
    renderReports,
    closeCampaignForm,
    clearParticipantForm,
    updateDrawRemaining,
  };

  window.initLuckyDrawV2Module = init;
  LOG('module loaded → window.LuckyDrawV2Renderer ready');
})();
