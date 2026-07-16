const { getPool, withTransaction } = require('../../database/connection');

function mapSupplier(row) {
  return (
    row && {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      openingBalance: Number(row.opening_balance || 0),
      currentBalance: Number(row.current_balance || 0),
      isActive: row.is_active,
    }
  );
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
    productSearchText: row.product_search_text || '',
  };
}

function supplierFinancialSummaryJoins(alias = 'suppliers') {
  return `
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(purchases.grand_total), 0)::numeric AS total_purchases,
        COALESCE(SUM(purchases.paid_amount), 0)::numeric AS purchase_paid,
        MAX(purchases.purchase_date) AS last_purchase_date
      FROM purchases
      WHERE purchases.supplier_id = ${alias}.id
        AND purchases.deleted_at IS NULL
    ) purchase_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(supplier_payments.amount), 0)::numeric AS supplier_payments_total
      FROM supplier_payments
      WHERE supplier_payments.supplier_id = ${alias}.id
    ) payment_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(supplier_payments.created_at) AS last_payment_date
      FROM supplier_payments
      WHERE supplier_payments.supplier_id = ${alias}.id
    ) last_payment_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT supplier_ledger.balance AS latest_ledger_balance
      FROM supplier_ledger
      WHERE supplier_ledger.supplier_id = ${alias}.id
      ORDER BY supplier_ledger.created_at DESC, supplier_ledger.id DESC
      LIMIT 1
    ) ledger_summary ON TRUE
  `;
}

function supplierFinancialSummaryColumns(alias = 'suppliers') {
  return `
    COALESCE(purchase_summary.total_purchases, 0)::numeric AS total_purchases,
    COALESCE(purchase_summary.purchase_paid, 0)::numeric AS purchase_paid,
    COALESCE(payment_summary.supplier_payments_total, 0)::numeric AS supplier_payments_total,
    (
      COALESCE(purchase_summary.purchase_paid, 0)
      + COALESCE(payment_summary.supplier_payments_total, 0)
    )::numeric AS total_paid,
    ${alias}.current_balance::numeric AS total_due,
    purchase_summary.last_purchase_date AS last_purchase_date,
    last_payment_summary.last_payment_date AS last_payment_date,
    ledger_summary.latest_ledger_balance::numeric AS latest_ledger_balance
  `;
}

function mapSupplierFinancialStats(row = {}) {
  const totalDue = Number(row.total_due ?? row.current_balance ?? 0);
  return {
    totalPurchases: Number(row.total_purchases || 0),
    totalPaid: Number(row.total_paid || 0),
    totalPayments: Number(row.total_paid || 0),
    totalDue,
    outstandingBalance: totalDue,
    purchasePaid: Number(row.purchase_paid || 0),
    supplierPayments: Number(row.supplier_payments_total || 0),
    ledgerBalance:
      row.latest_ledger_balance === null || row.latest_ledger_balance === undefined
        ? null
        : Number(row.latest_ledger_balance || 0),
    lastPurchaseDate: row.last_purchase_date,
    lastPaymentDate: row.last_payment_date,
  };
}

async function listSuppliers() {
  const result = await getPool().query(`
    SELECT suppliers.*,
      ${supplierFinancialSummaryColumns('suppliers')}
    FROM suppliers
    ${supplierFinancialSummaryJoins('suppliers')}
    WHERE suppliers.deleted_at IS NULL
    ORDER BY suppliers.name ASC
  `);
  return result.rows.map((row) => ({
    ...mapSupplier(row),
    stats: mapSupplierFinancialStats(row),
  }));
}

