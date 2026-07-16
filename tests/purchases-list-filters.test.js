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

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
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

test('Purchases Today preset is an operational purchase-date filter, not a due-date shortcut', async () => {
  const { service, calls } = loadService();
  const result = await service.listPurchases({ datePreset: 'today', pageSize: '10' });
  const today = localDateString(new Date());

  assert.equal(result.ok, true);
  assert.equal(calls.filters[0].datePreset, 'today');
  assert.equal(calls.filters[0].dateFrom, today);
  assert.equal(calls.filters[0].dateTo, today);
  assert.equal(calls.filters[0].paymentStatus, '');
});

test('Purchases date presets normalize to purchase-date ranges and clear custom dates', async () => {
  const { service, calls } = loadService();

  await service.listPurchases({ datePreset: 'yesterday', dateFrom: '2026-01-01' });
  await service.listPurchases({ datePreset: '7' });
  await service.listPurchases({ datePreset: '30' });
  await service.listPurchases({ datePreset: 'month' });
  await service.listPurchases({ datePreset: 'last-month' });

  const today = new Date();
  const businessToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  assert.deepEqual(
    calls.filters.map((filters) => ({
      preset: filters.datePreset,
      from: filters.dateFrom,
      to: filters.dateTo,
    })),
    [
      {
        preset: 'yesterday',
        from: localDateString(addDays(businessToday, -1)),
        to: localDateString(addDays(businessToday, -1)),
      },
      {
        preset: '7',
        from: localDateString(addDays(businessToday, -6)),
        to: localDateString(businessToday),
      },
      {
        preset: '30',
        from: localDateString(addDays(businessToday, -29)),
        to: localDateString(businessToday),
      },
      {
        preset: 'month',
        from: localDateString(new Date(businessToday.getFullYear(), businessToday.getMonth(), 1)),
        to: localDateString(businessToday),
      },
      {
        preset: 'last-month',
        from: localDateString(
          new Date(businessToday.getFullYear(), businessToday.getMonth() - 1, 1)
        ),
        to: localDateString(new Date(businessToday.getFullYear(), businessToday.getMonth(), 0)),
      },
    ]
  );
});

test('Purchases custom date range composes with supplier, method, payment status, search, and tab filters', async () => {
  const { service, calls } = loadService();

  const result = await service.listPurchases({
    search: 'Blue Ocean',
    supplierId: '5',
    paymentMethod: 'Credit',
    paymentStatus: 'UNPAID',
    purchaseTab: 'PENDING',
    datePreset: 'custom',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    page: '2',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.filters[0], {
    search: 'Blue Ocean',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    datePreset: 'custom',
    supplierId: 5,
    paymentMethod: 'Credit',
    paymentStatus: 'UNPAID',
    purchaseTab: 'PENDING',
    page: 2,
    pageSize: 10,
  });
});

test('Purchases repository uses parameterized filters, pagination, and summary contract', () => {
  const repository = read(repositoryPath);
  assert.match(repository, /function buildPurchaseListFilter/);
  assert.match(repository, /LIMIT \$\{limitPlaceholder\} OFFSET \$\{offsetPlaceholder\}/);
  assert.match(repository, /COUNT\(\*\)::int AS total/);
  assert.match(repository, /COALESCE\(SUM\(purchases\.grand_total\), 0\)::numeric AS total_spend/);
  assert.match(repository, /LOWER\(purchases\.invoice_number\) LIKE \${placeholder}/);
  assert.match(repository, /purchases\.purchase_date >= \$\$\{params\.length\}::date/);
  assert.match(repository, /purchases\.purchase_date <= \$\$\{params\.length\}::date/);
  assert.match(repository, /paymentStatusSql\(\)/);
  assert.match(repository, /purchaseTabSql\(\)/);
  assert.doesNotMatch(repository, /due_date|payment_terms|days_overdue|maturity_date/i);
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
