const { getPool, withTransaction } = require('../../database/connection');
const syncRepository = require('../sync/sync.repository');

function mapCustomer(row) {
  return row && {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    cnic: row.cnic,
    openingBalance: Number(row.opening_balance || 0),
    currentBalance: Number(row.current_balance || 0),
    creditLimit: Number(row.credit_limit || 0),
    isWalkIn: row.is_walk_in,
    isActive: row.is_active,
    createdAt: row.created_at,
    stats: {
      totalPurchases: Number(row.total_purchases || 0),
      totalPaid: Number(row.total_paid || 0),
      totalDue: Number(row.total_due || 0),
      lastPurchaseDate: row.last_purchase_date || null
    }
  };
}

async function listCustomers(search = '') {
  const query = `%${String(search || '').trim().toLowerCase()}%`;
  const result = await getPool().query(
    `
      SELECT customers.*,
        COALESCE(SUM(sales.grand_total), 0)::numeric AS total_purchases,
        COALESCE(SUM(sales.paid_amount), 0)::numeric AS total_paid,
        COALESCE(SUM(GREATEST(sales.grand_total - sales.paid_amount, 0)), 0)::numeric AS total_due,
        MAX(sales.created_at) AS last_purchase_date
      FROM customers
      LEFT JOIN sales ON sales.customer_id = customers.id
      WHERE customers.deleted_at IS NULL
        AND (
          LOWER(customers.name) LIKE $1
          OR COALESCE(customers.phone, '') LIKE $1
          OR LOWER(COALESCE(customers.email, '')) LIKE $1
          OR LOWER(COALESCE(customers.cnic, '')) LIKE $1
        )
      GROUP BY customers.id
      ORDER BY customers.is_walk_in DESC, customers.name ASC
      LIMIT 200
    `,
    [query]
  );
  return result.rows.map(mapCustomer);
}

async function getCustomerDetails(customerId) {
  const customer = await getPool().query(
    `
      SELECT customers.*,
        COALESCE(SUM(sales.grand_total), 0)::numeric AS total_purchases,
        COALESCE(SUM(sales.paid_amount), 0)::numeric AS total_paid,
        COALESCE(SUM(GREATEST(sales.grand_total - sales.paid_amount, 0)), 0)::numeric AS total_due,
        MAX(sales.created_at) AS last_purchase_date
      FROM customers
      LEFT JOIN sales ON sales.customer_id = customers.id
      WHERE customers.id = $1 AND customers.deleted_at IS NULL
      GROUP BY customers.id
      LIMIT 1
    `,
    [customerId]
  );
  if (!customer.rows[0]) return null;

  const sales = await getPool().query(
    'SELECT id, invoice_number, grand_total, paid_amount, created_at, payment_method FROM sales WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 150',
    [customerId]
  );
  const ledger = await getPool().query(
    'SELECT id, sale_id, return_id, payment_id, entry_type, debit, credit, balance, notes, created_at FROM customer_ledger WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200',
    [customerId]
  );
  return {
    customer: mapCustomer(customer.rows[0]),
    sales: sales.rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      grandTotal: Number(row.grand_total),
      paidAmount: Number(row.paid_amount),
      dueAmount: Math.max(Number(row.grand_total) - Number(row.paid_amount), 0),
      paymentMethod: row.payment_method,
      createdAt: row.created_at
    })),
    ledger: ledger.rows.map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      returnId: row.return_id,
      paymentId: row.payment_id,
      entryType: row.entry_type,
      debit: Number(row.debit),
      credit: Number(row.credit),
      balance: Number(row.balance),
      notes: row.notes,
      createdAt: row.created_at
    }))
  };
}

async function createCustomer(payload) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const openingBalance = Number(payload.openingBalance || 0);
    const result = await client.query(
      `
        INSERT INTO customers (name, phone, email, address, cnic, opening_balance, credit_limit, current_balance, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $8)
        RETURNING *
      `,
      [payload.name, payload.phone || null, payload.email || null, payload.address || null, payload.cnic || null, openingBalance, payload.creditLimit || 0, payload.isActive]
    );
    const customer = result.rows[0];
    if (openingBalance > 0) {
      await client.query(
        'INSERT INTO customer_ledger (customer_id, entry_type, debit, credit, balance, notes) VALUES ($1, $2, $3, 0, $3, $4)',
        [customer.id, 'OPENING_BALANCE', openingBalance, 'Opening balance']
      );
    }
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

async function updateCustomer(id, payload) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const result = await client.query(
      `
        UPDATE customers
        SET name = $2, phone = $3, email = $4, address = $5, cnic = $6,
            credit_limit = $7, is_active = $8, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL AND is_walk_in = FALSE
        RETURNING *
      `,
      [id, payload.name, payload.phone || null, payload.email || null, payload.address || null, payload.cnic || null, payload.creditLimit || 0, payload.isActive]
    );
    const customer = result.rows[0];
    if (customer) {
      await syncRepository.queueOperation({
        client,
        entityType: 'customer',
        entityId: customer.id,
        operation: 'UPDATE',
        terminalId: terminal.id,
        payload: { name: customer.name, phone: customer.phone }
      });
    }
    return mapCustomer(customer);
  });
}

async function softDeleteCustomer(id) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const result = await client.query(
      "UPDATE customers SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND is_walk_in = FALSE",
      [id]
    );
    if (result.rowCount > 0) {
      await syncRepository.queueOperation({
        client,
        entityType: 'customer',
        entityId: id,
        operation: 'DELETE',
        terminalId: terminal.id,
        payload: { customerId: id }
      });
    }
    return result.rowCount > 0;
  });
}

async function addCustomerPayment(customerId, payload, userId) {
  return withTransaction(async (client) => {
    const terminal = await syncRepository.getOrCreateTerminal(client);
    const amount = Number(payload.amount);
    const customerResult = await client.query('SELECT current_balance FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const previousBalance = Number(customer.current_balance || 0);
    const newBalance = Math.max(Number((previousBalance - amount).toFixed(2)), 0);
    const payment = await client.query(
      'INSERT INTO customer_payments (customer_id, amount, payment_method, notes, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [customerId, amount, payload.paymentMethod || 'Cash', payload.notes || null, userId]
    );
    await client.query('UPDATE customers SET current_balance = $2, updated_at = NOW() WHERE id = $1', [customerId, newBalance]);
    await client.query(
      'INSERT INTO customer_ledger (customer_id, payment_id, entry_type, debit, credit, balance, notes) VALUES ($1, $2, $3, 0, $4, $5, $6)',
      [customerId, payment.rows[0].id, 'PAYMENT', amount, newBalance, payload.notes || 'Customer payment']
    );
    await syncRepository.queueOperation({
      client,
      entityType: 'customer_payment',
      entityId: payment.rows[0].id,
      operation: 'CREATE',
      terminalId: terminal.id,
      payload: { customerId, amount, balance: newBalance }
    });
    return { paymentId: payment.rows[0].id, balance: newBalance };
  });
}

async function getDueSummary() {
  const result = await getPool().query(
    'SELECT COUNT(*)::int AS customers_with_due, COALESCE(SUM(current_balance), 0)::numeric AS total_due FROM customers WHERE deleted_at IS NULL AND current_balance > 0'
  );
  return {
    customersWithDue: Number(result.rows[0]?.customers_with_due || 0),
    totalDue: Number(result.rows[0]?.total_due || 0)
  };
}

module.exports = {
  addCustomerPayment,
  createCustomer,
  getCustomerDetails,
  getDueSummary,
  listCustomers,
  softDeleteCustomer,
  updateCustomer
};
