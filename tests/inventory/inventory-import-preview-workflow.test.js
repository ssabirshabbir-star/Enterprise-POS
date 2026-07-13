const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const servicePath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory-import-preview.service.js'
);
const controllerPath = path.join(
  root,
  'src',
  'main',
  'features',
  'inventory',
  'inventory.controller.js'
);
const apiPath = path.join(root, 'src', 'main', 'features', 'inventory', 'inventory.api.js');
const htmlPath = path.join(root, 'src', 'main', 'features', 'inventory', 'index.html');
const preloadPath = path.join(root, 'src', 'main', 'preload.js');
const {
  TEMPLATE_HEADERS,
} = require('../../src/main/features/inventory/inventory-import-template.contract');
const {
  IMPORT_LIMITS,
} = require('../../src/main/features/inventory/inventory-import-template.contract');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function csvRow(values = {}) {
  return TEMPLATE_HEADERS.map((header) => values[header] ?? '').join(',');
}

async function writeCsv(filePath, rows) {
  await fsp.writeFile(
    filePath,
    `${TEMPLATE_HEADERS.join(',')}\r\n${rows.join('\r\n')}\r\n`,
    'utf8'
  );
}

function loadPreviewService({
  role = 'Admin',
  userId = 7,
  now = () => 1000,
  sessions = new Map(),
  fsMock = null,
  activityRepository = null,
  authService = null,
  maxPreviewSessions = 2,
} = {}) {
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  const activity = [];
  const auth = authService || {
    getProfile: async () => ({ ok: true, profile: { id: userId, role } }),
  };
  const logger = activityRepository || { createActivityLog: async (entry) => activity.push(entry) };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return auth;
    }
    if (request === '../activity/activity.repository') {
      return logger;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const module = require(servicePath);
    return {
      activity,
      module,
      service: module.createInventoryImportPreviewService({
        authService: auth,
        activityRepository: logger,
        fs: fsMock || fsp,
        now,
        previewSessions: sessions,
        previewSessionTtlMs: 1000,
        maxPreviewSessions,
      }),
    };
  } finally {
    Module._load = originalLoad;
  }
}

