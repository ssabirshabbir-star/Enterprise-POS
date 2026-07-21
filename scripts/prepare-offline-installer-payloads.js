#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const stager = require('../src/main/installer/postgres-archive-stager');
const payloadVerifier = require('../src/main/installer/postgres-payload-verifier');
const releaseAuthorization = require('../src/main/installer/postgres-release-authorization');
const vcRuntime = require('../src/main/installer/vc-runtime-prerequisite.service');

const DEFAULT_POSTGRES_INPUT =
  'D:\\Enterprise-POS-release-inputs\\postgres\\postgresql-17.10-2-windows-x64-binaries.zip';
const DEFAULT_VC_INPUT =
  'D:\\Enterprise-POS-release-inputs\\prerequisites\\microsoft-vc-runtime\\vc_redist.x64.exe';
const ALLOWED_MODES = new Set(['offline-certification', 'deployable', 'production']);
const DETERMINISTIC_PACKAGING_EVIDENCE_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    mode: process.env.ENTERPRISE_POS_INSTALLER_BUILD_MODE || 'offline-certification',
    sourceRoot: process.cwd(),
    postgresArchive: process.env.ENTERPRISE_POS_POSTGRES_PAYLOAD || DEFAULT_POSTGRES_INPUT,
    vcRuntimeExe: process.env.ENTERPRISE_POS_VC_RUNTIME_PAYLOAD || DEFAULT_VC_INPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') parsed.mode = argv[++index];
    else if (arg === '--source-root') parsed.sourceRoot = argv[++index];
    else if (arg === '--postgres-archive') parsed.postgresArchive = argv[++index];
    else if (arg === '--vc-runtime') parsed.vcRuntimeExe = argv[++index];
    else throw codeError('OFFLINE_INSTALLER_UNKNOWN_ARGUMENT', `Unknown argument: ${arg}`);
  }
  return parsed;
}

function codeError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(value, null, 2));
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function copyVerifiedFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, `${destination}.tmp`);
  fs.renameSync(`${destination}.tmp`, destination);
}

function assertInside(root, target, code) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw codeError(code, 'Offline installer payload path is outside the approved source root.', {
      root: resolvedRoot,
      target: resolvedTarget,
    });
  }
}

function assertRequiredFile(filePath, code) {
  if (!fs.existsSync(filePath)) {
    throw codeError(code, 'Required offline installer file is missing.', { filePath });
  }
}

function assertMode(mode) {
  if (!ALLOWED_MODES.has(mode)) {
    throw codeError(
      'OFFLINE_INSTALLER_MODE_UNSUPPORTED',
      'Offline installer build mode is unsupported.',
      {
        mode,
      }
    );
  }
}

function assertOfflineModeAllowed({ mode, postgresManifest, vcManifest, releaseAuth }) {
  assertMode(mode);
  if (mode === 'offline-certification' || mode === 'deployable') {
    if (releaseAuth.record?.authorizationStatus === 'approved') {
      throw codeError(
        'OFFLINE_INSTALLER_CERTIFICATION_MODE_AUTHORIZATION_UNEXPECTED',
        `${mode} builds must not consume production release authorization.`
      );
    }
    return;
  }

  if (postgresManifest.redistributionStatus !== 'certified') {
    throw codeError(
      'OFFLINE_INSTALLER_POSTGRES_REDISTRIBUTION_NOT_CERTIFIED',
      'Production offline packaging requires certified PostgreSQL redistribution status.'
    );
  }
  if (vcManifest.redistributionStatus !== 'certified') {
    throw codeError(
      'OFFLINE_INSTALLER_VC_REDISTRIBUTION_NOT_CERTIFIED',
      'Production offline packaging requires certified Visual C++ Runtime redistribution status.'
    );
  }
  const validation = releaseAuthorization.validateReleaseAuthorization({
    payloadRoot: path.dirname(releaseAuth.path),
    authorizationPath: releaseAuth.path,
    postgresManifest,
    vcRuntimeManifest: vcManifest,
    production: true,
  });
  if (!validation.ok) {
    throw codeError(
      validation.code || 'OFFLINE_INSTALLER_RELEASE_AUTHORIZATION_INVALID',
      'Production offline packaging requires approved release authorization.',
      validation
    );
  }
}

