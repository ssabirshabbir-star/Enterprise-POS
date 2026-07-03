const restorePlanInputContract = require('./restore-plan-input-contract');
const restorePlanModel = require('./restore-plan.model');

const SKELETON_STATUSES = Object.freeze({
  CREATED: 'created_read_only',
  NOT_CREATED: 'not_created_read_only',
  BLOCKED: 'blocked_read_only',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function reason(code, message) {
  return freeze({
    code,
    message,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function contractUsable(contract) {
  return (
    contract &&
    typeof contract === 'object' &&
    !Array.isArray(contract) &&
    contract.readOnly === true &&
    contract.contractType === 'restore_plan_input_contract_shell'
  );
}

function placeholdersSafe(planShell) {
  return restorePlanModel.PLACEHOLDER_SECTION_NAMES.every((name) => {
    const section = planShell?.[name] || {};
    return (
      section.readOnly === true &&
      section.planned === false &&
      section.executable === false &&
      section.populated === false &&
      Array.isArray(section.items) &&
      section.items.length === 0
    );
  });
}

function createBlockedResult({
  contract = null,
  status = SKELETON_STATUSES.BLOCKED,
  reasons = [],
}) {
  return freeze({
    factoryType: 'restore_plan_skeleton_factory',
    skeletonStatus: status,
    contractStatus: contract?.contractStatus || null,
    planShell: null,
    reasons: orderReasons(reasons),
    readOnly: true,
    executable: false,
    planned: false,
    planGenerated: false,
    planPopulated: false,
    noRestoreExecuted: true,
    noSqlGenerated: true,
    noOrderingAlgorithmExecuted: true,
    noDependencyTraversalExecuted: true,
    noImportSequencingCreated: true,
    noExecutionSequencingCreated: true,
    noTransactionGenerated: true,
    noRollbackGenerated: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    message: 'Restore Plan Skeleton was not created. Restore remains unavailable.',
  });
}

function createRestorePlanSkeleton({ inputContract = null, metadata = {} } = {}) {
  if (!contractUsable(inputContract)) {
    return createBlockedResult({
      contract: inputContract,
      reasons: [
        reason(
          'skeleton.contract.malformed',
          'Restore Plan Input Contract Shell is missing or malformed.'
        ),
      ],
    });
  }

  if (inputContract.contractStatus === restorePlanInputContract.CONTRACT_STATUSES.BLOCKED) {
    return createBlockedResult({
      contract: inputContract,
      reasons: [
        ...inputContract.reasons,
        reason('skeleton.contract.blocked', 'Input contract is blocked.'),
      ],
    });
  }

  if (inputContract.contractStatus !== restorePlanInputContract.CONTRACT_STATUSES.VALID) {
    return createBlockedResult({
      contract: inputContract,
      status: SKELETON_STATUSES.NOT_CREATED,
      reasons: [
        ...inputContract.reasons,
        reason('skeleton.contract.invalid', 'Input contract is not valid for skeleton creation.'),
      ],
    });
  }

  const planShell = restorePlanModel.createRestorePlanShell({
    metadata: {
      ...metadata,
      contractStatus: inputContract.contractStatus,
      skeletonFactory: 'restore_plan_skeleton_factory',
    },
  });
  const validation = restorePlanModel.validateRestorePlanShell(planShell);
  if (!validation.validShell || !placeholdersSafe(planShell)) {
    return createBlockedResult({
      contract: inputContract,
      reasons: [
        reason(
          'skeleton.plan_shell.invalid',
          'Generated Restore Plan shell failed non-executable shell validation.'
        ),
      ],
    });
  }

  return freeze({
    factoryType: 'restore_plan_skeleton_factory',
    skeletonStatus: SKELETON_STATUSES.CREATED,
    contractStatus: inputContract.contractStatus,
    planShell,
    reasons: [],
    readOnly: true,
    executable: false,
    planned: false,
    planGenerated: false,
    planPopulated: false,
    noRestoreExecuted: true,
    noSqlGenerated: true,
    noOrderingAlgorithmExecuted: true,
    noDependencyTraversalExecuted: true,
    noImportSequencingCreated: true,
    noExecutionSequencingCreated: true,
    noTransactionGenerated: true,
    noRollbackGenerated: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    message:
      'Restore Plan Skeleton shell was created read-only. No Restore plan content was generated or populated.',
  });
}

module.exports = {
  SKELETON_STATUSES,
  createRestorePlanSkeleton,
};