function loadInventoryController({ dialogMock, previewServiceMock } = {}) {
  delete require.cache[controllerPath];
  const originalLoad = Module._load;
  const handlers = new Map();
  const electronMock = {
    BrowserWindow: {
      fromWebContents: (sender) => ({ sender, id: 'test-window' }),
    },
    dialog: dialogMock,
  };
  const previewService = previewServiceMock || {
    requestImportPreview: async () => ({ ok: true }),
    getImportPreviewSession: async () => ({ ok: true }),
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    if (request === './inventory.service') {
      return {
        listInventory: async () => ({ ok: true }),
        listMovements: async () => ({ ok: true }),
        adjustStock: async () => ({ ok: true }),
        exportInventoryCsv: async () => ({ ok: true }),
        updateProductImage: async () => ({ ok: true }),
      };
    }
    if (request === './inventory-import-preview.service') return previewService;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const controller = require(controllerPath);
    controller.registerInventoryRoutes({
      handle: (route, handler) => handlers.set(route, handler),
    });
    return { handlers, previewService };
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
}

function statResult(size = 1, isFile = true) {
  return {
    size,
    mtimeMs: 123,
    isFile: () => isFile,
  };
}

function createBoundedReadFs(buffer, options = {}) {
  const state = {
    closed: false,
    totalBytesRead: 0,
    openCalled: false,
    statCalled: false,
  };
  return {
    state,
    fs: {
      stat: async () => {
        state.statCalled = true;
        return statResult(options.statSize ?? buffer.length, true);
      },
      open: async () => {
        state.openCalled = true;
        let offset = 0;
        return {
          read: async (target) => {
            if (options.failRead) {
              const error = new Error('simulated read failure C:\\secret\\inventory.csv');
              error.code = 'EIO';
              throw error;
            }
            const remaining = buffer.length - offset;
            if (remaining <= 0) return { bytesRead: 0 };
            const bytesRead = Math.min(target.length, remaining);
            buffer.copy(target, 0, offset, offset + bytesRead);
            offset += bytesRead;
            state.totalBytesRead += bytesRead;
            return { bytesRead };
          },
          close: async () => {
            state.closed = true;
          },
        };
      },
    },
  };
}

test('Inventory import preview service parses CSV and stores immutable owner-bound preview session', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-'));
  const filePath = path.join(tmpDir, 'import.csv');
  const sessions = new Map();
  await writeCsv(filePath, [
    csvRow({
      'Product Name': 'Flour',
      SKU: 'FLOUR-001',
      'Cost Price': '10.00',
      'Selling Price': '12.00',
      'Opening Quantity': '0',
    }),
    csvRow({
      SKU: 'STOCK-001',
      'Cost Price': '5.50',
      'Opening Quantity': '2.250',
    }),
  ]);

  const { service, activity } = loadPreviewService({ sessions });
  const result = await service.requestImportPreview({ filePath });

  assert.equal(result.ok, true);
  assert.equal(result.preview.kind, 'inventory_import_preview_document');
  assert.equal(Object.isFrozen(result.preview), true);
  assert.equal(result.preview.executable, false);
  assert.equal(result.preview.databaseMatched, false);
  assert.equal(result.preview.databaseWrite, false);
  assert.equal(result.preview.summary.totalRows, 2);
  assert.equal(result.preview.summary.productOnlyCandidateRows, 1);
  assert.equal(result.preview.summary.stockCandidateRows, 1);
  assert.equal(result.preview.rows[0].normalized.costPrice, '10.00');
  assert.equal(result.previewSession.kind, 'inventory_import_preview_session');
  assert.match(result.previewSession.sessionId, /^inventory-import-preview-/);
  assert.equal(sessions.size, 1);
  assert.equal(activity[0].action, 'inventory.import.preview.created');
  assert.equal(activity[0].status, 'success');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview service fails closed for permissions, non-CSV, and malformed CSV', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-denied-'));
  const csvPath = path.join(tmpDir, 'import.csv');
  const txtPath = path.join(tmpDir, 'import.txt');
  await writeCsv(csvPath, [csvRow({ SKU: 'SKU-1' })]);
  await fsp.writeFile(txtPath, 'not,csv', 'utf8');

  const denied = loadPreviewService({ role: 'Cashier' });
  const deniedResult = await denied.service.requestImportPreview({ filePath: csvPath });
  assert.equal(deniedResult.ok, false);
  assert.match(deniedResult.message, /permission/i);

  const allowed = loadPreviewService();
  const extensionResult = await allowed.service.requestImportPreview({ filePath: txtPath });
  assert.equal(extensionResult.ok, false);
  assert.match(extensionResult.message, /CSV/i);
  assert.equal(allowed.activity[0].action, 'inventory.import.preview.failed');

  await fsp.writeFile(csvPath, Buffer.from([0xc3, 0x28]));
  const invalidResult = await allowed.service.requestImportPreview({ filePath: csvPath });
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.status, 'invalid_file');
  assert.equal(invalidResult.errors[0].code, 'ERROR_INVALID_UTF8');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview session rejects stale and cross-owner access', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-session-'));
  const filePath = path.join(tmpDir, 'import.csv');
  const sessions = new Map();
  let clock = 1000;
  await writeCsv(filePath, [csvRow({ SKU: 'SKU-1' })]);

  const owner = loadPreviewService({ userId: 7, sessions, now: () => clock });
  const created = await owner.service.requestImportPreview({ filePath });
  assert.equal(created.ok, true);

  const current = await owner.service.getImportPreviewSession({
    sessionId: created.previewSession.sessionId,
  });
  assert.equal(current.ok, true);

  const otherUser = loadPreviewService({ userId: 8, sessions, now: () => clock });
  const crossOwner = await otherUser.service.getImportPreviewSession({
    sessionId: created.previewSession.sessionId,
  });
  assert.equal(crossOwner.ok, false);
  assert.equal(crossOwner.stale, true);

  clock = 2501;
  const stale = await owner.service.getImportPreviewSession({
    sessionId: created.previewSession.sessionId,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.stale, true);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview retains one active session per owner and evicts by capacity', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-capacity-'));
  const sessions = new Map();
  let clock = 1000;
  const serviceA = loadPreviewService({ userId: 1, sessions, now: () => clock }).service;
  const serviceB = loadPreviewService({ userId: 2, sessions, now: () => clock }).service;
  const serviceC = loadPreviewService({ userId: 3, sessions, now: () => clock }).service;
  const files = [];
  for (let index = 0; index < 4; index += 1) {
    const filePath = path.join(tmpDir, `import-${index}.csv`);
    await writeCsv(filePath, [csvRow({ SKU: `SKU-${index}` })]);
    files.push(filePath);
  }

  const firstA = await serviceA.requestImportPreview({ filePath: files[0] });
  clock += 1;
  const secondA = await serviceA.requestImportPreview({ filePath: files[1] });
  assert.equal(firstA.ok, true);
  assert.equal(secondA.ok, true);
  assert.equal(sessions.has(firstA.previewSession.sessionId), false);
  assert.equal(sessions.has(secondA.previewSession.sessionId), true);

  clock += 1;
  const resultB = await serviceB.requestImportPreview({ filePath: files[2] });
  clock += 1;
  const resultC = await serviceC.requestImportPreview({ filePath: files[3] });
  assert.equal(resultB.ok, true);
  assert.equal(resultC.ok, true);
  assert.equal(sessions.size, 2);
  assert.equal(sessions.has(secondA.previewSession.sessionId), false);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview service uses a bounded read and closes file handles', async () => {
  const validCsv = Buffer.from(`${TEMPLATE_HEADERS.join(',')}\r\n${csvRow({ SKU: 'SKU-1' })}\r\n`);
  const bounded = createBoundedReadFs(validCsv, { statSize: validCsv.length });
  const { service } = loadPreviewService({ fsMock: bounded.fs });

  const result = await service.requestImportPreview({ filePath: 'C:\\safe\\import.csv' });

  assert.equal(result.ok, true);
  assert.equal(bounded.state.statCalled, true);
  assert.equal(bounded.state.openCalled, true);
  assert.equal(bounded.state.totalBytesRead, validCsv.length);
  assert.equal(bounded.state.closed, true);
});

