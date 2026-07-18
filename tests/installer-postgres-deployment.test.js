const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const credentials = require('../src/main/installer/postgres-credential.service');
const payloadVerifier = require('../src/main/installer/postgres-payload-verifier');
const provisioningModel = require('../src/main/installer/postgres-provisioning.model');
const provisioningRepository = require('../src/main/installer/postgres-provisioning.repository');
const provisioningService = require('../src/main/installer/postgres-provisioning.service');
const serviceManager = require('../src/main/installer/postgres-service-manager');
const versionPolicy = require('../src/main/installer/postgres-version-policy');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePayloadFixture(root, overrides = {}) {
  const payload = Buffer.from('fixture-postgresql-server', 'utf8');
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  const manifest = {
    version: versionPolicy.MANAGED_POSTGRES_VERSION,
    architecture: 'win32-x64',
    format: 'zip-server-only',
    fileName: 'postgresql-fixture.zip',
    sha256: digest,
    redistributionStatus: 'certified',
    licenseNoticeFiles: ['POSTGRESQL-LICENSE.txt', 'THIRD-PARTY-NOTICES.md'],
    ...overrides,
  };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, manifest.fileName), payload);
  fs.writeFileSync(path.join(root, 'POSTGRESQL-LICENSE.txt'), 'PostgreSQL license notice fixture');
  fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), 'Third-party notice fixture');
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test('managed PostgreSQL policy pins an exact Windows server version', () => {
  const policy = versionPolicy.getManagedPostgresPolicy();
  assert.equal(policy.policyVersion, 'managed-postgres-policy-v1');
  assert.equal(policy.managedVersion, '17.10');
  assert.equal(policy.architecture, 'win32-x64');
  assert.equal(policy.productionReady, false);
  assert.equal(
    versionPolicy.classifyPostgresVersion('PostgreSQL 17.10 on x86_64-windows').status,
    'SUPPORTED_AND_TESTED'
  );
  assert.equal(
    versionPolicy.classifyPostgresVersion('PostgreSQL 17.9 on x86_64-windows').status,
    'SUPPORTED_UNTESTED'
  );
  assert.equal(
    versionPolicy.classifyPostgresVersion('PostgreSQL 16.9 on x86_64-windows').status,
    'UNSUPPORTED_TOO_OLD'
  );
  assert.equal(
    versionPolicy.classifyPostgresVersion('PostgreSQL 18.0 on x86_64-windows').status,
    'UNSUPPORTED_TOO_NEW'
  );
});

