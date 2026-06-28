const customersService = require('./customers.service');
const { seedCustomers } = require('./customers.seeder');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Customer request failed. Please try again.' };
}

function registerCustomerRoutes(ipcMain) {
  ipcMain.handle('/customers/list', async (_event, search) => {
    try {
      return await customersService.listCustomers(search);
    } catch (error) {
      return safeError(error, 'Customer list error:');
    }
  });
  ipcMain.handle('/customers/details', async (_event, customerId) => {
    try {
      return await customersService.getCustomerDetails(customerId);
    } catch (error) {
      return safeError(error, 'Customer details error:');
    }
  });
  ipcMain.handle('/customers/create', async (_event, payload) => {
    try {
      return await customersService.createCustomer(payload || {});
    } catch (error) {
      return safeError(error, 'Customer create error:');
    }
  });
  ipcMain.handle('/customers/update', async (_event, { id, payload }) => {
    try {
      return await customersService.updateCustomer(id, payload || {});
    } catch (error) {
      return safeError(error, 'Customer update error:');
    }
  });
  ipcMain.handle('/customers/delete', async (_event, id) => {
    try {
      return await customersService.deleteCustomer(id);
    } catch (error) {
      return safeError(error, 'Customer delete error:');
    }
  });
  ipcMain.handle('/customers/payment', async (_event, { customerId, payload }) => {
    try {
      return await customersService.addPayment(customerId, payload || {});
    } catch (error) {
      return safeError(error, 'Customer payment error:');
    }
  });
  ipcMain.handle('/customers/due-summary', async () => {
    try {
      return await customersService.getDueSummary();
    } catch (error) {
      return safeError(error, 'Customer due summary error:');
    }
  });
  ipcMain.handle('/customers/seed', async () => {
    try {
      return await seedCustomers();
    } catch (error) {
      return safeError(error, 'Customer seed error:');
    }
  });
}

module.exports = { registerCustomerRoutes };
