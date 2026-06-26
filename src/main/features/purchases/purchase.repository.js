const { getPool, withTransaction } = require('../../database/connection');

function mapSupplier(row) {
  return row && {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    openingBalance: Number(row.opening_balance || 0),
    currentBalance: Number(row.current_balance || 0),
    isActive: row.is_active
  };
}

function mapPurchase(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    invoiceNumber: row.invoice_number,
    purchaseDate: row.purchase_date,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    tax: Number(row.tax),
    grandTotal: Number(row.grand_total),
    paidAmount: Number(row.paid_amount),
    dueAmount: Number(row.due_amount),
    status: row.status,
    createdAt: row.created_at,
    productNames: row.product_names || '',
    productSearchText: row.product_search_text || ''
  };
}

async function listSuppliers() {
  const result = await getPool().query(`
    SELECT suppliers.*,
      COALESCE(SUM(purchases.grand_total) FILTER (WHERE purchases.deleted_at IS NULL), 0)::numeric AS total_purchases,
      COALESCE(SUM(purchases.paid_amount) FILTER (WHERE purchases.deleted_at IS NULL), 0)::numeric AS total_paid,
      COALESCE(SUM(purchases.due_amount) FILTER (WHERE purchases.deleted_at IS NULL), 0)::numeric AS total_due,
      MAX(purchases.purchase_date) AS last_purchase_date
    FROM suppliers
    LEFT JOIN purchases ON purchases.supplier_id = suppliers.id
    WHERE suppliers.deleted_at IS NULL
    GROUP BY suppliers.id
    ORDER BY suppliers.name ASC
  `);
  return result.rows.map((row) => ({
    ...mapSupplier(row),
    stats: {
      totalPurchases: Number(row.total_purchases || 0),
      totalPaid: Number(row.total_paid || 0),
      totalDue: Number(row.total_due || 0),
      lastPurchaseDate: row.last_purchase_date
    }
  }));
}

async function createSupplier(payload) {
  return withTransaction(async (client) => {
    const openingBalance = Number(payload.openingBalance || 0);
    const result = await client.query(
      `
        INSERT INTO suppliers (name, phone, email, address, opening_balance, current_balance, is_active)
        VALUES ($1, $2, $3, $4, $5, $5, $6)
        RETURNING *
      `,
      [payload.name, payload.phone || null, payload.email || null, payload.address || null, openingBalance, payload.isActive !== false]
    );
    const supplier = mapSupplier(result.rows[0]);
    if (openingBalance > 0) {
      await client.query(
        `
          INSERT INTO supplier_ledger (supplier_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
          VALUES ($1, 'opening_balance', $1, 'OPENING_BALANCE', $2, 0, $2, 'Opening balance', $3)
        `,
        [supplier.id, openingBalance, payload.userId || null]
      );
    }
    return supplier;
  });
}

