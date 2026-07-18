const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const { readManifest, sha256File } = require('./postgres-payload-verifier');
const { getManagedPostgresPolicy } = require('./postgres-version-policy');

const REQUIRED_EXECUTABLES = Object.freeze([
  'pgsql/bin/postgres.exe',
  'pgsql/bin/initdb.exe',
  'pgsql/bin/pg_ctl.exe',
  'pgsql/bin/psql.exe',
  'pgsql/bin/createdb.exe',
]);

const REQUIRED_DIRECTORIES = Object.freeze(['pgsql/lib/', 'pgsql/share/']);
const REQUIRED_LICENSES = Object.freeze([
  'pgsql/server_license.txt',
  'pgsql/commandlinetools_3rd_party_licenses.txt',
]);
const INCLUDED_PREFIXES = Object.freeze(['pgsql/bin/', 'pgsql/lib/', 'pgsql/share/']);
const INCLUDED_FILES = Object.freeze([...REQUIRED_LICENSES]);
const EXCLUDED_PREFIXES = Object.freeze(['pgsql/pgAdmin 4/', 'pgsql/StackBuilder/']);

function codeError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function normalizeZipEntryName(name = '') {
  const normalized = String(name).replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw codeError(
      'INSTALLER_POSTGRES_ZIP_PATH_TRAVERSAL',
      'PostgreSQL archive contains an unsafe path.',
      {
        entryName: name,
      }
    );
  }
  return normalized;
}

function isDirectoryEntry(entryName) {
  return String(entryName).endsWith('/');
}

function shouldStageEntry(entryName) {
  if (EXCLUDED_PREFIXES.some((prefix) => entryName.startsWith(prefix))) return false;
  return (
    INCLUDED_FILES.includes(entryName) ||
    INCLUDED_PREFIXES.some((prefix) => entryName.startsWith(prefix))
  );
}

function assertSafeDestination(stagingRoot, entryName) {
  const root = path.resolve(stagingRoot);
  const destination = path.resolve(root, entryName);
  const relative = path.relative(root, destination);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw codeError(
      'INSTALLER_POSTGRES_ZIP_DESTINATION_ESCAPE',
      'PostgreSQL archive entry would escape the staging root.',
      { entryName, destination }
    );
  }
  return destination;
}

function openZip(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error) {
        reject(
          codeError('INSTALLER_POSTGRES_ZIP_CORRUPT', 'PostgreSQL archive could not be opened.', {
            causeMessage: error.message,
          })
        );
        return;
      }
      resolve(zipFile);
    });
  });
}

async function inspectPostgresArchive({
  archivePath,
  manifestRoot = path.join(process.cwd(), 'resources', 'postgres'),
} = {}) {
  const manifestResult = readManifest(manifestRoot);
  if (!manifestResult.ok)
    throw codeError(manifestResult.code, 'PostgreSQL payload manifest is missing or invalid.');
  const manifest = manifestResult.manifest;
  const policy = getManagedPostgresPolicy();
  if (!archivePath || !fs.existsSync(archivePath)) {
    throw codeError('INSTALLER_POSTGRES_ARCHIVE_MISSING', 'PostgreSQL archive is missing.', {
      archivePath,
    });
  }
  if (path.basename(archivePath) !== manifest.fileName) {
    throw codeError(
      'INSTALLER_POSTGRES_ARCHIVE_FILENAME_MISMATCH',
      'PostgreSQL archive filename does not match the manifest.',
      {
        expected: manifest.fileName,
        actual: path.basename(archivePath),
      }
    );
  }
  if (manifest.version !== policy.managedVersion || manifest.architecture !== policy.architecture) {
    throw codeError(
      'INSTALLER_POSTGRES_ARCHIVE_POLICY_MISMATCH',
      'PostgreSQL archive does not match the pinned policy.',
      {
        manifestVersion: manifest.version,
        manifestArchitecture: manifest.architecture,
        policy,
      }
    );
  }
  const digest = sha256File(archivePath);
  if (digest !== String(manifest.sha256 || '').toLowerCase()) {
    throw codeError(
      'INSTALLER_POSTGRES_ARCHIVE_CHECKSUM_MISMATCH',
      'PostgreSQL archive SHA-256 does not match the manifest.',
      {
        expected: manifest.sha256,
        actual: digest,
      }
    );
  }

  const zipFile = await openZip(archivePath);
  const entries = [];
  try {
    await new Promise((resolve, reject) => {
      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        try {
          const entryName = normalizeZipEntryName(entry.fileName);
          entries.push({
            name: entryName,
            compressedSize: entry.compressedSize,
            uncompressedSize: entry.uncompressedSize,
            directory: isDirectoryEntry(entryName),
            staged: shouldStageEntry(entryName),
          });
          zipFile.readEntry();
        } catch (error) {
          reject(error);
        }
      });
      zipFile.on('end', resolve);
      zipFile.on('error', (error) =>
        reject(
          codeError('INSTALLER_POSTGRES_ZIP_CORRUPT', 'PostgreSQL archive read failed.', {
            causeMessage: error.message,
          })
        )
      );
    });
  } finally {
    zipFile.close();
  }

  const names = new Set(entries.map((entry) => entry.name));
  if (![...names].some((name) => name.startsWith('pgsql/'))) {
    throw codeError(
      'INSTALLER_POSTGRES_ARCHIVE_ROOT_INVALID',
      'PostgreSQL archive root layout is not pgsql/.'
    );
  }
  const missingExecutables = REQUIRED_EXECUTABLES.filter((entry) => !names.has(entry));
  if (missingExecutables.length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_REQUIRED_EXECUTABLE_MISSING',
      'PostgreSQL archive is missing required executables.',
      {
        missing: missingExecutables,
      }
    );
  }
  const missingDirectories = REQUIRED_DIRECTORIES.filter(
    (prefix) => !entries.some((entry) => entry.name.startsWith(prefix))
  );
  if (missingDirectories.length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_REQUIRED_DIRECTORY_MISSING',
      'PostgreSQL archive is missing required directories.',
      {
        missing: missingDirectories,
      }
    );
  }
  const missingLicenses = REQUIRED_LICENSES.filter((entry) => !names.has(entry));
  if (missingLicenses.length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_REQUIRED_LICENSE_MISSING',
      'PostgreSQL archive is missing required license notices.',
      {
        missing: missingLicenses,
      }
    );
  }

  return {
    ok: true,
    archivePath,
    digest,
    manifest,
    entryCount: entries.length,
    stagedEntryCount: entries.filter((entry) => entry.staged).length,
    requiredExecutables: REQUIRED_EXECUTABLES,
    requiredLicenses: REQUIRED_LICENSES,
    includesPgAdmin: entries.some((entry) => entry.name.startsWith('pgsql/pgAdmin 4/')),
    includesStackBuilder: entries.some((entry) => entry.name.startsWith('pgsql/StackBuilder/')),
    entries,
  };
}

