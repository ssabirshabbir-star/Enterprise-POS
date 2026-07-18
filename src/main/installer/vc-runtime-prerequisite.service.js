const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { spawnSync } = require('child_process');

const { parsePeArchitecture, sha256File } = require('./postgres-runtime-diagnostics');

const VC_RUNTIME_STATES = Object.freeze({
  NOT_CHECKED: 'NOT_CHECKED',
  CHECKING: 'CHECKING',
  AVAILABLE: 'AVAILABLE',
  MISSING: 'MISSING',
  PAYLOAD_VERIFIED: 'PAYLOAD_VERIFIED',
  INSTALLATION_REQUIRED: 'INSTALLATION_REQUIRED',
  INSTALLING: 'INSTALLING',
  INSTALLED: 'INSTALLED',
  RESTART_REQUIRED: 'RESTART_REQUIRED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  INSTALLATION_FAILED: 'INSTALLATION_FAILED',
  UNSUPPORTED: 'UNSUPPORTED',
  BLOCKED: 'BLOCKED',
});

const REGISTRY_KEY = 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64';
const MANIFEST_RELATIVE_PATH = path.join('prerequisites', 'microsoft-vc-runtime', 'manifest.json');
const EXTERNAL_INPUT_ROOT =
  'D:\\Enterprise-POS-release-inputs\\prerequisites\\microsoft-vc-runtime';
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

function codeError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function normalizeVersionParts(value = '0') {
  return String(value)
    .replace(/^[^\d]+/, '')
    .split('.')
    .map((part) => Number(String(part).replace(/[^\d].*$/, '')) || 0);
}

function compareVersions(a = '0', b = '0') {
  const left = normalizeVersionParts(a);
  const right = normalizeVersionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function defaultPrerequisiteRoot({ resourcesPath = process.resourcesPath } = {}) {
  if (resourcesPath && fs.existsSync(path.join(resourcesPath, MANIFEST_RELATIVE_PATH))) {
    return path.join(resourcesPath, 'prerequisites', 'microsoft-vc-runtime');
  }
  if (process.execPath) {
    const executableResources = path.join(
      path.dirname(process.execPath),
      'resources',
      'prerequisites',
      'microsoft-vc-runtime'
    );
    if (fs.existsSync(path.join(executableResources, 'manifest.json'))) return executableResources;
  }
  return path.join(process.cwd(), 'resources', 'prerequisites', 'microsoft-vc-runtime');
}

function externalPrerequisiteRoot() {
  return EXTERNAL_INPUT_ROOT;
}

function readManifest(root = defaultPrerequisiteRoot()) {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_MANIFEST_MISSING',
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
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_MANIFEST_INVALID',
      manifestPath,
      message: error.message,
    };
  }
}

function regQueryValue(raw, name) {
  const line = String(raw || '')
    .split(/\r?\n/)
    .find((entry) => new RegExp(`\\s${name}\\s+REG_`, 'i').test(entry));
  if (!line) return null;
  const parts = line.trim().split(/\s{2,}/);
  return parts[parts.length - 1] || null;
}

function detectRegistryEvidence() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      code: 'VC_RUNTIME_UNSUPPORTED_ARCHITECTURE',
      evidence: [{ source: 'platform', value: process.platform }],
    };
  }
  const result = spawnSync('reg.exe', ['query', REGISTRY_KEY, '/reg:64'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      code: 'VC_RUNTIME_NOT_INSTALLED',
      evidence: [{ source: 'registry', key: REGISTRY_KEY, found: false }],
    };
  }
  return {
    ok: true,
    version: regQueryValue(result.stdout, 'Version'),
    installed: regQueryValue(result.stdout, 'Installed') === '0x1',
    major: regQueryValue(result.stdout, 'Major'),
    minor: regQueryValue(result.stdout, 'Minor'),
    bld: regQueryValue(result.stdout, 'Bld'),
    rbld: regQueryValue(result.stdout, 'Rbld'),
    evidence: [{ source: 'registry', key: REGISTRY_KEY, found: true }],
  };
}

