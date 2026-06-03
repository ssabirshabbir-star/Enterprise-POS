const os = require('os');
const crypto = require('crypto');
const { getPool, withTransaction } = require('../../database/connection');

function terminalCode() {
  return String(process.env.POS_TERMINAL_CODE || os.hostname() || 'TERMINAL-1')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .slice(0, 40) || 'TERMINAL-1';
}

async function getOrCreateTerminal(client = getPool()) {
  const code = terminalCode();
  const name = String(process.env.POS_TERMINAL_NAME || code).trim();
  const machineId = os.hostname();
  const result = await client.query(
    `
      INSERT INTO terminals (terminal_code, terminal_name, machine_id, last_seen_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (terminal_code)
      DO UPDATE SET terminal_name = EXCLUDED.terminal_name, machine_id = EXCLUDED.machine_id, last_seen_at = NOW(), updated_at = NOW()
      RETURNING *
    `,
    [code, name, machineId]
  );
  return result.rows[0];
}

function operationUuid({ entityType, entityId, operation, payload = {} }) {
  const source = `${terminalCode()}|${entityType}|${entityId}|${operation}|${JSON.stringify(payload)}`;
  return crypto.createHash('sha256').update(source).digest('hex');
}

async function queueOperation({ client = getPool(), entityType, entityId, operation, payload = {}, terminalId = null, status = 'PENDING' }) {
  const terminal = terminalId ? { id: terminalId } : await getOrCreateTerminal(client);
  const uuid = operationUuid({ entityType, entityId, operation, payload });
  const result = await client.query(
    `
      INSERT INTO offline_queue (operation_uuid, terminal_id, entity_type, entity_id, operation, payload, status)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (entity_type, entity_id, operation)
      DO UPDATE SET
        operation_uuid = EXCLUDED.operation_uuid,
        terminal_id = EXCLUDED.terminal_id,
        payload = EXCLUDED.payload,
        status = EXCLUDED.status,
        retry_count = 0,
        last_error = NULL,
        locked_at = NULL,
        synced_at = NULL,
        updated_at = NOW()
      RETURNING *
    `,
    [uuid, terminal.id, entityType, entityId, operation, JSON.stringify(payload), status]
  );
  return result.rows[0];
}

function mapQueue(row) {
  return {
    id: row.id,
    operationUuid: row.operation_uuid,
    terminalId: row.terminal_id,
    terminalCode: row.terminal_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    status: row.status,
    retryCount: Number(row.retry_count || 0),
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at
  };
}

async function queueSummary() {
  const terminal = await getOrCreateTerminal();
  const result = await getPool().query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'SYNCING')::int AS syncing,
        COUNT(*) FILTER (WHERE status = 'SYNCED')::int AS synced,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
      FROM offline_queue
    `
  );
  return { terminal, counts: result.rows[0] };
}

async function listQueue(limit = 100) {
  const result = await getPool().query(
    `
      SELECT offline_queue.*, terminals.terminal_code
      FROM offline_queue
      LEFT JOIN terminals ON terminals.id = offline_queue.terminal_id
      ORDER BY offline_queue.created_at ASC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map(mapQueue);
}

async function listSyncLogs(limit = 80) {
  const result = await getPool().query(
    `
      SELECT sync_logs.*, terminals.terminal_code
      FROM sync_logs
      LEFT JOIN terminals ON terminals.id = sync_logs.terminal_id
      ORDER BY sync_logs.started_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    terminalCode: row.terminal_code,
    status: row.status,
    direction: row.sync_direction,
    processedCount: Number(row.processed_count || 0),
    failedCount: Number(row.failed_count || 0),
    message: row.message,
    startedAt: row.started_at,
    completedAt: row.completed_at
  }));
}

async function retryFailed() {
  const result = await getPool().query(
    `
      UPDATE offline_queue
      SET status = 'PENDING', last_error = NULL, locked_at = NULL, updated_at = NOW()
      WHERE status = 'FAILED'
    `
  );
  return result.rowCount;
}

async function runLocalSync(userId) {
  return withTransaction(async (client) => {
    const terminal = await getOrCreateTerminal(client);
    const logResult = await client.query(
      'INSERT INTO sync_logs (terminal_id, status, message, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [terminal.id, 'SYNCING', 'Local sync foundation started', userId]
    );
    const logId = logResult.rows[0].id;

    const queued = await client.query(
      `
        SELECT id
        FROM offline_queue
        WHERE status IN ('PENDING', 'FAILED')
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
      `
    );
    const ids = queued.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        `
          UPDATE offline_queue
          SET status = 'SYNCING', locked_at = NOW(), updated_at = NOW()
          WHERE id = ANY($1)
        `,
        [ids]
      );
      await client.query(
        `
          UPDATE offline_queue
          SET status = 'SYNCED', synced_at = NOW(), locked_at = NULL, last_error = NULL, updated_at = NOW()
          WHERE id = ANY($1)
        `,
        [ids]
      );
    }

    await client.query(
      `
        UPDATE sync_logs
        SET status = 'SYNCED', completed_at = NOW(), processed_count = $2, message = $3
        WHERE id = $1
      `,
      [logId, ids.length, 'Local operations marked synced. Cloud connector pending.']
    );
    return { processedCount: ids.length, terminal };
  });
}

module.exports = {
  getOrCreateTerminal,
  listQueue,
  listSyncLogs,
  queueOperation,
  queueSummary,
  retryFailed,
  runLocalSync,
  terminalCode
};