test('Inventory import preview service rejects file failures without sessions or raw path leakage', async () => {
  const cases = [
    {
      name: 'missing file during stat',
      fsMock: {
        stat: async () => {
          const error = new Error('ENOENT C:\\secret\\missing.csv');
          error.code = 'ENOENT';
          throw error;
        },
      },
    },
    {
      name: 'unreadable file during open',
      fsMock: {
        stat: async () => statResult(10, true),
        open: async () => {
          const error = new Error('EACCES C:\\secret\\locked.csv');
          error.code = 'EACCES';
          throw error;
        },
      },
    },
    {
      name: 'directory selected as file',
      fsMock: {
        stat: async () => statResult(0, false),
        open: async () => {
          throw new Error('open should not be called for directories');
        },
      },
    },
    {
      name: 'file deleted after stat before open',
      fsMock: {
        stat: async () => statResult(10, true),
        open: async () => {
          const error = new Error('ENOENT C:\\secret\\deleted.csv');
          error.code = 'ENOENT';
          throw error;
        },
      },
    },
  ];

  for (const failureCase of cases) {
    const sessions = new Map();
    const { service, activity } = loadPreviewService({ fsMock: failureCase.fsMock, sessions });
    const result = await service.requestImportPreview({ filePath: 'C:\\secret\\import.csv' });

    assert.equal(result.ok, false, failureCase.name);
    assert.equal(result.canceled, false, failureCase.name);
    assert.equal(sessions.size, 0, failureCase.name);
    assert(!String(result.message).includes('C:\\secret'), failureCase.name);
    assert(
      !activity.some((entry) => entry.action === 'inventory.import.preview.created'),
      failureCase.name
    );
  }
});

test('Inventory import preview service rejects files that grow after stat with max plus one bounded read', async () => {
  const oversized = Buffer.alloc(IMPORT_LIMITS.maxFileBytes + 1, 65);
  const bounded = createBoundedReadFs(oversized, { statSize: 1 });
  const sessions = new Map();
  const { service, activity } = loadPreviewService({ fsMock: bounded.fs, sessions });

  const result = await service.requestImportPreview({ filePath: 'C:\\safe\\grown.csv' });

  assert.equal(result.ok, false);
  assert.match(result.message, /larger than the import limit/i);
  assert.equal(sessions.size, 0);
  assert.equal(bounded.state.totalBytesRead, IMPORT_LIMITS.maxFileBytes + 1);
  assert.equal(bounded.state.closed, true);
  assert(!activity.some((entry) => entry.action === 'inventory.import.preview.created'));
});

