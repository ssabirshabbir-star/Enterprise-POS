const fs = require('fs');
const path = require('path');

const { redactProvisioningOperation } = require('./postgres-provisioning.model');

const JOURNAL_FILE = 'postgres-provisioning-journal.json';

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

module.exports = {
  JOURNAL_FILE,
  getLatestProvisioningOperation,
  getProvisioningOperation,
  journalPath,
  readJournal,
  saveProvisioningOperation,
};
