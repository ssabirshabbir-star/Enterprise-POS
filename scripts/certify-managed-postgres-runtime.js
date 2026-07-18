#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { stagePostgresArchive } = require('../src/main/installer/postgres-archive-stager');
const { sha256File } = require('../src/main/installer/postgres-payload-verifier');

const DEFAULT_ARCHIVE =
  'D:\\Enterprise-POS-release-inputs\\postgres\\postgresql-17.10-2-windows-x64-binaries.zip';
const DEFAULT_ARTIFACT_ROOT = path.join(
  process.cwd(),
  'test-artifacts',
  'managed-postgres-runtime-certification'
);
const REQUIRED_FLAG = '--certify-managed-postgres-runtime';

function parseArgs(argv) {
  const args = {
    archive: DEFAULT_ARCHIVE,
    output: DEFAULT_ARTIFACT_ROOT,
    keepOnSuccess: false,
    cleanEnvironment: false,
    readinessTimeoutMs: 30000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === REQUIRED_FLAG) args.explicit = true;
    else if (item === '--archive') args.archive = argv[++index];
    else if (item === '--output') args.output = argv[++index];
    else if (item === '--keep-on-success') args.keepOnSuccess = true;
    else if (item === '--clean-environment') args.cleanEnvironment = true;
    else if (item === '--readiness-timeout-ms') args.readinessTimeoutMs = Number(argv[++index]);
    else if (item === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    `  node scripts/certify-managed-postgres-runtime.js ${REQUIRED_FLAG} [options]`,
    '',
    'Options:',
    '  --archive <path>                 External EDB PostgreSQL archive path.',
    '  --output <path>                  Artifact directory for JSON/report/logs.',
    '  --clean-environment              Mark the run as Windows Sandbox/clean VM evidence.',
    '  --keep-on-success                Preserve staged runtime/data directories after success.',
    '  --readiness-timeout-ms <number>  Bounded readiness timeout. Default 30000.',
  ].join('\n');
}

function normalizeForReport(value) {
  return value ? path.resolve(value) : value;
}

function codeFailure(code, message, evidence = {}) {
  return { code, message, evidence, timestampUtc: new Date().toISOString() };
}

function ensureExplicit(args) {
  if (!args.explicit) {
    throw Object.assign(new Error(`Refusing to run without ${REQUIRED_FLAG}.`), {
      code: 'CERTIFICATION_FLAG_REQUIRED',
    });
  }
}

function assertSafeOutputPath(outputPath) {
  const root = path.resolve(outputPath);
  const repo = path.resolve(process.cwd());
  const relative = path.relative(repo, root);
  if (
    root === repo ||
    ['src', 'scripts', 'resources', 'tests', 'docs'].some(
      (name) => relative === name || relative.startsWith(`${name}${path.sep}`)
    )
  ) {
    throw Object.assign(
      new Error('Certification output path must not target tracked source directories.'),
      {
        code: 'CERTIFICATION_OUTPUT_UNSAFE',
        outputPath: root,
      }
    );
  }
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function createRuntimeRoot(outputRoot) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-managed-postgres-cert-'));
  const dataDir = path.join(runtimeRoot, 'data');
  const stagedRoot = path.join(runtimeRoot, 'runtime');
  const logsDir = path.join(outputRoot, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { runtimeRoot, dataDir, stagedRoot, logsDir };
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

function runCommand(command, args, options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs || 60000;
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, PGCONNECT_TIMEOUT: '5', ...(options.env || {}) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
        elapsedMs: Date.now() - started,
        error: { code: 'PROCESS_TIMEOUT', message: `Process exceeded ${timeoutMs}ms timeout.` },
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
        elapsedMs: Date.now() - started,
        error: { code: error.code || 'PROCESS_SPAWN_FAILED', message: error.message },
      });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ command, args, exitCode, signal, stdout, stderr, elapsedMs: Date.now() - started });
    });
  });
}

function commandPassed(result) {
  return result && result.exitCode === 0 && !result.error;
}

