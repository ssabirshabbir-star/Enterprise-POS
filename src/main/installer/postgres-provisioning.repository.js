const fs = require('fs');
const path = require('path');

const { redactProvisioningOperation } = require('./postgres-provisioning.model');

const JOURNAL_FILE = 'postgres-provisioning-journal.json';
const LOG_FILE = 'postgres-provisioning-events.jsonl';

function journalPath(userDataPath) {
  return path.join(userDataPath, JOURNAL_FILE);
}

function readJournal(userDataPath) {
  const target = journalPath(userDataPath);
  if (!fs.existsSync(target)) {
    return { version: 1, operations: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  return {
    version: parsed.version || 1,
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
  };
}

function writeJournal(userDataPath, journal) {
  const target = journalPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  return target;
}

function logPath(userDataPath) {
  return path.join(userDataPath, LOG_FILE);
}

function saveProvisioningOperation(userDataPath, operation) {
  const journal = readJournal(userDataPath);
  const index = journal.operations.findIndex(
    (entry) => entry.operationId === operation.operationId
  );
  if (index >= 0) journal.operations[index] = operation;
  else journal.operations.push(operation);
  const pathWritten = writeJournal(userDataPath, journal);
  return { ok: true, path: pathWritten, operation: redactProvisioningOperation(operation) };
}

function getProvisioningOperation(userDataPath, operationId) {
  const journal = readJournal(userDataPath);
  return journal.operations.find((entry) => entry.operationId === operationId) || null;
}

function getLatestProvisioningOperation(userDataPath) {
  const journal = readJournal(userDataPath);
  return (
    [...journal.operations].sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    )[0] || null
  );
}

function appendProvisioningLog(userDataPath, entry) {
  const target = logPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return { ok: true, path: target };
}

function readProvisioningLogs(userDataPath) {
  const target = logPath(userDataPath);
  if (!fs.existsSync(target)) return [];
  return fs
    .readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = {
  JOURNAL_FILE,
  LOG_FILE,
  appendProvisioningLog,
  getLatestProvisioningOperation,
  getProvisioningOperation,
  journalPath,
  logPath,
  readJournal,
  readProvisioningLogs,
  saveProvisioningOperation,
};
