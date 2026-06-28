const { getPool, withTransaction } = require('../../database/connection');
const syncRepository = require('../sync/sync.repository');

function mapInvoice(row) {
  return (
    row && {
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerCurrentBalance: Number(row.customer_current_balance || 0),
      isWalkInCustomer: Boolean(row.is_walk_in_customer),
      cashierName: row.cashier_name,
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      tax: Number(row.tax),
      grandTotal: Number(row.grand_total),
      paidAmount: Number(row.paid_amount),
      changeAmount: Number(row.change_amount || 0),
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at,
    }
  );
}

function returnStatus(items) {
  const rows = Array.isArray(items) ? items : [];
  const totalSold = rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalReturned = rows.reduce((sum, item) => sum + Number(item.returnedQuantity || 0), 0);
  if (totalSold <= 0 || totalReturned <= 0) return 'Not Returned';
  if (totalReturned >= totalSold) return 'Fully Returned';
  return 'Partially Returned';
}

async function findInvoice(filters = {}) {
  const invoiceNumber = String(filters.invoiceNumber || '').trim();
  const barcode = String(filters.barcode || '').trim();
  const customer = String(filters.customer || '')
    .trim()
    .toLowerCase();
  const params = [];
  const clauses = [];
  if (invoiceNumber) {
    params.push(invoiceNumber);
    clauses.push(`LOWER(sales.invoice_number) = LOWER($${params.length})`);
  }
  if (barcode) {
    params.push(barcode);
    clauses.push(`LOWER(products.barcode) = LOWER($${params.length})`);
  }
  if (customer) {
    params.push(`%${customer}%`);
    clauses.push(
      `(LOWER(customers.name) LIKE $${params.length} OR COALESCE(customers.phone, '') LIKE $${params.length})`
    );
  }
  if (clauses.length === 0) return null;
  const result = await getPool().query(
    `
      SELECT DISTINCT sales.*, customers.name AS customer_name,
        customers.current_balance AS customer_current_balance,
        COALESCE(customers.is_walk_in, FALSE) AS is_walk_in_customer,
        users.full_name AS cashier_name
      FROM sales
      LEFT JOIN customers ON customers.id = sales.customer_id
      LEFT JOIN users ON users.id = sales.cashier_id
      LEFT JOIN sale_items ON sale_items.sale_id = sales.id
      LEFT JOIN products ON products.id = sale_items.product_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY sales.created_at DESC
      LIMIT 1
    `,
    params
  );
  const sale = mapInvoice(result.rows[0]);
  if (!sale) return null;
  const [items, returns, payments, coupons] = await Promise.all([
    getPool().query(
      `
      SELECT sale_items.id AS sale_item_id, sale_items.product_id, products.name AS product_name,
             products.sku, products.barcode, sale_items.quantity, sale_items.unit_price,
             sale_items.discount, sale_items.total,
             COALESCE(SUM(return_items.quantity), 0)::numeric AS returned_quantity
      FROM sale_items
      INNER JOIN products ON products.id = sale_items.product_id
      LEFT JOIN return_items ON return_items.sale_item_id = sale_items.id
      WHERE sale_items.sale_id = $1
      GROUP BY sale_items.id, products.id, products.name, products.sku, products.barcode,
        sale_items.product_id, sale_items.quantity, sale_items.unit_price, sale_items.discount, sale_items.total
      ORDER BY sale_items.id ASC
    `,
      [sale.id]
    ),
    getPool().query(
      `
        SELECT COALESCE(SUM(total_refund), 0)::numeric AS total_returned
        FROM returns
        WHERE sale_id = $1 AND deleted_at IS NULL
      `,
      [sale.id]
    ),
    getPool().query(
      `
        SELECT id, payment_method, amount, created_at
        FROM payments
        WHERE sale_id = $1
        ORDER BY created_at ASC
      `,
      [sale.id]
    ),
    getPool().query(
      `
        SELECT entries.id, entries.coupon_no, entries.bill_amount, entries.verification_status,
          entries.is_used, campaigns.campaign_name, campaigns.minimum_purchase,
          COUNT(winners.id)::int AS winner_count
        FROM lucky_draw_entries entries
        INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
        LEFT JOIN lucky_draw_winners winners ON winners.entry_id = entries.id
        WHERE entries.sale_id = $1
        GROUP BY entries.id, campaigns.id, campaigns.campaign_name, campaigns.minimum_purchase
        ORDER BY entries.created_at ASC
      `,
      [sale.id]
    ),
  ]);
  const mappedItems = items.rows.map((row) => {
    const quantity = Number(row.quantity);
    const total = Number(row.total);
    const unitRefund =
      quantity > 0 ? Number((total / quantity).toFixed(2)) : Number(row.unit_price);
    return {
      saleItemId: row.sale_item_id,
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      barcode: row.barcode,
      quantity,
      returnedQuantity: Number(row.returned_quantity),
      returnableQuantity: Math.max(quantity - Number(row.returned_quantity), 0),
      unitPrice: Number(row.unit_price),
      unitRefund,
      discount: Number(row.discount),
      total,
    };
  });
  return {
    sale: {
      ...sale,
      alreadyReturnedTotal: Number(returns.rows[0]?.total_returned || 0),
      returnStatus: returnStatus(mappedItems),
    },
    items: mappedItems,
    payments: payments.rows.map((row) => ({
      id: row.id,
      paymentMethod: row.payment_method,
      amount: Number(row.amount || 0),
      createdAt: row.created_at,
    })),
    coupons: coupons.rows.map((row) => ({
      id: row.id,
      couponNo: row.coupon_no,
      campaignName: row.campaign_name,
      minimumPurchase: Number(row.minimum_purchase || 0),
      billAmount: Number(row.bill_amount || 0),
      verificationStatus: row.verification_status,
      isUsed: Boolean(row.is_used),
      isWinner: Number(row.winner_count || 0) > 0,
    })),
  };
}