function getFileVersion(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const script = `(Get-Item -LiteralPath '${filePath.replace(/'/g, "''")}').VersionInfo.FileVersion`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function runtimeDllEvidence() {
  const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const names = ['VCRUNTIME140.dll', 'MSVCP140.dll'];
  return names.map((name) => {
    const filePath = path.join(system32, name);
    return {
      source: 'system32-file',
      name,
      path: filePath,
      exists: fs.existsSync(filePath),
      version: getFileVersion(filePath),
    };
  });
}

function detectVcRuntime({ manifestRoot = defaultPrerequisiteRoot(), manifest = null } = {}) {
  const loaded = manifest ? { ok: true, manifest } : readManifest(manifestRoot);
  const policy = loaded.manifest || {};
  const checkedAt = new Date().toISOString();
  if (!loaded.ok) {
    return {
      installed: false,
      compatible: false,
      architecture: 'x64',
      detectedVersion: null,
      requiredPolicy: policy.minimumVersion || null,
      evidence: [loaded],
      reasonCode: loaded.code,
      state: VC_RUNTIME_STATES.BLOCKED,
      checkedAt,
    };
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    return {
      installed: false,
      compatible: false,
      architecture: process.arch,
      detectedVersion: null,
      requiredPolicy: policy.minimumVersion,
      evidence: [{ source: 'platform', platform: process.platform, arch: process.arch }],
      reasonCode: 'VC_RUNTIME_UNSUPPORTED_ARCHITECTURE',
      state: VC_RUNTIME_STATES.UNSUPPORTED,
      checkedAt,
    };
  }
  const registry = detectRegistryEvidence();
  const dlls = runtimeDllEvidence();
  const vcruntime = dlls.find((entry) => entry.name === 'VCRUNTIME140.dll');
  const msvcp = dlls.find((entry) => entry.name === 'MSVCP140.dll');
  const version = registry.version || vcruntime?.version || null;
  const installed = Boolean(registry.ok && registry.installed);
  const filesPresent = Boolean(vcruntime?.exists && msvcp?.exists);
  const compatible =
    installed &&
    filesPresent &&
    version &&
    compareVersions(version, policy.minimumVersion || '14.0.0.0') >= 0;
  let reasonCode = 'VC_RUNTIME_AVAILABLE';
  let state = VC_RUNTIME_STATES.AVAILABLE;
  if (!installed && !filesPresent) {
    reasonCode = 'VC_RUNTIME_NOT_INSTALLED';
    state = VC_RUNTIME_STATES.MISSING;
  } else if (!installed && filesPresent) {
    reasonCode = 'VC_RUNTIME_EVIDENCE_INCOMPLETE';
    state = VC_RUNTIME_STATES.VERIFICATION_FAILED;
  } else if (installed && !filesPresent) {
    reasonCode = 'VC_RUNTIME_DAMAGED';
    state = VC_RUNTIME_STATES.VERIFICATION_FAILED;
  } else if (!compatible) {
    reasonCode = 'VC_RUNTIME_INCOMPATIBLE';
    state = VC_RUNTIME_STATES.UNSUPPORTED;
  }
  return {
    installed,
    compatible,
    architecture: 'x64',
    detectedVersion: version,
    requiredPolicy: policy.minimumVersion,
    evidence: [registry, ...dlls],
    reasonCode,
    state,
    checkedAt,
  };
}

function getAuthenticodeSignature(filePath) {
  const script = `$s=Get-AuthenticodeSignature -LiteralPath '${filePath.replace(/'/g, "''")}'; [pscustomobject]@{Status=$s.Status.ToString();Signer=$s.SignerCertificate.Subject} | ConvertTo-Json`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    return { status: 'Unknown', signer: null, error: result.stderr || result.stdout };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return { status: parsed.Status, signer: parsed.Signer };
  } catch (error) {
    return { status: 'Unknown', signer: null, error: error.message };
  }
}

