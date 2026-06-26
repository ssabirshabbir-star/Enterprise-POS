const { getPool, withTransaction } = require('../../database/connection');
const syncRepository = require('../sync/sync.repository');
const luckyDrawRepository   = require('../lucky-draw/lucky-draw.repository');
const luckyDrawV2Repository = require('../luckydraw_v2/repository/luckydraw.repository');

function mapPosProduct(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    salePrice: Number(row.sale_price),
    wholesalePrice: Number(row.wholesale_price || row.sale_price),
    currentStock: Number(row.current_stock),
    isActive: row.is_active,
    categoryId: row.category_id,
    categoryName: row.category_name
  };
}

function mapCustomer(row) {
  return row && {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    currentBalance: Number(row.current_balance || 0),
    creditLimit: Number(row.credit_limit || 0),
    isWalkIn: row.is_walk_in
  };
}

async function searchProducts(filters) {
  const search = typeof filters === 'object' && filters !== null ? filters.search : filters;
  const categoryId = typeof filters === 'object' && filters !== null ? Number(filters.categoryId || 0) : 0;
  const query = `%${String(search || '').trim().toLowerCase()}%`;
  const params = [query];
  const categoryClause = Number.isInteger(categoryId) && categoryId > 0 ? 'AND products.category_id = $2' : '';
  if (categoryClause) params.push(categoryId);
  const result = await getPool().query(
    `
      SELECT products.id, products.name, products.sku, products.barcode, products.sale_price, products.wholesale_price, products.category_id,
             products.current_stock, products.is_active, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.deleted_at IS NULL
        AND products.is_active = TRUE
        ${categoryClause}
        AND (
          LOWER(products.name) LIKE $1
          OR LOWER(products.sku) LIKE $1
          OR LOWER(products.barcode) LIKE $1
          OR products.id::text LIKE $1
        )
      ORDER BY products.name ASC
      LIMIT 50
    `,
    params
  );
  return result.rows.map(mapPosProduct);
}

async function findProductByBarcode(barcode) {
  const result = await getPool().query(
    `
      SELECT products.id, products.name, products.sku, products.barcode, products.sale_price, products.wholesale_price, products.category_id,
             products.current_stock, products.is_active, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.deleted_at IS NULL AND LOWER(products.barcode) = LOWER($1)
      LIMIT 1
    `,
    [barcode]
  );
  return mapPosProduct(result.rows[0]);
}

async function listCustomers(search = '') {
  const query = `%${String(search || '').trim().toLowerCase()}%`;
  const result = await getPool().query(
    `
      SELECT *
      FROM customers
      WHERE deleted_at IS NULL
        AND (LOWER(name) LIKE $1 OR COALESCE(phone, '') LIKE $1)
      ORDER BY is_walk_in DESC, name ASC
      LIMIT 50
    `,
    [query]
  );
  return result.rows.map(mapCustomer);
}