test('Inventory import preview service accepts a short bounded read when a file shrinks after stat', async () => {
  const validCsv = Buffer.from(`${TEMPLATE_HEADERS.join(',')}\r\n${csvRow({ SKU: 'SKU-1' })}\r\n`);
  const bounded = createBoundedReadFs(validCsv, { statSize: IMPORT_LIMITS.maxFileBytes });
  const { service } = loadPreviewService({ fsMock: bounded.fs });

  const result = await service.requestImportPreview({ filePath: 'C:\\safe\\shrunk.csv' });

  assert.equal(result.ok, true);
  assert.equal(result.preview.sourceFile.sizeBytes, IMPORT_LIMITS.maxFileBytes);
  assert.equal(bounded.state.totalBytesRead, validCsv.length);
  assert.equal(bounded.state.closed, true);
});

test('Inventory import preview service preserves prior sessions after failed new selections', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-prior-'));
  const filePath = path.join(tmpDir, 'import.csv');
  await writeCsv(filePath, [csvRow({ SKU: 'SKU-1' })]);
  const sessions = new Map();
  const initial = loadPreviewService({ sessions, userId: 9 });
  const created = await initial.service.requestImportPreview({ filePath });
  assert.equal(created.ok, true);

  const priorSessionId = created.previewSession.sessionId;
  const readFailure = createBoundedReadFs(Buffer.from('bad'), { failRead: true });
  const failures = [
    loadPreviewService({ sessions, userId: 9, role: 'Cashier' }).service.requestImportPreview({
      filePath,
    }),
    loadPreviewService({ sessions, userId: 9 }).service.requestImportPreview({
      filePath: path.join(tmpDir, 'bad.txt'),
    }),
    loadPreviewService({
      sessions,
      userId: 9,
      fsMock: readFailure.fs,
    }).service.requestImportPreview({ filePath: 'C:\\safe\\read-fail.csv' }),
  ];
  const results = await Promise.all(failures);
  assert(results.every((result) => result.ok === false));
  assert(sessions.has(priorSessionId));
  assert.equal(readFailure.state.closed, true);

  const current = await loadPreviewService({ sessions, userId: 9 }).service.getImportPreviewSession(
    {
      sessionId: priorSessionId,
    }
  );
  assert.equal(current.ok, true);
  assert(!results.some((result) => result.preview || result.previewSession));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview activity logging failures do not change primary responses', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-log-'));
  const validPath = path.join(tmpDir, 'valid.csv');
  const invalidPath = path.join(tmpDir, 'invalid.csv');
  await writeCsv(validPath, [csvRow({ SKU: 'SKU-1' })]);
  await fsp.writeFile(invalidPath, Buffer.from([0xc3, 0x28]));
  const failingActivity = {
    createActivityLog: async () => {
      throw new Error('activity log unavailable');
    },
  };

  const success = await loadPreviewService({
    activityRepository: failingActivity,
  }).service.requestImportPreview({
    filePath: validPath,
  });
  const failure = await loadPreviewService({
    activityRepository: failingActivity,
  }).service.requestImportPreview({
    filePath: invalidPath,
  });

  assert.equal(success.ok, true);
  assert.equal(failure.ok, false);
  assert.equal(failure.status, 'invalid_file');

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview logs only safe metadata and no success before session storage', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-safe-log-'));
  const filePath = path.join(tmpDir, 'secret-location.csv');
  await writeCsv(filePath, [csvRow({ SKU: 'SKU-1' })]);
  const { service, activity } = loadPreviewService({ userId: 'invalid-owner' });

  const result = await service.requestImportPreview({ filePath });

  assert.equal(result.ok, false);
  assert(!activity.some((entry) => entry.action === 'inventory.import.preview.created'));
  assert.equal(activity[0].action, 'inventory.import.preview.failed');
  assert.equal(activity[0].metadata.fileName, 'secret-location.csv');
  assert(!JSON.stringify(activity).includes(tmpDir));
  assert(!JSON.stringify(activity).includes('SKU-1'));
  assert(!JSON.stringify(activity).includes('normalized'));

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview owner and role lifecycle remains backend authoritative', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'inventory-import-preview-owner-'));
  const filePath = path.join(tmpDir, 'import.csv');
  await writeCsv(filePath, [csvRow({ SKU: 'SKU-1' })]);
  const sessions = new Map();

  const warehouse = loadPreviewService({ sessions, userId: 11, role: 'Warehouse' });
  const created = await warehouse.service.requestImportPreview({
    filePath,
    ownerUserId: 999,
    permissions: { canCreateProducts: true },
  });
  assert.equal(created.ok, true);
  assert.equal(created.preview.permissions.canPreviewImport, true);
  assert.equal(created.preview.permissions.canCommitStock, true);
  assert.equal(created.preview.permissions.canCreateProducts, false);
  assert.equal(created.previewSession.ownerUserId, undefined);

  const spoofedOwner = await loadPreviewService({
    sessions,
    userId: 999,
    role: 'Warehouse',
  }).service.getImportPreviewSession({
    sessionId: created.previewSession.sessionId,
  });
  assert.equal(spoofedOwner.ok, false);
  assert.equal(spoofedOwner.stale, true);

  const unknown = await warehouse.service.getImportPreviewSession({
    sessionId: 'inventory-import-preview-11111111-1111-4111-8111-111111111111',
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.stale, true);

  const roleChanged = await loadPreviewService({
    sessions,
    userId: 11,
    role: 'Cashier',
  }).service.getImportPreviewSession({
    sessionId: created.previewSession.sessionId,
  });
  assert.equal(roleChanged.ok, false);
  assert.match(roleChanged.message, /permission/i);

  await fsp.rm(tmpDir, { recursive: true, force: true });
});

