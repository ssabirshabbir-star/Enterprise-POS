const restoreRequestModel = require('./restore-request.model');
const restoreStateMachine = require('./restore-state-machine');

const RESTORE_ENGINE_LAYERS = [
  'controller',
  'service',
  'repository',
  'database',
  'audit',
  'runtime_recovery',
  'rollback',
];

function layerStatus(name, status, responsibility) {
  return {
    name,
    status,
    responsibility,
    restoreExecutionAvailable: false,
  };
}

function assessBoundary({ profile = null } = {}) {
  const authenticated = Boolean(profile?.id);
  const boundaryBlockers = [];
  if (!authenticated)
    boundaryBlockers.push('Authentication is required for Restore Engine assessment.');
  const requestModel = restoreRequestModel.createRestoreExecutionRequest({
    operator: profile,
    correlationId: null,
    assessmentSnapshot: {
      assessmentStatus: 'boundary_assessment_only',
      certificationOutcome: 'NOT CERTIFIED',
      restoreUnavailable: true,
      restoreEligible: false,
      restoreExecutionAvailable: false,
    },
  });
  const stateMachine = restoreStateMachine.assessStateMachine({ request: requestModel });

  const layers = [
    layerStatus(
      'controller',
      'settings_integration_only',
      'Controller may request read-only assessments only; Restore execution is not exposed.'
    ),
    layerStatus(
      'service',
      'restore_engine_shell_available',
      'Restore Engine owns future orchestration and request model boundaries below Settings service.'
    ),
    layerStatus(
      'request_model',
      'immutable_request_model_available',
      'Restore Engine owns immutable request, session, assessment snapshot, and execution context contracts.'
    ),
    layerStatus(
      'state_machine',
      'state_machine_shell_available',
      'Restore Engine owns non-executable lifecycle state validation; destructive transitions remain blocked.'
    ),
    layerStatus(
      'repository',
      'not_enabled_for_execution',
      'Repository restore execution methods are not available through this boundary.'
    ),
    layerStatus(
      'database',
      'no_mutation_allowed',
      'Database writes are prohibited except external audit evidence written by callers.'
    ),
    layerStatus(
      'audit',
      'caller_owned',
      'Audit persistence remains owned by the calling service in this phase.'
    ),
    layerStatus(
      'runtime_recovery',
      'not_implemented',
      'Runtime recovery execution is outside this boundary setup phase.'
    ),
    layerStatus(
      'rollback',
      'not_implemented',
      'Rollback execution is outside this boundary setup phase.'
    ),
  ];

  return {
    ok: authenticated,
    module: 'restore-engine',
    boundaryStatus: authenticated ? 'boundary_ready_non_executable' : 'boundary_blocked',
    readOnly: true,
    assessmentOnly: true,
    internalOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    publicRestoreApiAvailable: false,
    settingsIntegrationOnly: true,
    requestModel,
    requestModelStatus: requestModel.validation.validationStatus,
    stateMachine,
    stateMachineStatus: stateMachine.stateMachineStatus,
    layers,
    layerNames: RESTORE_ENGINE_LAYERS,
    boundaryBlockers,
    message: authenticated
      ? 'Restore Engine internal boundary is available for non-executable assessment only. Restore remains unavailable.'
      : 'Restore Engine internal boundary assessment is blocked until authentication is available.',
  };
}

module.exports = {
  assessBoundary,
};
