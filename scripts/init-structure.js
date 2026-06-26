const fs = require('fs');
const path = require('path');

const folders = [
  'src/main/config',
  'src/main/core',
  'src/main/modules/auth',
  'src/main/modules/billing',
  'src/main/modules/products',
  'src/main/modules/inventory',
  'src/main/modules/customers',
  'src/main/modules/returns',
  'src/main/modules/reports',
  'src/main/modules/dashboard',
  'src/main/modules/settings',
  'src/main/modules/expenses',
  'src/main/modules/printing',
  'src/main/modules/sync',
  'src/main/modules/access-control',
  'src/main/modules/deployment',
  'src/main/modules/lucky-draw',
  'src/main/ipc',
  'src/main/database',
  'src/main/security',
  'src/renderer/pages',
  'src/renderer/components',
  'src/renderer/assets',
  'src/renderer/scripts',
  'src/renderer/styles',
  'src/shared/utils',
  'src/shared/types'
];

folders.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log('Created:', dir);
  } else {
    console.log('Already exists:', dir);
  }
});