const productService = require('./product.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, fallback) {
  if (error?.code === '23505') {
    return { ok: false, message: 'SKU or barcode already exists.' };
  }
  logError(fallback, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerProductRoutes(ipcMain) {
  ipcMain.handle('/products/list', async (_event, filters) => {
    try {
      return await productService.listProducts(filters || {});
    } catch (error) {
      return safeError(error, 'Product list error:');
    }
  });

  ipcMain.handle('/products/stats', async () => {
    try {
      return await productService.getProductStats();
    } catch (error) {
      return safeError(error, 'Product stats error:');
    }
  });

  ipcMain.handle('/products/create', async (_event, payload) => {
    try {
      return await productService.createProduct(payload || {});
    } catch (error) {
      return safeError(error, 'Product create error:');
    }
  });

  ipcMain.handle('/products/update', async (_event, { id, payload }) => {
    try {
      return await productService.updateProduct(id, payload || {});
    } catch (error) {
      return safeError(error, 'Product update error:');
    }
  });

  ipcMain.handle('/products/delete', async (_event, id) => {
    try {
      return await productService.deleteProduct(id);
    } catch (error) {
      return safeError(error, 'Product delete error:');
    }
  });

  ipcMain.handle('/products/lookup-barcode', async (_event, barcode) => {
    try {
      return await productService.lookupBarcode(barcode);
    } catch (error) {
      return safeError(error, 'Barcode lookup error:');
    }
  });

  ipcMain.handle('/catalog/list', async (_event, type) => {
    try {
      return await productService.listCatalog(type);
    } catch (error) {
      return safeError(error, 'Catalog list error:');
    }
  });

  ipcMain.handle('/catalog/create', async (_event, { type, payload }) => {
    try {
      return await productService.createCatalog(type, payload || {});
    } catch (error) {
      return safeError(error, 'Catalog create error:');
    }
  });

  ipcMain.handle('/catalog/update', async (_event, { type, id, payload }) => {
    try {
      return await productService.updateCatalog(type, id, payload || {});
    } catch (error) {
      return safeError(error, 'Catalog update error:');
    }
  });

  ipcMain.handle('/catalog/delete', async (_event, { type, id }) => {
    try {
      return await productService.deleteCatalog(type, id);
    } catch (error) {
      return safeError(error, 'Catalog delete error:');
    }
  });
}

module.exports = {
  registerProductRoutes,
};
