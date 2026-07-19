const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getManagedPostgresPolicy } = require('./postgres-version-policy');

const PAYLOAD_STATUS = Object.freeze({
  READY: 'READY',
  MISSING: 'MISSING',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  CHECKSUM_UNCONFIGURED: 'CHECKSUM_UNCONFIGURED',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  LICENSE_NOTICE_MISSING: 'LICENSE_NOTICE_MISSING',
  ARCHITECTURE_MISMATCH: 'ARCHITECTURE_MISMATCH',
  REDISTRIBUTION_NOT_CERTIFIED: 'REDISTRIBUTION_NOT_CERTIFIED',
});

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function defaultPayloadRoot({ app, resourcesPath = process.resourcesPath } = {}) {
  if (resourcesPath && fs.existsSync(path.join(resourcesPath, 'postgres'))) {
    return path.join(resourcesPath, 'postgres');
  }
  if (process.execPath) {
    const executableResourcesPath = path.join(
      path.dirname(process.execPath),
      'resources',
      'postgres'
    );
    if (fs.existsSync(executableResourcesPath)) return executableResourcesPath;
  }
  if (app && typeof app.getAppPath === 'function') {
    return path.join(app.getAppPath(), 'resources', 'postgres');
  }
  return path.join(process.cwd(), 'resources', 'postgres');
}

function readManifest(payloadRoot) {
  const manifestPath = path.join(payloadRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.MISSING,
      code: 'INSTALLER_POSTGRES_PAYLOAD_MANIFEST_MISSING',
      manifestPath,
    };
  }
  try {
    return {
      ok: true,
      manifestPath,
      manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    };
  } catch (error) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.MANIFEST_INVALID,
      code: 'INSTALLER_POSTGRES_PAYLOAD_MANIFEST_INVALID',
      manifestPath,
      message: error.message,
    };
  }
}

function verifyPayloadManifest(payloadRoot, manifest = null, options = {}) {
  const policy = getManagedPostgresPolicy();
  const loaded = manifest
    ? { ok: true, manifestPath: path.join(payloadRoot, 'manifest.json'), manifest }
    : readManifest(payloadRoot);
  if (!loaded.ok) return { ...loaded, policy };

  const record = loaded.manifest || {};
  const required = [
    'version',
    'architecture',
    'fileName',
    'sha256',
    'format',
    'redistributionStatus',
  ];
  const missing = required.filter((key) => !record[key]);
  if (missing.length > 0) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.MANIFEST_INVALID,
      code: 'INSTALLER_POSTGRES_PAYLOAD_MANIFEST_INVALID',
      missing,
      manifestPath: loaded.manifestPath,
      policy,
    };
  }

  if (record.version !== policy.managedVersion || record.architecture !== policy.architecture) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.ARCHITECTURE_MISMATCH,
      code: 'INSTALLER_POSTGRES_PAYLOAD_POLICY_MISMATCH',
      manifest: record,
      policy,
    };
  }

  const redistributionNotCertified = record.redistributionStatus !== 'certified';
  if (redistributionNotCertified && options.allowRedistributionNotCertified !== true) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.REDISTRIBUTION_NOT_CERTIFIED,
      code: 'INSTALLER_POSTGRES_REDISTRIBUTION_NOT_CERTIFIED',
      manifest: record,
      policy,
    };
  }

  if (/^(TO_BE_SUPPLIED|UNCONFIGURED|PENDING)/i.test(String(record.sha256))) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.CHECKSUM_UNCONFIGURED,
      code: 'INSTALLER_POSTGRES_PAYLOAD_CHECKSUM_UNCONFIGURED',
      manifest: record,
      policy,
    };
  }

  const noticeFiles = Array.isArray(record.licenseNoticeFiles) ? record.licenseNoticeFiles : [];
  const missingNotices = noticeFiles.filter(
    (notice) => !fs.existsSync(path.join(payloadRoot, notice))
  );
  if (noticeFiles.length === 0 || missingNotices.length > 0) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.LICENSE_NOTICE_MISSING,
      code: 'INSTALLER_POSTGRES_LICENSE_NOTICE_MISSING',
      missingNotices,
      manifest: record,
      policy,
    };
  }

  const payloadPath = options.archivePath
    ? path.resolve(String(options.archivePath))
    : path.join(payloadRoot, record.fileName);
  if (path.basename(payloadPath) !== record.fileName) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.MISSING,
      code: 'INSTALLER_POSTGRES_PAYLOAD_FILENAME_MISMATCH',
      expected: record.fileName,
      actual: path.basename(payloadPath),
      manifest: record,
      policy,
    };
  }
  if (!fs.existsSync(payloadPath)) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.MISSING,
      code: 'INSTALLER_POSTGRES_PAYLOAD_MISSING',
      payloadPath,
      manifest: record,
      policy,
    };
  }

  const digest = sha256File(payloadPath);
  if (digest !== String(record.sha256).toLowerCase()) {
    return {
      ok: false,
      status: PAYLOAD_STATUS.CHECKSUM_MISMATCH,
      code: 'INSTALLER_POSTGRES_PAYLOAD_CHECKSUM_MISMATCH',
      expected: record.sha256,
      actual: digest,
      manifest: record,
      policy,
    };
  }

  return {
    ok: true,
    status: PAYLOAD_STATUS.READY,
    code: 'INSTALLER_POSTGRES_PAYLOAD_READY',
    payloadPath,
    digest,
    manifest: record,
    policy,
    redistributionStatus: record.redistributionStatus,
    redistributionCertified: !redistributionNotCertified,
  };
}

function verifyBundledPayload(options = {}) {
  const payloadRoot = options.payloadRoot || defaultPayloadRoot(options);
  return verifyPayloadManifest(payloadRoot, options.manifest || null, options);
}

module.exports = {
  PAYLOAD_STATUS,
  defaultPayloadRoot,
  readManifest,
  sha256File,
  verifyBundledPayload,
  verifyPayloadManifest,
};
