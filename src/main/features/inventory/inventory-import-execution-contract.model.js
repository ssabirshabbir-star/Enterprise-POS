const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const {
  PRODUCT_ACTIONS,
  STOCK_ACTIONS,
  assertPlainData,
  deepFreezePlainData,
} = require('./inventory-import-commit-plan.model');

const IMPORT_EXECUTION_CONTRACT_KIND = 'inventory_import_execution_contract';
const IMPORT_EXECUTION_CONTRACT_VERSION = 'inventory-import-execution-contract-v1';

const IMPORT_EXECUTION_STOCK_STRATEGIES = Object.freeze({
  PRODUCT_INITIAL_STOCK: 'PRODUCT_INITIAL_STOCK',
  UNSUPPORTED: 'UNSUPPORTED',
  NO_STOCK: 'NO_STOCK',
});

const IMPORT_EXECUTION_POLICY_CODES = Object.freeze({
  EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED: 'EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED',
  NEW_PRODUCT_INITIAL_STOCK_SUPPORTED: 'NEW_PRODUCT_INITIAL_STOCK_SUPPORTED',
});

const IMPORT_EXECUTION_CONTRACT_ERROR_CODES = Object.freeze({
  INVALID_CONTRACT: 'INVENTORY_IMPORT_EXECUTION_CONTRACT_INVALID',
  UNSUPPORTED_COMBINATION: 'INVENTORY_IMPORT_EXECUTION_CONTRACT_UNSUPPORTED_COMBINATION',
});

class InventoryImportExecutionContractError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportExecutionContractError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportExecutionContractError(code, message, field);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function digestExecutionContractContent(content) {
  return createHash('sha256').update(canonicalStringify(content), 'utf8').digest('hex');
}

function baseContractContent() {
  return {
    kind: IMPORT_EXECUTION_CONTRACT_KIND,
    version: IMPORT_EXECUTION_CONTRACT_VERSION,
    schemaVersion: 1,
    immutable: true,
    supportedProductActions: [PRODUCT_ACTIONS.CREATE_PRODUCT, PRODUCT_ACTIONS.USE_EXISTING_PRODUCT],
    supportedStockCombinations: [
      {
        productAction: PRODUCT_ACTIONS.CREATE_PRODUCT,
        stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK,
        strategy: IMPORT_EXECUTION_STOCK_STRATEGIES.PRODUCT_INITIAL_STOCK,
        movementType: 'INITIAL_STOCK',
        referenceType: 'product.create',
        reason: 'Opening stock',
        doubleApplicationAllowed: false,
        policyCode: IMPORT_EXECUTION_POLICY_CODES.NEW_PRODUCT_INITIAL_STOCK_SUPPORTED,
      },
      {
        productAction: PRODUCT_ACTIONS.CREATE_PRODUCT,
        stockAction: STOCK_ACTIONS.NO_STOCK_ACTION,
        strategy: IMPORT_EXECUTION_STOCK_STRATEGIES.NO_STOCK,
        movementType: null,
        referenceType: null,
        reason: null,
        doubleApplicationAllowed: false,
        policyCode: null,
      },
      {
        productAction: PRODUCT_ACTIONS.USE_EXISTING_PRODUCT,
        stockAction: STOCK_ACTIONS.NO_STOCK_ACTION,
        strategy: IMPORT_EXECUTION_STOCK_STRATEGIES.NO_STOCK,
        movementType: null,
        referenceType: null,
        reason: null,
        doubleApplicationAllowed: false,
        policyCode: null,
      },
    ],
    unsupportedStockCombinations: [
      {
        productAction: PRODUCT_ACTIONS.USE_EXISTING_PRODUCT,
        stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK,
        strategy: IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED,
        reasonCode: IMPORT_EXECUTION_POLICY_CODES.EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED,
      },
    ],
    batchPolicy: {
      atomic: true,
      partialExecution: false,
      blockedRowsPreventCommitReady: true,
      skippedRowsPreventCommitReady: false,
    },
    requirements: {
      transaction: true,
      replayProtection: true,
      auditPersistence: true,
      executionConfirmation: true,
      finalPermissionRevalidation: true,
      finalCurrentStateRevalidation: true,
      noSkuGeneration: true,
      noBarcodeGeneration: true,
      noSilentRematching: true,
    },
  };
}

function createInventoryImportExecutionContract(input = {}) {
  assertPlainData(input, 'executionContractInput');
  if (Object.keys(input || {}).length) {
    fail(
      IMPORT_EXECUTION_CONTRACT_ERROR_CODES.INVALID_CONTRACT,
      'Inventory import execution contract does not accept caller overrides.',
      'executionContract'
    );
  }
  const content = baseContractContent();
  const contractDigest = digestExecutionContractContent(content);
  return deepFreezePlainData({ ...content, contractDigest }, 'executionContract');
}

function validateInventoryImportExecutionContract(contract) {
  const expected = createInventoryImportExecutionContract();
  if (
    !contract ||
    contract.kind !== IMPORT_EXECUTION_CONTRACT_KIND ||
    contract.version !== IMPORT_EXECUTION_CONTRACT_VERSION ||
    contract.schemaVersion !== 1 ||
    contract.immutable !== true ||
    !Object.isFrozen(contract) ||
    !/^[0-9a-f]{64}$/i.test(String(contract.contractDigest || '')) ||
    !isDeepStrictEqual(contract, expected)
  ) {
    fail(
      IMPORT_EXECUTION_CONTRACT_ERROR_CODES.INVALID_CONTRACT,
      'An immutable inventory import execution contract is required.',
      'executionContract'
    );
  }
  return contract;
}

function findExecutionStockPolicy(productAction, stockAction) {
  const contract = createInventoryImportExecutionContract();
  const supported = contract.supportedStockCombinations.find(
    (item) => item.productAction === productAction && item.stockAction === stockAction
  );
  if (supported) return supported;
  const unsupported = contract.unsupportedStockCombinations.find(
    (item) => item.productAction === productAction && item.stockAction === stockAction
  );
  if (unsupported) return unsupported;
  return null;
}

function isSupportedExecutionCombination(productAction, stockAction) {
  const policy = findExecutionStockPolicy(productAction, stockAction);
  return Boolean(policy && policy.strategy !== IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED);
}

function requireSupportedExecutionCombination(productAction, stockAction) {
  const policy = findExecutionStockPolicy(productAction, stockAction);
  if (!policy || policy.strategy === IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED) {
    fail(
      IMPORT_EXECUTION_CONTRACT_ERROR_CODES.UNSUPPORTED_COMBINATION,
      'Inventory import execution action combination is not supported.',
      'executionAction'
    );
  }
  return policy;
}

module.exports = {
  IMPORT_EXECUTION_CONTRACT_ERROR_CODES,
  IMPORT_EXECUTION_CONTRACT_KIND,
  IMPORT_EXECUTION_CONTRACT_VERSION,
  IMPORT_EXECUTION_POLICY_CODES,
  IMPORT_EXECUTION_STOCK_STRATEGIES,
  InventoryImportExecutionContractError,
  createInventoryImportExecutionContract,
  digestExecutionContractContent,
  findExecutionStockPolicy,
  isSupportedExecutionCombination,
  requireSupportedExecutionCombination,
  validateInventoryImportExecutionContract,
};
