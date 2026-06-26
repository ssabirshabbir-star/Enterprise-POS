/**
 * luckydraw.repository.js — Lucky Draw V2 Data Access Layer
 *
 * File:      src/main/features/luckydraw_v2/repository/luckydraw.repository.js
 * Risk:      LOW — read/write to existing lucky_draw_* tables via new routes
 * Rollback:  Delete this file; no other file is modified
 *
 * Uses existing DB tables:
 *   lucky_draw_campaigns, lucky_draw_entries, lucky_draw_winners
 * Does NOT share code with the old lucky-draw module.
 */
'use strict';

const { getPool, withTransaction } = require('../../../database/connection');

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapCampaign(row) {
  if (!row) return null;
  return {
    id:                   Number(row.id),
    campaignName:         row.campaign_name,
    campaignCode:         row.campaign_code,
    startDate:            row.start_date ? new Date(row.start_date).toISOString().slice(0, 10) : null,
    endDate:              row.end_date   ? new Date(row.end_date).toISOString().slice(0, 10)   : null,
    minimumPurchase:      Number(row.minimum_purchase || 0),
    prizeDetails:         row.prize_details || '',
    totalWinners:         Number(row.total_winners || 1),
    status:               row.status,
    notes:                row.notes || '',
    totalEntries:         Number(row.total_entries   || 0),
    totalWinnersDrawn:    Number(row.winners_drawn   || 0),
    createdAt:            row.created_at,
  };
}

function mapParticipant(row) {
  if (!row) return null;
  return {
    id:                 Number(row.id),
    campaignId:         Number(row.campaign_id),
    campaignName:       row.campaign_name  || '',
    customerId:         row.customer_id ? Number(row.customer_id) : null,
    customerName:       row.customer_name  || 'Walk-in',
    saleId:             row.sale_id ? Number(row.sale_id) : null,
    invoiceNumber:      row.invoice_number || '',
    couponNo:           row.coupon_no,
    billAmount:         Number(row.bill_amount || 0),
    verificationStatus: row.verification_status,
    isUsed:             Boolean(row.is_used),
    createdAt:          row.created_at,
  };
}

function mapWinner(row) {
  if (!row) return null;
  return {
    id:            Number(row.id),
    campaignId:    Number(row.campaign_id),
    campaignName:  row.campaign_name || '',
    entryId:       Number(row.entry_id),
    couponNo:      row.coupon_no || '',
    customerName:  row.customer_name || 'Walk-in',
    invoiceNumber: row.invoice_number || '',
    billAmount:    Number(row.bill_amount || 0),
    prizeName:     row.prize_name || row.prize_details || '',
    selectedBy:    row.selected_by_name || '',
    selectedAt:    row.selected_at,
  };
}

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

async function listCampaigns() {
  const result = await getPool().query(`
    SELECT
      campaigns.*,
      COUNT(entries.id)              AS total_entries,
      COUNT(DISTINCT winners.id)     AS winners_drawn
    FROM lucky_draw_campaigns campaigns
    LEFT JOIN lucky_draw_entries entries ON entries.campaign_id = campaigns.id
    LEFT JOIN lucky_draw_winners winners ON winners.campaign_id = campaigns.id
    WHERE campaigns.deleted_at IS NULL
    GROUP BY campaigns.id
    ORDER BY campaigns.created_at DESC
  `);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return result.rows.map(row => {
    const campaign = mapCampaign(row);
    // M-8: on-read date-based expiry — treat ACTIVE campaigns past end_date as EXPIRED
    if (campaign.status === 'ACTIVE' && campaign.endDate && campaign.endDate < today) {
      campaign.status = 'EXPIRED';
    }
    return campaign;
  });
}

async function getCampaignById(id) {
  const result = await getPool().query(
    'SELECT * FROM lucky_draw_campaigns WHERE id = $1 AND deleted_at IS NULL',
    [Number(id)]
  );
  return mapCampaign(result.rows[0]);
}

