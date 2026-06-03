const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const syncRepository = require('./sync.repository');

const SYNC_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Warehouse']);

async function requireSyncAccess(write = false) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  if (!SYNC_ROLES.has(profileResult.profile.role)) return { ok: false, message: 'You do not have permission to use sync.' };
  if (write && !['Admin', 'Manager'].includes(profileResult.profile.role)) {
    return { ok: false, message: 'Only Admin or Manager can run manual sync.' };
  }
  return { ok: true, profile: profileResult.profile };
}

async function getStatus() {
  const access = await requireSyncAccess(false);
  if (!access.ok) return access;
  const summary = await syncRepository.queueSummary();
  return {
    ok: true,
    terminal: {
      id: summary.terminal.id,
      code: summary.terminal.terminal_code,
      name: summary.terminal.terminal_name,
      lastSeenAt: summary.terminal.last_seen_at
    },
    counts: {
      pending: Number(summary.counts.pending || 0),
      syncing: Number(summary.counts.syncing || 0),
      synced: Number(summary.counts.synced || 0),
      failed: Number(summary.counts.failed || 0)
    }
  };
}

async function listQueue() {
  const access = await requireSyncAccess(false);
  if (!access.ok) return access;
  const [status, queue, logs] = await Promise.all([
    getStatus(),
    syncRepository.listQueue(150),
    syncRepository.listSyncLogs(80)
  ]);
  return { ok: true, status: status.ok ? status : null, queue, logs };
}

async function runSync() {
  const access = await requireSyncAccess(true);
  if (!access.ok) return access;
  const result = await syncRepository.runLocalSync(access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'sync.run',
    status: 'success',
    message: 'Manual sync foundation executed',
    metadata: { processedCount: result.processedCount, terminalCode: result.terminal.terminal_code }
  });
  return { ok: true, message: `Sync completed. ${result.processedCount} queued operations processed.`, result };
}

async function retryFailed() {
  const access = await requireSyncAccess(true);
  if (!access.ok) return access;
  const count = await syncRepository.retryFailed();
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'sync.retry', status: 'success', message: 'Failed sync operations requeued', metadata: { count } });
  return { ok: true, message: `${count} failed operation(s) requeued.`, count };
}

module.exports = {
  getStatus,
  listQueue,
  retryFailed,
  runSync
};
