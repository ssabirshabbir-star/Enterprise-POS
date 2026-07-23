const assert = require('assert');
const test = require('node:test');

const {
  MIGRATION_CLASSIFICATION,
  pendingMigrations,
  runDatabaseMigrations,
} = require('../../src/main/database/migrations');

function fakeClient() {
  const applied = new Set();
  return {
    applied,
    inserts: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('CREATE TABLE IF NOT EXISTS schema_migration_ledger')) {
        return { rows: [] };
      }
      if (text.startsWith('SELECT migration_id FROM schema_migration_ledger')) {
        return { rows: Array.from(applied).map((migration_id) => ({ migration_id })) };
      }
      if (text.startsWith('INSERT INTO schema_migration_ledger')) {
        applied.add(params[0]);
        this.inserts.push(params);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
}

test('migration ledger applies pending migrations once', async () => {
  const client = fakeClient();
  let executions = 0;
  const migration = {
    id: '20260723_add_upgrade_probe',
    classification: MIGRATION_CLASSIFICATION.NON_DESTRUCTIVE,
    async up() {
      executions += 1;
    },
  };

  const first = await runDatabaseMigrations(client, { migrations: [migration] });
  const second = await runDatabaseMigrations(client, { migrations: [migration] });

  assert.deepEqual(first.executed, ['20260723_add_upgrade_probe']);
  assert.deepEqual(second.executed, []);
  assert.equal(executions, 1);
  assert.equal(client.inserts.length, 1);
});

test('schema-changing migration is blocked without verified pre-upgrade backup', async () => {
  const client = fakeClient();
  const migration = {
    id: '20260723_destructive_probe',
    schemaChanging: true,
    classification: MIGRATION_CLASSIFICATION.POTENTIALLY_DESTRUCTIVE,
    async up() {},
  };

  await assert.rejects(
    () =>
      runDatabaseMigrations(client, {
        requireVerifiedBackupForSchemaChange: true,
        migrations: [migration],
      }),
    /Verified pre-upgrade backup/
  );
});

test('schema-changing migration records verified backup binding', async () => {
  const client = fakeClient();
  const migration = {
    id: '20260723_bound_probe',
    schemaChanging: true,
    classification: MIGRATION_CLASSIFICATION.POTENTIALLY_DESTRUCTIVE,
    async up() {},
  };

  const result = await runDatabaseMigrations(client, {
    sourceVersion: '1.0.0',
    targetVersion: '1.1.0',
    requireVerifiedBackupForSchemaChange: true,
    preUpgradeBackupVerified: true,
    backup: {
      backupId: '11111111-1111-4111-8111-111111111111',
      manifestHash: 'manifest-hash',
    },
    upgradeOperationId: '22222222-2222-4222-8222-222222222222',
    migrations: [migration],
  });
  const pending = await pendingMigrations(client, [migration]);

  assert.deepEqual(result.executed, ['20260723_bound_probe']);
  assert.equal(client.inserts[0][4], '11111111-1111-4111-8111-111111111111');
  assert.equal(client.inserts[0][5], 'manifest-hash');
  assert.equal(client.inserts[0][6], '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(pending, []);
});