async function createCampaign(payload, userId) {
  const result = await getPool().query(`
    INSERT INTO lucky_draw_campaigns (
      campaign_name, campaign_code, start_date, end_date,
      minimum_purchase, prize_details, total_winners,
      coupon_generation_type, qr_enabled, barcode_enabled,
      status, notes, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,'AUTO',false,false,$8,$9,$10)
    RETURNING *
  `, [
    payload.campaignName,
    payload.campaignCode,
    payload.startDate,
    payload.endDate,
    Number(payload.minimumPurchase || 0),
    payload.prizeDetails || '',
    Number(payload.totalWinners || 1),
    payload.status || 'ACTIVE',
    payload.notes || '',
    userId
  ]);
  return mapCampaign(result.rows[0]);
}

async function updateCampaign(id, payload) {
  const result = await getPool().query(`
    UPDATE lucky_draw_campaigns
    SET campaign_name     = $2,
        start_date        = $3,
        end_date          = $4,
        minimum_purchase  = $5,
        prize_details     = $6,
        total_winners     = $7,
        status            = $8,
        notes             = $9,
        updated_at        = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *
  `, [
    Number(id),
    payload.campaignName,
    payload.startDate,
    payload.endDate,
    Number(payload.minimumPurchase || 0),
    payload.prizeDetails || '',
    Number(payload.totalWinners || 1),
    payload.status || 'ACTIVE',
    payload.notes || ''
  ]);
  return mapCampaign(result.rows[0]);
}

async function softDeleteCampaign(id) {
  const result = await getPool().query(
    "UPDATE lucky_draw_campaigns SET deleted_at = NOW(), status = 'INACTIVE', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
    [Number(id)]
  );
  return result.rowCount > 0;
}

// ── Participants ──────────────────────────────────────────────────────────────