async function updateSupplier(id, payload) {
  const result = await getPool().query(
    `
      UPDATE suppliers
      SET name = $2, phone = $3, email = $4, address = $5, is_active = $6, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, payload.name, payload.phone || null, payload.email || null, payload.address || null, payload.isActive !== false]
  );
  return mapSupplier(result.rows[0]);
}

async function softDeleteSupplier(id) {
  const supplier = await getPool().query('SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!supplier.rows[0]) return false;
  if (Number(supplier.rows[0].current_balance || 0) > 0) {
    const error = new Error('Supplier has outstanding balance.');
    error.code = 'SUPPLIER_BALANCE_DUE';
    throw error;
  }
  const result = await getPool().query('UPDATE suppliers SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
  return result.rowCount > 0;
}

async function getSupplierDetails(id) {
  const suppliers = await getPool().query('SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
  if (!suppliers.rows[0]) return null;
  const purchases = await getPool().query(
    `
      SELECT invoice_number, purchase_date, grand_total, paid_amount, due_amount, status
      FROM purchases
      WHERE supplier_id = $1 AND deleted_at IS NULL
      ORDER BY purchase_date DESC, id DESC
      LIMIT 100
    `,
    [id]
  );
  const ledger = await getSupplierLedger(id);
  const statsResult = await getPool().query(
    `
      SELECT COALESCE(SUM(grand_total), 0)::numeric AS total_purchases,
             COALESCE(SUM(paid_amount), 0)::numeric AS total_paid,
             COALESCE(SUM(due_amount), 0)::numeric AS total_due,
             MAX(purchase_date) AS last_purchase_date
      FROM purchases
      WHERE supplier_id = $1 AND deleted_at IS NULL
    `,
    [id]
  );
  const stats = statsResult.rows[0] || {};
  return {
    supplier: {
      ...mapSupplier(suppliers.rows[0]),
      stats: {
        totalPurchases: Number(stats.total_purchases || 0),
        totalPaid: Number(stats.total_paid || 0),
        totalDue: Number(stats.total_due || 0),
        lastPurchaseDate: stats.last_purchase_date
      }
    },
    purchases: purchases.rows.map(mapPurchase),
    ledger
  };
}

async function getSupplierLedger(id) {
  const result = await getPool().query(
    `
      SELECT supplier_ledger.*, purchases.invoice_number, supplier_payments.payment_method
      FROM supplier_ledger
      LEFT JOIN purchases ON purchases.id = supplier_ledger.purchase_id
      LEFT JOIN supplier_payments ON supplier_payments.id = supplier_ledger.supplier_payment_id
      WHERE supplier_ledger.supplier_id = $1
      ORDER BY supplier_ledger.created_at DESC, supplier_ledger.id DESC
      LIMIT 300
    `,
    [id]
  );
  return result.rows.map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    referenceType: row.reference_type || row.entry_type,
    referenceId: row.reference_id || row.purchase_id || row.supplier_payment_id,
    invoiceNumber: row.invoice_number,
    paymentMethod: row.payment_method,
    entryType: row.entry_type,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    balance: Number(row.balance || 0),
    notes: row.notes,
    createdAt: row.created_at
  }));
}

async function recordSupplierPayment(payload, userId) {
  return withTransaction(async (client) => {
    const supplierResult = await client.query('SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [payload.supplierId]);
    const supplier = supplierResult.rows[0];
    if (!supplier) throw new Error('Supplier not found.');
    const previousBalance = Number(supplier.current_balance || 0);
    if (previousBalance <= 0) {
      const error = new Error('Supplier has no outstanding balance.');
      error.code = 'SUPPLIER_NO_DUE';
      throw error;
    }
    if (Number(payload.amount) > previousBalance) {
      const error = new Error('Supplier payment exceeds outstanding balance.');
      error.code = 'SUPPLIER_PAYMENT_EXCEEDS_BALANCE';
      error.balance = previousBalance;
      throw error;
    }
    const nextBalance = Number(Math.max(previousBalance - Number(payload.amount), 0).toFixed(2));
    const paymentResult = await client.query(
      `
        INSERT INTO supplier_payments (supplier_id, amount, payment_method, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [payload.supplierId, payload.amount, payload.paymentMethod, payload.notes || null, userId]
    );
    const paymentId = paymentResult.rows[0].id;
    await client.query('UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [payload.supplierId, nextBalance]);
    await client.query(
      `
        INSERT INTO supplier_ledger (supplier_id, supplier_payment_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
        VALUES ($1, $2, 'supplier_payment', $2, 'PAYMENT', 0, $3, $4, $5, $6)
      `,
      [payload.supplierId, paymentId, payload.amount, nextBalance, payload.notes || payload.paymentMethod, userId]
    );
    return { paymentId, balance: nextBalance };
  });
}

