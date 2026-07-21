const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const { generateManagedPostgresPassword } = require('./postgres-credential.service');
const {
  PROVISIONING_STATES,
  assessProvisioningReadiness,
  classifyProvisioningRecovery,
  createProvisioningLogEntry,
  createProvisioningOperation,
  getProvisioningProgressContract,
  getProvisioningRollbackPlan,
  redactProvisioningOperation,
  requiresProvisioningRecovery,
  transitionProvisioningOperation,
} = require('./postgres-provisioning.model');
const repository = require('./postgres-provisioning.repository');
const configStore = require('./installer-config.store');
const settingsRepository = require('../features/settings/settings.repository');
const { closeDatabase } = require('../database/connection');
const { initializeDatabase } = require('../database/schema');
const { stagePostgresArchive } = require('./postgres-archive-stager');
const { buildManagedServicePlan } = require('./postgres-service-manager');
const { getManagedPostgresPolicy } = require('./postgres-version-policy');
const payloadVerifier = require('./postgres-payload-verifier');
const releaseAuthorization = require('./postgres-release-authorization');
const {
  buildInitdbLaunchDiagnostics,
  postgresCommandOptions,
} = require('./postgres-runtime-diagnostics');
const vcRuntimePrerequisite = require('./vc-runtime-prerequisite.service');

const CERTIFICATION_ENV = 'ENTERPRISE_POS_MANAGED_POSTGRES_CERTIFICATION';
const CERTIFICATION_TOKEN_ENV = 'ENTERPRISE_POS_MANAGED_POSTGRES_CERTIFICATION_TOKEN';
const CERTIFICATION_TOKEN = 'managed-postgres-certification';
const CERTIFICATION_DB_PREFIX = 'epos_cert_';
const CERTIFICATION_ROOT_FRAGMENT = 'managed-postgres-cert';
const DEPLOYABLE_PACKAGING_CLASSIFICATION = 'deployable-offline-installer';
const SERVER_READY_TIMEOUT_MS = 30000;
const COMMAND_TIMEOUT_MS = 60000;
const INITDB_COMMAND_TIMEOUT_MS = 180000;

function managedInstallRoot(userDataPath) {
  return path.join(userDataPath, 'managed-postgres');
}

function codeError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function isInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assertCertificationExecutionGate(options = {}) {
  const certification = options.certification || {};
  if (
    process.env[CERTIFICATION_ENV] !== '1' ||
    process.env[CERTIFICATION_TOKEN_ENV] !== CERTIFICATION_TOKEN ||
    certification.enabled !== true ||
    certification.token !== CERTIFICATION_TOKEN
  ) {
    throw codeError(
      'INSTALLER_POSTGRES_CERTIFICATION_GATE_REQUIRED',
      'Managed PostgreSQL provisioning execution is available only in guarded certification mode.'
    );
  }

  const certificationRoot = path.resolve(String(certification.root || ''));
  if (
    !certificationRoot ||
    !certificationRoot.toLowerCase().includes(CERTIFICATION_ROOT_FRAGMENT)
  ) {
    throw codeError(
      'INSTALLER_POSTGRES_CERTIFICATION_ROOT_REJECTED',
      'Certification root must be an explicit managed PostgreSQL certification directory.'
    );
  }
  const repoRoot = path.resolve(process.cwd());
  for (const name of ['src', 'resources', 'tests', 'docs', 'release']) {
    if (
      certificationRoot === path.join(repoRoot, name) ||
      isInside(path.join(repoRoot, name), certificationRoot)
    ) {
      throw codeError(
        'INSTALLER_POSTGRES_CERTIFICATION_ROOT_REJECTED',
        'Certification root must not target tracked source or packaged output directories.'
      );
    }
  }

  const database = String(certification.database || `${CERTIFICATION_DB_PREFIX}${Date.now()}`);
  if (
    !database.startsWith(CERTIFICATION_DB_PREFIX) ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)
  ) {
    throw codeError(
      'INSTALLER_POSTGRES_CERTIFICATION_DATABASE_REJECTED',
      'Certification database name must use the approved disposable prefix.'
    );
  }

  const archivePath = path.resolve(String(certification.archivePath || ''));
  const policy = getManagedPostgresPolicy();
  if (path.basename(archivePath) !== policy.payloadFileName) {
    throw codeError(
      'INSTALLER_POSTGRES_CERTIFICATION_ARCHIVE_REJECTED',
      'Certification archive filename does not match the pinned policy.',
      { expected: policy.payloadFileName, actual: path.basename(archivePath) }
    );
  }

  return {
    archivePath,
    certificationRoot,
    database,
    port: certification.port || 0,
    safeStorage: certification.safeStorage,
  };
}

function defaultReleaseGovernanceRoot({ resourcesPath = process.resourcesPath } = {}) {
  if (resourcesPath && fs.existsSync(path.join(resourcesPath, 'release-governance'))) {
    return path.join(resourcesPath, 'release-governance');
  }
  if (process.execPath) {
    const executableResources = path.join(
      path.dirname(process.execPath),
      'resources',
      'release-governance'
    );
    if (fs.existsSync(executableResources)) return executableResources;
  }
  return path.join(process.cwd(), 'resources', 'release');
}

function readDeployablePackagingEvidence(options = {}) {
  if (options.deploymentEvidence) return { ok: true, evidence: options.deploymentEvidence };
  const evidencePath =
    options.deploymentEvidencePath ||
    path.join(defaultReleaseGovernanceRoot(options), 'offline-packaging-evidence.generated.json');
  if (!fs.existsSync(evidencePath)) {
    return {
      ok: false,
      code: 'INSTALLER_DEPLOYABLE_PACKAGING_EVIDENCE_MISSING',
      evidencePath,
    };
  }
  try {
    return {
      ok: true,
      evidencePath,
      evidence: JSON.parse(fs.readFileSync(evidencePath, 'utf8')),
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INSTALLER_DEPLOYABLE_PACKAGING_EVIDENCE_INVALID',
      evidencePath,
      message: error.message,
    };
  }
}

