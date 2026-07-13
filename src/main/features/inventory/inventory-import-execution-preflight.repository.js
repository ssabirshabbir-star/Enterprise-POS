function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function uniqueIds(values = []) {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];
}

function collectCurrentStateInputs(commitPlan = {}) {
  const skus = [];
  const barcodes = [];
  const catalogs = { category: [], brand: [], unit: [], variant: [] };
  const productIds = [];
  for (const row of commitPlan.planRows || []) {
    if (row.normalizedSource?.sku) skus.push(row.normalizedSource.sku);
    if (row.normalizedSource?.barcode) barcodes.push(row.normalizedSource.barcode);
    if (row.matchedProduct?.productId) productIds.push(row.matchedProduct.productId);
    for (const [type, evidence] of Object.entries(row.catalogEvidence || {})) {
      if (evidence?.supplied && evidence.normalizedName && catalogs[type]) {
        catalogs[type].push(evidence.normalizedName);
      }
    }
  }
  return {
    skus: unique(skus),
    barcodes: unique(barcodes),
    catalogs: {
      category: unique(catalogs.category),
      brand: unique(catalogs.brand),
      unit: unique(catalogs.unit),
      variant: unique(catalogs.variant),
    },
    productIds: uniqueIds(productIds),
  };
}

function createInventoryImportExecutionPreflightRepository(dependencies = {}) {
  const repository = dependencies.matchingRepository || null;

  function readRepository() {
    return repository || require('./inventory-import-matching.repository');
  }

  async function readCurrentStateForCommitPlan(commitPlan = {}) {
    const matchingRepository = readRepository();
    const inputs = collectCurrentStateInputs(commitPlan);
    const productsResult = await matchingRepository.findProductsByIdentifiers({
      skus: inputs.skus,
      barcodes: inputs.barcodes,
    });
    if (!productsResult?.ok) return productsResult;

    const catalogsResult = await matchingRepository.findCatalogsByNames(inputs.catalogs);
    if (!catalogsResult?.ok) return catalogsResult;

    const warehouseResult = await matchingRepository.getDefaultWarehouse();
    if (!warehouseResult?.ok) return warehouseResult;

    const warehouseId = Number(warehouseResult.warehouse?.warehouseId);
    const shouldReadInventory = Number.isInteger(warehouseId) && warehouseId > 0 && inputs.productIds.length > 0;
    const inventoryTargetsResult = shouldReadInventory
      ? await matchingRepository.findInventoryTargets({ productIds: inputs.productIds, warehouseId })
      : { ok: true, inventoryTargets: [] };
    if (!inventoryTargetsResult?.ok) return inventoryTargetsResult;

    const movementSummariesResult = inputs.productIds.length
      ? await matchingRepository.summarizeStockMovements({ productIds: inputs.productIds })
      : { ok: true, movementSummaries: [] };
    if (!movementSummariesResult?.ok) return movementSummariesResult;

    return {
      ok: true,
      currentState: {
        products: productsResult.products || [],
        catalogs: catalogsResult.catalogs || { category: [], brand: [], unit: [], variant: [] },
        defaultWarehouse: warehouseResult.warehouse || null,
        inventoryTargets: inventoryTargetsResult.inventoryTargets || [],
        movementSummaries: movementSummariesResult.movementSummaries || [],
      },
    };
  }

  return Object.freeze({
    readCurrentStateForCommitPlan,
  });
}

const defaultRepository = createInventoryImportExecutionPreflightRepository();

module.exports = {
  collectCurrentStateInputs,
  createInventoryImportExecutionPreflightRepository,
  readCurrentStateForCommitPlan: defaultRepository.readCurrentStateForCommitPlan,
};
