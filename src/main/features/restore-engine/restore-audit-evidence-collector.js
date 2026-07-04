const auditEvidenceModel = require('./restore-audit-evidence.model');

const AUDIT_COLLECTOR_VERSION = 'restore-audit-evidence-collector-shell-v1';

const AUDIT_COLLECTION_STATUSES = Object.freeze({
  COLLECTED: 'audit_evidence_collected_read_only',
  INCOMPLETE: 'audit_evidence_collection_incomplete_read_only',
  BLOCKED: 'audit_evidence_collection_blocked_read_only',
});

const AUDIT_REFERENCE_ALIASES = Object.freeze({
  requestAuditReference: ['requestAuditReference', 'requestAudit', 'requestReference'],
  validationAuditReference: ['validationAuditReference', 'validationAudit', 'validationReference'],
  certificationEvidenceReference: [
    'certificationEvidenceReference',
    'certificationEvidence',
    'evidenceReference',
  ],
  certificationGateReference: ['certificationGateReference', 'certificationGate', 'gateReference'],
  executionLockReference: ['executionLockReference', 'executionLock', 'lockReference'],
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

function normalizeAuditReferences(source = {}) {
  return Object.fromEntries(
    auditEvidenceModel.REQUIRED_AUDIT_KEYS.map((key) => [
      key,
      firstPresent(source, AUDIT_REFERENCE_ALIASES[key] || [key]),
    ])
  );
}

function determineCollectionStatus(auditEvidence) {
  if (auditEvidence.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.BLOCKED) {
    return AUDIT_COLLECTION_STATUSES.BLOCKED;
  }
  if (auditEvidence.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.INCOMPLETE) {
    return AUDIT_COLLECTION_STATUSES.INCOMPLETE;
  }
  return AUDIT_COLLECTION_STATUSES.COLLECTED;
}

function collectAuditEvidence(source = {}, options = {}) {
  const normalizedReferences = normalizeAuditReferences(source);
  const auditEvidence = auditEvidenceModel.createAuditEvidence({
    metadata: {
      ...(clone(options.metadata) || {}),
      auditCollectorVersion: AUDIT_COLLECTOR_VERSION,
    },
    ...normalizedReferences,
  });
  const auditValidation = auditEvidenceModel.validateAuditEvidence(auditEvidence);
  const collectionStatus = determineCollectionStatus(auditEvidence);
  const collectionReasons = [
    reason(
      'audit_collector.audit_evidence.created',
      'Restore audit evidence model was created from read-only references.'
    ),
  ];

  if (auditEvidence.missingAuditEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'audit_collector.audit_evidence.missing_references',
        'One or more required audit evidence references are missing.',
        'missingAuditEvidence'
      )
    );
  }
  if (auditEvidence.malformedAuditEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'audit_collector.audit_evidence.malformed_references',
        'One or more audit evidence references are malformed.',
        'malformedAuditEvidence'
      )
    );
  }
  if (auditEvidence.blockedAuditEvidence.length > 0) {
    collectionReasons.push(
      reason(
        'audit_collector.audit_evidence.blocked_references',
        'One or more audit evidence references are blocked or unsafe.',
        'blockedAuditEvidence'
      )
    );
  }

  return freeze({
    auditCollectorType: 'restore_audit_evidence_collector_shell',
    auditCollectorVersion: AUDIT_COLLECTOR_VERSION,
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
    normalizedAuditReferences: freeze(
      Object.fromEntries(
        Object.entries(normalizedReferences).map(([key, value]) => [key, Boolean(value)])
      )
    ),
    auditEvidence,
    auditValidation,
    collectionReasons: orderReasons(collectionReasons),
    missingAuditEvidence: [...auditEvidence.missingAuditEvidence],
    malformedAuditEvidence: [...auditEvidence.malformedAuditEvidence],
    blockedAuditEvidence: [...auditEvidence.blockedAuditEvidence],
    unsafeFlags: [...auditEvidence.unsafeFlags],
    safetyFlags: safetyFlags(),
    message:
      collectionStatus === AUDIT_COLLECTION_STATUSES.COLLECTED
        ? 'Restore audit evidence was collected read-only. Restore remains unavailable.'
        : 'Restore audit evidence collection is incomplete or blocked. Restore remains unavailable.',
  });
}

module.exports = {
  AUDIT_COLLECTOR_VERSION,
  AUDIT_COLLECTION_STATUSES,
  AUDIT_REFERENCE_ALIASES,
  collectAuditEvidence,
};