async function listPurchases() {
  const result = await getPool().query(
    `
      SELECT
        purchases.*,
        suppliers.name AS supplier_name,
        STRING_AGG(DISTINCT products.name, ', ' ORDER BY products.name) AS product_names,
        STRING_AGG(
          DISTINCT CONCAT_WS(' ', products.name, products.sku, products.barcode, 'code', products.id),
          ' '
        ) AS product_search_text
      FROM purchases
      LEFT JOIN suppliers ON suppliers.id = purchases.supplier_id
      LEFT JOIN purchase_items ON purchase_items.purchase_id = purchases.id
      LEFT JOIN products ON products.id = purchase_items.product_id
      WHERE purchases.deleted_at IS NULL
      GROUP BY purchases.id, suppliers.name
      ORDER BY purchases.created_at DESC
      LIMIT 100
    `
  );
  return result.rows.map(mapPurchase);
}

async function createPurchase(payload, userId) {
  return withTransaction(async (client) => {
    const warehouseResult = await client.query('SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1');
    const warehouseId = warehouseResult.rows[0]?.id;
    const purchaseResult = await client.query(
      `
        INSERT INTO purchases (
          supplier_id, invoice_number, purchase_date, subtotal, discount, tax,
          grand_total, paid_amount, due_amount, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `,
      [
        payload.supplierId,
        payload.invoiceNumber,
        payload.purchaseDate,
        payload.subtotal,
        payload.discount,
        payload.tax,
        payload.grandTotal,
        payload.paidAmount,
        payload.dueAmount,
        payload.status,
        userId
      ]
    );
    const purchaseId = purchaseResult.rows[0].id;

    for (const item of payload.items) {
      const productResult = await client.query('SELECT id, current_stock, min_stock_level FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [item.productId]);
      const product = productResult.rows[0];
      if (!product) throw new Error('Product not found in purchase item.');

      const previousStock = Number(product.current_stock);
      const newStock = previousStock + Number(item.quantity);

      await client.query(
        `
          INSERT INTO purchase_items (purchase_id, product_id, batch_number, expiration_date, quantity, purchase_price, sale_price, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [purchaseId, item.productId, item.batchNumber, item.expirationDate, item.quantity, item.purchasePrice, item.salePrice, item.total]
      );

      await client.query(
        'UPDATE products SET current_stock = $2, purchase_price = $3, sale_price = $4, updated_at = NOW() WHERE id = $1',
        [item.productId, newStock, item.purchasePrice, item.salePrice]
      );

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
          VALUES ($1, $2, 'PURCHASE_IN', $3, $4, $5, 'purchase', $6, 'Purchase received', $7, $8, $8)
        `,
        [item.productId, warehouseId, item.quantity, previousStock, newStock, purchaseId, payload.invoiceNumber, userId]
      );
    }

    if (payload.supplierId) {
      const supplierResult = await client.query('SELECT current_balance FROM suppliers WHERE id = $1 FOR UPDATE', [payload.supplierId]);
      const balance = Number(supplierResult.rows[0]?.current_balance || 0) + Number(payload.dueAmount);
      await client.query('UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [payload.supplierId, balance]);
      await client.query(
        `
          INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
          VALUES ($1, $2, 'purchase', $2, $3, $4, $5, $6, $7, $8)
        `,
        [payload.supplierId, purchaseId, payload.dueAmount > 0 ? 'PURCHASE_PARTIAL' : 'PURCHASE_PAID', payload.grandTotal, payload.paidAmount, balance, payload.invoiceNumber, userId]
      );
    }

    return purchaseId;
  });
}

async function getPurchaseDetails(purchaseId) {
  const purchase = await getPool().query(
    `
      SELECT purchases.*, suppliers.name AS supplier_name
      FROM purchases
      LEFT JOIN suppliers ON suppliers.id = purchases.supplier_id
      WHERE purchases.id = $1 AND purchases.deleted_at IS NULL
      LIMIT 1
    `,
    [purchaseId]
  );
  if (!purchase.rows[0]) return null;
  const items = await getPool().query(
    `
      SELECT purchase_items.*, products.name AS product_name, products.sku
      FROM purchase_items
      INNER JOIN products ON products.id = purchase_items.product_id
      WHERE purchase_items.purchase_id = $1
      ORDER BY purchase_items.id ASC
    `,
    [purchaseId]
  );
  return {
    ...mapPurchase(purchase.rows[0]),
    items: items.rows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      sku: item.sku,
      batchNumber: item.batch_number,
      expirationDate: item.expiration_date,
      quantity: Number(item.quantity),
      purchasePrice: Number(item.purchase_price),
      salePrice: Number(item.sale_price),
      total: Number(item.total)
    }))
  };
}

