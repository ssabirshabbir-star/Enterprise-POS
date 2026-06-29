const { getPool, withTransaction } = require('../../database/connection');

function mapProduct(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitShortName: row.unit_short_name,
    purchasePrice: Number(row.purchase_price),
    salePrice: Number(row.sale_price),
    wholesalePrice: Number(row.wholesale_price),
    minStockLevel: Number(row.min_stock_level),
    currentStock: Number(row.current_stock),
    allowSalePriceOverride: Boolean(row.allow_sale_price_override),
    autoUpdateSalePriceFromPurchase: Boolean(row.auto_update_sale_price_from_purchase),
    trackExpiry: Boolean(row.track_expiry),
    expiryRequired: Boolean(row.expiry_required),
    expiryAlertDays:
      row.expiry_alert_days === null || row.expiry_alert_days === undefined
        ? null
        : Number(row.expiry_alert_days),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const productSelect = `
  SELECT
    products.*,
    categories.name AS category_name,
    brands.name AS brand_name,
    units.name AS unit_name,
    units.short_name AS unit_short_name
  FROM products
  LEFT JOIN categories ON categories.id = products.category_id
  LEFT JOIN brands ON brands.id = products.brand_id
  LEFT JOIN units ON units.id = products.unit_id
`;

async function listProducts({
  id = null,
  search = '',
  category = null,
  brand = null,
  unit = null,
  stockStatus = '',
  tab = '',
  limit = 100,
  offset = 0,
}) {
  const params = [];
  let where = 'WHERE products.deleted_at IS NULL';

  if (id) {
    params.push(id);
    where += ` AND products.id = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND (
      LOWER(products.name) LIKE $${params.length}
      OR LOWER(products.sku) LIKE $${params.length}
      OR LOWER(products.barcode) LIKE $${params.length}
      OR products.id::text LIKE $${params.length}
    )`;
  }

  if (category) {
    params.push(category);
    where += ` AND products.category_id = $${params.length}`;
  }

  if (brand) {
    params.push(brand);
    where += ` AND products.brand_id = $${params.length}`;
  }

  if (unit) {
    params.push(unit);
    where += ` AND products.unit_id = $${params.length}`;
  }

  const stockFilter = stockStatus || tab;
  if (stockFilter === 'in') {
    where += ' AND products.current_stock > 0';
  } else if (stockFilter === 'low') {
    where +=
      ' AND products.current_stock > 0 AND products.current_stock <= products.min_stock_level';
  } else if (stockFilter === 'out') {
    where += ' AND products.current_stock <= 0';
  }

  if (tab === 'active') {
    where += ' AND products.is_active = TRUE';
  } else if (tab === 'inactive') {
    where += ' AND products.is_active = FALSE';
  }

  params.push(limit, offset);
  const result = await getPool().query(
    `
      ${productSelect}
      ${where}
      ORDER BY products.updated_at DESC, products.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return result.rows.map(mapProduct);
}

async function findProductById(productId) {
  const result = await getPool().query(
    `${productSelect} WHERE products.id = $1 AND products.deleted_at IS NULL LIMIT 1`,
    [productId]
  );
  return mapProduct(result.rows[0]);
}

async function findProductByBarcode(barcode) {
  const result = await getPool().query(
    `${productSelect} WHERE LOWER(products.barcode) = LOWER($1) AND products.deleted_at IS NULL LIMIT 1`,
    [barcode]
  );
  return mapProduct(result.rows[0]);
}

async function skuOrBarcodeExists({ sku, barcode, exceptId = null }) {
  const result = await getPool().query(
    `
      SELECT sku, barcode
      FROM products
      WHERE deleted_at IS NULL
        AND ($3::integer IS NULL OR id <> $3)
        AND (LOWER(sku) = LOWER($1) OR LOWER(barcode) = LOWER($2))
      LIMIT 1
    `,
    [sku, barcode, exceptId]
  );

  return result.rows[0] || null;
}

async function createProduct(payload, actorId) {
  return withTransaction(async (client) => {
    const warehouseResult = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
    const warehouseId = warehouseResult.rows[0]?.id;
    const result = await client.query(
      `
        INSERT INTO products (
          name, sku, barcode, category_id, brand_id, unit_id,
          purchase_price, sale_price, wholesale_price,
          min_stock_level, current_stock, allow_sale_price_override,
          auto_update_sale_price_from_purchase, track_expiry,
          expiry_required, expiry_alert_days, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `,
      [
        payload.name,
        payload.sku,
        payload.barcode,
        payload.categoryId,
        payload.brandId,
        payload.unitId,
        payload.purchasePrice,
        payload.salePrice,
        payload.wholesalePrice,
        payload.minStockLevel,
        payload.currentStock,
        payload.allowSalePriceOverride,
        payload.autoUpdateSalePriceFromPurchase,
        payload.trackExpiry,
        payload.expiryRequired,
        payload.expiryAlertDays,
        payload.isActive,
      ]
    );

    const productId = result.rows[0].id;

    if (warehouseId) {
      await client.query(
        `
          INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
        `,
        [productId, warehouseId, payload.currentStock, payload.minStockLevel]
      );
    }

    if (Number(payload.currentStock) > 0) {
      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'INITIAL_STOCK', $3, 0, $3, 'product.create', 'Opening stock', 'Opening stock from product creation', $4, $4)
        `,
        [productId, warehouseId, payload.currentStock, actorId]
      );
    }

    return productId;
  });
}

