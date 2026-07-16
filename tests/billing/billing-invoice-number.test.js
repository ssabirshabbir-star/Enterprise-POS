const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(repoRoot, 'src', 'main', 'features', 'billing', 'billing.service.js');
const repositoryPath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'billing',
  'billing.repository.js'
);
const connectionPath = path.join(repoRoot, 'src', 'main', 'database', 'connection.js');
const syncRepositoryPath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'sync',
  'sync.repository.js'
);
const luckyDrawV2RepositoryPath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'luckydraw_v2',
  'repository',
  'luckydraw.repository.js'
);
const rendererPath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'billing',
  'billing.renderer.js'
);
const printingServicePath = path.join(
  repoRoot,
  'src',
  'main',
  'features',
  'printing',
  'printing.service.js'
);
const schemaPath = path.join(repoRoot, 'src', 'main', 'database', 'schema.js');

const salePayload = {
  customerId: null,
  items: [{ productId: 7, quantity: 1, unitPrice: 25, discount: 0 }],
  discount: 0,
  tax: 0,
  paidAmount: 25,
  paymentMethod: 'Cash',
};

function clearBillingModules() {
  for (const target of [servicePath, repositoryPath]) {
    delete require.cache[target];
  }
}

function loadBillingService({ randomValues = [], randomInt } = {}) {
  clearBillingModules();
  const originalLoad = Module._load;
  const captured = {
    randomCalls: 0,
    createSalePayload: null,
    createSaleOptions: null,
    generatedInvoices: [],
  };
  const productPolicies = new Map([
    [
      7,
      {
        id: 7,
        salePrice: 25,
        allowSalePriceOverride: false,
        isActive: true,
      },
    ],
  ]);
  const repository = {
    getSaleProductPolicies: async () => productPolicies,
    createSale: async (payload, cashierId, options) => {
      captured.createSalePayload = payload;
      captured.cashierId = cashierId;
      captured.createSaleOptions = options;
      const invoiceNumber = options.invoiceNumberGenerator();
      captured.generatedInvoices.push(invoiceNumber);
      return { id: 99, invoice_number: invoiceNumber };
    },
    getSaleReceipt: async () => ({
      id: 99,
      invoiceNumber: captured.generatedInvoices.at(-1),
      createdAt: '2026-07-16T18:00:00.000Z',
      items: [],
    }),
  };
  const authService = {
    getProfile: async () => ({
      ok: true,
      profile: { id: 5, role: 'Admin', permissions: ['billing:write', 'billing:read'] },
    }),
  };
  const activityRepository = {
    createActivityLog: async () => ({}),
  };
  const cryptoMock = {
    randomInt: (min, max) => {
      if (typeof randomInt === 'function') {
        captured.randomCalls += 1;
        return randomInt(min, max);
      }
      const value = randomValues[captured.randomCalls] ?? captured.randomCalls;
      captured.randomCalls += 1;
      return value % max;
    },
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (request === 'crypto') return cryptoMock;
    if (resolved === repositoryPath) return repository;
    if (resolved.endsWith(path.join('auth', 'auth.service.js'))) return authService;
    if (resolved.endsWith(path.join('activity', 'activity.repository.js')))
      return activityRepository;
    return originalLoad.apply(this, arguments);
  };

  try {
    return { service: require(servicePath), captured };
  } finally {
    Module._load = originalLoad;
  }
}

function loadBillingRepository({ saleInsertFailures = [] } = {}) {
  clearBillingModules();
  const originalLoad = Module._load;
  const captured = {
    transactions: 0,
    insertedInvoices: [],
    queuedPayloads: [],
  };

  function fakeClient() {
    return {
      async query(sql, params = []) {
        if (/SELECT id FROM customers WHERE is_walk_in/i.test(sql)) {
          return { rows: [{ id: 1 }] };
        }
        if (/INSERT INTO sales/i.test(sql)) {
          const failure = saleInsertFailures.shift();
          if (failure) throw failure;
          captured.insertedInvoices.push(params[0]);
          return {
            rows: [
              {
                id: 51,
                invoice_number: params[0],
                grand_total: params[7],
              },
            ],
          };
        }
        if (/SELECT id FROM warehouses/i.test(sql)) {
          return { rows: [] };
        }
        if (/SELECT id, current_stock, min_stock_level, is_active FROM products/i.test(sql)) {
          return { rows: [{ id: 7, current_stock: 10, min_stock_level: 2, is_active: true }] };
        }
        return { rows: [], rowCount: 1 };
      },
    };
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === connectionPath) {
      return {
        getPool: () => ({ query: async () => ({ rows: [] }) }),
        withTransaction: async (callback) => {
          captured.transactions += 1;
          return callback(fakeClient());
        },
      };
    }
    if (resolved === syncRepositoryPath) {
      return {
        getOrCreateTerminal: async () => ({ id: 3 }),
        queueOperation: async ({ payload }) => {
          captured.queuedPayloads.push(payload);
        },
      };
    }
    if (resolved === luckyDrawV2RepositoryPath) {
      return { createEntriesForSale: async () => [] };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return { repository: require(repositoryPath), captured };
  } finally {
    Module._load = originalLoad;
  }
}