function executablePaths(stagedRoot) {
  const bin = path.join(stagedRoot, 'pgsql', 'bin');
  return {
    postgres: path.join(bin, 'postgres.exe'),
    initdb: path.join(bin, 'initdb.exe'),
    pgCtl: path.join(bin, 'pg_ctl.exe'),
    psql: path.join(bin, 'psql.exe'),
    createdb: path.join(bin, 'createdb.exe'),
  };
}

function buildInitdbArgs(dataDir) {
  return ['-D', dataDir, '-U', 'epos_cert', '-A', 'trust', '--no-sync'];
}

function buildPgCtlStartArgs(dataDir, logPath, port) {
  return ['-D', dataDir, '-l', logPath, '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30', 'start'];
}

function buildPgCtlStopArgs(dataDir) {
  return ['-D', dataDir, '-m', 'fast', '-w', '-t', '30', 'stop'];
}

function buildPsqlArgs({ port, database = 'postgres', sql }) {
  return ['-h', '127.0.0.1', '-p', String(port), '-U', 'epos_cert', '-d', database, '-Atc', sql];
}

function buildCreatedbArgs(port, databaseName) {
  return ['-h', '127.0.0.1', '-p', String(port), '-U', 'epos_cert', databaseName];
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

async function waitForSql(paths, port, timeoutMs, commandLog) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await runCommand(paths.psql, buildPsqlArgs({ port, sql: 'SELECT 1' }));
    commandLog.push({ step: 'readiness_probe', result: last });
    if (commandPassed(last) && String(last.stdout).trim() === '1') return { ok: true, last };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, last };
}

function initialReport(args) {
  return {
    status: 'failed',
    timestampUtc: new Date().toISOString(),
    cleanEnvironmentUsed: Boolean(args.cleanEnvironment),
    platform: {
      os: os.platform(),
      architecture: os.arch(),
      release: os.release(),
      windowsVersion: os.platform() === 'win32' ? os.release() : null,
    },
    archive: {
      filename: path.basename(args.archive || ''),
      path: normalizeForReport(args.archive),
      sha256: null,
      checksumMatched: false,
    },
    staging: {
      passed: false,
      stagedRoot: null,
      pgAdminPresent: null,
      stackBuilderPresent: null,
    },
    executables: {},
    runtime: {
      initdbPassed: false,
      serverStarted: false,
      serverVersion: null,
      connectionPassed: false,
      databaseCreated: false,
      sqlRoundTripPassed: false,
      cleanShutdownPassed: false,
    },
    dependencies: {
      visualCppRuntimePreinstalled: 'unknown',
      missingRuntimeDependencyDetected: false,
      evidence: [],
    },
    provisioningActivation: {
      enabled: false,
      certifiedForActivation: false,
    },
    failures: [],
    warnings: [],
    commands: [],
  };
}

