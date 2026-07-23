const MIGRATION_CLASSIFICATION = Object.freeze({
  NON_DESTRUCTIVE: 'NON_DESTRUCTIVE',
  POTENTIALLY_DESTRUCTIVE: 'POTENTIALLY_DESTRUCTIVE',
});

const migrations = [];

async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration_ledger (
      id BIGSERIAL PRIMARY KEY,
      migration_id VARCHAR(160) UNIQUE NOT NULL,
      source_version VARCHAR(40),
      target_version VARCHAR(40),
      classification VARCHAR(40) NOT NULL,
      backup_id UUID,
      backup_manifest_hash VARCHAR(128),
      upgrade_operation_id UUID,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrationIds(client) {
  await ensureMigrationLedger(client);
  const result = await client.query('SELECT migration_id FROM schema_migration_ledger');
  return new Set(result.rows.map((row) => row.migration_id));
}

function normalizeMigration(migration) {
  if (typeof migration === 'function') {
    return {
      id: migration.name || 'anonymous_migration',
      classification: MIGRATION_CLASSIFICATION.NON_DESTRUCTIVE,
      schemaChanging: false,
      up: migration,
    };
  }
  return {
    classification: MIGRATION_CLASSIFICATION.NON_DESTRUCTIVE,
    schemaChanging: false,
    ...migration,
  };
}

function assertMigrationCanRun(migration, context = {}) {
  if (!migration.id || typeof migration.up !== 'function') {
    const error = new Error('Migration must declare an id and up function.');
    error.code = 'MIGRATION_CONTRACT_INVALID';
    throw error;
  }
  const requiresBackup =
    migration.classification === MIGRATION_CLASSIFICATION.POTENTIALLY_DESTRUCTIVE ||
    (migration.schemaChanging === true && context.requireVerifiedBackupForSchemaChange === true);
  if (!requiresBackup) return;
  if (
    context.preUpgradeBackupVerified !== true ||
    !context.backup?.backupId ||
    !context.backup?.manifestHash ||
    !context.upgradeOperationId
  ) {
    const error = new Error('Verified pre-upgrade backup and bound upgrade journal are required.');
    error.code = 'PRE_UPGRADE_BACKUP_REQUIRED';
    error.migrationId = migration.id;
    throw error;
  }
}

async function pendingMigrations(client, migrationList = migrations) {
  const applied = await getAppliedMigrationIds(client);
  return migrationList.map(normalizeMigration).filter((migration) => !applied.has(migration.id));
}

async function runDatabaseMigrations(client, context = {}) {
  await ensureMigrationLedger(client);
  const applied = await getAppliedMigrationIds(client);
  const executed = [];

  for (const rawMigration of context.migrations || migrations) {
    const migration = normalizeMigration(rawMigration);
    if (applied.has(migration.id)) continue;
    assertMigrationCanRun(migration, context);
    await migration.up(client, context);
    await client.query(
      `
        INSERT INTO schema_migration_ledger (
          migration_id,
          source_version,
          target_version,
          classification,
          backup_id,
          backup_manifest_hash,
          upgrade_operation_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        migration.id,
        context.sourceVersion || null,
        context.targetVersion || null,
        migration.classification,
        context.backup?.backupId || null,
        context.backup?.manifestHash || null,
        context.upgradeOperationId || null,
      ]
    );
    applied.add(migration.id);
    executed.push(migration.id);
  }

  return { ok: true, executed };
}

module.exports = {
  MIGRATION_CLASSIFICATION,
  ensureMigrationLedger,
  getAppliedMigrationIds,
  migrations,
  pendingMigrations,
  runDatabaseMigrations,
};
