const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('managed production restore engine preserves destination identity and consumes confirmation before mutation', () => {
  const engine = read('src/main/features/restore-engine/restore-production-managed-engine.js');
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');

  const engineBody = engine.slice(
    engine.indexOf('async function executeManagedProductionRestore'),
    engine.indexOf('module.exports')
  );

  assert.match(engineBody, /getManagedDatabaseIdentity/);
  assert.match(engineBody, /consumeRestoreFinalConfirmation/);
  assert.match(engineBody, /applyPackageToPoolAndVerify/);
  assert.match(engineBody, /useTruncate:\s*false/);
  assert(
    engineBody.indexOf('consumeRestoreFinalConfirmation') <
      engineBody.indexOf('applyPackageToPoolAndVerify')
  );
  assert.match(engineBody, /validateManagedDatabaseIdentity/);
  assert.match(engineBody, /ROLLBACK_IN_PROGRESS/);
  assert.match(engineBody, /MANUAL_RECOVERY_REQUIRED/);

  assert.match(adapter, /managedDatabaseIdentity/);
  assert.match(adapter, /managed_database_identity/);
  assert(
    adapter.indexOf('withoutSourceManagedIdentity') <
      adapter.indexOf('restoredData.app_settings = withoutSourceManagedIdentity')
  );
});

test('production execution service has a real default managed engine with guarded feature activation', () => {
  const service = read('src/main/features/restore-engine/restore-production-execution.service.js');

  assert.match(service, /restore-production-managed-engine/);
  assert.match(service, /PRODUCTION_RESTORE_FEATURE_ENABLED = true/);
  assert.match(service, /production-activation\.json/);
  assert.match(service, /validateManagedDatabaseIdentity/);
  assert.match(service, /managed_database_identity/);
  assert.match(service, /RESTORE_FINAL_CONFIRMATION_REQUIRED/);
  assert.match(service, /RESTORE_SAFETY_BACKUP_REQUIRED/);
});

test('restore adapter recovers from denied replication-role probe before ordered restore fallback', () => {
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');
  const suspendBody = adapter.slice(
    adapter.indexOf('async function suspendForeignKeyChecks'),
    adapter.indexOf('async function orderedTablesForDatabase')
  );

  assert.match(suspendBody, /SAVEPOINT restore_session_replication_role_probe/);
  assert.match(suspendBody, /SET LOCAL session_replication_role = replica/);
  assert.match(suspendBody, /ROLLBACK TO SAVEPOINT restore_session_replication_role_probe/);
  assert.match(suspendBody, /RELEASE SAVEPOINT restore_session_replication_role_probe/);
  assert(
    suspendBody.indexOf('ROLLBACK TO SAVEPOINT restore_session_replication_role_probe') >
      suspendBody.indexOf('catch')
  );
});

test('production restore preserves live operation controls without truncate cascade', () => {
  const engine = read('src/main/features/restore-engine/restore-production-managed-engine.js');
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');
  const engineBody = engine.slice(
    engine.indexOf('async function executeManagedProductionRestore'),
    engine.indexOf('module.exports')
  );
  const mutationBody = adapter.slice(
    adapter.indexOf('async function deleteAndInsertTables'),
    adapter.indexOf('async function suspendForeignKeyChecks')
  );

  assert.match(engineBody, /useTruncate:\s*false/);
  assert.doesNotMatch(
    engineBody,
    /useTruncate:\s*true/,
    'production restore must not cascade-delete live restore operation controls'
  );
  assert.match(mutationBody, /if \(useTruncate\)/);
  assert.match(mutationBody, /TRUNCATE \$\{truncatedTables\} RESTART IDENTITY CASCADE/);
  assert.match(mutationBody, /DELETE FROM \$\{quoteIdentifier\(tableName\)\}/);
});

test('restore adapter defers manifest foreign keys for cyclic packaged restores', () => {
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');
  const mutationBody = adapter.slice(
    adapter.indexOf('async function deleteAndInsertTables'),
    adapter.indexOf('async function suspendForeignKeyChecks')
  );
  const deferBody = adapter.slice(
    adapter.indexOf('async function deferManifestForeignKeyChecks'),
    adapter.indexOf('async function orderedTablesForDatabase')
  );

  assert.match(mutationBody, /deferManifestForeignKeyChecks\(client, tableNames\)/);
  assert.match(
    mutationBody,
    /const constraintsRelaxed = constraintsSuspended \|\| constraintsDeferred/
  );
  assert.match(deferBody, /constraint_info\.contype = 'f'/);
  assert.match(deferBody, /child\.relname = ANY\(\$1::text\[\]\)/);
  assert.match(deferBody, /parent\.relname = ANY\(\$1::text\[\]\)/);
  assert.match(deferBody, /ALTER TABLE \$\{quoteIdentifier\(row\.child_table\)\} ALTER CONSTRAINT/);
  assert.match(deferBody, /DEFERRABLE INITIALLY IMMEDIATE/);
  assert.match(deferBody, /SET CONSTRAINTS ALL DEFERRED/);
});

test('restore adapter preserves live operation audit rows in place during production mutation', () => {
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');
  const keySetBody = adapter.slice(
    adapter.indexOf('function preservedRowKeySets'),
    adapter.indexOf('async function deleteAndInsertTables')
  );
  const mutationBody = adapter.slice(
    adapter.indexOf('async function deleteAndInsertTables'),
    adapter.indexOf('async function suspendForeignKeyChecks')
  );

  assert.match(keySetBody, /tableName === 'backup_logs' \|\| tableName === 'activity_logs'/);
  assert.match(mutationBody, /const preservedKeys = preservedRowKeySets\(preservedRows\)/);
  assert.match(mutationBody, /WHERE NOT \(\$\{quoteIdentifier\(\s*'id'\s*\)\}::text = ANY/);
  assert.match(mutationBody, /data\[tableName\]\.filter/);
  assert.match(mutationBody, /!tablePreservedKeys\.has\(String\(row\?\.id/);
});