async function prepareOfflineInstallerPayloads(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || process.cwd());
  const mode = options.mode || 'offline-certification';
  assertMode(mode);

  const postgresRoot = path.join(sourceRoot, 'resources', 'postgres');
  const vcRoot = path.join(sourceRoot, 'resources', 'prerequisites', 'microsoft-vc-runtime');
  const releaseRoot = path.join(sourceRoot, 'resources', 'release');
  const postgresManifestPath = path.join(postgresRoot, 'manifest.json');
  const vcManifestPath = path.join(vcRoot, 'manifest.json');
  const releaseAuthPath = path.join(postgresRoot, 'release-authorization.pending.json');
  const redistributionPath = path.join(postgresRoot, 'redistribution-manifest.json');

  for (const [filePath, code] of [
    [postgresManifestPath, 'OFFLINE_INSTALLER_POSTGRES_MANIFEST_MISSING'],
    [vcManifestPath, 'OFFLINE_INSTALLER_VC_MANIFEST_MISSING'],
    [releaseAuthPath, 'OFFLINE_INSTALLER_RELEASE_AUTHORIZATION_MISSING'],
    [redistributionPath, 'OFFLINE_INSTALLER_REDISTRIBUTION_MANIFEST_MISSING'],
    [
      path.join(postgresRoot, 'POSTGRESQL-LICENSE.txt'),
      'OFFLINE_INSTALLER_POSTGRES_LICENSE_MISSING',
    ],
    [
      path.join(postgresRoot, 'THIRD-PARTY-NOTICES.md'),
      'OFFLINE_INSTALLER_POSTGRES_NOTICES_MISSING',
    ],
  ]) {
    assertRequiredFile(filePath, code);
  }

  const postgresManifest = readJson(postgresManifestPath);
  const vcManifest = readJson(vcManifestPath);
  const releaseAuth = { path: releaseAuthPath, record: readJson(releaseAuthPath) };
  assertOfflineModeAllowed({ mode, postgresManifest, vcManifest, releaseAuth });

  const postgresArchive = path.resolve(options.postgresArchive || DEFAULT_POSTGRES_INPUT);
  const vcRuntimeExe = path.resolve(options.vcRuntimeExe || DEFAULT_VC_INPUT);
  assertRequiredFile(postgresArchive, 'OFFLINE_INSTALLER_POSTGRES_ARCHIVE_MISSING');
  assertRequiredFile(vcRuntimeExe, 'OFFLINE_INSTALLER_VC_PAYLOAD_MISSING');

  const postgresVerification = payloadVerifier.verifyPayloadManifest(
    postgresRoot,
    postgresManifest,
    {
      archivePath: postgresArchive,
      allowRedistributionNotCertified: mode === 'offline-certification' || mode === 'deployable',
    }
  );
  if (!postgresVerification.ok) {
    throw codeError(
      postgresVerification.code || 'OFFLINE_INSTALLER_POSTGRES_PAYLOAD_INVALID',
      'PostgreSQL offline payload verification failed.',
      postgresVerification
    );
  }
  const archiveInspection = await stager.inspectPostgresArchive({
    archivePath: postgresArchive,
    manifestRoot: postgresRoot,
  });

  const postgresDestination = path.join(postgresRoot, postgresManifest.fileName);
  const vcDestination = path.join(vcRoot, vcManifest.filename);
  assertInside(sourceRoot, postgresDestination, 'OFFLINE_INSTALLER_POSTGRES_DESTINATION_UNSAFE');
  assertInside(sourceRoot, vcDestination, 'OFFLINE_INSTALLER_VC_DESTINATION_UNSAFE');

  const vcDigest = payloadVerifier.sha256File(vcRuntimeExe);
  if (path.basename(vcRuntimeExe) !== vcManifest.filename) {
    throw codeError(
      'OFFLINE_INSTALLER_VC_FILENAME_MISMATCH',
      'VC Runtime filename does not match manifest.',
      {
        expected: vcManifest.filename,
        actual: path.basename(vcRuntimeExe),
      }
    );
  }
  if (vcDigest !== String(vcManifest.sha256 || '').toLowerCase()) {
    throw codeError(
      'OFFLINE_INSTALLER_VC_HASH_MISMATCH',
      'VC Runtime SHA-256 does not match manifest.',
      {
        expected: vcManifest.sha256,
        actual: vcDigest,
      }
    );
  }

  copyVerifiedFile(postgresArchive, postgresDestination);
  copyVerifiedFile(vcRuntimeExe, vcDestination);
  const vcVerification = vcRuntime.verifyVcRuntimePayload({ root: vcRoot, manifest: vcManifest });
  if (!vcVerification.ok) {
    try {
      fs.rmSync(vcDestination, { force: true });
    } catch (_error) {
      // Best-effort cleanup of a copied-but-unverified prerequisite payload.
    }
    throw codeError(
      vcVerification.code || 'OFFLINE_INSTALLER_VC_PAYLOAD_INVALID',
      'VC Runtime offline payload verification failed.',
      vcVerification
    );
  }

  const evidence = {
    schemaVersion: 1,
    generatedAt: DETERMINISTIC_PACKAGING_EVIDENCE_TIMESTAMP,
    buildMode: mode,
    classification:
      mode === 'offline-certification'
        ? 'offline-certification-unsigned'
        : mode === 'deployable'
          ? 'deployable-offline-installer'
          : 'production',
    networkDownloadPermitted: false,
    productionProvisioningEnabled: mode === 'deployable' || mode === 'production',
    redistributionStatus: postgresManifest.redistributionStatus,
    releaseAuthorizationStatus: releaseAuth.record.authorizationStatus,
    postgresql: {
      filename: postgresManifest.fileName,
      sourcePath: postgresArchive,
      packagedRelativePath: path.relative(sourceRoot, postgresDestination),
      sha256: postgresVerification.digest,
      size: fs.statSync(postgresDestination).size,
      archiveEntryCount: archiveInspection.entryCount,
      stagedEntryCount: archiveInspection.stagedEntryCount,
      includesPgAdmin: archiveInspection.includesPgAdmin,
      includesStackBuilder: archiveInspection.includesStackBuilder,
    },
    microsoftVcRuntime: {
      filename: vcManifest.filename,
      sourcePath: vcRuntimeExe,
      packagedRelativePath: path.relative(sourceRoot, vcDestination),
      sha256: vcVerification.digest,
      size: vcVerification.size,
      fileVersion: vcVerification.fileVersion,
      signature: vcVerification.signature,
    },
  };
  writeJson(path.join(releaseRoot, 'offline-packaging-evidence.generated.json'), evidence);
  return evidence;
}

async function main() {
  try {
    const result = await prepareOfflineInstallerPayloads(parseArgs());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const safe = {
      ok: false,
      code: error.code || 'OFFLINE_INSTALLER_PAYLOAD_PREPARATION_FAILED',
      message: error.message,
    };
    process.stderr.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_POSTGRES_INPUT,
  DEFAULT_VC_INPUT,
  DETERMINISTIC_PACKAGING_EVIDENCE_TIMESTAMP,
  prepareOfflineInstallerPayloads,
};
