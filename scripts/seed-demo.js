const bcrypt = require('bcryptjs');
const { loadEnvironment } = require('../src/main/config/env');
const { closeDatabase, withTransaction } = require('../src/main/database/connection');
const { initializeDatabase } = require('../src/main/database/schema');

loadEnvironment();

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || 'Demo@12345';

async function roleId(client, role) {
  const result = await client.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [role]);
  if (!result.rows[0]) throw new Error(`Missing role: ${role}`);
  return result.rows[0].id;
}

async function insertDemoUser(client, { username, email, fullName, role }) {
  const existing = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1', [username, email]);
  if (existing.rows[0]) return;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await client.query(
    `
      INSERT INTO users (username, email, full_name, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
    `,
    [username, email, fullName, passwordHash, await roleId(client, role)]
  );
}

async function insertNamed(client, table, name, extraColumns = {}, conflictColumn = 'name') {
  const columns = ['name', ...Object.keys(extraColumns)];
  const values = [name, ...Object.values(extraColumns)];
  const placeholders = values.map((_, index) => `$${index + 1}`);
  await client.query(
    `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (LOWER(${conflictColumn})) WHERE deleted_at IS NULL DO NOTHING
    `,
    values
  );
}

async function idByName(client, table, name) {
  const result = await client.query(`SELECT id FROM ${table} WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1`, [name]);
  return result.rows[0]?.id || null;
}

async function insertDemoProduct(client, product) {
  const categoryId = await idByName(client, 'categories', product.category);
  const brandId = await idByName(client, 'brands', product.brand);
  const unitId = await idByName(client, 'units', product.unit);
  await client.query(
    `
      INSERT INTO products (
        name, sku, barcode, category_id, brand_id, unit_id, purchase_price,
        sale_price, wholesale_price, min_stock_level, current_stock, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
      ON CONFLICT (LOWER(sku)) WHERE deleted_at IS NULL DO NOTHING
    `,
    [
      product.name,
      product.sku,
      product.barcode,
      categoryId,
      brandId,
      unitId,
      product.purchasePrice,
      product.salePrice,
      product.wholesalePrice,
      product.minStockLevel,
      product.currentStock
    ]
  );
}

async function seedDemo() {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_DEMO_SEED=true to insert development/demo seed data.');
  }

  await initializeDatabase();

  await withTransaction(async (client) => {
    await insertDemoUser(client, { username: 'demo_admin', email: 'demo.admin@example.local', fullName: 'Demo Admin', role: 'Admin' });
    await insertDemoUser(client, { username: 'demo_manager', email: 'demo.manager@example.local', fullName: 'Demo Manager', role: 'Manager' });
    await insertDemoUser(client, { username: 'demo_cashier', email: 'demo.cashier@example.local', fullName: 'Demo Cashier', role: 'Cashier' });

    for (const category of ['Demo Grocery', 'Demo Cold Drinks', 'Demo Household']) {
      await insertNamed(client, 'categories', category, { description: 'Development/demo category' });
    }
    for (const brand of ['Demo Brand', 'Demo Fresh', 'Demo Wholesale']) {
      await insertNamed(client, 'brands', brand, { description: 'Development/demo brand' });
    }
    await insertNamed(client, 'units', 'Piece', { short_name: 'pc' });
    await insertNamed(client, 'units', 'Kilogram', { short_name: 'kg' });
    await insertNamed(client, 'units', 'Pack', { short_name: 'pack' });

    await insertDemoProduct(client, {
      name: 'Demo Basmati Rice 1kg',
      sku: 'DEMO-RICE-1KG',
      barcode: '990000000001',
      category: 'Demo Grocery',
      brand: 'Demo Fresh',
      unit: 'Kilogram',
      purchasePrice: 320,
      salePrice: 380,
      wholesalePrice: 350,
      minStockLevel: 5,
      currentStock: 25
    });
    await insertDemoProduct(client, {
      name: 'Demo Cola 500ml',
      sku: 'DEMO-COLA-500',
      barcode: '990000000002',
      category: 'Demo Cold Drinks',
      brand: 'Demo Brand',
      unit: 'Piece',
      purchasePrice: 90,
      salePrice: 130,
      wholesalePrice: 115,
      minStockLevel: 10,
      currentStock: 60
    });
    await insertDemoProduct(client, {
      name: 'Demo Soap Pack',
      sku: 'DEMO-SOAP-PACK',
      barcode: '990000000003',
      category: 'Demo Household',
      brand: 'Demo Wholesale',
      unit: 'Pack',
      purchasePrice: 180,
      salePrice: 240,
      wholesalePrice: 215,
      minStockLevel: 8,
      currentStock: 35
    });

    await client.query(
      `
        INSERT INTO suppliers (name, phone, email, address)
        VALUES ('Demo Supplier', '03000000000', 'supplier@example.local', 'Development/demo supplier')
        ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING
      `
    );
    await client.query(
      `
        INSERT INTO customers (name, phone, email, address, credit_limit)
        SELECT 'Demo Customer', '03111111111', 'customer@example.local', 'Development/demo customer', 5000
        WHERE NOT EXISTS (
          SELECT 1 FROM customers WHERE LOWER(name) = LOWER('Demo Customer') AND deleted_at IS NULL
        )
      `
    );

    await client.query(
      `
        INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
        SELECT products.id, warehouses.id, products.current_stock, products.min_stock_level
        FROM products
        CROSS JOIN warehouses
        WHERE warehouses.is_default = TRUE AND products.sku LIKE 'DEMO-%'
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
      `
    );

    await client.query(
      `
        INSERT INTO activity_logs (action, status, message, metadata)
        VALUES ('seed.demo', 'success', 'Development/demo data seeded', $1::jsonb)
      `,
      [JSON.stringify({ users: ['demo_admin', 'demo_manager', 'demo_cashier'], password: 'Configured via DEMO_SEED_PASSWORD or Demo@12345' })]
    );
  });

  console.log('Development/demo seed data inserted without overwriting existing records.');
  console.log('Demo users: demo_admin, demo_manager, demo_cashier');
  console.log(`Demo password: ${DEMO_PASSWORD}`);
}

seedDemo()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
