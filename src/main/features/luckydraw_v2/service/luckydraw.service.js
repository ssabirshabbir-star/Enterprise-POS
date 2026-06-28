/**
 * luckydraw.service.js — Lucky Draw V2 Business Logic Layer
 *
 * File:      src/main/features/luckydraw_v2/service/luckydraw.service.js
 * Risk:      LOW — isolated service, no shared state with other modules
 * Rollback:  Delete this file
 *
 * Responsibilities:
 *   - Auth guard (admin/manager only for write operations)
 *   - Input validation and sanitization
 *   - Delegates all DB work to repository
 *   - No UI concerns, no direct DB calls
 */
'use strict';

const authService = require('../../auth/auth.service');
const repo = require('../repository/luckydraw.repository');

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireAccess(mode) {
  const result = await authService.getProfile();
  if (!result.ok) return { ok: false, message: 'Authentication required.' };
  const role = result.profile.role;
  if (mode === 'write') {
    const allowed = ['admin', 'manager', 'cashier'].includes(String(role).toLowerCase());
    if (!allowed) return { ok: false, message: 'You do not have permission for Lucky Draw.' };
  }
  return { ok: true, profile: result.profile };
}

// ── Validation helpers ────────────────────────────────────────────────────────

function cleanStr(v, max = 255) {
  return String(v || '')
    .trim()
    .slice(0, max);
}
function cleanDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function cleanInt(v, min = 0) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : null;
}
function cleanMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : null;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

async function listCampaigns() {
  const access = await requireAccess('read');
  if (!access.ok) return access;
  return { ok: true, campaigns: await repo.listCampaigns() };
}