async function softDeletePurchase(purchaseId, userId) {
  return withTransaction(async (client) => {
    const purchaseResult = await client.query(
      'SELECT * FROM purchases WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [purchaseId]
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) return null;

    const itemsResult = await client.query(
      'SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY id ASC',
      [purchaseId]
    );
    const warehouseResult = await client.query('SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1');
    const warehouseId = warehouseResult.rows[0]?.id || null;

    for (const item of itemsResult.rows) {
      const productResult = await client.query(
        'SELECT id, current_stock, min_stock_level FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [item.product_id]
      );
      const product = productResult.rows[0];
      if (!product) {
        const error = new Error('Purchase product no longer exists.');
        error.code = 'PURCHASE_PRODUCT_MISSING';
        throw error;
      }

      const previousStock = Number(product.current_stock || 0);
      const quantity = Number(item.quantity || 0);
      const newStock = Number((previousStock - quantity).toFixed(3));
      if (newStock < 0) {
        const error = new Error('Deleting this purchase would make stock negative.');
        error.code = 'PURCHASE_DELETE_NEGATIVE_STOCK';
        error.productId = item.product_id;
        error.currentStock = previousStock;
        error.quantity = quantity;
        throw error;
      }

      await client.query(
        'UPDATE products SET current_stock = $2, updated_at = NOW() WHERE id = $1',
        [item.product_id, newStock]
      );

      if (warehouseId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, updated_at = NOW()
          `,
          [item.product_id, warehouseId, newStock, product.min_stock_level]
        );
      }

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reference_id, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'PURCHASE_DELETE', $3, $4, $5, 'purchase', $6, 'Purchase deleted', $7, $8, $8)
        `,
        [item.product_id, warehouseId, quantity, previousStock, newStock, purchase.id, purchase.invoice_number, userId]
      );
    }

    if (purchase.supplier_id) {
      const supplierResult = await client.query(
        'SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [purchase.supplier_id]
      );
      const supplier = supplierResult.rows[0];
      if (supplier) {
        const currentBalance = Number(supplier.current_balance || 0);
        const dueAmount = Number(purchase.due_amount || 0);
        if (dueAmount > currentBalance) {
          const error = new Error('Supplier balance is lower than this purchase due amount.');
          error.code = 'PURCHASE_DELETE_SUPPLIER_BALANCE_CONFLICT';
          throw error;
        }
        const nextBalance = Number((currentBalance - dueAmount).toFixed(2));
        await client.query('UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [purchase.supplier_id, nextBalance]);
        await client.query(
          `
            INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
            VALUES ($1, $2, 'purchase_delete', $2, 'PURCHASE_DELETE', 0, $3, $4, $5, $6)
          `,
          [purchase.supplier_id, purchase.id, dueAmount, nextBalance, `Deleted purchase ${purchase.invoice_number}`, userId]
        );
      }
    }

    await client.query('UPDATE purchases SET deleted_at = NOW(), updated_at = NOW(), status = $2 WHERE id = $1', [purchaseId, 'DELETED']);
    return { id: purchase.id, invoiceNumber: purchase.invoice_number };
  });
}

module.exports = {
  createPurchase,
  createSupplier,
  getSupplierDetails,
  getSupplierLedger,
  getPurchaseDetails,
  listPurchases,
  listSuppliers,
  recordSupplierPayment,
  softDeletePurchase,
  softDeleteSupplier,
  updateSupplier
};
