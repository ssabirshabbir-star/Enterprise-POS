const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posApi', {
  app: {
    info: () => ipcRenderer.invoke('/app/info'),
  },
  updates: {
    check: () => ipcRenderer.invoke('/updates/check'),
  },
  license: {
    status: () => ipcRenderer.invoke('/license/status'),
    activate: (payload) => ipcRenderer.invoke('/license/activate', payload),
    refresh: () => ipcRenderer.invoke('/license/refresh'),
  },
  auth: {
    login: (credentials) => ipcRenderer.invoke('/auth/login', credentials),
    profile: () => ipcRenderer.invoke('/auth/profile'),
    refresh: () => ipcRenderer.invoke('/auth/refresh'),
    logout: () => ipcRenderer.invoke('/auth/logout'),
    sessions: () => ipcRenderer.invoke('/auth/sessions'),
    canAccess: (route) => ipcRenderer.invoke('/auth/can-access', route),
  },
  users: {
    list: (filters) => ipcRenderer.invoke('/users/list', filters),
    create: (payload) => ipcRenderer.invoke('/users/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/users/update', { id, payload }),
    setActive: (id, isActive) => ipcRenderer.invoke('/users/status', { id, isActive }),
    resetPassword: (id, password) => ipcRenderer.invoke('/users/reset-password', { id, password }),
    securityActivity: () => ipcRenderer.invoke('/users/security-activity'),
  },
  roles: {
    list: () => ipcRenderer.invoke('/roles/list'),
    create: (payload) => ipcRenderer.invoke('/roles/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/roles/update', { id, payload }),
    permissions: (roleId) => ipcRenderer.invoke('/roles/permissions', roleId),
    savePermissions: (roleId, permissionIds) =>
      ipcRenderer.invoke('/roles/permissions/save', { roleId, permissionIds }),
  },
  accessControl: {
    listUsers: (filters) => ipcRenderer.invoke('/users/list', filters),
    createUser: (payload) => ipcRenderer.invoke('/users/create', payload),
    updateUser: (id, payload) => ipcRenderer.invoke('/users/update', { id, payload }),
    setUserActive: (id, isActive) => ipcRenderer.invoke('/users/status', { id, isActive }),
    resetPassword: (id, password) => ipcRenderer.invoke('/users/reset-password', { id, password }),
    securityActivity: () => ipcRenderer.invoke('/users/security-activity'),
    activeSessions: () => ipcRenderer.invoke('/auth/sessions'),
    listRoles: () => ipcRenderer.invoke('/roles/list'),
  },
  products: {
    list: (filters) => ipcRenderer.invoke('/products/list', filters),
    stats: () => ipcRenderer.invoke('/products/stats'),
    create: (payload) => ipcRenderer.invoke('/products/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/products/update', { id, payload }),
    delete: (id) => ipcRenderer.invoke('/products/delete', id),
    lookupBarcode: (barcode) => ipcRenderer.invoke('/products/lookup-barcode', barcode),
  },
  catalog: {
    list: (type) => ipcRenderer.invoke('/catalog/list', type),
    create: (type, payload) => ipcRenderer.invoke('/catalog/create', { type, payload }),
    update: (type, id, payload) => ipcRenderer.invoke('/catalog/update', { type, id, payload }),
    delete: (type, id) => ipcRenderer.invoke('/catalog/delete', { type, id }),
  },
  inventory: {
    list: (filters) => ipcRenderer.invoke('/inventory/list', filters),
    movements: (filters) => ipcRenderer.invoke('/inventory/movements', filters),
    adjust: (payload) => ipcRenderer.invoke('/inventory/adjust', payload),
    exportCsv: (filters) => ipcRenderer.invoke('/inventory/export/csv', { filters }),
    requestImportPreview: () => ipcRenderer.invoke('/inventory/import/preview/request'),
    getImportPreviewSession: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/preview/session', { sessionId }),
    analyzeImportPreview: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/matching/analyze', { sessionId }),
    getMatchedImportPreviewSession: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/matching/session', { sessionId }),
    createImportCommitPlan: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/commit-plan/create', { sessionId }),
    getImportCommitPlanSession: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/commit-plan/session', { sessionId }),
    createImportExecutionPreflight: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/execution-preflight/create', { sessionId }),
    getImportExecutionPreflightSession: (sessionId) =>
      ipcRenderer.invoke('/inventory/import/execution-preflight/session', { sessionId }),
    executeCertifiedImport: (payload) =>
      ipcRenderer.invoke('/inventory/import/execution/certified', payload),
    updateImage: (payload) => ipcRenderer.invoke('/inventory/product-image', payload),
  },
  suppliers: {
    list: () => ipcRenderer.invoke('/suppliers/list'),
    create: (payload) => ipcRenderer.invoke('/suppliers/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/suppliers/update', { id, payload }),
    delete: (id) => ipcRenderer.invoke('/suppliers/delete', id),
    details: (id) => ipcRenderer.invoke('/suppliers/details', id),
    ledger: (id) => ipcRenderer.invoke('/suppliers/ledger', id),
    payment: (supplierId, payload) =>
      ipcRenderer.invoke('/suppliers/payment', { supplierId, payload }),
  },
  purchases: {
    list: () => ipcRenderer.invoke('/purchases/list'),
    suppliers: () => ipcRenderer.invoke('/purchases/suppliers/list'),
    products: () => ipcRenderer.invoke('/purchases/products/list'),
    createSupplier: (payload) => ipcRenderer.invoke('/suppliers/create', payload),
    details: (purchaseId) => ipcRenderer.invoke('/purchases/details', purchaseId),
    create: (payload) => ipcRenderer.invoke('/purchases/create', payload),
  },
  purchaseOrders: {
    pageData: () => ipcRenderer.invoke('/purchase-orders/page-data'),
    suppliers: () => ipcRenderer.invoke('/suppliers/list'),
    products: (filters) => ipcRenderer.invoke('/products/list', filters || { limit: 200 }),
    listRequisitions: (filters) => ipcRenderer.invoke('/purchase-requisitions/list', filters),
    createRequisition: (payload) => ipcRenderer.invoke('/purchase-requisitions/create', payload),
    updateRequisitionStatus: (id, status, notes) =>
      ipcRenderer.invoke('/purchase-requisitions/status', { id, status, notes }),
    convertRequisition: (payload) => ipcRenderer.invoke('/purchase-requisitions/convert', payload),
    list: (filters) => ipcRenderer.invoke('/purchase-orders/list', filters),
    details: (id) => ipcRenderer.invoke('/purchase-orders/details', id),
    create: (payload) => ipcRenderer.invoke('/purchase-orders/create', payload),
    approve: (id) => ipcRenderer.invoke('/purchase-orders/approve', id),
    sendToSupplier: (id, notes) =>
      ipcRenderer.invoke('/purchase-orders/send-to-supplier', { id, notes }),
    confirmSupplier: (id, payload) =>
      ipcRenderer.invoke('/purchase-orders/confirm-supplier', { id, ...(payload || {}) }),
    cancel: (id) => ipcRenderer.invoke('/purchase-orders/cancel', id),
    receive: (payload) => ipcRenderer.invoke('/purchase-orders/receive', payload),
    createInvoice: (payload) => ipcRenderer.invoke('/purchase-orders/invoice', payload),
    receipts: (purchaseOrderId) => ipcRenderer.invoke('/purchase-orders/receipts', purchaseOrderId),
  },
  expenses: {
    listCategories: () => ipcRenderer.invoke('/expenses/categories/list'),
    createCategory: (payload) => ipcRenderer.invoke('/expenses/categories/create', payload),
    list: (filters) => ipcRenderer.invoke('/expenses/list', filters),
    create: (payload) => ipcRenderer.invoke('/expenses/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/expenses/update', { id, payload }),
    delete: (id) => ipcRenderer.invoke('/expenses/delete', id),
  },
  pos: {
    searchProducts: (search) => ipcRenderer.invoke('/pos/products/search', search),
    lookupBarcode: (barcode) => ipcRenderer.invoke('/pos/products/barcode', barcode),
    listCustomers: (search) => ipcRenderer.invoke('/pos/customers/list', search),
    createCustomer: (payload) => ipcRenderer.invoke('/pos/customers/create', payload),
    completeSale: (payload) => ipcRenderer.invoke('/pos/sales/complete', payload),
    getLastReceipt: () => ipcRenderer.invoke('/pos/sales/last-receipt'),
    validateSaleAction: (payload) => ipcRenderer.invoke('/pos/sales/action/validate', payload),
    holdSale: (payload) => ipcRenderer.invoke('/pos/holds/create', payload),
    listHeldSales: () => ipcRenderer.invoke('/pos/holds/list'),
    deleteHeldSale: (holdId) => ipcRenderer.invoke('/pos/holds/delete', holdId),
  },
  salesHistory: {
    list: (filters) => ipcRenderer.invoke('/sales-history/list', filters),
    getDetails: (saleId) => ipcRenderer.invoke('/sales-history/details', saleId),
  },
  printing: {
    listPrinters: () => ipcRenderer.invoke('/printing/printers'),
    getSettings: () => ipcRenderer.invoke('/printing/settings/get'),
    saveSettings: (settings) => ipcRenderer.invoke('/printing/settings/save', settings),
    previewReceipt: (receipt) => ipcRenderer.invoke('/printing/receipt/preview', receipt),
    printReceipt: (receipt, options) =>
      ipcRenderer.invoke('/printing/receipt/print', { receipt, options }),
    downloadReceiptPdf: (receipt, options) =>
      ipcRenderer.invoke('/printing/receipt/pdf', { receipt, options }),
  },
  barcodes: {
    capabilities: () => ipcRenderer.invoke('/barcodes/capabilities'),
    validateLabel: (input) => ipcRenderer.invoke('/barcodes/labels/validate', input),
    requestPreview: (input) => ipcRenderer.invoke('/barcodes/preview/request', input),
    printPreview: (input) => ipcRenderer.invoke('/barcodes/preview/print', input),
  },
  reports: {
    overview: (filters) => ipcRenderer.invoke('/reports/overview', filters),
  },
  luckyDrawV2: {
    listCampaigns: () => ipcRenderer.invoke('/ld-v2/campaigns/list'),
    createCampaign: (payload) => ipcRenderer.invoke('/ld-v2/campaigns/create', payload),
    updateCampaign: (payload) => ipcRenderer.invoke('/ld-v2/campaigns/update', payload),
    deleteCampaign: (id) => ipcRenderer.invoke('/ld-v2/campaigns/delete', id),
    listParticipants: (filters) => ipcRenderer.invoke('/ld-v2/participants/list', filters),
    addParticipant: (payload) => ipcRenderer.invoke('/ld-v2/participants/add', payload),
    removeParticipant: (id) => ipcRenderer.invoke('/ld-v2/participants/remove', id),
    runDraw: (payload) => ipcRenderer.invoke('/ld-v2/draw/run', payload),
    listWinners: (campaignId) => ipcRenderer.invoke('/ld-v2/winners/list', campaignId),
    getReports: () => ipcRenderer.invoke('/ld-v2/reports'),
  },
  dashboard: {
    overview: () => ipcRenderer.invoke('/dashboard/overview'),
  },
  customers: {
    list: (search) => ipcRenderer.invoke('/customers/list', search),
    details: (customerId) => ipcRenderer.invoke('/customers/details', customerId),
    create: (payload) => ipcRenderer.invoke('/customers/create', payload),
    update: (id, payload) => ipcRenderer.invoke('/customers/update', { id, payload }),
    delete: (id) => ipcRenderer.invoke('/customers/delete', id),
    payment: (customerId, payload) =>
      ipcRenderer.invoke('/customers/payment', { customerId, payload }),
    dueSummary: () => ipcRenderer.invoke('/customers/due-summary'),
    seed: () => ipcRenderer.invoke('/customers/seed'),
  },
  returns: {
    lookupInvoice: (filters) => ipcRenderer.invoke('/returns/lookup-invoice', filters),
    list: () => ipcRenderer.invoke('/returns/list'),
    create: (payload) => ipcRenderer.invoke('/returns/create', payload),
  },
  settings: {
    get: () => ipcRenderer.invoke('/settings/get'),
    save: (payload) => ipcRenderer.invoke('/settings/save', payload),
    listBackups: (filters) => ipcRenderer.invoke('/settings/backups/list', filters),
    assessBackupPreflight: () => ipcRenderer.invoke('/settings/backups/preflight'),
    createBackup: () => ipcRenderer.invoke('/settings/backups/create'),
    inspectRestorePackage: () => ipcRenderer.invoke('/settings/backups/inspect-restore-package'),
    verifyRestorePackage: () => ipcRenderer.invoke('/settings/backups/verify-restore-package'),
    assessRestoreEligibility: () =>
      ipcRenderer.invoke('/settings/backups/assess-restore-eligibility'),
    assessRestoreAuthorization: (payload) =>
      ipcRenderer.invoke('/settings/backups/assess-restore-authorization', payload),
    dryRunCertificationReport: (payload) =>
      ipcRenderer.invoke('/settings/backups/dry-run-certification-report', payload),
    listDryRunCertificationReports: (filters) =>
      ipcRenderer.invoke('/settings/backups/dry-run-certification-reports/list', filters),
    getDryRunCertificationReport: (id) =>
      ipcRenderer.invoke('/settings/backups/dry-run-certification-reports/get', id),
    restoreReadinessDashboard: () =>
      ipcRenderer.invoke('/settings/backups/restore-readiness-dashboard'),
    restoreGovernanceAssessment: () =>
      ipcRenderer.invoke('/settings/backups/restore-governance-assessment'),
    restoreRecoveryState: () =>
      ipcRenderer.invoke('/settings/backups/restore-recovery-state'),
    restoreExecutionPolicy: () =>
      ipcRenderer.invoke('/settings/backups/restore-execution-policy'),
    restoreEngineFoundationAssessment: () =>
      ipcRenderer.invoke('/settings/backups/restore-engine-foundation-assessment'),
    restoreTransactionFoundationAssessment: () =>
      ipcRenderer.invoke('/settings/backups/restore-transaction-foundation-assessment'),
  },
  sync: {
    status: () => ipcRenderer.invoke('/sync/status'),
    queue: () => ipcRenderer.invoke('/sync/queue'),
    run: () => ipcRenderer.invoke('/sync/run'),
    retryFailed: () => ipcRenderer.invoke('/sync/retry-failed'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('/shell/open-external', url),
  },
  dialog: {
    confirm: (message) => ipcRenderer.invoke('/dialog/confirm', message),
    prompt: (label, defaultValue) =>
      ipcRenderer.invoke('/dialog/prompt', { label, defaultValue: defaultValue || '' }),
  },
});
