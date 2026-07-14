const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const servicePath = path.join(root, 'src', 'main', 'features', 'inventory', 'inventory.service.js');
const repositoryPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory.repository.js'
);
const controllerPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory.controller.js'
);
const rendererPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory.renderer.js'
);
const apiPath = path.join(root, 'src', 'main', 'features', 'inventory', 'inventory.api.js');
const htmlPath = path.join(root, 'src', 'main', 'features', 'inventory', 'index.html');
const preloadPath = path.join(root, 'src', 'main', 'preload.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadInventoryService({ role = 'Admin', rows = [] } = {}) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  const calls = { activity: [], filters: [] };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return { getProfile: async () => ({ ok: true, profile: { id: 7, role } }) };
    }
    if (request === '../activity/activity.repository') {
      return { createActivityLog: async (entry) => calls.activity.push(entry) };
    }
    if (request === './inventory.repository') {
      return {
        listInventoryForExport: async (filters) => {
          calls.filters.push(filters);
          return rows;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return { service: require(servicePath), calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('Inventory toolbar exposes enabled CSV export and import launchers exactly once', () => {
  const html = read(htmlPath);
  assert.equal((html.match(/id="inventoryExportCsvButton"/g) || []).length, 1);
  assert.equal((html.match(/id="inventoryImportPreviewButton"/g) || []).length, 1);
  assert.match(
    html,
    /id="inventoryImportPreviewButton"[^>]*data-tool-action="import-preview"[^>]*>Import CSV<\/button>/
  );
  assert.match(
    html,
    /id="inventoryExportCsvButton"[^>]*data-tool-action="export-csv"[^>]*>Export CSV<\/button>/
  );
  assert.doesNotMatch(html, /data-tool-action="export-csv"[^>]*(disabled|aria-disabled="true")/);
  assert.doesNotMatch(
    html,
    /id="inventoryImportPreviewButton"[^>]*(disabled|aria-disabled="true")/
  );
});

test('Inventory renderer and preload expose only the narrow CSV export path', () => {
  const renderer = read(rendererPath);
  const api = read(apiPath);
  const preload = read(preloadPath);

  assert.match(renderer, /currentExportFilters/);
  assert.match(renderer, /_exportInFlight/);
  assert.match(renderer, /api\(\)\.exportCsv\(currentExportFilters\(\)\)/);
  assert.doesNotMatch(renderer, /require\(['"]fs|showSaveDialog|serializeInventoryRowsToCsv/);
  assert.match(api, /window\.posApi\.inventory\.exportCsv\(filters\)/);
  assert.match(
    preload,
    /exportCsv:\s*\(filters\) => ipcRenderer\.invoke\('\/inventory\/export\/csv', \{ filters \}\)/
  );
  assert.doesNotMatch(preload, /inventory:[\s\S]*showSaveDialog/);
});

test('Inventory controller owns save dialog, CSV filter, cancellation, and extension enforcement', () => {
  const controller = read(controllerPath);

  assert.match(controller, /dialog\.showSaveDialog\(windowFromEvent\(event\)/);
  assert.match(controller, /defaultPath: defaultName/);
  assert.match(controller, /extensions: \['csv'\]/);
  assert.match(controller, /canceled: true/);
  assert.match(controller, /ensureCsvExtension\(saveResult\.filePath\)/);
  assert.match(controller, /inventoryService\.exportInventoryCsv/);
});

test('Inventory repository provides a pagination-independent export query', () => {
  const repository = read(repositoryPath);

  assert.match(repository, /async function listInventoryForExport/);
  assert.match(repository, /categoryId/);
  assert.match(repository, /brandId/);
  assert.match(repository, /supplierId/);
  assert.match(repository, /stockStatus/);
  assert.match(repository, /limit: 300/);
  assert.doesNotMatch(
    repository.match(
      /async function listInventoryForExport[\s\S]*?return result\.rows\.map\(mapInventory\);/
    )?.[0] || '',
    /LIMIT 300/
  );
});

test('Inventory service exports all matching rows, writes CSV, and records success audit', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-export-'));
  const filePath = path.join(tmpDir, 'export.csv');
  const { service, calls } = loadInventoryService({
    rows: [
      { name: 'A', sku: 'A-1', currentStock: 2, minStockLevel: 1, status: 'IN_STOCK' },
      { name: 'B', sku: 'B-1', currentStock: 0, minStockLevel: 1, status: 'OUT_OF_STOCK' },
    ],
  });

  const result = await service.exportInventoryCsv({
    filePath,
    filters: {
      search: ' gum ',
      categoryId: '3',
      brandId: '4',
      supplierId: '5',
      stockStatus: 'low',
      inventoryTab: 'all',
      page: 9,
      pageSize: 1,
      unsafeSql: 'DROP',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.canceled, false);
  assert.equal(result.rowCount, 2);
  assert.equal(fs.readFileSync(filePath, 'utf8').charCodeAt(0), 0xfeff);
  assert.deepEqual(calls.filters[0], {
    search: 'gum',
    categoryId: 3,
    brandId: 4,
    supplierId: 5,
    stockStatus: 'low',
    inventoryTab: 'all',
  });
  assert.equal(calls.activity[0].action, 'inventory.export.csv');
  assert.equal(calls.activity[0].status, 'success');
  assert.equal(calls.activity[0].metadata.fileName, 'export.csv');
  assert.equal(calls.activity[0].metadata.rowCount, 2);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory export treats stale stock value tab state as the all-items view', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-export-stale-tab-'));
  const filePath = path.join(tmpDir, 'export.csv');
  const { service, calls } = loadInventoryService({
    rows: [{ name: 'A', sku: 'A-1', currentStock: 2, minStockLevel: 1, status: 'IN_STOCK' }],
  });

  const result = await service.exportInventoryCsv({
    filePath,
    filters: {
      inventoryTab: 'value',
      stockStatus: '',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.filters[0], {
    search: '',
    categoryId: null,
    brandId: null,
    supplierId: null,
    stockStatus: '',
    inventoryTab: 'all',
  });

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory service returns permission denied without writing a file', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-export-denied-'));
  const filePath = path.join(tmpDir, 'export.csv');
  const { service, calls } = loadInventoryService({ role: 'Guest', rows: [{ name: 'A' }] });

  const result = await service.exportInventoryCsv({ filePath, filters: {} });

  assert.equal(result.ok, false);
  assert.match(result.message, /permission/i);
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(calls.filters.length, 0);
  assert.equal(calls.activity.length, 0);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory service returns structured write failure and records failure audit', async () => {
  const filePath = path.join(os.tmpdir(), 'missing-inventory-export-dir', 'export.csv');
  const { service, calls } = loadInventoryService({ rows: [{ name: 'A' }] });

  const result = await service.exportInventoryCsv({ filePath, filters: {} });

  assert.equal(result.ok, false);
  assert.equal(result.canceled, false);
  assert.equal(result.rowCount, 0);
  assert.equal(calls.activity[0].action, 'inventory.export.csv');
  assert.equal(calls.activity[0].status, 'failed');
  assert.equal(calls.activity[0].metadata.fileName, 'export.csv');
});
