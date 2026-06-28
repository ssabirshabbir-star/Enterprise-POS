(function PurchaseOrdersApiModule() {
  'use strict';

  const api = () => window.posApi.purchaseOrders;

  window.PurchaseOrdersApi = {
    pageData: () => api().pageData(),
    suppliers: () => api().suppliers(),
    products: (filters) => api().products(filters || { limit: 200 }),
    list: (filters) => api().list(filters || {}),
    details: (id) => api().details(id),
    create: (payload) => api().create(payload || {}),
  };
})();
