const MANAGED_POSTGRES_POLICY_VERSION = 'managed-postgres-policy-v1';
const MANAGED_POSTGRES_MAJOR = 17;
const MANAGED_POSTGRES_VERSION = '17.10';
const MINIMUM_EXISTING_MAJOR = 17;
const MAXIMUM_TESTED_MAJOR = 17;

const VERSION_STATUS = Object.freeze({
  SUPPORTED_AND_TESTED: 'SUPPORTED_AND_TESTED',
  SUPPORTED_UNTESTED: 'SUPPORTED_UNTESTED',
  UNSUPPORTED_TOO_OLD: 'UNSUPPORTED_TOO_OLD',
  UNSUPPORTED_TOO_NEW: 'UNSUPPORTED_TOO_NEW',
  VERSION_UNDETERMINED: 'VERSION_UNDETERMINED',
});

function parsePostgresVersion(versionText = '') {
  const text = String(versionText || '');
  const match = text.match(/PostgreSQL\s+(\d+)(?:\.(\d+))?/i) || text.match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return { major: null, minor: null, version: null };
  const major = Number(match[1]);
  const minor = match[2] === undefined ? null : Number(match[2]);
  return {
    major: Number.isInteger(major) ? major : null,
    minor: Number.isInteger(minor) ? minor : null,
    version: minor === null ? String(major) : `${major}.${minor}`,
  };
}

function classifyPostgresVersion(versionText = '') {
  const parsed = parsePostgresVersion(versionText);
  if (!parsed.major) {
    return {
      status: VERSION_STATUS.VERSION_UNDETERMINED,
      supported: false,
      managedInstallAllowed: false,
      existingInstallAllowed: false,
      warning: 'PostgreSQL version could not be determined.',
      ...parsed,
    };
  }

  if (parsed.major < MINIMUM_EXISTING_MAJOR) {
    return {
      status: VERSION_STATUS.UNSUPPORTED_TOO_OLD,
      supported: false,
      managedInstallAllowed: false,
      existingInstallAllowed: false,
      warning: `PostgreSQL ${parsed.major} is below the certified Enterprise POS baseline.`,
      ...parsed,
    };
  }

  if (parsed.major > MAXIMUM_TESTED_MAJOR) {
    return {
      status: VERSION_STATUS.UNSUPPORTED_TOO_NEW,
      supported: false,
      managedInstallAllowed: false,
      existingInstallAllowed: false,
      warning: `PostgreSQL ${parsed.major} has not been certified for this installer release.`,
      ...parsed,
    };
  }

  if (parsed.major === MANAGED_POSTGRES_MAJOR) {
    const exactManaged = parsed.version === MANAGED_POSTGRES_VERSION;
    return {
      status: exactManaged
        ? VERSION_STATUS.SUPPORTED_AND_TESTED
        : VERSION_STATUS.SUPPORTED_UNTESTED,
      supported: true,
      managedInstallAllowed: exactManaged,
      existingInstallAllowed: true,
      warning: exactManaged
        ? null
        : `PostgreSQL ${parsed.version} is supported as an existing runtime but differs from the pinned managed payload ${MANAGED_POSTGRES_VERSION}.`,
      ...parsed,
    };
  }

  return {
    status: VERSION_STATUS.SUPPORTED_UNTESTED,
    supported: false,
    managedInstallAllowed: false,
    existingInstallAllowed: false,
    warning: `PostgreSQL ${parsed.major} is outside the tested Enterprise POS installer policy.`,
    ...parsed,
  };
}

function getManagedPostgresPolicy() {
  return {
    policyVersion: MANAGED_POSTGRES_POLICY_VERSION,
    managedVersion: MANAGED_POSTGRES_VERSION,
    managedMajor: MANAGED_POSTGRES_MAJOR,
    minimumExistingMajor: MINIMUM_EXISTING_MAJOR,
    maximumTestedMajor: MAXIMUM_TESTED_MAJOR,
    architecture: 'win32-x64',
    serviceName: 'EnterprisePOSPostgreSQL',
    defaultPort: 55432,
    dataDirectoryName: 'postgres-data',
    installDirectoryName: 'postgres-runtime',
    payloadFileName: `postgresql-${MANAGED_POSTGRES_VERSION}-server-windows-x64.zip`,
    payloadManifest: 'postgres/manifest.json',
    productionReady: false,
    productionBlocker:
      'A managed PostgreSQL server payload must be supplied, license-audited, checksum-pinned, and physically certified before silent provisioning is enabled.',
  };
}

module.exports = {
  MANAGED_POSTGRES_MAJOR,
  MANAGED_POSTGRES_POLICY_VERSION,
  MANAGED_POSTGRES_VERSION,
  VERSION_STATUS,
  classifyPostgresVersion,
  getManagedPostgresPolicy,
  parsePostgresVersion,
};
