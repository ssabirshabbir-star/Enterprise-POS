const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const releaseAuthorization = require('../src/main/installer/postgres-release-authorization');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function extraResource(pkg, to) {
  return pkg.build.extraResources.find((entry) => entry.to === to);
}

function filterIncludes(entry, value) {
  return Array.isArray(entry.filter) && entry.filter.includes(value);
}

test('Windows installer command uses NSIS and does not build from release output directly', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.scripts['package:win'], 'npm run build && electron-builder --win nsis');
  assert.equal(pkg.scripts.dist, 'electron-builder --win nsis');
  assert.deepEqual(pkg.build.win.target, ['nsis']);
  assert.equal(pkg.build.directories.output, 'release');
  assert.equal(pkg.build.productName, 'Enterprise POS');
  assert.equal(pkg.build.appId, 'com.enterprisepos.desktop');
  assert.match(pkg.build.artifactName, /unsigned-development/);
});

test('packaging selects required PostgreSQL and VC governance notices without payload binaries', () => {
  const pkg = readJson('package.json');
  const postgres = extraResource(pkg, 'postgres');
  const prerequisites = extraResource(pkg, 'prerequisites');
  const releaseGovernance = extraResource(pkg, 'release-governance');

  assert.equal(postgres.from, 'resources/postgres');
  assert.ok(filterIncludes(postgres, '*.json'));
  assert.ok(filterIncludes(postgres, '*.md'));
  assert.ok(filterIncludes(postgres, '*.txt'));
  assert.ok(filterIncludes(postgres, '!*.zip'));

  assert.equal(prerequisites.from, 'resources/prerequisites');
  assert.ok(filterIncludes(prerequisites, '**/manifest.json'));
  assert.ok(filterIncludes(prerequisites, '**/*.md'));
  assert.ok(filterIncludes(prerequisites, '!**/*.exe'));

  assert.equal(releaseGovernance.from, 'resources/release');
  assert.ok(filterIncludes(releaseGovernance, '*.json'));
  assert.ok(filterIncludes(releaseGovernance, '!*.exe'));
  assert.ok(filterIncludes(releaseGovernance, '!*.pfx'));
  assert.ok(filterIncludes(releaseGovernance, '!*.p12'));
  assert.ok(filterIncludes(releaseGovernance, '!*.pem'));
  assert.ok(filterIncludes(releaseGovernance, '!*.key'));
});

test('packaging file globs exclude local artifacts, secrets, maps, logs, and test outputs', () => {
  const pkg = readJson('package.json');
  const files = pkg.build.files;
  const serialized = JSON.stringify(pkg.build);

  assert.deepEqual(files, [
    'src/**/*',
    'package.json',
    '!src/**/*.map',
    '!**/*.log',
    '!src/main/_backup_old_structure/**',
    '!_archive/**',
  ]);
  assert.doesNotMatch(serialized, /test-artifacts/);
  assert.doesNotMatch(serialized, /\.env"/);
  assert.doesNotMatch(serialized, /node_modules/);
  for (const forbiddenCertificateType of ['!*.pfx', '!*.p12', '!*.pem', '!*.key']) {
    assert.match(serialized, new RegExp(forbiddenCertificateType.replace('*', '\\*'), 'i'));
  }
});

test('release governance files are present and remain non-authorizing', () => {
  const redistribution = readJson('resources/postgres/redistribution-manifest.json');
  const authorization = readJson('resources/postgres/release-authorization.pending.json');
  const evidence = readJson('resources/release/windows-release-evidence.pending.json');

  assert.equal(redistribution.manifestStatus, 'pending-release-authorization');
  assert.equal(redistribution.networkDownloadPermitted, false);
  assert.equal(
    redistribution.components.every((component) => component.mayCommitToGit === false),
    true
  );
  assert.equal(
    redistribution.components.every((component) => component.mayEmbedInReleaseArtifacts === false),
    true
  );

  assert.equal(authorization.authorizationStatus, 'pending');
  assert.equal(authorization.redistributionStatus, 'pending');
  assert.equal(authorization.approver, 'UNRESOLVED');
  assert.equal(evidence.authorizesProductionRelease, false);
  assert.equal(evidence.signing.productionSigningRequired, true);
  assert.equal(evidence.signing.status, 'unsigned');

  const validation = releaseAuthorization.validateReleaseAuthorization({
    payloadRoot: path.join(__dirname, '..', 'resources', 'postgres'),
    postgresManifest: readJson('resources/postgres/manifest.json'),
    vcRuntimeManifest: readJson('resources/prerequisites/microsoft-vc-runtime/manifest.json'),
    now: new Date('2026-07-19T00:00:00.000Z'),
  });
  assert.equal(validation.ok, false);
});

test('documentation defines signing readiness without treating unsigned artifacts as production', () => {
  const doc = read('docs/installer/WINDOWS_RELEASE_PACKAGING_AND_SIGNING.md');

  assert.match(doc, /Production release requirements:/);
  assert.match(doc, /Authenti(code|code) signed/i);
  assert.match(doc, /trusted timestamping/i);
  assert.match(doc, /Unsigned artifacts must not be renamed or published as production releases/i);
  assert.match(doc, /Pre-signing hashes are diagnostic only/i);
  assert.match(doc, /release authorization/i);
  assert.match(doc, /must not be used as release approval/i);
});