function assertSafePayloadPath(root, payloadPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPayload = path.resolve(payloadPath);
  const relative = path.relative(resolvedRoot, resolvedPayload);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw codeError(
      'VC_RUNTIME_PAYLOAD_PATH_REJECTED',
      'Microsoft Visual C++ Runtime payload must be inside the approved prerequisite root.',
      { payloadPath }
    );
  }
}

function verifyVcRuntimePayload({ root = defaultPrerequisiteRoot(), manifest = null } = {}) {
  const loaded = manifest
    ? { ok: true, manifestPath: path.join(root, 'manifest.json'), manifest }
    : readManifest(root);
  if (!loaded.ok) return loaded;
  const record = loaded.manifest;
  const payloadPath = path.join(root, record.filename || '');
  try {
    assertSafePayloadPath(root, payloadPath);
  } catch (error) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: error.code,
      message: error.message,
    };
  }
  if (path.basename(payloadPath) !== record.filename) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_PAYLOAD_FILENAME_MISMATCH',
    };
  }
  if (!fs.existsSync(payloadPath)) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.INSTALLATION_REQUIRED,
      code: 'VC_RUNTIME_PAYLOAD_MISSING',
      payloadPath,
      manifest: record,
    };
  }
  const digest = sha256File(payloadPath);
  if (digest !== String(record.sha256 || '').toLowerCase()) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_PAYLOAD_HASH_MISMATCH',
      expected: record.sha256,
      actual: digest,
    };
  }
  let pe = null;
  try {
    pe = parsePeArchitecture(payloadPath);
  } catch (error) {
    pe = { architecture: 'unknown', error: error.message };
  }
  const signature = getAuthenticodeSignature(payloadPath);
  if (signature.status !== 'Valid') {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_SIGNATURE_INVALID',
      signature,
    };
  }
  if (!String(signature.signer || '').includes(record.expectedSigner || 'Microsoft Corporation')) {
    return {
      ok: false,
      state: VC_RUNTIME_STATES.BLOCKED,
      code: 'VC_RUNTIME_SIGNER_INVALID',
      signature,
    };
  }
  return {
    ok: true,
    state: VC_RUNTIME_STATES.PAYLOAD_VERIFIED,
    code: 'VC_RUNTIME_PAYLOAD_VERIFIED',
    payloadPath,
    digest,
    size: fs.statSync(payloadPath).size,
    manifest: record,
    pe,
    signature,
    fileVersion: getFileVersion(payloadPath),
  };
}

function runInstaller(command, args, options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    let pid = null;
    let processCreated = false;
    const child = spawn(command, args, {
      cwd: options.cwd || path.dirname(command),
      env: { ...process.env, ...(options.env || {}) },
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
        pid,
        processCreated,
        exitCode: null,
        signal: 'SIGKILL',
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
        error: {
          code: 'VC_RUNTIME_INSTALL_TIMEOUT',
          message: 'Visual C++ Runtime installation timed out.',
        },
      });
    }, options.timeoutMs || INSTALL_TIMEOUT_MS);
    child.on('spawn', () => {
      processCreated = true;
      pid = child.pid || pid;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        pid,
        processCreated,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
        error: { code: error.code || 'VC_RUNTIME_INSTALL_FAILED', message: error.message },
      });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        args,
        pid,
        processCreated,
        exitCode,
        signal,
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
      });
    });
  });
}

