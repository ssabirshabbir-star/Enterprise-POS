const path = require('path');

const { generateManagedPostgresPassword } = require('./postgres-credential.service');
const {
  PROVISIONING_STATES,
  createProvisioningOperation,
  redactProvisioningOperation,
  requiresProvisioningRecovery,
  transitionProvisioningOperation,
} = require('./postgres-provisioning.model');
const repository = require('./postgres-provisioning.repository');
const { buildManagedServicePlan } = require('./postgres-service-manager');
const { getManagedPostgresPolicy } = require('./postgres-version-policy');
const payloadVerifier = require('./postgres-payload-verifier');

function managedInstallRoot(userDataPath) {
  return path.join(userDataPath, 'managed-postgres');
}

async function assessManagedPostgresPreflight({ userDataPath, payloadRoot = null } = {}) {
  const policy = getManagedPostgresPolicy();
  const payload = payloadVerifier.verifyBundledPayload({ payloadRoot });
  const latest = userDataPath ? repository.getLatestProvisioningOperation(userDataPath) : null;
  const pendingRecovery = latest ? requiresProvisioningRecovery(latest.state) : false;
  const plan = userDataPath
    ? buildManagedServicePlan({ installRoot: managedInstallRoot(userDataPath) })
    : null;

  return {
    ok: payload.ok && !pendingRecovery,
    policy,
    payload,
    latestOperation: redactProvisioningOperation(latest),
    pendingRecovery,
    servicePlan: plan
      ? {
          serviceName: plan.serviceName,
          port: plan.port,
          runtimeDir: plan.runtimeDir,
          dataDir: plan.dataDir,
        }
      : null,
    blockers: [
      ...(payload.ok ? [] : [payload.code]),
      ...(pendingRecovery ? ['INSTALLER_POSTGRES_PROVISIONING_RECOVERY_REQUIRED'] : []),
    ],
  };
}

async function startManagedPostgresProvisioning({ userDataPath, payloadRoot = null } = {}) {
  const preflight = await assessManagedPostgresPreflight({ userDataPath, payloadRoot });
  const policy = getManagedPostgresPolicy();
  const target = {
    host: 'localhost',
    port: policy.defaultPort,
    database: 'enterprise_pos',
    username: 'enterprise_pos',
    managed: true,
  };
  const operation = createProvisioningOperation({
    target,
    port: policy.defaultPort,
    dataDirectory: path.join(managedInstallRoot(userDataPath), policy.dataDirectoryName),
    service: { serviceName: policy.serviceName },
    payload: preflight.payload.ok
      ? {
          version: preflight.payload.manifest.version,
          fileName: preflight.payload.manifest.fileName,
          digest: preflight.payload.digest,
        }
      : null,
  });
  repository.saveProvisioningOperation(userDataPath, operation);

  if (!preflight.ok) {
    const failed = transitionProvisioningOperation(
      operation,
      PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
      {
        reason: 'managed_payload_or_recovery_preflight_blocked',
        failureCode: preflight.blockers[0] || 'INSTALLER_POSTGRES_PREFLIGHT_BLOCKED',
        failureStage: 'preflight',
      }
    );
    repository.saveProvisioningOperation(userDataPath, failed);
    return {
      ok: false,
      code: failed.failureCode,
      message: 'Managed PostgreSQL provisioning is blocked before any system mutation.',
      operation: redactProvisioningOperation(failed),
      preflight,
    };
  }

  const credentials = {
    username: target.username,
    password: generateManagedPostgresPassword(),
  };
  const credentialed = transitionProvisioningOperation(
    operation,
    PROVISIONING_STATES.CREDENTIALS_GENERATED,
    {
      reason: 'credentials_generated_without_logging_secret',
    }
  );
  repository.saveProvisioningOperation(userDataPath, credentialed);

  return {
    ok: false,
    code: 'INSTALLER_POSTGRES_PROVISIONING_EXECUTION_NOT_CERTIFIED',
    message:
      'Managed PostgreSQL payload verification passed, but service installation remains disabled until packaged-runtime VM certification is complete.',
    operation: redactProvisioningOperation(credentialed),
    credentialEvidence: { username: credentials.username, passwordGenerated: true },
    preflight,
  };
}

function getManagedPostgresProvisioningStatus({ userDataPath } = {}) {
  const latest = userDataPath ? repository.getLatestProvisioningOperation(userDataPath) : null;
  return {
    ok: true,
    operation: redactProvisioningOperation(latest),
    recoveryRequired: latest ? requiresProvisioningRecovery(latest.state) : false,
  };
}

module.exports = {
  assessManagedPostgresPreflight,
  getManagedPostgresProvisioningStatus,
  managedInstallRoot,
  startManagedPostgresProvisioning,
};