function assessDeployableProvisioningAuthorization({ payload, options = {} } = {}) {
  const evidenceResult = readDeployablePackagingEvidence(options);
  if (!evidenceResult.ok) return { ok: false, ...evidenceResult };
  const evidence = evidenceResult.evidence || {};
  if (
    evidence.classification !== DEPLOYABLE_PACKAGING_CLASSIFICATION ||
    evidence.productionProvisioningEnabled !== true
  ) {
    return {
      ok: false,
      code: 'INSTALLER_DEPLOYABLE_PROVISIONING_NOT_ENABLED',
      evidencePath: evidenceResult.evidencePath,
      classification: evidence.classification,
      productionProvisioningEnabled: evidence.productionProvisioningEnabled,
    };
  }
  if (payload?.ok && evidence.postgresql?.sha256 !== payload.digest) {
    return {
      ok: false,
      code: 'INSTALLER_DEPLOYABLE_POSTGRES_EVIDENCE_HASH_MISMATCH',
      evidencePath: evidenceResult.evidencePath,
      expected: evidence.postgresql?.sha256,
      actual: payload.digest,
    };
  }
  return {
    ok: true,
    code: 'INSTALLER_DEPLOYABLE_PROVISIONING_AUTHORIZED',
    evidencePath: evidenceResult.evidencePath,
    classification: evidence.classification,
    releaseAuthorizationStatus: evidence.releaseAuthorizationStatus,
  };
}

function assertNoActiveProvisioningOperation(userDataPath) {
  const latest = userDataPath ? repository.getLatestProvisioningOperation(userDataPath) : null;
  if (!latest) return null;
  if (latest.state === PROVISIONING_STATES.COMPLETED) return latest;
  if (requiresProvisioningRecovery(latest.state)) {
    throw codeError(
      'INSTALLER_POSTGRES_PROVISIONING_RECOVERY_REQUIRED',
      'A previous managed PostgreSQL operation requires recovery before certification execution.',
      { operationId: latest.operationId, state: latest.state }
    );
  }
  if (
    ![
      PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
      PROVISIONING_STATES.FAILED,
      PROVISIONING_STATES.ROLLED_BACK,
    ].includes(latest.state)
  ) {
    throw codeError(
      'INSTALLER_POSTGRES_PROVISIONING_OPERATION_ACTIVE',
      'A managed PostgreSQL operation already exists and is not safe to replace.',
      { operationId: latest.operationId, state: latest.state }
    );
  }
  return null;
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function assertManagedCertificationPaths(root, paths) {
  for (const candidate of Object.values(paths)) {
    if (candidate && path.resolve(candidate) !== path.resolve(root) && !isInside(root, candidate)) {
      throw codeError(
        'INSTALLER_POSTGRES_CERTIFICATION_PATH_REJECTED',
        'Managed PostgreSQL certification path escapes the approved root.',
        { candidate }
      );
    }
  }
}

function runCommand(command, args, options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs || COMMAND_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let pid = null;
    let processCreated = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PGCONNECT_TIMEOUT: '5', ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    pid = child.pid || null;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        command,
        args,
        exitCode: null,
        signal: 'SIGKILL',
        stdout,
        stderr,
        pid,
        processCreated,
        elapsedMs: Date.now() - started,
        error: { code: 'INSTALLER_POSTGRES_COMMAND_TIMEOUT', message: 'Command timed out.' },
      });
    }, timeoutMs);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        pid,
        processCreated,
        elapsedMs: Date.now() - started,
        error: { code: error.code || 'INSTALLER_POSTGRES_COMMAND_FAILED', message: error.message },
      });
    });
    child.on('spawn', () => {
      processCreated = true;
      pid = child.pid || pid;
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode,
        signal,
        stdout,
        stderr,
        pid,
        processCreated,
        elapsedMs: Date.now() - started,
      });
    });
  });
}

function commandOk(result) {
  return result && result.exitCode === 0 && !result.error;
}

function startServerProcess(command, args) {
  const started = Date.now();
  const commandOptions = postgresCommandOptions(command);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: commandOptions.cwd,
      env: commandOptions.env,
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
    });
    child.on('error', (error) => {
      resolve({
        command,
        args,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        elapsedMs: Date.now() - started,
        error: { code: error.code || 'INSTALLER_POSTGRES_COMMAND_FAILED', message: error.message },
      });
    });
    child.on('spawn', () => {
      child.unref();
      resolve({
        command,
        args,
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        elapsedMs: Date.now() - started,
      });
    });
  });
}

function executablePaths(runtimeRoot) {
  const bin = path.join(runtimeRoot, 'pgsql', 'bin');
  return {
    postgres: path.join(bin, 'postgres.exe'),
    initdb: path.join(bin, 'initdb.exe'),
    pgCtl: path.join(bin, 'pg_ctl.exe'),
    psql: path.join(bin, 'psql.exe'),
    createdb: path.join(bin, 'createdb.exe'),
  };
}

function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

function createPasswordFile(root, password) {
  const passwordFile = path.join(root, 'postgres-password.txt');
  fs.writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
  return passwordFile;
}

async function waitForServer(paths, port, password, timeoutMs, logCommand) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await runCommand(
      paths.psql,
      [
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-Atc',
        'SELECT 1',
      ],
      postgresCommandOptions(paths.psql, { env: { PGPASSWORD: password } })
    );
    await logCommand('READINESS_PROBE', last, commandOk(last) ? 'success' : 'retry');
    if (commandOk(last) && String(last.stdout).trim() === '1') return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw codeError(
    'INSTALLER_POSTGRES_SERVER_START_TIMEOUT',
    'Managed PostgreSQL did not become ready.',
    {
      lastExitCode: last?.exitCode,
    }
  );
}

