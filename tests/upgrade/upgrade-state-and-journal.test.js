const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const journalStore = require('../../src/main/upgrade/upgrade-journal.store');
const upgradeService = require('../../src/main/upgrade/upgrade.service');
const { UPGRADE_STATES, assertTransition } = require('../../src/main/upgrade/upgrade-state.model');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-pos-upgrade-journal-'));
}

const identity = {
  installationId: 'installation-a',
  clusterId: 'cluster-a',
  databaseId: 'database-a',
  databaseName: 'enterprise_pos',
  fingerprint: 'fingerprint-a',
  schemaVersion: 1,
};

test('upgrade state machine rejects impossible transitions', () => {
  assert.doesNotThrow(() =>
    assertTransition(
      UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED,
      UPGRADE_STATES.PRE_UPGRADE_BACKUP_IN_PROGRESS
    )
  );
  assert.throws(
    () => assertTransition(UPGRADE_STATES.FRESH_INSTALL, UPGRADE_STATES.MIGRATION_IN_PROGRESS),
    /Invalid upgrade transition/
  );
});

test('upgrade journal writes atomically with integrity and redacted identity', () => {
  const dir = tempDir();
  const journal = journalStore.createJournal({
    installationIdentity: identity,
    databaseIdentity: identity,
    sourceVersion: '1.0.0',
    targetVersion: '1.1.0',
    postgresMajor: 17,
  });
  const written = journalStore.writeJournal(dir, journal);
  assert.equal(written.ok, true);

  const loaded = journalStore.readJournal(dir);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.journal.sourceVersion, '1.0.0');
  assert.equal(loaded.journal.targetVersion, '1.1.0');
  assert.notEqual(loaded.journal.installationIdentity.installationId, identity.installationId);
  assert.equal(JSON.stringify(loaded.journal).includes('secret'), false);
  assert.equal(journalStore.bindMatches(loaded.journal, identity), true);
});

test('completed upgrade journal survives JSON round trip with optional fields', () => {
  const dir = tempDir();
  const journal = journalStore.createJournal({
    installationIdentity: identity,
    databaseIdentity: identity,
    sourceVersion: '1.0.0',
    targetVersion: '1.1.0',
    postgresMajor: 17,
  });
  const completed = {
    ...journal,
    state: UPGRADE_STATES.UPGRADE_COMPLETED,
    backup: {
      backupId: 'backup-a',
      fileName: 'enterprise-pos-pre-upgrade-1.0.0-to-1.1.0.json',
      sha256: 'a'.repeat(64),
      manifestHash: 'b'.repeat(64),
      verificationStatus: undefined,
    },
    migrationLedger: {
      pending: [],
      applied: [],
      validation: {
        counts: {
          users: 1,
          products: 1,
          invoices: null,
        },
      },
    },
    completedAt: '2026-07-23T15:00:00.000Z',
    updatedAt: '2026-07-23T15:00:00.000Z',
  };

  journalStore.writeJournal(dir, completed);
  const loaded = journalStore.readJournal(dir);

  assert.equal(loaded.ok, true);
  assert.equal(loaded.journal.state, UPGRADE_STATES.UPGRADE_COMPLETED);
  assert.equal(loaded.journal.backup.verificationStatus, undefined);
});

test('upgrade journal corruption fails closed', () => {
  const dir = tempDir();
  const journal = journalStore.createJournal({
    installationIdentity: identity,
    databaseIdentity: identity,
    sourceVersion: '1.0.0',
    targetVersion: '1.1.0',
    postgresMajor: 17,
  });
  journalStore.writeJournal(dir, journal);
  const target = journalStore.journalPath(dir);
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  parsed.state = UPGRADE_STATES.UPGRADE_COMPLETED;
  fs.writeFileSync(target, JSON.stringify(parsed, null, 2));

  const loaded = journalStore.readJournal(dir);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.code, 'UPGRADE_JOURNAL_CORRUPT');
});

test('upgrade certification checkpoint is inert unless explicitly requested', async () => {
  const dir = tempDir();
  const marker = path.join(dir, 'checkpoint.json');
  const previousCheckpoint = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT;
  const previousMarker = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE;
  const previousRelease = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE;
  delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT;
  process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE = marker;
  delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE;

  try {
    const result = await upgradeService.waitForCertificationCheckpoint(
      'after-pre-upgrade-backup-verified',
      { userDataPath: dir }
    );

    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    if (previousCheckpoint === undefined) delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT = previousCheckpoint;
    if (previousMarker === undefined)
      delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE = previousMarker;
    if (previousRelease === undefined)
      delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE = previousRelease;
  }
});

test('upgrade certification checkpoint writes non-secret marker when explicitly requested', async () => {
  const dir = tempDir();
  const marker = path.join(dir, 'checkpoint.json');
  const release = path.join(dir, 'release.txt');
  fs.writeFileSync(release, 'release');
  const previousCheckpoint = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT;
  const previousMarker = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE;
  const previousRelease = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE;
  process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT = 'after-pre-upgrade-backup-verified';
  process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE = marker;
  process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE = release;

  try {
    const result = await upgradeService.waitForCertificationCheckpoint(
      'after-pre-upgrade-backup-verified',
      { userDataPath: dir }
    );
    const parsed = JSON.parse(fs.readFileSync(marker, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(parsed.checkpoint, 'after-pre-upgrade-backup-verified');
    assert.equal(typeof parsed.pid, 'number');
    assert.equal(JSON.stringify(parsed).includes('password'), false);
  } finally {
    if (previousCheckpoint === undefined) delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT = previousCheckpoint;
    if (previousMarker === undefined)
      delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE = previousMarker;
    if (previousRelease === undefined)
      delete process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE;
    else process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE = previousRelease;
  }
});
