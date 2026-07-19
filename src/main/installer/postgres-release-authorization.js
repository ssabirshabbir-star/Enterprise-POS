const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const AUTHORIZATION_STATUS = Object.freeze({
  APPROVED: 'approved',
  DISABLED: 'disabled',
  PENDING: 'pending',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

const SUPPORTED_SCHEMA_VERSION = 1;
const PRODUCTION_RELEASE_SCOPE = 'enterprise-pos-managed-postgres-production';
const APPROVED_PROVISIONING_STRATEGY = 'extract-and-provision-dedicated-cluster';

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createPayloadManifestHash(manifest = {}) {
  return sha256Hex(stableStringify(manifest || {}));
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function parseDottedVersion(version) {
  const parts = String(version || '')
    .split('.')
    .map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }
  return parts;
}

function compareDottedVersions(left, right) {
  const a = parseDottedVersion(left);
  const b = parseDottedVersion(right);
  if (!a || !b) return null;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function isVersionInRange(version, range) {
  if (!version || !range || typeof range !== 'object') return false;
  const min = compareDottedVersions(version, range.minVersion);
  const max = compareDottedVersions(version, range.maxVersion);
  return min !== null && max !== null && min >= 0 && max <= 0;
}

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
    'releaseApprovalStatus',
    'packagingModel',
    'postgresql',
    'microsoftVcRuntime',
    'technicalCertification',
    'approvedPayloadManifestSha256',
    'approvedProvisioningStrategy',
    'approvedInstallerVersionRange',
    'approver',
    'approvalTimestamp',
    'expiresAt',
    'revoked',
  ];
  const missing = required.filter((field) => record[field] === undefined || record[field] === null);
  if (!record.technicalCertification?.evidenceHash) {
    missing.push('technicalCertification.evidenceHash');
  }
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

  if (record.authorizationStatus === AUTHORIZATION_STATUS.DISABLED) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_DISABLED',
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
    ['releaseApprovalStatus', 'approved'],
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

  if (!isSha256(record.technicalCertification?.evidenceHash)) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_TECHNICAL_EVIDENCE_INVALID',
      authorizationPath: loaded.authorizationPath,
    };
  }

  if (record.approvedProvisioningStrategy !== APPROVED_PROVISIONING_STRATEGY) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_STRATEGY_MISMATCH',
      expected: APPROVED_PROVISIONING_STRATEGY,
      actual: record.approvedProvisioningStrategy,
      authorizationPath: loaded.authorizationPath,
    };
  }

  const approvedInstallerVersionRange = record.approvedInstallerVersionRange || {};
  if (!approvedInstallerVersionRange.minVersion || !approvedInstallerVersionRange.maxVersion) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INSTALLER_RANGE_INVALID',
      authorizationPath: loaded.authorizationPath,
    };
  }
  if (
    record.installerVersion &&
    !isVersionInRange(record.installerVersion, approvedInstallerVersionRange)
  ) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INSTALLER_VERSION_MISMATCH',
      installerVersion: record.installerVersion,
      approvedInstallerVersionRange,
      authorizationPath: loaded.authorizationPath,
    };
  }

  const pg = record.postgresql || {};
  if (postgresManifest) {
    const expectedManifestHash = createPayloadManifestHash(postgresManifest);
    const actualManifestHash = String(record.approvedPayloadManifestSha256 || '').toLowerCase();
    if (actualManifestHash !== expectedManifestHash) {
      return {
        ok: false,
        code: 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_MANIFEST_MISMATCH',
        component: 'postgresql',
        field: 'approvedPayloadManifestSha256',
        expected: expectedManifestHash,
        actual: actualManifestHash,
        authorizationPath: loaded.authorizationPath,
      };
    }

    const comparisons = [
      ['version', postgresManifest.version],
      ['architecture', postgresManifest.architecture],
      ['fileName', postgresManifest.fileName],
      ['sha256', String(postgresManifest.sha256 || '').toLowerCase()],
      ['installMethod', postgresManifest.installMethod || APPROVED_PROVISIONING_STRATEGY],
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
  APPROVED_PROVISIONING_STRATEGY,
  AUTHORIZATION_STATUS,
  PRODUCTION_RELEASE_SCOPE,
  SUPPORTED_SCHEMA_VERSION,
  createPayloadManifestHash,
  defaultAuthorizationPath,
  readAuthorizationRecord,
  validateReleaseAuthorization,
};
