const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');

const yazl = require('yazl');

const offlinePackaging = require('../scripts/prepare-offline-installer-payloads');
const vcRuntime = require('../src/main/installer/vc-runtime-prerequisite.service');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function createZip(zipPath) {
  const zip = new yazl.ZipFile();
  for (const entry of [
    'pgsql/bin/postgres.exe',
    'pgsql/bin/initdb.exe',
    'pgsql/bin/pg_ctl.exe',
    'pgsql/bin/psql.exe',
    'pgsql/bin/createdb.exe',
    'pgsql/lib/libpq.dll',
    'pgsql/share/postgresql.conf.sample',
    'pgsql/server_license.txt',
    'pgsql/commandlinetools_3rd_party_licenses.txt',
  ]) {
    zip.addBuffer(Buffer.from(`${entry}\n`, 'utf8'), entry);
  }
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(zipPath));
}

async function createFixture() {
  const root = tempDir('epos-offline-packaging-');
  const sourceRoot = path.join(root, 'source');
  const inputsRoot = path.join(root, 'inputs');
  const postgresRoot = path.join(sourceRoot, 'resources', 'postgres');
  const vcRoot = path.join(sourceRoot, 'resources', 'prerequisites', 'microsoft-vc-runtime');
  const releaseRoot = path.join(sourceRoot, 'resources', 'release');
  const postgresInput = path.join(
    inputsRoot,
    'postgres',
    'postgresql-17.10-2-windows-x64-binaries.zip'
  );
  const vcInput = path.join(inputsRoot, 'vc', 'vc_redist.x64.exe');

  fs.mkdirSync(path.dirname(postgresInput), { recursive: true });
  fs.mkdirSync(path.dirname(vcInput), { recursive: true });
  fs.mkdirSync(postgresRoot, { recursive: true });
  fs.mkdirSync(vcRoot, { recursive: true });
  fs.mkdirSync(releaseRoot, { recursive: true });

  await createZip(postgresInput);
  fs.writeFileSync(vcInput, 'fake signed vc runtime payload');
  fs.writeFileSync(path.join(postgresRoot, 'POSTGRESQL-LICENSE.txt'), 'PostgreSQL license\n');
  fs.writeFileSync(path.join(postgresRoot, 'THIRD-PARTY-NOTICES.md'), 'PostgreSQL notices\n');
  fs.writeFileSync(
    path.join(postgresRoot, 'redistribution-manifest.json'),
    JSON.stringify({ schemaVersion: 1, networkDownloadPermitted: false }, null, 2)
  );
  fs.writeFileSync(
    path.join(postgresRoot, 'release-authorization.pending.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        releaseScope: 'enterprise-pos-managed-postgres-production',
        authorizationStatus: 'pending',
        redistributionStatus: 'pending',
        legalReviewStatus: 'pending',
        securityReviewStatus: 'pending',
        packagingModel: 'hybrid-offline-payload-with-external-build-inputs',
        postgresql: {
          version: '17.10',
          architecture: 'win32-x64',
          fileName: path.basename(postgresInput),
          sha256: sha256File(postgresInput),
        },
        microsoftVcRuntime: {
          architecture: 'x64',
          filename: path.basename(vcInput),
          sha256: sha256File(vcInput),
        },
        technicalCertification: { reference: 'fixture' },
        approver: 'UNRESOLVED',
        approvalTimestamp: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revoked: false,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(postgresRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        component: 'postgresql-server',
        version: '17.10',
        architecture: 'win32-x64',
        format: 'edb-windows-x64-binaries-zip-filtered',
        fileName: path.basename(postgresInput),
        sha256: sha256File(postgresInput),
        redistributionStatus: 'not-certified',
        licenseNoticeFiles: ['POSTGRESQL-LICENSE.txt', 'THIRD-PARTY-NOTICES.md'],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(vcRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        filename: path.basename(vcInput),
        architecture: 'x64',
        sha256: sha256File(vcInput),
        expectedSigner: 'Microsoft Corporation',
        redistributionStatus: 'not-certified',
      },
      null,
      2
    )
  );

  return { root, sourceRoot, postgresInput, vcInput, postgresRoot, vcRoot };
}

test('offline certification packaging copies exact verified payloads into deterministic resources', async () => {
  const fixture = await createFixture();
  const originalVerifier = vcRuntime.verifyVcRuntimePayload;
  vcRuntime.verifyVcRuntimePayload = ({ root }) => ({
    ok: true,
    digest: sha256File(path.join(root, 'vc_redist.x64.exe')),
    size: fs.statSync(path.join(root, 'vc_redist.x64.exe')).size,
    fileVersion: '14.51.36247.0',
    signature: { status: 'Valid', signer: 'CN=Microsoft Corporation' },
  });
  try {
    const result = await offlinePackaging.prepareOfflineInstallerPayloads({
      mode: 'offline-certification',
      sourceRoot: fixture.sourceRoot,
      postgresArchive: fixture.postgresInput,
      vcRuntimeExe: fixture.vcInput,
    });

    assert.equal(result.classification, 'offline-certification-unsigned');
    assert.equal(result.networkDownloadPermitted, false);
    assert.equal(result.productionProvisioningEnabled, false);
    assert.equal(
      fs.existsSync(path.join(fixture.postgresRoot, 'postgresql-17.10-2-windows-x64-binaries.zip')),
      true
    );
    assert.equal(fs.existsSync(path.join(fixture.vcRoot, 'vc_redist.x64.exe')), true);
    assert.equal(result.postgresql.sha256, sha256File(fixture.postgresInput));
    assert.equal(result.microsoftVcRuntime.sha256, sha256File(fixture.vcInput));
    assert.equal(result.generatedAt, offlinePackaging.DETERMINISTIC_PACKAGING_EVIDENCE_TIMESTAMP);
    assert.equal(
      fs.existsSync(
        path.join(
          fixture.sourceRoot,
          'resources',
          'release',
          'offline-packaging-evidence.generated.json'
        )
      ),
      true
    );

    const firstEvidence = fs.readFileSync(
      path.join(
        fixture.sourceRoot,
        'resources',
        'release',
        'offline-packaging-evidence.generated.json'
      ),
      'utf8'
    );
    const repeat = await offlinePackaging.prepareOfflineInstallerPayloads({
      mode: 'offline-certification',
      sourceRoot: fixture.sourceRoot,
      postgresArchive: fixture.postgresInput,
      vcRuntimeExe: fixture.vcInput,
    });
    const secondEvidence = fs.readFileSync(
      path.join(
        fixture.sourceRoot,
        'resources',
        'release',
        'offline-packaging-evidence.generated.json'
      ),
      'utf8'
    );
    assert.deepEqual(repeat, result);
    assert.equal(secondEvidence, firstEvidence);
  } finally {
    vcRuntime.verifyVcRuntimePayload = originalVerifier;
  }
});

test('deployable offline packaging enables only the installer milestone provisioning gate', async () => {
  const fixture = await createFixture();
  const originalVerifier = vcRuntime.verifyVcRuntimePayload;
  vcRuntime.verifyVcRuntimePayload = ({ root }) => ({
    ok: true,
    digest: sha256File(path.join(root, 'vc_redist.x64.exe')),
    size: fs.statSync(path.join(root, 'vc_redist.x64.exe')).size,
    fileVersion: '14.51.36247.0',
    signature: { status: 'Valid', signer: 'CN=Microsoft Corporation' },
  });
  try {
    const result = await offlinePackaging.prepareOfflineInstallerPayloads({
      mode: 'deployable',
      sourceRoot: fixture.sourceRoot,
      postgresArchive: fixture.postgresInput,
      vcRuntimeExe: fixture.vcInput,
    });

    assert.equal(result.classification, 'deployable-offline-installer');
    assert.equal(result.productionProvisioningEnabled, true);
    assert.equal(result.redistributionStatus, 'not-certified');
    assert.equal(result.releaseAuthorizationStatus, 'pending');
  } finally {
    vcRuntime.verifyVcRuntimePayload = originalVerifier;
  }
});

test('offline packaging fails closed for missing notices, wrong payload hashes, and production authorization gaps', async () => {
  const missingNotice = await createFixture();
  fs.rmSync(path.join(missingNotice.postgresRoot, 'THIRD-PARTY-NOTICES.md'));
  await assert.rejects(
    () =>
      offlinePackaging.prepareOfflineInstallerPayloads({
        sourceRoot: missingNotice.sourceRoot,
        postgresArchive: missingNotice.postgresInput,
        vcRuntimeExe: missingNotice.vcInput,
      }),
    /Required offline installer file is missing/
  );

  const wrongHash = await createFixture();
  fs.writeFileSync(wrongHash.vcInput, 'tampered');
  await assert.rejects(
    () =>
      offlinePackaging.prepareOfflineInstallerPayloads({
        sourceRoot: wrongHash.sourceRoot,
        postgresArchive: wrongHash.postgresInput,
        vcRuntimeExe: wrongHash.vcInput,
      }),
    /VC Runtime SHA-256 does not match manifest/
  );

  const production = await createFixture();
  await assert.rejects(
    () =>
      offlinePackaging.prepareOfflineInstallerPayloads({
        mode: 'production',
        sourceRoot: production.sourceRoot,
        postgresArchive: production.postgresInput,
        vcRuntimeExe: production.vcInput,
      }),
    /certified PostgreSQL redistribution status/
  );
});

test('offline certification builder config includes payload binaries under a non-production artifact name', () => {
  const config = require('../electron-builder.offline-certification.cjs');
  const postgres = config.extraResources.find((entry) => entry.to === 'postgres');
  const prerequisites = config.extraResources.find((entry) => entry.to === 'prerequisites');

  assert.match(config.artifactName, /offline-certification-unsigned/);
  assert.ok(postgres.filter.includes('*.zip'));
  assert.ok(prerequisites.filter.includes('**/vc_redist.x64.exe'));
  assert.doesNotMatch(config.artifactName, /production/i);
});

test('deployable builder config emits a deployable offline artifact and keeps bundled payloads', () => {
  const config = require('../electron-builder.deployable.cjs');
  const postgres = config.extraResources.find((entry) => entry.to === 'postgres');
  const prerequisites = config.extraResources.find((entry) => entry.to === 'prerequisites');

  assert.match(config.artifactName, /offline\.\$\{ext\}/);
  assert.doesNotMatch(config.artifactName, /certification/i);
  assert.ok(postgres.filter.includes('*.zip'));
  assert.ok(prerequisites.filter.includes('**/vc_redist.x64.exe'));
});
