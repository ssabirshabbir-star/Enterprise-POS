const expenseService = require('./expense.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Expense request failed. Please try again.' };
}

function registerExpenseRoutes(ipcMain) {
  ipcMain.handle('/expenses/categories/list', async () => {
    try {
      return await expenseService.listCategories();
    } catch (error) {
      return safeError(error, 'Expense categories list error:');
    }
  });
  ipcMain.handle('/expenses/categories/create', async (_event, payload) => {
    try {
      return await expenseService.createCategory(payload || {});
    } catch (error) {
      return safeError(error, 'Expense category create error:');
    }
  });
  ipcMain.handle('/expenses/list', async (_event, filters) => {
    try {
      return await expenseService.listExpenses(filters || {});
    } catch (error) {
      return safeError(error, 'Expense list error:');
    }
  });
  ipcMain.handle('/expenses/create', async (_event, payload) => {
    try {
      return await expenseService.createExpense(payload || {});
    } catch (error) {
      return safeError(error, 'Expense create error:');
    }
  });
  ipcMain.handle('/expenses/update', async (_event, { id, payload }) => {
    try {
      return await expenseService.updateExpense(id, payload || {});
    } catch (error) {
      return safeError(error, 'Expense update error:');
    }
  });
  ipcMain.handle('/expenses/delete', async (_event, id) => {
    try {
      return await expenseService.deleteExpense(id);
    } catch (error) {
      return safeError(error, 'Expense delete error:');
    }
  });
}

module.exports = { registerExpenseRoutes };
