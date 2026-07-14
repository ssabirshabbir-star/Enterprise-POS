const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const servicePath = path.join(repoRoot, 'src/main/features/purchases/purchase.service.js');
const repositoryPath = path.join(repoRoot, 'src/main/features/purchases/purchase.repository.js');
const preloadPath = path.join(repoRoot, 'src/main/preload.js');
const controllerPath = path.join(repoRoot, 'src/main/features/purchases/purchase.controller.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadService({ role = 'Admin', repositoryResult = null } = {}) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  const calls = { filters: [] };
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return { getProfile: async () => ({ ok: true, profile: { id: 3, role } }) };
    }
    if (request === '../activity/activity.repository') {
      return { createActivityLog: async () => {} };
    }
    if (request === './purchase.repository') {
      return {
        listPurchases: async (filters) => {
          calls.filters.push(filters);
          return (
            repositoryResult || {
              purchases: [],
              pagination: {
                page: filters.page,
                pageSize: filters.pageSize,
                total: 0,
                totalPages: 1,
              },
              summary: { count: 0, spend: 0, paid: 0, due: 0, pendingCount: 0, paidCount: 0 },
            }
          );
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

test('Purchases list normalizes supported filters before repository access', async () => {
  const { service, calls } = loadService();
  const result = await service.listPurchases({
    search: ' INV-7 ',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-15',
    supplierId: '12',
    paymentMethod: 'Credit',
    paymentStatus: 'partial',
    purchaseTab: 'paid',
    page: '3',
    pageSize: '25',
    unexpected: 'ignored',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.filters[0], {
    search: 'INV-7',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-15',
    datePreset: '',
    supplierId: 12,
    paymentMethod: 'Credit',
    paymentStatus: 'PARTIAL',
    purchaseTab: 'PAID',
    page: 3,
    pageSize: 25,
  });
});

test('Purchases list rejects invalid date filters before repository access', async () => {
  const { service, calls } = loadService();

  const malformed = await service.listPurchases({ dateFrom: '07/01/2026' });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'PURCHASE_INVALID_DATE_FILTER');

  const reversed = await service.listPurchases({
    dateFrom: '2026-07-15',
    dateTo: '2026-07-01',
  });
  assert.equal(reversed.ok, false);
  assert.equal(reversed.code, 'PURCHASE_INVALID_DATE_RANGE');
  assert.equal(calls.filters.length, 0);
});

test('Purchases financial-year preset remains blocked without authoritative configuration', async () => {
  const { service, calls } = loadService();
  const result = await service.listPurchases({ datePreset: 'year' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PURCHASE_FINANCIAL_YEAR_UNSUPPORTED');
  assert.equal(calls.filters.length, 0);
});

test('Purchases repository uses parameterized filters, pagination, and summary contract', () => {
  const repository = read(repositoryPath);
  assert.match(repository, /function buildPurchaseListFilter/);
  assert.match(repository, /LIMIT \$\{limitPlaceholder\} OFFSET \$\{offsetPlaceholder\}/);
  assert.match(repository, /COUNT\(\*\)::int AS total/);
  assert.match(repository, /COALESCE\(SUM\(purchases\.grand_total\), 0\)::numeric AS total_spend/);
  assert.match(repository, /LOWER\(purchases\.invoice_number\) LIKE \${placeholder}/);
  assert.doesNotMatch(repository, /WHERE purchases\.deleted_at IS NULL[\s\S]*\+ filters\.search/);
});

test('Purchases API path carries filters through preload and controller', () => {
  const preload = read(preloadPath);
  const controller = read(controllerPath);
  assert.match(
    preload,
    /list:\s*\(filters\) => ipcRenderer\.invoke\('\/purchases\/list', filters \|\| \{\}\)/
  );
  assert.match(
    controller,
    /ipcMain\.handle\('\/purchases\/list', async \(_event, filters = \{\}\)/
  );
  assert.match(controller, /purchaseService\.listPurchases\(filters \|\| \{\}\)/);
});