async function listParticipants(filters = {}) {
  const params  = [];
  const where   = ['1=1'];

  if (filters.campaignId) {
    params.push(Number(filters.campaignId));
    where.push(`entries.campaign_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    where.push(`(LOWER(entries.coupon_no) LIKE $${params.length} OR LOWER(customers.name) LIKE $${params.length})`);
  }

  const result = await getPool().query(`
    SELECT entries.*,
           campaigns.campaign_name, campaigns.campaign_code,
           COALESCE(entries.customer_name, customers.name) AS customer_name,
           sales.invoice_number
    FROM lucky_draw_entries entries
    INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
    LEFT  JOIN customers ON customers.id = entries.customer_id
    LEFT  JOIN sales     ON sales.id     = entries.sale_id
    WHERE ${where.join(' AND ')}
    ORDER BY entries.created_at DESC
    LIMIT 500
  `, params);
  return result.rows.map(mapParticipant);
}

async function addParticipant(payload, userId) {
  return withTransaction(async (client) => {
    const campaignId = Number(payload.campaignId);

    // Generate coupon number
    const seqResult = await client.query(
      'SELECT COUNT(*)::INTEGER + 1 AS next_seq FROM lucky_draw_entries WHERE campaign_id = $1',
      [campaignId]
    );
    const seq       = Number(seqResult.rows[0].next_seq || 1);
    const campaign  = await client.query(
      'SELECT campaign_code FROM lucky_draw_campaigns WHERE id = $1',
      [campaignId]
    );
    if (!campaign.rows[0]) throw new Error('CAMPAIGN_NOT_FOUND');
    const couponNo = `${campaign.rows[0].campaign_code}-${String(seq).padStart(6, '0')}`;

    const result = await client.query(`
      INSERT INTO lucky_draw_entries (
        campaign_id, customer_id, sale_id,
        coupon_no, qr_value, barcode_value, bill_amount, customer_name
      )
      VALUES ($1, $2, NULL, $3, $3, $3, $4, $5)
      RETURNING *
    `, [
      campaignId,
      payload.customerId ? Number(payload.customerId) : null,
      couponNo,
      Number(payload.billAmount || 0),
      payload.customerId ? null : (payload.customerName || null),  // P-7: only store for walk-ins
    ]);

    if (!result.rows[0]) throw new Error('INSERT_FAILED');

    await client.query(
      'INSERT INTO coupon_logs (coupon_no, action, performed_by, metadata) VALUES ($1,$2,$3,$4::jsonb)',
      [couponNo, 'MANUAL_ADD', userId, JSON.stringify({ campaignId, addedBy: userId })]
    );

    return mapParticipant({
      ...result.rows[0],
      campaign_name: campaign.rows[0].campaign_code,
      customer_name: payload.customerId ? null : (payload.customerName || 'Walk-in'),
    });
  });
}

async function removeParticipant(entryId) {
  // Guard: cannot remove an entry that has already been selected as a winner
  const winnerCheck = await getPool().query(
    'SELECT id FROM lucky_draw_winners WHERE entry_id = $1 LIMIT 1',
    [Number(entryId)]
  );
  if (winnerCheck.rows.length > 0) throw new Error('ENTRY_IS_WINNER');

  const result = await getPool().query(
    'DELETE FROM lucky_draw_entries WHERE id = $1 RETURNING id',
    [Number(entryId)]
  );
  return result.rowCount > 0;
}

// ── Draw ─────────────────────────────────────────────────────────────────────

async function runDraw(campaignId, count, userId) {
  return withTransaction(async (client) => {
    const campResult = await client.query(
      'SELECT * FROM lucky_draw_campaigns WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [Number(campaignId)]
    );
    const campaign = campResult.rows[0];
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    const existingCount = await client.query(
      'SELECT COUNT(*)::INTEGER AS cnt FROM lucky_draw_winners WHERE campaign_id = $1',
      [Number(campaignId)]
    );
    const alreadyDrawn = Number(existingCount.rows[0].cnt || 0);
    const remaining    = Math.max(Number(campaign.total_winners) - alreadyDrawn, 0);
    const drawCount    = Math.min(Number(count || 1), remaining);
    if (drawCount <= 0) return { campaign: mapCampaign(campaign), winners: [], message: 'No remaining winner slots.' };

    const candidates = await client.query(`
      SELECT entries.id
      FROM lucky_draw_entries entries
      WHERE entries.campaign_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM lucky_draw_winners w WHERE w.entry_id = entries.id
        )
      ORDER BY random()
      LIMIT $2
    `, [Number(campaignId), drawCount]);

    const winners = [];
    for (const candidate of candidates.rows) {
      const inserted = await client.query(`
        INSERT INTO lucky_draw_winners (campaign_id, entry_id, prize_name, selected_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (entry_id) DO NOTHING
        RETURNING id
      `, [Number(campaignId), candidate.id, campaign.prize_details, userId]);

      if (inserted.rows[0]) {
        const winner = await client.query(`
          SELECT winners.*,
                 campaigns.campaign_name, campaigns.prize_details,
                 entries.coupon_no, entries.bill_amount,
                 COALESCE(entries.customer_name, customers.name) AS customer_name,
                 sales.invoice_number,
                 users.full_name AS selected_by_name
          FROM lucky_draw_winners winners
          INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = winners.campaign_id
          INNER JOIN lucky_draw_entries   entries   ON entries.id   = winners.entry_id
          LEFT  JOIN sales                          ON sales.id     = entries.sale_id
          LEFT  JOIN customers                      ON customers.id = entries.customer_id
          LEFT  JOIN users                          ON users.id     = winners.selected_by
          WHERE winners.id = $1
        `, [inserted.rows[0].id]);
        if (winner.rows[0]) winners.push(mapWinner(winner.rows[0]));
      }
    }

    // M-5: auto-complete campaign when all winner slots are now consumed
    const finalDrawnCount = alreadyDrawn + winners.length;
    if (finalDrawnCount >= Number(campaign.total_winners)) {
      await client.query(
        "UPDATE lucky_draw_campaigns SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND status = 'ACTIVE'",
        [Number(campaignId)]
      );
    }

    return { campaign: mapCampaign(campaign), winners };
  });
}

// ── Winners History ───────────────────────────────────────────────────────────

async function listWinners(campaignId) {
  const params = [];
  const where  = [];
  if (campaignId) {
    params.push(Number(campaignId));
    where.push(`winners.campaign_id = $${params.length}`);
  }
  const result = await getPool().query(`
    SELECT winners.*,
           campaigns.campaign_name, campaigns.prize_details,
           entries.coupon_no, entries.bill_amount,
           COALESCE(entries.customer_name, customers.name) AS customer_name,
           sales.invoice_number,
           users.full_name AS selected_by_name
    FROM lucky_draw_winners winners
    INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = winners.campaign_id
    INNER JOIN lucky_draw_entries   entries   ON entries.id   = winners.entry_id
    LEFT  JOIN sales                          ON sales.id     = entries.sale_id
    LEFT  JOIN customers                      ON customers.id = entries.customer_id
    LEFT  JOIN users                          ON users.id     = winners.selected_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY winners.selected_at DESC
    LIMIT 300
  `, params);
  return result.rows.map(mapWinner);
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function getReports() {
  const result = await getPool().query(`
    SELECT
      (SELECT COUNT(*)             FROM lucky_draw_campaigns WHERE deleted_at IS NULL) AS campaign_count,
      (SELECT COUNT(*)             FROM lucky_draw_entries)                             AS entry_count,
      (SELECT COUNT(*)             FROM lucky_draw_winners)                             AS winner_count,
      (SELECT COALESCE(SUM(bill_amount),0) FROM lucky_draw_entries)                    AS total_sales
  `);
  const r = result.rows[0];
  return {
    campaignCount: Number(r.campaign_count || 0),
    entryCount:    Number(r.entry_count    || 0),
    winnerCount:   Number(r.winner_count   || 0),
    totalSales:    Number(r.total_sales    || 0),
  };
}

// ── Billing Auto-Entry (M-3) ──────────────────────────────────────────────────
// Called by billing.repository inside the billing transaction (client passed in).
// ON CONFLICT (campaign_id, sale_id) DO NOTHING ensures no duplicate per invoice.
// Advisory lock 4243 avoids coupon sequence races (4242 is reserved by old module).

async function createEntriesForSale(client, sale, cashierId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const campaigns = await client.query(
    `SELECT *
     FROM lucky_draw_campaigns
     WHERE deleted_at IS NULL
       AND status = 'ACTIVE'
       AND coupon_generation_type = 'AUTO'
       AND end_date::date >= $1::date
       AND start_date::date <= $1::date
       AND minimum_purchase <= $2
     ORDER BY minimum_purchase DESC, id ASC`,
    [today, Number(sale.grand_total || 0)]
  );

  const entries = [];
  for (const campaign of campaigns.rows) {
    await client.query(
      'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
      [4243, Number(campaign.id)]
    );

    const seqResult = await client.query(
      'SELECT COUNT(*)::INTEGER + 1 AS next_seq FROM lucky_draw_entries WHERE campaign_id = $1',
      [campaign.id]
    );
    const sequence = Number(seqResult.rows[0].next_seq || 1);
    const couponNo = `${campaign.campaign_code}-${String(sequence).padStart(6, '0')}`;

    const insertResult = await client.query(
      `INSERT INTO lucky_draw_entries
         (campaign_id, customer_id, sale_id, coupon_no, qr_value, barcode_value, bill_amount)
       VALUES ($1, $2, $3, $4::varchar, $4::text, $4::text, $5)
       ON CONFLICT (campaign_id, sale_id) DO NOTHING
       RETURNING *`,
      [campaign.id, sale.customer_id || null, sale.id, couponNo, Number(sale.grand_total || 0)]
    );

    if (insertResult.rows[0]) {
      await client.query(
        `INSERT INTO coupon_logs (coupon_no, action, performed_by, metadata)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          couponNo,
          'entry_created_from_billing',
          cashierId,
          JSON.stringify({
            campaign_id: Number(campaign.id),
            sale_id:     Number(sale.id),
            customer_id: sale.customer_id || null,
            invoice:     sale.invoice_number,
          }),
        ]
      );
      console.log(`[LuckyDrawV2] Auto-entry — campaign:${campaign.id} sale:${sale.id} coupon:${couponNo}`);
      entries.push({
        campaignId:   Number(campaign.id),
        campaignName: campaign.campaign_name,
        couponNo,
        billAmount:   Number(sale.grand_total || 0),
      });
    }
  }
  return entries;
}

module.exports = {
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  softDeleteCampaign,
  listParticipants,
  addParticipant,
  removeParticipant,
  runDraw,
  listWinners,
  getReports,
  createEntriesForSale,
};
