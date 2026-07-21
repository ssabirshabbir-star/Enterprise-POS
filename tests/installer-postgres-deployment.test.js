const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const credentials = require('../src/main/installer/postgres-credential.service');
const payloadVerifier = require('../src/main/installer/postgres-payload-verifier');
const releaseAuthorization = require('../src/main/installer/postgres-release-authorization');
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
    installMethod: releaseAuthorization.APPROVED_PROVISIONING_STRATEGY,
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

function vcRuntimeManifestFixture(overrides = {}) {
  return {
    architecture: 'x64',
    filename: 'vc_redist.x64.exe',
    sha256: '843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c',
    ...overrides,
  };
}

function writeAuthorizationFixture(root, postgresManifest, overrides = {}) {
  const record = {
    schemaVersion: 1,
    releaseScope: releaseAuthorization.PRODUCTION_RELEASE_SCOPE,
    authorizationStatus: 'approved',
    redistributionStatus: 'approved',
    legalReviewStatus: 'approved',
    securityReviewStatus: 'approved',
    releaseApprovalStatus: 'approved',
    packagingModel: 'hybrid-offline-payload-with-external-build-inputs',
    postgresql: {
      version: postgresManifest.version,
      architecture: postgresManifest.architecture,
      fileName: postgresManifest.fileName,
      sha256: postgresManifest.sha256,
      installMethod: postgresManifest.installMethod,
    },
    microsoftVcRuntime: vcRuntimeManifestFixture(),
    technicalCertification: {
      managedPostgresFailureMatrix: 'passed',
      evidenceHash: 'a'.repeat(64),
    },
    approvedPayloadManifestSha256: releaseAuthorization.createPayloadManifestHash(postgresManifest),
    approvedProvisioningStrategy: releaseAuthorization.APPROVED_PROVISIONING_STRATEGY,
    approvedInstallerVersionRange: {
      minVersion: '1.0.0',
      maxVersion: '1.0.0',
    },
    installerVersion: '1.0.0',
    approver: 'release-authority-fixture',
    approvalTimestamp: '2026-07-19T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revoked: false,
    testOnly: false,
    ...overrides,
  };
  fs.writeFileSync(
    path.join(root, 'release-authorization.pending.json'),
    `${JSON.stringify(record, null, 2)}\n`
  );
  return record;
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

test('payload verifier returns manifest path required for deployable staging', () => {
  const payloadRoot = tempDir('epos-pg-payload-contract-');
  const manifest = writePayloadFixture(payloadRoot);
  const result = payloadVerifier.verifyBundledPayload({
    payloadRoot,
    allowRedistributionNotCertified: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'INSTALLER_POSTGRES_PAYLOAD_READY');
  assert.equal(result.payloadPath, path.join(payloadRoot, manifest.fileName));
  assert.equal(result.manifestPath, path.join(payloadRoot, 'manifest.json'));
});

test('release authorization template is pending and non-authorizing', () => {
  const payloadRoot = path.join(__dirname, '..', 'resources', 'postgres');
  const manifest = JSON.parse(fs.readFileSync(path.join(payloadRoot, 'manifest.json'), 'utf8'));
  const result = releaseAuthorization.validateReleaseAuthorization({
    payloadRoot,
    postgresManifest: manifest,
    vcRuntimeManifest: vcRuntimeManifestFixture(),
    now: new Date('2026-07-19T00:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INCOMPLETE');
  assert.ok(result.missing.includes('approvalTimestamp'));
});

test('release authorization rejects missing, incomplete, revoked, expired, test-only, and mismatched records', () => {
  const missingRoot = tempDir('epos-postgres-auth-missing-');
  assert.equal(
    releaseAuthorization.validateReleaseAuthorization({ payloadRoot: missingRoot }).code,
    'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_MISSING'
  );

  const root = tempDir('epos-postgres-auth-');
  const manifest = writePayloadFixture(root);
  writeAuthorizationFixture(root, manifest);
  assert.equal(
    releaseAuthorization.validateReleaseAuthorization({
      payloadRoot: root,
      postgresManifest: manifest,
      vcRuntimeManifest: vcRuntimeManifestFixture(),
      now: new Date('2026-07-19T00:00:00.000Z'),
    }).ok,
    true
  );

  const cases = [
    ['incomplete', { approver: undefined }, 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INCOMPLETE'],
    [
      'disabled',
      { authorizationStatus: 'disabled' },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_DISABLED',
    ],
    ['revoked', { revoked: true }, 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_REVOKED'],
    [
      'expired',
      { expiresAt: '2026-01-01T00:00:00.000Z' },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_EXPIRED',
    ],
    ['test-only', { testOnly: true }, 'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_TEST_ONLY'],
    [
      'missing-release-approval',
      { releaseApprovalStatus: 'pending' },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_NOT_APPROVED',
    ],
    [
      'missing-technical-evidence',
      { technicalCertification: { managedPostgresFailureMatrix: 'passed' } },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INCOMPLETE',
    ],
    [
      'invalid-technical-evidence',
      {
        technicalCertification: { managedPostgresFailureMatrix: 'passed', evidenceHash: 'pending' },
      },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_TECHNICAL_EVIDENCE_INVALID',
    ],
    [
      'wrong-manifest-hash',
      { approvedPayloadManifestSha256: '2'.repeat(64) },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_MANIFEST_MISMATCH',
    ],
    [
      'wrong-strategy',
      { approvedProvisioningStrategy: 'download-at-install-time' },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_STRATEGY_MISMATCH',
    ],
    [
      'installer-version-out-of-range',
      { installerVersion: '2.0.0' },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_INSTALLER_VERSION_MISMATCH',
    ],
    [
      'wrong-version',
      { postgresql: { ...manifest, version: '17.9', fileName: manifest.fileName } },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
    ],
    [
      'wrong-filename',
      { postgresql: { ...manifest, fileName: 'postgresql-other.zip' } },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
    ],
    [
      'wrong-architecture',
      { postgresql: { ...manifest, architecture: 'linux-x64' } },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
    ],
    [
      'wrong-sha',
      { postgresql: { ...manifest, sha256: '0'.repeat(64) } },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
    ],
    [
      'wrong-vc-sha',
      { microsoftVcRuntime: vcRuntimeManifestFixture({ sha256: '1'.repeat(64) }) },
      'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_PAYLOAD_MISMATCH',
    ],
  ];

  for (const [name, overrides, expectedCode] of cases) {
    const caseRoot = tempDir(`epos-postgres-auth-${name}-`);
    const caseManifest = writePayloadFixture(caseRoot);
    writeAuthorizationFixture(caseRoot, caseManifest, overrides);
    const result = releaseAuthorization.validateReleaseAuthorization({
      payloadRoot: caseRoot,
      postgresManifest: caseManifest,
      vcRuntimeManifest: vcRuntimeManifestFixture(),
      now: new Date('2026-07-19T00:00:00.000Z'),
    });
    assert.equal(result.ok, false, name);
    assert.equal(result.code, expectedCode, name);
  }
});

test('approved payload manifest alone does not bypass release authorization or production guards', async () => {
  const payloadRoot = tempDir('epos-postgres-auth-preflight-');
  writePayloadFixture(payloadRoot);
  const userDataPath = tempDir('epos-postgres-auth-userdata-');
  const preflight = await provisioningService.assessManagedPostgresPreflight({
    userDataPath,
    payloadRoot,
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.releaseAuthorization.ok, false);
  assert.equal(
    preflight.releaseAuthorization.code,
    'INSTALLER_POSTGRES_RELEASE_AUTHORIZATION_MISSING'
  );
  assert.equal(preflight.deployableAuthorization.ok, false);
  assert.ok(preflight.blockers.includes('INSTALLER_DEPLOYABLE_PACKAGING_EVIDENCE_MISSING'));

  const result = await provisioningService.startManagedPostgresProvisioning({
    userDataPath,
    payloadRoot,
  });
  assert.equal(result.ok, false);
  assert.equal(result.operation.state, 'CANCELLED_BEFORE_MUTATION');
  assert.ok(result.preflight.blockers.includes('INSTALLER_DEPLOYABLE_PACKAGING_EVIDENCE_MISSING'));
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
  assert.equal(result.code, 'INSTALLER_POSTGRES_PAYLOAD_MISSING');
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
  assert.match(setup, /Use the bundled PostgreSQL runtime for this terminal/);
  assert.match(setup, /verifies the pinned payload/);
  assert.match(setup, /installerPostgresProvisionButton/);
  assert.doesNotMatch(setup, /installerPostgresProvisionButton"[^>]*disabled/);
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