test('new Billing invoice numbers use short secure ambiguity-safe public format', async () => {
  const { service, captured } = loadBillingService();

  const result = await service.completeSale(salePayload);
  const invoiceNumber = result.receipt.invoiceNumber;

  assert.equal(result.ok, true);
  assert.match(invoiceNumber, /^INV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
  assert.equal(invoiceNumber.length, 14);
  assert.doesNotMatch(invoiceNumber.slice(4), /[01ILO]/);
  assert.equal(captured.randomCalls >= 10, true);
  assert.equal(captured.createSalePayload.invoiceNumber, undefined);
  assert.equal(captured.createSaleOptions.maxInvoiceAttempts, 8);
});

test('high-volume Billing invoice generation remains unique and receipt-width friendly', async () => {
  let state = 17;
  const { service, captured } = loadBillingService({
    randomInt: (_min, max) => {
      state = (state * 1103515245 + 12345) >>> 0;
      return state % max;
    },
  });

  for (let index = 0; index < 250; index += 1) {
    const result = await service.completeSale(salePayload);
    assert.equal(result.ok, true);
  }

  const uniqueInvoices = new Set(captured.generatedInvoices);
  assert.equal(uniqueInvoices.size, 250);
  for (const invoiceNumber of uniqueInvoices) {
    assert.match(invoiceNumber, /^INV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    assert.equal(invoiceNumber.length <= 14, true);
  }
});

test('concurrent Billing sale completions receive distinct stored invoice numbers', async () => {
  let state = 91;
  const { service, captured } = loadBillingService({
    randomInt: (_min, max) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state % max;
    },
  });

  const results = await Promise.all(
    Array.from({ length: 40 }, () => service.completeSale(salePayload))
  );

  assert.equal(
    results.every((result) => result.ok),
    true
  );
  assert.equal(new Set(captured.generatedInvoices).size, 40);
});

test('Billing invoice generator uses crypto randomInt and excludes date, host, and sequence leakage', () => {
  const source = fs.readFileSync(servicePath, 'utf8');
  const generatorSource =
    source.match(/function generateInvoiceNumber\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(generatorSource, /crypto\.randomInt/);
  assert.doesNotMatch(
    generatorSource,
    /Math\.random|Date\.now|new Date|hostname|POS_TERMINAL_CODE|process\.env|BIGSERIAL|id/
  );
  assert.match(generatorSource, /INV-/);
});

test('sale repository generates invoice inside transaction and retries whole transaction on invoice collision', async () => {
  const collision = new Error('duplicate key value violates unique constraint');
  collision.code = '23505';
  collision.constraint = 'idx_sales_invoice_unique';
  const { repository, captured } = loadBillingRepository({ saleInsertFailures: [collision] });
  const generated = ['INV-AAAA222222', 'INV-BBBB333333'];

  const sale = await repository.createSale(
    {
      customerId: null,
      subtotal: 25,
      discount: 0,
      tax: 0,
      grandTotal: 25,
      paidAmount: 25,
      changeAmount: 0,
      dueAmount: 0,
      paymentMethod: 'Cash',
      items: [{ productId: 7, quantity: 1, unitPrice: 25, discount: 0, total: 25 }],
    },
    5,
    {
      invoiceNumberGenerator: () => generated.shift(),
      maxInvoiceAttempts: 2,
    }
  );

  assert.equal(sale.invoice_number, 'INV-BBBB333333');
  assert.deepEqual(captured.insertedInvoices, ['INV-BBBB333333']);
  assert.equal(captured.transactions, 2);
  assert.equal(captured.queuedPayloads[0].invoiceNumber, 'INV-BBBB333333');
});

test('invoice number remains database-stored and reused by receipt, reports, search, and returns surfaces', () => {
  const printingSource = fs.readFileSync(printingServicePath, 'utf8');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const schemaSource = fs.readFileSync(schemaPath, 'utf8');

  assert.match(
    schemaSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_unique ON sales \(LOWER\(invoice_number\)\)/
  );
  assert.match(rendererSource, /res\.receipt\?\.invoiceNumber/);
  assert.doesNotMatch(
    rendererSource,
    /generateInvoiceNumber|crypto\.randomInt|Math\.random|Date\.now\(\).*invoice/i
  );
  assert.match(printingSource, /receipt\.invoiceNumber/);
  assert.doesNotMatch(printingSource, /generateInvoiceNumber|crypto\.randomInt|Math\.random/);
});
