const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function pngBuffer(width = 96, height = 96) {
  const buffer = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

function loadSettingsService({ profileResult, currentStore, saveImpl, activityImpl } = {}) {
  const servicePath = path.join(
    repoRoot,
    'src',
    'main',
    'features',
    'settings',
    'settings.service.js'
  );
  delete require.cache[servicePath];
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === '../auth/auth.service') {
      return {
        getProfile: async () =>
          profileResult || {
            ok: true,
            profile: { id: 7, role: 'Admin', permissions: [] },
          },
      };
    }
    if (request === '../activity/activity.repository') {
      return {
        createActivityLog:
          activityImpl ||
          (async () => ({
            ok: true,
          })),
      };
    }
    if (request === './settings.repository') {
      return {
        getSettings: async () => ({
          store: currentStore || {
            storeName: 'Enterprise POS',
            logoPath: 'C:\\brand\\logo.png',
            receiptFooterText: 'Existing footer',
          },
          tax: { enabled: true, defaultTaxPercentage: 17, mode: 'included' },
          printer: { paperWidth: '80mm', receiptCopies: 1 },
          system: { currencySymbol: 'PKR' },
        }),
        saveStoreSettings:
          saveImpl ||
          (async (store) => ({
            store,
            tax: {},
            printer: {},
            system: {},
          })),
        saveSettings: async () => {
          throw new Error('broad saveSettings must not be used by Store Settings');
        },
      };
    }
    if (request === '../restore-engine/restore-engine.service') {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('Store Settings tab is available while disabled settings tabs remain disabled', () => {
  const html = read('src/main/features/settings/index.html');

  assert.match(html, /data-settings-tab="store"[^>]*>Store Settings<\/button>/);
  assert.doesNotMatch(html, /data-settings-tab="store"[^>]*(?:disabled|aria-disabled="true")/);
  for (const tab of ['tax', 'printer', 'system', 'updates', 'license', 'about']) {
    assert.match(html, new RegExp(`data-settings-tab="${tab}"[^>]*disabled`));
    assert.match(html, new RegExp(`data-settings-tab="${tab}"[^>]*aria-disabled="true"`));
  }

  for (const id of ['storeName', 'storePhone', 'storeEmail', 'storeTaxNumber', 'storeAddress']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.doesNotMatch(html, new RegExp(`id="${id}"[^>]*disabled`));
  }
  assert.doesNotMatch(html, /id="storeLogoPath"/);
  assert.match(html, /id="storeLogoPreview"/);
  assert.match(html, /id="chooseStoreLogoButton"[^>]*>Choose Logo<\/button>/);
  assert.match(html, /id="removeStoreLogoButton"[^>]*>Remove Logo<\/button>/);
  assert.match(html, /<textarea id="storeReceiptFooter"/);
  assert.doesNotMatch(html, /id="storeReceiptFooter"[^>]*disabled/);
  assert.match(html, /id="savePrinterSettingsButton"[^>]*>Save Settings Disabled<\/button>/);
  assert.match(html, /id="saveStoreSettingsButton"/);
});

test('Store Settings exposes a narrow save route without activating restore', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const preload = read('src/main/preload.js');
  const api = read('src/main/features/settings/settings.api.js');
  const repository = read('src/main/features/settings/settings.repository.js');
  const storeSave = repository.slice(
    repository.indexOf('async function saveStoreSettings'),
    repository.indexOf('async function exportBackup')
  );

  assert.match(controller, /\/settings\/store\/save/);
  assert.match(controller, /\/settings\/store\/logo\/select/);
  assert.match(controller, /\/settings\/store\/logo\/preview/);
  assert.match(
    controller,
    /showOpenDialog\(windowFromEvent\(event\), \{[\s\S]*extensions:\s*\['png', 'jpg', 'jpeg'\]/
  );
  assert.match(
    preload,
    /saveStore:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/store\/save', payload\)/
  );
  assert.match(
    preload,
    /chooseStoreLogo:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/store\/logo\/select'\)/
  );
  assert.match(
    preload,
    /getStoreLogoPreview:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('\/settings\/store\/logo\/preview'\)/
  );
  assert.match(api, /async function saveStoreSettings/);
  assert.match(api, /async function chooseStoreLogo/);
  assert.match(api, /async function getStoreLogoPreview/);
  assert.match(api, /saveStoreSettings,/);
  assert.match(storeSave, /INSERT INTO app_settings \(key, value, updated_by, updated_at\)/);
  assert.match(storeSave, /VALUES \('store', \$1::jsonb, \$2, NOW\(\)\)/);
  assert.doesNotMatch(storeSave, /printer_settings|SETTING_KEYS|payload\.tax|payload\.system/);
  assert.doesNotMatch(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
});

test('Settings API wrapper calls only the Store Settings preload method', async () => {
  const source = read('src/main/features/settings/settings.api.js');
  const calls = [];
  const window = {
    posApi: {
      app: { info: () => ({ ok: true }) },
      settings: {
        saveStore: (payload) => calls.push(['saveStore', payload]) || { ok: true },
        chooseStoreLogo: () => calls.push(['chooseStoreLogo']) || { ok: true, cancelled: true },
        getStoreLogoPreview: () => calls.push(['getStoreLogoPreview']) || { ok: true },
      },
    },
  };

  vm.runInNewContext(source, { window });
  assert.equal(typeof window.SettingsApi.saveStoreSettings, 'function');
  await window.SettingsApi.saveStoreSettings({ storeName: 'Updated Store' });
  await window.SettingsApi.chooseStoreLogo();
  await window.SettingsApi.getStoreLogoPreview();
  assert.deepEqual(calls, [
    ['saveStore', { storeName: 'Updated Store' }],
    ['chooseStoreLogo'],
    ['getStoreLogoPreview'],
  ]);
});

test('Store Settings save persists receipt footer and preserves non-certified logo field', async () => {
  const calls = [];
  const activities = [];
  const service = loadSettingsService({
    currentStore: {
      storeName: 'Enterprise POS',
      logoPath: 'C:\\brand\\logo.png',
      receiptFooterText: 'Existing footer',
    },
    saveImpl: async (store, userId) => {
      calls.push({ store, userId });
      return { store, tax: {}, printer: {}, system: {} };
    },
    activityImpl: async (activity) => {
      activities.push(activity);
      return { ok: true };
    },
  });

  const result = await service.saveStoreSettings({
    storeName: '  Grocery POS Market  ',
    phone: ' 03001234567 ',
    email: ' owner@example.com ',
    address: ' Main Road ',
    taxNumber: ' NTN-123 ',
    receiptFooterText: ' Thank you!\r\nWe hope to see you again soon. ',
    logoPath: 'C:\\unsafe\\new.png',
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 7);
  assert.deepEqual(calls[0].store, {
    storeName: 'Grocery POS Market',
    phone: '03001234567',
    email: 'owner@example.com',
    address: 'Main Road',
    taxNumber: 'NTN-123',
    receiptFooterText: 'Thank you!\nWe hope to see you again soon.',
    logoPath: 'C:\\brand\\logo.png',
  });
  assert.equal(activities[0].action, 'settings.store.save');
  assert.deepEqual(activities[0].metadata.changedFields, [
    'storeName',
    'phone',
    'email',
    'address',
    'taxNumber',
    'receiptFooterText',
  ]);
});

test('Store logo selection validates files and persists only a managed logo token', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-logo-'));
  const sourceLogo = path.join(tempRoot, 'selected.png');
  fs.writeFileSync(sourceLogo, pngBuffer(128, 96));
  const calls = [];
  const activities = [];
  const service = loadSettingsService({
    currentStore: {
      storeName: 'Enterprise POS',
      logoPath: '',
      receiptFooterText: '',
    },
    saveImpl: async (store) => {
      calls.push(store);
      return { store, tax: {}, printer: {}, system: {} };
    },
    activityImpl: async (activity) => {
      activities.push(activity);
      return { ok: true };
    },
  });

  const selected = await service.prepareStoreLogoSelection(sourceLogo, tempRoot);
  assert.equal(selected.ok, true);
  assert.equal(selected.fileName, 'selected.png');
  assert.match(selected.previewDataUrl, /^data:image\/png;base64,/);
  assert.equal(selected.width, 128);
  assert.equal(selected.height, 96);

  const saved = await service.saveStoreSettings(
    {
      storeName: 'Enterprise POS',
      logoToken: selected.logoToken,
    },
    tempRoot
  );

  assert.equal(saved.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].logoPath, /store-assets[\\/]+logos[\\/]+business-logo-/);
  assert.equal(fs.existsSync(calls[0].logoPath), true);
  assert.equal(fs.existsSync(sourceLogo), true);
  assert.ok(activities[0].metadata.changedFields.includes('logoPath'));
});

test('Store logo selection rejects unsafe files without saving Store Settings', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-logo-invalid-'));
  const textFile = path.join(tempRoot, 'logo.txt');
  const corruptPng = path.join(tempRoot, 'logo.png');
  const tinyPng = path.join(tempRoot, 'tiny.png');
  fs.writeFileSync(textFile, 'not an image');
  fs.writeFileSync(corruptPng, Buffer.from('89504e470d0a1a0a0000', 'hex'));
  fs.writeFileSync(tinyPng, pngBuffer(32, 32));
  let saved = false;
  const service = loadSettingsService({
    saveImpl: async () => {
      saved = true;
      return {};
    },
  });

  const wrongExt = await service.prepareStoreLogoSelection(textFile, tempRoot);
  assert.equal(wrongExt.ok, false);
  assert.match(wrongExt.message, /Unsupported logo type/);

  const corrupt = await service.prepareStoreLogoSelection(corruptPng, tempRoot);
  assert.equal(corrupt.ok, false);
  assert.match(corrupt.message, /corrupt|file type/);

  const tooSmall = await service.prepareStoreLogoSelection(tinyPng, tempRoot);
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.message, /at least 64 x 64/);
  assert.equal(saved, false);
});

test('Store logo removal clears only managed logo references after Store Settings save', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-logo-remove-'));
  const managedDir = path.join(tempRoot, 'store-assets', 'logos');
  fs.mkdirSync(managedDir, { recursive: true });
  const oldLogo = path.join(managedDir, 'business-logo-old.png');
  fs.writeFileSync(oldLogo, pngBuffer(96, 96));
  const calls = [];
  const service = loadSettingsService({
    currentStore: {
      storeName: 'Enterprise POS',
      logoPath: oldLogo,
      receiptFooterText: '',
    },
    saveImpl: async (store) => {
      calls.push(store);
      return { store, tax: {}, printer: {}, system: {} };
    },
  });

  const result = await service.saveStoreSettings(
    {
      storeName: 'Enterprise POS',
      logoAction: 'remove',
    },
    tempRoot
  );

  assert.equal(result.ok, true);
  assert.equal(calls[0].logoPath, '');
  assert.equal(fs.existsSync(oldLogo), false);
});

