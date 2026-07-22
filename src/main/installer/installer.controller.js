const installerConfigStore = require('./installer-config.store');
const installerDiagnostics = require('./installer-diagnostics.service');
const postgresProvisioning = require('./postgres-provisioning.service');
const postgresProvisioningRepository = require('./postgres-provisioning.repository');
const { isProvisioningTerminal } = require('./postgres-provisioning.model');
const vcRuntimePrerequisite = require('./vc-runtime-prerequisite.service');

function safeError(error) {
  return {
    ok: false,
    code: error?.code || 'INSTALLER_REQUEST_FAILED',
    message: String(error?.message || 'Installer request failed.'),
  };
}

function codeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertManagedConfigurationNotReplaced(userDataPath, payload = {}) {
  const existing = installerConfigStore.loadInstallationConfig(userDataPath);
  if (
    !existing.ok ||
    existing.config?.mode !== installerConfigStore.CONFIG_MODES.INSTALLER_MANAGED
  ) {
    return;
  }
  const incomingMode =
    payload.mode || (payload.managed ? installerConfigStore.CONFIG_MODES.INSTALLER_MANAGED : null);
  const keepsManagedMode = incomingMode === installerConfigStore.CONFIG_MODES.INSTALLER_MANAGED;
  const hasReplacementSecret = typeof payload.password === 'string' && payload.password.length > 0;
  if (keepsManagedMode && hasReplacementSecret) return;
  throw codeError(
    'INSTALLER_MANAGED_CONFIG_REPLACEMENT_BLOCKED',
    'The installer-managed database configuration is already present. Enterprise POS will not replace its secure database credential from the setup screen.'
  );
}

function getActiveManagedProvisioningOperation(userDataPath) {
  if (!userDataPath) return null;
  try {
    const latest = postgresProvisioningRepository.getLatestProvisioningOperation(userDataPath);
    if (!latest || isProvisioningTerminal(latest.state)) return null;
    return latest;
  } catch (_error) {
    return null;
  }
}

function assertNoActiveManagedProvisioningOverride(userDataPath) {
  const active = getActiveManagedProvisioningOperation(userDataPath);
  if (!active) return;
  throw codeError(
    'INSTALLER_MANAGED_PROVISIONING_IN_PROGRESS',
    'The installer-managed database setup is still running. Enterprise POS will not save manual database settings or create a separate database until managed setup has completed or entered recovery.'
  );
}

function registerInstallerRoutes(ipcMain, app) {
  ipcMain.handle('/installer/status', async () => {
    try {
      return await installerDiagnostics.assessInstallerHealth({
        userDataPath: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/config/save', async (_event, payload = {}) => {
    try {
      assertNoActiveManagedProvisioningOverride(app.getPath('userData'));
      assertManagedConfigurationNotReplaced(app.getPath('userData'), payload);
      const result = installerConfigStore.saveInstallationConfig(app.getPath('userData'), payload);
      installerConfigStore.loadAndApplyInstallationConfig(app.getPath('userData'));
      return result;
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/test', async (_event, payload = {}) => {
    try {
      return await installerDiagnostics.detectPostgres(payload || {});
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/create', async (_event, payload = {}) => {
    try {
      assertNoActiveManagedProvisioningOverride(app.getPath('userData'));
      return await installerDiagnostics.createDatabaseIfMissing(payload || {});
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/initialize', async (_event, payload = {}) => {
    try {
      if (payload?.config || payload?.host || payload?.database || payload?.username) {
        assertNoActiveManagedProvisioningOverride(app.getPath('userData'));
      }
      return await installerDiagnostics.initializeConfiguredDatabase({
        userDataPath: app.getPath('userData'),
        config: payload.config || payload,
        admin: payload.admin || null,
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/postgres/preflight', async () => {
    try {
      return await postgresProvisioning.assessManagedPostgresPreflight({
        userDataPath: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/postgres/provision', async () => {
    try {
      return await postgresProvisioning.startManagedPostgresProvisioning({
        userDataPath: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/postgres/provision/status', async () => {
    try {
      return postgresProvisioning.getManagedPostgresProvisioningStatus({
        userDataPath: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/prerequisites/vc-runtime/status', async () => {
    try {
      return vcRuntimePrerequisite.assessVcRuntimePrerequisite();
    } catch (error) {
      return safeError(error);
    }
  });
}

module.exports = {
  registerInstallerRoutes,
};
