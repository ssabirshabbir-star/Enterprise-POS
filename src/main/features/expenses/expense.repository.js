const { getPool, withTransaction } = require('../../database/connection');

function mapCategory(row) {
  return row && {
    id: row.id,
    name: row.name,
    isSystem: row.is_system,
    isActive: row.is_active
  };
}

function mapExpense(row) {
  return row && {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    title: row.title,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    expenseDate: row.expense_date,
    notes: row.notes,
    receiptPath: row.receipt_path,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listCategories() {
  const result = await getPool().query('SELECT * FROM expense_categories WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY name ASC');
  return result.rows.map(mapCategory);
}

async function createCategory(payload) {
  const result = await getPool().query(
    'INSERT INTO expense_categories (name, is_system, is_active) VALUES ($1, FALSE, TRUE) RETURNING *',
    [payload.name]
  );
  return mapCategory(result.rows[0]);
}

async function listExpenses(filters = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = filters.from || today;
  const to = filters.to || today;
  const categoryId = filters.categoryId ? Number(filters.categoryId) : null;
  const paymentMethod = filters.paymentMethod ? String(filters.paymentMethod) : null;
  const result = await getPool().query(
    `
      SELECT expenses.*, expense_categories.name AS category_name, users.full_name AS created_by_name
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      LEFT JOIN users ON users.id = expenses.created_by
      WHERE expenses.deleted_at IS NULL
        AND expenses.expense_date BETWEEN $1 AND $2
        AND ($3::int IS NULL OR expenses.category_id = $3)
        AND ($4::text IS NULL OR expenses.payment_method = $4)
      ORDER BY expenses.expense_date DESC, expenses.id DESC
      LIMIT 500
    `,
    [from, to, categoryId, paymentMethod]
  );
  const summary = result.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { expenses: result.rows.map(mapExpense), summary: { totalExpense: Number(summary.toFixed(2)), count: result.rows.length } };
}

async function createExpense(payload, userId) {
  const result = await getPool().query(
    `
      INSERT INTO expenses (category_id, title, amount, payment_method, expense_date, notes, receipt_path, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [payload.categoryId, payload.title, payload.amount, payload.paymentMethod, payload.expenseDate, payload.notes || null, payload.receiptPath || null, userId]
  );
  return mapExpense(result.rows[0]);
}

async function updateExpense(id, payload) {
  const result = await getPool().query(
    `
      UPDATE expenses
      SET category_id = $2, title = $3, amount = $4, payment_method = $5,
          expense_date = $6, notes = $7, receipt_path = $8, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    [id, payload.categoryId, payload.title, payload.amount, payload.paymentMethod, payload.expenseDate, payload.notes || null, payload.receiptPath || null]
  );
  return mapExpense(result.rows[0]);
}

async function deleteExpense(id, userId) {
  return withTransaction(async (client) => {
    const result = await client.query('UPDATE expenses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, amount, title', [id]);
    return result.rows[0] || null;
  });
}

module.exports = {
  createCategory,
  createExpense,
  deleteExpense,
  listCategories,
  listExpenses,
  updateExpense
};