async function updateProduct(productId, payload, actorId) {
  return withTransaction(async (client) => {
    const warehouseResult = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
    const warehouseId = warehouseResult.rows[0]?.id;
    const previous = await client.query(
      'SELECT current_stock FROM products WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [productId]
    );
    const previousStock = Number(previous.rows[0]?.current_stock ?? 0);

    const result = await client.query(
      `
        UPDATE products
        SET
          name = $2,
          sku = $3,
          barcode = $4,
          category_id = $5,
          brand_id = $6,
          unit_id = $7,
          purchase_price = $8,
          sale_price = $9,
          wholesale_price = $10,
          min_stock_level = $11,
          current_stock = $12,
          allow_sale_price_override = $13,
          auto_update_sale_price_from_purchase = $14,
          track_expiry = $15,
          expiry_required = $16,
          expiry_alert_days = $17,
          is_active = $18,
          updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [
        productId,
        payload.name,
        payload.sku,
        payload.barcode,
        payload.categoryId,
        payload.brandId,
        payload.unitId,
        payload.purchasePrice,
        payload.salePrice,
        payload.wholesalePrice,
        payload.minStockLevel,
        payload.currentStock,
        payload.allowSalePriceOverride,
        payload.autoUpdateSalePriceFromPurchase,
        payload.trackExpiry,
        payload.expiryRequired,
        payload.expiryAlertDays,
        payload.isActive,
      ]
    );

    if (result.rowCount > 0 && previousStock !== Number(payload.currentStock)) {
      if (warehouseId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
          `,
          [productId, warehouseId, payload.currentStock, payload.minStockLevel]
        );
      }

      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
            reference_type, reason, notes, user_id, created_by
          )
          VALUES ($1, $2, 'MANUAL_ADJUSTMENT', $3, $4, $5, 'product.update', 'Product form stock edit', 'Stock updated from product form', $6, $6)
        `,
        [
          productId,
          warehouseId,
          Number(payload.currentStock) - previousStock,
          previousStock,
          payload.currentStock,
          actorId,
        ]
      );
    } else if (result.rowCount > 0 && warehouseId) {
      await client.query(
        'UPDATE inventory SET min_stock_level = $3, updated_at = NOW() WHERE product_id = $1 AND warehouse_id = $2',
        [productId, warehouseId, payload.minStockLevel]
      );
    }

    return result.rowCount > 0;
  });
}

async function countProducts() {
  const result = await getPool().query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
      COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= min_stock_level)::int AS low_stock,
      COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock,
      COALESCE(SUM(sale_price * current_stock), 0)::numeric AS total_value
    FROM products
    WHERE deleted_at IS NULL
  `);
  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    lowStock: Number(row.low_stock || 0),
    outOfStock: Number(row.out_of_stock || 0),
    totalValue: Number(row.total_value || 0),
  };
}

async function softDeleteProduct(productId) {
  const result = await getPool().query(
    `
      UPDATE products
      SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [productId]
  );

  return result.rowCount > 0;
}

module.exports = {
  createProduct,
  countProducts,
  findProductByBarcode,
  findProductById,
  listProducts,
  skuOrBarcodeExists,
  softDeleteProduct,
  updateProduct,
};
