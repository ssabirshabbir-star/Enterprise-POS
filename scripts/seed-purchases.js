const { loadEnvironment } = require('../src/main/config/env');
const { initializeDatabase } = require('../src/main/database/schema');
const { getPool, closeDatabase } = require('../src/main/database/connection');

loadEnvironment();

const purchasePlans = [
  { invoice: 'PUR-SEED-2026-001', supplier: 0, paidRatio: 1, daysAgo: 0, items: [0, 1, 2] },
  { invoice: 'PUR-SEED-2026-002', supplier: 1, paidRatio: 0.5, daysAgo: 1, items: [3, 4] },
  { invoice: 'PUR-SEED-2026-003', supplier: 2, paidRatio: 0, daysAgo: 2, items: [5, 6, 7] },
  { invoice: 'PUR-SEED-2026-004', supplier: 3, paidRatio: 1, daysAgo: 3, items: [8, 9] },
  { invoice: 'PUR-SEED-2026-005', supplier: 4, paidRatio: 0.35, daysAgo: 4, items: [10, 11, 12] },
  { invoice: 'PUR-SEED-2026-006', supplier: 5, paidRatio: 1, daysAgo: 5, items: [13, 14] },
  { invoice: 'PUR-SEED-2026-007', supplier: 6, paidRatio: 0, daysAgo: 6, items: [15, 16, 17] },
  { invoice: 'PUR-SEED-2026-008', supplier: 7, paidRatio: 0.75, daysAgo: 7, items: [18, 19] },
  { invoice: 'PUR-SEED-2026-009', supplier: 8, paidRatio: 1, daysAgo: 8, items: [20, 21, 22] },
  { invoice: 'PUR-SEED-2026-010', supplier: 9, paidRatio: 0.4, daysAgo: 9, items: [23, 24] }
];

function isoDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function run() {
  await initializeDatabase();
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const supplierRows = await client.query(
      'SELECT id FROM suppliers WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 20'
    );
    const productRows = await client.query(
      'SELECT id, name, current_stock, min_stock_level, purchase_price, sale_price FROM products WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 40'
    );
    const warehouseRows = await client.query(
      'SELECT id FROM warehouses WHERE is_default = TRUE AND deleted_at IS NULL LIMIT 1'
    );
    const userRows = await client.query(
      `
        SELECT users.id
        FROM users
        LEFT JOIN roles ON roles.id = users.role_id
        WHERE users.is_active = TRUE
        ORDER BY CASE WHEN roles.name = 'Admin' THEN 0 ELSE 1 END, users.id ASC
        LIMIT 1
      `
    );

    if (supplierRows.rows.length < 1 || productRows.rows.length < 5) {
      throw new Error('Need suppliers and products before seeding purchases.');
    }

    const warehouseId = warehouseRows.rows[0]?.id || null;
    const userId = userRows.rows[0]?.id || null;
    let inserted = 0;

    for (const plan of purchasePlans) {
      const exists = await client.query(
        'SELECT id FROM purchases WHERE invoice_number = $1 AND deleted_at IS NULL LIMIT 1',
        [plan.invoice]
      );
      if (exists.rows[0]) continue;

      const supplierId = supplierRows.rows[plan.supplier % supplierRows.rows.length].id;
      const items = plan.items.map((productIndex, itemIndex) => {
        const product = productRows.rows[productIndex % productRows.rows.length];
        const quantity = 6 + ((productIndex + itemIndex) % 7);
        const purchasePrice = Number(product.purchase_price || 40) + (itemIndex * 3);
        const salePrice = Math.max(Number(product.sale_price || purchasePrice + 20), purchasePrice + 15);
        return {
          productId: product.id,
          quantity,
          purchasePrice,
          salePrice,
          total: Number((quantity * purchasePrice).toFixed(2))
        };
      });

      const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
      const discount = Number((subtotal * 0.02).toFixed(2));
      const tax = 0;
      const grandTotal = Number((subtotal - discount + tax).toFixed(2));
      const paidAmount = Number((grandTotal * plan.paidRatio).toFixed(2));
      const dueAmount = Number((grandTotal - paidAmount).toFixed(2));
      const status = dueAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const purchaseResult = await client.query(
        `
          INSERT INTO purchases (
            supplier_id, invoice_number, purchase_date, subtotal, discount, tax,
            grand_total, paid_amount, due_amount, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `,
        [supplierId, plan.invoice, isoDateDaysAgo(plan.daysAgo), subtotal, discount, tax, grandTotal, paidAmount, dueAmount, status, userId]
      );
      const purchaseId = purchaseResult.rows[0].id;

      for (const item of items) {
        const productResult = await client.query(
          'SELECT id, current_stock, min_stock_level FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [item.productId]
        );
        const product = productResult.rows[0];
        const previousStock = Number(product.current_stock || 0);
        const newStock = previousStock + item.quantity;

        await client.query(
          'INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_price, sale_price, total) VALUES ($1, $2, $3, $4, $5, $6)',
          [purchaseId, item.productId, item.quantity, item.purchasePrice, item.salePrice, item.total]
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
            VALUES ($1, $2, 'PURCHASE_IN', $3, $4, $5, 'purchase', $6, 'Seed purchase received', $7, $8, $8)
          `,
          [item.productId, warehouseId, item.quantity, previousStock, newStock, purchaseId, plan.invoice, userId]
        );
      }

      const supplierBalance = await client.query('SELECT current_balance FROM suppliers WHERE id = $1 FOR UPDATE', [supplierId]);
      const nextBalance = Number(supplierBalance.rows[0]?.current_balance || 0) + dueAmount;
      await client.query('UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [supplierId, nextBalance]);
      await client.query(
        `
          INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
          VALUES ($1, $2, 'purchase', $2, $3, $4, $5, $6, $7, $8)
        `,
        [supplierId, purchaseId, dueAmount > 0 ? 'PURCHASE_PARTIAL' : 'PURCHASE_PAID', grandTotal, paidAmount, nextBalance, plan.invoice, userId]
      );

      inserted += 1;
    }

    await client.query(
      "INSERT INTO activity_logs (action, status, message, metadata) VALUES ('seed.purchases', 'success', 'Purchase seed verified', $1::jsonb)",
      [JSON.stringify({ requested: purchasePlans.length, inserted })]
    );
    await client.query('COMMIT');
    console.log(`Verified ${purchasePlans.length} purchase entries. Inserted ${inserted} new purchases.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closeDatabase();
  }
}

run().catch((error) => {
  console.error('Purchase seed failed:', error);
  process.exitCode = 1;
});