test('Store logo save failure cleans the new managed copy and preserves the source file', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-logo-save-fail-'));
  const sourceLogo = path.join(tempRoot, 'selected.png');
  fs.writeFileSync(sourceLogo, pngBuffer(96, 96));
  const service = loadSettingsService({
    currentStore: {
      storeName: 'Enterprise POS',
      logoPath: '',
      receiptFooterText: '',
    },
    saveImpl: async () => {
      throw new Error('database unavailable');
    },
  });

  const selected = await service.prepareStoreLogoSelection(sourceLogo, tempRoot);
  assert.equal(selected.ok, true);
  await assert.rejects(
    () =>
      service.saveStoreSettings(
        {
          storeName: 'Enterprise POS',
          logoToken: selected.logoToken,
        },
        tempRoot
      ),
    /database unavailable/
  );

  const managedFiles = fs
    .readdirSync(path.join(tempRoot, 'store-assets', 'logos'), { recursive: true })
    .filter((entry) => String(entry).includes('business-logo-'));
  assert.deepEqual(managedFiles, []);
  assert.equal(fs.existsSync(sourceLogo), true);
});

test('Store Settings save allows blank footer and rejects invalid footer input', async () => {
  const calls = [];
  const service = loadSettingsService({
    saveImpl: async (store) => {
      calls.push(store);
      return { store, tax: {}, printer: {}, system: {} };
    },
  });

  const blankFooter = await service.saveStoreSettings({
    storeName: 'Enterprise POS',
    receiptFooterText: '   ',
  });
  assert.equal(blankFooter.ok, true);
  assert.equal(calls[0].receiptFooterText, '');

  const markup = await service.saveStoreSettings({
    storeName: 'Enterprise POS',
    receiptFooterText: '<b>Thanks</b>',
  });
  assert.equal(markup.ok, false);
  assert.match(markup.message, /HTML markup/);

  const tooLong = await service.saveStoreSettings({
    storeName: 'Enterprise POS',
    receiptFooterText: 'x'.repeat(501),
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /500 characters/);
});

test('Store Settings save rejects blank names, invalid email, and unauthorized users', async () => {
  let saved = false;
  const service = loadSettingsService({
    saveImpl: async () => {
      saved = true;
      return {};
    },
  });

  const blank = await service.saveStoreSettings({ storeName: '   ', email: '' });
  assert.equal(blank.ok, false);
  assert.match(blank.message, /Business name is required/);

  const badEmail = await service.saveStoreSettings({
    storeName: 'Enterprise POS',
    email: 'not-an-email',
  });
  assert.equal(badEmail.ok, false);
  assert.match(badEmail.message, /valid email/);
  assert.equal(saved, false);

  const unauthorized = loadSettingsService({
    profileResult: { ok: false, message: 'Authentication required.' },
  });
  const denied = await unauthorized.saveStoreSettings({ storeName: 'Enterprise POS' });
  assert.equal(denied.ok, false);
  assert.equal(denied.message, 'Authentication required.');
});

test('receipt branding continues to read authoritative store settings', () => {
  const printingService = read('src/main/features/printing/printing.service.js');
  const printingRepository = read('src/main/features/printing/printing.repository.js');

  assert.match(printingRepository, /SELECT value FROM app_settings WHERE key = 'store'/);
  assert.match(printingService, /getStoreSettingsRow/);
  assert.match(printingService, /businessName:\s*cleanText\(store\.storeName\)/);
  assert.match(printingService, /storeAddress:\s*cleanText\(store\.address\)/);
  assert.match(printingService, /storePhone:\s*cleanText\(store\.phone\)/);
  assert.match(printingService, /storeEmail:\s*cleanText\(store\.email\)/);
  assert.match(printingService, /storeTaxNumber:\s*cleanText\(store\.taxNumber\)/);
});