async function createCustomer(payload) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const result = await client.query(
      `
        INSERT INTO customers (name, phone, email, address, credit_limit)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [payload.name, payload.phone || null, payload.email || null, payload.address || null, payload.creditLimit || 0]
    );
    const customer = result.rows[0];
    await syncRepository.queueOperation({
      client,
      entityType: 'customer',
      entityId: customer.id,
      operation: 'CREATE',
      terminalId: terminal.id,
      payload: { name: customer.name, phone: customer.phone }
    });
    return mapCustomer(customer);
  });
}

async function getWalkInCustomerId(client) {
  const result = await client.query("SELECT id FROM customers WHERE is_walk_in = TRUE AND deleted_at IS NULL ORDER BY id ASC LIMIT 1");
  if (result.rows[0]) return result.rows[0].id;
  const created = await client.query("INSERT INTO customers (name, is_walk_in) VALUES ('Walk-in Customer', TRUE) RETURNING id");
  return created.rows[0].id;
}

async function invoiceExists(invoiceNumber) {
  const result = await getPool().query('SELECT id FROM sales WHERE LOWER(invoice_number) = LOWER($1) LIMIT 1', [invoiceNumber]);
  return Boolean(result.rows[0]);
}

async function createSale(payload, cashierId) {
  return withTransaction(async (client) => {
    const customerId = payload.customerId || await getWalkInCustomerId(client);
    const terminal = await syncRepository.getOrCreateTerminal(client);
    let lockedCustomer = null;
    if (payload.dueAmount > 0) {
      const customerResult = await client.query(
        'SELECT id, current_balance, credit_limit, is_walk_in FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [customerId]
      );
      lockedCustomer = customerResult.rows[0];
      if (!lockedCustomer || lockedCustomer.is_walk_in) throw new Error('CREDIT_SALE_REQUIRES_CUSTOMER');
      const nextBalance = Number(lockedCustomer.current_balance || 0) + Number(payload.dueAmount);
      const creditLimit = Number(lockedCustomer.credit_limit || 0);
      if (creditLimit > 0 && nextBalance > creditLimit) throw new Error('CREDIT_LIMIT_EXCEEDED');
      lockedCustomer.next_balance = nextBalance;
    }
    const saleResult = await client.query(
      `
        INSERT INTO sales (
          invoice_number, customer_id, terminal_id, cashier_id, subtotal, discount, tax,
          grand_total, paid_amount, change_amount, payment_method, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED')
        RETURNING *
      `,
      [
        payload.invoiceNumber,
        customerId,
        terminal.id,
        cashierId,
        payload.subtotal,
        payload.discount,
        payload.tax,
        payload.grandTotal,
        payload.paidAmount,
        payload.changeAmount,
        payload.paymentMethod
      ]
    );
    const sale = saleResult.rows[0];

    const warehouseResult = await client.query('SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1');
    const warehouseId = warehouseResult.rows[0]?.id;

    for (const item of payload.items) {
      const productResult = await client.query(
        'SELECT id, current_stock, min_stock_level, is_active FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [item.productId]
      );
      const product = productResult.rows[0];
      if (!product || !product.is_active) throw new Error('Product is inactive or unavailable.');

      const previousStock = Number(product.current_stock);
      const newStock = previousStock - Number(item.quantity);
      if (newStock < 0) throw new Error('Insufficient stock.');

      await client.query(
        `
          INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount, total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [sale.id, item.productId, item.quantity, item.unitPrice, item.discount, item.total]
      );

      await client.query('UPDATE products SET current_stock = $2, updated_at = NOW() WHERE id = $1', [item.productId, newStock]);

      if (warehouseId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, updated_at = NOW()
          `,
          [item.productId, warehouseId, newStock, product.min_stock_level]
        );
      }

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reference_id, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'SALE_OUT', $3, $4, $5, 'sale', $6, 'POS sale completed', $7, $8, $8)
        `,
        [item.productId, warehouseId, item.quantity, previousStock, newStock, sale.id, sale.invoice_number, cashierId]
      );
    }

    await client.query(
      'INSERT INTO payments (sale_id, payment_method, amount) VALUES ($1, $2, $3)',
      [sale.id, payload.paymentMethod, payload.paidAmount]
    );

    if (payload.dueAmount > 0) {
      const balance = lockedCustomer.next_balance;
      await client.query('UPDATE customers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [customerId, balance]);
      await client.query(
        'INSERT INTO customer_ledger (customer_id, sale_id, entry_type, debit, credit, balance, notes) VALUES ($1, $2, $3, $4, 0, $5, $6)',
        [customerId, sale.id, 'SALE_CREDIT', payload.dueAmount, balance, sale.invoice_number]
      );
    }

    const luckyDrawEntries = await luckyDrawRepository.createEntriesForSale(client, sale, cashierId);

    // M-3: also create entries for V2-managed campaigns (silent fail — must not block billing)
    let luckyDrawV2Entries = [];
    try {
      luckyDrawV2Entries = await luckyDrawV2Repository.createEntriesForSale(client, sale, cashierId);
    } catch (v2Err) {
      console.error('[LuckyDrawV2] Auto-entry failed (billing unaffected):', v2Err.message);
    }

    await syncRepository.queueOperation({
      client,
      entityType: 'sale',
      entityId: sale.id,
      operation: 'CREATE',
      terminalId: terminal.id,
      payload: { invoiceNumber: sale.invoice_number, grandTotal: Number(sale.grand_total), luckyDrawCoupons: [...luckyDrawEntries, ...luckyDrawV2Entries].map((entry) => entry.couponNo) }
    });

    sale.lucky_draw_entries = luckyDrawEntries;
    return sale;
  });
}

