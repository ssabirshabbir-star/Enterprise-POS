const { getPool, withTransaction } = require('../../database/connection');

async function upsertDevice(machine, appVersion) {
  await getPool().query(
    `
      INSERT INTO device_registrations (machine_id, machine_name, platform, arch, app_version, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (machine_id)
      DO UPDATE SET machine_name = EXCLUDED.machine_name, platform = EXCLUDED.platform,
        arch = EXCLUDED.arch, app_version = EXCLUDED.app_version, last_seen_at = NOW()
    `,
    [machine.machineId, machine.machineName, machine.platform, machine.arch, appVersion]
  );
}

async function getLicense(machineId) {
  const result = await getPool().query(
    'SELECT * FROM licenses WHERE machine_id = $1 ORDER BY updated_at DESC LIMIT 1',
    [machineId]
  );
  return result.rows[0] || null;
}

async function saveLicense(payload) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM licenses WHERE machine_id = $1 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE', [payload.machineId]);
    if (existing.rows[0]) {
      await client.query(
        `
          UPDATE licenses
          SET license_key_hash = $2, license_status = $3, activation_state = $4,
              activated_at = COALESCE(activated_at, $5), expires_at = $6, trial_ends_at = $7,
              last_verified_at = NOW(), verification_payload = $8::jsonb, cache_signature = $9, updated_at = NOW()
          WHERE id = $1
        `,
        [existing.rows[0].id, payload.licenseKeyHash, payload.licenseStatus, payload.activationState, payload.activatedAt, payload.expiresAt, payload.trialEndsAt, JSON.stringify(payload.verificationPayload || {}), payload.cacheSignature]
      );
      return existing.rows[0].id;
    }
    const result = await client.query(
      `
        INSERT INTO licenses (
          machine_id, license_key_hash, license_status, activation_state, activated_at,
          expires_at, trial_ends_at, last_verified_at, verification_payload, cache_signature
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8::jsonb, $9)
        RETURNING id
      `,
      [payload.machineId, payload.licenseKeyHash, payload.licenseStatus, payload.activationState, payload.activatedAt, payload.expiresAt, payload.trialEndsAt, JSON.stringify(payload.verificationPayload || {}), payload.cacheSignature]
    );
    return result.rows[0].id;
  });
}

async function logUpdateCheck(payload) {
  await getPool().query(
    `
      INSERT INTO update_checks (current_version, latest_version, status, provider, message, checked_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [payload.currentVersion, payload.latestVersion || null, payload.status, payload.provider, payload.message || null, payload.userId || null]
  );
}

module.exports = {
  getLicense,
  logUpdateCheck,
  saveLicense,
  upsertDevice
};
