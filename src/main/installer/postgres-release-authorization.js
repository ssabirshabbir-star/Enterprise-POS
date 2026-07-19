const fs = require('fs');
const path = require('path');

const AUTHORIZATION_STATUS = Object.freeze({
  APPROVED: 'approved',
  PENDING: 'pending',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

const SUPPORTED_SCHEMA_VERSION = 1;
const PRODUCTION_RELEASE_SCOPE = 'enterprise-pos-managed-postgres-production';

function defaultAuthorizationPath({ payloadRoot = null } = {}) {
  const root = payloadRoot || path.join(process.cwd(), 'resources', 'postgres');
  return path.join(root, 'release-authorization.pending.json');
}

function readAuthorizationRecord({ authorizationPath = null, payloadRoot = null } = {}) {
  const resolvedPath = authorizationPath || defaultAuthorizationPath({ payloadRoot });
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_MISSING',
      authorizationPath: resolvedPath,
    };
  }

  try {
    return {
      ok: true,
      authorizationPath: resolvedPath,
      record: JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INVALID',
      authorizationPath: resolvedPath,
      message: error.message,
    };
  }
}

function validateReleaseAuthorization({
  authorizationPath = null,
  payloadRoot = null,
  postgresManifest = null,
  vcRuntimeManifest = null,
  now = new Date(),
  production = true,
} = {}) {
  const loaded = readAuthorizationRecord({ authorizationPath, payloadRoot });
  if (!loaded.ok) return loaded;

  const record = loaded.record || {};
  const required = [
    'schemaVersion',
    'releaseScope',
    'authorizationStatus',
    'redistributionStatus',
    'legalReviewStatus',
    'securityReviewStatus',
    'packagingModel',
    'postgresql',
    'microsoftVcRuntime',
    'technicalCertification',
    'approver',
    'approvalTimestamp',
    'expiresAt',
    'revoked',
  ];
  const missing = required.filter((field) => record[field] === undefined || record[field] === null);
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INCOMPLETE',
      missing,
      authorizationPath: loaded.authorizationPath,
      record,
    };
  }

  if (record.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_SCHEMA_UNSUPPORTED',
      expected: SUPPORTED_SCHEMA_VERSION,
      actual: record.schemaVersion,
      authorizationPath: loaded.authorizationPath,
    };
  }

  if (record.releaseScope !== PRODUCTION_RELEASE_SCOPE) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_SCOPE_MISMATCH',
      expected: PRODUCTION_RELEASE_SCOPE,
      actual: record.releaseScope,
      authorizationPath: loaded.authorizationPath,
    };
  }

  if (record.testOnly === true && production) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_TEST_ONLY',
      authorizationPath: loaded.authorizationPath,
    };
  }

  if (record.revoked === true || record.authorizationStatus === AUTHORIZATION_STATUS.REVOKED) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_REVOKED',
      authorizationPath: loaded.authorizationPath,
    };
  }

  const expiry = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiry)) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_EXPIRY_INVALID',
      authorizationPath: loaded.authorizationPath,
    };
  }
  if (expiry <= now.getTime() || record.authorizationStatus === AUTHORIZATION_STATUS.EXPIRED) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_EXPIRED',
      authorizationPath: loaded.authorizationPath,
      expiresAt: record.expiresAt,
    };
  }

  const blockingStatuses = [
    ['authorizationStatus', AUTHORIZATION_STATUS.APPROVED],
    ['redistributionStatus', 'approved'],
    ['legalReviewStatus', 'approved'],
    ['securityReviewStatus', 'approved'],
  ];
  for (const [field, expected] of blockingStatuses) {
    if (record[field] !== expected) {
      return {
        ok: false,
        code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_NOT_APPROVED',
        field,
        expected,
        actual: record[field],
        authorizationPath: loaded.authorizationPath,
      };
    }
  }

  if (!record.approver || record.approver === 'UNRESOLVED') {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_APPROVER_MISSING',
      authorizationPath: loaded.authorizationPath,
    };
  }

  const pg = record.postgresql || {};
  if (postgresManifest) {
    const comparisons = [
      ['version', postgresManifest.version],
      ['architecture', postgresManifest.architecture],
      ['fileName', postgresManifest.fileName],
      ['sha256', String(postgresManifest.sha256 || '').toLowerCase()],
    ];
    for (const [field, expected] of comparisons) {
      const actual = field === 'sha256' ? String(pg[field] || '').toLowerCase() : pg[field];
      if (actual !== expected) {
        return {
          ok: false,
          code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
          component: 'postgresql',
          field,
          expected,
          actual,
          authorizationPath: loaded.authorizationPath,
        };
      }
    }
  }

  const vc = record.microsoftVcRuntime || {};
  if (vcRuntimeManifest) {
    const comparisons = [
      ['architecture', vcRuntimeManifest.architecture],
      ['filename', vcRuntimeManifest.filename],
      ['sha256', String(vcRuntimeManifest.sha256 || '').toLowerCase()],
    ];
    for (const [field, expected] of comparisons) {
      const actual = field === 'sha256' ? String(vc[field] || '').toLowerCase() : vc[field];
      if (actual !== expected) {
        return {
          ok: false,
          code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
          component: 'microsoft-vc-runtime',
          field,
          expected,
          actual,
          authorizationPath: loaded.authorizationPath,
        };
      }
    }
  }

  return {
    ok: true,
    code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_APPROVED',
    authorizationPath: loaded.authorizationPath,
    record,
  };
}

module.exports = {
  AUTHORIZATION_STATUS,
  PRODUCTION_RELEASE_SCOPE,
  SUPPORTED_SCHEMA_VERSION,
  defaultAuthorizationPath,
  readAuthorizationRecord,
  validateReleaseAuthorization,
};
