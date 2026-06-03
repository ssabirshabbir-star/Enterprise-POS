const { spawnSync } = require('child_process');

const files = [
  'src/main/main.js',
  'src/main/preload.js',
  'src/main/config/env.js',
  'src/main/database/connection.js',
  'src/main/database/schema.js',
  'src/main/features/deployment/version.service.js',
  'src/main/features/deployment/deployment.repository.js',
  'src/main/features/deployment/license.service.js',
  'src/main/features/deployment/update.service.js',
  'src/main/features/deployment/deployment.controller.js',
  'src/main/features/dashboard/index.js',
  'src/main/features/printing/printing.service.js',
  'src/main/features/purchase-orders/po.repository.js',
  'src/main/features/purchase-orders/po.service.js',
  'src/main/features/purchase-orders/po.controller.js',
  'src/main/features/lucky-draw/lucky-draw.repository.js',
  'src/main/features/lucky-draw/lucky-draw.service.js',
  'src/main/features/lucky-draw/lucky-draw.controller.js',
  'src/renderer/scripts/login.js',
  'scripts/db-health.js',
  'scripts/db-migrate.js',
  'scripts/first-run-setup.js',
  'scripts/generate.js'
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status);
}

console.log('Syntax/type check passed.');