async function listReturns() {
  const result = await getPool().query(
    `
      SELECT returns.*, sales.invoice_number, customers.name AS customer_name
      FROM returns
      INNER JOIN sales ON sales.id = returns.sale_id
      LEFT JOIN customers ON customers.id = returns.customer_id
      WHERE returns.deleted_at IS NULL
      ORDER BY returns.created_at DESC
      LIMIT 200
    `
  );
  return result.rows.map((row) => ({
    id: row.id,
    returnNumber: row.return_number,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    refundMethod: row.refund_method,
    totalRefund: Number(row.total_refund),
    status: row.status,
    createdAt: row.created_at,
  }));
}

async function createReturn(payload, userId) {
  return withTransaction(async (client) => {
    const returnNotes = payload.notes
      ? `${payload.reason || 'Sale return'} | Notes: ${payload.notes}`
      : payload.reason || 'Sale return';
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const saleResult = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [
      payload.saleId,
    ]);
    const sale = saleResult.rows[0];
    if (!sale) throw new Error('SALE_NOT_FOUND');

    const returnResult = await client.query(
      `
        INSERT INTO returns (return_number, sale_id, customer_id, terminal_id, cashier_id, refund_method, reason, subtotal, total_refund)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        RETURNING *
      `,
      [
        payload.returnNumber,
        sale.id,
        sale.customer_id,
        terminal.id,
        userId,
        payload.refundMethod,
        returnNotes,
        payload.totalRefund,
      ]
    );
    const returnRecord = returnResult.rows[0];
    const warehouseResult = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
    const warehouseId = warehouseResult.rows[0]?.id;

    for (const item of payload.items) {
      const saleItemResult = await client.query(
        `
          SELECT sale_items.*, products.current_stock, products.min_stock_level
          FROM sale_items
          INNER JOIN products ON products.id = sale_items.product_id
          WHERE sale_items.id = $1 AND sale_items.sale_id = $2
          FOR UPDATE
        `,
        [item.saleItemId, sale.id]
      );
      const saleItem = saleItemResult.rows[0];
      if (!saleItem) throw new Error('INVALID_RETURN_ITEM');
      const returnedResult = await client.query(
        'SELECT COALESCE(SUM(quantity), 0)::numeric AS quantity FROM return_items WHERE sale_item_id = $1',
        [item.saleItemId]
      );
      const alreadyReturned = Number(returnedResult.rows[0].quantity || 0);
      if (alreadyReturned + Number(item.quantity) > Number(saleItem.quantity))
        throw new Error('RETURN_QTY_EXCEEDED');

      const unitRefund =
        Number(saleItem.quantity) > 0
          ? Number(saleItem.total) / Number(saleItem.quantity)
          : Number(saleItem.unit_price);
      const lineTotal = Number((Number(item.quantity) * unitRefund).toFixed(2));
      await client.query(
        'INSERT INTO return_items (return_id, sale_item_id, product_id, quantity, unit_price, discount, total) VALUES ($1, $2, $3, $4, $5, 0, $6)',
        [
          returnRecord.id,
          item.saleItemId,
          saleItem.product_id,
          item.quantity,
          unitRefund,
          lineTotal,
        ]
      );

      const previousStock = Number(saleItem.current_stock);
      const newStock = previousStock + Number(item.quantity);
      await client.query(
        'UPDATE products SET current_stock = $2, updated_at = NOW() WHERE id = $1',
        [saleItem.product_id, newStock]
      );
      if (warehouseId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, updated_at = NOW()
          `,
          [saleItem.product_id, warehouseId, newStock, saleItem.min_stock_level]
        );
      }
      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reference_id, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'SALE_RETURN_IN', $3, $4, $5, 'return', $6, $7, $8, $9, $9)
        `,
        [
          saleItem.product_id,
          warehouseId,
          item.quantity,
          previousStock,
          newStock,
          returnRecord.id,
          returnNotes,
          returnRecord.return_number,
          userId,
        ]
      );
    }

    await client.query(
      'INSERT INTO refund_payments (return_id, refund_method, amount) VALUES ($1, $2, $3)',
      [returnRecord.id, payload.refundMethod, payload.totalRefund]
    );

    if (payload.refundMethod === 'Customer Credit' && sale.customer_id) {
      const balanceResult = await client.query(
        'SELECT current_balance FROM customers WHERE id = $1 FOR UPDATE',
        [sale.customer_id]
      );
      const previousBalance = Number(balanceResult.rows[0]?.current_balance || 0);
      const newBalance = Math.max(Number((previousBalance - payload.totalRefund).toFixed(2)), 0);
      await client.query(
        'UPDATE customers SET current_balance = $2, updated_at = NOW() WHERE id = $1',
        [sale.customer_id, newBalance]
      );
      await client.query(
        'INSERT INTO customer_ledger (customer_id, sale_id, return_id, entry_type, debit, credit, balance, notes) VALUES ($1, $2, $3, $4, 0, $5, $6, $7)',
        [
          sale.customer_id,
          sale.id,
          returnRecord.id,
          'REFUND_CREDIT',
          payload.totalRefund,
          newBalance,
          returnRecord.return_number,
        ]
      );
    }

    await syncRepository.queueOperation({
      client,
      entityType: 'return',
      entityId: returnRecord.id,
      operation: 'CREATE',
      terminalId: terminal.id,
      payload: {
        returnNumber: returnRecord.return_number,
        saleId: sale.id,
        totalRefund: payload.totalRefund,
      },
    });
    return returnRecord;
  });
}

module.exports = {
  createReturn,
  findInvoice,
  listReturns,
};
