const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const luckyDrawRepository = require('./lucky-draw.repository');

const READ_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman']);
const WRITE_ROLES = new Set(['Admin', 'Manager']);
const DRAW_ROLES = new Set(['Admin', 'Manager']);

async function requireLuckyDrawAccess(mode = 'read') {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const profile = profileResult.profile;
  const roles = mode === 'draw' ? DRAW_ROLES : mode === 'write' ? WRITE_ROLES : READ_ROLES;
  if (!roles.has(profile.role)) return { ok: false, message: 'You do not have permission for Lucky Draw.' };
  return { ok: true, profile };
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function integer(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function cleanCampaignPayload(payload = {}) {
  const campaignName = String(payload.campaignName || '').trim();
  const startDate = cleanDate(payload.startDate);
  const endDate = cleanDate(payload.endDate);
  const minimumPurchase = money(payload.minimumPurchase);
  const totalWinners = integer(Number(payload.totalWinners || 1));
  const prizeDetails = String(payload.prizeDetails || '').trim();
  const couponGenerationType = String(payload.couponGenerationType || 'AUTO').toUpperCase();
  const status = String(payload.status || 'ACTIVE').toUpperCase();

  if (campaignName.length < 3) return { ok: false, message: 'Campaign name is required.' };
  if (!startDate || !endDate) return { ok: false, message: 'Start date and end date are required.' };
  if (new Date(endDate) < new Date(startDate)) return { ok: false, message: 'End date cannot be before start date.' };
  if (minimumPurchase === null || minimumPurchase <= 0) return { ok: false, message: 'Minimum purchase must be greater than zero.' };
  if (!prizeDetails) return { ok: false, message: 'Prize details are required.' };
  if (!totalWinners) return { ok: false, message: 'Number of winners must be greater than zero.' };
  if (!['AUTO', 'MANUAL'].includes(couponGenerationType)) return { ok: false, message: 'Coupon generation type is invalid.' };
  if (!['ACTIVE', 'INACTIVE'].includes(status)) return { ok: false, message: 'Campaign status is invalid.' };

  return {
    ok: true,
    payload: {
      campaignName,
      startDate,
      endDate,
      minimumPurchase,
      prizeDetails,
      totalWinners,
      couponGenerationType,
      qrEnabled: Boolean(payload.qrEnabled),
      barcodeEnabled: Boolean(payload.barcodeEnabled),
      status,
      notes: String(payload.notes || '').trim()
    }
  };
}

async function listCampaigns() {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  return {
    ok: true,
    campaigns: await luckyDrawRepository.listCampaigns(),
    permissions: {
      canWrite: WRITE_ROLES.has(access.profile.role),
      canDraw: DRAW_ROLES.has(access.profile.role),
      canVerify: READ_ROLES.has(access.profile.role)
    }
  };
}

async function createCampaign(payload = {}) {
  const access = await requireLuckyDrawAccess('write');
  if (!access.ok) return access;
  const clean = cleanCampaignPayload(payload);
  if (!clean.ok) return clean;
  try {
    const campaign = await luckyDrawRepository.createCampaign(clean.payload, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'lucky_draw.campaign.create', status: 'success', message: 'Lucky Draw campaign created', metadata: { campaignId: campaign.id } });
    return { ok: true, campaign, message: 'Lucky Draw campaign saved.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Campaign code already exists.' };
    throw error;
  }
}

async function updateCampaign(id, payload = {}) {
  const access = await requireLuckyDrawAccess('write');
  if (!access.ok) return access;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { ok: false, message: 'Invalid campaign.' };
  const clean = cleanCampaignPayload(payload);
  if (!clean.ok) return clean;
  const campaign = await luckyDrawRepository.updateCampaign(campaignId, clean.payload);
  if (!campaign) return { ok: false, message: 'Campaign not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'lucky_draw.campaign.update', status: 'success', message: 'Lucky Draw campaign updated', metadata: { campaignId } });
  return { ok: true, campaign, message: 'Campaign updated.' };
}

async function deleteCampaign(id) {
  const access = await requireLuckyDrawAccess('write');
  if (!access.ok) return access;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { ok: false, message: 'Invalid campaign.' };
  const deleted = await luckyDrawRepository.deleteCampaign(campaignId);
  if (!deleted) return { ok: false, message: 'Campaign not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'lucky_draw.campaign.delete', status: 'success', message: 'Lucky Draw campaign deleted', metadata: { campaignId } });
  return { ok: true, message: 'Campaign deleted.' };
}

async function listEntries(filters = {}) {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  return { ok: true, entries: await luckyDrawRepository.listEntries(filters) };
}

async function listDrawParticipants(campaignId, filters = {}) {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  const id = Number(campaignId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Campaign is required.' };
  const participants = await luckyDrawRepository.listEligibleParticipants(id, filters);
  return { ok: true, participants };
}

async function pickRandomWinner(campaignId, count) {
  const access = await requireLuckyDrawAccess('draw');
  if (!access.ok) return access;

  const campaign = await luckyDrawRepository.findCampaignById(campaignId);
  if (!campaign) {
    return { ok: false, message: 'Campaign not found.' };
  }

  const eligibleParticipants = await luckyDrawRepository.listEligibleParticipants(campaignId, {});
  if (eligibleParticipants.length === 0) {
    return { ok: false, message: 'No eligible participants for this campaign.' };
  }

  const winners = [];
  const selectedIndexes = new Set();

  while (winners.length < count && winners.length < eligibleParticipants.length) {
    const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
    if (!selectedIndexes.has(randomIndex)) {
      selectedIndexes.add(randomIndex);
      const winnerEntry = eligibleParticipants[randomIndex];
      const insertedWinner = await luckyDrawRepository.createWinner(campaignId, winnerEntry.id, campaign.prizeDetails, access.profile.id);
      if (insertedWinner) {
        winners.push(insertedWinner);
      }
    }
  }

  if (winners.length > 0) {
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'lucky_draw.winner.pick',
      status: 'success',
      message: `${winners.length} winner(s) picked for campaign ${campaign.campaignName}`,
      metadata: { campaignId, winners: winners.map(w => w.id) }
    });
    return { ok: true, winners, message: `${winners.length} winner(s) selected.` };
  } else {
    return { ok: false, message: 'No new winners could be selected.' };
  }
}

async function verifyCoupon(payload = {}) {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  const couponNo = String(payload.couponNo || payload || '').trim();
  if (!couponNo) return { ok: false, message: 'Coupon number is required.' };
  const before = await luckyDrawRepository.findCoupon(couponNo);
  if (!before) return { ok: false, message: 'Coupon was not found.' };
  if (before.isUsed) {
    return { ok: false, coupon: before, message: 'This coupon has already been verified.' };
  }
  const coupon = await luckyDrawRepository.verifyCoupon(couponNo, access.profile.id);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'lucky_draw.coupon.verify', status: 'success', message: 'Lucky Draw coupon verified', metadata: { couponNo: coupon.couponNo, entryId: coupon.id } });
  return { ok: true, coupon, message: 'Coupon verified successfully.' };
}

