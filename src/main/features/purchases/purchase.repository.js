const { getPool, withTransaction } = require('../../database/connection');
const suppliersRepository = require('../suppliers/suppliers.repository');

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
    productSearchText: row.product_search_text || '',
  };
}

function mapProduct(row) {
  return (
    row && {
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      purchasePrice: Number(row.purchase_price || 0),
      salePrice: Number(row.sale_price || 0),
      autoUpdateSalePriceFromPurchase: Boolean(row.auto_update_sale_price_from_purchase),
      trackExpiry: Boolean(row.track_expiry),
      expiryRequired: Boolean(row.expiry_required),
      expiryAlertDays:
        row.expiry_alert_days === null || row.expiry_alert_days === undefined
          ? null
          : Number(row.expiry_alert_days),
      currentStock: Number(row.current_stock || 0),
    }
  );
}

async function listProducts() {
  const result = await getPool().query(`
    SELECT id, name, sku, barcode, purchase_price, sale_price,
           auto_update_sale_price_from_purchase, track_expiry, expiry_required,
           expiry_alert_days, current_stock
    FROM products
    WHERE deleted_at IS NULL AND is_active = TRUE
    ORDER BY name ASC
    LIMIT 500
  `);
  return result.rows.map(mapProduct);
}

async function getProductPolicies(productIds = []) {
  const ids = [...new Set(productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();

  const result = await getPool().query(
    `
      SELECT id, auto_update_sale_price_from_purchase, track_expiry, expiry_required
      FROM products
      WHERE id = ANY($1::int[]) AND deleted_at IS NULL AND is_active = TRUE
    `,
    [ids]
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        autoUpdateSalePriceFromPurchase: Boolean(row.auto_update_sale_price_from_purchase),
        trackExpiry: Boolean(row.track_expiry),
        expiryRequired: Boolean(row.expiry_required),
      },
    ])
  );
}

async function listPurchases() {
  const result = await getPool().query(
    `
      SELECT
        purchases.*,
        STRING_AGG(DISTINCT products.name, ', ' ORDER BY products.name) AS product_names,
        STRING_AGG(
          DISTINCT CONCAT_WS(' ', products.name, products.sku, products.barcode, 'code', products.id),
          ' '
        ) AS product_search_text
      FROM purchases
      LEFT JOIN purchase_items ON purchase_items.purchase_id = purchases.id
      LEFT JOIN products ON products.id = purchase_items.product_id
      WHERE purchases.deleted_at IS NULL
      GROUP BY purchases.id
      ORDER BY purchases.created_at DESC
      LIMIT 100
    `
  );
  const supplierNames = await suppliersRepository.getSupplierNamesByIds(
    result.rows.map((row) => row.supplier_id)
  );
  return result.rows.map((row) =>
    mapPurchase({
      ...row,
      supplier_name: supplierNames.get(Number(row.supplier_id)),
    })
  );
}

async function createPurchase(payload, userId) {
  return withTransaction(async (client) => {
    const warehouseResult = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
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
        userId,
      ]
    );
    const purchaseId = purchaseResult.rows[0].id;

    for (const item of payload.items) {
      const productResult = await client.query(
        'SELECT id, current_stock, min_stock_level, auto_update_sale_price_from_purchase FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [item.productId]
      );
      const product = productResult.rows[0];
      if (!product) throw new Error('Product not found in purchase item.');

      const previousStock = Number(product.current_stock);
      const newStock = previousStock + Number(item.quantity);

      await client.query(
        `
          INSERT INTO purchase_items (purchase_id, product_id, batch_number, expiration_date, quantity, purchase_price, sale_price, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          purchaseId,
          item.productId,
          item.batchNumber,
          item.expirationDate,
          item.quantity,
          item.purchasePrice,
          item.salePrice,
          item.total,
        ]
      );

      await client.query(
        `
          UPDATE products
          SET current_stock = $2,
              purchase_price = $3,
              sale_price = CASE
                WHEN auto_update_sale_price_from_purchase = TRUE THEN $4
                ELSE sale_price
              END,
              updated_at = NOW()
          WHERE id = $1
        `,
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
        [
          item.productId,
          warehouseId,
          item.quantity,
          previousStock,
          newStock,
          purchaseId,
          payload.invoiceNumber,
          userId,
        ]
      );
    }

    if (payload.supplierId) {
      await suppliersRepository.applyPurchaseBalance(client, { ...payload, purchaseId }, userId);
    }

    return purchaseId;
  });
}

async function getPurchaseDetails(purchaseId) {
  const purchase = await getPool().query(
    `
      SELECT purchases.*
      FROM purchases
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
  const supplierNames = await suppliersRepository.getSupplierNamesByIds([
    purchase.rows[0].supplier_id,
  ]);
  return {
    ...mapPurchase({
      ...purchase.rows[0],
      supplier_name: supplierNames.get(Number(purchase.rows[0].supplier_id)),
    }),
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
      total: Number(item.total),
    })),
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
    const warehouseResult = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
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
        [
          item.product_id,
          warehouseId,
          quantity,
          previousStock,
          newStock,
          purchase.id,
          purchase.invoice_number,
          userId,
        ]
      );
    }

    if (purchase.supplier_id) {
      await suppliersRepository.reversePurchaseBalance(
        client,
        {
          supplierId: purchase.supplier_id,
          purchaseId: purchase.id,
          dueAmount: purchase.due_amount,
          invoiceNumber: purchase.invoice_number,
        },
        userId
      );
    }

    await client.query(
      'UPDATE purchases SET deleted_at = NOW(), updated_at = NOW(), status = $2 WHERE id = $1',
      [purchaseId, 'DELETED']
    );
    return { id: purchase.id, invoiceNumber: purchase.invoice_number };
  });
}

module.exports = {
  createPurchase,
  getProductPolicies,
  getPurchaseDetails,
  listProducts,
  listPurchases,
  softDeletePurchase,
};
