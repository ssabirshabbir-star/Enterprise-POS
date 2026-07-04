const evidenceModel = require('./restore-certification-evidence.model');

const COLLECTOR_VERSION = 'restore-certification-evidence-collector-shell-v1';

const COLLECTION_STATUSES = Object.freeze({
  COLLECTED: 'evidence_collected_read_only',
  INCOMPLETE: 'evidence_collection_incomplete_read_only',
  BLOCKED: 'evidence_collection_blocked_read_only',
});

const REFERENCE_ALIASES = Object.freeze({
  requestReference: ['requestReference', 'restoreRequest', 'request'],
  validationReference: ['validationReference', 'validationResult', 'validation'],
  inventoryReference: ['inventoryReference', 'inventorySnapshot', 'inventory'],
  compatibilityReference: ['compatibilityReference', 'compatibilityAssessment', 'compatibility'],
  dependencyReference: ['dependencyReference', 'dependencyAssessment', 'dependency'],
  impactReference: ['impactReference', 'impactAssessment', 'impact'],
  readinessReference: ['readinessReference', 'readinessDecision', 'readiness'],
  planReference: ['planReference', 'restorePlan', 'plan'],
  planSafetyReference: ['planSafetyReference', 'planSafetyClassification', 'planSafety'],
  guardReference: ['guardReference', 'executionGuard', 'guard'],
  guardEvaluationReference: ['guardEvaluationReference', 'guardEvaluation'],
  executionLockReference: ['executionLockReference', 'executionLockAssertion', 'executionLock'],
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function safetyFlags() {
  return freeze({
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    activationAvailable: false,
    executionAvailable: false,
    publicApiAvailable: false,
    uiActivationAvailable: false,
    businessMutationAvailable: false,
  });
}

function reason(code, message, source = null) {
  return freeze({
    code,
    message,
    source,
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    executionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function firstPresent(source, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias) && source[alias] != null) {
      return source[alias];
    }
  }
  return null;
}

function normalizeReferences(source = {}) {
  return Object.fromEntries(
    evidenceModel.REQUIRED_EVIDENCE_KEYS.map((key) => [
      key,
      firstPresent(source, REFERENCE_ALIASES[key] || [key]),
    ])
  );
}

function determineCollectionStatus(evidence) {
  if (evidence.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.BLOCKED) {
    return COLLECTION_STATUSES.BLOCKED;
  }
  if (evidence.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.INCOMPLETE) {
    return COLLECTION_STATUSES.INCOMPLETE;
  }
  return COLLECTION_STATUSES.COLLECTED;
}

function collectCertificationEvidence(source = {}, options = {}) {
  const normalizedReferences = normalizeReferences(source);
  const evidence = evidenceModel.createCertificationEvidence({
    metadata: {
      ...(clone(options.metadata) || {}),
      collectorVersion: COLLECTOR_VERSION,
    },
    ...normalizedReferences,
  });
  const validation = evidenceModel.validateCertificationEvidence(evidence);
  const collectionStatus = determineCollectionStatus(evidence);
  const collectionReasons = [
    reason(
      'collector.evidence_model.created',
      'Certification evidence model was created from read-only references.'
    ),
  ];

  if (evidence.missingEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'collector.evidence_model.missing_references',
        'One or more required evidence references are missing.',
        'missingEvidence'
      )
    );
  }
  if (evidence.malformedEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'collector.evidence_model.malformed_references',
        'One or more evidence references are malformed.',
        'malformedEvidence'
      )
    );
  }
  if (evidence.blockedEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'collector.evidence_model.blocked_references',
        'One or more evidence references are blocked or unsafe.',
        'blockedEvidence'
      )
    );
  }

  return freeze({
    collectorType: 'restore_certification_evidence_collector_shell',
    collectorVersion: COLLECTOR_VERSION,
    collectionStatus,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    activationAvailable: false,
    executionAvailable: false,
    publicApiAvailable: false,
    uiActivationAvailable: false,
    businessMutationAvailable: false,
    noCertificationDecision: true,
    noApprovalDecision: true,
    noAuthorizationDecision: true,
    noActivationDecision: true,
    noUnlockDecision: true,
    noRestoreExecuted: true,
    noExecutionPrepared: true,
    noExecutionSimulated: true,
    noSqlGenerated: true,
    noTransactionExecuted: true,
    noRollbackGenerated: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    normalizedReferences: freeze(
      Object.fromEntries(
        Object.entries(normalizedReferences).map(([key, value]) => [key, Boolean(value)])
      )
    ),
    certificationEvidence: evidence,
    evidenceValidation: validation,
    collectionReasons: orderReasons(collectionReasons),
    missingEvidence: [...evidence.missingEvidence],
    malformedEvidence: [...evidence.malformedEvidence],
    blockedEvidence: [...evidence.blockedEvidence],
    unsafeFlags: [...evidence.unsafeFlags],
    requiredFutureCertifications: [...evidence.requiredFutureCertifications],
    safetyFlags: safetyFlags(),
    message:
      collectionStatus === COLLECTION_STATUSES.COLLECTED
        ? 'Certification evidence was collected read-only. Restore remains unavailable.'
        : 'Certification evidence collection is incomplete or blocked. Restore remains unavailable.',
  });
}

module.exports = {
  COLLECTOR_VERSION,
  COLLECTION_STATUSES,
  REFERENCE_ALIASES,
  collectCertificationEvidence,
};
