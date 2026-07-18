const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');
const yazl = require('yazl');

const stager = require('../src/main/installer/postgres-archive-stager');
const { sha256File } = require('../src/main/installer/postgres-payload-verifier');

const OFFICIAL_ARCHIVE =
  'D:\\Enterprise-POS-release-inputs\\postgres\\postgresql-17.10-2-windows-x64-binaries.zip';
const OFFICIAL_SHA = 'ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function createZip(zipPath, entries) {
  const zip = new yazl.ZipFile();
  const mtime = new Date('2026-07-18T00:00:00.000Z');
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content || `${entry.name}\n`, 'utf8'), entry.name, {
      mtime,
      mode: 0o644,
    });
  }
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(zipPath));
}

async function writeFixture({
  entries,
  fileName = 'postgresql-17.10-2-windows-x64-binaries.zip',
  manifestFileName = fileName,
  shaOverride = null,
} = {}) {
  const root = tempDir('epos-postgres-archive-');
  const zipPath = path.join(root, fileName);
  await createZip(zipPath, entries);
  const sha256 = shaOverride || sha256File(zipPath);
  const manifestRoot = path.join(root, 'manifest');
  fs.mkdirSync(manifestRoot, { recursive: true });
  fs.writeFileSync(
    path.join(manifestRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'postgresql-server',
        version: '17.10',
        architecture: 'win32-x64',
        format: 'edb-windows-x64-binaries-zip-filtered',
        fileName: manifestFileName,
        sha256,
        redistributionStatus: 'not-certified',
      },
      null,
      2
    )}\n`
  );
  return { root, zipPath, manifestRoot };
}

function validEntries(overrides = {}) {
  const entries = [
    'pgsql/bin/postgres.exe',
    'pgsql/bin/initdb.exe',
    'pgsql/bin/pg_ctl.exe',
    'pgsql/bin/psql.exe',
    'pgsql/bin/createdb.exe',
    'pgsql/bin/libpq.dll',
    'pgsql/lib/server.dll',
    'pgsql/share/postgresql.conf.sample',
    'pgsql/share/extension/plpgsql.control',
    'pgsql/server_license.txt',
    'pgsql/commandlinetools_3rd_party_licenses.txt',
    'pgsql/pgAdmin 4/runtime/pgadmin4.exe',
    'pgsql/StackBuilder/stackbuilder.exe',
  ];
  const remove = new Set(overrides.remove || []);
  const removePrefixes = overrides.removePrefixes || [];
  return entries
    .filter((name) => !remove.has(name))
    .filter((name) => !removePrefixes.some((prefix) => name.startsWith(prefix)))
    .map((name) => ({ name }));
}

test('official PostgreSQL archive exists and matches the pinned manifest digest', async (t) => {
  if (!fs.existsSync(OFFICIAL_ARCHIVE)) {
    t.skip(
      'Official PostgreSQL archive is supplied outside the repository for release certification.'
    );
    return;
  }

  assert.equal(path.basename(OFFICIAL_ARCHIVE), 'postgresql-17.10-2-windows-x64-binaries.zip');
  assert.equal(sha256File(OFFICIAL_ARCHIVE), OFFICIAL_SHA);
  const inspection = await stager.inspectPostgresArchive({
    archivePath: OFFICIAL_ARCHIVE,
    manifestRoot: path.join(__dirname, '..', 'resources', 'postgres'),
  });
  assert.equal(inspection.ok, true);
  assert.equal(inspection.includesPgAdmin, true);
  assert.equal(inspection.includesStackBuilder, true);
  assert.ok(inspection.stagedEntryCount > 0);
});

test('filtered staging extracts only required PostgreSQL runtime components', async () => {
  const fixture = await writeFixture({ entries: validEntries() });
  const stagingRoot = path.join(fixture.root, 'stage');
  const result = await stager.stagePostgresArchive({
    archivePath: fixture.zipPath,
    manifestRoot: fixture.manifestRoot,
    stagingRoot,
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/bin/postgres.exe')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/bin/initdb.exe')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/bin/pg_ctl.exe')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/bin/psql.exe')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/bin/createdb.exe')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/lib/server.dll')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/share/postgresql.conf.sample')), true);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/server_license.txt')), true);
  assert.equal(
    fs.existsSync(path.join(stagingRoot, 'pgsql/commandlinetools_3rd_party_licenses.txt')),
    true
  );
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/pgAdmin 4')), false);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'pgsql/StackBuilder')), false);
});

test('archive inspection resolves packaged manifest from process.resourcesPath', async () => {
  const fixture = await writeFixture({ entries: validEntries() });
  const resourcesRoot = path.join(fixture.root, 'packaged-resources');
  const packagedManifestRoot = path.join(resourcesRoot, 'postgres');
  fs.mkdirSync(packagedManifestRoot, { recursive: true });
  fs.copyFileSync(
    path.join(fixture.manifestRoot, 'manifest.json'),
    path.join(packagedManifestRoot, 'manifest.json')
  );

  const descriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: resourcesRoot,
  });
  try {
    const inspection = await stager.inspectPostgresArchive({
      archivePath: fixture.zipPath,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.manifest.fileName, path.basename(fixture.zipPath));
  } finally {
    if (descriptor) Object.defineProperty(process, 'resourcesPath', descriptor);
    else delete process.resourcesPath;
  }
});

test('archive validation rejects missing archive, wrong filename, wrong SHA, and corrupt ZIP', async () => {
  await assert.rejects(
    () =>
      stager.inspectPostgresArchive({
        archivePath: path.join(tempDir('epos-missing-'), 'missing.zip'),
      }),
    /archive is missing/i
  );

  const wrongName = await writeFixture({
    entries: validEntries(),
    fileName: 'wrong.zip',
    manifestFileName: 'postgresql-17.10-2-windows-x64-binaries.zip',
  });
  await assert.rejects(
    () =>
      stager.inspectPostgresArchive({
        archivePath: wrongName.zipPath,
        manifestRoot: wrongName.manifestRoot,
      }),
    /filename does not match/i
  );

  const wrongSha = await writeFixture({ entries: validEntries(), shaOverride: '0'.repeat(64) });
  await assert.rejects(
    () =>
      stager.inspectPostgresArchive({
        archivePath: wrongSha.zipPath,
        manifestRoot: wrongSha.manifestRoot,
      }),
    /SHA-256 does not match/i
  );

  const corrupt = tempDir('epos-corrupt-postgres-');
  const corruptZip = path.join(corrupt, 'postgresql-17.10-2-windows-x64-binaries.zip');
  fs.writeFileSync(corruptZip, 'not a zip');
  fs.mkdirSync(path.join(corrupt, 'manifest'));
  fs.writeFileSync(
    path.join(corrupt, 'manifest', 'manifest.json'),
    JSON.stringify({
      version: '17.10',
      architecture: 'win32-x64',
      fileName: path.basename(corruptZip),
      sha256: crypto.createHash('sha256').update('not a zip').digest('hex'),
    })
  );
  await assert.rejects(
    () =>
      stager.inspectPostgresArchive({
        archivePath: corruptZip,
        manifestRoot: path.join(corrupt, 'manifest'),
      }),
    /could not be opened/i
  );
});

test('archive validation rejects missing required executables, lib, share, and licenses', async () => {
  for (const scenario of [
    { label: 'pgsql/bin/postgres.exe', remove: ['pgsql/bin/postgres.exe'] },
    { label: 'pgsql/bin/initdb.exe', remove: ['pgsql/bin/initdb.exe'] },
    { label: 'pgsql/bin/pg_ctl.exe', remove: ['pgsql/bin/pg_ctl.exe'] },
    { label: 'pgsql/bin/psql.exe', remove: ['pgsql/bin/psql.exe'] },
    { label: 'pgsql/lib/', removePrefixes: ['pgsql/lib/'] },
    { label: 'pgsql/share/', removePrefixes: ['pgsql/share/'] },
    { label: 'pgsql/server_license.txt', remove: ['pgsql/server_license.txt'] },
  ]) {
    const fixture = await writeFixture({ entries: validEntries(scenario) });
    await assert.rejects(
      () =>
        stager.inspectPostgresArchive({
          archivePath: fixture.zipPath,
          manifestRoot: fixture.manifestRoot,
        }),
      /missing required/i,
      scenario.label
    );
  }
});

test('archive validation rejects ZIP Slip path traversal before extraction', async () => {
  assert.throws(() => stager.normalizeZipEntryName('pgsql/../evil.txt'), /unsafe path/i);
  assert.throws(() => stager.normalizeZipEntryName('/pgsql/bin/postgres.exe'), /unsafe path/i);
  assert.throws(() => stager.normalizeZipEntryName('C:/pgsql/bin/postgres.exe'), /unsafe path/i);
});
