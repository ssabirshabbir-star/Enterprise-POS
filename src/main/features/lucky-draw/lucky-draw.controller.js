const luckyDrawService = require('./lucky-draw.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Lucky Draw request failed. Please try again.' };
}

function registerLuckyDrawRoutes(ipcMain) {
  ipcMain.handle('/lucky-draw/campaigns/list', async () => {
    try { return await luckyDrawService.listCampaigns(); } catch (error) { return safeError(error, 'Lucky Draw campaign list error:'); }
  });
  ipcMain.handle('/lucky-draw/campaigns/create', async (_event, payload) => {
    try { return await luckyDrawService.createCampaign(payload || {}); } catch (error) { return safeError(error, 'Lucky Draw campaign create error:'); }
  });
  ipcMain.handle('/lucky-draw/campaigns/update', async (_event, { id, payload }) => {
    try { return await luckyDrawService.updateCampaign(id, payload || {}); } catch (error) { return safeError(error, 'Lucky Draw campaign update error:'); }
  });
  ipcMain.handle('/lucky-draw/campaigns/delete', async (_event, id) => {
    try { return await luckyDrawService.deleteCampaign(id); } catch (error) { return safeError(error, 'Lucky Draw campaign delete error:'); }
  });
  ipcMain.handle('/lucky-draw/entries/list', async (_event, filters) => {
    try { return await luckyDrawService.listEntries(filters || {}); } catch (error) { return safeError(error, 'Lucky Draw entries list error:'); }
  });
  ipcMain.handle('/lucky-draw/coupons/lookup', async (_event, payload) => {
    try { return await luckyDrawService.lookupCoupon(payload || {}); } catch (error) { return safeError(error, 'Lucky Draw coupon lookup error:'); }
  });
  ipcMain.handle('/lucky-draw/coupons/verify', async (_event, payload) => {
    try { return await luckyDrawService.verifyCoupon(payload || {}); } catch (error) { return safeError(error, 'Lucky Draw coupon verify error:'); }
  });
  ipcMain.handle('/lucky-draw/winners/draw', async (_event, payload) => {
    try { return await luckyDrawService.drawWinners(payload || {}); } catch (error) { return safeError(error, 'Lucky Draw winner draw error:'); }
  });
  ipcMain.handle('/lucky-draw/winners/list', async (_event, campaignId) => {
    try { return await luckyDrawService.listWinners(campaignId); } catch (error) { return safeError(error, 'Lucky Draw winner list error:'); }
  });
  ipcMain.handle('/lucky-draw/reports', async () => {
    try { return await luckyDrawService.reports(); } catch (error) { return safeError(error, 'Lucky Draw reports error:'); }
  });
}

module.exports = { registerLuckyDrawRoutes };
