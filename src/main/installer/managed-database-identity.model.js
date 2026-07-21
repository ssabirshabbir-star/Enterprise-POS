const crypto = require('crypto');

const IDENTITY_SCHEMA_VERSION = 1;
const IDENTITY_APP_SETTINGS_KEY = 'managed_database_identity';
const PRODUCT = 'Enterprise POS';
const COMPONENT = 'installer-managed-postgres';

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function createIdentityId(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString('hex')}`;
}

function normalizeIdentity(input = {}) {
  const installationId = String(input.installationId || '').trim();
  const clusterId = String(input.clusterId || '').trim();
  const databaseId = String(input.databaseId || '').trim();
  const databaseName = String(input.databaseName || input.database || '').trim();
  const product = String(input.product || PRODUCT).trim();
  const component = String(input.component || COMPONENT).trim();
  const schemaVersion = Number(input.schemaVersion || IDENTITY_SCHEMA_VERSION);
  const createdAt = input.createdAt || new Date().toISOString();
  const source = String(input.source || 'installer-managed-config').trim();

  return {
    schemaVersion,
    product,
    component,
    installationId,
    clusterId,
    databaseId,
    databaseName,
    source,
    createdAt,
  };
}

function identityDigest(identity = {}) {
  const normalized = normalizeIdentity(identity);
  return sha256(
    stableStringify({
      schemaVersion: normalized.schemaVersion,
      product: normalized.product,
      component: normalized.component,
      installationId: normalized.installationId,
      clusterId: normalized.clusterId,
      databaseId: normalized.databaseId,
      databaseName: normalized.databaseName,
    })
  );
}

function createLocalManagedIdentity(input = {}) {
  const identity = normalizeIdentity({
    ...input,
    clusterId: input.clusterId || createIdentityId('cluster'),
    databaseId: input.databaseId || createIdentityId('database'),
    createdAt: input.createdAt || new Date().toISOString(),
  });
  return {
    ...identity,
    fingerprint: identityDigest(identity),
  };
}

function validateIdentityPair(localIdentity = {}, databaseIdentity = {}) {
  const local = normalizeIdentity(localIdentity);
  const database = normalizeIdentity(databaseIdentity);
  const blockers = [];

  if (local.schemaVersion !== IDENTITY_SCHEMA_VERSION) {
    blockers.push('local_identity.schema_version');
  }
  if (database.schemaVersion !== IDENTITY_SCHEMA_VERSION) {
    blockers.push('database_identity.schema_version');
  }
  if (local.product !== PRODUCT || database.product !== PRODUCT) {
    blockers.push('identity.product');
  }
  if (local.component !== COMPONENT || database.component !== COMPONENT) {
    blockers.push('identity.component');
  }
  ['installationId', 'clusterId', 'databaseId', 'databaseName'].forEach((key) => {
    if (!local[key]) blockers.push(`local_identity.${key}.missing`);
    if (!database[key]) blockers.push(`database_identity.${key}.missing`);
    if (local[key] && database[key] && local[key] !== database[key]) {
      blockers.push(`identity.${key}.mismatch`);
    }
  });

  const localFingerprint = identityDigest(local);
  const databaseFingerprint =
    databaseIdentity.fingerprint ||
    databaseIdentity.identityFingerprint ||
    identityDigest(database);
  if (localFingerprint !== databaseFingerprint) {
    blockers.push('identity.fingerprint.mismatch');
  }

  return {
    ok: blockers.length === 0,
    blockers,
    local: { ...local, fingerprint: localFingerprint },
    database: { ...database, fingerprint: databaseFingerprint },
  };
}

function redactedIdentity(identity = {}) {
  const normalized = normalizeIdentity(identity);
  return {
    schemaVersion: normalized.schemaVersion,
    product: normalized.product,
    component: normalized.component,
    installationIdHash: normalized.installationId ? sha256(normalized.installationId) : null,
    clusterIdHash: normalized.clusterId ? sha256(normalized.clusterId) : null,
    databaseIdHash: normalized.databaseId ? sha256(normalized.databaseId) : null,
    databaseName: normalized.databaseName,
    source: normalized.source,
    fingerprint: identity.fingerprint || identityDigest(normalized),
  };
}

module.exports = {
  COMPONENT,
  IDENTITY_APP_SETTINGS_KEY,
  IDENTITY_SCHEMA_VERSION,
  PRODUCT,
  createLocalManagedIdentity,
  identityDigest,
  normalizeIdentity,
  redactedIdentity,
  validateIdentityPair,
};
