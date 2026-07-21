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