async function getSaleReceipt(saleId) {
  const saleResult = await getPool().query(
    `
      SELECT sales.*, users.full_name AS cashier_name, customers.name AS customer_name
      FROM sales
      LEFT JOIN users ON users.id = sales.cashier_id
      LEFT JOIN customers ON customers.id = sales.customer_id
      WHERE sales.id = $1
      LIMIT 1
    `,
    [saleId]
  );
  const sale = saleResult.rows[0];
  if (!sale) return null;
  const items = await getPool().query(
    `
      SELECT sale_items.*, products.name AS product_name, products.sku
      FROM sale_items
      INNER JOIN products ON products.id = sale_items.product_id
      WHERE sale_items.sale_id = $1
      ORDER BY sale_items.id ASC
    `,
    [saleId]
  );
  const coupons = await getPool().query(
    `
      SELECT entries.*, campaigns.campaign_name, campaigns.campaign_code
      FROM lucky_draw_entries entries
      INNER JOIN lucky_draw_campaigns campaigns ON campaigns.id = entries.campaign_id
      WHERE entries.sale_id = $1
      ORDER BY entries.created_at ASC
    `,
    [saleId]
  );
  return {
    id: sale.id,
    invoiceNumber: sale.invoice_number,
    createdAt: sale.created_at,
    cashierName: sale.cashier_name,
    customerName: sale.customer_name,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax: Number(sale.tax),
    grandTotal: Number(sale.grand_total),
    paidAmount: Number(sale.paid_amount),
    changeAmount: Number(sale.change_amount),
    paymentMethod: sale.payment_method,
    luckyDrawCoupons: coupons.rows.map((coupon) => ({
      campaignId: Number(coupon.campaign_id),
      campaignName: coupon.campaign_name,
      campaignCode: coupon.campaign_code,
      couponNo: coupon.coupon_no,
      qrValue: coupon.qr_value,
      barcodeValue: coupon.barcode_value,
      billAmount: Number(coupon.bill_amount || 0),
      verificationStatus: coupon.verification_status
    })),
    items: items.rows.map((item) => ({
      productName: item.product_name,
      sku: item.sku,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount),
      total: Number(item.total)
    }))
  };
}

async function getSaleReceiptByInvoice(invoiceNumber) {
  const result = await getPool().query(
    'SELECT id FROM sales WHERE LOWER(invoice_number) = LOWER($1) LIMIT 1',
    [invoiceNumber]
  );
  const saleId = result.rows[0]?.id;
  return saleId ? getSaleReceipt(saleId) : null;
}

async function getLastSaleReceipt(cashierId) {
  const result = await getPool().query(
    `
      SELECT id
      FROM sales
      WHERE cashier_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [cashierId]
  );
  const saleId = result.rows[0]?.id;
  return saleId ? getSaleReceipt(saleId) : null;
}

async function listHeldSales(cashierId) {
  const result = await getPool().query(
    `
      SELECT held_sales.*, customers.name AS customer_name
      FROM held_sales
      LEFT JOIN customers ON customers.id = held_sales.customer_id
      WHERE held_sales.deleted_at IS NULL AND held_sales.status = 'HELD'
        AND (held_sales.cashier_id = $1 OR $2 = TRUE)
      ORDER BY held_sales.updated_at DESC
      LIMIT 100
    `,
    [cashierId, true]
  );
  return result.rows.map((row) => ({
    id: row.id,
    holdNumber: row.hold_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    payload: row.payload,
    createdAt: row.created_at
  }));
}

async function holdSale(payload, cashierId) {
  const holdNumber = `HOLD-${Date.now()}`;
  const result = await getPool().query(
    `
      INSERT INTO held_sales (hold_number, customer_id, cashier_id, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [holdNumber, payload.customerId || null, cashierId, JSON.stringify(payload)]
  );
  return { id: result.rows[0].id, holdNumber };
}

async function deleteHeldSale(holdId) {
  const result = await getPool().query(
    "UPDATE held_sales SET deleted_at = NOW(), status = 'DELETED', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
    [holdId]
  );
  return result.rowCount > 0;
}

module.exports = {
  createCustomer,
  createSale,
  deleteHeldSale,
  findProductByBarcode,
  getSaleReceipt,
  getLastSaleReceipt,
  getSaleReceiptByInvoice,
  holdSale,
  invoiceExists,
  listCustomers,
  listHeldSales,
  searchProducts
};
