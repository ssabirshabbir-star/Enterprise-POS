const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function statFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    sha256: sha256File(filePath),
  };
}

function listFiles(root, base = root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry) => {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(absolute, base);
      }
      if (!entry.isFile()) {
        return [];
      }
      const relativePath = path.relative(base, absolute).replace(/\\/g, '/');
      return [
        {
          relativePath,
          ...statFile(absolute),
        },
      ];
    });
}

function createDirectoryManifest(root) {
  return listFiles(root).sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
}

function compareManifests(left, right) {
  const leftByPath = new Map(left.map((entry) => [entry.relativePath, entry]));
  const rightByPath = new Map(right.map((entry) => [entry.relativePath, entry]));
  const paths = new Set([...leftByPath.keys(), ...rightByPath.keys()]);
  return [...paths]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((relativePath) => {
      const leftEntry = leftByPath.get(relativePath);
      const rightEntry = rightByPath.get(relativePath);
      if (
        leftEntry &&
        rightEntry &&
        leftEntry.size === rightEntry.size &&
        leftEntry.sha256 === rightEntry.sha256
      ) {
        return null;
      }
      return {
        relativePath,
        left: leftEntry || null,
        right: rightEntry || null,
      };
    })
    .filter(Boolean);
}

function requireExistingPath(name, value) {
  if (!value || !fs.existsSync(value)) {
    throw new Error(`${name} does not exist: ${value || '<missing>'}`);
  }
}

function assessInstallerReproducibility(options) {
  const {
    leftInstaller,
    rightInstaller,
    leftUnpacked,
    rightUnpacked,
    leftAsar = path.join(leftUnpacked || '', 'resources', 'app.asar'),
    rightAsar = path.join(rightUnpacked || '', 'resources', 'app.asar'),
  } = options;

  requireExistingPath('leftInstaller', leftInstaller);
  requireExistingPath('rightInstaller', rightInstaller);
  requireExistingPath('leftUnpacked', leftUnpacked);
  requireExistingPath('rightUnpacked', rightUnpacked);
  requireExistingPath('leftAsar', leftAsar);
  requireExistingPath('rightAsar', rightAsar);

  const leftInstallerHash = statFile(leftInstaller);
  const rightInstallerHash = statFile(rightInstaller);
  const leftAsarHash = statFile(leftAsar);
  const rightAsarHash = statFile(rightAsar);
  const leftManifest = createDirectoryManifest(leftUnpacked);
  const rightManifest = createDirectoryManifest(rightUnpacked);
  const payloadDifferences = compareManifests(leftManifest, rightManifest);
  const installerByteIdentical =
    leftInstallerHash.size === rightInstallerHash.size &&
    leftInstallerHash.sha256 === rightInstallerHash.sha256;
  const asarByteIdentical =
    leftAsarHash.size === rightAsarHash.size && leftAsarHash.sha256 === rightAsarHash.sha256;
  const packagedPayloadByteIdentical = asarByteIdentical && payloadDifferences.length === 0;

  let decision = 'FAIL';
  let firstDifferingLayer = 'PACKAGED_APPLICATION';
  if (installerByteIdentical && packagedPayloadByteIdentical) {
    decision = 'STRICT_REPRODUCIBILITY_PASS';
    firstDifferingLayer = 'NONE';
  } else if (packagedPayloadByteIdentical) {
    decision = 'PAYLOAD_REPRODUCIBILITY_PASS';
    firstDifferingLayer = 'NSIS_WRAPPER';
  }

  return {
    decision,
    phase1Pass: decision !== 'FAIL',
    installerByteIdentical,
    packagedPayloadByteIdentical,
    asarByteIdentical,
    firstDifferingLayer,
    policy:
      decision === 'PAYLOAD_REPRODUCIBILITY_PASS'
        ? 'Unsigned NSIS wrapper hashes are diagnostic; final release provenance must bind the reproducible packaged payload and final signed artifact hash.'
        : 'Strict byte reproducibility applies when the complete installer files match.',
    installers: {
      left: leftInstallerHash,
      right: rightInstallerHash,
    },
    appAsar: {
      left: leftAsarHash,
      right: rightAsarHash,
    },
    unpackedPayload: {
      leftFileCount: leftManifest.length,
      rightFileCount: rightManifest.length,
      differenceCount: payloadDifferences.length,
      firstDifference: payloadDifferences[0] || null,
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${key || '<end>'}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const result = assessInstallerReproducibility({
    leftInstaller: args['left-installer'],
    rightInstaller: args['right-installer'],
    leftUnpacked: args['left-unpacked'],
    rightUnpacked: args['right-unpacked'],
    leftAsar: args['left-asar'],
    rightAsar: args['right-asar'],
  });
  const serialized = JSON.stringify(result, null, 2);
  if (args['json-out']) {
    fs.writeFileSync(args['json-out'], `${serialized}\n`);
  }
  process.stdout.write(`${serialized}\n`);
  process.exitCode = result.phase1Pass ? 0 : 1;
}

module.exports = {
  assessInstallerReproducibility,
  compareManifests,
  createDirectoryManifest,
  sha256File,
};