async function createCampaign(payload = {}) {
  const access = await requireAccess('write');
  if (!access.ok) return access;

  const campaignName = cleanStr(payload.campaignName, 120);
  if (campaignName.length < 2)
    return { ok: false, message: 'Campaign name is required (min 2 chars).' };

  const startDate = cleanDate(payload.startDate);
  const endDate = cleanDate(payload.endDate);
  if (!startDate) return { ok: false, message: 'Valid start date is required.' };
  if (!endDate) return { ok: false, message: 'Valid end date is required.' };
  if (endDate < startDate) return { ok: false, message: 'End date must be after start date.' };

  const minimumPurchase = cleanMoney(payload.minimumPurchase);
  if (minimumPurchase === null)
    return { ok: false, message: 'Minimum purchase must be a valid amount.' };
  if (minimumPurchase <= 0)
    return { ok: false, message: 'Minimum purchase must be greater than zero for auto campaigns.' };

  const totalWinners = cleanInt(payload.totalWinners, 1);
  if (totalWinners === null) return { ok: false, message: 'Total winners must be at least 1.' };

  const validStatuses = ['ACTIVE', 'INACTIVE', 'COMPLETED'];
  const status = validStatuses.includes(payload.status) ? payload.status : 'ACTIVE';

  // Auto-generate campaign code if not provided
  const campaignCode =
    cleanStr(payload.campaignCode) ||
    `LD-V2-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

  const campaign = await repo.createCampaign(
    {
      campaignName,
      campaignCode,
      startDate,
      endDate,
      minimumPurchase,
      prizeDetails: cleanStr(payload.prizeDetails, 500),
      totalWinners,
      status,
      notes: cleanStr(payload.notes, 500),
    },
    access.profile.id
  );

  return { ok: true, campaign, message: 'Campaign created successfully.' };
}

async function updateCampaign(id, payload = {}) {
  const access = await requireAccess('write');
  if (!access.ok) return access;

  const campId = cleanInt(id, 1);
  if (!campId) return { ok: false, message: 'Invalid campaign ID.' };

  const existing = await repo.getCampaignById(campId);
  if (!existing) return { ok: false, message: 'Campaign not found.' };

  const campaignName = cleanStr(payload.campaignName, 120);
  if (campaignName.length < 2) return { ok: false, message: 'Campaign name is required.' };

  const startDate = cleanDate(payload.startDate);
  const endDate = cleanDate(payload.endDate);
  if (!startDate || !endDate) return { ok: false, message: 'Valid dates are required.' };
  if (endDate < startDate) return { ok: false, message: 'End date must be after start date.' };

  const minimumPurchase = cleanMoney(payload.minimumPurchase);
  const totalWinners = cleanInt(payload.totalWinners, 1);
  if (minimumPurchase === null) return { ok: false, message: 'Invalid minimum purchase.' };
  if (minimumPurchase <= 0)
    return { ok: false, message: 'Minimum purchase must be greater than zero for auto campaigns.' };
  if (totalWinners === null) return { ok: false, message: 'Total winners must be at least 1.' };

  const validStatuses = ['ACTIVE', 'INACTIVE', 'COMPLETED'];
  const status = validStatuses.includes(payload.status) ? payload.status : existing.status;

  const campaign = await repo.updateCampaign(campId, {
    campaignName,
    startDate,
    endDate,
    minimumPurchase,
    prizeDetails: cleanStr(payload.prizeDetails, 500),
    totalWinners,
    status,
    notes: cleanStr(payload.notes, 500),
  });

  return { ok: true, campaign, message: 'Campaign updated successfully.' };
}

async function deleteCampaign(id) {
  const access = await requireAccess('write');
  if (!access.ok) return access;
  const campId = cleanInt(id, 1);
  if (!campId) return { ok: false, message: 'Invalid campaign ID.' };
  const deleted = await repo.softDeleteCampaign(campId);
  if (!deleted) return { ok: false, message: 'Campaign not found or already deleted.' };
  return { ok: true, message: 'Campaign deleted.' };
}

// ── Participants ──────────────────────────────────────────────────────────────

async function listParticipants(filters = {}) {
  const access = await requireAccess('read');
  if (!access.ok) return access;
  const clean = {
    campaignId: filters.campaignId ? cleanInt(filters.campaignId, 1) : null,
    search: cleanStr(filters.search, 100) || null,
  };
  return { ok: true, participants: await repo.listParticipants(clean) };
}

async function addParticipant(payload = {}) {
  const access = await requireAccess('write');
  if (!access.ok) return access;

  const campaignId = cleanInt(payload.campaignId, 1);
  if (!campaignId) return { ok: false, message: 'Campaign ID is required.' };

  const campaign = await repo.getCampaignById(campaignId);
  if (!campaign) return { ok: false, message: 'Campaign not found.' };
  // M-8: treat ACTIVE campaigns past their end date as expired
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = campaign.status === 'ACTIVE' && campaign.endDate && campaign.endDate < today;
  if (isExpired)
    return { ok: false, message: 'Campaign has expired and is no longer accepting entries.' };
  if (campaign.status !== 'ACTIVE') return { ok: false, message: 'Campaign is not active.' };

  const billAmount = cleanMoney(payload.billAmount);
  if (billAmount === null)
    return { ok: false, message: 'Bill amount must be a valid amount >= 0.' };
  if (billAmount < campaign.minimumPurchase) {
    return {
      ok: false,
      message: `Bill amount must be at least Rs.${campaign.minimumPurchase} for this campaign.`,
    };
  }

  try {
    const participant = await repo.addParticipant(
      {
        campaignId,
        customerId: payload.customerId ? cleanInt(payload.customerId, 1) : null,
        customerName: cleanStr(payload.customerName, 120),
        billAmount,
      },
      access.profile.id
    );
    return { ok: true, participant, message: 'Participant added successfully.' };
  } catch (err) {
    if (err.message === 'CAMPAIGN_NOT_FOUND') return { ok: false, message: 'Campaign not found.' };
    throw err;
  }
}

async function removeParticipant(entryId) {
  const access = await requireAccess('write');
  if (!access.ok) return access;
  const id = cleanInt(entryId, 1);
  if (!id) return { ok: false, message: 'Invalid entry ID.' };
  try {
    const removed = await repo.removeParticipant(id);
    if (!removed) return { ok: false, message: 'Participant not found.' };
    return { ok: true, message: 'Participant removed.' };
  } catch (err) {
    if (err.message === 'ENTRY_IS_WINNER')
      return { ok: false, message: 'Cannot remove a winner entry.' };
    throw err;
  }
}

// ── Draw ─────────────────────────────────────────────────────────────────────

async function runDraw(payload = {}) {
  const access = await requireAccess('write');
  if (!access.ok) return access;

  const campaignId = cleanInt(payload.campaignId, 1);
  if (!campaignId) return { ok: false, message: 'Campaign ID is required.' };

  const count = cleanInt(payload.count, 1) || 1;

  try {
    const result = await repo.runDraw(campaignId, count, access.profile.id);
    if (result.winners.length === 0) {
      return {
        ok: true,
        ...result,
        message: result.message || 'No eligible entries to draw from.',
      };
    }
    return { ok: true, ...result, message: `${result.winners.length} winner(s) selected.` };
  } catch (err) {
    if (err.message === 'CAMPAIGN_NOT_FOUND') return { ok: false, message: 'Campaign not found.' };
    throw err;
  }
}

// ── Winners ───────────────────────────────────────────────────────────────────

async function listWinners(campaignId) {
  const access = await requireAccess('read');
  if (!access.ok) return access;
  const id = campaignId ? cleanInt(campaignId, 1) : null;
  return { ok: true, winners: await repo.listWinners(id) };
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function getReports() {
  const access = await requireAccess('read');
  if (!access.ok) return access;
  return { ok: true, reports: await repo.getReports() };
}

module.exports = {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listParticipants,
  addParticipant,
  removeParticipant,
  runDraw,
  listWinners,
  getReports,
};
