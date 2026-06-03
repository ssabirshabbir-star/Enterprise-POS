const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const expenseRepository = require('./expense.repository');

const READ_ROLES = new Set(['Admin', 'Manager']);
const WRITE_ROLES = new Set(['Admin', 'Manager']);

async function requireExpenseAccess(mode = 'read') {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const roles = mode === 'write' ? WRITE_ROLES : READ_ROLES;
  if (!roles.has(profileResult.profile.role)) return { ok: false, message: 'You do not have permission for expenses.' };
  return { ok: true, profile: profileResult.profile };
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Number(number.toFixed(2));
}

function cleanExpensePayload(payload = {}) {
  const categoryId = Number(payload.categoryId);
  const title = String(payload.title || '').trim();
  const amount = money(payload.amount);
  const expenseDate = payload.expenseDate || new Date().toISOString().slice(0, 10);
  if (!Number.isInteger(categoryId) || categoryId <= 0) return { ok: false, message: 'Expense category is required.' };
  if (title.length < 2) return { ok: false, message: 'Expense title is required.' };
  if (amount === null || amount <= 0) return { ok: false, message: 'Expense amount must be greater than zero.' };
  return {
    ok: true,
    payload: {
      categoryId,
      title,
      amount,
      paymentMethod: String(payload.paymentMethod || 'Cash').trim() || 'Cash',
      expenseDate,
      notes: String(payload.notes || '').trim(),
      receiptPath: String(payload.receiptPath || '').trim()
    }
  };
}

async function listCategories() {
  const access = await requireExpenseAccess('read');
  if (!access.ok) return access;
  return { ok: true, categories: await expenseRepository.listCategories() };
}

async function createCategory(payload = {}) {
  const access = await requireExpenseAccess('write');
  if (!access.ok) return access;
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { ok: false, message: 'Category name is required.' };
  try {
    const category = await expenseRepository.createCategory({ name });
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'expense_category.create', status: 'success', message: 'Expense category created', metadata: { categoryId: category.id } });
    return { ok: true, category, message: 'Expense category saved.' };
  } catch (error) {
    if (error.code === '23505') return { ok: false, message: 'Expense category already exists.' };
    throw error;
  }
}

async function listExpenses(filters = {}) {
  const access = await requireExpenseAccess('read');
  if (!access.ok) return access;
  const result = await expenseRepository.listExpenses(filters);
  return { ok: true, ...result, permissions: { canWrite: WRITE_ROLES.has(access.profile.role) } };
}

async function createExpense(payload = {}) {
  const access = await requireExpenseAccess('write');
  if (!access.ok) return access;
  const clean = cleanExpensePayload(payload);
  if (!clean.ok) return clean;
  const expense = await expenseRepository.createExpense(clean.payload, access.profile.id);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'expense.create', status: 'success', message: 'Expense created', metadata: { expenseId: expense.id, amount: expense.amount } });
  return { ok: true, expense, message: 'Expense saved successfully.' };
}

async function updateExpense(id, payload = {}) {
  const access = await requireExpenseAccess('write');
  if (!access.ok) return access;
  const expenseId = Number(id);
  if (!Number.isInteger(expenseId) || expenseId <= 0) return { ok: false, message: 'Invalid expense id.' };
  const clean = cleanExpensePayload(payload);
  if (!clean.ok) return clean;
  const expense = await expenseRepository.updateExpense(expenseId, clean.payload);
  if (!expense) return { ok: false, message: 'Expense not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'expense.update', status: 'success', message: 'Expense updated', metadata: { expenseId } });
  return { ok: true, expense, message: 'Expense updated successfully.' };
}

async function deleteExpense(id) {
  const access = await requireExpenseAccess('write');
  if (!access.ok) return access;
  const expenseId = Number(id);
  if (!Number.isInteger(expenseId) || expenseId <= 0) return { ok: false, message: 'Invalid expense id.' };
  const expense = await expenseRepository.deleteExpense(expenseId, access.profile.id);
  if (!expense) return { ok: false, message: 'Expense not found.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'expense.delete', status: 'success', message: 'Expense voided', metadata: { expenseId, amount: Number(expense.amount || 0) } });
  return { ok: true, message: 'Expense voided successfully.' };
}

module.exports = {
  createCategory,
  createExpense,
  deleteExpense,
  listCategories,
  listExpenses,
  updateExpense
};
