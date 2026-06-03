const { getPool, withTransaction } = require('../../database/connection');
const syncRepository = require('../sync/sync.repository');

function mapInventory(row) {
  return {
    productId: row.product_id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryName: row.category_name,
    currentStock: Number(row.current_stock),
    minStockLevel: Number(row.min_stock_level),
    lastMovementAt: row.last_movement_at,
    status: Number(row.current_stock) <= 0 ? 'OUT_OF_STOCK' : Number(row.current_stock) <= Number(row.min_stock_level) ? 'LOW_STOCK' : 'IN_STOCK'
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    reason: row.reason || row.notes,
    userId: row.user_id || row.created_by,
    createdAt: row.created_at
  };
}

async function listInventory({ search = '', lowStockOnly = false, outOfStockOnly = false }) {
  const params = [];
  let where = 'WHERE products.deleted_at IS NULL';

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND (LOWER(products.name) LIKE $${params.length} OR LOWER(products.sku) LIKE $${params.length} OR LOWER(products.barcode) LIKE $${params.length})`;
  }

  if (outOfStockOnly) {
    where += ' AND products.current_stock <= 0';
  } else if (lowStockOnly) {
    where += ' AND products.current_stock > 0 AND products.current_stock <= products.min_stock_level';
  }

  const result = await getPool().query(
    `
      SELECT
        products.id AS product_id,
        products.name,
        products.sku,
        products.barcode,
        products.current_stock,
        products.min_stock_level,
        categories.name AS category_name,
        MAX(stock_movements.created_at) AS last_movement_at
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      LEFT JOIN stock_movements ON stock_movements.product_id = products.id
      ${where}
      GROUP BY products.id, categories.name
      ORDER BY products.name ASC
      LIMIT 300
    `,
    params
  );

  return result.rows.map(mapInventory);
}

async function listMovements({ productId = null, limit = 80 }) {
  const params = [];
  let where = 'WHERE 1=1';

  if (productId) {
    params.push(productId);
    where += ` AND stock_movements.product_id = $${params.length}`;
  }

  params.push(limit);
  const result = await getPool().query(
    `
      SELECT
        stock_movements.*,
        products.name AS product_name,
        products.sku
      FROM stock_movements
      INNER JOIN products ON products.id = stock_movements.product_id
      ${where}
      ORDER BY stock_movements.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map(mapMovement);
}

async function adjustStock({ productId, movementType, quantity, reason, userId }) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const productResult = await client.query(
      'SELECT id, current_stock, min_stock_level FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [productId]
    );
    const product = productResult.rows[0];
    if (!product) {
      return { ok: false, message: 'Product not found.' };
    }

    const warehouseResult = await client.query('SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1');
    const warehouseId = warehouseResult.rows[0]?.id;
    const previousStock = Number(product.current_stock);
    let newStock = previousStock;

    if (movementType === 'IN') newStock += quantity;
    if (movementType === 'OUT') newStock -= quantity;
    if (movementType === 'CORRECTION') newStock = quantity;

    if (newStock < 0) {
      return { ok: false, message: 'Stock cannot go negative.' };
    }

    await client.query('UPDATE products SET current_stock = $2, updated_at = NOW() WHERE id = $1', [productId, newStock]);

    if (warehouseId) {
      await client.query(
        `
          INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
        `,
        [productId, warehouseId, newStock, product.min_stock_level]
      );
    }

    const movementResult = await client.query(
      `
        INSERT INTO stock_movements (
          product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
          reference_type, reason, notes, user_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'inventory.adjustment', $7, $7, $8, $8)
        RETURNING id
      `,
      [productId, warehouseId, movementType, movementType === 'CORRECTION' ? newStock - previousStock : quantity, previousStock, newStock, reason, userId]
    );

    await syncRepository.queueOperation({
      client,
      entityType: 'stock_movement',
      entityId: movementResult.rows[0].id,
      operation: 'ADJUST',
      terminalId: terminal.id,
      payload: { productId, movementType, quantity, previousStock, newStock, reason }
    });

    return { ok: true, previousStock, newStock };
  });
}

module.exports = {
  adjustStock,
  listInventory,
  listMovements
};
