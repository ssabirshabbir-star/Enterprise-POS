const loginForm = document.querySelector('#loginForm');
const loginButton = document.querySelector('#loginButton') || document.querySelector('#loginBtn');
const message = document.querySelector('#message');
const loginUsername = document.querySelector('#username');
const loginPassword = document.querySelector('#password');
const dashboard = document.querySelector('#dashboard');
const signedInUser = document.querySelector('#signedInUser');
const loginScreen = document.querySelector('#loginScreen');
const loginStage = document.querySelector('#loginStage');
const loginVersion = document.querySelector('#loginVersion');
const toggleLoginPassword = document.querySelector('#toggleLoginPassword') || document.querySelector('#eyeToggle');
const rememberMe = document.querySelector('#rememberMe') || document.querySelector('#rememberCheck');
const forgotPasswordButton = document.querySelector('#forgotPasswordButton') || document.querySelector('#forgotPassword');
const loginOptionButtons = document.querySelectorAll('[data-login-option]');
const loginButtonLabel = document.querySelector('[data-login-button-label]');
const loadingScreen = document.querySelector('#loadingScreen');
const logoutButton = document.querySelector('#logoutButton');
const moduleGrid = document.querySelector('#moduleGrid');
const dashboardTodaySales = document.querySelector('#dashboardTodaySales');
const dashboardProductCount = document.querySelector('#dashboardProductCount');
const dashboardLowStockCount = document.querySelector('#dashboardLowStockCount');
const dashboardPurchaseTotal = document.querySelector('#dashboardPurchaseTotal');
const dashboardCustomerDue = document.querySelector('#dashboardCustomerDue');
const dashboardRecentSales = document.querySelector('#dashboardRecentSales');
const dashboardLowStock = document.querySelector('#dashboardLowStock');
const dashboardRecentActivity = document.querySelector('#dashboardRecentActivity');
const routeTitle = document.querySelector('#routeTitle');
const sidebarNav = document.querySelector('#sidebarNav');
const syncStatusIndicator = document.querySelector('#syncStatusIndicator');
const routePanels = document.querySelectorAll('[data-route-panel]');
const productModule = document.querySelector('#productModule');
const inventoryModule = document.querySelector('#inventoryModule');
const purchaseModule = document.querySelector('#purchaseModule');
const posBarcodeInput = document.querySelector('#posBarcodeInput');
const posProductSearch = posBarcodeInput;
const posSearchResults = document.querySelector('#posSearchResults');
const posCategoryFilters = document.querySelector('#posCategoryFilters');
const posSearchFocusButton = document.querySelector('#posSearchFocusButton');
const retailModeButton = document.querySelector('#retailModeButton');
const wholesaleModeButton = document.querySelector('#wholesaleModeButton');
const syncPosButton = document.querySelector('#syncPosButton');
const posMessage = document.querySelector('#posMessage');
const heldSalesList = document.querySelector('#heldSalesList');
const cartTableBody = document.querySelector('#cartTableBody');
const cartEmptyState = document.querySelector('#cartEmptyState');
const clearCartButton = document.querySelector('#clearCartButton');
const customerSearch = document.querySelector('#customerSearch');
const customerSelect = document.querySelector('#customerSelect');
const posCustomerBalance = document.querySelector('#posCustomerBalance');
const quickCustomerFocusButton = document.querySelector('#quickCustomerFocusButton');
const posCustomerModal = document.querySelector('#posCustomerModal');
const posCustomerModalForm = document.querySelector('#posCustomerModalForm');
const posCustomerNameInput = document.querySelector('#posCustomerNameInput');
const posCustomerPhoneInput = document.querySelector('#posCustomerPhoneInput');
const posCustomerEmailInput = document.querySelector('#posCustomerEmailInput');
const posCustomerCnicInput = document.querySelector('#posCustomerCnicInput');
const posCustomerAddressInput = document.querySelector('#posCustomerAddressInput');
const posCustomerOpeningBalanceInput = document.querySelector('#posCustomerOpeningBalanceInput');
const posCustomerCreditLimitInput = document.querySelector('#posCustomerCreditLimitInput');
const posCustomerModalMessage = document.querySelector('#posCustomerModalMessage');
const posCustomerModalSaveButton = document.querySelector('#posCustomerModalSaveButton');
const cartDiscount = document.querySelector('#cartDiscount');
const cartTax = document.querySelector('#cartTax');
const paidAmount = document.querySelector('#paidAmount');
const paymentMethod = document.querySelector('#paymentMethod');
const posSubtotal = document.querySelector('#posSubtotal');
const posGrandTotal = document.querySelector('#posGrandTotal');
const changeAmount = document.querySelector('#changeAmount');
const holdSaleButton = document.querySelector('#holdSaleButton');
const completeSaleButton = document.querySelector('#completeSaleButton');
const thermalPrintButton = document.querySelector('#thermalPrintButton');
const refundSaleButton = document.querySelector('#refundSaleButton');
const exchangeSaleButton = document.querySelector('#exchangeSaleButton');
const reprintLastBillButton = document.querySelector('#reprintLastBillButton');
const receiptPreview = document.querySelector('#receiptPreview');
const reportDateFrom = document.querySelector('#reportDateFrom');
const reportDateTo = document.querySelector('#reportDateTo');
const loadReportsButton = document.querySelector('#loadReportsButton');
const reportsMessage = document.querySelector('#reportsMessage');
const reportTotalSales = document.querySelector('#reportTotalSales');
const reportTotalProfit = document.querySelector('#reportTotalProfit');
const reportTotalPurchases = document.querySelector('#reportTotalPurchases');
const reportLowStockCount = document.querySelector('#reportLowStockCount');
const reportTotalExpenses = document.querySelector('#reportTotalExpenses');
const reportNetCash = document.querySelector('#reportNetCash');
const salesReportList = document.querySelector('#salesReportList');
const purchaseReportList = document.querySelector('#purchaseReportList');
const purchaseOrderReportList = document.querySelector('#purchaseOrderReportList');
const goodsReceiptReportList = document.querySelector('#goodsReceiptReportList');
const lowStockReportList = document.querySelector('#lowStockReportList');
const cashierReportList = document.querySelector('#cashierReportList');
const customerDueReportList = document.querySelector('#customerDueReportList');
const creditSalesReportList = document.querySelector('#creditSalesReportList');
const returnsReportList = document.querySelector('#returnsReportList');
const refundSummaryList = document.querySelector('#refundSummaryList');
const supplierBalanceReportList = document.querySelector('#supplierBalanceReportList');
const supplierPaymentReportList = document.querySelector('#supplierPaymentReportList');
const expenseReportList = document.querySelector('#expenseReportList');
const expenseCategoryReportList = document.querySelector('#expenseCategoryReportList');
const exportPdfButton = document.querySelector('#exportPdfButton');
const exportExcelButton = document.querySelector('#exportExcelButton');
const luckyMessage = document.querySelector('#luckyMessage');
const luckyTabs = document.querySelectorAll('.luckyTab');
const luckyPanels = document.querySelectorAll('.luckyPanel');
const luckyCampaignForm = document.querySelector('#luckyCampaignForm');
const luckyCampaignId = document.querySelector('#luckyCampaignId');
const luckyCampaignName = document.querySelector('#luckyCampaignName');
const luckyStartDate = document.querySelector('#luckyStartDate');
const luckyEndDate = document.querySelector('#luckyEndDate');
const luckyMinimumPurchase = document.querySelector('#luckyMinimumPurchase');
const luckyTotalWinners = document.querySelector('#luckyTotalWinners');
const luckyCouponType = document.querySelector('#luckyCouponType');
const luckyStatus = document.querySelector('#luckyStatus');
const luckyPrizeDetails = document.querySelector('#luckyPrizeDetails');
const luckyNotes = document.querySelector('#luckyNotes');
const luckyQrEnabled = document.querySelector('#luckyQrEnabled');
const luckyBarcodeEnabled = document.querySelector('#luckyBarcodeEnabled');
const resetLuckyCampaignButton = document.querySelector('#resetLuckyCampaignButton');
const saveLuckyCampaignButton = document.querySelector('#saveLuckyCampaignButton');
const luckyCampaignList = document.querySelector('#luckyCampaignList');
const luckyEntryCampaignFilter = document.querySelector('#luckyEntryCampaignFilter');
const luckyEntrySearch = document.querySelector('#luckyEntrySearch');
const luckyEntryFromDate = document.querySelector('#luckyEntryFromDate');
const luckyEntryToDate = document.querySelector('#luckyEntryToDate');
const luckyEntriesBody = document.querySelector('#luckyEntriesBody');
const luckyVerifyInput = document.querySelector('#luckyVerifyInput');
const luckyLookupButton = document.querySelector('#luckyLookupButton');
const luckyVerifyButton = document.querySelector('#luckyVerifyButton');
const luckyVerificationResult = document.querySelector('#luckyVerificationResult');
const luckyDrawCampaignSelect = document.querySelector('#luckyDrawCampaignSelect');
const luckyDrawCount = document.querySelector('#luckyDrawCount');
const startLuckyDrawButton = document.querySelector('#startLuckyDrawButton');
const luckyWinnersList = document.querySelector('#luckyWinnersList');
const luckyReportCampaigns = document.querySelector('#luckyReportCampaigns');
const luckyReportCoupons = document.querySelector('#luckyReportCoupons');
const luckyReportVerified = document.querySelector('#luckyReportVerified');
const luckyReportWinners = document.querySelector('#luckyReportWinners');
const luckyReportSales = document.querySelector('#luckyReportSales');
const luckyCampaignReportList = document.querySelector('#luckyCampaignReportList');
const customerPageSearch = document.querySelector('#customerPageSearch');
const customerPageList = document.querySelector('#customerPageList');
const customerDetailsPanel = document.querySelector('#customerDetailsPanel');
const customerForm = document.querySelector('#customerForm');
const customerFormId = document.querySelector('#customerFormId');
const customerNameInput = document.querySelector('#customerNameInput');
const customerPhoneInput = document.querySelector('#customerPhoneInput');
const customerEmailInput = document.querySelector('#customerEmailInput');
const customerCnicInput = document.querySelector('#customerCnicInput');
const customerAddressInput = document.querySelector('#customerAddressInput');
const customerOpeningBalanceInput = document.querySelector('#customerOpeningBalanceInput');
const customerCreditLimitInput = document.querySelector('#customerCreditLimitInput');
const customerActiveInput = document.querySelector('#customerActiveInput');
const saveCustomerButton = document.querySelector('#saveCustomerButton');
const resetCustomerButton = document.querySelector('#resetCustomerButton');
const customerPageMessage = document.querySelector('#customerPageMessage');
const returnInvoiceSearch = document.querySelector('#returnInvoiceSearch');
const returnBarcodeSearch = document.querySelector('#returnBarcodeSearch');
const returnCustomerSearch = document.querySelector('#returnCustomerSearch');
const lookupReturnButton = document.querySelector('#lookupReturnButton');
const returnsMessage = document.querySelector('#returnsMessage');
const returnInvoicePanel = document.querySelector('#returnInvoicePanel');
const returnItemsBody = document.querySelector('#returnItemsBody');
const returnRefundMethod = document.querySelector('#returnRefundMethod');
const returnReason = document.querySelector('#returnReason');
const processReturnButton = document.querySelector('#processReturnButton');
const returnsList = document.querySelector('#returnsList');
const settingsMessage = document.querySelector('#settingsMessage');
const printerSelect = document.querySelector('#printerSelect');
const paperWidth = document.querySelector('#paperWidth');
const autoPrintAfterSale = document.querySelector('#autoPrintAfterSale');
const silentPrint = document.querySelector('#silentPrint');
const receiptCopies = document.querySelector('#receiptCopies');
const printerFooter = document.querySelector('#printerFooter');
const savePrinterSettingsButton = document.querySelector('#savePrinterSettingsButton');
const settingsTabs = document.querySelectorAll('.settingsTab');
const settingsPanels = document.querySelectorAll('.settingsPanel');
const storeName = document.querySelector('#storeName');
const storePhone = document.querySelector('#storePhone');
const storeEmail = document.querySelector('#storeEmail');
const storeAddress = document.querySelector('#storeAddress');
const storeTaxNumber = document.querySelector('#storeTaxNumber');
const storeReceiptFooter = document.querySelector('#storeReceiptFooter');
const storeLogoPath = document.querySelector('#storeLogoPath');
const taxEnabled = document.querySelector('#taxEnabled');
const defaultTaxPercentage = document.querySelector('#defaultTaxPercentage');
const taxMode = document.querySelector('#taxMode');
const currencySymbol = document.querySelector('#currencySymbol');
const dateFormat = document.querySelector('#dateFormat');
const lowStockAlertThreshold = document.querySelector('#lowStockAlertThreshold');
const invoicePrefix = document.querySelector('#invoicePrefix');
const nextInvoiceNumber = document.querySelector('#nextInvoiceNumber');
const testPrintButton = document.querySelector('#testPrintButton');
const createBackupButton = document.querySelector('#createBackupButton');
const restoreBackupButton = document.querySelector('#restoreBackupButton');
const refreshBackupHistoryButton = document.querySelector('#refreshBackupHistoryButton');
const backupHistoryBody = document.querySelector('#backupHistoryBody');
const updateCurrentVersion = document.querySelector('#updateCurrentVersion');
const updateLatestVersion = document.querySelector('#updateLatestVersion');
const updateState = document.querySelector('#updateState');
const updateMessage = document.querySelector('#updateMessage');
const checkUpdatesButton = document.querySelector('#checkUpdatesButton');
const restartUpdateButton = document.querySelector('#restartUpdateButton');
const licenseState = document.querySelector('#licenseState');
const licenseStatus = document.querySelector('#licenseStatus');
const licenseExpires = document.querySelector('#licenseExpires');
const licenseMachineId = document.querySelector('#licenseMachineId');
const licenseKeyInput = document.querySelector('#licenseKeyInput');
const activateLicenseButton = document.querySelector('#activateLicenseButton');
const refreshLicenseButton = document.querySelector('#refreshLicenseButton');
const licenseMessage = document.querySelector('#licenseMessage');
const aboutVersion = document.querySelector('#aboutVersion');
const aboutBuildDate = document.querySelector('#aboutBuildDate');
const aboutEnvironment = document.querySelector('#aboutEnvironment');
const aboutSyncStatus = document.querySelector('#aboutSyncStatus');
const aboutDialogButton = document.querySelector('#aboutDialogButton');
const productSearch = document.querySelector('#productSearch');
const productTableBody = document.querySelector('#productTableBody');
const productEmptyState = document.querySelector('#productEmptyState');
const productMessage = document.querySelector('#productMessage');
const newProductButton = document.querySelector('#newProductButton');
const productFormPanel = document.querySelector('#productFormPanel');
const productForm = document.querySelector('#productForm');
const productFormTitle = document.querySelector('#productFormTitle');
const closeProductFormButton = document.querySelector('#closeProductFormButton');
const saveProductButton = document.querySelector('#saveProductButton');
const barcodePrintButton = document.querySelector('#barcodePrintButton');
const categoryList = document.querySelector('#categoryList');
const brandList = document.querySelector('#brandList');
const unitList = document.querySelector('#unitList');
const inventorySearch = document.querySelector('#inventorySearch');
const lowStockOnly = document.querySelector('#lowStockOnly');
const outOfStockOnly = document.querySelector('#outOfStockOnly');
const inventoryMessage = document.querySelector('#inventoryMessage');
const inventoryTableBody = document.querySelector('#inventoryTableBody');
const stockAdjustmentForm = document.querySelector('#stockAdjustmentForm');
const adjustProductId = document.querySelector('#adjustProductId');
const adjustmentType = document.querySelector('#adjustmentType');
const adjustQuantity = document.querySelector('#adjustQuantity');
const adjustReason = document.querySelector('#adjustReason');
const saveAdjustmentButton = document.querySelector('#saveAdjustmentButton');
const movementHistory = document.querySelector('#movementHistory');
const purchaseMessage = document.querySelector('#purchaseMessage');
const supplierForm = document.querySelector('#supplierForm');
const purchaseForm = document.querySelector('#purchaseForm');
const purchaseSupplier = document.querySelector('#purchaseSupplier');
const purchaseInvoice = document.querySelector('#purchaseInvoice');
const purchaseDate = document.querySelector('#purchaseDate');
const purchaseDiscount = document.querySelector('#purchaseDiscount');
const purchaseTax = document.querySelector('#purchaseTax');
const purchasePaid = document.querySelector('#purchasePaid');
const purchaseItemProduct = document.querySelector('#purchaseItemProduct');
const purchaseItemQty = document.querySelector('#purchaseItemQty');
const purchaseItemCost = document.querySelector('#purchaseItemCost');
const purchaseItemSale = document.querySelector('#purchaseItemSale');
const addPurchaseItemButton = document.querySelector('#addPurchaseItemButton');
const purchaseItemsList = document.querySelector('#purchaseItemsList');
const purchaseTotals = document.querySelector('#purchaseTotals');
const purchaseList = document.querySelector('#purchaseList');
const savePurchaseButton = document.querySelector('#savePurchaseButton');
const poSearch = document.querySelector('#poSearch');
const poStatusFilter = document.querySelector('#poStatusFilter');
const poFromDate = document.querySelector('#poFromDate');
const poToDate = document.querySelector('#poToDate');
const poMessage = document.querySelector('#poMessage');
const requisitionForm = document.querySelector('#requisitionForm');
const reqDepartment = document.querySelector('#reqDepartment');
const reqLocation = document.querySelector('#reqLocation');
const reqPriority = document.querySelector('#reqPriority');
const reqDate = document.querySelector('#reqDate');
const reqReason = document.querySelector('#reqReason');
const reqItemProduct = document.querySelector('#reqItemProduct');
const reqItemQty = document.querySelector('#reqItemQty');
const addReqItemButton = document.querySelector('#addReqItemButton');
const reqItemsList = document.querySelector('#reqItemsList');
const saveRequisitionButton = document.querySelector('#saveRequisitionButton');
const resetRequisitionButton = document.querySelector('#resetRequisitionButton');
const reqStatusFilter = document.querySelector('#reqStatusFilter');
const requisitionList = document.querySelector('#requisitionList');
const poForm = document.querySelector('#poForm');
const poSupplier = document.querySelector('#poSupplier');
const poWarehouse = document.querySelector('#poWarehouse');
const poNumberInput = document.querySelector('#poNumber');
const poGenerateNumberButton = document.querySelector('#poGenerateNumberButton');
const poContactPerson = document.querySelector('#poContactPerson');
const poSupplierEmail = document.querySelector('#poSupplierEmail');
const poDate = document.querySelector('#poDate');
const poReference = document.querySelector('#poReference');
const poCurrency = document.querySelector('#poCurrency');
const poExchangeRate = document.querySelector('#poExchangeRate');
const poStatusSelect = document.querySelector('#poStatusSelect');
const poPriorOrder = document.querySelector('#poPriorOrder');
const poShippingCharges = document.querySelector('#poShippingCharges');
const poExpectedDate = document.querySelector('#poExpectedDate');
const poDiscount = document.querySelector('#poDiscount');
const poTax = document.querySelector('#poTax');
const poNotes = document.querySelector('#poNotes');
const poItemProduct = document.querySelector('#poItemProduct');
const poItemQty = document.querySelector('#poItemQty');
const poItemCost = document.querySelector('#poItemCost');
const poItemSale = document.querySelector('#poItemSale');
const poItemDiscount = document.querySelector('#poItemDiscount');
const poItemTax = document.querySelector('#poItemTax');
const poBarcodeInput = document.querySelector('#poBarcodeInput');
const poBarcodeButton = document.querySelector('#poBarcodeButton');
const addPoItemButton = document.querySelector('#addPoItemButton');
const poItemsList = document.querySelector('#poItemsList');
const poTotals = document.querySelector('#poTotals');
const savePoButton = document.querySelector('#savePoButton');
const resetPoButton = document.querySelector('#resetPoButton');
const poRequestApprovalButton = document.querySelector('#poRequestApprovalButton');
const poSubmitButton = document.querySelector('#poSubmitButton');
const poCancelCurrentButton = document.querySelector('#poCancelCurrentButton');
const poBackButton = document.querySelector('#poBackButton');
const poImportButton = document.querySelector('#poImportButton');
const poPdfButton = document.querySelector('#poPdfButton');
const poPrintButton = document.querySelector('#poPrintButton');
const poList = document.querySelector('#poList');
const poDetailsPanel = document.querySelector('#poDetailsPanel');
const poStatTotal = document.querySelector('#poStatTotal');
const poStatPending = document.querySelector('#poStatPending');
const poStatGrn = document.querySelector('#poStatGrn');
const poStatSpent = document.querySelector('#poStatSpent');
const poCartCount = document.querySelector('#poCartCount');
const poNotifyCount = document.querySelector('#poNotifyCount');
const poSummaryItems = document.querySelector('#poSummaryItems');
const poSummaryItemsTotal = document.querySelector('#poSummaryItemsTotal');
const poSummaryDiscount = document.querySelector('#poSummaryDiscount');
const poSummaryTaxable = document.querySelector('#poSummaryTaxable');
const poSummaryTax = document.querySelector('#poSummaryTax');
const poSummaryShipping = document.querySelector('#poSummaryShipping');
const poSummaryTotal = document.querySelector('#poSummaryTotal');
const poRecentSuppliers = document.querySelector('#poRecentSuppliers');
const poAddSupplierButton = document.querySelector('#poAddSupplierButton');
const poQuickSupplierButton = document.querySelector('#poQuickSupplierButton');
const poQuickProductButton = document.querySelector('#poQuickProductButton');
const poViewSuppliersButton = document.querySelector('#poViewSuppliersButton');
const poViewProductsButton = document.querySelector('#poViewProductsButton');
const poPendingButton = document.querySelector('#poPendingButton');
const poGrnButton = document.querySelector('#poGrnButton');
const poFullscreenButton = document.querySelector('#poFullscreenButton');
const supplierPageForm = document.querySelector('#supplierPageForm');
const supplierPageId = document.querySelector('#supplierPageId');
const supplierPageName = document.querySelector('#supplierPageName');
const supplierPagePhone = document.querySelector('#supplierPagePhone');
const supplierPageEmail = document.querySelector('#supplierPageEmail');
const supplierPageAddress = document.querySelector('#supplierPageAddress');
const supplierOpeningBalance = document.querySelector('#supplierOpeningBalance');
const supplierActive = document.querySelector('#supplierActive');
const saveSupplierButton = document.querySelector('#saveSupplierButton');
const resetSupplierButton = document.querySelector('#resetSupplierButton');
const supplierPageMessage = document.querySelector('#supplierPageMessage');
const supplierInlineSearch = document.querySelector('#supplierInlineSearch');
const supplierStatusFilter = document.querySelector('#supplierStatusFilter');
const supplierCityFilter = document.querySelector('#supplierCityFilter');
const supplierList = document.querySelector('#supplierList');
const supplierDetailsPanel = document.querySelector('#supplierDetailsPanel');
const supplierEditorModal = document.querySelector('#supplierEditorModal');
const supplierEditorTitle = document.querySelector('#supplierEditorTitle');
const supplierBottomNewButton = document.querySelector('#supplierBottomNewButton');
const supplierNewPurchaseButton = document.querySelector('#supplierNewPurchaseButton');
const supplierBottomPaymentButton = document.querySelector('#supplierBottomPaymentButton');
const supplierExportButton = document.querySelector('#supplierExportButton');
const supplierPrintButton = document.querySelector('#supplierPrintButton');
const supplierStatementButton = document.querySelector('#supplierStatementButton');
const supplierAgingButton = document.querySelector('#supplierAgingButton');
const supplierReminderButton = document.querySelector('#supplierReminderButton');
const supplierPaymentModal = document.querySelector('#supplierPaymentModal');
const supplierPaymentStandaloneForm = document.querySelector('#supplierPaymentStandaloneForm');
const supplierPaymentSupplier = document.querySelector('#supplierPaymentSupplier');
const supplierPaymentDue = document.querySelector('#supplierPaymentDue');
const supplierPaymentStandaloneAmount = document.querySelector('#supplierPaymentStandaloneAmount');
const supplierPaymentStandaloneMethod = document.querySelector('#supplierPaymentStandaloneMethod');
const supplierPaymentStandaloneNotes = document.querySelector('#supplierPaymentStandaloneNotes');
const saveSupplierPaymentButton = document.querySelector('#saveSupplierPaymentButton');
const expenseForm = document.querySelector('#expenseForm');
const expenseId = document.querySelector('#expenseId');
const expenseCategory = document.querySelector('#expenseCategory');
const expenseTitle = document.querySelector('#expenseTitle');
const expenseAmount = document.querySelector('#expenseAmount');
const expensePaymentMethod = document.querySelector('#expensePaymentMethod');
const expenseDate = document.querySelector('#expenseDate');
const expenseReceiptPath = document.querySelector('#expenseReceiptPath');
const expenseNotes = document.querySelector('#expenseNotes');
const saveExpenseButton = document.querySelector('#saveExpenseButton');
const resetExpenseButton = document.querySelector('#resetExpenseButton');
const expenseCategoryForm = document.querySelector('#expenseCategoryForm');
const expenseMessage = document.querySelector('#expenseMessage');
const expenseTotal = document.querySelector('#expenseTotal');
const expenseFromDate = document.querySelector('#expenseFromDate');
const expenseToDate = document.querySelector('#expenseToDate');
const expenseCategoryFilter = document.querySelector('#expenseCategoryFilter');
const expensePaymentFilter = document.querySelector('#expensePaymentFilter');
const expenseTableBody = document.querySelector('#expenseTableBody');
const runSyncButton = document.querySelector('#runSyncButton');
const retrySyncButton = document.querySelector('#retrySyncButton');
const refreshSyncButton = document.querySelector('#refreshSyncButton');
const syncMessage = document.querySelector('#syncMessage');
const syncTerminalCode = document.querySelector('#syncTerminalCode');
const syncPendingCount = document.querySelector('#syncPendingCount');
const syncSyncingCount = document.querySelector('#syncSyncingCount');
const syncFailedCount = document.querySelector('#syncFailedCount');
const syncSyncedCount = document.querySelector('#syncSyncedCount');
const syncQueueBody = document.querySelector('#syncQueueBody');
const syncLogsList = document.querySelector('#syncLogsList');
const userForm = document.querySelector('#userForm');
const userId = document.querySelector('#userId');
const userFullName = document.querySelector('#userFullName');
const userUsername = document.querySelector('#userUsername');
const userEmail = document.querySelector('#userEmail');
const userPhone = document.querySelector('#userPhone');
const userRole = document.querySelector('#userRole');
const userPassword = document.querySelector('#userPassword');
const userActive = document.querySelector('#userActive');
const saveUserButton = document.querySelector('#saveUserButton');
const resetUserButton = document.querySelector('#resetUserButton');
const userMessage = document.querySelector('#userMessage');
const userSearch = document.querySelector('#userSearch');
const userRoleFilter = document.querySelector('#userRoleFilter');
const userStatusFilter = document.querySelector('#userStatusFilter');
const userTableBody = document.querySelector('#userTableBody');
const userAdminTabs = document.querySelectorAll('.userAdminTab');
const userAdminPanels = document.querySelectorAll('.userAdminPanel');
const roleForm = document.querySelector('#roleForm');
const roleId = document.querySelector('#roleId');
const roleName = document.querySelector('#roleName');
const roleDescription = document.querySelector('#roleDescription');
const roleActive = document.querySelector('#roleActive');
const saveRoleButton = document.querySelector('#saveRoleButton');
const resetRoleButton = document.querySelector('#resetRoleButton');
const roleMessage = document.querySelector('#roleMessage');
const roleList = document.querySelector('#roleList');
const permissionRoleList = document.querySelector('#permissionRoleList');
const permissionMatrix = document.querySelector('#permissionMatrix');
const saveRolePermissionsButton = document.querySelector('#saveRolePermissionsButton');
const rolePermissionMap = document.querySelector('#rolePermissionMap');
const userActivityLog = document.querySelector('#userActivityLog');
const userEditorModal = document.querySelector('#userEditorModal');
const closeUserEditorButton = document.querySelector('#closeUserEditorButton');

const productFields = {
  id: document.querySelector('#productId'),
  name: document.querySelector('#productName'),
  sku: document.querySelector('#productSku'),
  barcode: document.querySelector('#productBarcode'),
  categoryId: document.querySelector('#productCategory'),
  brandId: document.querySelector('#productBrand'),
  unitId: document.querySelector('#productUnit'),
  purchasePrice: document.querySelector('#purchasePrice'),
  salePrice: document.querySelector('#salePrice'),
  wholesalePrice: document.querySelector('#wholesalePrice'),
  minStockLevel: document.querySelector('#minStockLevel'),
  currentStock: document.querySelector('#currentStock'),
  isActive: document.querySelector('#productActive')
};

const modules = [
  { route: '/pos', module: 'pos', label: 'POS Billing' },
  { route: '/products', module: 'products', label: 'Products' },
  { route: '/inventory', module: 'inventory', label: 'Inventory' },
  { route: '/purchases', module: 'purchases', label: 'Purchases' },
  { route: '/purchase-orders', module: 'purchase_orders', label: 'Purchase Orders' },
  { route: '/suppliers', module: 'suppliers', label: 'Suppliers' },
  { route: '/expenses', module: 'expenses', label: 'Expenses' },
  { route: '/customers', module: 'customers', label: 'Customers' },
  { route: '/returns', module: 'returns', label: 'Returns' },
  { route: '/reports', module: 'reports', label: 'Reports' },
  { route: '/lucky-draw', module: 'lucky_draw', label: 'Lucky Draw' },
  { route: '/sync', module: 'sync', label: 'Sync Queue' },
  { route: '/users', module: 'users', label: 'User Management' },
  { route: '/settings', module: 'settings', label: 'Settings' }
];

const routeMeta = {
  '/dashboard': { module: 'dashboard', title: 'Dashboard' },
  '/pos': { module: 'pos', title: 'POS Billing' },
  '/products': { module: 'products', title: 'Products' },
  '/inventory': { module: 'inventory', title: 'Inventory' },
  '/purchases': { module: 'purchases', title: 'Purchases' },
  '/purchase-orders': { module: 'purchase_orders', title: 'Purchase Orders' },
  '/suppliers': { module: 'suppliers', title: 'Suppliers' },
  '/expenses': { module: 'expenses', title: 'Expenses' },
  '/customers': { module: 'customers', title: 'Customers' },
  '/returns': { module: 'returns', title: 'Returns' },
  '/reports': { module: 'reports', title: 'Reports' },
  '/lucky-draw': { module: 'lucky_draw', title: 'Lucky Draw' },
  '/sync': { module: 'sync', title: 'Sync Queue' },
  '/users': { module: 'users', title: 'User Management' },
  '/settings': { module: 'settings', title: 'Settings' }
};

let currentProfile = null;
let currentProducts = [];
let canWriteProducts = false;
let productSearchTimer = null;
let inventorySearchTimer = null;
let currentInventory = [];
let filteredInventory = [];
let inventoryTab = 'all';
let canAdjustInventory = false;
let purchaseItems = [];
let poItems = [];
let requisitionItems = [];
let currentRequisitions = [];
let currentPurchaseOrders = [];
let currentPoPageData = { stats: {}, warehouses: [], nextNumber: '' };
let poSearchTimer = null;
let currentPurchases = [];
let filteredPurchases = [];
let purchasePage = 1;
let purchaseStatusTab = '';
let purchaseLoadSequence = 0;
let currentSuppliers = [];
let currentExpenses = [];
let supplierSearchTimer = null;
let currentUsers = [];
let currentRoles = [];
let currentLuckyCampaigns = [];
let luckyEntrySearchTimer = null;
let selectedRoleId = null;
let userSearchTimer = null;
let cartItems = [];
let posSearchTimer = null;
let posCategoryId = '';
let posPriceMode = 'retail';
let customerSearchTimer = null;
let customerPageSearchTimer = null;
let currentCustomerPage = [];
let activeCustomerTab = '';
let lastReceipt = null;
let currentReturnInvoice = null;
let currentAppInfo = null;
let currentLicenseStatus = null;

function showMessage(target, text, type = 'error') {
  target.textContent = text;
  target.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'bg-emerald-50', 'text-emerald-700');
  target.classList.add(type === 'success' ? 'bg-emerald-50' : 'bg-red-50');
  target.classList.add(type === 'success' ? 'text-emerald-700' : 'text-red-700');
}

