const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');

const settingsRepository = require('../../src/main/features/settings/settings.repository');

function createFakeBackupPool(options = {}) {
  const events = [];
  const poolQueries = [];
  const releaseCalls = [];
  let clientQueryCount = 0;
  let selectCount = 0;

  const client = {
    async query(sql) {
      clientQueryCount += 1;
      events.push(['client.query', sql]);
      const normalized = String(sql).replace(/\s+/g, ' ').trim();

      if (options.failBegin && normalized.startsWith('BEGIN')) {
        throw new Error('BEGIN_FAILED');
      }
      if (options.failCommit && normalized === 'COMMIT') {
        throw new Error('COMMIT_FAILED');
      }
      if (normalized.startsWith('SELECT * FROM')) {
        selectCount += 1;
        if (options.failTableReadAt === selectCount) {
          throw new Error('TABLE_READ_FAILED');
        }
        const tableMatch = normalized.match(/SELECT \* FROM "([^"]+)"/);
        const tableName = tableMatch?.[1] || 'unknown';
        return {
          rows: [{ id: selectCount, __table: tableName }],
          rowCount: 1,
        };
      }
      if (normalized === 'SELECT version() AS version') {
        return { rows: [{ version: 'PostgreSQL fake snapshot' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      releaseCalls.push(true);
      events.push(['client.release']);
    },
  };

  const pool = {
    events,
    poolQueries,
    releaseCalls,
    get clientQueryCount() {
      return clientQueryCount;
    },
    async connect() {
      events.push(['pool.connect']);
      if (options.failConnect) throw new Error('CONNECT_FAILED');
      return client;
    },
    async query(sql) {
      poolQueries.push(sql);
      events.push(['pool.query', sql]);
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT * FROM') || normalized === 'SELECT version() AS version') {
        throw new Error('SNAPSHOT_READ_USED_POOL');
      }
      if (normalized.startsWith('INSERT INTO backup_logs')) {
        return { rows: [{ id: 9001 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  return pool;
}

async function tempBackupPath() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'epos-backup-snapshot-'));
  return path.join(directory, 'certified-backup.json');
}

function eventIndex(events, predicate) {
  return events.findIndex(predicate);
}

test('certified backup capture uses one read-only repeatable-read client snapshot', async () => {
  const pool = createFakeBackupPool();
  const filePath = await tempBackupPath();

  const result = await settingsRepository.exportBackup(filePath, 42, { pool });
  const written = JSON.parse(await fs.readFile(filePath, 'utf8'));

  assert.equal(result.verificationStatus, 'Passed');
  assert.equal(written.certification.status, 'Backup Certified');
  assert.equal(written.metadata.databaseVersion, 'PostgreSQL fake snapshot');

  const beginIndex = eventIndex(
    pool.events,
    ([type, sql]) =>
      type === 'client.query' &&
      /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/.test(String(sql))
  );
  const firstSelectIndex = eventIndex(
    pool.events,
    ([type, sql]) => type === 'client.query' && String(sql).includes('SELECT * FROM')
  );
  const versionIndex = eventIndex(
    pool.events,
    ([type, sql]) => type === 'client.query' && String(sql).includes('SELECT version() AS version')
  );
  const commitIndex = eventIndex(
    pool.events,
    ([type, sql]) => type === 'client.query' && sql === 'COMMIT'
  );
  const releaseIndex = eventIndex(pool.events, ([type]) => type === 'client.release');
  const logIndex = eventIndex(
    pool.events,
    ([type, sql]) => type === 'pool.query' && String(sql).includes('INSERT INTO backup_logs')
  );

  assert.ok(beginIndex >= 0, 'snapshot transaction must begin');
  assert.ok(firstSelectIndex > beginIndex, 'table reads must happen after BEGIN');
  assert.ok(
    versionIndex > beginIndex && versionIndex < commitIndex,
    'metadata DB read must be inside snapshot'
  );
  assert.ok(commitIndex > firstSelectIndex, 'COMMIT must happen after snapshot reads');
  assert.ok(releaseIndex > commitIndex, 'client must be released after COMMIT');
  assert.ok(
    logIndex > releaseIndex,
    'backup history must be written after snapshot client release'
  );
  assert.equal(pool.releaseCalls.length, 1);
  assert.equal(pool.poolQueries.filter((sql) => String(sql).includes('SELECT * FROM')).length, 0);
});

test('certified backup rolls back and releases the snapshot client on table-read failure', async () => {
  const pool = createFakeBackupPool({ failTableReadAt: 2 });
  const filePath = await tempBackupPath();

  await assert.rejects(
    () => settingsRepository.exportBackup(filePath, 42, { pool }),
    /TABLE_READ_FAILED/
  );

  assert.ok(pool.events.some(([type, sql]) => type === 'client.query' && sql === 'ROLLBACK'));
  assert.ok(!pool.events.some(([type, sql]) => type === 'client.query' && sql === 'COMMIT'));
  assert.equal(pool.releaseCalls.length, 1);
  assert.equal(
    pool.poolQueries.filter((sql) => String(sql).includes('INSERT INTO backup_logs')).length,
    0
  );
  await assert.rejects(() => fs.stat(filePath), /ENOENT/);
});

test('certified backup releases the client when transaction setup fails', async () => {
  const pool = createFakeBackupPool({ failBegin: true });
  const filePath = await tempBackupPath();

  await assert.rejects(
    () => settingsRepository.exportBackup(filePath, 42, { pool }),
    /BEGIN_FAILED/
  );

  assert.ok(!pool.events.some(([type, sql]) => type === 'client.query' && sql === 'ROLLBACK'));
  assert.ok(!pool.events.some(([type, sql]) => type === 'client.query' && sql === 'COMMIT'));
  assert.equal(pool.releaseCalls.length, 1);
  await assert.rejects(() => fs.stat(filePath), /ENOENT/);
});

test('certified backup reports commit failure without writing a package', async () => {
  const pool = createFakeBackupPool({ failCommit: true });
  const filePath = await tempBackupPath();

  await assert.rejects(
    () => settingsRepository.exportBackup(filePath, 42, { pool }),
    /COMMIT_FAILED/
  );

  assert.ok(pool.events.some(([type, sql]) => type === 'client.query' && sql === 'ROLLBACK'));
  assert.equal(pool.releaseCalls.length, 1);
  assert.equal(
    pool.poolQueries.filter((sql) => String(sql).includes('INSERT INTO backup_logs')).length,
    0
  );
  await assert.rejects(() => fs.stat(filePath), /ENOENT/);
});