test('Inventory import preview controller cancel and dialog failures are executable and isolated', async () => {
  let requestedPath = null;
  const serviceCalls = [];
  const previewServiceMock = {
    requestImportPreview: async (request) => {
      serviceCalls.push(request);
      requestedPath = request.filePath;
      return { ok: true, selected: request.filePath };
    },
    getImportPreviewSession: async () => ({ ok: true }),
  };
  const dialogCalls = [];
  const dialogMock = {
    showOpenDialog: async (_window, options) => {
      dialogCalls.push(options);
      return { canceled: true, filePaths: ['C:\\ignored\\renderer.csv'] };
    },
  };
  const { handlers } = loadInventoryController({ dialogMock, previewServiceMock });
  const handler = handlers.get('/inventory/import/preview/request');

  const canceled = await handler(
    { sender: { id: 'sender' } },
    { filePath: 'C:\\renderer\\override.csv' }
  );
  assert.equal(canceled.ok, false);
  assert.equal(canceled.canceled, true);
  assert.equal(serviceCalls.length, 0);
  assert.deepEqual(dialogCalls[0].properties, ['openFile']);
  assert.equal(dialogCalls[0].properties.includes('multiSelections'), false);
  assert.deepEqual(dialogCalls[0].filters, [{ name: 'CSV Files', extensions: ['csv'] }]);

  dialogMock.showOpenDialog = async () => ({
    canceled: false,
    filePaths: ['C:\\dialog\\selected.csv'],
  });
  const selected = await handler(
    { sender: { id: 'sender' } },
    { filePath: 'C:\\renderer\\override.csv' }
  );
  assert.equal(selected.ok, true);
  assert.equal(requestedPath, 'C:\\dialog\\selected.csv');
  assert.equal(serviceCalls.length, 1);

  dialogMock.showOpenDialog = async () => {
    throw new Error('dialog exploded C:\\secret\\path.csv');
  };
  const failed = await handler({ sender: { id: 'sender' } });
  assert.equal(failed.ok, false);
  assert.equal(failed.canceled, false);
  assert(!String(failed.message).includes('C:\\secret'));
});

test('Inventory import preview controller and preload expose narrow CSV preview path while UI remains disabled', () => {
  const controller = read(controllerPath);
  const preload = read(preloadPath);
  const api = read(apiPath);
  const html = read(htmlPath);

  assert.match(controller, /dialog\.showOpenDialog\(windowFromEvent\(event\)/);
  assert.match(controller, /properties: \['openFile'\]/);
  assert.match(controller, /extensions: \['csv'\]/);
  assert.match(controller, /canceled: true/);
  assert.match(controller, /inventoryImportPreviewService\.requestImportPreview/);
  assert.match(controller, /inventoryImportPreviewService\.getImportPreviewSession/);
  assert.match(
    preload,
    /requestImportPreview:\s*\(\) => ipcRenderer\.invoke\('\/inventory\/import\/preview\/request'\)/
  );
  assert.match(
    preload,
    /getImportPreviewSession:\s*\(sessionId\) =>\s*ipcRenderer\.invoke\('\/inventory\/import\/preview\/session', \{ sessionId \}\)/
  );
  assert.match(api, /requestImportPreview/);
  assert.match(api, /getImportPreviewSession/);
  assert.match(
    html,
    /data-tool-action="import" disabled aria-disabled="true"[^>]*>Import Unavailable/
  );
});
