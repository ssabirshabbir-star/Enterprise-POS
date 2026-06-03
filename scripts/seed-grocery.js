const { initializeDatabase } = require('../src/main/database/schema');
const { getPool, closeDatabase } = require('../src/main/database/connection');

const categories = ['Grocery', 'Beverages', 'Personal Care', 'Cleaning', 'Bakery', 'Frozen', 'Spices'];
const brands = ['Everyday', 'FreshMart', 'HomeChoice', 'PureLife', 'UrbanBasket'];
const units = [
  ['Piece', 'pc'],
  ['Pack', 'pack'],
  ['Kilogram', 'kg'],
  ['Gram', 'g'],
  ['Liter', 'ltr'],
  ['Bottle', 'btl']
];

const productNames = [
  'Basmati Rice 1kg', 'Basmati Rice 5kg', 'Wheat Flour 5kg', 'Sugar 1kg', 'White Lentils 1kg',
  'Red Lentils 1kg', 'Chickpeas 1kg', 'Black Gram 1kg', 'Cooking Oil 1L', 'Cooking Oil 3L',
  'Tea 250g', 'Tea 500g', 'Milk 1L', 'Powder Milk 400g', 'Yogurt 500g',
  'Butter 200g', 'Cheese Slices Pack', 'Eggs Dozen', 'Bread Large', 'Bun Pack',
  'Noodles Pack', 'Pasta 500g', 'Macaroni 500g', 'Tomato Ketchup', 'Mayonnaise',
  'Salt 800g', 'Red Chili Powder', 'Turmeric Powder', 'Coriander Powder', 'Cumin Seeds',
  'Black Pepper', 'Garam Masala', 'Ginger Garlic Paste', 'Pickle Jar', 'Jam Jar',
  'Honey Bottle', 'Cornflakes Pack', 'Oats 500g', 'Biscuits Pack', 'Cream Biscuits',
  'Chips Pack', 'Popcorn Pack', 'Chocolate Bar', 'Candy Pack', 'Bubble Gum',
  'Mineral Water 1.5L', 'Mineral Water 500ml', 'Cola 1.5L', 'Cola 500ml', 'Orange Juice 1L',
  'Mango Juice 1L', 'Energy Drink', 'Instant Coffee', 'Green Tea Pack', 'Soap Bar',
  'Shampoo Sachet', 'Shampoo Bottle', 'Toothpaste', 'Toothbrush', 'Face Wash',
  'Hand Wash', 'Dishwash Liquid', 'Dishwash Bar', 'Laundry Detergent', 'Washing Powder',
  'Fabric Softener', 'Floor Cleaner', 'Toilet Cleaner', 'Glass Cleaner', 'Bleach Bottle',
  'Tissue Box', 'Toilet Roll', 'Paper Towel', 'Garbage Bags', 'Aluminum Foil',
  'Cling Wrap', 'Match Box', 'Candles Pack', 'Battery AA Pack', 'Light Bulb',
  'Potatoes 1kg', 'Onions 1kg', 'Tomatoes 1kg', 'Green Chili 250g', 'Garlic 250g',
  'Ginger 250g', 'Bananas Dozen', 'Apples 1kg', 'Oranges 1kg', 'Frozen Peas 500g',
  'Frozen Fries 1kg', 'Chicken Nuggets Pack', 'Ice Cream Cup', 'Paneer 250g', 'Dates Pack',
  'Almonds 250g', 'Raisins 250g', 'Vermicelli Pack', 'Custard Powder', 'Jelly Pack'
];

const customers = [
  ['Ali Khan', '03000000001'], ['Sara Ahmed', '03000000002'], ['Usman Malik', '03000000003'],
  ['Ayesha Noor', '03000000004'], ['Bilal Hussain', '03000000005'], ['Fatima Raza', '03000000006'],
  ['Hamza Siddiqui', '03000000007'], ['Hina Shah', '03000000008'], ['Omar Farooq', '03000000009'],
  ['Maham Iqbal', '03000000010'], ['Danish Ali', '03000000011'], ['Nida Saleem', '03000000012'],
  ['Kamran Akhtar', '03000000013'], ['Zoya Tariq', '03000000014'], ['Imran Qureshi', '03000000015'],
  ['Muneeba Aslam', '03000000016'], ['Saad Mehmood', '03000000017'], ['Rabia Yousaf', '03000000018'],
  ['Faisal Rehman', '03000000019'], ['Noor Fatima', '03000000020']
];

async function ensureNamedTable(client, table, name, extra = {}) {
  const existing = await client.query(`SELECT id FROM ${table} WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1`, [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const keys = Object.keys(extra);
  const columns = ['name', ...keys];
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = [name, ...keys.map((key) => extra[key])];
  const inserted = await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`, values);
  return inserted.rows[0].id;
}

async function run() {
  await initializeDatabase();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const categoryIds = [];
    for (const name of categories) categoryIds.push(await ensureNamedTable(client, 'categories', name, { description: 'Demo grocery category' }));
    const brandIds = [];
    for (const name of brands) brandIds.push(await ensureNamedTable(client, 'brands', name, { description: 'Demo grocery brand' }));
    const unitIds = [];
    for (const [name, short_name] of units) unitIds.push(await ensureNamedTable(client, 'units', name, { short_name }));

    for (let index = 0; index < productNames.length; index += 1) {
      const productNo = index + 1;
      const sku = `GROC-${String(productNo).padStart(3, '0')}`;
      const barcode = `880100000${String(productNo).padStart(4, '0')}`;
      const categoryId = categoryIds[index % categoryIds.length];
      const brandId = brandIds[index % brandIds.length];
      const unitId = unitIds[index % unitIds.length];
      const purchasePrice = 40 + (index % 35) * 7;
      const salePrice = purchasePrice + 20 + (index % 9) * 5;
      const stock = 25 + (index % 40);
      const product = await client.query(
        `
          INSERT INTO products (name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, wholesale_price, min_stock_level, current_stock, is_active)
          SELECT $1::varchar, $2::varchar, $3::varchar, $4, $5, $6, $7, $8, $9, 5, $10, TRUE
          WHERE NOT EXISTS (SELECT 1 FROM products WHERE LOWER(sku) = LOWER($2::text) AND deleted_at IS NULL)
          RETURNING id
        `,
        [productNames[index], sku, barcode, categoryId, brandId, unitId, purchasePrice, salePrice, salePrice - 5, stock]
      );
      const productId = product.rows[0]?.id;
      if (productId) {
        await client.query(
          `
            INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
            SELECT $1, id, $2, 5 FROM warehouses WHERE is_default = TRUE
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
          `,
          [productId, stock]
        );
      }
    }

    for (const [name, phone] of customers) {
      await client.query(
        `
          INSERT INTO customers (name, phone, email, address, credit_limit, current_balance, is_active)
          SELECT $1::varchar, $2::varchar, $3::varchar, 'Demo customer address', 10000, 0, TRUE
          WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = $2::text AND deleted_at IS NULL)
        `,
        [name, phone, `${name.toLowerCase().replace(/\s+/g, '.')}@demo.local`]
      );
    }

    await client.query(
      "INSERT INTO activity_logs (action, status, message, metadata) VALUES ('seed.grocery', 'success', 'Demo grocery products and customers verified', $1::jsonb)",
      [JSON.stringify({ products: productNames.length, customers: customers.length })]
    );
    await client.query('COMMIT');
    console.log(`Verified ${productNames.length} grocery products and ${customers.length} customers.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closeDatabase();
  }
}

run().catch((error) => {
  console.error('Grocery seed failed:', error);
  process.exitCode = 1;
});
