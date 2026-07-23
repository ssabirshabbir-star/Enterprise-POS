const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UPGRADE_STATES, assertTransition } = require('./upgrade-state.model');

const JOURNAL_FILE = 'enterprise-pos-upgrade-journal.json';
const JOURNAL_VERSION = 1;

function journalPath(userDataPath) {
  return path.join(userDataPath, JOURNAL_FILE);
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function redactedIdentity(identity = {}) {
  return {
    installationId: identity.installationId ? sha256(identity.installationId).slice(0, 16) : null,
    clusterId: identity.clusterId ? sha256(identity.clusterId).slice(0, 16) : null,
    databaseId: identity.databaseId ? sha256(identity.databaseId).slice(0, 16) : null,
    databaseName: identity.databaseName || identity.database || null,
    fingerprint: identity.fingerprint ? sha256(identity.fingerprint).slice(0, 16) : null,
    schemaVersion: identity.schemaVersion || null,
  };
}

function journalIntegrityPayload(record = {}) {
  const { integrity: _integrity, ...payload } = record;
  return payload;
}

function attachIntegrity(record = {}) {
  return {
    ...record,
    integrity: {
      algorithm: 'sha256-upgrade-journal-v1',
      digest: sha256(stableStringify(journalIntegrityPayload(record))),
    },
  };
}

function verifyIntegrity(record = {}) {
  if (!record.integrity || record.integrity.algorithm !== 'sha256-upgrade-journal-v1') {
    return { ok: false, code: 'UPGRADE_JOURNAL_INTEGRITY_MISSING' };
  }
  const expected = sha256(stableStringify(journalIntegrityPayload(record)));
  if (expected !== record.integrity.digest) {
    return { ok: false, code: 'UPGRADE_JOURNAL_CORRUPT' };
  }
  return { ok: true };
}

function writeJournal(userDataPath, record) {
  const target = journalPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const next = attachIntegrity(record);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return { ok: true, path: target, journal: next };
}

function readJournal(userDataPath) {
  const target = journalPath(userDataPath);
  if (!fs.existsSync(target)) return { ok: false, code: 'UPGRADE_JOURNAL_MISSING', path: target };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return { ok: false, code: 'UPGRADE_JOURNAL_CORRUPT', path: target };
  }
  if (Number(parsed.version) !== JOURNAL_VERSION) {
    return { ok: false, code: 'UPGRADE_JOURNAL_VERSION_UNSUPPORTED', path: target };
  }
  const integrity = verifyIntegrity(parsed);
  if (!integrity.ok) return { ok: false, code: integrity.code, path: target };
  return { ok: true, path: target, journal: parsed };
}

function createJournal({
  installationIdentity,
  databaseIdentity,
  sourceVersion,
  targetVersion,
  postgresMajor,
  state = UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED,
  now = new Date().toISOString(),
} = {}) {
  const operationId = crypto.randomUUID();
  return {
    version: JOURNAL_VERSION,
    operationId,
    state,
    sourceVersion,
    targetVersion,
    postgresMajor,
    installationIdentity: redactedIdentity(installationIdentity),
    databaseIdentity: redactedIdentity(databaseIdentity || installationIdentity),
    backup: null,
    migrationLedger: {
      pending: [],
      applied: [],
    },
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    recoveryStatus: null,
    failure: null,
    events: [
      {
        state,
        at: now,
        reason: 'upgrade_journal_created',
      },
    ],
  };
}

function transitionJournal(journal, nextState, details = {}) {
  assertTransition(journal.state, nextState);
  const now = details.now || new Date().toISOString();
  const next = {
    ...journal,
    state: nextState,
    updatedAt: now,
    completedAt: nextState === UPGRADE_STATES.UPGRADE_COMPLETED ? now : journal.completedAt || null,
    recoveryStatus:
      nextState === UPGRADE_STATES.RECOVERY_REQUIRED
        ? 'manual_or_retry_required'
        : journal.recoveryStatus,
    failure: details.failure || journal.failure || null,
    events: [
      ...(Array.isArray(journal.events) ? journal.events : []),
      {
        state: nextState,
        at: now,
        reason: details.reason || null,
        code: details.code || null,
      },
    ],
  };
  if (details.backup) next.backup = details.backup;
  if (details.migrationLedger) next.migrationLedger = details.migrationLedger;
  return next;
}

function bindMatches(journal = {}, identity = {}) {
  const redacted = redactedIdentity(identity);
  return (
    journal.installationIdentity?.installationId === redacted.installationId &&
    journal.databaseIdentity?.clusterId === redacted.clusterId &&
    journal.databaseIdentity?.databaseId === redacted.databaseId &&
    journal.databaseIdentity?.fingerprint === redacted.fingerprint
  );
}

module.exports = {
  JOURNAL_FILE,
  JOURNAL_VERSION,
  bindMatches,
  createJournal,
  journalPath,
  readJournal,
  redactedIdentity,
  transitionJournal,
  writeJournal,
};
