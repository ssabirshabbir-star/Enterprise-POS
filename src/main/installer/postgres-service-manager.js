const path = require('path');

const { getManagedPostgresPolicy } = require('./postgres-version-policy');

function normalizeWindowsServiceName(name = getManagedPostgresPolicy().serviceName) {
  const serviceName = String(name || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/.test(serviceName)) {
    throw new Error('Managed PostgreSQL service name is invalid.');
  }
  return serviceName;
}

function assertManagedPathWithinRoot(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Managed PostgreSQL path escapes the Enterprise POS installation root.');
  }
  return candidate;
}

function buildManagedServicePlan(input = {}) {
  const policy = getManagedPostgresPolicy();
  const installRoot = path.resolve(input.installRoot || process.cwd());
  const runtimeDir = assertManagedPathWithinRoot(
    installRoot,
    input.runtimeDir || path.join(installRoot, policy.installDirectoryName)
  );
  const dataDir = assertManagedPathWithinRoot(
    installRoot,
    input.dataDir || path.join(installRoot, policy.dataDirectoryName)
  );
  const binDir = assertManagedPathWithinRoot(
    runtimeDir,
    input.binDir || path.join(runtimeDir, 'bin')
  );
  const postgresExe = assertManagedPathWithinRoot(binDir, path.join(binDir, 'postgres.exe'));
  const serviceName = normalizeWindowsServiceName(input.serviceName || policy.serviceName);
  const port = Number(input.port || policy.defaultPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Managed PostgreSQL port is invalid.');
  }

  return {
    serviceName,
    port,
    installRoot,
    runtimeDir,
    dataDir,
    binDir,
    postgresExe,
    initdbExe: path.join(binDir, 'initdb.exe'),
    pgCtlExe: path.join(binDir, 'pg_ctl.exe'),
    psqlExe: path.join(binDir, 'psql.exe'),
    serviceCommand: {
      command: 'sc.exe',
      args: [
        'create',
        serviceName,
        `binPath= "${postgresExe}" -D "${dataDir}" -p ${port}`,
        'start=',
        'auto',
        'DisplayName=',
        'Enterprise POS PostgreSQL',
      ],
    },
    startCommand: {
      command: 'sc.exe',
      args: ['start', serviceName],
    },
    stopCommand: {
      command: 'sc.exe',
      args: ['stop', serviceName],
    },
    deleteCommand: {
      command: 'sc.exe',
      args: ['delete', serviceName],
    },
  };
}

module.exports = {
  assertManagedPathWithinRoot,
  buildManagedServicePlan,
  normalizeWindowsServiceName,
};