test('payload verifier rejects the repository placeholder payload before mutation', () => {
  const result = payloadVerifier.verifyPayloadManifest(
    path.join(__dirname, '..', 'resources', 'postgres')
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REDISTRIBUTION_NOT_CERTIFIED');
  assert.equal(result.code, 'INSTALLER_POSTGRES_REDISTRIBUTION_NOT_CERTIFIED');
});

test('payload verifier requires checksum, notices, architecture, and file integrity', () => {
  const root = tempDir('epos-postgres-payload-');
  writePayloadFixture(root);
  assert.equal(payloadVerifier.verifyPayloadManifest(root).ok, true);

  const missingNoticeRoot = tempDir('epos-postgres-payload-notice-');
  writePayloadFixture(missingNoticeRoot);
  fs.unlinkSync(path.join(missingNoticeRoot, 'POSTGRESQL-LICENSE.txt'));
  assert.equal(
    payloadVerifier.verifyPayloadManifest(missingNoticeRoot).status,
    'LICENSE_NOTICE_MISSING'
  );

  const badDigestRoot = tempDir('epos-postgres-payload-digest-');
  writePayloadFixture(badDigestRoot, { sha256: '0'.repeat(64) });
  assert.equal(payloadVerifier.verifyPayloadManifest(badDigestRoot).status, 'CHECKSUM_MISMATCH');

  const badArchRoot = tempDir('epos-postgres-payload-arch-');
  writePayloadFixture(badArchRoot, { architecture: 'linux-x64' });
  assert.equal(payloadVerifier.verifyPayloadManifest(badArchRoot).status, 'ARCHITECTURE_MISMATCH');
});

test('payload verifier resolves packaged resources beside the executable', () => {
  const root = tempDir('epos-packaged-postgres-root-');
  const installDir = path.join(root, 'Enterprise POS');
  const payloadRoot = path.join(installDir, 'resources', 'postgres');
  fs.mkdirSync(payloadRoot, { recursive: true });

  const descriptor = Object.getOwnPropertyDescriptor(process, 'execPath');
  Object.defineProperty(process, 'execPath', {
    configurable: true,
    value: path.join(installDir, 'Enterprise POS.exe'),
  });
  try {
    assert.equal(payloadVerifier.defaultPayloadRoot({ resourcesPath: null }), payloadRoot);
  } finally {
    if (descriptor) Object.defineProperty(process, 'execPath', descriptor);
  }
});

test('managed PostgreSQL credentials are high entropy and redacted', () => {
  const first = credentials.generateManagedPostgresPassword();
  const second = credentials.generateManagedPostgresPassword();
  assert.notEqual(first, second);
  assert.ok(first.length >= 32);
  assert.deepEqual(credentials.redactConnectionFields({ username: 'epos', password: first }), {
    username: 'epos',
    password: '[redacted]',
  });
  assert.throws(() => credentials.generateManagedPostgresPassword({ bytes: 8 }), /entropy/i);
});

test('managed service plan validates service names and path ownership', () => {
  const root = tempDir('epos-postgres-service-');
  const plan = serviceManager.buildManagedServicePlan({ installRoot: root });
  assert.equal(plan.serviceName, 'EnterprisePOSPostgreSQL');
  assert.equal(plan.port, 55432);
  assert.match(plan.serviceCommand.args.join(' '), /EnterprisePOSPostgreSQL/);
  assert.throws(() => serviceManager.normalizeWindowsServiceName('bad name'), /invalid/i);
  assert.throws(
    () =>
      serviceManager.buildManagedServicePlan({
        installRoot: root,
        runtimeDir: path.parse(root).root,
      }),
    /escapes/i
  );
});

test('provisioning journal persists state transitions without secrets', () => {
  const root = tempDir('epos-postgres-journal-');
  let operation = provisioningModel.createProvisioningOperation({
    target: { database: 'enterprise_pos', managed: true },
  });
  operation = provisioningModel.transitionProvisioningOperation(
    operation,
    provisioningModel.PROVISIONING_STATES.PREFLIGHT_PASSED,
    { reason: 'test_preflight' },
    { now: '2026-07-18T00:00:00.000Z' }
  );
  const saved = provisioningRepository.saveProvisioningOperation(root, operation);
  assert.equal(saved.ok, true);
  const raw = fs.readFileSync(provisioningRepository.journalPath(root), 'utf8');
  assert.doesNotMatch(raw, /password|secret|connectionString/i);
  assert.equal(
    provisioningRepository.getLatestProvisioningOperation(root).state,
    'PREFLIGHT_PASSED'
  );
});

test('managed provisioning state model describes resumable production stages', () => {
  const states = provisioningModel.PROVISIONING_STATES;
  for (const state of [
    'NOT_STARTED',
    'ARCHIVE_VERIFIED',
    'PAYLOAD_STAGED',
    'DATA_DIRECTORY_INITIALIZED',
    'SERVER_STARTED',
    'DATABASE_CREATED',
    'APPLICATION_SCHEMA_READY',
    'COMPLETED',
    'FAILED',
    'ROLLBACK_REQUIRED',
  ]) {
    assert.equal(states[state], state);
  }

  const operation = provisioningModel.createProvisioningOperation({
    state: states.PAYLOAD_STAGED,
  });
  const recovery = provisioningModel.classifyProvisioningRecovery(operation);
  assert.equal(recovery.resumable, true);
  assert.equal(recovery.action, 'VERIFY_STAGED_PAYLOAD_THEN_INITDB');
  assert.equal(provisioningModel.requiresProvisioningRecovery(states.ROLLBACK_REQUIRED), true);
  assert.throws(
    () =>
      provisioningModel.assertProvisioningTransitionAllowed(
        { ...operation, state: states.PAYLOAD_STAGED },
        states.COMPLETED
      ),
    /not allowed/
  );
});

test('managed provisioning recovery decisions are conservative for interrupted rollback', () => {
  const operation = provisioningModel.createProvisioningOperation({
    state: provisioningModel.PROVISIONING_STATES.ROLLBACK_IN_PROGRESS,
  });
  const recovery = provisioningModel.classifyProvisioningRecovery(operation);
  assert.equal(recovery.blocked, true);
  assert.equal(recovery.action, 'MANUAL_REVIEW');
  assert.match(recovery.message, /cannot be assumed successful/i);
});

test('managed PostgreSQL rollback policy preserves user databases and diagnostics', () => {
  const plan = provisioningModel.getProvisioningRollbackPlan({
    operationId: 'op-rollback-plan',
  });
  assert.equal(plan.operationId, 'op-rollback-plan');
  assert.ok(plan.removes.some((item) => /temporary staging/i.test(item)));
  assert.ok(plan.preserves.some((item) => /user databases/i.test(item)));
  assert.ok(plan.preserves.some((item) => /logs/i.test(item)));
  assert.ok(
    plan.manualInterventionRequiredWhen.some((item) => /unrelated PostgreSQL service/i.test(item))
  );
});

test('managed provisioning log entries redact secrets and persist as JSONL', () => {
  const root = tempDir('epos-postgres-log-');
  const entry = provisioningModel.createProvisioningLogEntry(
    {
      operationId: 'op-log',
      step: 'STARTING_DATABASE',
      status: 'failed',
      durationMs: 250,
      exitCode: 1,
      command: {
        executable: 'pg_ctl.exe',
        args: ['start', 'password=super-secret'],
      },
      error: 'PGPASSWORD=super-secret connection failed',
    },
    { now: '2026-07-18T00:00:00.000Z' }
  );
  provisioningRepository.appendProvisioningLog(root, entry);
  const raw = fs.readFileSync(provisioningRepository.logPath(root), 'utf8');
  assert.doesNotMatch(raw, /super-secret/);
  const logs = provisioningRepository.readProvisioningLogs(root);
  assert.equal(logs[0].step, 'STARTING_DATABASE');
  assert.equal(logs[0].command.args[1], 'password=[redacted]');
});

test('managed provisioning progress contract is installer-facing and inactive', () => {
  const progress = provisioningModel.getProvisioningProgressContract();
  assert.deepEqual(
    progress.map((event) => event.label),
    [
      'Verifying PostgreSQL package',
      'Checking integrity',
      'Preparing runtime',
      'Initializing database',
      'Starting database',
      'Creating application database',
      'Preparing Enterprise POS',
      'Completed',
      'Failed',
    ]
  );
  const readiness = provisioningModel.assessProvisioningReadiness({
    cleanEnvironmentCertified: false,
    releaseApproved: false,
  });
  assert.equal(readiness.provisioningActivationEnabled, false);
  assert.equal(readiness.certifiedForActivation, false);
  assert.equal(readiness.ok, false);
  assert.ok(readiness.blockers.includes('CLEAN_ENVIRONMENT_CERTIFICATION'));
  assert.ok(readiness.blockers.includes('RELEASE_APPROVAL'));
});

test('managed provisioning is blocked safely when packaged payload is not certified', async () => {
  const userDataPath = tempDir('epos-postgres-provision-');
  const result = await provisioningService.startManagedPostgresProvisioning({ userDataPath });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INSTALLER_POSTGRES_REDISTRIBUTION_NOT_CERTIFIED');
  assert.equal(result.operation.state, 'CANCELLED_BEFORE_MUTATION');
  assert.equal(result.operation.startedAt, undefined);
});

test('setup IPC exposes managed PostgreSQL status without renderer-controlled system commands', () => {
  const preload = read('src/main/preload.js');
  const controller = read('src/main/installer/installer.controller.js');
  const setup = read('src/renderer/setup.html');

  assert.match(preload, /postgresPreflight/);
  assert.match(preload, /vcRuntimeStatus/);
  assert.match(preload, /provisionManagedPostgres/);
  assert.match(controller, /\/installer\/postgres\/preflight/);
  assert.match(controller, /\/installer\/postgres\/provision/);
  assert.match(controller, /\/installer\/prerequisites\/vc-runtime\/status/);
  assert.match(setup, /Microsoft Visual C\+\+ Runtime/);
  assert.match(setup, /Managed PostgreSQL runtime/);
  assert.match(setup, /blocked until a checksum-pinned, license-audited Windows server payload/);
  assert.match(setup, /installerPostgresProvisionButton"[^>]*disabled/);
  assert.doesNotMatch(controller, /_event,\s*payload[\s\S]*sc\.exe/);
});

test('Windows package is NSIS-oriented and preserves data on uninstall', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['package:win'], 'npm run build && electron-builder --win nsis');
  assert.deepEqual(pkg.build.win.target, ['nsis']);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.ok(
    pkg.build.extraResources.some(
      (entry) => entry.from === 'resources/postgres' && entry.to === 'postgres'
    )
  );
  assert.ok(
    pkg.build.extraResources.some(
      (entry) =>
        entry.from === 'resources/prerequisites' &&
        entry.to === 'prerequisites' &&
        entry.filter.includes('!**/*.exe')
    )
  );
  assert.equal(pkg.build.win.signAndEditExecutable, false);
});
