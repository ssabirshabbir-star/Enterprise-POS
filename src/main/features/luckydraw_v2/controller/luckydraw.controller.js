/**
 * luckydraw.controller.js — Lucky Draw V2 IPC Route Registration
 *
 * File:      src/main/features/luckydraw_v2/controller/luckydraw.controller.js
 * Risk:      LOW — registers /ld-v2/* routes only, no collision with existing routes
 * Rollback:  Do not call registerLuckyDrawV2Routes in main.js
 *
 * Pattern:   Identical to billing.controller.js
 *   - No business logic
 *   - No DB calls
 *   - Wraps service calls in safeError handler
 */
'use strict';

const service = require('../service/luckydraw.service');
const { logError } = require('../../../utils/safe-logger');

function safeError(error, label) {
  logError(`[LuckyDrawV2] ${label}`, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerLuckyDrawV2Routes(ipcMain) {
  // ── Campaigns ──────────────────────────────────────────────────────────────
  ipcMain.handle('/ld-v2/campaigns/list', async () => {
    try {
      return await service.listCampaigns();
    } catch (e) {
      return safeError(e, 'listCampaigns');
    }
  });

  ipcMain.handle('/ld-v2/campaigns/create', async (_e, payload) => {
    try {
      return await service.createCampaign(payload || {});
    } catch (e) {
      return safeError(e, 'createCampaign');
    }
  });

  ipcMain.handle('/ld-v2/campaigns/update', async (_e, payload) => {
    try {
      return await service.updateCampaign(payload?.id, payload?.data || {});
    } catch (e) {
      return safeError(e, 'updateCampaign');
    }
  });

  ipcMain.handle('/ld-v2/campaigns/delete', async (_e, id) => {
    try {
      return await service.deleteCampaign(id);
    } catch (e) {
      return safeError(e, 'deleteCampaign');
    }
  });

  // ── Participants ───────────────────────────────────────────────────────────
  ipcMain.handle('/ld-v2/participants/list', async (_e, filters) => {
    try {
      return await service.listParticipants(filters || {});
    } catch (e) {
      return safeError(e, 'listParticipants');
    }
  });

  ipcMain.handle('/ld-v2/participants/add', async (_e, payload) => {
    try {
      return await service.addParticipant(payload || {});
    } catch (e) {
      return safeError(e, 'addParticipant');
    }
  });

  ipcMain.handle('/ld-v2/participants/remove', async (_e, id) => {
    try {
      return await service.removeParticipant(id);
    } catch (e) {
      return safeError(e, 'removeParticipant');
    }
  });

  // ── Draw ───────────────────────────────────────────────────────────────────
  ipcMain.handle('/ld-v2/draw/run', async (_e, payload) => {
    try {
      return await service.runDraw(payload || {});
    } catch (e) {
      return safeError(e, 'runDraw');
    }
  });

  // ── Winners ────────────────────────────────────────────────────────────────
  ipcMain.handle('/ld-v2/winners/list', async (_e, campaignId) => {
    try {
      return await service.listWinners(campaignId);
    } catch (e) {
      return safeError(e, 'listWinners');
    }
  });

  // ── Reports ────────────────────────────────────────────────────────────────
  ipcMain.handle('/ld-v2/reports', async () => {
    try {
      return await service.getReports();
    } catch (e) {
      return safeError(e, 'getReports');
    }
  });
}

module.exports = { registerLuckyDrawV2Routes };