async function getSupplierNamesByIds(supplierIds = []) {
  const ids = [...new Set(supplierIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();
  const result = await getPool().query('SELECT id, name FROM suppliers WHERE id = ANY($1::int[])', [
    ids,
  ]);
  return new Map(result.rows.map((row) => [Number(row.id), row.name]));
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
      [
        payload.name,
        payload.phone || null,
        payload.email || null,
        payload.address || null,
        openingBalance,
        payload.isActive !== false,
      ]
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
    [
      id,
      payload.name,
      payload.phone || null,
      payload.email || null,
      payload.address || null,
      payload.isActive !== false,
    ]
  );
  return mapSupplier(result.rows[0]);
}

async function softDeleteSupplier(id) {
  const supplier = await getPool().query(
    'SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!supplier.rows[0]) return false;
  if (Number(supplier.rows[0].current_balance || 0) > 0) {
    const error = new Error('Supplier has outstanding balance.');
    error.code = 'SUPPLIER_BALANCE_DUE';
    throw error;
  }
  const result = await getPool().query(
    'UPDATE suppliers SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

async function getSupplierDetails(id) {
  const suppliers = await getPool().query(
    'SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
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
      SELECT ${supplierFinancialSummaryColumns('suppliers')}
      FROM suppliers
      ${supplierFinancialSummaryJoins('suppliers')}
      WHERE suppliers.id = $1 AND suppliers.deleted_at IS NULL
    `,
    [id]
  );
  const stats = statsResult.rows[0] || {};
  return {
    supplier: {
      ...mapSupplier(suppliers.rows[0]),
      stats: mapSupplierFinancialStats({ ...suppliers.rows[0], ...stats }),
    },
    purchases: purchases.rows.map(mapPurchase),
    ledger,
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
    createdAt: row.created_at,
  }));
}

async function recordSupplierPayment(payload, userId) {
  return withTransaction(async (client) => {
    const supplierResult = await client.query(
      'SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [payload.supplierId]
    );
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
    await client.query(
      'UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1',
      [payload.supplierId, nextBalance]
    );
    await client.query(
      `
        INSERT INTO supplier_ledger (supplier_id, supplier_payment_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
        VALUES ($1, $2, 'supplier_payment', $2, 'PAYMENT', 0, $3, $4, $5, $6)
      `,
      [
        payload.supplierId,
        paymentId,
        payload.amount,
        nextBalance,
        payload.notes || payload.paymentMethod,
        userId,
      ]
    );
    return { paymentId, balance: nextBalance };
  });
}

async function applyPurchaseBalance(client, payload, userId) {
  const supplierResult = await client.query(
    'SELECT current_balance FROM suppliers WHERE id = $1 FOR UPDATE',
    [payload.supplierId]
  );
  const balance = Number(supplierResult.rows[0]?.current_balance || 0) + Number(payload.dueAmount);
  await client.query(
    'UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1',
    [payload.supplierId, balance]
  );
  await client.query(
    `
      INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
      VALUES ($1, $2, 'purchase', $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      payload.supplierId,
      payload.purchaseId,
      payload.dueAmount > 0 ? 'PURCHASE_PARTIAL' : 'PURCHASE_PAID',
      payload.grandTotal,
      payload.paidAmount,
      balance,
      payload.invoiceNumber,
      userId,
    ]
  );
}

async function reversePurchaseBalance(client, payload, userId) {
  const supplierResult = await client.query(
    'SELECT current_balance FROM suppliers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [payload.supplierId]
  );
  const supplier = supplierResult.rows[0];
  if (!supplier) return;
  const currentBalance = Number(supplier.current_balance || 0);
  const dueAmount = Number(payload.dueAmount || 0);
  if (dueAmount > currentBalance) {
    const error = new Error('Supplier balance is lower than this purchase due amount.');
    error.code = 'PURCHASE_DELETE_SUPPLIER_BALANCE_CONFLICT';
    throw error;
  }
  const nextBalance = Number((currentBalance - dueAmount).toFixed(2));
  await client.query(
    'UPDATE suppliers SET current_balance = $2, updated_at = NOW() WHERE id = $1',
    [payload.supplierId, nextBalance]
  );
  await client.query(
    `
      INSERT INTO supplier_ledger (supplier_id, purchase_id, reference_type, reference_id, entry_type, debit, credit, balance, notes, created_by)
      VALUES ($1, $2, 'purchase_delete', $2, 'PURCHASE_DELETE', 0, $3, $4, $5, $6)
    `,
    [
      payload.supplierId,
      payload.purchaseId,
      dueAmount,
      nextBalance,
      `Deleted purchase ${payload.invoiceNumber}`,
      userId,
    ]
  );
}

module.exports = {
  applyPurchaseBalance,
  createSupplier,
  getSupplierDetails,
  getSupplierLedger,
  getSupplierNamesByIds,
  listSuppliers,
  recordSupplierPayment,
  reversePurchaseBalance,
  softDeleteSupplier,
  updateSupplier,
};