async function lookupCoupon(payload = {}) {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  const couponNo = String(payload.couponNo || payload || '').trim();
  if (!couponNo) return { ok: false, message: 'Coupon number is required.' };
  const coupon = await luckyDrawRepository.findCoupon(couponNo);
  if (!coupon) return { ok: false, message: 'Coupon was not found.' };
  return { ok: true, coupon };
}

async function drawWinners(payload = {}) {
  const access = await requireLuckyDrawAccess('draw');
  if (!access.ok) return access;
  const campaignId = Number(payload.campaignId);
  const requestedCount = payload.count ? Number(payload.count) : null;
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { ok: false, message: 'Campaign is required.' };
  if (requestedCount !== null && (!Number.isInteger(requestedCount) || requestedCount <= 0)) return { ok: false, message: 'Winner count is invalid.' };
  const result = await luckyDrawRepository.drawWinners(campaignId, requestedCount, access.profile.id);
  if (!result.campaign) return { ok: false, message: 'Campaign not found.' };
  if (result.winners.length === 0) return { ok: false, message: 'No eligible entries remain for this campaign.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'lucky_draw.winners.draw', status: 'success', message: 'Lucky Draw winners selected', metadata: { campaignId, winners: result.winners.map((winner) => winner.id) } });
  return { ok: true, winners: result.winners, message: `${result.winners.length} winner(s) selected.` };
}

async function listWinners(campaignId) {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  const id = campaignId ? Number(campaignId) : null;
  return { ok: true, winners: await luckyDrawRepository.listWinners(id) };
}

async function reports() {
  const access = await requireLuckyDrawAccess('read');
  if (!access.ok) return access;
  return { ok: true, ...(await luckyDrawRepository.getReports()) };
}

module.exports = {
  createCampaign,
  deleteCampaign,
  drawWinners,
  listCampaigns,
  listEntries,
  listWinners,
  lookupCoupon,
  reports,
  updateCampaign,
  verifyCoupon,
  listDrawParticipants,
  pickRandomWinner
};
