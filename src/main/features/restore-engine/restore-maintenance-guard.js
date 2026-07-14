const MAINTENANCE_ERROR_CODE = 'RESTORE_MAINTENANCE_MODE_ACTIVE';

const MUTATING_CHANNELS = Object.freeze(new Set([
  '/users/create',
  '/users/update',
  '/users/status',
  '/users/reset-password',
  '/roles/create',
  '/roles/update',
  '/roles/permissions/save',
  '/products/create',
  '/products/update',
  '/products/delete',
  '/catalog/create',
  '/catalog/update',
  '/catalog/delete',
  '/inventory/adjust',
  '/inventory/import/execution/certified',
  '/inventory/product-image',
  '/suppliers/create',
  '/suppliers/update',
  '/suppliers/delete',
  '/suppliers/payment',
  '/purchases/create',
  '/purchase-requisitions/create',
  '/purchase-requisitions/status',
  '/purchase-requisitions/convert',
  '/purchase-orders/create',
  '/purchase-orders/approve',
  '/purchase-orders/send-to-supplier',
  '/purchase-orders/confirm-supplier',
  '/purchase-orders/cancel',
  '/purchase-orders/receive',
  '/purchase-orders/invoice',
  '/expenses/categories/create',
  '/expenses/create',
  '/expenses/update',
  '/expenses/delete',
  '/pos/customers/create',
  '/pos/sales/complete',
  '/pos/holds/create',
  '/pos/holds/delete',
  '/printing/settings/save',
  '/customers/create',
  '/customers/update',
  '/customers/delete',
  '/customers/payment',
  '/customers/seed',
  '/returns/create',
  '/license/activate',
  '/settings/save',
  '/settings/backups/create',
  '/settings/backups/prepare-restore-safety-backup',
  '/settings/backups/restore-final-confirmation',
  '/sync/run',
  '/sync/retry-failed',
  '/ld-v2/campaigns/create',
  '/ld-v2/campaigns/update',
  '/ld-v2/campaigns/delete',
  '/ld-v2/participants/add',
  '/ld-v2/participants/remove',
  '/ld-v2/draw/run',
]));

function sanitizeRecoveryState(startupRecovery = {}) {
  return {
    operationId: startupRecovery.operationId || null,
    currentState: startupRecovery.currentState || 'IDLE',
    reasonCode: startupRecovery.reasonCode || MAINTENANCE_ERROR_CODE,
    requiresRestart: startupRecovery.requiresRestart === true,
    requiresManualRecovery: startupRecovery.requiresManualRecovery === true,
    allowsRecoveryReads: startupRecovery.allowsRecoveryReads !== false,
  };
}

function maintenanceRejection(startupRecovery = {}) {
  return {
    ok: false,
    code: MAINTENANCE_ERROR_CODE,
    message:
      startupRecovery.message ||
      'Restore maintenance mode is active. Database mutations are blocked until recovery is resolved.',
    recovery: sanitizeRecoveryState(startupRecovery),
  };
}

async function assertMutationAllowed(channel, getMaintenanceStatus) {
  if (!MUTATING_CHANNELS.has(channel)) return { allowed: true };
  const status = await getMaintenanceStatus();
  const startupRecovery = status?.startupRecovery || status || {};
  if (startupRecovery.blocksMutations || startupRecovery.databaseMutationsBlocked) {
    return {
      allowed: false,
      response: maintenanceRejection(startupRecovery),
    };
  }
  return { allowed: true };
}

function createGuardedIpcMain(ipcMain, { getMaintenanceStatus }) {
  return {
    ...ipcMain,
    handle(channel, listener) {
      return ipcMain.handle(channel, async (...args) => {
        const decision = await assertMutationAllowed(channel, getMaintenanceStatus);
        if (!decision.allowed) return decision.response;
        return listener(...args);
      });
    },
  };
}

module.exports = {
  MAINTENANCE_ERROR_CODE,
  MUTATING_CHANNELS,
  assertMutationAllowed,
  createGuardedIpcMain,
  maintenanceRejection,
};