async function queryPostgres(config, sql, database = 'postgres') {
  const pool = new Pool({
    host: '127.0.0.1',
    port: config.port,
    database,
    user: config.user,
    password: config.password,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return await pool.query(sql);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function stopServer(paths, dataDir, logCommand) {
  const result = await runCommand(
    paths.pgCtl,
    ['-D', dataDir, '-m', 'fast', '-w', '-t', '30', 'stop'],
    postgresCommandOptions(paths.pgCtl)
  );
  await logCommand('STOP_SERVER', result, commandOk(result) ? 'success' : 'failed');
  return result;
}

async function waitForApplicationDatabase(config, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const result = await queryPostgres(
        {
          port: config.port,
          user: config.username || config.user,
          password: config.password,
        },
        'SELECT 1',
        config.database
      );
      if (String(result.rows?.[0]?.['?column?'] || result.rows?.[0]?.['1'] || '1') === '1') {
        return { ok: true };
      }
      return { ok: true };
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw codeError(
    last?.code || 'INSTALLER_POSTGRES_APPLICATION_DATABASE_TIMEOUT',
    'Managed PostgreSQL application database did not become ready.',
    { lastCode: last?.code }
  );
}

function writePostgresConfig(dataDir, port) {
  fs.appendFileSync(
    path.join(dataDir, 'postgresql.conf'),
    [
      '',
      '# Enterprise POS managed PostgreSQL certification configuration',
      "listen_addresses = '127.0.0.1'",
      `port = ${port}`,
      "timezone = 'UTC'",
      "log_min_messages = 'warning'",
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(dataDir, 'pg_hba.conf'),
    [
      '# Enterprise POS managed PostgreSQL certification authentication',
      'local all all scram-sha-256',
      'host all all 127.0.0.1/32 scram-sha-256',
      'host all all ::1/128 reject',
      '',
    ].join('\n')
  );
}

async function transitionAndSave(userDataPath, operation, nextState, metadata = {}) {
  const next = transitionProvisioningOperation(operation, nextState, metadata);
  repository.saveProvisioningOperation(userDataPath, next);
  return next;
}

async function executeCertificationProvisioning(options = {}) {
  const gate = assertCertificationExecutionGate(options);
  const { userDataPath } = options;
  if (!userDataPath) {
    throw codeError('INSTALLER_POSTGRES_USER_DATA_REQUIRED', 'User data path is required.');
  }
  const existing = assertNoActiveProvisioningOperation(userDataPath);
  if (existing?.state === PROVISIONING_STATES.COMPLETED) {
    return {
      ok: true,
      code: 'INSTALLER_POSTGRES_PROVISIONING_ALREADY_COMPLETED',
      operation: redactProvisioningOperation(existing),
      resumed: true,
    };
  }

  const policy = getManagedPostgresPolicy();
  const certificationRoot = ensureDirectory(gate.certificationRoot);
  const pendingRoot = path.join(certificationRoot, 'pending');
  const runtimeRoot = path.join(certificationRoot, policy.installDirectoryName);
  const dataDir = path.join(certificationRoot, policy.dataDirectoryName);
  const logsDir = ensureDirectory(path.join(certificationRoot, 'logs'));
  assertManagedCertificationPaths(certificationRoot, {
    pendingRoot,
    runtimeRoot,
    dataDir,
    logsDir,
  });
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_DATA_DIRECTORY_NOT_DISPOSABLE',
      'Certification data directory already contains data.'
    );
  }

  const port = gate.port || (await getFreeLocalPort());
  const target = {
    host: '127.0.0.1',
    port,
    database: gate.database,
    username: 'enterprise_pos_app',
    managed: true,
    certificationOnly: true,
  };
  let operation = createProvisioningOperation({
    target,
    port,
    dataDirectory: dataDir,
    service: { runtimeModel: 'certification-child-process', serviceName: null },
  });
  repository.saveProvisioningOperation(userDataPath, operation);

  const logCommand = async (step, result, status = null) => {
    recordInstallerLog(userDataPath, {
      operationId: operation.operationId,
      step,
      status: status || (commandOk(result) ? 'success' : 'failed'),
      durationMs: result?.elapsedMs,
      exitCode: result?.exitCode,
      command: result ? { executable: result.command, args: result.args } : null,
      message: `${step} ${commandOk(result) ? 'completed' : 'did not complete successfully'}.`,
      error: result?.error?.message || result?.stderr || null,
    });
  };

  let paths = null;
  try {
    const prerequisiteRoot =
      options.certification?.vcRuntimeRoot || vcRuntimePrerequisite.defaultPrerequisiteRoot();
    const prerequisiteStatus = vcRuntimePrerequisite.assessVcRuntimePrerequisite({
      root: prerequisiteRoot,
    });
    recordInstallerLog(userDataPath, {
      operationId: operation.operationId,
      step: 'VC_RUNTIME_CHECK',
      status: prerequisiteStatus.detection.compatible ? 'success' : 'blocked',
      message: prerequisiteStatus.detection.compatible
        ? 'Microsoft Visual C++ Runtime prerequisite is available.'
        : 'Microsoft Visual C++ Runtime prerequisite is not available.',
      error: prerequisiteStatus.detection.compatible ? null : prerequisiteStatus.code,
    });
    if (!prerequisiteStatus.detection.compatible) {
      if (options.certification?.installVcRuntime === true) {
        const installResult = await vcRuntimePrerequisite.installVcRuntimePrerequisite({
          root: prerequisiteRoot,
          logPath: path.join(logsDir, 'vc-redist-install.log'),
        });
        recordInstallerLog(userDataPath, {
          operationId: operation.operationId,
          step: 'VC_RUNTIME_INSTALL',
          status: installResult.ok ? 'success' : 'blocked',
          durationMs: installResult.install?.elapsedMs,
          exitCode: installResult.install?.exitCode,
          command: installResult.install
            ? {
                executable: installResult.install.command,
                args: installResult.install.args,
              }
            : null,
          message: installResult.ok
            ? 'Microsoft Visual C++ Runtime prerequisite was installed and verified.'
            : 'Microsoft Visual C++ Runtime prerequisite installation did not produce verified readiness.',
          error: installResult.ok ? null : installResult.code,
        });
        if (!installResult.ok) {
          throw codeError(
            installResult.code || 'VC_RUNTIME_INSTALL_FAILED',
            'Microsoft Visual C++ Runtime prerequisite is required before PostgreSQL initialization.',
            { prerequisite: installResult }
          );
        }
      } else {
        throw codeError(
          prerequisiteStatus.code || 'VC_RUNTIME_NOT_INSTALLED',
          'Microsoft Visual C++ Runtime prerequisite is required before PostgreSQL initialization.',
          { prerequisite: prerequisiteStatus }
        );
      }
    }

    const payloadRoot = options.certification?.payloadRoot
      ? path.resolve(String(options.certification.payloadRoot))
      : path.dirname(gate.archivePath);
    const payloadStatus = payloadVerifier.verifyBundledPayload({
      payloadRoot,
      archivePath: gate.archivePath,
      allowRedistributionNotCertified: true,
    });
    if (!payloadStatus.ok) {
      throw codeError(
        payloadStatus.code || 'INSTALLER_POSTGRES_PAYLOAD_NOT_READY',
        'PostgreSQL payload is not ready for managed provisioning.',
        { payload: payloadStatus }
      );
    }

    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.ARCHIVE_VERIFIED,
      {
        archivePath: gate.archivePath,
        payloadRoot,
        payloadDigest: payloadStatus.digest,
      }
    );

    const staged = await stagePostgresArchive({
      archivePath: gate.archivePath,
      stagingRoot: pendingRoot,
      manifestRoot: payloadRoot,
    });
    operation = {
      ...operation,
      payload: {
        version: policy.managedVersion,
        fileName: policy.payloadFileName,
        digest: staged.digest,
      },
    };
    repository.saveProvisioningOperation(userDataPath, operation);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.renameSync(pendingRoot, runtimeRoot);
    paths = executablePaths(runtimeRoot);
    for (const exe of Object.values(paths)) {
      if (!fs.existsSync(exe)) {
        throw codeError(
          'INSTALLER_POSTGRES_STAGED_EXECUTABLE_MISSING',
          'Staged executable is missing.',
          {
            executable: exe,
          }
        );
      }
    }
    if (
      fs.existsSync(path.join(runtimeRoot, 'pgsql', 'pgAdmin 4')) ||
      fs.existsSync(path.join(runtimeRoot, 'pgsql', 'StackBuilder'))
    ) {
      throw codeError(
        'INSTALLER_POSTGRES_FORBIDDEN_COMPONENT_STAGED',
        'Forbidden PostgreSQL tooling was staged.'
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.PAYLOAD_STAGED,
      {
        reason: 'payload_promoted_to_certification_runtime',
      }
    );

    const adminPassword = generateManagedPostgresPassword();
    const appPassword = generateManagedPostgresPassword();
    const passwordFile = createPasswordFile(certificationRoot, adminPassword);
    ensureDirectory(dataDir);
    const initdbArgs = [
      '-D',
      dataDir,
      '-U',
      'postgres',
      '-A',
      'scram-sha-256',
      '--pwfile',
      passwordFile,
      '-E',
      'UTF8',
    ];
    const initdbOptions = {
      ...postgresCommandOptions(paths.initdb),
      timeoutMs: INITDB_COMMAND_TIMEOUT_MS,
    };
    const beforeInitdbDiagnostics = buildInitdbLaunchDiagnostics({
      command: paths.initdb,
      args: initdbArgs,
      cwd: initdbOptions.cwd,
      env: initdbOptions.env,
      dataDir,
      passwordFile,
      runtimeRoot,
    });
    const initdbDiagnosticsPath = path.join(logsDir, 'initdb-launch-diagnostics.json');
    fs.writeFileSync(
      initdbDiagnosticsPath,
      `${JSON.stringify({ before: beforeInitdbDiagnostics }, null, 2)}\n`,
      { mode: 0o600 }
    );
    recordInstallerLog(userDataPath, {
      operationId: operation.operationId,
      step: 'INITDB_LAUNCH_DIAGNOSTIC',
      status: 'recorded',
      message: `initdb launch diagnostics recorded at ${initdbDiagnosticsPath}`,
      command: {
        executable: paths.initdb,
        args: beforeInitdbDiagnostics.args,
      },
    });
    const initdb = await runCommand(paths.initdb, initdbArgs, initdbOptions);
    const afterInitdbDiagnostics = buildInitdbLaunchDiagnostics({
      command: paths.initdb,
      args: initdbArgs,
      cwd: initdbOptions.cwd,
      env: initdbOptions.env,
      dataDir,
      passwordFile,
      runtimeRoot,
      result: initdb,
    });
    fs.writeFileSync(
      initdbDiagnosticsPath,
      `${JSON.stringify({ before: beforeInitdbDiagnostics, after: afterInitdbDiagnostics }, null, 2)}\n`,
      { mode: 0o600 }
    );
    await logCommand('INITDB', initdb);
    fs.rmSync(passwordFile, { force: true });
    if (!commandOk(initdb)) {
      throw codeError('INSTALLER_POSTGRES_INITDB_FAILED', 'initdb failed.', {
        exitCode: initdb.exitCode,
      });
    }
    writePostgresConfig(dataDir, port);
    if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
      throw codeError('INSTALLER_POSTGRES_DATA_DIRECTORY_INVALID', 'PG_VERSION was not created.');
    }
    const pgVersion = fs.readFileSync(path.join(dataDir, 'PG_VERSION'), 'utf8').trim();
    if (pgVersion !== String(policy.managedMajor)) {
      throw codeError(
        'INSTALLER_POSTGRES_PG_VERSION_MISMATCH',
        'Initialized cluster version is not certified.',
        {
          pgVersion,
        }
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
      {
        reason: 'cluster_initialized_and_verified',
      }
    );

    const serverLog = path.join(logsDir, 'postgres-server.log');
    const startArgs = [
      '-D',
      dataDir,
      '-l',
      serverLog,
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      '-w',
      '-t',
      '30',
      'start',
    ];
    const start = await startServerProcess(paths.pgCtl, startArgs);
    await logCommand('START_SERVER', start);
    if (!commandOk(start)) {
      throw codeError(
        'INSTALLER_POSTGRES_SERVER_START_FAILED',
        'Managed PostgreSQL server failed to start.',
        {
          exitCode: start.exitCode,
        }
      );
    }
    await waitForServer(paths, port, adminPassword, SERVER_READY_TIMEOUT_MS, logCommand);
    const serverVersion = await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      'SELECT version() AS version'
    );
    if (!String(serverVersion.rows[0]?.version || '').includes('PostgreSQL 17.10')) {
      throw codeError(
        'INSTALLER_POSTGRES_SERVER_VERSION_MISMATCH',
        'Managed server version is not PostgreSQL 17.10.'
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.SERVER_STARTED,
      {
        reason: 'server_started_and_version_verified',
      }
    );

    await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'enterprise_pos_app') THEN
          CREATE ROLE enterprise_pos_app LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}';
        ELSE
          ALTER ROLE enterprise_pos_app WITH LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}';
        END IF;
      END $$;`
    );
    const quotedDb = `"${gate.database.replace(/"/g, '""')}"`;
    const exists = await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      `SELECT 1 FROM pg_database WHERE datname = '${gate.database.replace(/'/g, "''")}' LIMIT 1`
    );
    if (exists.rowCount === 0) {
      await queryPostgres(
        { port, user: 'postgres', password: adminPassword },
        `CREATE DATABASE ${quotedDb} OWNER enterprise_pos_app ENCODING 'UTF8' TEMPLATE template0`
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.DATABASE_CREATED,
      {
        reason: 'application_database_and_role_verified',
      }
    );

    const saved = configStore.saveInstallationConfig(
      userDataPath,
      {
        host: '127.0.0.1',
        port,
        database: gate.database,
        username: 'enterprise_pos_app',
        password: appPassword,
        sslMode: 'disable',
        mode: 'certification-managed-postgres',
        certificationOnly: true,
        installerVersion: '1.0.0',
        managedPostgres: {
          runtimeRoot,
          dataDir,
          port,
          operationId: operation.operationId,
          payloadFileName: policy.payloadFileName,
          payloadDigest: staged.digest,
        },
      },
      { safeStorage: gate.safeStorage }
    );
    if (!saved.ok) {
      throw codeError(
        'INSTALLER_POSTGRES_CONFIG_SAVE_FAILED',
        'Managed database configuration was not saved.'
      );
    }
    const applied = configStore.loadAndApplyInstallationConfig(userDataPath, {
      safeStorage: gate.safeStorage,
    });
    if (!applied.ok) {
      throw codeError(
        applied.code || 'INSTALLER_POSTGRES_CONFIG_READBACK_FAILED',
        'Managed database configuration could not be read back after it was saved.'
      );
    }
    await queryPostgres(
      {
        port: Number(process.env.PGPORT),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      },
      'SELECT 1',
      process.env.PGDATABASE
    );
    await closeDatabase();
    await initializeDatabase();
    const schemaCheck = await queryPostgres(
      { port, user: 'enterprise_pos_app', password: appPassword },
      "SELECT to_regclass('public.users') AS users_table, to_regclass('public.products') AS products_table",
      gate.database
    );
    if (!schemaCheck.rows[0]?.users_table || !schemaCheck.rows[0]?.products_table) {
      throw codeError(
        'INSTALLER_POSTGRES_SCHEMA_NOT_READY',
        'Application schema readiness check failed.'
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
      {
        reason: 'application_schema_initialized_and_verified',
      }
    );

    operation = await transitionAndSave(userDataPath, operation, PROVISIONING_STATES.COMPLETED, {
      reason: 'certification_provisioning_completed',
    });
    await closeDatabase();
    await stopServer(paths, dataDir, logCommand);
    return {
      ok: true,
      code: 'INSTALLER_POSTGRES_CERTIFICATION_PROVISIONING_COMPLETED',
      operation: redactProvisioningOperation(operation),
      runtime: {
        runtimeRoot,
        dataDir,
        logsDir,
        port,
        database: gate.database,
      },
      serverVersion: serverVersion.rows[0]?.version,
    };
  } catch (error) {
    await closeDatabase().catch(() => {});
    if (paths && fs.existsSync(dataDir)) {
      await stopServer(paths, dataDir, logCommand).catch(() => {});
    }
    let failed = operation;
    if (operation && operation.state !== PROVISIONING_STATES.COMPLETED) {
      const nextState = [
        PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
        PROVISIONING_STATES.SERVER_STARTED,
        PROVISIONING_STATES.DATABASE_CREATED,
        PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
      ].includes(operation.state)
        ? PROVISIONING_STATES.ROLLBACK_REQUIRED
        : PROVISIONING_STATES.FAILED;
      failed = transitionProvisioningOperation(operation, nextState, {
        reason: 'certification_provisioning_failed',
        failureCode: error.code || 'INSTALLER_POSTGRES_CERTIFICATION_FAILED',
        failureStage: operation.state,
      });
      repository.saveProvisioningOperation(userDataPath, failed);
    }
    recordInstallerLog(userDataPath, {
      operationId: failed?.operationId || operation?.operationId,
      step: 'CERTIFICATION_FAILED',
      status: 'failed',
      message: 'Managed PostgreSQL certification provisioning failed.',
      error: error.message,
    });
    return {
      ok: false,
      code: error.code || 'INSTALLER_POSTGRES_CERTIFICATION_FAILED',
      message: error.message,
      operation: redactProvisioningOperation(failed),
    };
  }
}

