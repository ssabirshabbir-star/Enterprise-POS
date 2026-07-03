const RESTORE_PLAN_VERSION = 'restore-plan-shell-v1';

const RESTORE_PLAN_STATUSES = Object.freeze({
  SHELL_ONLY: 'restore_plan_shell_only',
  BLOCKED: 'restore_plan_blocked',
});

const PLACEHOLDER_SECTION_NAMES = Object.freeze([
  'phases',
  'operations',
  'executionGroups',
  'orderingMetadata',
  'rollbackMetadata',
  'verificationMetadata',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function reference(name, value = null) {
  return freeze({
    referenceType: name,
    referenced: Boolean(value),
    readOnly: true,
    planned: false,
    executable: false,
    populated: Boolean(value),
    source: clone(value),
  });
}

function placeholder(name) {
  return freeze({
    section: name,
    readOnly: true,
    planned: false,
    executable: false,
    populated: false,
    items: [],
    message: `${name} is reserved for a future certified Restore planner and is not populated.`,
  });
}

function placeholders() {
  return PLACEHOLDER_SECTION_NAMES.reduce((sections, name) => {
    sections[name] = placeholder(name);
    return sections;
  }, {});
}

function createRestorePlanShell({
  metadata = {},
  requestReference = null,
  validationReference = null,
  inventoryReference = null,
  compatibilityReference = null,
  dependencyReference = null,
  impactReference = null,
  readinessReference = null,
} = {}) {
  const createdAt = new Date().toISOString();
  const placeholderSections = placeholders();

  return freeze({
    modelType: 'restore_plan_model_shell',
    planStatus: RESTORE_PLAN_STATUSES.SHELL_ONLY,
    planVersion: RESTORE_PLAN_VERSION,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    planned: false,
    executable: false,
    populated: false,
    noRestoreExecuted: true,
    noRestorePlanGenerated: true,
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
    metadata: freeze({
      createdAt,
      ...clone(metadata),
      readOnly: true,
      planned: false,
      executable: false,
      populated: Boolean(metadata && Object.keys(metadata).length),
    }),
    requestReference: reference('requestReference', requestReference),
    validationReference: reference('validationReference', validationReference),
    inventoryReference: reference('inventoryReference', inventoryReference),
    compatibilityReference: reference('compatibilityReference', compatibilityReference),
    dependencyReference: reference('dependencyReference', dependencyReference),
    impactReference: reference('impactReference', impactReference),
    readinessReference: reference('readinessReference', readinessReference),
    ...placeholderSections,
    message:
      'Restore Plan Model Shell is structural only. No Restore planning, execution, ordering, rollback, SQL, or runtime recovery is available.',
  });
}

function validateRestorePlanShell(plan = {}) {
  const failures = [];
  if (plan.modelType !== 'restore_plan_model_shell') failures.push('Model type is invalid.');
  if (plan.planVersion !== RESTORE_PLAN_VERSION) failures.push('Plan version is invalid.');
  if (plan.readOnly !== true) failures.push('Plan shell must be read-only.');
  if (plan.planned !== false) failures.push('Plan shell must not be planned.');
  if (plan.executable !== false) failures.push('Plan shell must not be executable.');
  if (plan.populated !== false) failures.push('Plan shell must not be populated.');

  PLACEHOLDER_SECTION_NAMES.forEach((name) => {
    const section = plan[name] || {};
    if (section.readOnly !== true) failures.push(`${name} must be read-only.`);
    if (section.planned !== false) failures.push(`${name} must not be planned.`);
    if (section.executable !== false) failures.push(`${name} must not be executable.`);
    if (section.populated !== false) failures.push(`${name} must not be populated.`);
  });

  return freeze({
    validationType: 'restore_plan_model_shell_validation',
    validationStatus: failures.length
      ? RESTORE_PLAN_STATUSES.BLOCKED
      : RESTORE_PLAN_STATUSES.SHELL_ONLY,
    validShell: failures.length === 0,
    failures,
    readOnly: true,
    planned: false,
    executable: false,
    populated: false,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

module.exports = {
  RESTORE_PLAN_VERSION,
  RESTORE_PLAN_STATUSES,
  PLACEHOLDER_SECTION_NAMES,
  createRestorePlanShell,
  validateRestorePlanShell,
};
