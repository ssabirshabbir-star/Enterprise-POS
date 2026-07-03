const restorePlanModel = require('./restore-plan.model');

const PLAN_SAFETY_CLASSIFICATIONS = Object.freeze({
  SAFE_EMPTY: 'safe_empty_read_only',
  UNSAFE_NON_EMPTY: 'unsafe_non_empty_read_only',
  BLOCKED: 'blocked_read_only',
  MALFORMED: 'malformed_read_only',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function reason(code, message, section = null) {
  return freeze({
    code,
    message,
    section,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sectionItems(section) {
  return Array.isArray(section?.items) ? section.items : [];
}

function sectionPopulated(section) {
  return section?.populated === true || sectionItems(section).length > 0;
}

function summarizeSection(name, section) {
  const malformed = !isObject(section) || !Array.isArray(section.items);
  return freeze({
    section: name,
    present: Boolean(section),
    malformed,
    readOnly: section?.readOnly === true,
    planned: section?.planned === true,
    executable: section?.executable === true,
    populated: sectionPopulated(section),
    itemCount: sectionItems(section).length,
  });
}

function planUnsafeFlags(planShell = {}) {
  const flags = [];
  if (planShell.planned === true) flags.push('planned');
  if (planShell.executable === true) flags.push('executable');
  if (planShell.restoreExecutionAvailable === true) flags.push('restoreExecutionAvailable');
  if (planShell.restoreEligible === true) flags.push('restoreEligible');
  return flags;
}

function classifyRestorePlanSafety(planShell = null) {
  const reasons = [];
  if (!isObject(planShell)) {
    return freeze({
      classifierType: 'restore_plan_safety_classifier',
      classificationStatus: PLAN_SAFETY_CLASSIFICATIONS.MALFORMED,
      reasons: [
        reason('plan_safety.plan_shell.missing', 'Restore Plan shell is missing or malformed.'),
      ],
      populatedSections: [],
      unsafeFlags: [],
      malformedSections: restorePlanModel.PLACEHOLDER_SECTION_NAMES,
      placeholderSummaries: [],
      readOnly: true,
      executable: false,
      planned: false,
      planGenerated: false,
      restoreExecutionAvailable: false,
      noRestoreExecuted: true,
      noDataCommitted: true,
      restoreUnavailable: true,
    });
  }

  if (planShell.modelType !== 'restore_plan_model_shell') {
    reasons.push(
      reason('plan_safety.plan_shell.model_type', 'Restore Plan shell model type is invalid.')
    );
  }
  if (planShell.planVersion !== restorePlanModel.RESTORE_PLAN_VERSION) {
    reasons.push(
      reason('plan_safety.plan_shell.plan_version', 'Restore Plan shell version is invalid.')
    );
  }
  if (planShell.readOnly !== true) {
    reasons.push(
      reason('plan_safety.plan_shell.read_only', 'Restore Plan shell must be read-only.')
    );
  }

  const placeholderSummaries = restorePlanModel.PLACEHOLDER_SECTION_NAMES.map((name) =>
    summarizeSection(name, planShell[name])
  );
  const malformedSections = placeholderSummaries
    .filter((summary) => summary.malformed || summary.readOnly !== true)
    .map((summary) => summary.section);
  const populatedSections = placeholderSummaries
    .filter((summary) => summary.populated)
    .map((summary) => summary.section);
  const sectionUnsafeFlags = placeholderSummaries.flatMap((summary) => {
    const flags = [];
    if (summary.planned) flags.push(`${summary.section}.planned`);
    if (summary.executable) flags.push(`${summary.section}.executable`);
    return flags;
  });
  const unsafeFlags = [...planUnsafeFlags(planShell), ...sectionUnsafeFlags];

  malformedSections.forEach((section) => {
    reasons.push(
      reason(
        `plan_safety.section.${section}.malformed`,
        `${section} placeholder section is missing, malformed, or not read-only.`,
        section
      )
    );
  });
  populatedSections.forEach((section) => {
    reasons.push(
      reason(
        `plan_safety.section.${section}.populated`,
        `${section} placeholder section is populated and is not safe for an empty shell.`,
        section
      )
    );
  });
  unsafeFlags.forEach((flag) => {
    reasons.push(
      reason(
        `plan_safety.flag.${flag}`,
        `${flag} is unsafe for a non-executable Restore Plan shell.`
      )
    );
  });

  let classificationStatus = PLAN_SAFETY_CLASSIFICATIONS.SAFE_EMPTY;
  if (malformedSections.length || planShell.modelType !== 'restore_plan_model_shell') {
    classificationStatus = PLAN_SAFETY_CLASSIFICATIONS.MALFORMED;
  } else if (unsafeFlags.length) {
    classificationStatus = PLAN_SAFETY_CLASSIFICATIONS.BLOCKED;
  } else if (populatedSections.length) {
    classificationStatus = PLAN_SAFETY_CLASSIFICATIONS.UNSAFE_NON_EMPTY;
  }

  return freeze({
    classifierType: 'restore_plan_safety_classifier',
    classificationStatus,
    reasons: orderReasons(reasons),
    populatedSections,
    unsafeFlags,
    malformedSections,
    placeholderSummaries,
    readOnly: true,
    executable: false,
    planned: false,
    planGenerated: false,
    restoreExecutionAvailable: false,
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
    message:
      classificationStatus === PLAN_SAFETY_CLASSIFICATIONS.SAFE_EMPTY
        ? 'Restore Plan shell is safe, empty, read-only, and non-executable.'
        : 'Restore Plan shell is not safe for empty read-only classification.',
  });
}

module.exports = {
  PLAN_SAFETY_CLASSIFICATIONS,
  classifyRestorePlanSafety,
};
