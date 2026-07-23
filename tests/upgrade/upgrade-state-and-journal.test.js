const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const journalStore = require('../../src/main/upgrade/upgrade-journal.store');
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