async function runCertification(args) {
  ensureExplicit(args);
  if (process.platform !== 'win32') {
    throw Object.assign(new Error('Managed PostgreSQL runtime certification requires Windows.'), {
      code: 'CERTIFICATION_WINDOWS_REQUIRED',
    });
  }
  if (os.arch() !== 'x64') {
    throw Object.assign(
      new Error('Managed PostgreSQL runtime certification requires Windows x64.'),
      {
        code: 'CERTIFICATION_X64_REQUIRED',
      }
    );
  }
  const outputRoot = assertSafeOutputPath(args.output);
  const report = initialReport(args);
  const runtime = createRuntimeRoot(outputRoot);
  report.staging.stagedRoot = runtime.stagedRoot;
  let serverStarted = false;

  try {
    if (!fs.existsSync(args.archive)) {
      throw Object.assign(new Error('PostgreSQL archive is missing.'), {
        code: 'CERTIFICATION_ARCHIVE_MISSING',
      });
    }
    report.archive.sha256 = sha256File(args.archive);
    const staged = await stagePostgresArchive({
      archivePath: args.archive,
      stagingRoot: runtime.stagedRoot,
      manifestRoot: path.join(process.cwd(), 'resources', 'postgres'),
      clean: true,
    });
    report.archive.sha256 = staged.digest;
    report.archive.checksumMatched = true;
    report.staging.passed = true;
    report.staging.pgAdminPresent = fs.existsSync(
      path.join(runtime.stagedRoot, 'pgsql', 'pgAdmin 4')
    );
    report.staging.stackBuilderPresent = fs.existsSync(
      path.join(runtime.stagedRoot, 'pgsql', 'StackBuilder')
    );
    const paths = executablePaths(runtime.stagedRoot);
    report.executables = paths;

    const versionProbe = await runCommand(paths.postgres, ['--version']);
    report.commands.push({ step: 'postgres_version_probe', result: versionProbe });
    if (!commandPassed(versionProbe)) {
      report.dependencies.missingRuntimeDependencyDetected = true;
      report.dependencies.evidence.push(
        versionProbe.error || versionProbe.stderr || 'postgres.exe did not launch.'
      );
      throw Object.assign(new Error('postgres.exe failed to launch.'), {
        code: 'CERTIFICATION_POSTGRES_EXE_FAILED',
      });
    }

    const port = await getFreeLocalPort();
    report.runtime.port = port;
    const initdb = await runCommand(paths.initdb, buildInitdbArgs(runtime.dataDir));
    report.commands.push({ step: 'initdb', result: initdb });
    report.runtime.initdbPassed = commandPassed(initdb);
    if (!report.runtime.initdbPassed) {
      throw Object.assign(new Error('initdb failed.'), { code: 'CERTIFICATION_INITDB_FAILED' });
    }

    const logPath = path.join(runtime.logsDir, 'postgresql-certification.log');
    const start = await runCommand(
      paths.pgCtl,
      buildPgCtlStartArgs(runtime.dataDir, logPath, port),
      {
        timeoutMs: 10000,
      }
    );
    report.commands.push({ step: 'pg_ctl_start', result: start });
    serverStarted = commandPassed(start) || /server started/i.test(start.stdout || '');
    report.runtime.serverStarted = serverStarted;
    if (!serverStarted) {
      throw Object.assign(new Error('pg_ctl start failed.'), {
        code: 'CERTIFICATION_SERVER_START_FAILED',
      });
    }

    const readiness = await waitForSql(paths, port, args.readinessTimeoutMs, report.commands);
    report.runtime.connectionPassed = readiness.ok;
    if (!readiness.ok) {
      throw Object.assign(new Error('PostgreSQL readiness check timed out.'), {
        code: 'CERTIFICATION_READINESS_TIMEOUT',
      });
    }

    const version = await runCommand(
      paths.psql,
      buildPsqlArgs({ port, sql: 'SHOW server_version;' })
    );
    report.commands.push({ step: 'server_version', result: version });
    if (!commandPassed(version)) {
      throw Object.assign(new Error('Server version query failed.'), {
        code: 'CERTIFICATION_VERSION_QUERY_FAILED',
      });
    }
    report.runtime.serverVersion = String(version.stdout).trim();

    const dbName = `epos_runtime_cert_${Date.now()}`;
    report.runtime.databaseName = dbName;
    const createdb = await runCommand(paths.createdb, buildCreatedbArgs(port, dbName));
    report.commands.push({ step: 'createdb', result: createdb });
    report.runtime.databaseCreated = commandPassed(createdb);
    if (!report.runtime.databaseCreated) {
      throw Object.assign(new Error('createdb failed.'), { code: 'CERTIFICATION_CREATEDB_FAILED' });
    }

    const sql = [
      'CREATE TABLE runtime_certification (id integer PRIMARY KEY, certified_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL);',
      "INSERT INTO runtime_certification (id, note) VALUES (1, 'managed-postgres-runtime-certification');",
      "SELECT id || ':' || note FROM runtime_certification WHERE id = 1;",
    ].join(' ');
    const roundTrip = await runCommand(paths.psql, buildPsqlArgs({ port, database: dbName, sql }));
    report.commands.push({ step: 'sql_round_trip', result: roundTrip });
    report.runtime.sqlRoundTripPassed =
      commandPassed(roundTrip) &&
      String(roundTrip.stdout).includes('1:managed-postgres-runtime-certification');
    if (!report.runtime.sqlRoundTripPassed) {
      throw Object.assign(new Error('SQL round-trip failed.'), {
        code: 'CERTIFICATION_SQL_ROUND_TRIP_FAILED',
      });
    }

    const stop = await runCommand(paths.pgCtl, buildPgCtlStopArgs(runtime.dataDir));
    report.commands.push({ step: 'pg_ctl_stop', result: stop });
    serverStarted = false;
    report.runtime.cleanShutdownPassed = commandPassed(stop);
    if (!report.runtime.cleanShutdownPassed) {
      throw Object.assign(new Error('pg_ctl stop failed.'), {
        code: 'CERTIFICATION_SHUTDOWN_FAILED',
      });
    }

    const stoppedProbe = await runCommand(paths.psql, buildPsqlArgs({ port, sql: 'SELECT 1' }));
    report.commands.push({ step: 'stopped_probe', result: stoppedProbe });
    if (commandPassed(stoppedProbe)) {
      throw Object.assign(new Error('Server still accepted connections after stop.'), {
        code: 'CERTIFICATION_STOP_VERIFICATION_FAILED',
      });
    }

    report.status = args.cleanEnvironment ? 'passed' : 'blocked';
    if (!args.cleanEnvironment) {
      report.warnings.push(
        'Local development-machine runtime diagnostics passed, but clean Windows Sandbox/VM certification is still required.'
      );
    }
  } catch (error) {
    report.status = 'failed';
    report.failures.push(codeFailure(error.code || 'CERTIFICATION_FAILED', error.message, error));
    if (serverStarted && report.executables.pgCtl) {
      const stop = await runCommand(report.executables.pgCtl, buildPgCtlStopArgs(runtime.dataDir));
      report.commands.push({ step: 'pg_ctl_stop_after_failure', result: stop });
      report.runtime.cleanShutdownPassed = commandPassed(stop);
    }
  } finally {
    report.completedAtUtc = new Date().toISOString();
    report.runtimeRoot = runtime.runtimeRoot;
    const reportPath = path.join(outputRoot, 'managed-postgres-runtime-certification.json');
    const textPath = path.join(outputRoot, 'managed-postgres-runtime-certification.txt');
    report.artifacts = { reportPath, textPath };
    writeJson(reportPath, report);
    writeText(textPath, [
      `Status: ${report.status}`,
      `Archive: ${report.archive.filename}`,
      `SHA-256: ${report.archive.sha256 || '-'}`,
      `Staging passed: ${report.staging.passed}`,
      `initdb: ${report.runtime.initdbPassed}`,
      `serverStarted: ${report.runtime.serverStarted}`,
      `serverVersion: ${report.runtime.serverVersion || '-'}`,
      `connectionPassed: ${report.runtime.connectionPassed}`,
      `databaseCreated: ${report.runtime.databaseCreated}`,
      `sqlRoundTripPassed: ${report.runtime.sqlRoundTripPassed}`,
      `cleanShutdownPassed: ${report.runtime.cleanShutdownPassed}`,
      `provisioningEnabled: ${report.provisioningActivation.enabled}`,
      `warnings: ${report.warnings.join('; ') || '-'}`,
      `failures: ${report.failures.map((failure) => failure.code).join(', ') || '-'}`,
    ]);
    if (report.status !== 'failed' && !args.keepOnSuccess) {
      fs.rmSync(runtime.runtimeRoot, { recursive: true, force: true });
    } else {
      report.warnings.push(`Runtime directory preserved at ${runtime.runtimeRoot}`);
      writeJson(reportPath, report);
    }
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = await runCertification(args);
  console.log(
    JSON.stringify(
      { status: report.status, artifacts: report.artifacts, failures: report.failures },
      null,
      2
    )
  );
  process.exitCode = report.status === 'failed' ? 1 : 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ARCHIVE,
  REQUIRED_FLAG,
  assertSafeOutputPath,
  buildCreatedbArgs,
  buildInitdbArgs,
  buildPgCtlStartArgs,
  buildPgCtlStopArgs,
  buildPsqlArgs,
  executablePaths,
  getFreeLocalPort,
  parseArgs,
  runCertification,
  runCommand,
};
