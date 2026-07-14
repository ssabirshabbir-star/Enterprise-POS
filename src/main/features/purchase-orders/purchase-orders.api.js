(function PurchaseOrdersApiModule() {
  'use strict';

  const api = () => window.posApi.purchaseOrders;

  function validId(id) {
    const value = Number(id);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function normalizeActionResponse(response, fallbackMessage) {
    if (!response || typeof response !== 'object') {
      return {
        ok: false,
        code: 'MALFORMED_PURCHASE_ORDER_RESPONSE',
        message: fallbackMessage,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        code: response.code || 'PURCHASE_ORDER_ACTION_FAILED',
        message: response.message || fallbackMessage,
      };
    }
    if (!response.order || typeof response.order !== 'object') {
      return {
        ok: false,
        code: 'MALFORMED_PURCHASE_ORDER_RESPONSE',
        message: fallbackMessage,
      };
    }
    return response;
  }

  async function approve(id, input = {}) {
    const orderId = validId(id);
    if (!orderId) {
      return {
        ok: false,
        code: 'INVALID_PURCHASE_ORDER_ID',
        message: 'Invalid purchase order.',
      };
    }
    const response = await api().approve({ id: orderId, notes: input?.notes || '' });
    return normalizeActionResponse(response, 'Purchase order could not be approved.');
  }

  async function cancel(id, input = {}) {
    const orderId = validId(id);
    if (!orderId) {
      return {
        ok: false,
        code: 'INVALID_PURCHASE_ORDER_ID',
        message: 'Invalid purchase order.',
      };
    }
    const response = await api().cancel({ id: orderId, notes: input?.notes || '' });
    return normalizeActionResponse(response, 'Purchase order could not be cancelled.');
  }

  window.PurchaseOrdersApi = {
    pageData: () => api().pageData(),
    suppliers: () => api().suppliers(),
    products: (filters) => api().products(filters || { limit: 200 }),
    list: (filters) => api().list(filters || {}),
    details: (id) => api().details(id),
    create: (payload) => api().create(payload || {}),
    approve,
    cancel,
  };
})();