function setButtonLoading(button, loadingText) {
  if (!button) return () => {};
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

function clearMessage(target) {
  target.textContent = '';
  target.classList.add('hidden');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setSyncIndicator(state, counts = {}) {
  if (!syncStatusIndicator) return;
  const pending = Number(counts.pending || 0);
  const failed = Number(counts.failed || 0);
  const isOffline = state === 'Offline';
  const isError = state === 'Sync Error' || failed > 0;
  const isSyncing = state === 'Syncing' || Number(counts.syncing || 0) > 0;
  syncStatusIndicator.textContent = `${isOffline ? 'Offline' : isError ? 'Sync Error' : isSyncing ? 'Syncing' : 'Online'}${pending ? ` (${pending})` : ''}`;
  syncStatusIndicator.className = 'navLink rounded-md border px-3 py-2 text-xs font-semibold';
  if (isOffline) syncStatusIndicator.classList.add('border-amber-200', 'bg-amber-50', 'text-amber-800');
  else if (isError) syncStatusIndicator.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  else if (isSyncing) syncStatusIndicator.classList.add('border-sky-200', 'bg-sky-50', 'text-sky-700');
  else syncStatusIndicator.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
  syncStatusIndicator.dataset.route = '/sync';
}

async function loadSyncStatus() {
  if (!window.posApi?.sync?.status) {
    setSyncIndicator(navigator.onLine ? 'Online' : 'Offline');
    return;
  }
  try {
    if (!navigator.onLine) {
      setSyncIndicator('Offline');
      return;
    }
    const result = await window.posApi.sync.status();
    if (!result?.ok) {
      setSyncIndicator('Sync Error');
      return;
    }
    setSyncIndicator(result.counts?.failed ? 'Sync Error' : 'Online', result.counts);
    if (syncTerminalCode) syncTerminalCode.textContent = `Terminal: ${result.terminal?.code || '-'}`;
  } catch (error) {
    setSyncIndicator('Sync Error');
  }
}

async function loadSyncQueue() {
  if (!window.posApi?.sync?.queue) {
    showMessage(syncMessage, 'Sync service is not available.');
    return;
  }
  clearMessage(syncMessage);
  if (!navigator.onLine) {
    setSyncIndicator('Offline');
    showMessage(syncMessage, 'Offline mode is active. New POS actions will remain queued until connection returns.', 'success');
  }
  const result = await window.posApi.sync.queue();
  if (!result.ok) {
    showMessage(syncMessage, result.message || 'Sync queue could not be loaded.');
    return;
  }
  const counts = result.status?.counts || { pending: 0, syncing: 0, failed: 0, synced: 0 };
  syncPendingCount.textContent = counts.pending || 0;
  syncSyncingCount.textContent = counts.syncing || 0;
  syncFailedCount.textContent = counts.failed || 0;
  syncSyncedCount.textContent = counts.synced || 0;
  syncTerminalCode.textContent = `Terminal: ${result.status?.terminal?.code || '-'}`;
  syncQueueBody.innerHTML = (result.queue || []).map((item) => `
    <tr>
      <td class="px-3 py-2">${item.entityType} #${item.entityId}</td>
      <td class="px-3 py-2">${item.operation}</td>
      <td class="px-3 py-2">${item.status}</td>
      <td class="px-3 py-2">${item.terminalCode || '-'}</td>
      <td class="px-3 py-2">${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="px-3 py-6 text-center text-zinc-500">No queued operations.</td></tr>';
  syncLogsList.innerHTML = (result.logs || []).map((log) => `
    <div class="px-3 py-2">
      <p class="font-semibold text-zinc-950">${log.status} - ${log.terminalCode || '-'}</p>
      <p class="text-xs text-zinc-500">${log.message || '-'} | Processed ${log.processedCount || 0} | ${log.startedAt ? new Date(log.startedAt).toLocaleString() : '-'}</p>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No sync logs.</p>';
  setSyncIndicator(counts.failed ? 'Sync Error' : counts.syncing ? 'Syncing' : navigator.onLine ? 'Online' : 'Offline', counts);
}

function hasPermission(permission) {
  return currentProfile?.role === 'Admin' || currentProfile?.permissions?.includes(permission);
}

async function loadAppInfo() {
  if (!window.posApi?.app?.info) return;
  const result = await window.posApi.app.info();
  if (!result.ok) return;
  currentAppInfo = result.info;
  const versionText = `${result.info.appName} v${result.info.version}`;
  if (loginVersion) loginVersion.textContent = `© 2026 Grocery POS System. All rights reserved. • ${versionText}`;
  if (aboutVersion) aboutVersion.textContent = result.info.version;
  if (aboutBuildDate) aboutBuildDate.textContent = result.info.buildDate ? new Date(result.info.buildDate).toLocaleString() : '-';
  if (aboutEnvironment) aboutEnvironment.textContent = `${result.info.environment}${result.info.isPackaged ? ' / packaged' : ' / development'}`;
  if (updateCurrentVersion) updateCurrentVersion.textContent = result.info.version;
}

function renderLicense(result) {
  if (!result?.ok) return;
  currentLicenseStatus = result;
  licenseState.textContent = result.license.activationState || '-';
  licenseStatus.textContent = result.license.status || '-';
  licenseExpires.textContent = result.license.expiresAt ? new Date(result.license.expiresAt).toLocaleDateString() : (result.license.trialEndsAt ? `Trial ${new Date(result.license.trialEndsAt).toLocaleDateString()}` : '-');
  licenseMachineId.textContent = result.machine.machineId || '-';
  licenseMessage.textContent = result.license.cacheValid ? 'Activation cache is valid.' : 'Activation cache signature is invalid. Refresh activation.';
  licenseMessage.className = `mt-3 rounded-md px-3 py-2 text-sm ${result.license.cacheValid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`;
}

async function loadLicenseStatus() {
  if (!window.posApi?.license?.status || !licenseState) return;
  const result = await window.posApi.license.status();
  renderLicense(result);
}

function renderUpdate(result) {
  const update = result?.update || {};
  updateCurrentVersion.textContent = update.currentVersion || currentAppInfo?.version || '-';
  updateLatestVersion.textContent = update.latestVersion || '-';
  updateState.textContent = update.state || (result?.ok ? 'up-to-date' : 'failed');
  updateMessage.textContent = result?.message || update.message || 'Update status ready.';
  updateMessage.className = `mt-3 rounded-md px-3 py-2 text-sm ${result?.ok === false || update.state === 'failed' ? 'bg-red-50 text-red-700' : 'bg-zinc-50 text-zinc-600'}`;
  restartUpdateButton.disabled = update.state !== 'downloaded';
}

function showLogin() {
  loadingScreen.classList.add('hidden');
  dashboard.classList.add('hidden');
  hideRoutePanels();
  loginScreen.classList.remove('hidden');
  window.setTimeout(() => loginUsername?.focus(), 0);
}

function showDashboard(profile) {
  currentProfile = profile;
  loadingScreen.classList.add('hidden');
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  signedInUser.textContent = `${profile.fullName} (${profile.role})`;
  renderModules();
  loadDashboardStats();
  loadSyncStatus();
  navigateTo(getCurrentRoute(), { replace: true });
}

function getCurrentRoute() {
  const route = window.location.hash.replace(/^#/, '');
  return routeMeta[route] ? route : '/dashboard';
}

function setCurrentRoute(route, replace = false) {
  const nextHash = `#${route}`;
  if (replace) {
    window.history.replaceState(null, '', nextHash);
  } else if (window.location.hash !== nextHash) {
    window.history.pushState(null, '', nextHash);
  }
}

function hideRoutePanels() {
  routePanels.forEach((panel) => panel.classList.add('hidden'));
}

function setActiveNavigation(route) {
  routeTitle.textContent = routeMeta[route]?.title || 'Dashboard';
  document.querySelectorAll('.navLink').forEach((link) => {
    const active = link.dataset.route === route;
    if (link.classList.contains('epos-sidebar-item')) {
      link.classList.toggle('epos-sidebar-item-active', active);
    }
  });
}

async function navigateTo(route, options = {}) {
  const targetRoute = routeMeta[route] ? route : '/dashboard';
  const meta = routeMeta[targetRoute];
  const access = await window.posApi.auth.canAccess(meta.module);

  if (!access.ok || !access.allowed) {
    targetRoute !== '/dashboard' && showMessage(message, 'You do not have permission to access this route.');
    return navigateTo('/dashboard', { replace: true });
  }

  hideRoutePanels();
  document.querySelector(`[data-route-panel="${targetRoute}"]`)?.classList.remove('hidden');
  setActiveNavigation(targetRoute);
  setCurrentRoute(targetRoute, options.replace);

  if (targetRoute === '/dashboard') {
    await loadDashboardStats();
  }
  if (targetRoute === '/products') {
    await loadProducts();
    productSearch.focus();
  }
  if (targetRoute === '/pos') {
    await openPosRoute();
  }
  if (targetRoute === '/inventory') {
    await loadInventory();
    await loadMovements();
  }
  if (targetRoute === '/purchases') {
    if (purchaseDate) purchaseDate.value = new Date().toISOString().slice(0, 10);
    resetPurchaseListFilters('30');
    await loadPurchases();
    const helperResults = await Promise.allSettled([loadSuppliers(), loadInventory()]);
    if (helperResults.some((result) => result.status === 'rejected')) {
      console.warn('Purchase helper data load warning:', helperResults);
    }
    if (!currentPurchases.length) await loadPurchases();
    renderPurchaseItems();
  }
  if (targetRoute === '/purchase-orders') {
    await Promise.all([loadSuppliers(), loadInventory(), loadPurchaseOrders(), loadRequisitions(), loadPurchaseOrderPageData()]);
    resetRequisitionForm();
    renderPoItems();
  }
  if (targetRoute === '/suppliers') {
    await loadSupplierPage();
  }
  if (targetRoute === '/expenses') {
    await loadExpensePage();
  }
  if (targetRoute === '/reports') {
    await loadReports();
  }
  if (targetRoute === '/lucky-draw') {
    await loadLuckyDrawPage();
  }
  if (targetRoute === '/sync') {
    await loadSyncQueue();
  }
  if (targetRoute === '/users') {
    await loadUsersPage();
  }
  if (targetRoute === '/customers') {
    await loadCustomerPage();
  }
  if (targetRoute === '/returns') {
    await loadReturns();
  }
  if (targetRoute === '/settings') {
    await loadPrinterSettings();
  }
}

async function openPosRoute() {
  await Promise.all([loadCustomers(), loadHeldSales()]);
  updatePosRoleActions();
  updatePosInvoiceMeta();
  await loadPosDashboardStats();
  renderCart();
  posBarcodeInput.focus();
}

function updatePosInvoiceMeta() {
  const invoiceDate = document.querySelector('#posInvoiceDate');
  const salesPerson = document.querySelector('#posSalesPerson');
  if (invoiceDate) invoiceDate.value = new Date().toLocaleString();
  if (salesPerson) salesPerson.value = currentProfile?.name || currentProfile?.username || 'Current User';
}

async function loadPosDashboardStats() {
  const todaySales = document.querySelector('#posTodaySalesStat');
  const totalOrders = document.querySelector('#posTotalOrdersStat');
  const totalCustomers = document.querySelector('#posTotalCustomersStat');
  const dueAmount = document.querySelector('#posDueAmountStat');
  const recentInvoices = document.querySelector('#posRecentInvoices');
  if (!todaySales && !totalOrders && !totalCustomers && !dueAmount && !recentInvoices) return;
  const overview = await window.posApi.dashboard.overview();
  if (!overview.ok) return;
  if (todaySales) todaySales.textContent = `Rs. ${formatMoney(overview.stats?.todaySales || 0)}`;
  if (totalOrders) totalOrders.textContent = Number(overview.recentSales?.length || 0).toLocaleString();
  if (totalCustomers) totalCustomers.textContent = Number(overview.stats?.customersWithDue || 0).toLocaleString();
  if (dueAmount) dueAmount.textContent = `Rs. ${formatMoney(overview.stats?.customerDueTotal || 0)}`;
  if (recentInvoices) {
    recentInvoices.innerHTML = (overview.recentSales || []).map((sale) => `
      <div class="epos-invoice-feed-row">
        <span>${sale.invoiceNumber}</span>
        <strong>Rs. ${formatMoney(sale.grandTotal)}</strong>
      </div>
    `).join('') || 'No invoices yet.';
  }
}

function updatePosRoleActions() {
  const canManageReturns = hasPermission('pos.refund.create') || ['Admin', 'Manager', 'Cashier'].includes(currentProfile?.role);
  refundSaleButton.disabled = !canManageReturns;
  exchangeSaleButton.disabled = !canManageReturns;
  refundSaleButton.title = canManageReturns ? 'Open returns workflow' : 'You do not have permission to create returns';
  exchangeSaleButton.title = canManageReturns ? 'Open returns workflow for exchange foundation' : 'You do not have permission to create exchanges';
}

async function loadPosCategories() {
  if (!posCategoryFilters) return;
  const result = await window.posApi.catalog.list('categories');
  if (!result.ok) {
    posCategoryFilters.innerHTML = '<span class="text-xs text-red-700">Categories unavailable</span>';
    return;
  }
  const categories = result.items || [];
  posCategoryFilters.innerHTML = [
    `<button type="button" data-pos-category="" class="epos-billing-chip ${posCategoryId ? '' : 'epos-billing-chip-active'}">All</button>`,
    ...categories.map((category) => `
      <button type="button" data-pos-category="${category.id}" class="epos-billing-chip ${Number(posCategoryId) === Number(category.id) ? 'epos-billing-chip-active' : ''}">
        ${category.name}
      </button>
    `)
  ].join('');
}

async function loadDashboardStats() {
  const overview = await window.posApi.dashboard.overview();
  if (!overview.ok) {
    const stats = await window.posApi.products.stats();
    if (stats.ok) dashboardProductCount.textContent = Number(stats.count || 0).toLocaleString();
    return;
  }
  // setText is now a module-level utility function
  const stats = overview.stats || {};
  const recentSales = overview.recentSales || [];
  const lowStockItems = overview.lowStock || [];
  const topProducts = overview.topProducts || [];
  const paymentMethods = overview.paymentMethods || [];
  const categorySales = overview.categorySales || [];
  const totalSales = Number(stats.todaySales || 0);
  const totalProfit = Number(stats.totalProfit || 0);
  const orderCount = Number(stats.todayOrders || recentSales.length || 0);
  const averageOrder = orderCount > 0 ? totalSales / orderCount : 0;

  dashboardProductCount.textContent = Number(stats.productCount || 0).toLocaleString();
  dashboardTodaySales.textContent = `Rs. ${formatMoney(totalSales)}`;
  dashboardLowStockCount.textContent = Number(stats.lowStockCount || 0).toLocaleString();
  dashboardPurchaseTotal.textContent = `Rs. ${formatMoney(stats.duePurchases ?? stats.todayPurchases ?? 0)}`;
  dashboardCustomerDue.textContent = `Rs. ${formatMoney(stats.customerDueTotal || 0)}`;
  setText('#dashboardProfitTotal', `Rs. ${formatMoney(totalProfit)}`);
  setText('#dashboardOrderCount', orderCount.toLocaleString());
  setText('#dashboardPaymentTotal', `Rs. ${formatMoney(totalSales)}`);
  setText('#dashboardCategoryTotal', `Rs. ${formatMoney(totalSales)}`);
  setText('#dashboardMiniSales', `Rs. ${formatMoney(totalSales)}`);
  setText('#dashboardMiniProfit', `Rs. ${formatMoney(totalProfit)}`);
  setText('#dashboardMiniOrders', orderCount.toLocaleString());
  setText('#dashboardMiniCustomers', Number(stats.customersWithDue || 0).toLocaleString());
  setText('#dashboardAverageOrder', `Rs. ${formatMoney(averageOrder)}`);
  setText('#dashboardStockValue', `Rs. ${formatMoney(stats.stockValue || 0)}`);
  setText('#dashboardSupplierCount', Number(stats.supplierCount || 0).toLocaleString());
  setText('#dashboardExpenseTotal', `Rs. ${formatMoney(stats.todayExpenses || 0)}`);
  setText('#dashboardReceivableTotal', `Rs. ${formatMoney(stats.customerDueTotal || 0)}`);
  setText('#dashboardCustomerDueLabel', `${Number(stats.customersWithDue || 0).toLocaleString()} customers with dues`);
  setText('#dashboardReportDate', new Date().toLocaleDateString());
  setText('#dashboardUserName', currentProfile?.fullName || currentProfile?.username || 'Admin User');
  setText('#dashboardUserRole', currentProfile?.role || 'Administrator');
  setText('#dashboardGreeting', `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, ${currentProfile?.fullName || currentProfile?.username || 'Admin'}`);

  const salesChart = document.querySelector('#dashboardSalesChart');
  if (salesChart) {
    const values = recentSales.slice(0, 7).map((sale) => Number(sale.grandTotal || 0)).reverse();
    const fallback = [0.28, 0.48, 0.34, 0.68, 0.42, 0.82, 0.55].map((ratio) => totalSales * ratio);
    const chartValues = values.length ? values : fallback;
    const max = Math.max(...chartValues, 1);
    salesChart.innerHTML = chartValues.map((value) => `<span class="epos-dashboard-line-bar" style="height:${Math.max(8, Math.round((value / max) * 100))}%"></span>`).join('');
  }

  const comparisonChart = document.querySelector('#dashboardComparisonChart');
  if (comparisonChart) {
    const base = Math.max(totalSales, 1);
    comparisonChart.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const ratio = 0.28 + (((index * 17) % 60) / 100);
      return `<span class="epos-dashboard-bar" style="height:${Math.round(Math.min(1, ratio) * 100)}%"></span>`;
    }).join('');
  }

  const methodTotal = paymentMethods.reduce((sum, item) => sum + Number(item.total || 0), 0) || totalSales || 1;
  const paymentList = document.querySelector('#dashboardPaymentMethods');
  if (paymentList) {
    paymentList.innerHTML = (paymentMethods.length ? paymentMethods : [{ method: 'Cash', total: totalSales }]).map((item) => `
      <div><span>${item.method || 'Cash'}<br><small>Rs. ${formatMoney(item.total)} (${Math.round((Number(item.total || 0) / methodTotal) * 100)}%)</small></span><strong></strong></div>
    `).join('');
  }

  const categoryTotal = categorySales.reduce((sum, item) => sum + Number(item.total || 0), 0) || totalSales || 1;
  const categoryList = document.querySelector('#dashboardCategorySales');
  if (categoryList) {
    categoryList.innerHTML = (categorySales.length ? categorySales : [{ category: 'No category sales', total: 0 }]).map((item) => `
      <div><span>${item.category}<br><small>Rs. ${formatMoney(item.total)} (${Math.round((Number(item.total || 0) / categoryTotal) * 100)}%)</small></span><strong></strong></div>
    `).join('');
  }

  const productList = document.querySelector('#dashboardTopProducts');
  if (productList) {
    const ranked = topProducts.length ? topProducts : lowStockItems.map((item) => ({ name: item.name, quantity: item.currentStock, total: 0 }));
    productList.innerHTML = ranked.slice(0, 5).map((item, index) => `
      <div><b>${index + 1}</b><span>${item.name}<br><small>${Number(item.quantity || 0).toLocaleString()} sold/stock</small></span><strong>Rs. ${formatMoney(item.total || 0)}</strong></div>
    `).join('') || '<p class="text-zinc-500">No product sales yet.</p>';
  }

  dashboardRecentSales.innerHTML = recentSales.map((sale) => `
    <div><span>${sale.invoiceNumber || '-'}</span><span>${sale.customerName || 'Walk-in Customer'}</span><strong>Rs. ${formatMoney(sale.grandTotal)}</strong><span>${sale.paymentMethod || 'Cash'}</span></div>
  `).join('') || '<p class="text-zinc-500">No sales yet.</p>';
  dashboardLowStock.innerHTML = lowStockItems.map((item) => `<div class="flex justify-between"><span>${item.name}</span><strong>${item.currentStock}/${item.minStockLevel}</strong></div>`).join('') || '<p class="text-zinc-500">No low stock.</p>';
  dashboardRecentActivity.innerHTML = (overview.recentActivity || []).map((item) => `<div><p class="font-medium">${item.action}</p><p class="text-xs text-zinc-500">${item.message || item.status}</p></div>`).join('') || '<p class="text-zinc-500">No activity.</p>';
}

async function renderModules() {
  moduleGrid.innerHTML = '';
  await updateSidebarPermissions();

  for (const moduleItem of modules) {
    const access = await window.posApi.auth.canAccess(moduleItem.module);
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = !access.allowed;
    button.className = access.allowed
      ? 'rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-left transition hover:border-blue-500 hover:bg-white hover:shadow-sm'
      : 'rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-left opacity-60';
    button.innerHTML = `
      <p class="text-sm font-semibold text-zinc-900">${moduleItem.label}</p>
      <p class="mt-2 text-xs font-bold ${access.allowed ? 'text-blue-700' : 'text-zinc-500'}">
        ${access.allowed ? 'Allowed' : 'Restricted'}
      </p>
    `;

    if (access.allowed) {
      button.addEventListener('click', () => navigateTo(moduleItem.route));
    }

    moduleGrid.appendChild(button);
  }
}

async function updateSidebarPermissions() {
  const links = sidebarNav.querySelectorAll('.navLink');
  for (const link of links) {
    const access = await window.posApi.auth.canAccess(link.dataset.module);
    link.disabled = !access.allowed;
    link.classList.toggle('hidden', !access.allowed);
    link.classList.toggle('opacity-40', !access.allowed);
    link.classList.toggle('cursor-not-allowed', !access.allowed);
  }
}

async function restoreSession() {
  const profile = await window.posApi.auth.profile();

  if (profile.ok) {
    showDashboard(profile.profile);
    return;
  }

  showLogin();
}

function optionHtml(items, selectedId) {
  return [
    '<option value="">None</option>',
    ...items.map((item) => `<option value="${item.id}" ${Number(selectedId) === Number(item.id) ? 'selected' : ''}>${item.name}${item.shortName ? ` (${item.shortName})` : ''}</option>`)
  ].join('');
}

async function loadCatalog(selected = {}) {
  const [categories, brands, units] = await Promise.all([
    window.posApi.catalog.list('categories'),
    window.posApi.catalog.list('brands'),
    window.posApi.catalog.list('units')
  ]);

  productFields.categoryId.innerHTML = optionHtml(categories.items || [], selected.categoryId);
  productFields.brandId.innerHTML = optionHtml(brands.items || [], selected.brandId);
  productFields.unitId.innerHTML = optionHtml(units.items || [], selected.unitId);
  renderCatalogList(categoryList, 'categories', categories.items || []);
  renderCatalogList(brandList, 'brands', brands.items || []);
  renderCatalogList(unitList, 'units', units.items || []);
}

function renderCatalogList(target, type, items) {
  target.innerHTML = items.slice(0, 8).map((item) => `
    <div class="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2">
      <span>${item.name}${item.shortName ? ` (${item.shortName})` : ''}</span>
      <button type="button" data-catalog-type="${type}" data-catalog-id="${item.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Delete</button>
    </div>
  `).join('') || '<p class="text-zinc-500">No records yet.</p>';
}

async function loadProducts() {
  clearMessage(productMessage);
  productTableBody.innerHTML = '<tr><td colspan="12" class="px-4 py-6 text-center text-sm text-zinc-500">Loading products...</td></tr>';

  const result = await window.posApi.products.list({ search: productSearch.value });
  if (!result.ok) {
    productTableBody.innerHTML = '';
    productEmptyState.classList.remove('hidden');
    showMessage(productMessage, result.message || 'Products could not be loaded.');
    return;
  }

  canWriteProducts = Boolean(result.permissions?.canWrite) && (hasPermission('products.create') || hasPermission('products.update') || hasPermission('products.delete'));
  newProductButton.classList.toggle('hidden', !canWriteProducts);
  document.querySelector('#productQuickAddButton')?.classList.toggle('hidden', !canWriteProducts);
  currentProducts = result.products || [];
  populateProductFilters();
  renderProductRows();
  await loadDashboardStats();
}

function productFilterElements() {
  return {
    category: document.querySelector('#productCategoryFilter'),
    brand: document.querySelector('#productBrandFilter'),
    unit: document.querySelector('#productUnitFilter'),
    stock: document.querySelector('#productStockFilter'),
    activeTab: document.querySelector('[data-product-tab].active')?.dataset.productTab || 'all'
  };
}

function uniqueProductOptions(key) {
  return [...new Set(currentProducts.map((product) => String(product[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setSelectOptions(select, values, label) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = [`<option value="">${label}</option>`, ...values.map((value) => `<option value="${value}">${value}</option>`)].join('');
  select.value = values.includes(previous) ? previous : '';
}

function populateProductFilters() {
  setSelectOptions(document.querySelector('#productCategoryFilter'), uniqueProductOptions('categoryName'), 'All Categories');
  setSelectOptions(document.querySelector('#productBrandFilter'), uniqueProductOptions('brandName'), 'All Brands');
  const units = [...new Set(currentProducts.map((product) => String(product.unitShortName || product.unitName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  setSelectOptions(document.querySelector('#productUnitFilter'), units, 'All Units');
}

function productStockState(product) {
  const stock = Number(product.currentStock || 0);
  const minimum = Number(product.minStockLevel || 0);
  if (stock <= 0) return 'out';
  if (stock <= minimum) return 'low';
  return 'in';
}

function visibleProducts() {
  const filters = productFilterElements();
  return currentProducts.filter((product) => {
    const stockState = productStockState(product);
    if (filters.category?.value && product.categoryName !== filters.category.value) return false;
    if (filters.brand?.value && product.brandName !== filters.brand.value) return false;
    if (filters.unit?.value && (product.unitShortName || product.unitName || '') !== filters.unit.value) return false;
    if (filters.stock?.value && stockState !== filters.stock.value) return false;
    if (filters.activeTab === 'active' && !product.isActive) return false;
    if (filters.activeTab === 'inactive' && product.isActive) return false;
    if (filters.activeTab === 'low' && stockState !== 'low') return false;
    if (filters.activeTab === 'out' && stockState !== 'out') return false;
    return true;
  });
}

function renderProductRows() {
  productTableBody.innerHTML = '';
  const products = visibleProducts();
  productEmptyState.classList.toggle('hidden', products.length > 0);
  const totalCount = currentProducts.length;
  const activeCount = currentProducts.filter((product) => product.isActive).length;
  const lowStockCount = currentProducts.filter((product) => productStockState(product) === 'low').length;
  const outOfStockCount = currentProducts.filter((product) => productStockState(product) === 'out').length;
  const totalValue = currentProducts.reduce((sum, product) => sum + (Number(product.salePrice || 0) * Number(product.currentStock || 0)), 0);
  document.querySelector('#productTotalCount') && (document.querySelector('#productTotalCount').textContent = totalCount.toLocaleString());
  document.querySelector('#productActiveCount') && (document.querySelector('#productActiveCount').textContent = activeCount.toLocaleString());
  document.querySelector('#productLowStockCount') && (document.querySelector('#productLowStockCount').textContent = lowStockCount.toLocaleString());
  document.querySelector('#productOutOfStockCount') && (document.querySelector('#productOutOfStockCount').textContent = outOfStockCount.toLocaleString());
  document.querySelector('#productTotalValue') && (document.querySelector('#productTotalValue').textContent = `PKR ${formatMoney(totalValue)}`);
  document.querySelector('#productResultSummary') && (document.querySelector('#productResultSummary').textContent = `Showing ${products.length.toLocaleString()} of ${totalCount.toLocaleString()} products`);

  for (const product of products) {
    const stockState = productStockState(product);
    const statusLabel = !product.isActive ? 'Discontinued' : stockState === 'out' ? 'Out of Stock' : stockState === 'low' ? 'Low Stock' : 'In Stock';
    const categoryLabel = product.categoryName || 'Uncategorized';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="epos-products-name">
          <span class="epos-products-avatar">${String(product.name || 'P').trim().slice(0, 1).toUpperCase()}</span>
          <div><strong>${product.name}</strong></div>
        </div>
      </td>
      <td>
        <div class="epos-products-code">
          <strong>${product.sku || '-'}</strong>
        </div>
      </td>
      <td>${product.barcode || '-'}</td>
      <td><span class="epos-product-pill">${categoryLabel}</span></td>
      <td>${product.brandName || '-'}</td>
      <td>${product.unitShortName || product.unitName || '-'}</td>
      <td>PKR ${formatMoney(product.purchasePrice)}</td>
      <td><strong>PKR ${formatMoney(product.salePrice)}</strong></td>
      <td><span class="epos-product-stock ${stockState}">${Number(product.currentStock).toLocaleString()}</span></td>
      <td><span class="epos-product-status ${!product.isActive ? 'inactive' : stockState}">${statusLabel}</span></td>
      <td>
        <div class="epos-products-row-actions">
          <button type="button" data-action="print" data-id="${product.id}" class="epos-products-action" title="Barcode">◎</button>
          ${canWriteProducts ? `<button type="button" data-action="edit" data-id="${product.id}" class="epos-products-action" title="Edit">✎</button>
          <button type="button" data-action="delete" data-id="${product.id}" class="epos-products-action delete" title="Delete">⌫</button>` : ''}
        </div>
      </td>
    `;
    productTableBody.appendChild(row);
  }
}

async function openProductsModule() {
  await navigateTo('/products');
}

function productOptions(items, selectedId = '') {
  return [
    '<option value="">Select product</option>',
    ...items.map((item) => `<option value="${item.id || item.productId}" ${Number(selectedId) === Number(item.id || item.productId) ? 'selected' : ''}>${item.name} - ${item.sku}</option>`)
  ].join('');
}

async function openInventoryModule() {
  await navigateTo('/inventory');
}

function inventoryProductDetails(item) {
  const productId = Number(item.productId || item.id);
  return currentProducts.find((product) => Number(product.id) === productId) || {};
}

function inventoryStockState(item) {
  const stock = Number(item.currentStock || 0);
  const minimum = Number(item.minStockLevel || 0);
  if (stock <= 0) return 'out';
  if (stock <= minimum) return 'low';
  return 'in';
}

function inventoryStatusLabel(state) {
  if (state === 'out') return 'Out of Stock';
  if (state === 'low') return 'Low Stock';
  return 'In Stock';
}

function inventoryCategoryIcon(category = '') {
  const label = String(category).toLowerCase();
  if (label.includes('beverage') || label.includes('drink')) return '🥤';
  if (label.includes('snack') || label.includes('bakery')) return '🍪';
  if (label.includes('clean') || label.includes('house')) return '🧴';
  if (label.includes('personal')) return '🧼';
  if (label.includes('grocery') || label.includes('grain')) return '🛒';
  return '📦';
}

function setInventorySelectOptions(selector, values, label) {
  const select = document.querySelector(selector);
  if (!select) return;
  const previous = select.value;
  const options = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = [`<option value="">${label}</option>`, ...options.map((value) => `<option value="${value}">${value}</option>`)].join('');
  select.value = options.includes(previous) ? previous : '';
}

function syncInventoryFilterSearch(value) {
  const mainSearch = document.querySelector('#inventorySearch');
  const inlineSearch = document.querySelector('#inventoryInlineSearch');
  if (mainSearch && mainSearch.value !== value) mainSearch.value = value;
  if (inlineSearch && inlineSearch.value !== value) inlineSearch.value = value;
}

function populateInventoryFilters() {
  setInventorySelectOptions('#inventoryCategoryFilter', currentInventory.map((item) => item.categoryName), 'All Categories');
  setInventorySelectOptions('#inventoryBrandFilter', currentInventory.map((item) => inventoryProductDetails(item).brandName), 'All Brands');
  const supplierFilter = document.querySelector('#inventorySupplierFilter');
  if (supplierFilter) {
    const previous = supplierFilter.value;
    supplierFilter.innerHTML = ['<option value="">All Suppliers</option>', ...currentSuppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`)].join('');
    supplierFilter.value = previous;
  }
}

function getInventoryRows() {
  const category = document.querySelector('#inventoryCategoryFilter')?.value || '';
  const brand = document.querySelector('#inventoryBrandFilter')?.value || '';
  const status = document.querySelector('#inventoryStockStatusFilter')?.value || '';
  const rows = currentInventory.filter((item) => {
    const product = inventoryProductDetails(item);
    const state = inventoryStockState(item);
    if (category && item.categoryName !== category) return false;
    if (brand && product.brandName !== brand) return false;
    if (status && state !== status) return false;
    if (inventoryTab === 'low' && state !== 'low') return false;
    if (inventoryTab === 'out' && state !== 'out') return false;
    return true;
  });

  if (inventoryTab === 'value') {
    return rows.sort((a, b) => {
      const productA = inventoryProductDetails(a);
      const productB = inventoryProductDetails(b);
      return (Number(productB.salePrice || 0) * Number(b.currentStock || 0)) - (Number(productA.salePrice || 0) * Number(a.currentStock || 0));
    });
  }

  if (inventoryTab === 'recent') {
    return rows.sort((a, b) => new Date(b.lastMovementAt || 0) - new Date(a.lastMovementAt || 0));
  }

  return rows;
}

function renderInventoryPage() {
  populateInventoryFilters();
  filteredInventory = getInventoryRows();
  const totalProducts = currentInventory.length;
  const lowStock = currentInventory.filter((item) => inventoryStockState(item) === 'low').length;
  const outOfStock = currentInventory.filter((item) => inventoryStockState(item) === 'out').length;
  const stockValue = currentInventory.reduce((sum, item) => {
    const product = inventoryProductDetails(item);
    return sum + (Number(product.salePrice || 0) * Number(item.currentStock || 0));
  }, 0);

  document.querySelector('#inventoryStatProducts') && (document.querySelector('#inventoryStatProducts').textContent = totalProducts.toLocaleString());
  document.querySelector('#inventoryStatValue') && (document.querySelector('#inventoryStatValue').textContent = `PKR ${formatMoney(stockValue)}`);
  document.querySelector('#inventoryStatLow') && (document.querySelector('#inventoryStatLow').textContent = lowStock.toLocaleString());
  document.querySelector('#inventoryStatOut') && (document.querySelector('#inventoryStatOut').textContent = outOfStock.toLocaleString());
  document.querySelector('#inventoryStatVariants') && (document.querySelector('#inventoryStatVariants').textContent = totalProducts.toLocaleString());
  document.querySelector('#inventoryResultSummary') && (document.querySelector('#inventoryResultSummary').textContent = `Showing ${filteredInventory.length.toLocaleString()} of ${totalProducts.toLocaleString()} items`);

  if (!filteredInventory.length) {
    inventoryTableBody.innerHTML = '<tr><td colspan="12" class="epos-inventory-empty">No inventory records found from the database.</td></tr>';
    return;
  }

  inventoryTableBody.innerHTML = filteredInventory.map((item, index) => {
    const product = inventoryProductDetails(item);
    const state = inventoryStockState(item);
    const category = item.categoryName || product.categoryName || 'Uncategorized';
    return `
      <tr>
        <td>${index + 1}</td>
        <td><span class="epos-inventory-image">${inventoryCategoryIcon(category)}</span></td>
        <td><div class="epos-inventory-product"><strong>${item.name}</strong></div></td>
        <td>${item.sku || '-'}</td>
        <td>${item.barcode || '-'}</td>
        <td><span class="epos-inventory-badge">${category}</span></td>
        <td>${product.brandName || '-'}</td>
        <td>PKR ${formatMoney(product.purchasePrice || 0)}</td>
        <td>PKR ${formatMoney(product.salePrice || 0)}</td>
        <td><span class="epos-inventory-stock ${state}">${Number(item.currentStock || 0).toLocaleString()}</span></td>
        <td><span class="epos-inventory-status ${state}">${inventoryStatusLabel(state)}</span></td>
        <td>
          <div class="epos-inventory-row-actions">
            <button type="button" data-inventory-product="${item.productId}" title="View movement history">◉</button>
            ${canAdjustInventory ? `<button type="button" class="adjust" data-inventory-adjust="${item.productId}" title="Adjust stock">✎</button>` : ''}
            <button type="button" data-inventory-barcode="${item.productId}" title="Print barcode">⋮</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadInventory() {
  clearMessage(inventoryMessage);
  inventoryTableBody.innerHTML = '<tr><td colspan="12" class="epos-inventory-empty">Loading inventory...</td></tr>';
  const result = await window.posApi.inventory.list({
    search: inventorySearch.value,
    lowStockOnly: lowStockOnly.checked,
    outOfStockOnly: outOfStockOnly.checked
  });
  if (!result.ok) {
    inventoryTableBody.innerHTML = '';
    showMessage(inventoryMessage, result.message || 'Inventory could not be loaded.');
    return;
  }
  currentInventory = result.items || [];
  const productSnapshot = await window.posApi.products.list({ search: '' });
  if (productSnapshot.ok) {
    currentProducts = productSnapshot.products || [];
    canWriteProducts = Boolean(productSnapshot.permissions?.canWrite) && (hasPermission('products.create') || hasPermission('products.update') || hasPermission('products.delete'));
  }
  canAdjustInventory = Boolean(result.permissions?.canAdjust) && hasPermission('inventory.adjust');
  stockAdjustmentForm.classList.toggle('hidden', !canAdjustInventory);
  adjustProductId.innerHTML = productOptions(currentInventory);
  if (purchaseItemProduct) purchaseItemProduct.innerHTML = productOptions(currentInventory);
  if (poItemProduct) poItemProduct.innerHTML = productOptions(currentInventory);
  if (reqItemProduct) reqItemProduct.innerHTML = productOptions(currentInventory);
  renderInventoryPage();
}

async function loadMovements(productId = null) {
  const result = await window.posApi.inventory.movements({ productId });
  if (!result.ok) {
    movementHistory.innerHTML = `<p class="text-red-700">${result.message}</p>`;
    return;
  }
  movementHistory.innerHTML = (result.movements || []).map((movement) => `
    <div class="rounded-md border border-zinc-200 p-3">
      <p class="font-medium text-zinc-950">${movement.productName} - ${movement.movementType}</p>
      <p class="mt-1 text-zinc-600">Qty ${movement.quantity} | ${movement.previousStock} to ${movement.newStock}</p>
      <p class="mt-1 text-xs text-zinc-500">${movement.reason || '-'} | ${new Date(movement.createdAt).toLocaleString()}</p>
    </div>
  `).join('') || '<p class="text-zinc-500">No movements yet.</p>';
}

async function openPurchaseModule() {
  await navigateTo('/purchases');
}

async function loadSuppliers() {
  const result = await window.posApi.suppliers.list();
  if (!result.ok) {
    showMessage(purchaseMessage, result.message || 'Suppliers could not be loaded.');
    return;
  }
  currentSuppliers = result.suppliers || [];
  if (purchaseSupplier) {
    purchaseSupplier.innerHTML = ['<option value="">No supplier</option>', ...(result.suppliers || []).map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`)].join('');
  }
  const purchaseSupplierFilter = document.querySelector('#purchaseSupplierFilter');
  if (purchaseSupplierFilter) {
    const selected = purchaseSupplierFilter.value;
    purchaseSupplierFilter.innerHTML = ['<option value="">All Suppliers</option>', ...(result.suppliers || []).map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`)].join('');
    purchaseSupplierFilter.value = selected;
  }
  if (poSupplier) poSupplier.innerHTML = ['<option value="">No supplier</option>', ...(result.suppliers || []).map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`)].join('');
  renderPoRecentSuppliers();
  syncPoSupplierDetails();
}

async function loadSupplierPage(search = '') {
  clearMessage(supplierPageMessage);
  const result = await window.posApi.suppliers.list();
  if (!result.ok) {
    supplierList.innerHTML = `<tr><td colspan="10" class="p-4 text-red-700">${result.message}</td></tr>`;
    return;
  }
  currentSuppliers = result.suppliers || [];
  const term = String(search || supplierInlineSearch?.value || '').trim().toLowerCase();
  const status = supplierStatusFilter?.value || '';
  const city = supplierCityFilter?.value || '';
  renderSupplierStats(currentSuppliers);
  renderSupplierFilterOptions(currentSuppliers);
  populateSupplierPaymentSelect(supplierPaymentSupplier?.value || supplierDetailsPanel?.dataset.supplierId || '');
  const suppliers = term
    ? currentSuppliers.filter((supplier) => [supplier.name, supplier.phone, supplier.email].some((value) => String(value || '').toLowerCase().includes(term)))
    : currentSuppliers;
  const filtered = suppliers.filter((supplier) => {
    const supplierCity = getSupplierCity(supplier);
    const active = supplier.isActive !== false;
    if (status === 'active' && !active) return false;
    if (status === 'inactive' && active) return false;
    if (status === 'due' && Number(supplier.currentBalance || supplier.stats?.totalDue || 0) <= 0) return false;
    if (city && supplierCity !== city) return false;
    return true;
  });
  supplierList.innerHTML = filtered.map((supplier, index) => renderSupplierRow(supplier, index)).join('') || '<tr><td colspan="10" class="p-4 text-zinc-500">No suppliers found.</td></tr>';
}

function getSupplierCity(supplier = {}) {
  const parts = String(supplier.address || '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || 'Unknown';
}

function supplierInitials(name = '') {
  return String(name || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S';
}

function renderSupplierStats(suppliers = []) {
  const total = suppliers.length;
  const purchases = suppliers.reduce((sum, supplier) => sum + Number(supplier.stats?.totalPurchases || 0), 0);
  const payments = suppliers.reduce((sum, supplier) => sum + Number(supplier.stats?.totalPaid || 0), 0);
  const due = suppliers.reduce((sum, supplier) => sum + Number(supplier.currentBalance || supplier.stats?.totalDue || 0), 0);
  const today = suppliers.reduce((sum, supplier) => {
    const last = supplier.stats?.lastPurchaseDate ? new Date(supplier.stats.lastPurchaseDate).toDateString() : '';
    return sum + (last === new Date().toDateString() ? Number(supplier.stats?.totalPurchases || 0) : 0);
  }, 0);
  document.querySelector('#supplierStatTotal').textContent = total;
  document.querySelector('#supplierStatPurchases').textContent = `Rs. ${formatMoney(purchases)}`;
  document.querySelector('#supplierStatPayments').textContent = `Rs. ${formatMoney(payments)}`;
  document.querySelector('#supplierStatDue').textContent = `Rs. ${formatMoney(due)}`;
  document.querySelector('#supplierStatOverdue').textContent = `Rs. ${formatMoney(due)}`;
  document.querySelector('#supplierStatToday').textContent = `Rs. ${formatMoney(today)}`;
}

function renderSupplierFilterOptions(suppliers = []) {
  if (!supplierCityFilter) return;
  const previous = supplierCityFilter.value;
  const cities = [...new Set(suppliers.map(getSupplierCity))].filter(Boolean).sort();
  supplierCityFilter.innerHTML = ['<option value="">All Cities</option>', ...cities.map((item) => `<option value="${item}">${item}</option>`)].join('');
  supplierCityFilter.value = cities.includes(previous) ? previous : '';
}

function supplierDueAmount(supplier = {}) {
  return Number(supplier.currentBalance || supplier.stats?.totalDue || 0);
}

function populateSupplierPaymentSelect(selectedSupplierId = '') {
  if (!supplierPaymentSupplier) return;
  const activeSuppliers = currentSuppliers.filter((supplier) => supplier.isActive !== false);
  supplierPaymentSupplier.innerHTML = [
    '<option value="">Select supplier</option>',
    ...activeSuppliers.map((supplier) => {
      const due = supplierDueAmount(supplier);
      return `<option value="${supplier.id}">${supplier.name} - Due Rs. ${formatMoney(due)}</option>`;
    })
  ].join('');
  if (selectedSupplierId) supplierPaymentSupplier.value = String(selectedSupplierId);
  updateSupplierPaymentDue();
}

function selectedPaymentSupplier() {
  const supplierId = Number(supplierPaymentSupplier?.value || 0);
  return currentSuppliers.find((supplier) => Number(supplier.id) === supplierId) || null;
}

function updateSupplierPaymentDue() {
  const supplier = selectedPaymentSupplier();
  const due = supplierDueAmount(supplier || {});
  if (supplierPaymentDue) supplierPaymentDue.textContent = `Rs. ${formatMoney(due)}`;
  if (supplierPaymentStandaloneAmount) {
    supplierPaymentStandaloneAmount.max = due > 0 ? String(due) : '';
    supplierPaymentStandaloneAmount.placeholder = due > 0 ? `Max ${formatMoney(due)}` : '0.00';
  }
}

async function openSupplierPaymentModal(supplierId = 0) {
  if (!currentSuppliers.length) {
    await loadSupplierPage(supplierInlineSearch?.value || '');
  }
  populateSupplierPaymentSelect(supplierId || supplierDetailsPanel?.dataset.supplierId || '');
  supplierPaymentStandaloneForm?.reset();
  populateSupplierPaymentSelect(supplierId || supplierDetailsPanel?.dataset.supplierId || '');
  supplierPaymentModal?.classList.remove('hidden');
  if (!supplierPaymentSupplier?.value) {
    supplierPaymentSupplier?.focus();
  } else {
    supplierPaymentStandaloneAmount?.focus();
  }
}

function closeSupplierPaymentModal() {
  supplierPaymentModal?.classList.add('hidden');
  supplierPaymentStandaloneForm?.reset();
  updateSupplierPaymentDue();
}

function renderSupplierRow(supplier, index) {
  const purchases = Number(supplier.stats?.totalPurchases || 0);
  const paid = Number(supplier.stats?.totalPaid || 0);
  const due = Number(supplier.currentBalance || supplier.stats?.totalDue || 0);
  const lastPurchase = supplier.stats?.lastPurchaseDate ? new Date(supplier.stats.lastPurchaseDate).toLocaleDateString() : '-';
  const active = supplier.isActive !== false;
  const statusLabel = !active ? 'Inactive' : due > 0 ? 'Overdue' : 'Active';
  const statusClass = !active ? 'inactive' : due > 0 ? 'overdue' : '';
  return `
    <tr>
      <td>${index + 1}</td>
      <td><span class="epos-supplier-avatar">${supplierInitials(supplier.name)}</span><strong>${supplier.name}</strong><span class="epos-supplier-muted">${supplier.address || 'No address'}</span></td>
      <td><strong>${supplier.phone || '-'}</strong><span class="epos-supplier-muted">${getSupplierCity(supplier) || 'Unknown'}</span></td>
      <td>Rs. ${formatMoney(purchases)}</td>
      <td class="epos-supplier-paid">Rs. ${formatMoney(paid)}</td>
      <td class="${due > 0 ? 'epos-supplier-due' : ''}">Rs. ${formatMoney(due)}</td>
      <td class="${due > 0 ? 'epos-supplier-due' : ''}">Rs. ${formatMoney(due > 0 ? due * 0.34 : 0)}</td>
      <td>${lastPurchase}<span class="epos-supplier-muted">${supplier.stats?.lastPurchaseDate ? 'Latest purchase' : 'No purchase'}</span></td>
      <td><span class="epos-supplier-status ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="epos-suppliers-row-actions">
          <button type="button" data-supplier-id="${supplier.id}" title="View supplier">⌾</button>
          <button type="button" data-edit-supplier="${supplier.id}" title="Edit supplier">✎</button>
          <button type="button" data-pay-supplier="${supplier.id}" title="Record payment">▣</button>
          <button type="button" data-delete-supplier="${supplier.id}" title="Delete supplier">×</button>
        </div>
      </td>
    </tr>
  `;
}

function openSupplierEditor(supplier = null) {
  supplierPageForm.reset();
  supplierPageId.value = supplier?.id || '';
  supplierPageName.value = supplier?.name || '';
  supplierPagePhone.value = supplier?.phone || '';
  supplierPageEmail.value = supplier?.email || '';
  supplierPageAddress.value = supplier?.address || '';
  supplierOpeningBalance.value = supplier?.openingBalance || 0;
  supplierOpeningBalance.disabled = Boolean(supplier?.id);
  supplierActive.checked = supplier?.isActive !== false;
  if (supplierEditorTitle) supplierEditorTitle.textContent = supplier?.id ? 'Edit Supplier' : 'New Supplier';
  supplierEditorModal?.classList.remove('hidden');
  supplierPageName.focus();
}

function closeSupplierEditor() {
  supplierEditorModal?.classList.add('hidden');
}

function resetSupplierForm() {
  supplierPageForm.reset();
  supplierPageId.value = '';
  supplierOpeningBalance.disabled = false;
  supplierOpeningBalance.value = '0';
  supplierActive.checked = true;
  openSupplierEditor();
}

function readSupplierForm() {
  return {
    name: supplierPageName.value,
    phone: supplierPagePhone.value,
    email: supplierPageEmail.value,
    address: supplierPageAddress.value,
    openingBalance: supplierOpeningBalance.value,
    isActive: supplierActive.checked
  };
}

/**
 * Select a supplier to make a payment for
 * @param {number} supplierId - The supplier ID
 */
async function selectSupplierForPayment(supplierId) {
  if (!supplierId || supplierId <= 0) {
    showMessage(supplierPageMessage, 'Invalid supplier ID.', 'error');
    return;
  }
  try {
    await openSupplierPaymentModal(supplierId);
    showMessage(supplierPageMessage, 'Supplier selected. Enter payment amount.', 'success');
  } catch (error) {
    showMessage(supplierPageMessage, 'Failed to select supplier.', 'error');
  }
}

/**
 * Make a payment for the selected supplier
 * @param {number} supplierId - The supplier ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethod - Payment method (Cash, Bank, Card)
 * @param {string} notes - Payment notes
 */
async function makeSupplierPayment(supplierId, amount, paymentMethod = 'Cash', notes = '') {
  if (!supplierId || supplierId <= 0) {
    showMessage(supplierPageMessage, 'No supplier selected.', 'error');
    return false;
  }
  const paymentAmount = Number(amount || 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    showMessage(supplierPageMessage, 'Payment amount must be greater than zero.', 'error');
    return false;
  }
  const submitButton = document.querySelector('#supplierPaymentForm button[type="submit"]');
  const restoreButton = setButtonLoading(submitButton, 'Processing...');
  try {
    const result = await window.posApi.suppliers.payment(supplierId, {
      amount: paymentAmount.toString(),
      paymentMethod: String(paymentMethod || 'Cash').trim() || 'Cash',
      notes: String(notes || '').trim()
    });
    if (result.ok) {
      showMessage(supplierPageMessage, 'Payment recorded successfully.', 'success');
      document.querySelector('#supplierPaymentForm')?.reset();
      await Promise.all([
        loadSupplierDetails(supplierId),
        loadSupplierPage(supplierInlineSearch?.value || '')
      ]);
      return true;
    } else {
      showMessage(supplierPageMessage, result.message || 'Payment failed. Please try again.', 'error');
      return false;
    }
  } catch (error) {
    console.error('Payment error:', error);
    showMessage(supplierPageMessage, 'Payment service is not available.', 'error');
    return false;
  } finally {
    restoreButton();
  }
}

/**
 * Cancel the current payment operation
 */
function cancelSupplierPayment() {
  document.querySelector('#supplierPaymentForm')?.reset();
  supplierDetailsPanel.classList.add('hidden');
  supplierDetailsPanel.innerHTML = '';
  delete supplierDetailsPanel.dataset.supplierId;
  showMessage(supplierPageMessage, 'Payment cancelled.', 'info');
}

async function loadSupplierDetails(supplierId) {
  const result = await window.posApi.suppliers.details(supplierId);
  if (!result.ok) {
    supplierDetailsPanel.innerHTML = `<p class="text-red-700">${result.message}</p>`;
    return;
  }
  supplierDetailsPanel.dataset.supplierId = String(result.supplier.id);
  const due = Number(result.supplier.currentBalance || result.supplier.stats?.totalDue || 0);
  const recentPurchases = (result.purchases || []).slice(0, 5);
  supplierDetailsPanel.classList.remove('hidden');
  supplierDetailsPanel.innerHTML = `
    <button type="button" class="epos-suppliers-detail-close" data-close-supplier-details aria-label="Close supplier details">x</button>
    <div class="epos-suppliers-profile">
      <div class="avatar">${supplierInitials(result.supplier.name)}</div>
      <h3>${result.supplier.name}</h3>
      <small>${result.supplier.isActive !== false ? 'Active' : 'Inactive'} supplier</small>
      <div class="mt-2 text-left text-xs font-bold text-zinc-600">
        <p>☎ ${result.supplier.phone || '-'}</p>
        <p>✉ ${result.supplier.email || '-'}</p>
        <p>⌖ ${result.supplier.address || '-'}</p>
      </div>
      <div class="epos-suppliers-mini-grid">
        <div>Total Purchases<strong>Rs. ${formatMoney(result.supplier.stats?.totalPurchases)}</strong></div>
        <div>Total Bills<strong>${recentPurchases.length}</strong></div>
        <div>Total Payments<strong class="epos-supplier-paid">Rs. ${formatMoney(result.supplier.stats?.totalPaid)}</strong></div>
        <div>Last Purchase<strong>${result.supplier.stats?.lastPurchaseDate ? new Date(result.supplier.stats.lastPurchaseDate).toLocaleDateString() : '-'}</strong></div>
        <div>Due Amount<strong class="epos-supplier-due">Rs. ${formatMoney(due)}</strong></div>
        <div>Credit Limit<strong>Rs. 0.00</strong></div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-edit-supplier="${result.supplier.id}" class="epos-btn epos-btn-sm epos-btn-outline">Edit</button>
        <button type="button" data-delete-supplier="${result.supplier.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Delete</button>
      </div>
    </div>
    <div class="epos-suppliers-payment">
      <strong>Record Supplier Payment</strong>
      <form id="supplierPaymentForm">
        <input id="supplierPaymentAmount" type="number" min="0.01" step="0.01" placeholder="Payment amount" required />
        <select id="supplierPaymentMethod"><option>Cash</option><option>Bank</option><option>Card</option></select>
        <input id="supplierPaymentNotes" placeholder="Notes" />
        <button type="submit">Make Payment</button>
      </form>
    </div>
    <div class="epos-suppliers-recent">
      <h3 class="font-black text-blue-700">Recent Purchases</h3>
      ${recentPurchases.map((purchase) => `<div class="epos-suppliers-recent-row">
        <div><strong>${purchase.invoiceNumber || '-'}</strong><span class="epos-supplier-muted">${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : '-'}</span></div>
        <div class="text-right"><strong>Rs. ${formatMoney(purchase.grandTotal)}</strong><span class="epos-supplier-muted">${purchase.status || '-'}</span></div>
      </div>`).join('') || '<p class="text-zinc-500">No purchases yet.</p>'}
    </div>
    <div id="supplierLedgerStatement" class="epos-suppliers-recent">
      <h3 class="font-black text-blue-700">Supplier Ledger</h3>
      ${(result.ledger || []).slice(0, 6).map((entry) => `<div class="epos-suppliers-recent-row">
        <div><strong>${entry.entryType} ${entry.invoiceNumber ? `- ${entry.invoiceNumber}` : ''}</strong><span class="epos-supplier-muted">${entry.notes || '-'} | ${new Date(entry.createdAt).toLocaleString()}</span></div>
        <div class="text-right"><span>Dr ${formatMoney(entry.debit)} Cr ${formatMoney(entry.credit)}</span><strong>Bal ${formatMoney(entry.balance)}</strong></div>
      </div>`).join('') || '<p class="text-zinc-500">No ledger entries.</p>'}
    </div>
  `;
}

function activeSupplierActionId() {
  return Number(supplierDetailsPanel?.dataset.supplierId || supplierPaymentSupplier?.value || 0);
}

async function openSupplierStatement(supplierId) {
  if (!supplierId) {
    showMessage(supplierPageMessage, 'Select a supplier from the table first, then open the supplier statement.', 'error');
    supplierInlineSearch?.focus();
    return;
  }

  const result = await window.posApi.suppliers.details(supplierId);
  if (!result.ok) {
    showMessage(supplierPageMessage, result.message || 'Supplier statement could not be loaded.', 'error');
    return;
  }

  await loadSupplierDetails(supplierId);
  document.querySelectorAll('[data-supplier-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.supplierView === 'statements');
  });
  document.querySelector('#supplierLedgerStatement')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  showMessage(supplierPageMessage, 'Supplier statement loaded from live purchase and ledger records.', 'success');
}

async function deleteSupplier(supplierId) {
  if (!supplierId) return;
  if (!window.confirm('Delete this supplier? Ledger history will remain for audit.')) return;
  const result = await window.posApi.suppliers.delete(supplierId);
  showMessage(supplierPageMessage, result.message || (result.ok ? 'Supplier deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
  if (result.ok) {
    supplierDetailsPanel.innerHTML = '';
    supplierDetailsPanel.classList.add('hidden');
    delete supplierDetailsPanel.dataset.supplierId;
    await loadSupplierPage(supplierInlineSearch?.value || '');
  }
}

async function loadExpensePage() {
  if (!expenseDate.value) expenseDate.value = todayIso();
  if (!expenseFromDate.value) expenseFromDate.value = todayIso();
  if (!expenseToDate.value) expenseToDate.value = todayIso();
  await loadExpenseCategories();
  await loadExpenses();
}

async function loadExpenseCategories() {
  const result = await window.posApi.expenses.listCategories();
  if (!result.ok) {
    showMessage(expenseMessage, result.message || 'Expense categories could not be loaded.');
    return;
  }
  const options = (result.categories || []).map((category) => `<option value="${category.id}">${category.name}</option>`).join('');
  expenseCategory.innerHTML = options;
  expenseCategoryFilter.innerHTML = `<option value="">All categories</option>${options}`;
}

async function loadUsersPage() {
  await loadRolesForSelects();
  await loadUsers();
  renderRoleList();
  renderRolePermissionMap();
}

function showUserAdminTab(tab) {
  userAdminTabs.forEach((button) => {
    const active = button.dataset.userAdminTab === tab;
    button.classList.toggle('active', active);
    button.classList.toggle('epos-btn-primary', active);
    button.classList.toggle('epos-btn-outline', !active);
  });
  userAdminPanels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.userAdminPanel !== tab));
}

function openUserEditor() {
  userEditorModal?.classList.remove('hidden');
}

function closeUserEditor() {
  userEditorModal?.classList.add('hidden');
}

function showUserAdminMessage(text, type = 'success') {
  showMessage(userMessage, text, type);
  if (userEditorModal?.classList.contains('hidden')) {
    window.setTimeout(() => window.alert(text), 0);
  }
}

async function loadRolesForSelects() {
  const result = await window.posApi.roles.list();
  if (!result.ok) {
    showMessage(userMessage, result.message || 'Roles could not be loaded.');
    return;
  }
  currentRoles = result.roles || [];
  const roleOptions = currentRoles.filter((role) => role.isActive).map((role) => `<option value="${role.id}">${role.name}</option>`).join('');
  userRole.innerHTML = roleOptions;
  userRoleFilter.innerHTML = `<option value="">All roles</option>${roleOptions}`;
}

async function loadUsers() {
  clearMessage(userMessage);
  const result = await window.posApi.users.list({
    search: userSearch.value,
    roleId: userRoleFilter.value,
    status: userStatusFilter.value
  });
  if (!result.ok) {
    userTableBody.innerHTML = `<tr><td colspan="11" class="px-3 py-6 text-center text-red-700">${result.message}</td></tr>`;
    return;
  }
  currentUsers = result.users || [];
  updateUserDashboardStats();
  userTableBody.innerHTML = currentUsers.map((user, index) => {
    const initials = String(user.fullName || user.username || 'U')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U';
    const role = user.role || 'Unassigned';
    const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-';
    const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-';
    return `
    <tr>
      <td><input type="checkbox" aria-label="Select ${user.fullName || user.username}" /></td>
      <td>${index + 1}</td>
      <td>
        <div class="epos-users-user-cell">
          <span class="epos-users-avatar">${initials}</span>
          <div><strong>${user.fullName || '-'}</strong><span>${user.username || '-'}</span></div>
        </div>
      </td>
      <td><span class="epos-users-role-pill">${role}</span></td>
      <td>Head Office</td>
      <td>${role === 'Admin' ? 'Management' : role === 'Warehouse' ? 'Inventory' : role === 'Accountant' ? 'Accounts' : 'Sales'}</td>
      <td>${user.phone || '-'}<span class="epos-users-subtext">${user.email || '-'}</span></td>
      <td><span class="epos-users-status-pill ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Online' : 'Offline'}</span></td>
      <td>${lastLogin}</td>
      <td>${created}</td>
      <td>
        <div class="epos-users-row-actions">
          <button type="button" data-edit-user="${user.id}" class="epos-users-icon-action" title="Edit user">E</button>
          <button type="button" data-reset-user="${user.id}" class="epos-users-icon-action warning" title="Reset password">P</button>
          <button type="button" data-toggle-user="${user.id}" data-active="${user.isActive ? 'false' : 'true'}" class="epos-users-icon-action danger" title="${user.isActive ? 'Deactivate user' : 'Activate user'}">${user.isActive ? 'X' : 'A'}</button>
        </div>
      </td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="11" class="px-3 py-6 text-center text-zinc-500">No users found.</td></tr>';
}

function updateUserDashboardStats() {
  const total = currentUsers.length;
  const active = currentUsers.filter((user) => user.isActive).length;
  const inactive = total - active;
  const online = currentUsers.filter((user) => user.isActive && user.lastLoginAt).length;
  const roleCount = currentRoles.filter((role) => role.isActive).length || currentRoles.length;
  const roleCounts = currentUsers.reduce((acc, user) => {
    const role = user.role || 'Others';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  [
    ['#userTotalCount', total],
    ['#userActiveCount', active],
    ['#userInactiveCount', inactive],
    ['#userRoleCount', roleCount],
    ['#userPillAll', total],
    ['#userPillActive', active],
    ['#userPillInactive', inactive],
    ['#userPillOnline', online],
    ['#userSummaryTotal', total]
  ].forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
  const roleSummary = document.querySelector('#userRoleSummary');
  if (roleSummary) {
    roleSummary.innerHTML = Object.entries(roleCounts).map(([role, count]) => `
      <div class="epos-users-role-line"><span>${role}</span><small>${count} user${count === 1 ? '' : 's'}</small></div>
    `).join('') || '<p class="text-xs text-zinc-500">No users found.</p>';
  }
  const roleOverview = document.querySelector('#userRoleOverview');
  if (roleOverview) {
    roleOverview.innerHTML = currentRoles.map((role) => `
      <div class="epos-users-role-line"><span>${role.name}</span><small>${role.userCount} user${Number(role.userCount) === 1 ? '' : 's'}</small></div>
    `).join('') || '<p class="text-xs text-zinc-500">No roles found.</p>';
  }
  const resultSummary = document.querySelector('#userResultSummary');
  if (resultSummary) resultSummary.textContent = `Showing ${total} user${total === 1 ? '' : 's'}`;
}

function resetUserForm() {
  userForm.reset();
  userId.value = '';
  userPassword.placeholder = 'Password for new user';
  userActive.checked = true;
}

function readUserForm() {
  return {
    fullName: userFullName.value,
    username: userUsername.value,
    email: userEmail.value,
    phone: userPhone.value,
    roleId: userRole.value,
    password: userPassword.value,
    isActive: userActive.checked
  };
}

async function loadRolesPage() {
  await loadRolesForSelects();
  renderRoleList();
}

function renderRoleList() {
  const roleMarkup = currentRoles.map((role) => `
    <button type="button" data-role-id="${role.id}">
      <span>${role.name}${role.isSystem ? ' (System)' : ''}</span>
      <small>${role.userCount} user${Number(role.userCount) === 1 ? '' : 's'} | ${role.isActive ? 'Active' : 'Inactive'}</small>
    </button>
  `).join('') || '<p class="p-4 text-zinc-500">No roles.</p>';
  if (roleList) roleList.innerHTML = roleMarkup;
  if (permissionRoleList) permissionRoleList.innerHTML = roleMarkup;
  updateUserDashboardStats();
  renderRolePermissionMap();
}

function resetRoleForm() {
  roleForm.reset();
  roleId.value = '';
  roleActive.checked = true;
}

async function loadRolePermissions(id) {
  selectedRoleId = Number(id);
  const result = await window.posApi.roles.permissions(selectedRoleId);
  if (!result.ok) {
    permissionMatrix.innerHTML = `<p class="text-red-700">${result.message}</p>`;
    return;
  }
  const groups = {};
  for (const permission of result.permissions || []) {
    groups[permission.category] = groups[permission.category] || [];
    groups[permission.category].push(permission);
  }
  permissionMatrix.innerHTML = Object.entries(groups).map(([category, permissions]) => `
    <div class="mb-3 rounded-md border border-zinc-200 p-3">
      <h3 class="font-semibold text-zinc-950">${category}</h3>
      <div class="mt-2 grid gap-2 md:grid-cols-2">
        ${permissions.map((permission) => `<label class="flex items-center gap-2 rounded border border-zinc-100 px-2 py-1"><input type="checkbox" data-permission-id="${permission.id}" ${permission.selected ? 'checked' : ''} /> ${permission.key}</label>`).join('')}
      </div>
    </div>
  `).join('');
  renderRolePermissionMap(result.permissions || []);
}

function renderRolePermissionMap(permissions = []) {
  if (!rolePermissionMap) return;
  const selectedRole = currentRoles.find((role) => Number(role.id) === Number(selectedRoleId));
  if (!selectedRole) {
    rolePermissionMap.innerHTML = currentRoles.map((role) => `
      <div class="epos-users-role-line"><span>${role.name}</span><small>${role.userCount} user${Number(role.userCount) === 1 ? '' : 's'}</small></div>
    `).join('') || '<p class="text-zinc-500">No roles found.</p>';
    return;
  }
  const selectedPermissions = permissions.filter((permission) => permission.selected);
  rolePermissionMap.innerHTML = `
    <div>
      <h3>${selectedRole.name}</h3>
      <p class="mt-1 text-xs text-zinc-500">${selectedPermissions.length} assigned permissions</p>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        ${selectedPermissions.map((permission) => `<label>${permission.category}: ${permission.key}</label>`).join('') || '<p class="text-zinc-500">No permissions assigned.</p>'}
      </div>
    </div>
  `;
}

async function loadUserActivityLog() {
  if (!userActivityLog) return;
  userActivityLog.innerHTML = '<p class="text-zinc-500">Loading activity...</p>';
  const result = await window.posApi.dashboard.overview();
  if (!result.ok) {
    userActivityLog.innerHTML = `<p class="text-red-700">${result.message || 'Activity log could not be loaded.'}</p>`;
    return;
  }
  userActivityLog.innerHTML = (result.recentActivity || [])
    .filter((item) => String(item.action || '').startsWith('users.') || String(item.action || '').startsWith('roles.'))
    .map((item) => `
      <div class="epos-users-role-line">
        <span>${item.action}</span>
        <small>${item.message || item.status || ''} | ${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small>
      </div>
    `).join('') || '<p class="text-zinc-500">No recent user or role activity found.</p>';
}

async function loadExpenses() {
  clearMessage(expenseMessage);
  const result = await window.posApi.expenses.list({
    from: expenseFromDate.value,
    to: expenseToDate.value,
    categoryId: expenseCategoryFilter.value,
    paymentMethod: expensePaymentFilter.value
  });
  if (!result.ok) {
    expenseTableBody.innerHTML = `<tr><td colspan="6" class="px-3 py-6 text-center text-red-700">${result.message}</td></tr>`;
    return;
  }
  currentExpenses = result.expenses || [];
  expenseTotal.textContent = formatMoney(result.summary?.totalExpense);
  expenseTableBody.innerHTML = currentExpenses.map((expense) => `
    <tr>
      <td class="px-3 py-2">${new Date(expense.expenseDate).toLocaleDateString()}</td>
      <td class="px-3 py-2">${expense.categoryName || '-'}</td>
      <td class="px-3 py-2"><p class="font-semibold">${expense.title}</p><p class="text-xs text-zinc-500">${expense.notes || ''}</p></td>
      <td class="px-3 py-2">${formatMoney(expense.amount)}</td>
      <td class="px-3 py-2">${expense.paymentMethod}</td>
      <td class="px-3 py-2">
        <button type="button" data-edit-expense="${expense.id}" class="epos-btn epos-btn-sm epos-btn-outline">Edit</button>
        <button type="button" data-delete-expense="${expense.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Void</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="px-3 py-6 text-center text-zinc-500">No expenses.</td></tr>';
}

function resetExpenseForm() {
  expenseForm.reset();
  expenseId.value = '';
  expenseDate.value = todayIso();
}

function readExpenseForm() {
  return {
    categoryId: expenseCategory.value,
    title: expenseTitle.value,
    amount: expenseAmount.value,
    paymentMethod: expensePaymentMethod.value,
    expenseDate: expenseDate.value,
    notes: expenseNotes.value,
    receiptPath: expenseReceiptPath.value
  };
}

function setPurchaseDateRange(range) {
  const from = document.querySelector('#purchaseFilterFrom');
  const to = document.querySelector('#purchaseFilterTo');
  if (!from || !to) return;
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  if (range === 'yesterday') {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (range === '7' || range === '30') {
    start.setDate(today.getDate() - Number(range) + 1);
  } else if (range === 'month') {
    start.setDate(1);
  } else if (range === 'last-month') {
    start.setMonth(today.getMonth() - 1, 1);
    end.setDate(0);
  } else if (range === 'year') {
    start.setMonth(0, 1);
  }
  from.value = start.toISOString().slice(0, 10);
  to.value = end.toISOString().slice(0, 10);
}

function resetPurchaseListFilters(range = '30') {
  const keyword = document.querySelector('#purchaseKeywordSearch');
  if (keyword) keyword.value = '';
  ['#purchaseSupplierFilter', '#purchaseStatusFilter', '#purchasePaymentFilter'].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.value = '';
  });
  purchaseStatusTab = '';
  document.querySelectorAll('[data-purchase-status-tab]').forEach((button, index) => button.classList.toggle('active', index === 0));
  document.querySelectorAll('[data-purchase-range]').forEach((button) => button.classList.toggle('active', button.dataset.purchaseRange === range));
  setPurchaseDateRange(range);
  purchasePage = 1;
}

async function loadPurchases() {
  const loadId = ++purchaseLoadSequence;
  const listBody = getPurchaseListBody();
  if (listBody) {
    listBody.innerHTML = '<tr><td colspan="12" class="px-4 py-8 text-center text-zinc-500">Loading purchases from database...</td></tr>';
  }
  const loadingWatchdog = window.setTimeout(() => {
    if (loadId !== purchaseLoadSequence) return;
    const activeBody = getPurchaseListBody();
    if (!activeBody?.textContent?.includes('Loading purchases from database')) return;
    currentPurchases = [];
    renderPurchasesPage('Purchase records did not respond in time. Please reopen Purchases or check PostgreSQL connection.');
    showMessage(purchaseMessage, 'Purchase records did not respond in time. Please reopen Purchases or check PostgreSQL connection.');
  }, 5000);
  try {
    const result = await Promise.race([
      window.posApi.purchases.list(),
      new Promise((resolve) => {
        window.setTimeout(() => resolve({
          ok: false,
          message: 'Purchase records are taking too long to load. Please verify PostgreSQL is running and try again.'
        }), 4000);
      })
    ]);
    if (loadId !== purchaseLoadSequence) return;
    window.clearTimeout(loadingWatchdog);
    console.log('Purchases list result:', result);
    if (!result?.ok) {
      currentPurchases = [];
      renderPurchasesPage(result.message || 'Purchases could not be loaded.');
      showMessage(purchaseMessage, result.message || 'Purchases could not be loaded.');
      return;
    }
    currentPurchases = Array.isArray(result.purchases) ? result.purchases : [];
    renderPurchasesPage();
  } catch (error) {
    if (loadId !== purchaseLoadSequence) return;
    window.clearTimeout(loadingWatchdog);
    console.error('Purchase list render error:', error);
    currentPurchases = [];
    renderPurchasesPage('Purchases could not be loaded. Please check the database connection.');
    showMessage(purchaseMessage, 'Purchases could not be loaded. Please check the database connection.');
  }
}

function purchasePaymentStatus(purchase) {
  const grand = Number(purchase.grandTotal || 0);
  const paid = Number(purchase.paidAmount || 0);
  if (grand > 0 && paid >= grand) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

function purchaseStatusLabel(purchase) {
  const paymentStatus = purchasePaymentStatus(purchase);
  if (purchase.status === 'PAID' || paymentStatus === 'PAID') return 'Paid';
  if (purchase.status === 'PARTIAL' || paymentStatus === 'PARTIAL') return 'Partial Paid';
  return 'Pending';
}

function purchaseDueDate(purchase) {
  const date = new Date(purchase.purchaseDate || purchase.createdAt || Date.now());
  date.setDate(date.getDate() + 14);
  return date;
}

function purchaseDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function purchaseInitials(name) {
  return String(name || 'NS').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NS';
}

function getPurchaseFilters() {
  return {
    search: document.querySelector('#purchaseKeywordSearch')?.value.trim().toLowerCase() || '',
    from: document.querySelector('#purchaseFilterFrom')?.value || '',
    to: document.querySelector('#purchaseFilterTo')?.value || '',
    supplierId: document.querySelector('#purchaseSupplierFilter')?.value || '',
    status: document.querySelector('#purchaseStatusFilter')?.value || '',
    payment: document.querySelector('#purchasePaymentFilter')?.value || ''
  };
}

function getPurchaseListBody() {
  return document.querySelector('#purchaseList') || purchaseList;
}

function purchaseHasManualFilters(filters) {
  return Boolean(
    filters.search
    || filters.supplierId
    || filters.status
    || filters.payment
    || purchaseStatusTab
  );
}

function filteredPurchaseRows() {
  const filters = getPurchaseFilters();
  const filtered = currentPurchases.filter((purchase) => {
    const purchaseDate = purchaseDateKey(purchase.purchaseDate || purchase.createdAt);
    const paymentStatus = purchasePaymentStatus(purchase);
    const status = purchaseStatusLabel(purchase).toUpperCase().replaceAll(' ', '_');
    if (filters.search) {
      const haystack = [
        purchase.invoiceNumber,
        purchase.supplierName,
        purchase.purchaseDate,
        purchase.grandTotal,
        purchase.paidAmount,
        purchase.dueAmount,
        purchase.status,
        paymentStatus,
        purchase.productNames
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      if (!haystack.includes(filters.search)) return false;
    }
    if (purchaseStatusTab && !status.includes(purchaseStatusTab) && paymentStatus !== purchaseStatusTab) return false;
    if (filters.from && purchaseDate < filters.from) return false;
    if (filters.to && purchaseDate > filters.to) return false;
    if (filters.supplierId && String(purchase.supplierId || '') !== String(filters.supplierId)) return false;
    if (filters.status && !status.includes(filters.status) && purchase.status !== filters.status) return false;
    if (filters.payment && paymentStatus !== filters.payment) return false;
    return true;
  });

  // The purchases screen opens with a date range selected by default. If that
  // range is stale or the local clock differs, do not make real database rows
  // look deleted; only strict manual filters are allowed to produce an empty
  // table while purchases exist.
  if (!filtered.length && currentPurchases.length && !purchaseHasManualFilters(filters)) {
    return currentPurchases;
  }

  return filtered;
}

function renderPurchasesPage(errorMessage = '') {
  const listBody = getPurchaseListBody();
  filteredPurchases = filteredPurchaseRows();
  const rowsPerPage = Number(document.querySelector('#purchaseRowsPerPage')?.value || 10);
  const pageCount = Math.max(1, Math.ceil(filteredPurchases.length / rowsPerPage));
  purchasePage = Math.min(Math.max(1, purchasePage), pageCount);
  const pageRows = filteredPurchases.slice((purchasePage - 1) * rowsPerPage, purchasePage * rowsPerPage);
  const totals = filteredPurchases.reduce((acc, purchase) => {
    acc.total += Number(purchase.grandTotal || 0);
    acc.paid += Number(purchase.paidAmount || 0);
    acc.due += Number(purchase.dueAmount || 0);
    if (purchasePaymentStatus(purchase) === 'PAID') acc.paidBills += 1;
    if (purchasePaymentStatus(purchase) === 'PARTIAL' || purchasePaymentStatus(purchase) === 'UNPAID') acc.pendingBills += 1;
    if (Number(purchase.dueAmount || 0) > 0) acc.overdueBills += 1;
    return acc;
  }, { total: 0, paid: 0, due: 0, paidBills: 0, pendingBills: 0, overdueBills: 0 });

  setText('#purchaseStatCount', filteredPurchases.length.toLocaleString());
  setText('#purchaseStatSpend', `Rs. ${formatMoney(totals.total)}`);
  setText('#purchaseStatPending', totals.pendingBills.toLocaleString());
  setText('#purchaseStatPendingAmount', `Rs. ${formatMoney(totals.due)}`);
  setText('#purchaseStatPaid', totals.paidBills.toLocaleString());
  setText('#purchaseStatPaidAmount', `Rs. ${formatMoney(totals.paid)}`);
  setText('#purchaseStatOverdue', totals.overdueBills.toLocaleString());
  setText('#purchaseStatOverdueAmount', `Rs. ${formatMoney(totals.due)}`);
  setText('#purchaseFooterCount', filteredPurchases.length.toLocaleString());
  setText('#purchaseFooterTotal', `Rs. ${formatMoney(totals.total)}`);
  setText('#purchaseFooterPaid', `Rs. ${formatMoney(totals.paid)}`);
  setText('#purchaseFooterDue', `Rs. ${formatMoney(totals.due)}`);
  setText('#purchaseCurrentPage', purchasePage);
  setText('#purchasePageInfo', filteredPurchases.length ? `${(purchasePage - 1) * rowsPerPage + 1}-${(purchasePage - 1) * rowsPerPage + pageRows.length} of ${filteredPurchases.length}` : '0-0 of 0');

  if (!listBody) return;

  if (errorMessage) {
    listBody.innerHTML = `<tr><td colspan="12" class="px-4 py-8 text-center text-red-600">${errorMessage}</td></tr>`;
    return;
  }

  listBody.innerHTML = pageRows.map((purchase, index) => {
    const rowNumber = (purchasePage - 1) * rowsPerPage + index + 1;
    const paymentStatus = purchasePaymentStatus(purchase);
    const statusLabel = purchaseStatusLabel(purchase);
    const due = Number(purchase.dueAmount || 0);
    const paid = Number(purchase.paidAmount || 0);
    return `
      <tr>
        <td>${rowNumber}</td>
        <td><button type="button" data-view-purchase="${purchase.id}" class="epos-purchase-invoice">${purchase.invoiceNumber}</button></td>
        <td><span class="epos-purchase-supplier"><b class="epos-purchase-avatar">${purchaseInitials(purchase.supplierName)}</b>${purchase.supplierName || 'No supplier'}</span></td>
        <td>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : '-'}</td>
        <td class="${due > 0 ? 'epos-purchase-overdue' : ''}">${purchaseDueDate(purchase).toLocaleDateString()}</td>
        <td>Rs. ${formatMoney(purchase.grandTotal)}</td>
        <td class="${paid > 0 ? 'epos-purchase-paid' : ''}">Rs. ${formatMoney(paid)}</td>
        <td class="${due > 0 ? 'epos-purchase-due' : ''}">Rs. ${formatMoney(due)}</td>
        <td><span class="epos-purchase-pill payment-${paymentStatus.toLowerCase()} ${paymentStatus.toLowerCase()}">${paymentStatus === 'PAID' ? 'Paid' : paymentStatus === 'PARTIAL' ? 'Partial' : 'Unpaid'}</span></td>
        <td><span class="epos-purchase-pill status-${statusLabel.toLowerCase().replaceAll(' ', '-')} ${statusLabel.toLowerCase().replaceAll(' ', '-')}">${statusLabel}</span></td>
        <td>${paid > 0 ? '<span class="epos-purchase-method cash">Cash</span>' : '-'}</td>
        <td><div class="epos-purchase-actions"><button type="button" data-view-purchase="${purchase.id}" title="View purchase">&#128065;</button><button type="button" data-edit-purchase="${purchase.id}" title="Review purchase for editing">&#9998;</button><button type="button" data-delete-purchase="${purchase.id}" title="Delete purchase">&#128465;</button></div></td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="12" class="px-4 py-8 text-center text-zinc-500">${
    currentPurchases.length
      ? 'No purchases match the selected filters. Clear filters to show all database purchases.'
      : 'No purchases found in the database. Add a purchase to create the first record.'
  }</td></tr>`;
}

async function showPurchaseDetails(purchaseId, mode = 'view') {
  const result = await window.posApi.purchases.details(purchaseId);
  if (!result.ok) {
    showMessage(purchaseMessage, result.message || 'Purchase details could not be loaded.');
    return;
  }
  const purchase = result.purchase;
  const itemText = (purchase.items || [])
    .map((item) => `${item.productName} x ${item.quantity} @ Rs. ${formatMoney(item.purchasePrice)}`)
    .join(', ') || 'No items';
  const prefix = mode === 'edit'
    ? 'Purchase loaded for review. Posted purchase editing is locked to protect stock and ledger integrity.'
    : 'Purchase details loaded.';
  showMessage(
    purchaseMessage,
    `${prefix} ${purchase.invoiceNumber}: ${itemText}`,
    mode === 'edit' ? 'success' : 'success'
  );
}

async function deletePurchaseFromPage(purchaseId) {
  const purchase = currentPurchases.find((item) => Number(item.id) === Number(purchaseId));
  const label = purchase?.invoiceNumber || `#${purchaseId}`;
  if (!window.confirm(`Delete purchase ${label}? Stock and supplier ledger will be reversed if safe.`)) return;
  const result = await window.posApi.purchases.delete(purchaseId);
  showMessage(purchaseMessage, result.message || (result.ok ? 'Purchase deleted.' : 'Purchase delete failed.'), result.ok ? 'success' : 'error');
  if (result.ok) {
    await Promise.all([loadPurchases(), loadInventory(), loadSuppliers(), loadSupplierPage(supplierInlineSearch?.value || ''), loadDashboardStats()]);
  }
}

async function loadPurchaseOrders() {
  clearMessage(poMessage);
  const result = await window.posApi.purchaseOrders.list({
    search: poSearch.value,
    status: poStatusFilter.value,
    fromDate: poFromDate.value,
    toDate: poToDate.value
  });
  if (!result.ok) {
    poList.innerHTML = `<p class="p-4 text-red-700">${result.message}</p>`;
    return;
  }
  currentPurchaseOrders = result.orders || [];
  poList.innerHTML = currentPurchaseOrders.map((order) => `
    <div class="p-3">
      <div class="flex items-start justify-between gap-3">
        <button type="button" data-po-id="${order.id}" class="min-w-0 text-left">
          <p class="font-semibold text-zinc-950">${order.poNumber} - ${order.supplierName}</p>
          <p class="mt-1 text-xs text-zinc-500">Expected ${order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : '-'} | Ordered ${order.orderedTotal} | Received ${order.receivedTotal}</p>
        </button>
        <span class="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">${order.status.replaceAll('_', ' ')}</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" data-po-id="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline">View</button>
        <button type="button" data-approve-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${['DRAFT', 'PENDING', 'PENDING_APPROVAL'].includes(order.status) && result.permissions?.canApprove ? '' : 'disabled'}>Approve</button>
        <button type="button" data-send-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${order.status === 'APPROVED' && result.permissions?.canApprove ? '' : 'disabled'}>Send</button>
        <button type="button" data-confirm-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${['APPROVED', 'SENT_TO_SUPPLIER'].includes(order.status) && result.permissions?.canApprove ? '' : 'disabled'}>Confirm</button>
        <button type="button" data-receive-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-primary" ${['APPROVED', 'SENT_TO_SUPPLIER', 'SUPPLIER_CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status) && result.permissions?.canReceive ? '' : 'disabled'}>Receive</button>
        <button type="button" data-cancel-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline" ${!['FULLY_RECEIVED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(order.status) && result.permissions?.canApprove ? '' : 'disabled'}>Cancel</button>
      </div>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No purchase orders.</p>';
  if (poPriorOrder) poPriorOrder.innerHTML = '<option value="">Select Prior PO</option>' + currentPurchaseOrders.map((order) => `<option value="${order.id}">${order.poNumber}</option>`).join('');
}

async function loadPurchaseOrderPageData() {
  if (!window.posApi.purchaseOrders?.pageData) return;
  const result = await window.posApi.purchaseOrders.pageData();
  if (!result.ok) {
    showMessage(poMessage, result.message || 'Purchase order data could not be loaded.', 'error');
    return;
  }
  currentPoPageData = result;
  if (poStatTotal) poStatTotal.textContent = Number(result.stats?.totalPOs || 0).toLocaleString();
  if (poStatPending) poStatPending.textContent = Number(result.stats?.pendingPOs || 0).toLocaleString();
  if (poStatGrn) poStatGrn.textContent = Number(result.stats?.grnCompleted || 0).toLocaleString();
  if (poStatSpent) poStatSpent.textContent = `PKR ${formatMoney(result.stats?.totalSpent || 0)}`;
  if (poCartCount) poCartCount.textContent = Number(result.stats?.pendingPOs || 0).toLocaleString();
  if (poNotifyCount) poNotifyCount.textContent = Number(result.stats?.grnCompleted || 0).toLocaleString();
  if (poNumberInput && !poNumberInput.value) poNumberInput.value = result.nextNumber || '';
  if (poDate && !poDate.value) poDate.value = new Date().toISOString().slice(0, 10);
  if (poWarehouse) {
    poWarehouse.innerHTML = (result.warehouses || []).map((warehouse) => `<option value="${warehouse.id}">${warehouse.name}</option>`).join('');
  }
  renderPoRecentSuppliers();
}

function selectedPoSupplier() {
  return currentSuppliers.find((supplier) => Number(supplier.id) === Number(poSupplier?.value));
}

function syncPoSupplierDetails() {
  const supplier = selectedPoSupplier();
  if (poContactPerson) poContactPerson.value = supplier?.name || '';
  if (poSupplierEmail) poSupplierEmail.value = supplier?.email || '';
}

function renderPoRecentSuppliers() {
  if (!poRecentSuppliers) return;
  poRecentSuppliers.innerHTML = currentSuppliers.slice(0, 3).map((supplier) => {
    const initials = String(supplier.name || 'S').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return `<div class="epos-po-recent-row"><span>${initials}</span><div><strong>${supplier.name}</strong><small>${supplier.address || supplier.phone || 'Supplier'}</small></div><button type="button" data-call-supplier="${supplier.id}" title="Supplier phone">☎</button></div>`;
  }).join('') || '<p class="text-zinc-500">No suppliers.</p>';
}

async function loadRequisitions() {
  if (!window.posApi.purchaseOrders?.listRequisitions || !requisitionList) return;
  const result = await window.posApi.purchaseOrders.listRequisitions({ status: reqStatusFilter?.value || '' });
  if (!result.ok) {
    requisitionList.innerHTML = `<p class="p-4 text-red-700">${result.message}</p>`;
    return;
  }
  currentRequisitions = result.requisitions || [];
  requisitionList.innerHTML = currentRequisitions.map((requisition) => `
    <div class="p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="font-semibold text-zinc-950">${requisition.requisitionNumber}</p>
          <p class="text-xs text-zinc-500">${requisition.department || 'No department'} | ${requisition.priority} | ${requisition.totalQuantity} qty</p>
        </div>
        <span class="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">${requisition.status.replaceAll('_', ' ')}</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" data-submit-req="${requisition.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${requisition.status === 'DRAFT' ? '' : 'disabled'}>Submit</button>
        <button type="button" data-approve-req="${requisition.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${requisition.status === 'SUBMITTED' && result.permissions?.canApprove ? '' : 'disabled'}>Approve</button>
        <button type="button" data-reject-req="${requisition.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline" ${requisition.status === 'SUBMITTED' && result.permissions?.canApprove ? '' : 'disabled'}>Reject</button>
        <button type="button" data-convert-req="${requisition.id}" class="epos-btn epos-btn-sm epos-btn-primary" ${requisition.status === 'APPROVED' && result.permissions?.canCreate ? '' : 'disabled'}>Convert to PO</button>
      </div>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No purchase requisitions.</p>';
}

function renderRequisitionItems() {
  reqItemsList.innerHTML = requisitionItems.map((item, index) => `
    <div class="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-2">
      <span>${item.productName}<br/><small>${item.requiredQty} requested</small></span>
      <button type="button" data-remove-req-item="${index}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Remove</button>
    </div>
  `).join('') || '<p class="text-zinc-500">No requisition items added.</p>';
}

function resetRequisitionForm() {
  requisitionForm?.reset();
  requisitionItems = [];
  if (reqDate) reqDate.value = new Date().toISOString().slice(0, 10);
  renderRequisitionItems();
}

function renderPoItems() {
  poItems = poItems.map((item) => {
    const orderedQty = Number(item.orderedQty || 0);
    const cost = Number(item.cost || 0);
    const gross = Number((orderedQty * cost).toFixed(2));
    const discountPercent = Number(item.discountPercent || 0);
    const taxPercent = Number(item.taxPercent || 0);
    const discountAmount = Number((gross * discountPercent / 100).toFixed(2));
    const taxable = Number((gross - discountAmount).toFixed(2));
    const taxAmount = Number((taxable * taxPercent / 100).toFixed(2));
    return { ...item, discountAmount, taxAmount, total: Number((taxable + taxAmount).toFixed(2)) };
  });
  const subtotal = poItems.reduce((sum, item) => sum + Number(item.orderedQty || 0) * Number(item.cost || 0), 0);
  const lineDiscount = poItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
  const lineTax = poItems.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
  const discount = Number(poDiscount.value || 0);
  const tax = Number(poTax.value || 0);
  const shipping = Number(poShippingCharges?.value || 0);
  const totalDiscount = Number((lineDiscount + discount).toFixed(2));
  const taxable = Math.max(0, Number((subtotal - totalDiscount).toFixed(2)));
  const totalTax = Number((lineTax + tax).toFixed(2));
  const total = Number((taxable + totalTax + shipping).toFixed(2));
  const totalQty = poItems.reduce((sum, item) => sum + Number(item.orderedQty || 0), 0);
  if (poTotals) {
    poTotals.innerHTML = `<span>Total Qty:<strong>${totalQty.toFixed(2)}</strong></span><span>Discount Amount:<strong class="text-emerald-600">${formatMoney(totalDiscount)}</strong></span><span>Total Amount:<strong class="text-emerald-600">${formatMoney(total)}</strong></span>`;
  }
  if (poItemsList) {
    poItemsList.innerHTML = poItems.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.productName || '-'}<br><small>${item.sku || ''}</small></td>
        <td>${item.barcode || '-'}</td>
        <td>${item.hsn || '-'}</td>
        <td>${item.unit || '-'}</td>
        <td><input data-po-row-field="orderedQty" data-po-row="${index}" type="number" min="0.001" step="0.001" value="${item.orderedQty}" /></td>
        <td><input data-po-row-field="cost" data-po-row="${index}" type="number" min="0" step="0.01" value="${item.cost}" /></td>
        <td><input data-po-row-field="discountPercent" data-po-row="${index}" type="number" min="0" step="0.01" value="${item.discountPercent || 0}" /></td>
        <td>${formatMoney(item.discountAmount)}</td>
        <td><input data-po-row-field="taxPercent" data-po-row="${index}" type="number" min="0" step="0.01" value="${item.taxPercent || 0}" /></td>
        <td>${formatMoney(item.total)}</td>
        <td><button type="button" data-edit-po-item="${index}" class="epos-po-row-action edit">✎</button><button type="button" data-remove-po-item="${index}" class="epos-po-row-action delete">🗑</button></td>
      </tr>
    `).join('') || '<tr><td colspan="12" class="text-center text-zinc-500">No PO items added.</td></tr>';
  }
  if (poSummaryItems) poSummaryItems.textContent = poItems.length;
  if (poSummaryItemsTotal) poSummaryItemsTotal.textContent = `PKR ${formatMoney(subtotal)}`;
  if (poSummaryDiscount) poSummaryDiscount.textContent = `PKR ${formatMoney(totalDiscount)}`;
  if (poSummaryTaxable) poSummaryTaxable.textContent = `PKR ${formatMoney(taxable)}`;
  if (poSummaryTax) poSummaryTax.textContent = `PKR ${formatMoney(totalTax)}`;
  if (poSummaryShipping) poSummaryShipping.textContent = `PKR ${formatMoney(shipping)}`;
  if (poSummaryTotal) poSummaryTotal.textContent = `PKR ${formatMoney(total)}`;
}

function resetPoForm() {
  poForm.reset();
  poItems = [];
  poDiscount.value = '0';
  poTax.value = '0';
  if (poShippingCharges) poShippingCharges.value = '0';
  if (poDate) poDate.value = new Date().toISOString().slice(0, 10);
  if (poNumberInput) poNumberInput.value = currentPoPageData.nextNumber || '';
  poDetailsPanel.textContent = 'Select a PO to view details and receive goods.';
  renderPoItems();
}

async function savePurchaseOrderWithStatus(status, button) {
  if (!poSupplier?.value) {
    showMessage(poMessage, 'Supplier is required.', 'error');
    return null;
  }
  if (!poNumberInput?.value?.trim()) {
    showMessage(poMessage, 'PO number is required.', 'error');
    return null;
  }
  if (!poWarehouse?.value) {
    showMessage(poMessage, 'Warehouse is required.', 'error');
    return null;
  }
  if (!poItems.length) {
    showMessage(poMessage, 'At least one product item is required.', 'error');
    return null;
  }
  const restoreButton = button ? setButtonLoading(button, 'Saving...') : () => {};
  try {
    const result = await window.posApi.purchaseOrders.create({
      poNumber: poNumberInput.value,
      supplierId: poSupplier.value,
      expectedDate: poExpectedDate.value,
      discount: poDiscount.value,
      tax: poTax.value,
      status,
      notes: [poNotes?.value, poReference?.value ? `Reference: ${poReference.value}` : '', poShippingCharges?.value ? `Shipping: ${poShippingCharges.value}` : ''].filter(Boolean).join('\n'),
      items: poItems
    });
    showMessage(poMessage, result.message || (result.ok ? 'PO saved.' : 'PO failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetPoForm();
      await Promise.all([loadPurchaseOrders(), loadPurchaseOrderPageData()]);
      await loadPoDetails(result.order.id);
    }
    return result;
  } catch (error) {
    showMessage(poMessage, 'Purchase order service is not available.', 'error');
    return null;
  } finally {
    restoreButton();
  }
}

async function loadPoDetails(orderId, receiving = false) {
  const result = await window.posApi.purchaseOrders.details(orderId);
  if (!result.ok) {
    poDetailsPanel.innerHTML = `<p class="text-red-700">${result.message}</p>`;
    return;
  }
  const order = result.order;
  poDetailsPanel.dataset.poId = String(order.id);
  const timeline = ['Requisition', 'PO', 'Approval', 'Supplier', 'Receiving', 'Invoice', 'Payment'];
  const activeSteps = {
    Requisition: Boolean(order.requisitionId),
    PO: true,
    Approval: !['DRAFT', 'PENDING', 'PENDING_APPROVAL'].includes(order.status),
    Supplier: ['SENT_TO_SUPPLIER', 'SUPPLIER_CONFIRMED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'INVOICED', 'CLOSED'].includes(order.status),
    Receiving: ['PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'INVOICED', 'CLOSED'].includes(order.status),
    Invoice: ['INVOICED', 'CLOSED'].includes(order.status),
    Payment: ['INVOICED', 'CLOSED'].includes(order.status)
  };
  poDetailsPanel.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="font-semibold text-zinc-950">${order.poNumber}</p>
        <p class="text-xs text-zinc-500">${order.supplierName} | ${order.status.replaceAll('_', ' ')}${order.requisitionNumber ? ` | ${order.requisitionNumber}` : ''}</p>
      </div>
      <strong>${formatMoney(order.total)}</strong>
    </div>
    <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold">
      ${timeline.map((step) => `<span class="rounded-full px-2 py-1 ${activeSteps[step] ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}">${step}</span>`).join('')}
    </div>
    <div class="mt-3 grid gap-2 sm:grid-cols-3">
      <button type="button" data-panel-send-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${order.status === 'APPROVED' ? '' : 'disabled'}>Mark Sent</button>
      <button type="button" data-panel-confirm-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-outline" ${['APPROVED', 'SENT_TO_SUPPLIER'].includes(order.status) ? '' : 'disabled'}>Supplier Confirm</button>
      <button type="button" data-panel-receive-po="${order.id}" class="epos-btn epos-btn-sm epos-btn-primary" ${['APPROVED', 'SENT_TO_SUPPLIER', 'SUPPLIER_CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status) ? '' : 'disabled'}>Receive Goods</button>
    </div>
    <div class="mt-3 overflow-auto">
      <table class="min-w-full text-left text-xs">
        <thead class="bg-zinc-50 text-zinc-500"><tr><th class="px-2 py-2">Product</th><th class="px-2 py-2">Ordered</th><th class="px-2 py-2">Received</th><th class="px-2 py-2">Receive</th><th class="px-2 py-2">Damaged</th><th class="px-2 py-2">Rejected</th></tr></thead>
        <tbody>${order.items.map((item) => `<tr class="border-t border-zinc-100"><td class="px-2 py-2">${item.productName}<br/>${item.sku || ''}</td><td class="px-2 py-2">${item.orderedQty}</td><td class="px-2 py-2">${item.receivedQty}</td><td class="px-2 py-2"><input data-receive-item="${item.id}" data-max="${item.remainingQty}" type="number" min="0" max="${item.remainingQty}" step="0.001" value="${receiving ? item.remainingQty : 0}" class="w-20 rounded border border-zinc-300 px-2 py-1" ${item.remainingQty <= 0 ? 'disabled' : ''} /></td><td class="px-2 py-2"><input data-damaged-item="${item.id}" type="number" min="0" step="0.001" value="0" class="w-20 rounded border border-zinc-300 px-2 py-1" ${receiving ? '' : 'disabled'} /></td><td class="px-2 py-2"><input data-rejected-item="${item.id}" type="number" min="0" step="0.001" value="0" class="w-20 rounded border border-zinc-300 px-2 py-1" ${receiving ? '' : 'disabled'} /></td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${receiving ? `<div class="mt-3 grid gap-2 sm:grid-cols-3">
      <input id="poReceiveDiscount" type="number" min="0" step="0.01" value="0" class="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Discount" />
      <input id="poReceiveTax" type="number" min="0" step="0.01" value="0" class="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Tax" />
      <textarea id="poReceiveNotes" class="min-h-16 rounded-md border border-zinc-300 px-3 py-2 text-sm sm:col-span-3" placeholder="Receiving notes"></textarea>
      <button type="button" data-submit-receive-po="${order.id}" class="epos-btn epos-btn-primary sm:col-span-3">Save Goods Receipt</button>
    </div>` : ''}
    <h3 class="mt-4 font-semibold text-zinc-950">Goods Receipts</h3>
    <div class="mt-2 space-y-2">${(order.receipts || []).map((receipt) => `<div class="rounded border border-zinc-200 p-2"><div class="flex items-center justify-between gap-2"><span><strong>${receipt.receiptNumber}</strong><br/><small>${formatMoney(receipt.total)} | ${new Date(receipt.receivedAt).toLocaleString()}</small></span>${receipt.purchaseId ? '<span class="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Invoiced</span>' : `<button type="button" data-create-po-invoice="${receipt.id}" class="epos-btn epos-btn-sm epos-btn-primary">Create Invoice</button>`}</div></div>`).join('') || '<p class="text-zinc-500">No receipts yet.</p>'}</div>
  `;
  poDetailsPanel.dataset.order = JSON.stringify(order);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  if (!rows.length) return false;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return true;
}

function printRows(title, rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const html = `
    <html><head><title>${title}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:18px;color:#111}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px;text-align:left}
      th{background:#f4f4f5}
    </style></head><body>
      <h2>${title}</h2>
      <table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${row[header] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;
  const printWindow = window.open('', '_blank', 'width=1000,height=700');
  if (!printWindow) return false;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

function datasetForPage(page) {
  if (page === 'products') {
    return currentProducts.map((product) => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.categoryName || '',
      brand: product.brandName || '',
      unit: product.unitName || '',
      purchasePrice: product.purchasePrice,
      salePrice: product.salePrice,
      stock: product.currentStock,
      status: product.isActive ? 'Active' : 'Inactive'
    }));
  }
  if (page === 'inventory') {
    return currentInventory.map((item) => ({
      product: item.name,
      sku: item.sku,
      barcode: item.barcode,
      category: item.categoryName || '',
      stock: item.currentStock,
      minStock: item.minStockLevel,
      status: item.stockStatus,
      lastMovement: item.lastMovementAt ? new Date(item.lastMovementAt).toLocaleString() : ''
    }));
  }
  if (page === 'purchases') {
    return currentPurchases.map((purchase) => ({
      invoice: purchase.invoiceNumber,
      supplier: purchase.supplierName || '',
      total: purchase.grandTotal,
      paid: purchase.paidAmount,
      due: purchase.dueAmount,
      status: purchase.status,
      createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleString() : ''
    }));
  }
  if (page === 'customers') {
    const customers = JSON.parse(customerPageList.dataset.customers || '[]');
    return customers.map((customer) => ({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      creditLimit: customer.creditLimit,
      due: customer.currentBalance,
      active: customer.isActive ? 'Active' : 'Inactive'
    }));
  }
  if (page === 'users') {
    return currentUsers.map((user) => ({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone || '',
      role: user.role || '',
      status: user.isActive ? 'Active' : 'Inactive',
      lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '',
      createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString() : ''
    }));
  }
  if (page === 'dashboard') {
    return [
      { metric: 'Today Sales', value: document.querySelector('#dashboardTodaySales')?.textContent || '' },
      { metric: 'Total Profit', value: document.querySelector('#dashboardProfitTotal')?.textContent || '' },
      { metric: 'Total Orders', value: document.querySelector('#dashboardOrderCount')?.textContent || '' },
      { metric: 'Low Stock Items', value: document.querySelector('#dashboardLowStockCount')?.textContent || '' },
      { metric: 'Stock Value', value: document.querySelector('#dashboardStockValue')?.textContent || '' },
      { metric: 'Due Purchases', value: document.querySelector('#dashboardPurchaseTotal')?.textContent || '' },
      { metric: 'Due Receivables', value: document.querySelector('#dashboardReceivableTotal')?.textContent || '' }
    ];
  }
  return [];
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  const headers = headerLine.split(',').map((header) => header.trim());
  return lines.map((line) => {
    const values = line.split(',').map((value) => value.trim());
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || '' }), {});
  });
}

function selectCsvFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : '');
    }, { once: true });
    input.click();
  });
}

async function importPageData(page) {
  const csv = await selectCsvFile();
  const rows = parseCsv(csv);
  if (!rows.length) return { ok: false, message: 'No rows found in import file.' };
  if (page === 'products') {
    let saved = 0;
    for (const row of rows) {
      const result = await window.posApi.products.create({
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        purchasePrice: row.purchasePrice || 0,
        salePrice: row.salePrice || 0,
        wholesalePrice: row.wholesalePrice || 0,
        minStockLevel: row.minStockLevel || 0,
        currentStock: row.currentStock || 0,
        isActive: row.isActive !== 'false'
      });
      if (result.ok) saved += 1;
    }
    await Promise.all([loadProducts(), loadInventory()]);
    return { ok: true, message: `${saved} product row(s) imported.` };
  }
  if (page === 'customers') {
    let saved = 0;
    for (const row of rows) {
      const result = await window.posApi.customers.create({
        name: row.name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        openingBalance: row.openingBalance || 0,
        creditLimit: row.creditLimit || 0,
        isActive: true
      });
      if (result.ok) saved += 1;
    }
    await loadCustomerPage(customerPageSearch.value);
    return { ok: true, message: `${saved} customer row(s) imported.` };
  }
  return { ok: false, message: 'Import foundation is enabled here for export/print review. Use the module forms for transaction-safe imports.' };
}

async function handlePageTool(page, action) {
  const rows = datasetForPage(page);
  const target = page === 'products' ? productMessage : page === 'inventory' ? inventoryMessage : page === 'purchases' ? purchaseMessage : page === 'users' ? document.querySelector('#userToolbarMessage') : customerPageMessage;
  if (action === 'import') {
    const result = await importPageData(page);
    showMessage(target, result.message, result.ok ? 'success' : 'error');
    return;
  }
  if (!rows.length) {
    showMessage(target, 'No database records available for this action.');
    return;
  }
  if (action === 'excel') {
    downloadCsv(`${page}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    showMessage(target, 'Excel-compatible CSV export created from database records.', 'success');
  } else if (action === 'pdf') {
    printRows(`${page.toUpperCase()} PDF Export`, rows);
    showMessage(target, 'PDF export foundation opened. Choose Save as PDF in the print dialog.', 'success');
  } else if (action === 'print') {
    printRows(`${page.toUpperCase()} Print`, rows);
    showMessage(target, 'Print preview opened.', 'success');
  }
}

function renderPurchaseItems() {
  if (!purchaseItemsList || !purchaseTotals) return;
  const subtotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);
  const discount = Number(purchaseDiscount?.value || 0);
  const tax = Number(purchaseTax?.value || 0);
  const paid = Number(purchasePaid?.value || 0);
  const grand = subtotal - discount + tax;
  purchaseItemsList.innerHTML = purchaseItems.map((item, index) => `
    <div>
      <span><strong>${item.name}</strong> | Qty ${item.quantity} | Cost ${formatMoney(item.purchasePrice)} | Sale ${formatMoney(item.salePrice)} | Total ${formatMoney(item.total)}</span>
      <button type="button" data-remove-purchase-item="${index}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Remove</button>
    </div>
  `).join('') || '<p class="text-zinc-500">No items added.</p>';
  purchaseTotals.innerHTML = `Subtotal <strong>Rs. ${formatMoney(subtotal)}</strong> | Discount <strong>Rs. ${formatMoney(discount)}</strong> | Tax <strong>Rs. ${formatMoney(tax)}</strong> | Grand <strong>Rs. ${formatMoney(grand)}</strong> | Due <strong>Rs. ${formatMoney(Math.max(grand - paid, 0))}</strong>`;
}

function resetPurchaseEntryForm() {
  purchaseForm?.reset();
  if (purchaseDate) purchaseDate.value = new Date().toISOString().slice(0, 10);
  purchaseItems = [];
  renderPurchaseItems();
}

async function openPurchaseEntryModal(prefillSupplierId = '') {
  await navigateTo('/purchases');
  resetPurchaseEntryForm();
  if (purchaseSupplier && prefillSupplierId) {
    purchaseSupplier.value = String(prefillSupplierId);
  }
  document.querySelector('#purchaseFormModal')?.classList.remove('hidden');
  purchaseInvoice?.focus();
}

function cartTotals() {
  const subtotal = Number(cartItems.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const discountType = document.querySelector('#posDiscountType')?.value || 'amount';
  const discountInput = Number(cartDiscount.value || 0);
  const discount = discountType === 'percentage'
    ? Number((subtotal * Math.min(Math.max(discountInput, 0), 100) / 100).toFixed(2))
    : Math.min(Math.max(discountInput, 0), subtotal);
  const tax = Number(cartTax.value || 0);
  const grandTotal = Number((subtotal - discount + tax).toFixed(2));
  const paid = Number(paidAmount.value || 0);
  return {
    subtotal,
    discount,
    tax,
    grandTotal: Math.max(grandTotal, 0),
    paid,
    change: Math.max(Number((paid - Math.max(grandTotal, 0)).toFixed(2)), 0)
  };
}

function currentCartDiscountAmount() {
  return cartTotals().discount;
}

function validatePaymentBeforeSubmit() {
  if (cartItems.length === 0) {
    return 'Cart is empty.';
  }
  const totals = cartTotals();
  if (![totals.subtotal, totals.discount, totals.tax, totals.grandTotal, totals.paid].every(Number.isFinite)) {
    return 'Billing totals contain an invalid number.';
  }
  if (totals.discount > totals.subtotal) {
    return 'Cart discount cannot exceed subtotal.';
  }
  if (totals.paid < totals.grandTotal && paymentMethod.value !== 'Credit') {
    return 'Paid amount cannot be less than grand total unless payment method is Credit.';
  }
  if (paymentMethod.value === 'Credit') {
    const customer = selectedCustomer();
    if (!customer || customer.isWalkIn) return 'Credit sale requires a real customer.';
    const nextDue = Number(customer.currentBalance || 0) + Math.max(Number((totals.grandTotal - totals.paid).toFixed(2)), 0);
    const creditLimit = Number(customer.creditLimit || 0);
    if (creditLimit > 0 && nextDue > creditLimit) return 'Customer credit limit exceeded.';
  }
  return null;
}

function recalcCartItem(item) {
  const gross = Number((item.quantity * item.unitPrice).toFixed(2));
  item.discount = Math.min(Number(item.discount || 0), gross);
  item.total = Number((gross - item.discount).toFixed(2));
}

function clearPosSearchField() {
  if (posBarcodeInput) posBarcodeInput.value = '';
  if (posSearchResults) {
    posSearchResults.innerHTML = '';
    posSearchResults.dataset.products = '[]';
  }
}

function addProductToCart(product) {
  if (!product?.isActive) {
    showMessage(posMessage, 'Inactive product cannot be sold.');
    return;
  }
  if (Number(product.currentStock) <= 0) {
    showMessage(posMessage, 'Product is out of stock.');
    return;
  }
  const existing = cartItems.find((item) => Number(item.productId) === Number(product.id));
  if (existing) {
    if (existing.quantity + 1 > Number(existing.currentStock)) {
      showMessage(posMessage, 'Insufficient stock.');
      return;
    }
    existing.quantity += 1;
    recalcCartItem(existing);
  } else {
    const unitPrice = posPriceMode === 'wholesale'
      ? Number(product.wholesalePrice || product.salePrice)
      : Number(product.salePrice);
    cartItems.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      quantity: 1,
      unitPrice,
      discount: 0,
      currentStock: Number(product.currentStock),
      total: unitPrice
    });
  }
  clearMessage(posMessage);
  clearPosSearchField();
  renderCart();
}

function renderCart() {
  cartEmptyState.classList.toggle('hidden', cartItems.length > 0);
  cartTableBody.innerHTML = cartItems.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.barcode || '-'}</td>
      <td>
        <p class="font-semibold text-zinc-950">${item.name}</p>
        <p class="text-xs text-zinc-500">${item.sku} | Stock ${item.currentStock}</p>
      </td>
      <td>${item.currentStock}</td>
      <td>
        <div class="epos-cart-qty">
          <button type="button" data-cart-action="dec" data-index="${index}">-</button>
          <input data-cart-field="quantity" data-index="${index}" type="number" min="0.001" step="0.001" value="${item.quantity}" />
          <button type="button" data-cart-action="inc" data-index="${index}">+</button>
        </div>
      </td>
      <td>${formatMoney(item.unitPrice)}</td>
      <td><input data-cart-field="discount" data-index="${index}" type="number" min="0" step="0.01" value="${item.discount}" class="epos-cart-discount" /></td>
      <td class="font-semibold">${formatMoney(item.total)}</td>
      <td><button type="button" data-cart-action="remove" data-index="${index}" class="epos-cart-remove">X</button></td>
    </tr>
  `).join('');
  const totals = cartTotals();
  posSubtotal.textContent = `PKR ${formatMoney(totals.subtotal)}`;
  posGrandTotal.textContent = `PKR ${formatMoney(totals.grandTotal)}`;
  changeAmount.textContent = formatMoney(totals.change);
  document.querySelector('#posCartCountLabel') && (document.querySelector('#posCartCountLabel').textContent = `(${cartItems.length} Items)`);
  document.querySelector('#posTotalItems') && (document.querySelector('#posTotalItems').textContent = Number(cartItems.length).toLocaleString());
  document.querySelector('#posTotalQuantity') && (document.querySelector('#posTotalQuantity').textContent = Number(cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toFixed(3)).toLocaleString());
  document.querySelector('#posPayButtonAmount') && (document.querySelector('#posPayButtonAmount').textContent = `Rs. ${formatMoney(totals.grandTotal)}`);
}

async function searchPosProducts(search) {
  const result = await window.posApi.pos.searchProducts({ search, categoryId: posCategoryId });
  if (!result.ok) {
    showMessage(posMessage, result.message || 'Product search failed.');
    return;
  }
  if (!posSearchResults) return result.products || [];
  posSearchResults.innerHTML = (result.products || []).map((product) => `
    <button type="button" data-pos-product="${product.id}" class="epos-billing-product-card">
      <p class="epos-billing-product-name">${product.name}</p>
      <p class="epos-billing-product-meta">${product.sku} | ${product.barcode} | ${product.currentStock} stock</p>
      <p class="epos-billing-product-price">PKR ${formatMoney(posPriceMode === 'wholesale' ? product.wholesalePrice || product.salePrice : product.salePrice)}</p>
    </button>
  `).join('') || '<div class="px-4 py-6 text-center text-zinc-500">No products found.</div>';
  posSearchResults.dataset.products = JSON.stringify(result.products || []);
  return result.products || [];
}

async function scanBarcode(barcode) {
  const cleanBarcode = String(barcode || '').trim();
  if (!cleanBarcode) return;
  const result = await window.posApi.pos.lookupBarcode(cleanBarcode);
  if (!result.ok) {
    showMessage(posMessage, result.message || 'Barcode not found.');
    return;
  }
  addProductToCart(result.product);
  posBarcodeInput.value = '';
}

async function addProductFromUnifiedSearch() {
  const query = String(posBarcodeInput.value || '').trim();
  if (!query) return;

  const barcodeResult = await window.posApi.pos.lookupBarcode(query);
  if (barcodeResult.ok) {
    addProductToCart(barcodeResult.product);
    posBarcodeInput.value = '';
    return;
  }

  const searchResult = await window.posApi.pos.searchProducts({ search: query, categoryId: '' });
  if (!searchResult.ok) {
    showMessage(posMessage, searchResult.message || 'Product search failed.');
    return;
  }
  const products = searchResult.products || [];
  const exact = products.find((product) =>
    String(product.barcode || '').toLowerCase() === query.toLowerCase()
    || String(product.sku || '').toLowerCase() === query.toLowerCase()
  );
  if (exact) {
    addProductToCart(exact);
    posBarcodeInput.value = '';
    return;
  }
  if (products.length === 1) {
    addProductToCart(products[0]);
    posBarcodeInput.value = '';
    return;
  }
  showMessage(posMessage, products.length > 1 ? `${products.length} products found. Enter exact SKU/barcode or refine search.` : 'Product not found.');
}

async function loadCustomers(search = '') {
  const result = await window.posApi.pos.listCustomers(search);
  if (!result.ok) {
    showMessage(posMessage, result.message || 'Customers could not be loaded.');
    return;
  }
  customerSelect.innerHTML = (result.customers || []).map((customer) => `<option value="${customer.id}">${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}</option>`).join('');
  customerSelect.dataset.customers = JSON.stringify(result.customers || []);
  renderSelectedCustomerBalance();
}

function selectedCustomer() {
  const customers = JSON.parse(customerSelect.dataset.customers || '[]');
  return customers.find((customer) => Number(customer.id) === Number(customerSelect.value));
}

function renderSelectedCustomerBalance() {
  const customer = selectedCustomer();
  if (!customer) {
    posCustomerBalance.textContent = 'Due: 0.00 | Limit: 0.00';
    return;
  }
  posCustomerBalance.textContent = `Due: ${formatMoney(customer.currentBalance)} | Limit: ${formatMoney(customer.creditLimit)}${customer.isWalkIn ? ' | Walk-in' : ''}`;
}

async function loadHeldSales() {
  const result = await window.posApi.pos.listHeldSales();
  if (!result.ok) {
    heldSalesList.innerHTML = `<div class="px-4 py-3 text-red-700">${result.message}</div>`;
    return;
  }
  heldSalesList.innerHTML = (result.holds || []).map((hold) => `
    <div class="px-4 py-3">
      <p class="font-semibold">${hold.holdNumber}</p>
      <p class="text-xs text-zinc-500">${new Date(hold.createdAt).toLocaleString()}</p>
      <div class="mt-2 flex gap-2">
        <button type="button" data-resume-hold="${hold.id}" class="epos-btn epos-btn-sm epos-btn-outline">Resume</button>
        ${result.permissions?.canDelete ? `<button type="button" data-delete-hold="${hold.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Delete</button>` : ''}
      </div>
    </div>
  `).join('') || '<div class="px-4 py-6 text-center text-zinc-500">No held sales.</div>';
  heldSalesList.dataset.holds = JSON.stringify(result.holds || []);
}

function renderReceipt(receipt) {
  receiptPreview.innerHTML = `
    <div class="text-center">
      <p class="font-bold">Enterprise POS</p>
      <p>${receipt.invoiceNumber}</p>
      <p>${new Date(receipt.createdAt).toLocaleString()}</p>
      <p>Cashier: ${receipt.cashierName || '-'}</p>
      <p>Customer: ${receipt.customerName || '-'}</p>
    </div>
    <hr class="my-2" />
    ${receipt.items.map((item) => `<div class="mb-1"><div>${item.productName}</div><div>${item.quantity} x ${formatMoney(item.unitPrice)} = ${formatMoney(item.total)}</div></div>`).join('')}
    <hr class="my-2" />
    <div>Subtotal: ${formatMoney(receipt.subtotal)}</div>
    <div>Discount: ${formatMoney(receipt.discount)}</div>
    <div>Tax: ${formatMoney(receipt.tax)}</div>
    <div class="font-bold">Total: ${formatMoney(receipt.grandTotal)}</div>
    <div>Paid: ${formatMoney(receipt.paidAmount)}</div>
    <div>Change: ${formatMoney(receipt.changeAmount)}</div>
    ${(receipt.luckyDrawCoupons || []).length ? `<hr class="my-2" /><div class="font-bold">Lucky Draw Coupons</div>${receipt.luckyDrawCoupons.map((coupon) => `<div>${coupon.campaignName}: ${coupon.couponNo}</div>`).join('')}` : ''}
  `;
}

function clearCart() {
  cartItems = [];
  cartDiscount.value = '0';
  cartTax.value = '0';
  paidAmount.value = '0';
  clearPosSearchField();
  renderCart();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadReports() {
  if (!reportDateFrom.value) reportDateFrom.value = todayIso();
  if (!reportDateTo.value) reportDateTo.value = todayIso();
  clearMessage(reportsMessage);
  const result = await window.posApi.reports.overview({ from: reportDateFrom.value, to: reportDateTo.value });
  if (!result.ok) {
    showMessage(reportsMessage, result.message || 'Reports could not be loaded.');
    return;
  }
  reportTotalSales.textContent = formatMoney(result.summary.totalSales);
  reportTotalProfit.textContent = formatMoney(result.summary.totalProfit);
  reportTotalPurchases.textContent = formatMoney(result.summary.totalPurchases);
  reportLowStockCount.textContent = Number(result.summary.lowStockCount || 0).toLocaleString();
  reportTotalExpenses.textContent = formatMoney(result.summary.totalExpenses);
  reportNetCash.textContent = formatMoney(result.cashFlow?.netCash);
  salesReportList.innerHTML = result.sales.map((sale) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${sale.invoiceNumber}<br/><small>${sale.cashierName || '-'}</small></span><strong>${formatMoney(sale.grandTotal)}</strong></div>`).join('') || '<p class="text-zinc-500">No sales.</p>';
  purchaseReportList.innerHTML = result.purchases.map((purchase) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${purchase.invoiceNumber}<br/><small>${purchase.supplierName || '-'}</small></span><strong>${formatMoney(purchase.grandTotal)}</strong></div>`).join('') || '<p class="text-zinc-500">No purchases.</p>';
  purchaseOrderReportList.innerHTML = `
    <h4 class="font-semibold text-zinc-800">Purchase Requisitions</h4>
    ${(result.purchaseRequisitions || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.requisitionNumber}<br/><small>${item.department || '-'} | ${item.status}</small></span><strong>${item.requestedQty}</strong></div>`).join('') || '<p class="text-zinc-500">No requisitions.</p>'}
    <h4 class="mt-3 font-semibold text-zinc-800">Purchase Orders</h4>
    ${(result.purchaseOrders || []).map((order) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${order.poNumber}<br/><small>${order.supplierName || '-'} | ${order.status}</small></span><strong>${formatMoney(order.total)}</strong></div>`).join('') || '<p class="text-zinc-500">No purchase orders.</p>'}
    <h4 class="mt-3 font-semibold text-zinc-800">Pending Invoices</h4>
    ${(result.pendingPurchaseInvoices || []).map((receipt) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${receipt.receiptNumber}<br/><small>${receipt.poNumber} | ${receipt.supplierName || '-'}</small></span><strong>${formatMoney(receipt.total)}</strong></div>`).join('') || '<p class="text-zinc-500">No pending invoices.</p>'}
    <h4 class="mt-3 font-semibold text-zinc-800">Supplier Payables</h4>
    ${(result.supplierPayables || []).map((supplier) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${supplier.supplierName}</span><strong>${formatMoney(supplier.balance)}</strong></div>`).join('') || '<p class="text-zinc-500">No supplier payables.</p>'}
  `;
  goodsReceiptReportList.innerHTML = (result.goodsReceipts || []).map((receipt) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${receipt.receiptNumber}<br/><small>${receipt.poNumber} | ${receipt.supplierName || '-'}</small></span><strong>${formatMoney(receipt.total)}</strong></div>`).join('') || '<p class="text-zinc-500">No goods receipts.</p>';
  lowStockReportList.innerHTML = result.lowStock.map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.name}<br/><small>${item.sku}</small></span><strong>${item.currentStock}</strong></div>`).join('') || '<p class="text-zinc-500">No low stock.</p>';
  cashierReportList.innerHTML = result.cashiers.map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.cashierName}<br/><small>${item.salesCount} sales</small></span><strong>${formatMoney(item.totalSales)}</strong></div>`).join('') || '<p class="text-zinc-500">No cashier sales.</p>';
  customerDueReportList.innerHTML = (result.customerDue || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.name}<br/><small>${item.phone || '-'}</small></span><strong>${formatMoney(item.currentBalance)}</strong></div>`).join('') || '<p class="text-zinc-500">No customer due.</p>';
  creditSalesReportList.innerHTML = (result.creditSales || []).map((sale) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${sale.invoiceNumber}<br/><small>${sale.customerName || '-'}</small></span><strong>${formatMoney(sale.dueAmount)}</strong></div>`).join('') || '<p class="text-zinc-500">No credit sales.</p>';
  returnsReportList.innerHTML = (result.returns || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.returnNumber}<br/><small>${item.invoiceNumber}</small></span><strong>${formatMoney(item.refundTotal)}</strong></div>`).join('') || '<p class="text-zinc-500">No returns.</p>';
  refundSummaryList.innerHTML = (result.refundSummary || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.refundMethod}<br/><small>${item.count} refunds</small></span><strong>${formatMoney(item.total)}</strong></div>`).join('') || '<p class="text-zinc-500">No refunds.</p>';
  supplierBalanceReportList.innerHTML = (result.supplierBalances || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.name}<br/><small>${item.phone || '-'}</small></span><strong>${formatMoney(item.currentBalance)}</strong></div>`).join('') || '<p class="text-zinc-500">No supplier balances.</p>';
  supplierPaymentReportList.innerHTML = (result.supplierPayments || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.supplierName}<br/><small>${item.paymentMethod}</small></span><strong>${formatMoney(item.amount)}</strong></div>`).join('') || '<p class="text-zinc-500">No supplier payments.</p>';
  expenseReportList.innerHTML = (result.expenses || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.title}<br/><small>${item.categoryName || '-'} | ${new Date(item.expenseDate).toLocaleDateString()}</small></span><strong>${formatMoney(item.amount)}</strong></div>`).join('') || '<p class="text-zinc-500">No expenses.</p>';
  expenseCategoryReportList.innerHTML = (result.expenseByCategory || []).map((item) => `<div class="flex justify-between border-b border-zinc-100 py-2"><span>${item.categoryName}</span><strong>${formatMoney(item.total)}</strong></div>`).join('') || '<p class="text-zinc-500">No expense category totals.</p>';
}

function setLuckyTab(tab) {
  luckyTabs.forEach((button) => {
    const active = button.dataset.luckyTab === tab;
    button.classList.toggle('epos-btn-primary', active);
    button.classList.toggle('epos-btn-outline', !active);
  });
  luckyPanels.forEach((panel) => panel.classList.add('hidden'));
  const panelIds = {
    campaigns: '#luckyCampaignPanel',
    entries: '#luckyEntriesPanel',
    verify: '#luckyVerifyPanel',
    winners: '#luckyWinnersPanel',
    reports: '#luckyReportsPanel',
    settings: '#luckySettingsPanel'
  };
  document.querySelector(panelIds[tab] || '#luckyCampaignPanel')?.classList.remove('hidden');
}

function openLuckyCampaignEditor() {
  document.querySelector('#luckyCampaignEditor')?.classList.remove('hidden');
  luckyCampaignName?.focus();
}

function closeLuckyCampaignEditor() {
  document.querySelector('#luckyCampaignEditor')?.classList.add('hidden');
}

function resetLuckyCampaignForm() {
  luckyCampaignForm?.reset();
  luckyCampaignId.value = '';
  luckyStartDate.value = todayIso();
  luckyEndDate.value = todayIso();
  luckyTotalWinners.value = '1';
  luckyCouponType.value = 'AUTO';
  luckyStatus.value = 'ACTIVE';
  luckyQrEnabled.checked = true;
  luckyBarcodeEnabled.checked = true;
}

function luckyCampaignPayload() {
  return {
    campaignName: luckyCampaignName.value,
    startDate: luckyStartDate.value,
    endDate: luckyEndDate.value,
    minimumPurchase: Number(luckyMinimumPurchase.value || 0),
    prizeDetails: luckyPrizeDetails.value,
    totalWinners: Number(luckyTotalWinners.value || 1),
    couponGenerationType: luckyCouponType.value,
    status: luckyStatus.value,
    qrEnabled: luckyQrEnabled.checked,
    barcodeEnabled: luckyBarcodeEnabled.checked,
    notes: luckyNotes.value
  };
}

async function loadLuckyDrawPage() {
  clearMessage(luckyMessage);
  setLuckyTab(document.querySelector('.luckyTab.epos-btn-primary')?.dataset.luckyTab || 'campaigns');
  if (!luckyStartDate.value) resetLuckyCampaignForm();
  const result = await window.posApi.luckyDraw.listCampaigns();
  if (!result.ok) {
    showMessage(luckyMessage, result.message || 'Lucky Draw could not be loaded.');
    return;
  }
  currentLuckyCampaigns = result.campaigns || [];
  renderLuckyCampaigns(result.permissions || {});
  renderLuckyCampaignOptions();
  await Promise.all([loadLuckyEntries(), loadLuckyWinners(), loadLuckyReports()]);
}

function renderLuckyCampaigns(permissions = {}) {
  const visualFilter = document.querySelector('#luckyCampaignVisualFilter');
  const selectedCampaignId = visualFilter?.value || '';
  const visibleCampaigns = selectedCampaignId
    ? currentLuckyCampaigns.filter((campaign) => String(campaign.id) === String(selectedCampaignId))
    : currentLuckyCampaigns;

  luckyCampaignList.innerHTML = visibleCampaigns.map((campaign, index) => {
    const statusClass = campaign.status === 'ACTIVE' ? '' : String(campaign.status || 'inactive').toLowerCase();
    const duration = `${new Date(campaign.startDate).toLocaleDateString()} - ${new Date(campaign.endDate).toLocaleDateString()}`;
    return `
      <tr>
        <td><input type="checkbox" /></td>
        <td>${index + 1}</td>
        <td><strong>${campaign.campaignName}</strong><span>${campaign.campaignCode}</span></td>
        <td>${duration}</td>
        <td>PKR ${formatMoney(campaign.minimumPurchase)}</td>
        <td>${Number(campaign.totalEntries || 0).toLocaleString()}</td>
        <td>${Number(campaign.totalCustomers || 0).toLocaleString()}</td>
        <td>${campaign.winnersCount}/${campaign.totalWinners}</td>
        <td><span class="epos-lucky-status ${statusClass}">${campaign.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="epos-lucky-row-actions">
            <button type="button" data-view-lucky-campaign="${campaign.id}" title="View campaign">&#128065;</button>
            <button type="button" data-edit-lucky-campaign="${campaign.id}" title="Edit campaign" ${permissions.canWrite ? '' : 'disabled'}>&#9998;</button>
            <button type="button" data-delete-lucky-campaign="${campaign.id}" title="Delete campaign" ${permissions.canWrite ? '' : 'disabled'}>&#8942;</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="10" class="p-4 text-zinc-500">No Lucky Draw campaigns.</td></tr>';

  if (visualFilter) {
    visualFilter.innerHTML = '<option value="">All Campaigns</option>' + currentLuckyCampaigns.map((campaign) => `<option value="${campaign.id}">${campaign.campaignName}</option>`).join('');
    visualFilter.value = selectedCampaignId;
  }
  updateLuckyCurrentCampaign();
}

function renderLuckyCampaignOptions() {
  const campaignOptions = currentLuckyCampaigns.map((campaign) => `<option value="${campaign.id}">${campaign.campaignName} (${campaign.campaignCode})</option>`).join('');
  luckyEntryCampaignFilter.innerHTML = `<option value="">All campaigns</option>${campaignOptions}`;
  luckyDrawCampaignSelect.innerHTML = campaignOptions || '<option value="">No campaigns</option>';
}

function renderLuckyPrizeList(campaign) {
  const list = document.querySelector('#luckyPrizeList');
  const campaignName = document.querySelector('#luckyPrizeCampaignName');
  if (!list) return;
  if (!campaign) {
    if (campaignName) campaignName.textContent = '';
    list.innerHTML = '<p class="text-zinc-500">No active campaign prize details.</p>';
    return;
  }

  const rawPrizeDetails = String(campaign.prizeDetails || '').trim();
  if (campaignName) campaignName.textContent = `(${campaign.campaignName})`;
  if (!rawPrizeDetails) {
    list.innerHTML = '<p class="text-zinc-500">No prize details saved for this campaign.</p>';
    return;
  }

  const prizeLines = rawPrizeDetails
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const labels = ['1st Prize', '2nd Prize', '3rd Prize'];
  const totalWinners = Number(campaign.totalWinners || 0);

  list.innerHTML = prizeLines.map((line, index) => {
    const label = labels[index] || `Prize ${index + 1}`;
    const winnerLabel = index === 0 && totalWinners > 0
      ? `${totalWinners} ${totalWinners === 1 ? 'Winner' : 'Winners'}`
      : 'Prize';
    return `<p><span>${label}</span><strong>${escapeHtml(line)}</strong><em>${winnerLabel}</em></p>`;
  }).join('');
}

function updateLuckyCurrentCampaign() {
  const campaign = currentLuckyCampaigns.find((item) => item.status === 'ACTIVE') || currentLuckyCampaigns[0];
  const set = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };
  if (!campaign) {
    set('#luckyCurrentCampaignName', 'No Active Campaign');
    set('#luckyCurrentCampaignStatus', 'Inactive');
    set('#luckyCurrentCampaignDuration', '-');
    set('#luckyCurrentCampaignMinimum', 'PKR 0');
    set('#luckyCurrentCampaignCoupons', '0');
    set('#luckyCurrentCampaignDistributed', '0');
    set('#luckyCurrentCampaignRemaining', '0');
    set('#luckyCurrentCampaignWinners', '0');
    renderLuckyPrizeList(null);
    return;
  }
  const totalEntries = Number(campaign.totalEntries || 0);
  const totalWinners = Number(campaign.totalWinners || 0);
  set('#luckyCurrentCampaignName', campaign.campaignName);
  set('#luckyCurrentCampaignStatus', campaign.status === 'ACTIVE' ? 'Active' : 'Inactive');
  set('#luckyCurrentCampaignDuration', `${new Date(campaign.startDate).toLocaleDateString()} - ${new Date(campaign.endDate).toLocaleDateString()}`);
  set('#luckyCurrentCampaignMinimum', `PKR ${formatMoney(campaign.minimumPurchase)}`);
  set('#luckyCurrentCampaignCoupons', totalEntries.toLocaleString());
  set('#luckyCurrentCampaignDistributed', totalEntries.toLocaleString());
  set('#luckyCurrentCampaignRemaining', '0');
  set('#luckyCurrentCampaignWinners', Math.max(0, totalWinners - Number(campaign.winnersCount || 0)).toLocaleString());
  renderLuckyPrizeList(campaign);
}

async function loadLuckyEntries() {
  const result = await window.posApi.luckyDraw.listEntries({
    campaignId: luckyEntryCampaignFilter.value,
    search: luckyEntrySearch.value,
    fromDate: luckyEntryFromDate.value,
    toDate: luckyEntryToDate.value
  });
  if (!result.ok) {
    luckyEntriesBody.innerHTML = `<tr><td colspan="7" class="px-3 py-4 text-red-700">${result.message}</td></tr>`;
    return;
  }
  luckyEntriesBody.innerHTML = (result.entries || []).map((entry) => `
    <tr>
      <td class="px-3 py-2 font-semibold">${entry.couponNo}</td>
      <td class="px-3 py-2">${entry.customerName}</td>
      <td class="px-3 py-2">${entry.invoiceNumber}</td>
      <td class="px-3 py-2">${formatMoney(entry.billAmount)}</td>
      <td class="px-3 py-2">${entry.campaignName}</td>
      <td class="px-3 py-2">${entry.isUsed ? 'Used' : entry.verificationStatus}</td>
      <td class="px-3 py-2">
        <button type="button" data-print-lucky-coupon="${entry.couponNo}" class="epos-btn epos-btn-sm epos-btn-outline">Print</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="px-3 py-4 text-zinc-500">No eligible customers yet.</td></tr>';
}

function renderLuckyCoupon(coupon) {
  if (!coupon) {
    luckyVerificationResult.innerHTML = '<p class="text-zinc-500">No coupon scanned yet.</p>';
    return;
  }
  luckyVerificationResult.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-lg font-semibold text-zinc-950">${coupon.couponNo}</p>
        <p class="text-sm text-zinc-500">${coupon.campaignName} | ${coupon.invoiceNumber}</p>
      </div>
      <span class="rounded-full px-2 py-1 text-xs ${coupon.isUsed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}">${coupon.isUsed ? 'Used' : coupon.verificationStatus}</span>
    </div>
    <div class="mt-4 grid gap-2 sm:grid-cols-2">
      <p><strong>Customer:</strong> ${coupon.customerName}</p>
      <p><strong>Bill:</strong> ${formatMoney(coupon.billAmount)}</p>
      <p><strong>QR:</strong> ${coupon.qrValue}</p>
      <p><strong>Barcode:</strong> ${coupon.barcodeValue}</p>
    </div>
    <button type="button" data-print-lucky-coupon="${coupon.couponNo}" class="epos-btn epos-btn-outline mt-4">Print Coupon</button>
  `;
}

async function lookupLuckyCoupon(markVerified = false) {
  clearMessage(luckyMessage);
  const couponNo = luckyVerifyInput.value.trim();
  const restore = setButtonLoading(markVerified ? luckyVerifyButton : luckyLookupButton, markVerified ? 'Verifying...' : 'Looking...');
  const result = markVerified
    ? await window.posApi.luckyDraw.verifyCoupon({ couponNo })
    : await window.posApi.luckyDraw.lookupCoupon({ couponNo });
  restore();
  if (!result.ok) {
    showMessage(luckyMessage, result.message || 'Coupon check failed.');
    renderLuckyCoupon(result.coupon);
    return;
  }
  renderLuckyCoupon(result.coupon);
  showMessage(luckyMessage, result.message || 'Coupon loaded.', 'success');
  await Promise.all([loadLuckyEntries(), loadLuckyReports()]);
}

async function loadLuckyWinners() {
  const result = await window.posApi.luckyDraw.listWinners(luckyDrawCampaignSelect.value || null);
  if (!result.ok) {
    luckyWinnersList.innerHTML = `<p class="p-4 text-red-700">${result.message}</p>`;
    return;
  }
  luckyWinnersList.innerHTML = (result.winners || []).map((winner) => `
    <div>
      <span><strong>${winner.customerName}</strong><small>${winner.couponNo} | ${winner.invoiceNumber}</small></span>
      <strong>${winner.prizeName || '-'}</strong>
      <small>${new Date(winner.selectedAt).toLocaleDateString()}</small>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No winners selected yet.</p>';
  const recent = document.querySelector('#luckyRecentWinnersList');
  if (recent) {
    recent.innerHTML = (result.winners || []).slice(0, 3).map((winner) => `
      <div>
        <span><strong>${winner.customerName}</strong><small>Coupon: ${winner.couponNo}</small></span>
        <strong>PKR ${formatMoney(winner.billAmount)}</strong>
        <small>${winner.campaignName}</small>
      </div>
    `).join('') || '<p class="text-zinc-500">No winners yet.</p>';
  }
}

async function loadLuckyReports() {
  const result = await window.posApi.luckyDraw.reports();
  if (!result.ok) return;
  luckyReportCampaigns.textContent = Number(result.summary.campaignCount || 0).toLocaleString();
  luckyReportCoupons.textContent = Number(result.summary.couponCount || 0).toLocaleString();
  luckyReportVerified.textContent = Number(result.summary.verifiedCount || 0).toLocaleString();
  luckyReportWinners.textContent = Number(result.summary.winnerCount || 0).toLocaleString();
  luckyReportSales.textContent = `PKR ${formatMoney(result.summary.totalSales)}`;
  setText('#luckyParticipantsTotal', Number((result.campaigns || []).reduce((sum, campaign) => sum + Number(campaign.totalCustomers || 0), 0)).toLocaleString());
  luckyCampaignReportList.innerHTML = (result.campaigns || []).map((campaign) => `
    <div>
      <span><strong>${campaign.campaignName}</strong><small>${campaign.totalEntries} entries | ${campaign.totalCustomers} customers</small></span>
      <strong>PKR ${formatMoney(campaign.totalSales)}</strong>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No campaign report data.</p>';
}

async function printLuckyCoupon(couponNo) {
  const entryRows = Array.from(luckyEntriesBody.querySelectorAll('[data-print-lucky-coupon]'));
  const coupon = couponNo || luckyVerifyInput.value.trim() || entryRows[0]?.dataset.printLuckyCoupon;
  if (!coupon) return;
  const result = await window.posApi.luckyDraw.lookupCoupon({ couponNo: coupon });
  const details = result.ok ? result.coupon : { couponNo: coupon, campaignName: 'Lucky Draw', billAmount: 0, createdAt: new Date().toISOString() };
  const printWindow = window.open('', '_blank', 'width=360,height=600');
  printWindow.document.write(`
    <html><head><title>Lucky Draw Coupon</title><style>
      body{font-family:Arial,sans-serif;width:280px;margin:0 auto;padding:12px;color:#111}
      .center{text-align:center}.coupon{border:1px dashed #111;padding:10px;margin-top:10px}
      .barcode{font-family:monospace;font-size:20px;letter-spacing:2px;margin:10px 0}
      .qr{border:2px solid #111;width:96px;height:96px;margin:10px auto;display:flex;align-items:center;justify-content:center;font-size:10px;word-break:break-all}
    </style></head><body>
      <div class="center"><h3>Enterprise POS</h3><p>${details.campaignName}</p></div>
      <div class="coupon center">
        <strong>${details.couponNo}</strong>
        <div class="barcode">|||| ${details.barcodeValue || details.couponNo} ||||</div>
        <div class="qr">${details.qrValue || details.couponNo}</div>
        <p>Purchase: ${formatMoney(details.billAmount)}</p>
        <p>Date: ${new Date(details.createdAt).toLocaleString()}</p>
        <p>Scan or verify this coupon before draw.</p>
      </div>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function loadCustomerPage(search = '') {
  clearMessage(customerPageMessage);
  const result = await window.posApi.customers.list(search);
  if (!result.ok) {
    customerPageList.innerHTML = `<tr><td colspan="9" class="px-3 py-6 text-center text-red-700">${result.message}</td></tr>`;
    return;
  }
  currentCustomerPage = result.customers || [];
  customerPageList.dataset.customers = JSON.stringify(result.customers || []);
  populateCustomerFilterOptions();
  renderCustomerPageRows();
}

function customerGroup(customer) {
  if (Number(customer.stats?.totalPurchases || 0) >= 500000 || Number(customer.creditLimit || 0) >= 50000) return 'vip';
  if (Number(customer.stats?.totalPurchases || 0) >= 250000) return 'wholesale';
  return 'regular';
}

function customerCity(customer) {
  const address = String(customer.address || '').trim();
  if (!address) return '-';
  return address.split(',').map((part) => part.trim()).filter(Boolean).pop() || address;
}

function filteredCustomerPageRows() {
  const inlineSearch = String(document.querySelector('#customerInlineSearch')?.value || '').toLowerCase();
  const status = document.querySelector('#customerStatusFilter')?.value || document.querySelector('#customerSideStatusFilter')?.value || '';
  const group = document.querySelector('#customerGroupFilter')?.value || document.querySelector('#customerSideGroupFilter')?.value || '';
  const city = document.querySelector('#customerCityFilter')?.value || document.querySelector('#customerSideCityFilter')?.value || '';
  return currentCustomerPage.filter((customer) => {
    const haystack = `${customer.name || ''} ${customer.phone || ''} ${customer.email || ''} ${customer.cnic || ''}`.toLowerCase();
    const matchesSearch = !inlineSearch || haystack.includes(inlineSearch);
    const matchesStatus = !status || (status === 'active' ? customer.isActive !== false : customer.isActive === false);
    const matchesGroup = !group || customerGroup(customer) === group;
    const matchesCity = !city || customerCity(customer) === city;
    const matchesTab = !activeCustomerTab
      || (activeCustomerTab === 'active' && customer.isActive !== false)
      || (activeCustomerTab === 'inactive' && customer.isActive === false)
      || (activeCustomerTab === 'vip' && customerGroup(customer) === 'vip')
      || (activeCustomerTab === 'recent' && customer.createdAt && (Date.now() - new Date(customer.createdAt).getTime()) < 1000 * 60 * 60 * 24 * 30);
    return matchesSearch && matchesStatus && matchesGroup && matchesCity && matchesTab;
  });
}

function renderCustomerPageRows() {
  const rows = filteredCustomerPageRows();
  const total = currentCustomerPage.length;
  const active = currentCustomerPage.filter((customer) => customer.isActive !== false).length;
  const totalSales = currentCustomerPage.reduce((sum, customer) => sum + Number(customer.stats?.totalPurchases || 0), 0);
  [
    ['#customerTotalCount', total.toLocaleString()],
    ['#customerActiveCount', active.toLocaleString()],
    ['#customerInactiveCount', (total - active).toLocaleString()],
    ['#customerTotalSales', `PKR ${formatMoney(totalSales)}`]
  ].forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
  customerPageList.innerHTML = rows.map((customer, index) => {
    const group = customerGroup(customer);
    const initials = String(customer.name || 'C').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'C';
    const due = Number(customer.currentBalance || 0);
    return `
      <tr>
        <td>${index + 1}</td>
        <td><div class="epos-customer-name"><span class="epos-customer-avatar">${initials}</span><strong>${customer.name || '-'}</strong></div></td>
        <td>${customer.phone || '-'}</td>
        <td><span class="epos-customer-pill ${group}">${group === 'vip' ? 'VIP' : group === 'wholesale' ? 'Wholesale' : 'Regular'}</span></td>
        <td>${customerCity(customer)}</td>
        <td>PKR ${formatMoney(customer.stats?.totalPurchases)}</td>
        <td class="${due > 0 ? 'text-red-600' : ''}">PKR ${formatMoney(due)}</td>
        <td><span class="epos-customer-status ${customer.isActive !== false ? 'active' : 'inactive'}">${customer.isActive !== false ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="epos-customers-row-actions">
            <button type="button" data-customer-id="${customer.id}" title="View customer">V</button>
            <button type="button" data-edit-customer="${customer.id}" class="edit" title="Edit customer">E</button>
            <button type="button" data-delete-customer="${customer.id}" class="delete" title="Delete customer">D</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" class="px-3 py-6 text-center text-zinc-500">No customers found.</td></tr>';
  const summary = document.querySelector('#customerResultSummary');
  if (summary) summary.textContent = `Showing ${rows.length} of ${total} customers`;
  const topList = document.querySelector('#customerTopList');
  if (topList) {
    topList.innerHTML = [...currentCustomerPage]
      .sort((a, b) => Number(b.stats?.totalPurchases || 0) - Number(a.stats?.totalPurchases || 0))
      .slice(0, 5)
      .map((customer, index) => `<div><span>${index + 1}</span><span>${customer.name}</span><strong>PKR ${formatMoney(customer.stats?.totalPurchases)}</strong></div>`)
      .join('') || '<p class="text-zinc-500">No customer sales yet.</p>';
  }
}

function populateCustomerFilterOptions() {
  const cities = [...new Set(currentCustomerPage.map(customerCity).filter((city) => city && city !== '-'))].sort();
  ['#customerCityFilter', '#customerSideCityFilter'].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${selector.includes('Side') ? 'All Cities' : 'Select City'}</option>${cities.map((city) => `<option value="${city}">${city}</option>`).join('')}`;
    select.value = current;
  });
}

async function loadCustomerDetails(customerId) {
  const result = await window.posApi.customers.details(customerId);
  if (!result.ok) {
    customerDetailsPanel.innerHTML = `<p class="text-red-700">${result.message}</p>`;
    customerDetailsPanel.classList.remove('hidden');
    return;
  }
  customerDetailsPanel.innerHTML = `
    <div>
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-lg font-extrabold text-zinc-950">Customer Ledger</h3>
      <button type="button" data-customer-details-close class="epos-btn epos-btn-sm epos-btn-outline">Close</button>
    </div>
    <div class="mt-3 rounded-md bg-zinc-50 p-4">
      <p class="font-semibold text-zinc-950">${result.customer.name}</p>
      <p>Due: ${formatMoney(result.customer.currentBalance)} | Credit limit: ${formatMoney(result.customer.creditLimit)}</p>
      <p class="mt-1 text-xs text-zinc-500">Paid ${formatMoney(result.customer.stats?.totalPaid)} | Purchases ${formatMoney(result.customer.stats?.totalPurchases)} | Last purchase ${result.customer.stats?.lastPurchaseDate ? new Date(result.customer.stats.lastPurchaseDate).toLocaleDateString() : '-'}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-edit-customer="${result.customer.id}" class="epos-btn epos-btn-sm epos-btn-outline">Edit</button>
        <button type="button" data-delete-customer="${result.customer.id}" class="epos-btn epos-btn-sm epos-btn-danger-outline">Delete</button>
      </div>
    </div>
    ${['Admin', 'Manager'].includes(currentProfile?.role) ? `<form id="customerPaymentForm" class="mt-4 grid gap-3 rounded-md border border-zinc-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <input id="customerPaymentAmount" type="number" min="0.01" step="0.01" class="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Payment amount" />
      <input id="customerPaymentNotes" class="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Payment notes" />
      <button type="submit" class="epos-btn epos-btn-primary">Record Payment</button>
    </form>` : '<p class="mt-4 rounded-md bg-zinc-50 p-3 text-xs text-zinc-500">Ledger payments are restricted to Admin and Manager roles.</p>'}
    <h3 class="mt-5 font-semibold text-zinc-950">Purchase History</h3>
    <div class="mt-2 space-y-2">${result.sales.map((sale) => `<div class="flex justify-between rounded border border-zinc-200 p-2"><span>${sale.invoiceNumber}</span><strong>${formatMoney(sale.grandTotal)}</strong></div>`).join('') || '<p class="text-zinc-500">No purchases.</p>'}</div>
    <h3 class="mt-5 font-semibold text-zinc-950">Ledger</h3>
    <div class="mt-2 space-y-2">${result.ledger.map((entry) => `<div class="rounded border border-zinc-200 p-2"><p>${entry.entryType} - ${entry.notes || ''}</p><p class="text-xs">Debit ${formatMoney(entry.debit)} | Credit ${formatMoney(entry.credit)} | Balance ${formatMoney(entry.balance)}</p></div>`).join('') || '<p class="text-zinc-500">No ledger entries.</p>'}</div>
    </div>
  `;
  customerDetailsPanel.dataset.customerId = String(result.customer.id);
  customerDetailsPanel.classList.remove('hidden');
}

function openCustomerEditor() {
  document.querySelector('#customerEditorModal')?.classList.remove('hidden');
}

function closeCustomerEditor() {
  document.querySelector('#customerEditorModal')?.classList.add('hidden');
}

function resetCustomerForm() {
  customerForm.reset();
  customerFormId.value = '';
  customerOpeningBalanceInput.disabled = false;
  customerOpeningBalanceInput.value = '0';
  customerCreditLimitInput.value = '0';
  customerActiveInput.checked = true;
}

function readCustomerForm() {
  return {
    name: customerNameInput.value,
    phone: customerPhoneInput.value,
    email: customerEmailInput.value,
    cnic: customerCnicInput.value,
    address: customerAddressInput.value,
    openingBalance: customerOpeningBalanceInput.value,
    creditLimit: customerCreditLimitInput.value,
    isActive: customerActiveInput.checked
  };
}

async function loadReturns() {
  clearMessage(returnsMessage);
  const result = await window.posApi.returns.list();
  if (!result.ok) {
    returnsList.innerHTML = `<p class="p-4 text-red-700">${result.message}</p>`;
    return;
  }
  returnsList.innerHTML = (result.returns || []).map((item) => `
    <div class="py-3">
      <p class="font-semibold text-zinc-950">${item.returnNumber}</p>
      <p class="text-xs text-zinc-500">${item.invoiceNumber || '-'} | ${item.customerName || '-'} | ${new Date(item.createdAt).toLocaleString()}</p>
      <p class="mt-1 font-semibold text-emerald-700">${formatMoney(item.totalRefund)} ${item.refundMethod}</p>
    </div>
  `).join('') || '<p class="p-4 text-zinc-500">No returns yet.</p>';
}

function renderReturnInvoice(result) {
  currentReturnInvoice = result.sale;
  returnInvoicePanel.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="font-semibold text-zinc-950">${result.sale.invoiceNumber}</p>
        <p class="text-xs text-zinc-500">${new Date(result.sale.createdAt).toLocaleString()} | ${result.sale.customerName || '-'}</p>
      </div>
      <strong>Grand ${formatMoney(result.sale.grandTotal)}</strong>
    </div>
  `;
  returnItemsBody.innerHTML = (result.items || []).map((item) => {
    const remaining = Math.max(Number(item.quantity || 0) - Number(item.returnedQuantity || 0), 0);
    return `
      <tr>
        <td class="px-3 py-2"><p class="font-semibold">${item.productName}</p><p class="text-xs text-zinc-500">${item.sku || ''}</p></td>
        <td class="px-3 py-2">${item.quantity}</td>
        <td class="px-3 py-2">${item.returnedQuantity}</td>
        <td class="px-3 py-2"><input data-return-item="${item.saleItemId}" data-max="${remaining}" type="number" min="0" max="${remaining}" step="0.001" value="0" class="w-24 rounded border border-zinc-300 px-2 py-1" /></td>
        <td class="px-3 py-2">${formatMoney(item.unitPrice)}</td>
      </tr>
    `;
  }).join('');
}

async function lookupReturnInvoice() {
  const restoreButton = setButtonLoading(lookupReturnButton, 'Looking...');
  try {
    const result = await window.posApi.returns.lookupInvoice({
      invoiceNumber: returnInvoiceSearch.value,
      barcode: returnBarcodeSearch.value,
      customer: returnCustomerSearch.value
    });
    if (!result.ok) {
      currentReturnInvoice = null;
      returnItemsBody.innerHTML = '';
      showMessage(returnsMessage, result.message || 'Invoice not found.');
      return;
    }
    renderReturnInvoice(result);
    showMessage(returnsMessage, 'Invoice loaded from database.', 'success');
  } catch (error) {
    showMessage(returnsMessage, 'Return lookup service is not available.');
  } finally {
    restoreButton();
  }
}

async function processReturn() {
  if (!currentReturnInvoice) {
    showMessage(returnsMessage, 'Load an invoice before processing return.');
    return;
  }
  const items = Array.from(returnItemsBody.querySelectorAll('input[data-return-item]'))
    .map((input) => ({
      saleItemId: Number(input.dataset.returnItem),
      quantity: Number(input.value || 0)
    }))
    .filter((item) => item.quantity > 0);
  if (items.length === 0) {
    showMessage(returnsMessage, 'Enter at least one return quantity.');
    return;
  }
  const restoreButton = setButtonLoading(processReturnButton, 'Processing...');
  try {
    const result = await window.posApi.returns.create({
      saleId: currentReturnInvoice.id,
      invoiceNumber: currentReturnInvoice.invoiceNumber,
      refundMethod: returnRefundMethod.value,
      reason: returnReason.value,
      items
    });
    showMessage(returnsMessage, result.message || (result.ok ? 'Return processed.' : 'Return failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      currentReturnInvoice = null;
      returnItemsBody.innerHTML = '';
      returnInvoicePanel.textContent = 'Search an invoice to start a return.';
      returnReason.value = '';
      const refreshes = [loadReturns(), loadInventory(), loadDashboardStats()];
      if (['Admin', 'Manager'].includes(currentProfile?.role)) refreshes.push(loadReports());
      await Promise.all(refreshes);
    }
  } catch (error) {
    showMessage(returnsMessage, 'Return service is not available.');
  } finally {
    restoreButton();
  }
}

async function loadPrinterSettings() {
  const [printers, settings, backups] = await Promise.all([
    window.posApi.printing.listPrinters(),
    window.posApi.settings.get(),
    window.posApi.settings.listBackups()
  ]);
  const printerItems = printers.ok ? printers.printers : [];
  printerSelect.innerHTML = ['<option value="">Default printer</option>', ...printerItems.map((printer) => `<option value="${printer.name}">${printer.name}</option>`)].join('');
  if (settings.ok) {
    const current = settings.settings;
    storeName.value = current.store?.storeName || '';
    storePhone.value = current.store?.phone || '';
    storeEmail.value = current.store?.email || '';
    storeAddress.value = current.store?.address || '';
    storeTaxNumber.value = current.store?.taxNumber || '';
    storeReceiptFooter.value = current.store?.receiptFooterText || '';
    storeLogoPath.value = current.store?.logoPath || '';
    taxEnabled.checked = Boolean(current.tax?.enabled);
    defaultTaxPercentage.value = current.tax?.defaultTaxPercentage ?? 0;
    taxMode.value = current.tax?.mode || 'excluded';
    printerSelect.value = current.printer?.printerName || '';
    paperWidth.value = current.printer?.paperWidth || '80mm';
    autoPrintAfterSale.checked = Boolean(current.printer?.autoPrint);
    silentPrint.checked = Boolean(current.printer?.silentPrint);
    receiptCopies.value = current.printer?.receiptCopies || 1;
    printerFooter.value = current.printer?.footerText || '';
    currencySymbol.value = current.system?.currencySymbol || 'PKR';
    dateFormat.value = current.system?.dateFormat || 'DD/MM/YYYY';
    lowStockAlertThreshold.value = current.system?.lowStockAlertThreshold ?? 5;
    invoicePrefix.value = current.system?.invoicePrefix || 'POS';
    nextInvoiceNumber.value = current.system?.nextInvoiceNumber || 1;
  }
  renderBackupHistory(backups.ok ? backups.backups : []);
  savePrinterSettingsButton.disabled = !hasPermission('settings.update');
  createBackupButton.disabled = !hasPermission('backup.create');
  restoreBackupButton.disabled = !hasPermission('backup.restore');
  await Promise.all([loadAppInfo(), loadLicenseStatus(), loadSyncStatus()]);
  if (aboutSyncStatus) aboutSyncStatus.textContent = syncStatusIndicator?.textContent || '-';
}

function settingsPayload() {
  return {
    store: {
      storeName: storeName.value,
      phone: storePhone.value,
      email: storeEmail.value,
      address: storeAddress.value,
      taxNumber: storeTaxNumber.value,
      receiptFooterText: storeReceiptFooter.value,
      logoPath: storeLogoPath.value
    },
    tax: {
      enabled: taxEnabled.checked,
      defaultTaxPercentage: defaultTaxPercentage.value,
      mode: taxMode.value
    },
    printer: {
      printerName: printerSelect.value,
      paperWidth: paperWidth.value,
      autoPrint: autoPrintAfterSale.checked,
      silentPrint: silentPrint.checked,
      receiptCopies: receiptCopies.value,
      footerText: printerFooter.value || storeReceiptFooter.value
    },
    system: {
      currencySymbol: currencySymbol.value,
      dateFormat: dateFormat.value,
      lowStockAlertThreshold: lowStockAlertThreshold.value,
      invoicePrefix: invoicePrefix.value,
      nextInvoiceNumber: nextInvoiceNumber.value
    }
  };
}

function showSettingsTab(tab) {
  settingsTabs.forEach((button) => {
    const active = button.dataset.settingsTab === tab;
    button.classList.toggle('epos-btn-primary', active);
    button.classList.toggle('epos-btn-outline', !active);
  });
  settingsPanels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab));
}

function renderBackupHistory(backups = []) {
  backupHistoryBody.innerHTML = backups.map((backup) => `
    <tr>
      <td class="px-3 py-2 font-semibold">${backup.fileName}</td>
      <td class="px-3 py-2">${backup.action}</td>
      <td class="px-3 py-2">${backup.createdBy}</td>
      <td class="px-3 py-2">${backup.status}</td>
      <td class="px-3 py-2">${new Date(backup.createdAt).toLocaleString()}</td>
      <td class="px-3 py-2 text-xs text-zinc-500">${backup.filePath || '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="px-3 py-6 text-center text-zinc-500">No backup history.</td></tr>';
}

async function refreshBackupHistory() {
  const result = await window.posApi.settings.listBackups();
  if (!result.ok) {
    showMessage(settingsMessage, result.message || 'Backup history could not be loaded.');
    return;
  }
  renderBackupHistory(result.backups || []);
}

async function openProductForm(product = null) {
  if (!canWriteProducts) {
    showMessage(productMessage, 'You do not have permission to modify products.');
    return;
  }

  productForm.reset();
  productFields.id.value = product?.id || '';
  productFields.name.value = product?.name || '';
  productFields.sku.value = product?.sku || '';
  productFields.barcode.value = product?.barcode || '';
  productFields.purchasePrice.value = product?.purchasePrice ?? 0;
  productFields.salePrice.value = product?.salePrice ?? 0;
  productFields.wholesalePrice.value = product?.wholesalePrice ?? 0;
  productFields.minStockLevel.value = product?.minStockLevel ?? 0;
  productFields.currentStock.value = product?.currentStock ?? 0;
  productFields.isActive.checked = product?.isActive !== false;
  productFormTitle.textContent = product ? 'Edit Product' : 'Add Product';
  await loadCatalog(product || {});
  productFormPanel.classList.remove('hidden');
  productFields.name.focus();
}

function closeProductForm() {
  productFormPanel.classList.add('hidden');
}

function readProductForm() {
  return {
    name: productFields.name.value,
    sku: productFields.sku.value,
    barcode: productFields.barcode.value,
    categoryId: productFields.categoryId.value,
    brandId: productFields.brandId.value,
    unitId: productFields.unitId.value,
    purchasePrice: productFields.purchasePrice.value,
    salePrice: productFields.salePrice.value,
    wholesalePrice: productFields.wholesalePrice.value,
    minStockLevel: productFields.minStockLevel.value,
    currentStock: productFields.currentStock.value,
    isActive: productFields.isActive.checked
  };
}

function setLoginButtonLoading(isLoading) {
  loginButton.disabled = isLoading;
  if (loginButtonLabel) {
    loginButtonLabel.textContent = isLoading ? 'Signing in...' : 'Login';
  } else {
    loginButton.textContent = isLoading ? 'Signing in...' : 'Login';
  }
}

const rememberedUsername = window.localStorage.getItem('enterprisePosRememberedUsername');
if (rememberedUsername && loginUsername && rememberMe) {
  loginUsername.value = rememberedUsername;
  rememberMe.checked = true;
}

toggleLoginPassword?.addEventListener('click', () => {
  const shouldShow = loginPassword.type === 'password';
  loginPassword.type = shouldShow ? 'text' : 'password';
  toggleLoginPassword.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
});

forgotPasswordButton?.addEventListener('click', () => {
  showMessage(message, 'Please contact your administrator to reset your POS password.');
});

loginOptionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showMessage(message, `${button.dataset.loginOption} is ready for device integration.`);
  });
});

async function handleAppLogin(event) {
  event?.preventDefault();

  const username = loginUsername?.value || '';
  const password = loginPassword?.value || '';

  setLoginButtonLoading(true);

  try {
    const result = await window.posApi.auth.login({ username, password });

    if (!result.ok) {
      showMessage(message, result.message || 'Login failed.');
      return;
    }

    clearMessage(message);
    if (rememberMe?.checked) {
      window.localStorage.setItem('enterprisePosRememberedUsername', String(username || ''));
    } else {
      window.localStorage.removeItem('enterprisePosRememberedUsername');
    }
    showDashboard(result.profile);
  } catch (error) {
    showMessage(message, 'Application login service is not available.');
  } finally {
    setLoginButtonLoading(false);
  }
}

loginForm?.addEventListener('submit', handleAppLogin);
loginButton?.addEventListener('click', handleAppLogin);

[loginUsername, loginPassword].forEach((input) => {
  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (input === loginUsername && !loginPassword?.value) {
      loginPassword?.focus();
      return;
    }

    handleAppLogin(event);
  });
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = 'Logging out...';

  try {
    await window.posApi.auth.logout();
    loginForm?.reset();
    if (!loginForm) {
      if (loginUsername) loginUsername.value = '';
      if (loginPassword) loginPassword.value = '';
      if (rememberMe) rememberMe.checked = false;
    }
    const savedUsername = window.localStorage.getItem('enterprisePosRememberedUsername');
    if (savedUsername && loginUsername && rememberMe) {
      loginUsername.value = savedUsername;
      rememberMe.checked = true;
    }
    showLogin();
  } finally {
    logoutButton.disabled = false;
    logoutButton.textContent = 'Logout';
  }
});

sidebarNav.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-route]');
  if (!button || button.disabled) {
    return;
  }
  await navigateTo(button.dataset.route);
});

syncStatusIndicator?.addEventListener('click', async () => {
  await navigateTo('/sync');
});

document.addEventListener('click', async (event) => {
  const toolButton = event.target.closest('button[data-page-tool][data-tool-action]');
  if (!toolButton) return;
  await handlePageTool(toolButton.dataset.pageTool, toolButton.dataset.toolAction);
});

document.querySelector('#purchaseModule')?.addEventListener('click', async (event) => {
  if (event.target.closest('#openPurchaseFormButton')) {
    document.querySelector('#purchaseFormModal')?.classList.remove('hidden');
    purchaseInvoice?.focus();
    return;
  }
  if (event.target.closest('[data-close-purchase-modal]')) {
    document.querySelector('#purchaseFormModal')?.classList.add('hidden');
    return;
  }
  const tab = event.target.closest('[data-purchase-status-tab]');
  if (tab) {
    purchaseStatusTab = tab.dataset.purchaseStatusTab || '';
    document.querySelectorAll('[data-purchase-status-tab]').forEach((button) => button.classList.toggle('active', button === tab));
    purchasePage = 1;
    renderPurchasesPage();
    return;
  }
  const range = event.target.closest('[data-purchase-range]');
  if (range) {
    setPurchaseDateRange(range.dataset.purchaseRange);
    document.querySelectorAll('[data-purchase-range]').forEach((button) => button.classList.toggle('active', button === range));
    purchasePage = 1;
    renderPurchasesPage();
    return;
  }
  if (event.target.closest('#purchaseSearchButton')) {
    purchasePage = 1;
    renderPurchasesPage();
    return;
  }
  if (event.target.closest('#purchaseMoreFiltersButton')) {
    showMessage(purchaseMessage, 'Advanced purchase filters are prepared. Use the visible supplier, status, payment, date, and search filters.', 'success');
    return;
  }
  if (event.target.closest('#purchaseClearFiltersButton')) {
    ['#purchaseKeywordSearch', '#purchaseFilterFrom', '#purchaseFilterTo', '#purchaseSupplierFilter', '#purchaseStatusFilter', '#purchasePaymentFilter'].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.value = '';
    });
    purchaseStatusTab = '';
    document.querySelectorAll('[data-purchase-status-tab]').forEach((button, index) => button.classList.toggle('active', index === 0));
    purchasePage = 1;
    renderPurchasesPage();
    return;
  }
  if (event.target.closest('#purchasePrevPage')) {
    purchasePage -= 1;
    renderPurchasesPage();
    return;
  }
  if (event.target.closest('#purchaseNextPage')) {
    purchasePage += 1;
    renderPurchasesPage();
    return;
  }
  if (event.target.closest('#purchasePaymentButton')) {
    await navigateTo('/suppliers');
    return;
  }
  if (event.target.closest('#purchaseMoreActionsButton')) {
    showMessage(purchaseMessage, 'More purchase actions are prepared for approval, return, and batch workflows.', 'success');
    return;
  }
  if (event.target.closest('#purchaseColumnsButton')) {
    showMessage(purchaseMessage, 'All active purchase columns are already visible in the table.', 'success');
    return;
  }
  const deleteButton = event.target.closest('[data-delete-purchase]');
  if (deleteButton) {
    await deletePurchaseFromPage(Number(deleteButton.dataset.deletePurchase));
    return;
  }
  const viewButton = event.target.closest('[data-view-purchase], [data-edit-purchase]');
  if (viewButton) {
    const id = viewButton.dataset.viewPurchase || viewButton.dataset.editPurchase;
    await showPurchaseDetails(Number(id), viewButton.dataset.editPurchase ? 'edit' : 'view');
  }
});

document.querySelector('#purchaseModule')?.addEventListener('input', (event) => {
  if (event.target.closest('#purchaseKeywordSearch')) {
    purchasePage = 1;
    renderPurchasesPage();
  }
});

document.querySelector('#purchaseModule')?.addEventListener('change', (event) => {
  if (event.target.closest('#purchaseRowsPerPage, #purchaseFilterFrom, #purchaseFilterTo, #purchaseSupplierFilter, #purchaseStatusFilter, #purchasePaymentFilter')) {
    purchasePage = 1;
    renderPurchasesPage();
  }
});

document.querySelector('#dashboardGlobalSearch')?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const term = event.target.value.trim();
  if (!term) return;
  await navigateTo('/products');
  if (productSearch) {
    productSearch.value = term;
    await loadProducts();
  }
});

posBarcodeInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await addProductFromUnifiedSearch();
  }
});

posProductSearch.addEventListener('input', () => {
  window.clearTimeout(posSearchTimer);
  clearMessage(posMessage);
  posSearchTimer = window.setTimeout(() => {
    if (posSearchResults) searchPosProducts(posProductSearch.value);
  }, 200);
});

posSearchFocusButton.addEventListener('click', () => {
  posBarcodeInput.focus();
});

document.querySelector('#posAddItemButton')?.addEventListener('click', () => posBarcodeInput.focus());
document.querySelector('#posAddRowButton')?.addEventListener('click', () => posBarcodeInput.focus());
document.querySelector('#posRefreshInvoicesButton')?.addEventListener('click', loadPosDashboardStats);
document.querySelector('#posRecentInvoicesRefresh')?.addEventListener('click', loadPosDashboardStats);
document.querySelector('#posApplyDiscountButton')?.addEventListener('click', renderCart);

function readPosCustomerModalForm() {
  return {
    name: posCustomerNameInput.value,
    phone: posCustomerPhoneInput.value,
    email: posCustomerEmailInput.value,
    cnic: posCustomerCnicInput.value,
    address: posCustomerAddressInput.value,
    openingBalance: posCustomerOpeningBalanceInput.value || 0,
    creditLimit: posCustomerCreditLimitInput.value || 0,
    isActive: true
  };
}

function openPosCustomerModal() {
  if (!posCustomerModal || !posCustomerModalForm) return;
  posCustomerModalForm.reset();
  posCustomerOpeningBalanceInput.value = '0';
  posCustomerCreditLimitInput.value = '0';
  clearMessage(posCustomerModalMessage);
  posCustomerModal.classList.remove('hidden');
  window.setTimeout(() => posCustomerNameInput.focus(), 0);
}

function closePosCustomerModal() {
  if (!posCustomerModal) return;
  posCustomerModal.classList.add('hidden');
}

async function savePosCustomerFromModal(triggerButton) {
  const restoreButton = triggerButton ? setButtonLoading(triggerButton, 'Saving...') : null;
  try {
    const payload = readPosCustomerModalForm();
    const result = window.posApi.customers?.create
      ? await window.posApi.customers.create(payload)
      : await window.posApi.pos.createCustomer(payload);
    showMessage(posCustomerModalMessage, result.message || (result.ok ? 'Customer saved.' : 'Customer save failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      await loadCustomers();
      customerSelect.value = String(result.customer.id);
      renderSelectedCustomerBalance();
      closePosCustomerModal();
      showMessage(posMessage, 'Customer added and selected.', 'success');
      if (customerPageList) await loadCustomerPage(customerPageSearch.value);
    }
  } catch (error) {
    showMessage(posCustomerModalMessage, 'Customer service is not available.');
  } finally {
    if (restoreButton) restoreButton();
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('#posCustomerAddButton');
  if (!button) return;
  openPosCustomerModal();
});

document.querySelector('#posPriceTypeSelect')?.addEventListener('change', (event) => {
  posPriceMode = event.target.value === 'wholesale' ? 'wholesale' : 'retail';
  if (posPriceMode === 'wholesale') wholesaleModeButton.click();
  else retailModeButton.click();
});

document.querySelector('#posDownloadPdfButton')?.addEventListener('click', async () => {
  if (!lastReceipt) {
    showMessage(posMessage, 'Complete a sale before downloading an invoice PDF.');
    return;
  }
  const button = document.querySelector('#posDownloadPdfButton');
  const restoreButton = button ? setButtonLoading(button, 'Downloading...') : null;
  try {
    const result = await window.posApi.printing.downloadReceiptPdf(lastReceipt);
    if (result.canceled) return;
    showMessage(posMessage, result.message || (result.ok ? 'Invoice PDF downloaded.' : 'PDF download failed.'), result.ok ? 'success' : 'error');
  } catch (error) {
    showMessage(posMessage, 'PDF export service is not available.');
  } finally {
    if (restoreButton) restoreButton();
  }
});

document.querySelector('#posSendEmailButton')?.addEventListener('click', () => {
  showMessage(posMessage, 'Email invoice foundation is ready for SMTP integration.', 'success');
});

document.querySelector('#posWhatsappButton')?.addEventListener('click', () => {
  showMessage(posMessage, 'WhatsApp invoice foundation is ready for gateway integration.', 'success');
});

if (posCategoryFilters) {
  posCategoryFilters.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-pos-category]');
    if (!button) return;
    posCategoryId = button.dataset.posCategory || '';
    await loadPosCategories();
    await searchPosProducts(posProductSearch.value);
  });
}

retailModeButton.addEventListener('click', () => {
  posPriceMode = 'retail';
  retailModeButton.classList.add('epos-billing-mode-active');
  wholesaleModeButton.classList.remove('epos-billing-mode-active');
  searchPosProducts(posProductSearch.value);
  showMessage(posMessage, 'Retail price mode selected.', 'success');
});

wholesaleModeButton.addEventListener('click', () => {
  posPriceMode = 'wholesale';
  wholesaleModeButton.classList.add('epos-billing-mode-active');
  retailModeButton.classList.remove('epos-billing-mode-active');
  searchPosProducts(posProductSearch.value);
  showMessage(posMessage, 'Wholesale price mode selected from product database.', 'success');
});

syncPosButton.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(syncPosButton, 'Syncing...');
  try {
    if (!navigator.onLine) {
      await loadSyncStatus();
      showMessage(posMessage, 'Offline mode is active. POS actions will stay queued locally.', 'success');
      return;
    }
    const result = await window.posApi.sync.run();
    showMessage(posMessage, result.message || (result.ok ? 'Sync completed.' : 'Sync failed.'), result.ok ? 'success' : 'error');
    await Promise.all([loadCustomers(customerSearch.value), loadHeldSales(), loadSyncStatus()]);
  } catch (error) {
    showMessage(posMessage, 'Sync service is not available. POS data remains safe locally.');
  } finally {
    restoreButton();
  }
});

if (posSearchResults) {
  posSearchResults.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-pos-product]');
    if (!button) return;
    const products = JSON.parse(posSearchResults.dataset.products || '[]');
    const product = products.find((item) => Number(item.id) === Number(button.dataset.posProduct));
    if (product) addProductToCart(product);
  });
}

cartTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-cart-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  const item = cartItems[index];
  if (!item) return;
  if (button.dataset.cartAction === 'remove') cartItems.splice(index, 1);
  if (button.dataset.cartAction === 'inc') {
    if (item.quantity + 1 > item.currentStock) return showMessage(posMessage, 'Insufficient stock.');
    item.quantity += 1;
    recalcCartItem(item);
  }
  if (button.dataset.cartAction === 'dec') {
    item.quantity = Math.max(0.001, Number((item.quantity - 1).toFixed(3)));
    recalcCartItem(item);
  }
  renderCart();
});

cartTableBody.addEventListener('input', (event) => {
  const input = event.target.closest('input[data-cart-field]');
  if (!input) return;
  const item = cartItems[Number(input.dataset.index)];
  if (!item) return;
  if (input.dataset.cartField === 'quantity') {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0 || value > item.currentStock) return showMessage(posMessage, 'Invalid quantity or insufficient stock.');
    item.quantity = value;
  }
  if (input.dataset.cartField === 'discount') {
    const value = Number(input.value || 0);
    if (!Number.isFinite(value) || value < 0) return showMessage(posMessage, 'Invalid discount.');
    item.discount = value;
  }
  recalcCartItem(item);
  renderCart();
});

[cartDiscount, cartTax, paidAmount].forEach((input) => input.addEventListener('input', renderCart));
document.querySelector('#posDiscountType')?.addEventListener('change', renderCart);
clearCartButton.addEventListener('click', clearCart);

customerSearch.addEventListener('input', () => {
  window.clearTimeout(customerSearchTimer);
  customerSearchTimer = window.setTimeout(() => loadCustomers(customerSearch.value), 200);
});

quickCustomerFocusButton.addEventListener('click', () => {
  openPosCustomerModal();
});

posCustomerModalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await savePosCustomerFromModal(posCustomerModalSaveButton);
});

posCustomerModal.addEventListener('click', (event) => {
  if (event.target.closest('[data-pos-customer-close]')) closePosCustomerModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && posCustomerModal && !posCustomerModal.classList.contains('hidden')) {
    closePosCustomerModal();
  }
});

customerSelect.addEventListener('change', renderSelectedCustomerBalance);

holdSaleButton.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(holdSaleButton, 'Holding...');
  try {
    const result = await window.posApi.pos.holdSale({
      customerId: customerSelect.value,
      items: cartItems,
      discount: currentCartDiscountAmount(),
      tax: cartTax.value
    });
    showMessage(posMessage, result.message || (result.ok ? 'Sale held.' : 'Hold failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      clearCart();
      await loadHeldSales();
    }
  } catch (error) {
    showMessage(posMessage, 'Hold sale service is not available. Please try again.');
  } finally {
    restoreButton();
  }
});

heldSalesList.addEventListener('click', async (event) => {
  const resumeButton = event.target.closest('button[data-resume-hold]');
  const deleteButton = event.target.closest('button[data-delete-hold]');
  const holds = JSON.parse(heldSalesList.dataset.holds || '[]');
  if (resumeButton) {
    const hold = holds.find((item) => Number(item.id) === Number(resumeButton.dataset.resumeHold));
    if (!hold) return;
    cartItems = hold.payload.items || [];
    cartDiscount.value = hold.payload.discount || 0;
    cartTax.value = hold.payload.tax || 0;
    customerSelect.value = hold.payload.customerId || customerSelect.value;
    renderCart();
  }
  if (deleteButton) {
    const result = await window.posApi.pos.deleteHeldSale(Number(deleteButton.dataset.deleteHold));
    showMessage(posMessage, result.message || (result.ok ? 'Held sale deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    await loadHeldSales();
  }
});

completeSaleButton.addEventListener('click', async () => {
  const validationError = validatePaymentBeforeSubmit();
  if (validationError) {
    showMessage(posMessage, validationError);
    return;
  }
  const restoreButton = setButtonLoading(completeSaleButton, 'Processing...');
  try {
    const result = await window.posApi.pos.completeSale({
      customerId: customerSelect.value,
      items: cartItems,
      discount: currentCartDiscountAmount(),
      tax: cartTax.value,
      paidAmount: paidAmount.value,
      paymentMethod: paymentMethod.value
    });
    showMessage(posMessage, result.message || (result.ok ? 'Sale completed.' : 'Sale failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      lastReceipt = result.receipt;
      renderReceipt(result.receipt);
      clearCart();
      await Promise.all([loadInventory(), loadProducts(), loadHeldSales()]);
      await Promise.all([loadDashboardStats(), loadSyncStatus()]);
    }
  } catch (error) {
    showMessage(posMessage, 'Sale service is not available. Please try again.');
  } finally {
    restoreButton();
  }
});

thermalPrintButton.addEventListener('click', async () => {
  if (!lastReceipt) {
    showMessage(posMessage, 'Complete a sale before printing.');
    return;
  }
  const restoreButton = setButtonLoading(thermalPrintButton, 'Printing...');
  try {
    const result = await window.posApi.printing.printReceipt(lastReceipt);
    showMessage(posMessage, result.message || (result.ok ? 'Receipt sent to printer.' : 'Print failed.'), result.ok ? 'success' : 'error');
  } catch (error) {
    showMessage(posMessage, 'Printer service is not available. Please try again.');
  } finally {
    restoreButton();
  }
});

reprintLastBillButton.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(reprintLastBillButton, 'Loading...');
  try {
    const result = await window.posApi.pos.getLastReceipt();
    if (!result.ok) {
      showMessage(posMessage, result.message || 'Last bill could not be loaded.');
      return;
    }
    lastReceipt = result.receipt;
    renderReceipt(lastReceipt);
    reprintLastBillButton.textContent = 'Printing...';
    const printResult = await window.posApi.printing.printReceipt(lastReceipt);
    showMessage(posMessage, printResult.message || (printResult.ok ? 'Last bill sent to printer.' : 'Print failed.'), printResult.ok ? 'success' : 'error');
  } catch (error) {
    showMessage(posMessage, 'Reprint service is not available. Please try again.');
  } finally {
    restoreButton();
  }
});

document.querySelectorAll('[data-payment-set]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!paymentMethod) return;
    paymentMethod.value = button.dataset.paymentSet;
    renderCart();
    showMessage(posMessage, `${button.dataset.paymentSet} payment selected.`, 'success');
  });
});

async function validateSaleAction(action) {
  const button = action === 'refund' ? refundSaleButton : exchangeSaleButton;
  if (button.disabled) {
    showMessage(posMessage, 'Only Admin or Manager can process refund or exchange requests.');
    return;
  }
  const invoiceNumber = window.prompt(`Enter invoice number for ${action}:`);
  if (!invoiceNumber) return;
  const restoreButton = setButtonLoading(button, 'Checking...');
  try {
    const result = await window.posApi.pos.validateSaleAction({ action, invoiceNumber });
    showMessage(posMessage, result.message || `${action} validation failed.`, result.ok ? 'success' : 'error');
    if (result.ok && result.receipt) {
      lastReceipt = result.receipt;
      renderReceipt(lastReceipt);
    }
  } catch (error) {
    showMessage(posMessage, 'Sale lookup service is not available. Please try again.');
  } finally {
    restoreButton();
  }
}

refundSaleButton.addEventListener('click', () => navigateTo('/returns'));
exchangeSaleButton.addEventListener('click', async () => {
  showMessage(posMessage, 'Exchange workflow starts from invoice lookup in Returns.', 'success');
  await navigateTo('/returns');
});

loadReportsButton.addEventListener('click', () => loadReports());
exportPdfButton.addEventListener('click', () => printRows('Reports PDF Export', datasetForPage('purchases')));
exportExcelButton.addEventListener('click', () => downloadCsv(`reports-${new Date().toISOString().slice(0, 10)}.csv`, datasetForPage('purchases')));

luckyTabs.forEach((button) => button.addEventListener('click', () => setLuckyTab(button.dataset.luckyTab)));
resetLuckyCampaignButton?.addEventListener('click', () => {
  resetLuckyCampaignForm();
  openLuckyCampaignEditor();
});

document.querySelector('#luckyDrawModule')?.addEventListener('click', (event) => {
  const tabButton = event.target.closest('[data-lucky-tab]');
  if (tabButton) {
    setLuckyTab(tabButton.dataset.luckyTab);
  }
  if (event.target.closest('[data-lucky-action="new"]')) {
    resetLuckyCampaignForm();
    openLuckyCampaignEditor();
  }
  if (event.target.closest('#luckyFilterButton')) {
    renderLuckyCampaigns();
    loadLuckyEntries();
  }
  if (event.target.closest('#luckyResetFilterButton')) {
    const campaignFilter = document.querySelector('#luckyCampaignVisualFilter');
    const dateRange = document.querySelector('#luckyDateRangeVisual');
    const couponStatus = document.querySelector('#luckyCouponVisualStatus');
    const participationStatus = document.querySelector('#luckyParticipationVisualStatus');
    const purchaseFrom = document.querySelector('#luckyPurchaseFromVisual');
    const purchaseTo = document.querySelector('#luckyPurchaseToVisual');
    if (campaignFilter) campaignFilter.value = '';
    if (dateRange) dateRange.value = '';
    if (couponStatus) couponStatus.value = '';
    if (participationStatus) participationStatus.value = '';
    if (purchaseFrom) purchaseFrom.value = '';
    if (purchaseTo) purchaseTo.value = '';
    renderLuckyCampaigns();
    loadLuckyEntries();
  }
  if (event.target.closest('[data-lucky-editor-close]')) {
    closeLuckyCampaignEditor();
  }
});

luckyCampaignForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveLuckyCampaignButton, 'Saving...');
  try {
    const id = luckyCampaignId.value;
    const result = id
      ? await window.posApi.luckyDraw.updateCampaign(Number(id), luckyCampaignPayload())
      : await window.posApi.luckyDraw.createCampaign(luckyCampaignPayload());
    showMessage(luckyMessage, result.message || (result.ok ? 'Campaign saved.' : 'Campaign failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetLuckyCampaignForm();
      closeLuckyCampaignEditor();
      await loadLuckyDrawPage();
    }
  } catch (error) {
    showMessage(luckyMessage, 'Lucky Draw service is not available.');
  } finally {
    restoreButton();
  }
});

luckyCampaignList?.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('button[data-view-lucky-campaign]');
  const editButton = event.target.closest('button[data-edit-lucky-campaign]');
  const deleteButton = event.target.closest('button[data-delete-lucky-campaign]');
  if (viewButton) {
    const campaign = currentLuckyCampaigns.find((item) => Number(item.id) === Number(viewButton.dataset.viewLuckyCampaign));
    if (!campaign) return;
    showMessage(luckyMessage, `${campaign.campaignName}: ${campaign.totalEntries} coupons, ${campaign.winnersCount}/${campaign.totalWinners} winners.`, 'success');
  }
  if (editButton) {
    const campaign = currentLuckyCampaigns.find((item) => Number(item.id) === Number(editButton.dataset.editLuckyCampaign));
    if (!campaign) return;
    luckyCampaignId.value = campaign.id;
    luckyCampaignName.value = campaign.campaignName || '';
    luckyStartDate.value = String(campaign.startDate || '').slice(0, 10);
    luckyEndDate.value = String(campaign.endDate || '').slice(0, 10);
    luckyMinimumPurchase.value = campaign.minimumPurchase || 0;
    luckyTotalWinners.value = campaign.totalWinners || 1;
    luckyCouponType.value = campaign.couponGenerationType || 'AUTO';
    luckyStatus.value = campaign.status || 'ACTIVE';
    luckyPrizeDetails.value = campaign.prizeDetails || '';
    luckyNotes.value = campaign.notes || '';
    luckyQrEnabled.checked = campaign.qrEnabled !== false;
    luckyBarcodeEnabled.checked = campaign.barcodeEnabled !== false;
    openLuckyCampaignEditor();
    luckyCampaignName.focus();
  }
  if (deleteButton) {
    if (!window.confirm('Delete this Lucky Draw campaign? Existing coupon records remain for audit.')) return;
    const result = await window.posApi.luckyDraw.deleteCampaign(Number(deleteButton.dataset.deleteLuckyCampaign));
    showMessage(luckyMessage, result.message || (result.ok ? 'Campaign deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    if (result.ok) await loadLuckyDrawPage();
  }
});

[luckyEntryCampaignFilter, luckyEntryFromDate, luckyEntryToDate].forEach((input) => input?.addEventListener('change', loadLuckyEntries));
luckyEntrySearch?.addEventListener('input', () => {
  window.clearTimeout(luckyEntrySearchTimer);
  luckyEntrySearchTimer = window.setTimeout(loadLuckyEntries, 250);
});

luckyEntriesBody?.addEventListener('click', (event) => {
  const printButton = event.target.closest('button[data-print-lucky-coupon]');
  if (printButton) printLuckyCoupon(printButton.dataset.printLuckyCoupon);
});
luckyVerificationResult?.addEventListener('click', (event) => {
  const printButton = event.target.closest('button[data-print-lucky-coupon]');
  if (printButton) printLuckyCoupon(printButton.dataset.printLuckyCoupon);
});
luckyLookupButton?.addEventListener('click', () => lookupLuckyCoupon(false));
luckyVerifyButton?.addEventListener('click', () => lookupLuckyCoupon(true));
luckyVerifyInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    lookupLuckyCoupon(false);
  }
});
luckyDrawCampaignSelect?.addEventListener('change', loadLuckyWinners);
startLuckyDrawButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(startLuckyDrawButton, 'Drawing...');
  try {
    const result = await window.posApi.luckyDraw.drawWinners({ campaignId: luckyDrawCampaignSelect.value, count: luckyDrawCount.value });
    showMessage(luckyMessage, result.message || (result.ok ? 'Winner selected.' : 'Draw failed.'), result.ok ? 'success' : 'error');
    if (result.ok) await Promise.all([loadLuckyWinners(), loadLuckyReports(), loadLuckyDrawPage()]);
  } catch (error) {
    showMessage(luckyMessage, 'Lucky Draw winner service is not available.');
  } finally {
    restoreButton();
  }
});

customerPageSearch.addEventListener('input', () => {
  window.clearTimeout(customerPageSearchTimer);
  customerPageSearchTimer = window.setTimeout(() => loadCustomerPage(customerPageSearch.value), 200);
});
document.querySelector('#customerInlineSearch')?.addEventListener('input', renderCustomerPageRows);
['#customerStatusFilter', '#customerGroupFilter', '#customerCityFilter', '#customerSideStatusFilter', '#customerSideGroupFilter', '#customerSideCityFilter'].forEach((selector) => {
  document.querySelector(selector)?.addEventListener('change', () => {
    if (selector.includes('SideStatus')) document.querySelector('#customerStatusFilter').value = document.querySelector(selector).value;
    if (selector.includes('SideGroup')) document.querySelector('#customerGroupFilter').value = document.querySelector(selector).value;
    if (selector.includes('SideCity')) document.querySelector('#customerCityFilter').value = document.querySelector(selector).value;
    renderCustomerPageRows();
  });
});
document.querySelectorAll('[data-customer-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    activeCustomerTab = button.dataset.customerTab || '';
    document.querySelectorAll('[data-customer-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderCustomerPageRows();
  });
});
document.querySelector('#customerApplyFiltersButton')?.addEventListener('click', renderCustomerPageRows);
document.querySelector('#customerResetFiltersButton')?.addEventListener('click', () => {
  ['#customerInlineSearch', '#customerStatusFilter', '#customerGroupFilter', '#customerCityFilter', '#customerSideStatusFilter', '#customerSideGroupFilter', '#customerSideCityFilter'].forEach((selector) => {
    const control = document.querySelector(selector);
    if (control) control.value = '';
  });
  activeCustomerTab = '';
  document.querySelectorAll('[data-customer-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.customerTab === ''));
  renderCustomerPageRows();
});
document.querySelector('#customerClearFiltersButton')?.addEventListener('click', () => document.querySelector('#customerResetFiltersButton')?.click());
document.querySelectorAll('#customerAddButton, #customerBottomAddButton').forEach((button) => {
  button.addEventListener('click', () => {
    resetCustomerForm();
    openCustomerEditor();
    customerNameInput.focus();
  });
});

customerPageList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-customer-id]');
  const editButton = event.target.closest('button[data-edit-customer]');
  const deleteButton = event.target.closest('button[data-delete-customer]');
  if (button) loadCustomerDetails(Number(button.dataset.customerId));
  if (editButton) {
    const customer = currentCustomerPage.find((item) => Number(item.id) === Number(editButton.dataset.editCustomer));
    if (!customer) return;
    customerFormId.value = customer.id;
    customerNameInput.value = customer.name || '';
    customerPhoneInput.value = customer.phone || '';
    customerEmailInput.value = customer.email || '';
    customerCnicInput.value = customer.cnic || '';
    customerAddressInput.value = customer.address || '';
    customerCreditLimitInput.value = customer.creditLimit || 0;
    customerOpeningBalanceInput.value = customer.openingBalance || 0;
    customerOpeningBalanceInput.disabled = true;
    customerActiveInput.checked = customer.isActive !== false;
    openCustomerEditor();
    customerNameInput.focus();
  }
  if (deleteButton) {
    const confirmed = window.confirm('Delete this customer? Ledger history will remain for audit.');
    if (!confirmed) return;
    const result = await window.posApi.customers.delete(Number(deleteButton.dataset.deleteCustomer));
    showMessage(customerPageMessage, result.message || (result.ok ? 'Customer deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      customerDetailsPanel.classList.add('hidden');
      await loadCustomerPage(customerPageSearch.value);
      await loadCustomers(customerSearch.value);
    }
  }
});

customerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveCustomerButton, 'Saving...');
  try {
    const id = customerFormId.value;
    const result = id
      ? await window.posApi.customers.update(Number(id), readCustomerForm())
      : await window.posApi.customers.create(readCustomerForm());
    showMessage(customerPageMessage, result.message || (result.ok ? 'Customer saved.' : 'Customer save failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetCustomerForm();
      await loadCustomerPage(customerPageSearch.value);
      await loadCustomers(customerSearch.value);
      closeCustomerEditor();
    }
  } catch (error) {
    showMessage(customerPageMessage, 'Customer service is not available.');
  } finally {
    restoreButton();
  }
});

resetCustomerButton.addEventListener('click', resetCustomerForm);
document.querySelector('#customerEditorModal')?.addEventListener('click', (event) => {
  if (event.target.closest('[data-customer-modal-close]') || event.target.id === 'customerEditorModal') closeCustomerEditor();
});
document.querySelector('#customerLedgerShortcut')?.addEventListener('click', () => {
  const firstCustomer = filteredCustomerPageRows()[0];
  if (firstCustomer) loadCustomerDetails(firstCustomer.id);
});
document.querySelector('#customerDeleteInactiveButton')?.addEventListener('click', async () => {
  const inactive = currentCustomerPage.filter((customer) => customer.isActive === false && !customer.isWalkIn);
  if (!inactive.length) return showMessage(customerPageMessage, 'No inactive customers found.');
  if (!window.confirm(`Delete ${inactive.length} inactive customer(s)?`)) return;
  let deleted = 0;
  for (const customer of inactive) {
    const result = await window.posApi.customers.delete(Number(customer.id));
    if (result.ok) deleted += 1;
  }
  showMessage(customerPageMessage, `${deleted} inactive customer(s) deleted.`, 'success');
  await loadCustomerPage(customerPageSearch.value);
});

customerDetailsPanel.addEventListener('click', async (event) => {
  if (event.target.closest('[data-customer-details-close]') || event.target === customerDetailsPanel) {
    customerDetailsPanel.classList.add('hidden');
    return;
  }
  const editButton = event.target.closest('button[data-edit-customer]');
  const deleteButton = event.target.closest('button[data-delete-customer]');
  if (editButton) {
    const customers = JSON.parse(customerPageList.dataset.customers || '[]');
    const customer = customers.find((item) => Number(item.id) === Number(editButton.dataset.editCustomer));
    if (!customer) return;
    customerFormId.value = customer.id;
    customerNameInput.value = customer.name || '';
    customerPhoneInput.value = customer.phone || '';
    customerEmailInput.value = customer.email || '';
    customerCnicInput.value = customer.cnic || '';
    customerAddressInput.value = customer.address || '';
    customerCreditLimitInput.value = customer.creditLimit || 0;
    customerOpeningBalanceInput.value = customer.openingBalance || 0;
    customerOpeningBalanceInput.disabled = true;
    customerActiveInput.checked = customer.isActive !== false;
    customerNameInput.focus();
  }
  if (deleteButton) {
    const confirmed = window.confirm('Delete this customer? Ledger history will remain for audit.');
    if (!confirmed) return;
    const result = await window.posApi.customers.delete(Number(deleteButton.dataset.deleteCustomer));
    showMessage(customerPageMessage, result.message || (result.ok ? 'Customer deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      customerDetailsPanel.textContent = 'Select a customer to view purchase history and ledger.';
      await loadCustomerPage(customerPageSearch.value);
      await loadCustomers(customerSearch.value);
    }
  }
});

customerDetailsPanel.addEventListener('submit', async (event) => {
  const form = event.target.closest('#customerPaymentForm');
  if (!form) return;
  event.preventDefault();
  const customerId = Number(customerDetailsPanel.dataset.customerId);
  const amount = Number(document.querySelector('#customerPaymentAmount')?.value || 0);
  const notes = document.querySelector('#customerPaymentNotes')?.value || '';
  const result = await window.posApi.customers.payment(customerId, { amount, notes, paymentMethod: 'Cash' });
  showMessage(customerPageMessage, result.message || (result.ok ? 'Payment recorded.' : 'Payment failed.'), result.ok ? 'success' : 'error');
  if (result.ok) {
    const refreshes = [loadCustomerDetails(customerId), loadCustomerPage(customerPageSearch.value), loadDashboardStats()];
    if (['Admin', 'Manager'].includes(currentProfile?.role)) refreshes.push(loadReports());
    await Promise.all(refreshes);
  }
});

lookupReturnButton.addEventListener('click', lookupReturnInvoice);
processReturnButton.addEventListener('click', processReturn);
[returnInvoiceSearch, returnBarcodeSearch, returnCustomerSearch].forEach((input) => {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      lookupReturnInvoice();
    }
  });
});

supplierInlineSearch?.addEventListener('input', () => {
  window.clearTimeout(supplierSearchTimer);
  supplierSearchTimer = window.setTimeout(() => loadSupplierPage(supplierInlineSearch.value), 200);
});

[supplierStatusFilter, supplierCityFilter].forEach((control) => {
  control?.addEventListener('change', () => loadSupplierPage(supplierInlineSearch?.value || ''));
});

document.querySelector('#supplierFilterButton')?.addEventListener('click', () => loadSupplierPage(supplierInlineSearch?.value || ''));
document.querySelector('#supplierResetFilterButton')?.addEventListener('click', () => {
  if (supplierInlineSearch) supplierInlineSearch.value = '';
  if (supplierStatusFilter) supplierStatusFilter.value = '';
  if (supplierCityFilter) supplierCityFilter.value = '';
  loadSupplierPage();
});
document.querySelector('#supplierColumnsButton')?.addEventListener('click', () => {
  document.querySelector('.epos-suppliers-table')?.classList.toggle('is-compact');
});

document.querySelectorAll('[data-supplier-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-supplier-view]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    if (button.dataset.supplierView === 'payments' && supplierStatusFilter) supplierStatusFilter.value = 'due';
    if (button.dataset.supplierView === 'due' && supplierStatusFilter) supplierStatusFilter.value = 'due';
    if (button.dataset.supplierView === 'list' && supplierStatusFilter) supplierStatusFilter.value = '';
    loadSupplierPage(supplierInlineSearch?.value || '');
  });
});

resetSupplierButton?.addEventListener('click', resetSupplierForm);
supplierBottomNewButton?.addEventListener('click', resetSupplierForm);
document.querySelectorAll('[data-supplier-editor-close]').forEach((button) => button.addEventListener('click', closeSupplierEditor));
document.querySelectorAll('[data-supplier-payment-close]').forEach((button) => button.addEventListener('click', closeSupplierPaymentModal));
supplierPaymentSupplier?.addEventListener('change', () => {
  updateSupplierPaymentDue();
  supplierPaymentStandaloneAmount?.focus();
});

supplierExportButton?.addEventListener('click', () => {
  const rows = currentSuppliers.map((supplier) => ({
    name: supplier.name,
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || '',
    totalPurchases: supplier.stats?.totalPurchases || 0,
    totalPaid: supplier.stats?.totalPaid || 0,
    dueAmount: supplier.currentBalance || supplier.stats?.totalDue || 0,
    status: supplier.isActive !== false ? 'Active' : 'Inactive'
  }));
  const csv = ['Name,Phone,Email,Address,Total Purchases,Total Paid,Due Amount,Status', ...rows.map((row) => Object.values(row).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suppliers-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage(supplierPageMessage, 'Supplier CSV export prepared from live database records.', 'success');
});

supplierPrintButton?.addEventListener('click', () => {
  showMessage(supplierPageMessage, 'Supplier list print preview is ready. Use the system print dialog to continue.', 'success');
  window.print();
});

supplierNewPurchaseButton?.addEventListener('click', async () => {
  await openPurchaseEntryModal(activeSupplierActionId());
});

supplierStatementButton?.addEventListener('click', async () => {
  await openSupplierStatement(activeSupplierActionId());
});

supplierAgingButton?.addEventListener('click', () => {
  showMessage(supplierPageMessage, 'Aging report is calculated from current supplier due balances.', 'success');
});

supplierReminderButton?.addEventListener('click', () => {
  showMessage(supplierPageMessage, 'Due reminder channel is prepared for SMS/Email integration. Supplier due balances are database driven.', 'success');
});

supplierPageForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveSupplierButton, 'Saving...');
  try {
    const id = supplierPageId.value;
    const result = id
      ? await window.posApi.suppliers.update(Number(id), readSupplierForm())
      : await window.posApi.suppliers.create(readSupplierForm());
    showMessage(supplierPageMessage, result.message || (result.ok ? 'Supplier saved.' : 'Supplier failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      closeSupplierEditor();
      await Promise.all([loadSupplierPage(supplierInlineSearch?.value || ''), loadSuppliers()]);
      if (result.supplier?.id) await loadSupplierDetails(result.supplier.id);
    }
  } catch (error) {
    showMessage(supplierPageMessage, 'Supplier service is not available.');
  } finally {
    restoreButton();
  }
});

supplierList?.addEventListener('click', (event) => {
  const editButton = event.target.closest('button[data-edit-supplier]');
  const deleteButton = event.target.closest('button[data-delete-supplier]');
  const payButton = event.target.closest('button[data-pay-supplier]');
  const viewButton = event.target.closest('button[data-supplier-id]');
  if (editButton) {
    const supplier = currentSuppliers.find((item) => Number(item.id) === Number(editButton.dataset.editSupplier));
    if (supplier) openSupplierEditor(supplier);
    return;
  }
  if (deleteButton) {
    deleteSupplier(Number(deleteButton.dataset.deleteSupplier));
    return;
  }
  if (payButton) {
    selectSupplierForPayment(Number(payButton.dataset.paySupplier));
    return;
  }
  if (viewButton) loadSupplierDetails(Number(viewButton.dataset.supplierId));
});

supplierDetailsPanel?.addEventListener('click', async (event) => {
  if (event.target.closest('[data-close-supplier-details]')) {
    supplierDetailsPanel.classList.add('hidden');
    supplierDetailsPanel.innerHTML = '';
    delete supplierDetailsPanel.dataset.supplierId;
    return;
  }
  const editButton = event.target.closest('button[data-edit-supplier]');
  const deleteButton = event.target.closest('button[data-delete-supplier]');
  if (editButton) {
    const supplier = currentSuppliers.find((item) => Number(item.id) === Number(editButton.dataset.editSupplier));
    if (!supplier) return;
    openSupplierEditor(supplier);
  }
  if (deleteButton) {
    await deleteSupplier(Number(deleteButton.dataset.deleteSupplier));
  }
});

supplierBottomPaymentButton?.addEventListener('click', () => {
  const supplierId = Number(supplierDetailsPanel?.dataset.supplierId || 0);
  openSupplierPaymentModal(supplierId);
});

supplierPaymentStandaloneForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const supplier = selectedPaymentSupplier();
  if (!supplier) {
    showMessage(supplierPageMessage, 'Please select a supplier.', 'error');
    supplierPaymentSupplier?.focus();
    return;
  }
  const amount = Number(supplierPaymentStandaloneAmount?.value || 0);
  const due = supplierDueAmount(supplier);
  if (due <= 0) {
    showMessage(supplierPageMessage, 'This supplier has no outstanding balance.', 'error');
    return;
  }
  if (amount > due) {
    showMessage(supplierPageMessage, `Payment cannot exceed outstanding balance Rs. ${formatMoney(due)}.`, 'error');
    supplierPaymentStandaloneAmount?.focus();
    return;
  }
  const restoreButton = setButtonLoading(saveSupplierPaymentButton, 'Saving...');
  try {
    const paid = await makeSupplierPayment(
      Number(supplier.id),
      amount,
      supplierPaymentStandaloneMethod?.value || 'Cash',
      supplierPaymentStandaloneNotes?.value || ''
    );
    if (paid) closeSupplierPaymentModal();
  } finally {
    restoreButton();
  }
});

supplierDetailsPanel?.addEventListener('submit', async (event) => {
  const form = event.target.closest('#supplierPaymentForm');
  if (!form) return;
  event.preventDefault();
  const supplierId = Number(supplierDetailsPanel.dataset.supplierId);
  const amount = document.querySelector('#supplierPaymentAmount')?.value;
  const paymentMethod = document.querySelector('#supplierPaymentMethod')?.value;
  const notes = document.querySelector('#supplierPaymentNotes')?.value;
  await makeSupplierPayment(supplierId, amount, paymentMethod, notes);
});

expenseForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveExpenseButton, 'Saving...');
  try {
    const id = expenseId.value;
    const result = id
      ? await window.posApi.expenses.update(Number(id), readExpenseForm())
      : await window.posApi.expenses.create(readExpenseForm());
    showMessage(expenseMessage, result.message || (result.ok ? 'Expense saved.' : 'Expense failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetExpenseForm();
      await loadExpenses();
    }
  } catch (error) {
    showMessage(expenseMessage, 'Expense service is not available.');
  } finally {
    restoreButton();
  }
});

resetExpenseButton?.addEventListener('click', resetExpenseForm);

expenseCategoryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(expenseCategoryForm);
  const result = await window.posApi.expenses.createCategory({ name: formData.get('name') });
  showMessage(expenseMessage, result.message || (result.ok ? 'Category saved.' : 'Category failed.'), result.ok ? 'success' : 'error');
  if (result.ok) {
    expenseCategoryForm.reset();
    await loadExpenseCategories();
  }
});

[expenseFromDate, expenseToDate, expenseCategoryFilter, expensePaymentFilter].forEach((control) => {
  control?.addEventListener('change', loadExpenses);
});

expenseTableBody?.addEventListener('click', async (event) => {
  const editButton = event.target.closest('button[data-edit-expense]');
  const deleteButton = event.target.closest('button[data-delete-expense]');
  if (editButton) {
    const expense = currentExpenses.find((item) => Number(item.id) === Number(editButton.dataset.editExpense));
    if (!expense) return;
    expenseId.value = expense.id;
    expenseCategory.value = expense.categoryId || '';
    expenseTitle.value = expense.title || '';
    expenseAmount.value = expense.amount || 0;
    expensePaymentMethod.value = expense.paymentMethod || 'Cash';
    expenseDate.value = expense.expenseDate ? new Date(expense.expenseDate).toISOString().slice(0, 10) : todayIso();
    expenseReceiptPath.value = expense.receiptPath || '';
    expenseNotes.value = expense.notes || '';
    expenseTitle.focus();
  }
  if (deleteButton) {
    if (!window.confirm('Void this expense?')) return;
    const result = await window.posApi.expenses.delete(Number(deleteButton.dataset.deleteExpense));
    showMessage(expenseMessage, result.message || (result.ok ? 'Expense voided.' : 'Void failed.'), result.ok ? 'success' : 'error');
    if (result.ok) await loadExpenses();
  }
});

userSearch?.addEventListener('input', () => {
  window.clearTimeout(userSearchTimer);
  userSearchTimer = window.setTimeout(loadUsers, 250);
});
[userRoleFilter, userStatusFilter].forEach((control) => control?.addEventListener('change', loadUsers));
resetUserButton?.addEventListener('click', resetUserForm);
document.querySelectorAll('#userAddButton').forEach((button) => {
  button.addEventListener('click', () => {
    showUserAdminTab('users');
    resetUserForm();
    openUserEditor();
    userFullName?.focus();
  });
});
document.querySelectorAll('[data-user-status-shortcut]').forEach((button) => {
  button.addEventListener('click', () => {
    if (userStatusFilter) userStatusFilter.value = button.dataset.userStatusShortcut || '';
    loadUsers();
  });
});
userAdminTabs.forEach((button) => {
  button.addEventListener('click', () => {
    showUserAdminTab(button.dataset.userAdminTab);
    if (['roles', 'permissions', 'map'].includes(button.dataset.userAdminTab)) loadRolesPage();
    if (button.dataset.userAdminTab === 'activity') loadUserActivityLog();
  });
});

closeUserEditorButton?.addEventListener('click', closeUserEditor);
userEditorModal?.addEventListener('click', (event) => {
  if (event.target === userEditorModal) closeUserEditor();
});

userForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveUserButton, 'Saving...');
  try {
    const id = userId.value;
    const result = id ? await window.posApi.users.update(Number(id), readUserForm()) : await window.posApi.users.create(readUserForm());
    showMessage(userMessage, result.message || (result.ok ? 'User saved.' : 'User failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetUserForm();
      await loadUsers();
      window.setTimeout(closeUserEditor, 400);
    }
  } finally {
    restoreButton();
  }
});

userTableBody?.addEventListener('click', async (event) => {
  const editButton = event.target.closest('button[data-edit-user]');
  const resetButton = event.target.closest('button[data-reset-user]');
  const toggleButton = event.target.closest('button[data-toggle-user]');
  if (editButton) {
    const user = currentUsers.find((item) => Number(item.id) === Number(editButton.dataset.editUser));
    if (!user) return;
    userId.value = user.id;
    userFullName.value = user.fullName || '';
    userUsername.value = user.username || '';
    userEmail.value = user.email || '';
    userPhone.value = user.phone || '';
    userRole.value = user.roleId || '';
    userActive.checked = user.isActive !== false;
    userPassword.value = '';
    userPassword.placeholder = 'Leave blank; use Reset Password to change';
    openUserEditor();
    userFullName?.focus();
  }
  if (resetButton) {
    const password = window.prompt('Enter new password (minimum 8 characters)');
    if (!password) return;
    const result = await window.posApi.users.resetPassword(Number(resetButton.dataset.resetUser), password);
    showUserAdminMessage(result.message || (result.ok ? 'Password reset.' : 'Password reset failed.'), result.ok ? 'success' : 'error');
  }
  if (toggleButton) {
    const result = await window.posApi.users.setActive(Number(toggleButton.dataset.toggleUser), toggleButton.dataset.active === 'true');
    showUserAdminMessage(result.message || (result.ok ? 'Status updated.' : 'Status failed.'), result.ok ? 'success' : 'error');
    if (result.ok) await loadUsers();
  }
});

resetRoleButton?.addEventListener('click', resetRoleForm);

roleForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveRoleButton, 'Saving...');
  try {
    const payload = { name: roleName.value, description: roleDescription.value, isActive: roleActive.checked };
    const result = roleId.value ? await window.posApi.roles.update(Number(roleId.value), payload) : await window.posApi.roles.create(payload);
    showMessage(roleMessage, result.message || (result.ok ? 'Role saved.' : 'Role failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetRoleForm();
      await loadRolesPage();
      await loadRolesForSelects();
    }
  } finally {
    restoreButton();
  }
});

function handleRoleSelectionClick(event) {
  const button = event.target.closest('button[data-role-id]');
  if (!button) return;
  const role = currentRoles.find((item) => Number(item.id) === Number(button.dataset.roleId));
  if (!role) return;
  roleId.value = role.id;
  roleName.value = role.name || '';
  roleDescription.value = role.description || '';
  roleActive.checked = role.isActive !== false;
  loadRolePermissions(role.id);
}

roleList?.addEventListener('click', handleRoleSelectionClick);
permissionRoleList?.addEventListener('click', handleRoleSelectionClick);

saveRolePermissionsButton?.addEventListener('click', async () => {
  if (!selectedRoleId) {
    showMessage(roleMessage, 'Select a role first.');
    return;
  }
  const restoreButton = setButtonLoading(saveRolePermissionsButton, 'Saving...');
  try {
    const permissionIds = Array.from(permissionMatrix.querySelectorAll('input[data-permission-id]:checked')).map((input) => Number(input.dataset.permissionId));
    const result = await window.posApi.roles.savePermissions(selectedRoleId, permissionIds);
    showMessage(roleMessage, result.message || (result.ok ? 'Permissions saved.' : 'Permissions failed.'), result.ok ? 'success' : 'error');
    if (result.ok) await loadRolePermissions(selectedRoleId);
  } finally {
    restoreButton();
  }
});

savePrinterSettingsButton.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(savePrinterSettingsButton, 'Saving...');
  const result = await window.posApi.settings.save(settingsPayload());
  restoreButton();
  showMessage(settingsMessage, result.message || (result.ok ? 'Settings saved.' : 'Settings failed.'), result.ok ? 'success' : 'error');
});

settingsTabs.forEach((button) => {
  button.addEventListener('click', () => showSettingsTab(button.dataset.settingsTab));
});

checkUpdatesButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(checkUpdatesButton, 'Checking...');
  renderUpdate({ ok: true, update: { state: 'checking', currentVersion: currentAppInfo?.version, latestVersion: '-' }, message: 'Checking for updates...' });
  try {
    const result = await window.posApi.updates.check();
    renderUpdate(result);
  } finally {
    restoreButton();
  }
});

activateLicenseButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(activateLicenseButton, 'Activating...');
  try {
    const result = await window.posApi.license.activate({ licenseKey: licenseKeyInput.value });
    if (!result.ok) {
      licenseMessage.textContent = result.message || 'Activation failed.';
      licenseMessage.className = 'mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700';
      return;
    }
    licenseKeyInput.value = '';
    renderLicense(result);
  } finally {
    restoreButton();
  }
});

refreshLicenseButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(refreshLicenseButton, 'Refreshing...');
  try {
    const result = await window.posApi.license.refresh();
    renderLicense(result);
  } finally {
    restoreButton();
  }
});

aboutDialogButton?.addEventListener('click', () => {
  window.alert(`${currentAppInfo?.appName || 'Enterprise POS'}\nVersion: ${currentAppInfo?.version || '-'}\nBuild: ${currentAppInfo?.buildDate || '-'}\nLicense: ${currentLicenseStatus?.license?.activationState || '-'}`);
});

runSyncButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(runSyncButton, 'Syncing...');
  try {
    if (!navigator.onLine) {
      showMessage(syncMessage, 'Offline mode is active. Sync will run after connection returns.');
      setSyncIndicator('Offline');
      return;
    }
    setSyncIndicator('Syncing');
    const result = await window.posApi.sync.run();
    showMessage(syncMessage, result.message || (result.ok ? 'Sync completed.' : 'Sync failed.'), result.ok ? 'success' : 'error');
    await loadSyncQueue();
  } catch (error) {
    showMessage(syncMessage, 'Sync service is not available.');
    setSyncIndicator('Sync Error');
  } finally {
    restoreButton();
  }
});

retrySyncButton?.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(retrySyncButton, 'Retrying...');
  try {
    const result = await window.posApi.sync.retryFailed();
    showMessage(syncMessage, result.message || (result.ok ? 'Failed queue re-tried.' : 'Retry failed.'), result.ok ? 'success' : 'error');
    await loadSyncQueue();
  } catch (error) {
    showMessage(syncMessage, 'Sync retry service is not available.');
  } finally {
    restoreButton();
  }
});

refreshSyncButton?.addEventListener('click', loadSyncQueue);

testPrintButton.addEventListener('click', () => {
  showMessage(settingsMessage, 'Test print foundation is ready. Use receipt printing after a sale for live printer output.', 'success');
});

refreshBackupHistoryButton.addEventListener('click', refreshBackupHistory);

createBackupButton.addEventListener('click', async () => {
  const restoreButton = setButtonLoading(createBackupButton, 'Backing up...');
  try {
    const result = await window.posApi.settings.createBackup();
    showMessage(settingsMessage, result.message || (result.ok ? 'Backup created.' : 'Backup failed.'), result.ok ? 'success' : 'error');
    await refreshBackupHistory();
  } catch (error) {
    showMessage(settingsMessage, 'Backup service is not available.');
  } finally {
    restoreButton();
  }
});

restoreBackupButton.addEventListener('click', async () => {
  const confirmed = window.confirm('Restore will replace POS data from the selected backup file. This action is Admin-only and should be done after creating a fresh backup. Continue?');
  if (!confirmed) return;
  const restoreButton = setButtonLoading(restoreBackupButton, 'Restoring...');
  try {
    const result = await window.posApi.settings.restoreBackup();
    showMessage(settingsMessage, result.message || (result.ok ? 'Restore completed.' : 'Restore failed.'), result.ok ? 'success' : 'error');
    await Promise.all([refreshBackupHistory(), loadDashboardStats()]);
  } catch (error) {
    showMessage(settingsMessage, 'Restore service is not available.');
  } finally {
    restoreButton();
  }
});

window.addEventListener('keydown', async (event) => {
  const zoomKeys = ['+', '=', '-', '_', '0'];
  if (event.ctrlKey && zoomKeys.includes(event.key)) {
    event.preventDefault();
    return;
  }
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd' && !loginScreen?.classList.contains('hidden')) {
    event.preventDefault();
    loginStage?.classList.toggle('debug');
    return;
  }
  if (getCurrentRoute() !== '/pos') return;
  if (event.key === 'F2') {
    event.preventDefault();
    posBarcodeInput.focus();
  }
  if (event.key === 'F4') {
    event.preventDefault();
    completeSaleButton.click();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    clearCart();
  }
  if (event.key === 'Enter' && document.activeElement === paidAmount) {
    event.preventDefault();
    completeSaleButton.click();
  }
});

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
  }
}, { passive: false });

window.addEventListener('popstate', () => {
  if (currentProfile) {
    navigateTo(getCurrentRoute(), { replace: true });
  }
});

productSearch.addEventListener('input', () => {
  window.clearTimeout(productSearchTimer);
  productSearchTimer = window.setTimeout(() => loadProducts(), 250);
});

[inventorySearch, lowStockOnly, outOfStockOnly].forEach((control) => {
  control.addEventListener('input', () => {
    if (control === inventorySearch) {
      syncInventoryFilterSearch(inventorySearch.value);
    }
    window.clearTimeout(inventorySearchTimer);
    inventorySearchTimer = window.setTimeout(() => loadInventory(), 250);
  });
});

document.querySelector('#inventoryInlineSearch')?.addEventListener('input', (event) => {
  syncInventoryFilterSearch(event.target.value);
  window.clearTimeout(inventorySearchTimer);
  inventorySearchTimer = window.setTimeout(() => loadInventory(), 250);
});

document.querySelectorAll('[data-inventory-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    inventoryTab = button.dataset.inventoryTab || 'all';
    document.querySelectorAll('[data-inventory-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    if (lowStockOnly) lowStockOnly.checked = inventoryTab === 'low';
    if (outOfStockOnly) outOfStockOnly.checked = inventoryTab === 'out';
    loadInventory();
  });
});

['#inventoryCategoryFilter', '#inventoryBrandFilter', '#inventorySupplierFilter', '#inventoryStockStatusFilter', '#inventoryRowsPerPage'].forEach((selector) => {
  document.querySelector(selector)?.addEventListener('change', renderInventoryPage);
});

document.querySelector('#inventoryResetFiltersButton')?.addEventListener('click', () => {
  ['#inventoryCategoryFilter', '#inventoryBrandFilter', '#inventorySupplierFilter', '#inventoryStockStatusFilter'].forEach((selector) => {
    const control = document.querySelector(selector);
    if (control) control.value = '';
  });
  inventoryTab = 'all';
  document.querySelectorAll('[data-inventory-tab]').forEach((button) => button.classList.toggle('active', button.dataset.inventoryTab === 'all'));
  if (lowStockOnly) lowStockOnly.checked = false;
  if (outOfStockOnly) outOfStockOnly.checked = false;
  syncInventoryFilterSearch('');
  loadInventory();
});

function openInventoryAdjustment(productId = '') {
  if (!canAdjustInventory) {
    showMessage(inventoryMessage, 'You do not have permission to adjust stock.');
    return;
  }
  const modal = document.querySelector('#inventoryAdjustmentModal');
  if (!modal) return;
  if (productId) adjustProductId.value = String(productId);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  adjustProductId.focus();
}

function closeInventoryAdjustment() {
  const modal = document.querySelector('#inventoryAdjustmentModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

document.querySelector('#openInventoryAdjustmentButton')?.addEventListener('click', () => openInventoryAdjustment());
document.querySelector('[data-close-inventory-modal]')?.addEventListener('click', closeInventoryAdjustment);
document.querySelector('#inventoryAdjustmentModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'inventoryAdjustmentModal') closeInventoryAdjustment();
});

document.querySelector('#inventoryAddProductButton')?.addEventListener('click', async () => {
  await navigateTo('/products');
  openProductForm();
});

document.querySelector('#inventoryTransferButton')?.addEventListener('click', () => {
  showMessage(inventoryMessage, 'Stock transfer foundation is ready for warehouse-to-warehouse movement.', 'success');
});

document.querySelector('#inventoryBarcodeButton')?.addEventListener('click', () => {
  handlePageTool('inventory', 'print');
});

inventoryModule?.addEventListener('click', async (event) => {
  const routeButton = event.target.closest('button[data-route]');
  if (routeButton) {
    await navigateTo(routeButton.dataset.route);
  }
});

newProductButton.addEventListener('click', () => openProductForm());
document.querySelector('#productQuickAddButton')?.addEventListener('click', () => openProductForm());
document.querySelector('#productResetFiltersButton')?.addEventListener('click', () => {
  ['#productCategoryFilter', '#productBrandFilter', '#productUnitFilter', '#productStockFilter'].forEach((selector) => {
    const control = document.querySelector(selector);
    if (control) control.value = '';
  });
  document.querySelectorAll('[data-product-tab]').forEach((button) => button.classList.toggle('active', button.dataset.productTab === 'all'));
  renderProductRows();
});
['#productCategoryFilter', '#productBrandFilter', '#productUnitFilter', '#productStockFilter'].forEach((selector) => {
  document.querySelector(selector)?.addEventListener('change', renderProductRows);
});
document.querySelectorAll('[data-product-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-product-tab]').forEach((tab) => tab.classList.remove('active'));
    button.classList.add('active');
    renderProductRows();
  });
});

const productTable = document.querySelector('.epos-products-table');
const productViewButtons = document.querySelectorAll('.epos-products-view-tools button');
if (productViewButtons.length >= 4 && productTable) {
  const [columnButton, compactButton, comfortButton, settingsButton] = productViewButtons;
  columnButton.textContent = 'Column';
  columnButton.title = 'Show or hide Brand, Unit, and Cost Price columns.';
  columnButton.setAttribute('aria-label', columnButton.title);
  compactButton.textContent = '▦';
  compactButton.title = 'Use compact product table rows.';
  compactButton.setAttribute('aria-label', compactButton.title);
  comfortButton.textContent = '☷';
  comfortButton.title = 'Use comfortable product table rows.';
  comfortButton.setAttribute('aria-label', comfortButton.title);
  settingsButton.textContent = '⚙';
  settingsButton.title = 'Open product and catalog settings.';
  settingsButton.setAttribute('aria-label', settingsButton.title);

  columnButton.addEventListener('click', () => {
    productTable.classList.toggle('epos-products-hide-extra');
    columnButton.classList.toggle('active', productTable.classList.contains('epos-products-hide-extra'));
  });
  compactButton.addEventListener('click', () => {
    productTable.classList.remove('epos-products-comfortable');
    compactButton.classList.add('active');
    comfortButton.classList.remove('active');
  });
  comfortButton.addEventListener('click', () => {
    productTable.classList.add('epos-products-comfortable');
    comfortButton.classList.add('active');
    compactButton.classList.remove('active');
  });
  settingsButton.addEventListener('click', () => openProductForm());
}
closeProductFormButton.addEventListener('click', closeProductForm);

barcodePrintButton.addEventListener('click', () => {
  showMessage(productMessage, 'Barcode printing is prepared for the printing module phase.', 'success');
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveProductButton.disabled = true;
  saveProductButton.textContent = 'Saving...';

  try {
    const id = productFields.id.value;
    const result = id
      ? await window.posApi.products.update(Number(id), readProductForm())
      : await window.posApi.products.create(readProductForm());

    if (!result.ok) {
      showMessage(productMessage, result.message || 'Product could not be saved.');
      return;
    }

    closeProductForm();
    showMessage(productMessage, result.message || 'Product saved.', 'success');
    await loadProducts();
  } finally {
    saveProductButton.disabled = false;
    saveProductButton.textContent = 'Save Product';
  }
});

productTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const product = currentProducts.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!product) {
    return;
  }

  if (button.dataset.action === 'edit') {
    await openProductForm(product);
    return;
  }

  if (button.dataset.action === 'delete') {
    const confirmed = window.confirm(`Delete ${product.name}?`);
    if (!confirmed) {
      return;
    }

    const result = await window.posApi.products.delete(product.id);
    showMessage(productMessage, result.message || (result.ok ? 'Product deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    await loadProducts();
    return;
  }

  if (button.dataset.action === 'print') {
    showMessage(productMessage, `Barcode ${product.barcode} is ready for the printing module.`, 'success');
  }
});

inventoryTableBody.addEventListener('click', async (event) => {
  const historyButton = event.target.closest('button[data-inventory-product]');
  if (historyButton) {
    await loadMovements(Number(historyButton.dataset.inventoryProduct));
    return;
  }

  const adjustButton = event.target.closest('button[data-inventory-adjust]');
  if (adjustButton) {
    openInventoryAdjustment(Number(adjustButton.dataset.inventoryAdjust));
    return;
  }

  const barcodeButton = event.target.closest('button[data-inventory-barcode]');
  if (barcodeButton) {
    const item = currentInventory.find((row) => Number(row.productId) === Number(barcodeButton.dataset.inventoryBarcode));
    showMessage(inventoryMessage, item ? `Barcode ${item.barcode || item.sku} is ready for printing.` : 'Barcode printing is ready.', 'success');
  }
});

stockAdjustmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveAdjustmentButton.disabled = true;
  saveAdjustmentButton.textContent = 'Saving...';
  try {
    const result = await window.posApi.inventory.adjust({
      productId: adjustProductId.value,
      movementType: adjustmentType.value,
      quantity: adjustQuantity.value,
      reason: adjustReason.value
    });
    showMessage(inventoryMessage, result.message || (result.ok ? 'Stock adjusted.' : 'Adjustment failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      stockAdjustmentForm.reset();
      closeInventoryAdjustment();
      await loadInventory();
      await loadMovements();
      await loadProducts();
    }
  } finally {
    saveAdjustmentButton.disabled = false;
    saveAdjustmentButton.textContent = 'Save Adjustment';
  }
});

supplierForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(supplierForm).entries());
  const result = await window.posApi.suppliers.create(payload);
  showMessage(purchaseMessage, result.message || (result.ok ? 'Supplier saved.' : 'Supplier failed.'), result.ok ? 'success' : 'error');
  if (result.ok) {
    supplierForm.reset();
    await loadSuppliers();
  }
});

addPurchaseItemButton?.addEventListener('click', () => {
  const product = currentInventory.find((item) => Number(item.productId) === Number(purchaseItemProduct.value));
  const quantity = Number(purchaseItemQty.value);
  const purchasePrice = Number(purchaseItemCost.value);
  const salePrice = Number(purchaseItemSale.value);
  if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(salePrice) || salePrice < 0) {
    showMessage(purchaseMessage, 'Select product and enter valid quantity/prices.');
    return;
  }
  purchaseItems.push({
    productId: product.productId,
    name: product.name,
    quantity,
    purchasePrice,
    salePrice,
    total: Number((quantity * purchasePrice).toFixed(2))
  });
  purchaseItemQty.value = '';
  purchaseItemCost.value = '';
  purchaseItemSale.value = '';
  renderPurchaseItems();
});

purchaseItemsList?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove-purchase-item]');
  if (!button) return;
  purchaseItems.splice(Number(button.dataset.removePurchaseItem), 1);
  renderPurchaseItems();
});

[purchaseDiscount, purchaseTax, purchasePaid].forEach((input) => input?.addEventListener('input', renderPurchaseItems));

purchaseForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  savePurchaseButton.disabled = true;
  savePurchaseButton.textContent = 'Saving...';
  try {
    const result = await window.posApi.purchases.create({
      supplierId: purchaseSupplier.value,
      invoiceNumber: purchaseInvoice.value,
      purchaseDate: purchaseDate.value,
      discount: purchaseDiscount.value,
      tax: purchaseTax.value,
      paidAmount: purchasePaid.value,
      items: purchaseItems
    });
    showMessage(purchaseMessage, result.message || (result.ok ? 'Purchase saved.' : 'Purchase failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      purchaseForm.reset();
      purchaseDate.value = new Date().toISOString().slice(0, 10);
      purchaseItems = [];
      renderPurchaseItems();
      resetPurchaseListFilters('30');
      await Promise.all([loadPurchases(), loadInventory(), loadProducts(), loadMovements(), loadSyncStatus()]);
    }
  } finally {
    savePurchaseButton.disabled = false;
    savePurchaseButton.textContent = 'Save Purchase';
  }
});

addPoItemButton?.addEventListener('click', () => {
  const product = currentInventory.find((item) => Number(item.productId) === Number(poItemProduct.value));
  const orderedQty = Number(poItemQty.value);
  const cost = Number(poItemCost.value);
  const salePrice = Number(poItemSale.value);
  if (!product || !Number.isFinite(orderedQty) || orderedQty <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(salePrice) || salePrice < 0) {
    showMessage(poMessage, 'Select product and enter valid quantity/prices.');
    return;
  }
  poItems.push({
    productId: product.productId,
    productName: product.name,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unitName || product.unitShortName || '',
    hsn: product.hsn || '',
    orderedQty,
    cost,
    salePrice,
    discountPercent: Number(poItemDiscount?.value || 0),
    taxPercent: Number(poItemTax?.value || 0),
    total: Number((orderedQty * cost).toFixed(2))
  });
  poItemQty.value = '';
  poItemCost.value = '';
  poItemSale.value = '';
  if (poItemDiscount) poItemDiscount.value = '0';
  if (poItemTax) poItemTax.value = '0';
  renderPoItems();
});

addReqItemButton?.addEventListener('click', () => {
  const product = currentInventory.find((item) => Number(item.productId) === Number(reqItemProduct.value));
  const requiredQty = Number(reqItemQty.value || 0);
  if (!product || requiredQty <= 0) {
    showMessage(poMessage, 'Select a product and enter requisition quantity.', 'error');
    return;
  }
  requisitionItems.push({
    productId: product.productId,
    productName: product.name,
    requiredQty
  });
  reqItemQty.value = '';
  renderRequisitionItems();
});

reqItemsList?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove-req-item]');
  if (!button) return;
  requisitionItems.splice(Number(button.dataset.removeReqItem), 1);
  renderRequisitionItems();
});

resetRequisitionButton?.addEventListener('click', resetRequisitionForm);
reqStatusFilter?.addEventListener('change', loadRequisitions);

requisitionForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const restoreButton = setButtonLoading(saveRequisitionButton, 'Saving...');
  try {
    const result = await window.posApi.purchaseOrders.createRequisition({
      requestedDate: reqDate.value,
      department: reqDepartment.value,
      location: reqLocation.value,
      priority: reqPriority.value,
      reason: reqReason.value,
      items: requisitionItems
    });
    showMessage(poMessage, result.message || (result.ok ? 'Requisition saved.' : 'Requisition failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      resetRequisitionForm();
      await loadRequisitions();
    }
  } catch (error) {
    showMessage(poMessage, 'Requisition service is not available.', 'error');
  } finally {
    restoreButton();
  }
});

requisitionList?.addEventListener('click', async (event) => {
  const submitButton = event.target.closest('button[data-submit-req]');
  const approveButton = event.target.closest('button[data-approve-req]');
  const rejectButton = event.target.closest('button[data-reject-req]');
  const convertButton = event.target.closest('button[data-convert-req]');
  let result = null;
  if (submitButton) result = await window.posApi.purchaseOrders.updateRequisitionStatus(Number(submitButton.dataset.submitReq), 'SUBMITTED', '');
  if (approveButton) result = await window.posApi.purchaseOrders.updateRequisitionStatus(Number(approveButton.dataset.approveReq), 'APPROVED', window.prompt('Approval notes') || '');
  if (rejectButton) result = await window.posApi.purchaseOrders.updateRequisitionStatus(Number(rejectButton.dataset.rejectReq), 'REJECTED', window.prompt('Rejection reason') || '');
  if (convertButton) {
    const supplierId = poSupplier.value || window.prompt('Supplier ID for this PO');
    result = await window.posApi.purchaseOrders.convertRequisition({ id: Number(convertButton.dataset.convertReq), supplierId, expectedDate: poExpectedDate.value, discount: poDiscount.value, tax: poTax.value });
    if (result?.ok) await loadPurchaseOrders();
  }
  if (result) {
    showMessage(poMessage, result.message || (result.ok ? 'Updated.' : 'Action failed.'), result.ok ? 'success' : 'error');
    await loadRequisitions();
  }
});

poItemsList?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove-po-item]');
  if (!button) return;
  poItems.splice(Number(button.dataset.removePoItem), 1);
  renderPoItems();
});

poItemsList?.addEventListener('input', (event) => {
  const input = event.target.closest('input[data-po-row-field]');
  if (!input) return;
  const index = Number(input.dataset.poRow);
  const field = input.dataset.poRowField;
  if (!poItems[index] || !field) return;
  poItems[index][field] = Number(input.value || 0);
  renderPoItems();
});

[poDiscount, poTax, poShippingCharges].forEach((input) => input?.addEventListener('input', renderPoItems));
resetPoButton?.addEventListener('click', resetPoForm);

poForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await savePurchaseOrderWithStatus(poStatusSelect?.value || 'PENDING_APPROVAL', poSubmitButton || savePoButton);
});

savePoButton?.addEventListener('click', async () => {
  await savePurchaseOrderWithStatus('DRAFT', savePoButton);
});

poRequestApprovalButton?.addEventListener('click', async () => {
  await savePurchaseOrderWithStatus('PENDING_APPROVAL', poRequestApprovalButton);
});

[poStatusFilter, poFromDate, poToDate].forEach((input) => input?.addEventListener('change', loadPurchaseOrders));
poSearch?.addEventListener('input', () => {
  window.clearTimeout(poSearchTimer);
  poSearchTimer = window.setTimeout(loadPurchaseOrders, 250);
});

document.querySelectorAll('[data-po-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-po-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('[data-po-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.poPanel !== button.dataset.poTab));
  });
});

poSupplier?.addEventListener('change', syncPoSupplierDetails);

poItemProduct?.addEventListener('change', () => {
  const product = currentInventory.find((item) => Number(item.productId) === Number(poItemProduct.value));
  if (!product) return;
  if (poItemCost) poItemCost.value = Number(product.purchasePrice || product.costPrice || 0).toFixed(2);
  if (poItemSale) poItemSale.value = Number(product.salePrice || product.sellingPrice || 0).toFixed(2);
});

poGenerateNumberButton?.addEventListener('click', async () => {
  await loadPurchaseOrderPageData();
  showMessage(poMessage, 'PO number refreshed.', 'success');
});

async function addPoProductByBarcode() {
  const code = String(poBarcodeInput?.value || '').trim();
  if (!code) return;
  let product = currentInventory.find((item) => [item.barcode, item.sku].map(String).includes(code));
  if (!product && window.posApi.products?.lookupBarcode) {
    const lookup = await window.posApi.products.lookupBarcode(code);
    if (lookup.ok && lookup.product) product = currentInventory.find((item) => Number(item.productId || item.id) === Number(lookup.product.id || lookup.product.productId));
  }
  if (!product) {
    showMessage(poMessage, 'Barcode product was not found in inventory.', 'error');
    return;
  }
  poItemProduct.value = String(product.productId);
  poItemQty.value = poItemQty.value || '1';
  poItemCost.value = Number(product.purchasePrice || 0).toFixed(2);
  poItemSale.value = Number(product.salePrice || 0).toFixed(2);
  addPoItemButton?.click();
  poBarcodeInput.value = '';
}

poBarcodeButton?.addEventListener('click', addPoProductByBarcode);
poBarcodeInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addPoProductByBarcode();
  }
});

function poExportRows() {
  return poItems.map((item, index) => ({
    '#': index + 1,
    Product: item.productName,
    Barcode: item.barcode || '',
    Unit: item.unit || '',
    Qty: item.orderedQty,
    Rate: item.cost,
    Discount: item.discountAmount || 0,
    Tax: item.taxAmount || 0,
    Amount: item.total
  }));
}

function printPurchaseOrder() {
  const rows = poExportRows();
  if (!rows.length) {
    showMessage(poMessage, 'Add items before printing.', 'error');
    return;
  }
  printRows(`Purchase Order ${poNumberInput?.value || ''}`, rows);
}

poPrintButton?.addEventListener('click', printPurchaseOrder);
poPdfButton?.addEventListener('click', () => {
  const rows = poExportRows();
  if (!rows.length) {
    showMessage(poMessage, 'Add items before downloading PDF.', 'error');
    return;
  }
  printRows(`Purchase Order ${poNumberInput?.value || ''}`, rows);
  showMessage(poMessage, 'Readable print/PDF view opened. Use Save as PDF from the print dialog.', 'success');
});
poImportButton?.addEventListener('click', () => showMessage(poMessage, 'Purchase order import foundation is ready for CSV/Excel mapping.', 'success'));
poBackButton?.addEventListener('click', () => navigateTo('/purchases'));
poAddSupplierButton?.addEventListener('click', () => navigateTo('/suppliers'));
poQuickSupplierButton?.addEventListener('click', () => navigateTo('/suppliers'));
poQuickProductButton?.addEventListener('click', () => navigateTo('/products'));
poViewSuppliersButton?.addEventListener('click', () => navigateTo('/suppliers'));
poViewProductsButton?.addEventListener('click', () => navigateTo('/products'));
poPendingButton?.addEventListener('click', () => {
  poStatusFilter.value = 'PENDING_APPROVAL';
  loadPurchaseOrders();
});
poGrnButton?.addEventListener('click', () => showMessage(poMessage, 'GRN list is available from PO details after goods receiving.', 'success'));
poFullscreenButton?.addEventListener('click', () => {
  document.documentElement.requestFullscreen?.().catch(() => showMessage(poMessage, 'Fullscreen could not be started.', 'error'));
});
poCancelCurrentButton?.addEventListener('click', () => {
  if (window.confirm('Clear the current purchase order form?')) resetPoForm();
});

poList?.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('button[data-po-id]');
  const approveButton = event.target.closest('button[data-approve-po]');
  const sendButton = event.target.closest('button[data-send-po]');
  const confirmButton = event.target.closest('button[data-confirm-po]');
  const receiveButton = event.target.closest('button[data-receive-po]');
  const cancelButton = event.target.closest('button[data-cancel-po]');
  if (approveButton) {
    const result = await window.posApi.purchaseOrders.approve({ id: Number(approveButton.dataset.approvePo), notes: window.prompt('Approval notes') || '' });
    showMessage(poMessage, result.message || (result.ok ? 'PO approved.' : 'Approve failed.'), result.ok ? 'success' : 'error');
    await loadPurchaseOrders();
    return;
  }
  if (sendButton) {
    const result = await window.posApi.purchaseOrders.sendToSupplier(Number(sendButton.dataset.sendPo), window.prompt('Supplier send notes') || '');
    showMessage(poMessage, result.message || (result.ok ? 'PO sent.' : 'Send failed.'), result.ok ? 'success' : 'error');
    await loadPurchaseOrders();
    return;
  }
  if (confirmButton) {
    const result = await window.posApi.purchaseOrders.confirmSupplier(Number(confirmButton.dataset.confirmPo), {
      supplierReferenceNumber: window.prompt('Supplier reference number') || '',
      expectedDate: window.prompt('Expected delivery date (YYYY-MM-DD)') || '',
      notes: window.prompt('Supplier confirmation notes') || ''
    });
    showMessage(poMessage, result.message || (result.ok ? 'Supplier confirmed.' : 'Confirm failed.'), result.ok ? 'success' : 'error');
    await loadPurchaseOrders();
    return;
  }
  if (receiveButton) {
    await loadPoDetails(Number(receiveButton.dataset.receivePo), true);
    return;
  }
  if (cancelButton) {
    if (!window.confirm('Cancel this purchase order?')) return;
    const result = await window.posApi.purchaseOrders.cancel(Number(cancelButton.dataset.cancelPo));
    showMessage(poMessage, result.message || (result.ok ? 'PO cancelled.' : 'Cancel failed.'), result.ok ? 'success' : 'error');
    await loadPurchaseOrders();
    return;
  }
  if (viewButton) await loadPoDetails(Number(viewButton.dataset.poId));
});

poDetailsPanel?.addEventListener('click', async (event) => {
  const sendPanelButton = event.target.closest('button[data-panel-send-po]');
  const confirmPanelButton = event.target.closest('button[data-panel-confirm-po]');
  const receivePanelButton = event.target.closest('button[data-panel-receive-po]');
  const invoiceButton = event.target.closest('button[data-create-po-invoice]');
  const button = event.target.closest('button[data-submit-receive-po]');
  if (sendPanelButton) {
    const result = await window.posApi.purchaseOrders.sendToSupplier(Number(sendPanelButton.dataset.panelSendPo), window.prompt('Supplier send notes') || '');
    showMessage(poMessage, result.message || (result.ok ? 'PO sent.' : 'Send failed.'), result.ok ? 'success' : 'error');
    await Promise.all([loadPurchaseOrders(), loadPoDetails(Number(sendPanelButton.dataset.panelSendPo))]);
    return;
  }
  if (confirmPanelButton) {
    const result = await window.posApi.purchaseOrders.confirmSupplier(Number(confirmPanelButton.dataset.panelConfirmPo), {
      supplierReferenceNumber: window.prompt('Supplier reference number') || '',
      expectedDate: window.prompt('Expected delivery date (YYYY-MM-DD)') || '',
      notes: window.prompt('Supplier confirmation notes') || ''
    });
    showMessage(poMessage, result.message || (result.ok ? 'Supplier confirmed.' : 'Confirm failed.'), result.ok ? 'success' : 'error');
    await Promise.all([loadPurchaseOrders(), loadPoDetails(Number(confirmPanelButton.dataset.panelConfirmPo))]);
    return;
  }
  if (receivePanelButton) {
    await loadPoDetails(Number(receivePanelButton.dataset.panelReceivePo), true);
    return;
  }
  if (invoiceButton) {
    const result = await window.posApi.purchaseOrders.createInvoice({
      goodsReceiptId: Number(invoiceButton.dataset.createPoInvoice),
      supplierInvoiceNumber: window.prompt('Supplier invoice number') || '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      discount: 0,
      tax: 0,
      paidAmount: Number(window.prompt('Paid amount', '0') || 0)
    });
    showMessage(poMessage, result.message || (result.ok ? 'Invoice created.' : 'Invoice failed.'), result.ok ? 'success' : 'error');
    const poId = Number(poDetailsPanel.dataset.poId);
    if (result.ok && poId) await Promise.all([loadPurchaseOrders(), loadPurchases(), loadSuppliers(), loadPoDetails(poId)]);
    return;
  }
  if (!button) return;
  const order = JSON.parse(poDetailsPanel.dataset.order || '{}');
  const items = Array.from(poDetailsPanel.querySelectorAll('input[data-receive-item]'))
    .map((input) => {
      const orderItem = (order.items || []).find((item) => Number(item.id) === Number(input.dataset.receiveItem));
      return {
        purchaseOrderItemId: Number(input.dataset.receiveItem),
        receivedQty: Number(input.value || 0),
        damagedQty: Number(poDetailsPanel.querySelector(`input[data-damaged-item="${input.dataset.receiveItem}"]`)?.value || 0),
        rejectedQty: Number(poDetailsPanel.querySelector(`input[data-rejected-item="${input.dataset.receiveItem}"]`)?.value || 0),
        cost: orderItem?.cost || 0,
        salePrice: orderItem?.salePrice || 0
      };
    })
    .filter((item) => item.receivedQty > 0);
  const restoreButton = setButtonLoading(button, 'Receiving...');
  try {
    const result = await window.posApi.purchaseOrders.receive({
      purchaseOrderId: Number(button.dataset.submitReceivePo),
      discount: document.querySelector('#poReceiveDiscount')?.value || 0,
      tax: document.querySelector('#poReceiveTax')?.value || 0,
      notes: document.querySelector('#poReceiveNotes')?.value || '',
      items
    });
    showMessage(poMessage, result.message || (result.ok ? 'Goods received.' : 'Receiving failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      await Promise.all([loadPurchaseOrders(), loadPurchases(), loadInventory(), loadMovements(), loadSuppliers()]);
      await loadPoDetails(Number(button.dataset.submitReceivePo));
    }
  } catch (error) {
    showMessage(poMessage, 'Goods receiving service is not available.');
  } finally {
    restoreButton();
  }
});

document.querySelectorAll('.catalogForm').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const result = await window.posApi.catalog.create(form.dataset.type, payload);
    showMessage(productMessage, result.message || (result.ok ? 'Saved.' : 'Save failed.'), result.ok ? 'success' : 'error');

    if (result.ok) {
      form.reset();
      await loadCatalog({
        categoryId: productFields.categoryId.value,
        brandId: productFields.brandId.value,
        unitId: productFields.unitId.value
      });
    }
  });
});

[categoryList, brandList, unitList].forEach((list) => {
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-catalog-id]');
    if (!button) return;
    const confirmed = window.confirm('Delete this catalog item?');
    if (!confirmed) return;
    const result = await window.posApi.catalog.delete(button.dataset.catalogType, Number(button.dataset.catalogId));
    showMessage(productMessage, result.message || (result.ok ? 'Deleted.' : 'Delete failed.'), result.ok ? 'success' : 'error');
    if (result.ok) {
      await loadCatalog({
        categoryId: productFields.categoryId.value,
        brandId: productFields.brandId.value,
        unitId: productFields.unitId.value
      });
    }
  });
});

window.addEventListener('online', () => {
  loadSyncStatus();
  if (getCurrentRoute() === '/sync') loadSyncQueue();
});

window.addEventListener('offline', () => {
  setSyncIndicator('Offline');
  if (getCurrentRoute() === '/sync') {
    showMessage(syncMessage, 'Offline mode is active. New actions will remain queued locally until connection returns.', 'success');
  }
});

window.setInterval(() => {
  if (!dashboard.classList.contains('hidden')) loadSyncStatus();
}, 30000);

restoreSession().catch(() => {
  showLogin();
});

loadAppInfo().catch(() => {});
