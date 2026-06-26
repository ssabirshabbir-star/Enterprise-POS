const { getPool, withTransaction } = require('../../database/connection');

function mapCampaign(row) {
  return row && {
    id: Number(row.id),
    campaignName: row.campaign_name,
    campaignCode: row.campaign_code,
    startDate: cleanDate(row.start_date),
    endDate: cleanDate(row.end_date),
    minimumPurchase: Number(row.minimum_purchase || 0),
    prizeDetails: row.prize_details,
    totalWinners: Number(row.total_winners || 1),
    couponGenerationType: row.coupon_generation_type,
    qrEnabled: row.qr_enabled,
    barcodeEnabled: row.barcode_enabled,
    status: row.status,
    notes: row.notes || '',
    totalEntries: Number(row.total_entries || 0),
    totalSales: Number(row.total_sales || 0),
    totalCustomers: Number(row.total_customers || 0),
    winnersCount: Number(row.winners_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEntry(row) {
  return row && {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    campaignName: row.campaign_name,
    campaignCode: row.campaign_code,
    customerId: row.customer_id ? Number(row.customer_id) : null,
    customerName: row.customer_name || 'Walk-in Customer',
    saleId: Number(row.sale_id),
    invoiceNumber: row.invoice_number,
    couponNo: row.coupon_no,
    qrValue: row.qr_value,
    barcodeValue: row.barcode_value,
    billAmount: Number(row.bill_amount || 0),
    verificationStatus: row.verification_status,
    isUsed: row.is_used,
    verifiedAt: row.verified_at,
    verifiedByName: row.verified_by_name,
    createdAt: row.created_at
  };
}

function mapWinner(row) {
  return row && {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    campaignName: row.campaign_name,
    entryId: Number(row.entry_id),
    couponNo: row.coupon_no,
    customerName: row.customer_name || 'Walk-in Customer',
    invoiceNumber: row.invoice_number,
    billAmount: Number(row.bill_amount || 0),
    prizeName: row.prize_name || row.prize_details,
    selectedByName: row.selected_by_name,
    selectedAt: row.selected_at
  };
}

function cleanDate(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

async function nextCampaignCode(client, startDate) {
  const year = String(cleanDate(startDate) || new Date().toISOString()).slice(0, 4);
  const prefix = `LD-${year}`;
  const result = await client.query(
    "SELECT campaign_code FROM lucky_draw_campaigns WHERE campaign_code ILIKE $1 ORDER BY id DESC LIMIT 1",
    [`${prefix}%`]
  );
  if (!result.rows[0]) return prefix;
  const previous = result.rows[0].campaign_code;
  const suffix = Number(String(previous).replace(`${prefix}-`, ''));
  return Number.isFinite(suffix) ? `${prefix}-${String(suffix + 1).padStart(2, '0')}` : `${prefix}-02`;
}

async function createCampaign(payload, userId) {
  return withTransaction(async (client) => {
    const campaignCode = payload.campaignCode || await nextCampaignCode(client, payload.startDate);
    const result = await client.query(
      `
        INSERT INTO lucky_draw_campaigns (
          campaign_name, campaign_code, start_date, end_date, minimum_purchase, prize_details,
          total_winners, coupon_generation_type, qr_enabled, barcode_enabled, status, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `,
      [
        payload.campaignName,
        campaignCode,
        payload.startDate,
        payload.endDate,
        payload.minimumPurchase,
        payload.prizeDetails,
        payload.totalWinners,
        payload.couponGenerationType,
        payload.qrEnabled,
        payload.barcodeEnabled,
        payload.status,
        payload.notes,
        userId
      ]
    );
    return mapCampaign(result.rows[0]);
  });
}

async function updateCampaign(id, payload) {
  const result = await getPool().query(
    `
      UPDATE lucky_draw_campaigns
      SET campaign_name = $2, start_date = $3, end_date = $4, minimum_purchase = $5,
          prize_details = $6, total_winners = $7, coupon_generation_type = $8,
          qr_enabled = $9, barcode_enabled = $10, status = $11, notes = $12, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [
      id,
      payload.campaignName,
      payload.startDate,
      payload.endDate,
      payload.minimumPurchase,
      payload.prizeDetails,
      payload.totalWinners,
      payload.couponGenerationType,
      payload.qrEnabled,
      payload.barcodeEnabled,
      payload.status,
      payload.notes
    ]
  );
  return mapCampaign(result.rows[0]);
}

async function deleteCampaign(id) {
  const result = await getPool().query(
    "UPDATE lucky_draw_campaigns SET deleted_at = NOW(), status = 'INACTIVE', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
    [id]
  );
  return result.rowCount > 0;
}

async function listCampaigns() {
  const result = await getPool().query(
    `
      SELECT campaigns.*,
             COUNT(entries.id) AS total_entries,
             COALESCE(SUM(entries.bill_amount), 0) AS total_sales,
             COUNT(DISTINCT entries.customer_id) FILTER (WHERE entries.customer_id IS NOT NULL) AS total_customers,
             COUNT(DISTINCT winners.id) AS winners_count
      FROM lucky_draw_campaigns campaigns
      LEFT JOIN lucky_draw_entries entries ON entries.campaign_id = campaigns.id
      LEFT JOIN lucky_draw_winners winners ON winners.campaign_id = campaigns.id
      WHERE campaigns.deleted_at IS NULL
      GROUP BY campaigns.id
      ORDER BY campaigns.created_at DESC
    `
  );
  return result.rows.map(mapCampaign);
}

async function activeCampaignsForSale(client, grandTotal) {
  const result = await client.query(
    `
      SELECT *
      FROM lucky_draw_campaigns
      WHERE deleted_at IS NULL
        AND status = 'ACTIVE'
        AND coupon_generation_type = 'AUTO'
        AND CURRENT_DATE BETWEEN start_date AND end_date
        AND minimum_purchase <= $1
      ORDER BY minimum_purchase DESC, id ASC
    `,
    [grandTotal]
  );
  return result.rows;
}

async function createEntriesForSale(client, sale, cashierId) {
  const campaigns = await activeCampaignsForSale(client, Number(sale.grand_total || 0));
  const entries = [];

  for (const campaign of campaigns) {
    await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [4242, Number(campaign.id)]);
    const sequenceResult = await client.query(
      'SELECT COUNT(*)::INTEGER + 1 AS next_sequence FROM lucky_draw_entries WHERE campaign_id = $1',
      [campaign.id]
    );
    const sequence = Number(sequenceResult.rows[0].next_sequence || 1);
    const couponNo = `${campaign.campaign_code}-${String(sequence).padStart(6, '0')}`;
    const result = await client.query(
      `
        INSERT INTO lucky_draw_entries (
          campaign_id, customer_id, sale_id, coupon_no, qr_value, barcode_value, bill_amount
        )
        VALUES ($1, $2, $3, $4::varchar, $4::text, $4::text, $5)
        ON CONFLICT (campaign_id, sale_id) DO NOTHING
        RETURNING *
      `,
      [campaign.id, sale.customer_id || null, sale.id, couponNo, sale.grand_total]
    );

    if (result.rows[0]) {
      await client.query(
        'INSERT INTO coupon_logs (coupon_no, action, performed_by, metadata) VALUES ($1, $2, $3, $4::jsonb)',
        [couponNo, 'GENERATED', cashierId, JSON.stringify({ campaignId: Number(campaign.id), saleId: Number(sale.id), invoiceNumber: sale.invoice_number })]
      );
      entries.push({ ...mapEntry({ ...result.rows[0], campaign_name: campaign.campaign_name, campaign_code: campaign.campaign_code, invoice_number: sale.invoice_number }) });
    }
  }

  return entries;
}

async function listEntries(filters = {}) {
  const params = [];
  const where = ['1 = 1'];
  if (filters.campaignId) {
    params.push(Number(filters.campaignId));
    where.push(`entries.campaign_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    where.push(`(LOWER(entries.coupon_no) LIKE $${params.length} OR LOWER(customers.name) LIKE $${params.length} OR LOWER(sales.invoice_number) LIKE $${params.length})`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`entries.created_at::date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`entries.created_at::date <= $${params.length}`);
  }
  const result = await getPool().query(
    `
      SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code, customers.name AS customer_name,
             sales.invoice_number, users.full_name AS verified_by_name
      FROM lucky_draw_entries entries
      INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
      INNER JOIN sales ON sales.id = entries.sale_id
      LEFT JOIN customers ON customers.id = entries.customer_id
      LEFT JOIN users ON users.id = entries.verified_by
      WHERE ${where.join(' AND ')}
      ORDER BY entries.created_at DESC
      LIMIT 500
    `,
    params
  );
  return result.rows.map(mapEntry);
}

async function findCoupon(couponNo) {
  const result = await getPool().query(
    `
      SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code, campaigns.prize_details,
             customers.name AS customer_name, sales.invoice_number, users.full_name AS verified_by_name
      FROM lucky_draw_entries entries
      INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
      INNER JOIN sales ON sales.id = entries.sale_id
      LEFT JOIN customers ON customers.id = entries.customer_id
      LEFT JOIN users ON users.id = entries.verified_by
      WHERE LOWER(entries.coupon_no) = LOWER($1)
      LIMIT 1
    `,
    [couponNo]
  );
  return mapEntry(result.rows[0]);
}

async function verifyCoupon(couponNo, userId) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      `
        SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code, customers.name AS customer_name,
               sales.invoice_number
        FROM lucky_draw_entries entries
        INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
        INNER JOIN sales ON sales.id = entries.sale_id
        LEFT JOIN customers ON customers.id = entries.customer_id
        WHERE LOWER(entries.coupon_no) = LOWER($1)
        FOR UPDATE OF entries
        LIMIT 1
      `,
      [couponNo]
    );
    const entry = locked.rows[0];
    if (!entry) return null;
    if (!entry.is_used) {
      const updated = await client.query(
        `
          UPDATE lucky_draw_entries
          SET verification_status = 'VERIFIED', is_used = TRUE, verified_at = NOW(), verified_by = $2
          WHERE id = $1
          RETURNING *
        `,
        [entry.id, userId]
      );
      await client.query(
        'INSERT INTO coupon_logs (coupon_no, action, performed_by, metadata) VALUES ($1, $2, $3, $4::jsonb)',
        [entry.coupon_no, 'VERIFIED', userId, JSON.stringify({ entryId: Number(entry.id), saleId: Number(entry.sale_id) })]
      );
      return mapEntry({ ...entry, ...updated.rows[0] });
    }
    await client.query(
      'INSERT INTO coupon_logs (coupon_no, action, performed_by, metadata) VALUES ($1, $2, $3, $4::jsonb)',
      [entry.coupon_no, 'DUPLICATE_VERIFY_ATTEMPT', userId, JSON.stringify({ entryId: Number(entry.id) })]
    );
    return mapEntry(entry);
  });
}

async function drawWinners(campaignId, requestedCount, userId) {
  return withTransaction(async (client) => {
    const campaignResult = await client.query(
      'SELECT * FROM lucky_draw_campaigns WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [campaignId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) return { campaign: null, winners: [] };

    const existingCountResult = await client.query('SELECT COUNT(*)::INTEGER AS count FROM lucky_draw_winners WHERE campaign_id = $1', [campaignId]);
    const remaining = Math.max(Number(campaign.total_winners) - Number(existingCountResult.rows[0].count || 0), 0);
    const count = Math.min(requestedCount || remaining, remaining);
    if (count <= 0) return { campaign: mapCampaign(campaign), winners: [] };

    const candidates = await client.query(
      `
        SELECT entries.id
        FROM lucky_draw_entries entries
        WHERE entries.campaign_id = $1
          AND NOT EXISTS (SELECT 1 FROM lucky_draw_winners winners WHERE winners.entry_id = entries.id)
        ORDER BY random()
        LIMIT $2
      `,
      [campaignId, count]
    );

    const winners = [];
    for (const candidate of candidates.rows) {
      const inserted = await client.query(
        `
          INSERT INTO lucky_draw_winners (campaign_id, entry_id, prize_name, selected_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (entry_id) DO NOTHING
          RETURNING id
        `,
        [campaignId, candidate.id, campaign.prize_details, userId]
      );
      if (inserted.rows[0]) {
        const winner = await client.query(
          `
            SELECT winners.*, campaigns.campaign_name, campaigns.prize_details, entries.coupon_no, entries.bill_amount,
                   customers.name AS customer_name, sales.invoice_number, users.full_name AS selected_by_name
            FROM lucky_draw_winners winners
            INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = winners.campaign_id
            INNER JOIN lucky_draw_entries entries ON entries.id = winners.entry_id
            INNER JOIN sales ON sales.id = entries.sale_id
            LEFT JOIN customers ON customers.id = entries.customer_id
            LEFT JOIN users ON users.id = winners.selected_by
            WHERE winners.id = $1
          `,
          [inserted.rows[0].id]
        );
        winners.push(mapWinner(winner.rows[0]));
      }
    }

    return { campaign: mapCampaign(campaign), winners };
  });
}

async function listWinners(campaignId = null) {
  const params = [];
  const where = [];
  if (campaignId) {
    params.push(Number(campaignId));
    where.push(`winners.campaign_id = $${params.length}`);
  }
  const result = await getPool().query(
    `
      SELECT winners.*, campaigns.campaign_name, campaigns.prize_details, entries.coupon_no, entries.bill_amount,
             customers.name AS customer_name, sales.invoice_number, users.full_name AS selected_by_name
      FROM lucky_draw_winners winners
      INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = winners.campaign_id
      INNER JOIN lucky_draw_entries entries ON entries.id = winners.entry_id
      INNER JOIN sales ON sales.id = entries.sale_id
      LEFT JOIN customers ON customers.id = entries.customer_id
      LEFT JOIN users ON users.id = winners.selected_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY winners.selected_at DESC
      LIMIT 300
    `,
    params
  );
  return result.rows.map(mapWinner);
}

async function getReports() {
  const result = await getPool().query(
    `
      SELECT
        (SELECT COUNT(*) FROM lucky_draw_campaigns WHERE deleted_at IS NULL) AS campaign_count,
        (SELECT COUNT(*) FROM lucky_draw_entries) AS coupon_count,
        (SELECT COUNT(*) FROM lucky_draw_entries WHERE verification_status = 'VERIFIED') AS verified_count,
        (SELECT COUNT(*) FROM lucky_draw_winners) AS winner_count,
        (SELECT COALESCE(SUM(bill_amount), 0) FROM lucky_draw_entries) AS total_sales
    `
  );
  const campaigns = await listCampaigns();
  return {
    summary: {
      campaignCount: Number(result.rows[0].campaign_count || 0),
      couponCount: Number(result.rows[0].coupon_count || 0),
      verifiedCount: Number(result.rows[0].verified_count || 0),
      winnerCount: Number(result.rows[0].winner_count || 0),
      totalSales: Number(result.rows[0].total_sales || 0)
    },
    campaigns
  };
}

async function listEligibleParticipants(campaignId, filters = {}) {
  const params = [Number(campaignId)];
  const where = ['entries.campaign_id = $1', 'entries.is_used = TRUE'];

  if (filters.search) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    where.push(`(LOWER(entries.coupon_no) LIKE $${params.length} OR LOWER(customers.name) LIKE $${params.length} OR LOWER(sales.invoice_number) LIKE $${params.length})`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`entries.created_at::date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`entries.created_at::date <= $${params.length}`);
  }

  const result = await getPool().query(
    `
      SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code, customers.name AS customer_name,
             sales.invoice_number
      FROM lucky_draw_entries entries
      INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
      INNER JOIN sales ON sales.id = entries.sale_id
      LEFT JOIN customers ON customers.id = entries.customer_id
      WHERE ${where.join(' AND ')}
        AND NOT EXISTS (SELECT 1 FROM lucky_draw_winners winners WHERE winners.entry_id = entries.id)
      ORDER BY entries.created_at DESC
      LIMIT 500
    `,
    params
  );
  return result.rows.map(mapEntry);
}

async function findCampaignById(campaignId) {
  const result = await getPool().query(
    'SELECT * FROM lucky_draw_campaigns WHERE id = $1 AND deleted_at IS NULL',
    [campaignId]
  );
  return mapCampaign(result.rows[0]);
}

async function createWinner(campaignId, entryId, prizeName, userId) {
  const result = await getPool().query(
    `
      INSERT INTO lucky_draw_winners (campaign_id, entry_id, prize_name, selected_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (entry_id) DO NOTHING
      RETURNING id
    `,
    [campaignId, entryId, prizeName, userId]
  );
  if (result.rows[0]) {
    const winner = await getPool().query(
      `
        SELECT winners.*, campaigns.campaign_name, campaigns.prize_details, entries.coupon_no, entries.bill_amount,
               customers.name AS customer_name, sales.invoice_number, users.full_name AS selected_by_name
        FROM lucky_draw_winners winners
        INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = winners.campaign_id
        INNER JOIN lucky_draw_entries entries ON entries.id = winners.entry_id
        INNER JOIN sales ON sales.id = entries.sale_id
        LEFT JOIN customers ON customers.id = entries.customer_id
        LEFT JOIN users ON users.id = winners.selected_by
        WHERE winners.id = $1
      `,
      [result.rows[0].id]
    );
    return mapWinner(winner.rows[0]);
  }
  return null;
}

module.exports = {
  createCampaign,
  createEntriesForSale,
  deleteCampaign,
  drawWinners,
  findCoupon,
  getReports,
  listCampaigns,
  listEntries,
  listWinners,
  updateCampaign,
  verifyCoupon,
  listEligibleParticipants,
  findCampaignById,
  createWinner
};