async function executeInstallerDeploymentProvisioning(options = {}) {
  const { userDataPath, payloadRoot = null } = options;
  if (!userDataPath) {
    throw codeError('INSTALLER_POSTGRES_USER_DATA_REQUIRED', 'User data path is required.');
  }

  const existingConfig = configStore.loadInstallationConfig(userDataPath);
  const existingOperation = assertNoActiveProvisioningOperation(userDataPath);
  if (existingConfig.ok && existingOperation?.state === PROVISIONING_STATES.COMPLETED) {
    return {
      ok: true,
      code: 'INSTALLER_POSTGRES_PROVISIONING_ALREADY_COMPLETED',
      operation: redactProvisioningOperation(existingOperation),
      resumed: true,
      config: existingConfig.config,
    };
  }

  const policy = getManagedPostgresPolicy();
  const root = ensureDirectory(managedInstallRoot(userDataPath));
  const pendingRoot = path.join(root, 'pending');
  const runtimeRoot = path.join(root, policy.installDirectoryName);
  const dataDir = path.join(root, policy.dataDirectoryName);
  const logsDir = ensureDirectory(path.join(root, 'logs'));
  assertManagedCertificationPaths(root, { pendingRoot, runtimeRoot, dataDir, logsDir });
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_EXISTING_DATA_WITHOUT_COMPLETED_CONFIG',
      'Managed PostgreSQL data already exists but no completed reusable configuration was found.'
    );
  }

  const payloadStatus = payloadVerifier.verifyBundledPayload({
    payloadRoot,
    allowRedistributionNotCertified: true,
  });
  if (!payloadStatus.ok) {
    throw codeError(
      payloadStatus.code || 'INSTALLER_POSTGRES_PAYLOAD_NOT_READY',
      'PostgreSQL payload is not ready for managed provisioning.',
      { payload: payloadStatus }
    );
  }
  const deployment = assessDeployableProvisioningAuthorization({
    payload: payloadStatus,
    options,
  });
  if (!deployment.ok) {
    throw codeError(
      deployment.code || 'INSTALLER_DEPLOYABLE_PROVISIONING_NOT_AUTHORIZED',
      'This installer is not authorized to run managed PostgreSQL provisioning.',
      { deployment }
    );
  }

  const port = options.port || policy.defaultPort;
  const target = {
    host: '127.0.0.1',
    port,
    database: 'enterprise_pos',
    username: 'enterprise_pos_app',
    managed: true,
  };
  let operation = createProvisioningOperation({
    target,
    port,
    dataDirectory: dataDir,
    service: { runtimeModel: 'managed-local-process', serviceName: null },
    payload: {
      version: payloadStatus.manifest.version,
      fileName: payloadStatus.manifest.fileName,
      digest: payloadStatus.digest,
    },
  });
  repository.saveProvisioningOperation(userDataPath, operation);

  const logCommand = async (step, result, status = null) => {
    recordInstallerLog(userDataPath, {
      operationId: operation.operationId,
      step,
      status: status || (commandOk(result) ? 'success' : 'failed'),
      durationMs: result?.elapsedMs,
      exitCode: result?.exitCode,
      command: result ? { executable: result.command, args: result.args } : null,
      message: `${step} ${commandOk(result) ? 'completed' : 'did not complete successfully'}.`,
      error: result?.error?.message || result?.stderr || null,
    });
  };

  let paths = null;
  try {
    const prerequisiteRoot = vcRuntimePrerequisite.defaultPrerequisiteRoot();
    const prerequisite = await vcRuntimePrerequisite.installVcRuntimePrerequisite({
      root: prerequisiteRoot,
      logPath: path.join(logsDir, 'vc-runtime-install.log'),
    });
    recordInstallerLog(userDataPath, {
      operationId: operation.operationId,
      step: 'VC_RUNTIME_PREREQUISITE',
      status: prerequisite.ok ? 'success' : 'failed',
      message: prerequisite.ok
        ? 'Microsoft Visual C++ Runtime prerequisite is ready.'
        : 'Microsoft Visual C++ Runtime prerequisite failed before PostgreSQL initialization.',
      error: prerequisite.ok ? null : prerequisite.code,
    });
    if (!prerequisite.ok) {
      throw codeError(
        prerequisite.code || 'VC_RUNTIME_INSTALL_FAILED',
        'Microsoft Visual C++ Runtime prerequisite is required before PostgreSQL initialization.',
        { prerequisite }
      );
    }

    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.ARCHIVE_VERIFIED,
      {
        archivePath: payloadStatus.payloadPath,
        payloadRoot: path.dirname(payloadStatus.manifestPath),
        payloadDigest: payloadStatus.digest,
        deploymentEvidencePath: deployment.evidencePath,
      }
    );

    const staged = await stagePostgresArchive({
      archivePath: payloadStatus.payloadPath,
      stagingRoot: pendingRoot,
      manifestRoot: path.dirname(payloadStatus.manifestPath),
    });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.renameSync(pendingRoot, runtimeRoot);
    paths = executablePaths(runtimeRoot);
    for (const exe of Object.values(paths)) {
      if (!fs.existsSync(exe)) {
        throw codeError(
          'INSTALLER_POSTGRES_STAGED_EXECUTABLE_MISSING',
          'Staged executable is missing.',
          {
            executable: exe,
          }
        );
      }
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.PAYLOAD_STAGED,
      { reason: 'payload_promoted_to_managed_runtime' }
    );

    const adminPassword = generateManagedPostgresPassword();
    const appPassword = generateManagedPostgresPassword();
    const passwordFile = createPasswordFile(root, adminPassword);
    ensureDirectory(dataDir);
    const initdbArgs = [
      '-D',
      dataDir,
      '-U',
      'postgres',
      '-A',
      'scram-sha-256',
      '--pwfile',
      passwordFile,
      '-E',
      'UTF8',
    ];
    const initdb = await runCommand(paths.initdb, initdbArgs, {
      ...postgresCommandOptions(paths.initdb),
      timeoutMs: INITDB_COMMAND_TIMEOUT_MS,
    });
    await logCommand('INITDB', initdb);
    fs.rmSync(passwordFile, { force: true });
    if (!commandOk(initdb)) {
      throw codeError('INSTALLER_POSTGRES_INITDB_FAILED', 'initdb failed.', {
        exitCode: initdb.exitCode,
      });
    }
    writePostgresConfig(dataDir, port);
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
      { reason: 'cluster_initialized_and_verified' }
    );

    const serverLog = path.join(logsDir, 'postgres-server.log');
    const start = await startServerProcess(paths.pgCtl, [
      '-D',
      dataDir,
      '-l',
      serverLog,
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      '-w',
      '-t',
      '30',
      'start',
    ]);
    await logCommand('START_SERVER', start);
    if (!commandOk(start)) {
      throw codeError(
        'INSTALLER_POSTGRES_SERVER_START_FAILED',
        'Managed PostgreSQL server failed to start.',
        {
          exitCode: start.exitCode,
        }
      );
    }
    await waitForServer(paths, port, adminPassword, SERVER_READY_TIMEOUT_MS, logCommand);
    const serverVersion = await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      'SELECT version() AS version'
    );
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.SERVER_STARTED,
      { reason: 'server_started_and_version_verified' }
    );

    await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'enterprise_pos_app') THEN
          CREATE ROLE enterprise_pos_app LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}';
        ELSE
          ALTER ROLE enterprise_pos_app WITH LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}';
        END IF;
      END $$;`
    );
    const exists = await queryPostgres(
      { port, user: 'postgres', password: adminPassword },
      "SELECT 1 FROM pg_database WHERE datname = 'enterprise_pos' LIMIT 1"
    );
    if (exists.rowCount === 0) {
      await queryPostgres(
        { port, user: 'postgres', password: adminPassword },
        'CREATE DATABASE "enterprise_pos" OWNER enterprise_pos_app ENCODING \'UTF8\' TEMPLATE template0'
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.DATABASE_CREATED,
      { reason: 'application_database_and_role_verified' }
    );

    const saved = configStore.saveInstallationConfig(userDataPath, {
      host: '127.0.0.1',
      port,
      database: 'enterprise_pos',
      username: 'enterprise_pos_app',
      password: appPassword,
      sslMode: 'disable',
      managed: true,
      mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
      installerVersion: '1.0.0',
      managedPostgres: {
        runtimeRoot,
        dataDir,
        port,
        operationId: operation.operationId,
        payloadFileName: policy.payloadFileName,
        payloadDigest: staged.digest,
        runtimeModel: 'managed-local-process',
      },
    });
    if (!saved.ok) {
      throw codeError(
        'INSTALLER_POSTGRES_CONFIG_SAVE_FAILED',
        'Managed database configuration was not saved.'
      );
    }
    const applied = configStore.loadAndApplyInstallationConfig(userDataPath);
    if (!applied.ok) {
      throw codeError(
        applied.code || 'INSTALLER_POSTGRES_CONFIG_READBACK_FAILED',
        'Managed database configuration could not be read back after it was saved.'
      );
    }
    await waitForApplicationDatabase({
      port,
      database: 'enterprise_pos',
      username: 'enterprise_pos_app',
      password: appPassword,
    });
    await closeDatabase();
    await initializeDatabase();
    const managedIdentityConfig = configStore.loadInstallationConfig(userDataPath);
    if (!managedIdentityConfig.ok || !managedIdentityConfig.config?.managedIdentity) {
      throw codeError(
        'INSTALLER_POSTGRES_MANAGED_IDENTITY_MISSING',
        'Managed database identity was not persisted.'
      );
    }
    const identity = await settingsRepository.ensureManagedDatabaseIdentity(
      managedIdentityConfig.config.managedIdentity
    );
    if (!identity.ok) {
      throw codeError(
        identity.code || 'INSTALLER_POSTGRES_MANAGED_IDENTITY_FAILED',
        identity.message || 'Managed database identity could not be verified.'
      );
    }
    operation = await transitionAndSave(
      userDataPath,
      operation,
      PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
      {
        reason: 'application_schema_initialized_and_verified',
        managedDatabaseIdentity: identity.identity,
      }
    );
    operation = await transitionAndSave(userDataPath, operation, PROVISIONING_STATES.COMPLETED, {
      reason: 'deployable_installer_provisioning_completed',
    });
    await closeDatabase();
    return {
      ok: true,
      code: 'INSTALLER_POSTGRES_DEPLOYABLE_PROVISIONING_COMPLETED',
      operation: redactProvisioningOperation(operation),
      runtime: { runtimeRoot, dataDir, logsDir, port, database: 'enterprise_pos' },
      serverVersion: serverVersion.rows[0]?.version,
    };
  } catch (error) {
    await closeDatabase().catch(() => {});
    if (paths && fs.existsSync(dataDir)) {
      await stopServer(paths, dataDir, logCommand).catch(() => {});
    }
    let failed = operation;
    if (operation && operation.state !== PROVISIONING_STATES.COMPLETED) {
      failed = transitionProvisioningOperation(operation, PROVISIONING_STATES.FAILED, {
        reason: 'deployable_installer_provisioning_failed',
        failureCode: error.code || 'INSTALLER_POSTGRES_DEPLOYABLE_FAILED',
        failureStage: operation.state,
      });
      repository.saveProvisioningOperation(userDataPath, failed);
    }
    return {
      ok: false,
      code: error.code || 'INSTALLER_POSTGRES_DEPLOYABLE_FAILED',
      message: error.message,
      operation: redactProvisioningOperation(failed),
    };
  }
}

async function assessManagedPostgresPreflight({ userDataPath, payloadRoot = null } = {}) {
  const policy = getManagedPostgresPolicy();
  const payload = payloadVerifier.verifyBundledPayload({
    payloadRoot,
    allowRedistributionNotCertified: true,
  });
  const vcRuntime = vcRuntimePrerequisite.assessVcRuntimePrerequisite();
  const resolvedPayloadRoot =
    payloadRoot || (payload.manifestPath ? path.dirname(payload.manifestPath) : null);
  const authorization = releaseAuthorization.validateReleaseAuthorization({
    payloadRoot: resolvedPayloadRoot,
    postgresManifest: payload.manifest,
    vcRuntimeManifest: vcRuntime.manifest,
  });
  const deployableAuthorization = assessDeployableProvisioningAuthorization({ payload });
  const latest = userDataPath ? repository.getLatestProvisioningOperation(userDataPath) : null;
  const pendingRecovery = latest ? requiresProvisioningRecovery(latest.state) : false;
  const recovery = classifyProvisioningRecovery(latest);
  const plan = userDataPath
    ? buildManagedServicePlan({ installRoot: managedInstallRoot(userDataPath) })
    : null;

  return {
    ok: payload.ok && (authorization.ok || deployableAuthorization.ok) && !pendingRecovery,
    policy,
    payload,
    releaseAuthorization: authorization.ok
      ? {
          ok: true,
          code: authorization.code,
          authorizationPath: authorization.authorizationPath,
        }
      : {
          ok: false,
          code: authorization.code,
          authorizationPath: authorization.authorizationPath,
          field: authorization.field,
          missing: authorization.missing,
        },
    deployableAuthorization,
    prerequisites: {
      visualCppRuntime: vcRuntime,
    },
    latestOperation: redactProvisioningOperation(latest),
    pendingRecovery,
    recovery,
    rollbackPlan: getProvisioningRollbackPlan(latest),
    progressContract: getProvisioningProgressContract(),
    readiness: assessProvisioningReadiness({
      archivePolicyPinned: true,
      archiveStagingCertified: true,
      runtimeHarnessReady: true,
      cleanEnvironmentCertified: false,
      releaseApproved: false,
    }),
    servicePlan: plan
      ? {
          serviceName: plan.serviceName,
          port: plan.port,
          runtimeDir: plan.runtimeDir,
          dataDir: plan.dataDir,
        }
      : null,
    blockers: [
      ...(vcRuntime.ok ? [] : [vcRuntime.code || 'VC_RUNTIME_NOT_INSTALLED']),
      ...(payload.ok ? [] : [payload.code]),
      ...(authorization.ok || deployableAuthorization.ok
        ? []
        : [deployableAuthorization.code || authorization.code]),
      ...(pendingRecovery ? ['INSTALLER_POSTGRES_PROVISIONING_RECOVERY_REQUIRED'] : []),
    ],
  };
}

function recordInstallerLog(userDataPath, input = {}) {
  if (!userDataPath) return { ok: false, code: 'INSTALLER_LOG_PATH_MISSING' };
  const entry = createProvisioningLogEntry(input);
  return repository.appendProvisioningLog(userDataPath, entry);
}

async function startManagedPostgresProvisioning(options = {}) {
  const { userDataPath, payloadRoot = null } = options;
  if (options.certification?.enabled === true || process.env[CERTIFICATION_ENV] === '1') {
    try {
      return await executeCertificationProvisioning(options);
    } catch (error) {
      return {
        ok: false,
        code: error.code || 'INSTALLER_POSTGRES_CERTIFICATION_GATE_FAILED',
        message: error.message,
      };
    }
  }

  const preflight = await assessManagedPostgresPreflight({ userDataPath, payloadRoot });
  if (preflight.ok && preflight.deployableAuthorization?.ok) {
    return executeInstallerDeploymentProvisioning(options);
  }
  const policy = getManagedPostgresPolicy();
  const target = {
    host: 'localhost',
    port: policy.defaultPort,
    database: 'enterprise_pos',
    username: 'enterprise_pos',
    managed: true,
  };
  const operation = createProvisioningOperation({
    target,
    port: policy.defaultPort,
    dataDirectory: path.join(managedInstallRoot(userDataPath), policy.dataDirectoryName),
    service: { serviceName: policy.serviceName },
    payload: preflight.payload.ok
      ? {
          version: preflight.payload.manifest.version,
          fileName: preflight.payload.manifest.fileName,
          digest: preflight.payload.digest,
        }
      : null,
  });
  repository.saveProvisioningOperation(userDataPath, operation);
  recordInstallerLog(userDataPath, {
    operationId: operation.operationId,
    step: 'PROVISIONING_REQUESTED',
    status: 'started',
    message: 'Managed PostgreSQL provisioning was requested through the setup controller.',
  });

  if (!preflight.ok) {
    const failed = transitionProvisioningOperation(
      operation,
      PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
      {
        reason: 'managed_payload_or_recovery_preflight_blocked',
        failureCode: preflight.blockers[0] || 'INSTALLER_POSTGRES_PREFLIGHT_BLOCKED',
        failureStage: 'preflight',
      }
    );
    repository.saveProvisioningOperation(userDataPath, failed);
    recordInstallerLog(userDataPath, {
      operationId: failed.operationId,
      step: 'PREFLIGHT',
      status: 'blocked',
      exitCode: 0,
      message: 'Provisioning stopped before mutation because preflight blockers are present.',
      error: failed.failureCode,
    });
    return {
      ok: false,
      code: failed.failureCode,
      message: 'Managed PostgreSQL provisioning is blocked before any system mutation.',
      operation: redactProvisioningOperation(failed),
      preflight,
    };
  }

  const credentials = {
    username: target.username,
    password: generateManagedPostgresPassword(),
  };
  const credentialed = transitionProvisioningOperation(
    operation,
    PROVISIONING_STATES.CREDENTIALS_GENERATED,
    {
      reason: 'credentials_generated_without_logging_secret',
    }
  );
  repository.saveProvisioningOperation(userDataPath, credentialed);
  recordInstallerLog(userDataPath, {
    operationId: credentialed.operationId,
    step: 'CREDENTIALS_GENERATED',
    status: 'blocked',
    exitCode: 0,
    message:
      'Managed PostgreSQL execution remains disabled pending clean-machine certification and release approval.',
  });

  return {
    ok: false,
    code: 'INSTALLER_POSTGRES_PROVISIONING_EXECUTION_NOT_CERTIFIED',
    message:
      'Managed PostgreSQL payload verification passed, but service installation remains disabled until packaged-runtime VM certification is complete.',
    operation: redactProvisioningOperation(credentialed),
    credentialEvidence: { username: credentials.username, passwordGenerated: true },
    preflight,
  };
}

async function ensureManagedPostgresRuntimeStarted({ userDataPath } = {}) {
  if (!userDataPath) return { ok: false, code: 'INSTALLER_POSTGRES_USER_DATA_REQUIRED' };
  const loaded = configStore.loadInstallationConfig(userDataPath, { includePassword: true });
  if (!loaded.ok) return loaded;
  const config = loaded.config;
  if (config.mode !== configStore.CONFIG_MODES.INSTALLER_MANAGED) {
    return { ok: true, code: 'INSTALLER_POSTGRES_RUNTIME_NOT_MANAGED', skipped: true };
  }
  const managed = config.managedPostgres || {};
  const runtimeRoot = managed.runtimeRoot;
  const dataDir = managed.dataDir;
  if (!runtimeRoot || !dataDir) {
    return {
      ok: false,
      code: 'MANAGED_DATABASE_PROVISIONING_INCOMPLETE',
      message: 'Managed PostgreSQL runtime paths are missing from installer configuration.',
    };
  }
  try {
    await waitForApplicationDatabase(config, 3000);
    return { ok: true, code: 'INSTALLER_POSTGRES_RUNTIME_ALREADY_RUNNING' };
  } catch (_error) {
    // Start the managed runtime below.
  }
  const paths = executablePaths(runtimeRoot);
  const logsDir = ensureDirectory(path.join(path.dirname(dataDir), 'logs'));
  const start = await startServerProcess(paths.pgCtl, [
    '-D',
    dataDir,
    '-l',
    path.join(logsDir, 'postgres-server.log'),
    '-o',
    `-h 127.0.0.1 -p ${config.port}`,
    '-w',
    '-t',
    '30',
    'start',
  ]);
  if (!commandOk(start)) {
    return {
      ok: false,
      code: 'INSTALLER_POSTGRES_SERVER_START_FAILED',
      exitCode: start.exitCode,
      message: 'Managed PostgreSQL server failed to start.',
    };
  }
  await waitForApplicationDatabase(config, SERVER_READY_TIMEOUT_MS);
  return { ok: true, code: 'INSTALLER_POSTGRES_RUNTIME_STARTED' };
}

function getManagedPostgresProvisioningStatus({ userDataPath } = {}) {
  const latest = userDataPath ? repository.getLatestProvisioningOperation(userDataPath) : null;
  const vcRuntime = vcRuntimePrerequisite.assessVcRuntimePrerequisite();
  return {
    ok: true,
    operation: redactProvisioningOperation(latest),
    recoveryRequired: latest ? requiresProvisioningRecovery(latest.state) : false,
    recovery: classifyProvisioningRecovery(latest),
    rollbackPlan: getProvisioningRollbackPlan(latest),
    progressContract: getProvisioningProgressContract(),
    prerequisites: {
      visualCppRuntime: vcRuntime,
    },
    readiness: assessProvisioningReadiness({
      archivePolicyPinned: true,
      archiveStagingCertified: true,
      runtimeHarnessReady: true,
      cleanEnvironmentCertified: false,
      releaseApproved: false,
    }),
  };
}

module.exports = {
  CERTIFICATION_DB_PREFIX,
  CERTIFICATION_ENV,
  COMMAND_TIMEOUT_MS,
  INITDB_COMMAND_TIMEOUT_MS,
  CERTIFICATION_TOKEN,
  CERTIFICATION_TOKEN_ENV,
  assessManagedPostgresPreflight,
  assertCertificationExecutionGate,
  assessDeployableProvisioningAuthorization,
  executeCertificationProvisioning,
  executeInstallerDeploymentProvisioning,
  ensureManagedPostgresRuntimeStarted,
  getManagedPostgresProvisioningStatus,
  getFreeLocalPort,
  managedInstallRoot,
  recordInstallerLog,
  runCommand,
  startManagedPostgresProvisioning,
};