async function stagePostgresArchive({
  archivePath,
  stagingRoot,
  manifestRoot = path.join(process.cwd(), 'resources', 'postgres'),
  clean = true,
} = {}) {
  if (!stagingRoot) {
    throw codeError(
      'INSTALLER_POSTGRES_STAGE_ROOT_REQUIRED',
      'PostgreSQL staging root is required.'
    );
  }
  const inspection = await inspectPostgresArchive({ archivePath, manifestRoot });
  const root = path.resolve(stagingRoot);
  if (clean && fs.existsSync(root)) {
    const parent = path.dirname(root);
    if (parent === root || root.length < 10) {
      throw codeError('INSTALLER_POSTGRES_STAGE_ROOT_UNSAFE', 'PostgreSQL staging root is unsafe.');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.mkdirSync(root, { recursive: true });

  const zipFile = await openZip(archivePath);
  let extractedCount = 0;
  try {
    await new Promise((resolve, reject) => {
      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        let entryName;
        try {
          entryName = normalizeZipEntryName(entry.fileName);
          if (!shouldStageEntry(entryName)) {
            zipFile.readEntry();
            return;
          }
          const destination = assertSafeDestination(root, entryName);
          if (isDirectoryEntry(entryName)) {
            fs.mkdirSync(destination, { recursive: true });
            zipFile.readEntry();
            return;
          }
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          zipFile.openReadStream(entry, (error, readStream) => {
            if (error) {
              reject(
                codeError(
                  'INSTALLER_POSTGRES_ZIP_CORRUPT',
                  'PostgreSQL archive entry could not be read.',
                  {
                    entryName,
                    causeMessage: error.message,
                  }
                )
              );
              return;
            }
            const writeStream = fs.createWriteStream(destination, { mode: 0o644 });
            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', () => {
              extractedCount += 1;
              zipFile.readEntry();
            });
            readStream.pipe(writeStream);
          });
        } catch (error) {
          reject(error);
        }
      });
      zipFile.on('end', resolve);
      zipFile.on('error', reject);
    });
  } finally {
    zipFile.close();
  }

  const forbiddenExtracted = EXCLUDED_PREFIXES.filter((prefix) =>
    fs.existsSync(path.join(root, prefix))
  );
  if (forbiddenExtracted.length > 0) {
    throw codeError(
      'INSTALLER_POSTGRES_FORBIDDEN_COMPONENT_EXTRACTED',
      'Forbidden PostgreSQL components were staged.',
      {
        forbiddenExtracted,
      }
    );
  }

  return {
    ok: true,
    stagingRoot: root,
    extractedCount,
    digest: inspection.digest,
    requiredExecutables: REQUIRED_EXECUTABLES.map((entry) => path.join(root, entry)),
    requiredLicenses: REQUIRED_LICENSES.map((entry) => path.join(root, entry)),
    omittedComponents: EXCLUDED_PREFIXES,
  };
}

module.exports = {
  EXCLUDED_PREFIXES,
  INCLUDED_FILES,
  INCLUDED_PREFIXES,
  REQUIRED_DIRECTORIES,
  REQUIRED_EXECUTABLES,
  REQUIRED_LICENSES,
  inspectPostgresArchive,
  normalizeZipEntryName,
  shouldStageEntry,
  stagePostgresArchive,
};
