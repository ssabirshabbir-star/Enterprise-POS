const { getPool } = require('../../database/connection');

async function persistLifecycleAudit({ lifecycle, audit }) {
  const result = await getPool().query(
    `
      INSERT INTO barcode_print_events (
        event_id, job_id, previous_event_id, lifecycle_state, audit_event,
        user_id, product_ids, result_id, error_code, metadata, occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::bigint[], $8, $9, $10::jsonb, $11)
      RETURNING id, event_id, job_id, lifecycle_state, audit_event, occurred_at, created_at
    `,
    [
      lifecycle.eventId,
      lifecycle.jobId,
      lifecycle.previousEventId,
      lifecycle.state,
      audit.eventType,
      audit.userId,
      audit.productIds,
      audit.metadata.resultId || null,
      lifecycle.errorCode || audit.errorCode,
      JSON.stringify({
        lifecycle: lifecycle.metadata,
        audit: audit.metadata,
      }),
      lifecycle.occurredAt,
    ]
  );
  return result.rows[0];
}

module.exports = {
  persistLifecycleAudit,
};