function classifyInstallResult(exitCode, manifest) {
  if ((manifest.successExitCodes || [0]).includes(exitCode)) {
    return {
      ok: true,
      state: VC_RUNTIME_STATES.INSTALLED,
      code: 'VC_RUNTIME_INSTALLED',
      restartRequired: false,
    };
  }
  if ((manifest.restartRequiredExitCodes || [3010, 1641]).includes(exitCode)) {
    return {
      ok: true,
      state: VC_RUNTIME_STATES.RESTART_REQUIRED,
      code: 'VC_RUNTIME_INSTALL_RESTART_REQUIRED',
      restartRequired: true,
    };
  }
  const mapped = manifest.knownFailureExitCodes?.[String(exitCode)];
  return {
    ok: false,
    state: VC_RUNTIME_STATES.INSTALLATION_FAILED,
    code: mapped || 'VC_RUNTIME_INSTALL_FAILED',
    restartRequired: false,
  };
}

async function installVcRuntimePrerequisite({
  root = defaultPrerequisiteRoot(),
  logPath = null,
} = {}) {
  const detection = detectVcRuntime({ manifestRoot: root });
  if (detection.compatible) {
    return {
      ok: true,
      code: 'VC_RUNTIME_ALREADY_AVAILABLE',
      state: VC_RUNTIME_STATES.AVAILABLE,
      detection,
      installed: false,
    };
  }
  const payload = verifyVcRuntimePayload({ root });
  if (!payload.ok) {
    return {
      ok: false,
      code: payload.code,
      state: payload.state || VC_RUNTIME_STATES.BLOCKED,
      payload,
      detection,
    };
  }
  const args = [...payload.manifest.silentArguments];
  if (logPath) args.push('/log', logPath);
  const result = await runInstaller(payload.payloadPath, args);
  const classified = classifyInstallResult(result.exitCode, payload.manifest);
  const postInstallDetection = detectVcRuntime({ manifestRoot: root });
  const ok = classified.ok && (classified.restartRequired || postInstallDetection.compatible);
  if (classified.restartRequired) {
    return {
      ok: false,
      code: classified.code,
      state: VC_RUNTIME_STATES.RESTART_REQUIRED,
      payload,
      detection,
      install: result,
      postInstallDetection,
      restartRequired: true,
    };
  }
  if (!ok) {
    return {
      ok: false,
      code: postInstallDetection.compatible ? classified.code : 'VC_RUNTIME_POST_VERIFY_FAILED',
      state: VC_RUNTIME_STATES.VERIFICATION_FAILED,
      payload,
      detection,
      install: result,
      postInstallDetection,
    };
  }
  return {
    ok: true,
    code: classified.code,
    state: VC_RUNTIME_STATES.AVAILABLE,
    payload,
    detection,
    install: result,
    postInstallDetection,
    restartRequired: false,
  };
}

function assessVcRuntimePrerequisite({ root = defaultPrerequisiteRoot() } = {}) {
  const manifest = readManifest(root);
  const detection = detectVcRuntime({ manifestRoot: root, manifest: manifest.manifest });
  const payload = verifyVcRuntimePayload({ root, manifest: manifest.manifest });
  return {
    ok: detection.compatible,
    state: detection.state,
    code: detection.reasonCode,
    manifest: manifest.ok ? manifest.manifest : null,
    manifestPath: manifest.manifestPath,
    detection,
    payload: payload.ok
      ? {
          ok: true,
          code: payload.code,
          state: payload.state,
          digest: payload.digest,
          size: payload.size,
          fileVersion: payload.fileVersion,
          signature: payload.signature,
        }
      : payload,
    readiness: {
      provisioningBlocked: !detection.compatible,
      installActionAllowed: false,
      productionActivationEnabled: false,
    },
  };
}

module.exports = {
  EXTERNAL_INPUT_ROOT,
  MANIFEST_RELATIVE_PATH,
  VC_RUNTIME_STATES,
  assessVcRuntimePrerequisite,
  classifyInstallResult,
  compareVersions,
  defaultPrerequisiteRoot,
  detectVcRuntime,
  externalPrerequisiteRoot,
  installVcRuntimePrerequisite,
  readManifest,
  verifyVcRuntimePayload,
};
