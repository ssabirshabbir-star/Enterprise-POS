const fs = require('fs');
const Module = require('module');
const path = require('path');

const externalNodeModules = process.env.ENTERPRISE_POS_EXTERNAL_NODE_MODULES;

if (externalNodeModules) {
  const dependencyRoot = path.resolve(externalNodeModules);

  if (!fs.existsSync(dependencyRoot) || !fs.statSync(dependencyRoot).isDirectory()) {
    throw new Error(`External dependency root does not exist: ${dependencyRoot}`);
  }

  process.env.NODE_PATH = [dependencyRoot, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();

  const originalResolveLookupPaths = Module._resolveLookupPaths;

  Module._resolveLookupPaths = function resolveLookupPaths(request, parent, newReturn) {
    const lookupPaths = originalResolveLookupPaths.call(this, request, parent, newReturn);

    if (Array.isArray(lookupPaths)) {
      if (newReturn || lookupPaths.every((entry) => typeof entry === 'string')) {
        return lookupPaths.includes(dependencyRoot) ? lookupPaths : [...lookupPaths, dependencyRoot];
      }

      const paths = Array.isArray(lookupPaths[1]) ? lookupPaths[1] : [];
      return [
        lookupPaths[0],
        paths.includes(dependencyRoot) ? paths : [...paths, dependencyRoot],
      ];
    }

    return lookupPaths;
  };
}

function printLaunchProvenance(app) {
  const appPath = app.getAppPath();
  const packageJsonPath = path.join(appPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const mainEntryPath = path.resolve(appPath, packageJson.main || 'index.js');
  const inventoryHtmlPath = path.join(appPath, 'src', 'main', 'features', 'inventory', 'index.html');

  console.log(`[enterprise-pos-launch] process.cwd=${process.cwd()}`);
  console.log(`[enterprise-pos-launch] app.getAppPath=${appPath}`);
  console.log(`[enterprise-pos-launch] package.json=${packageJsonPath}`);
  console.log(`[enterprise-pos-launch] loadedMainEntry=${mainEntryPath}`);
  console.log(`[enterprise-pos-launch] inventoryHtml=${inventoryHtmlPath}`);
  console.log(`[enterprise-pos-launch] dotenv=${require.resolve('dotenv')}`);
  console.log(`[enterprise-pos-launch] pg=${require.resolve('pg')}`);
}

if (process.env.ENTERPRISE_POS_LAUNCH_PROVENANCE === '1') {
  let printedLaunchProvenance = false;
  const originalLoad = Module._load;

  Module._load = function loadWithLaunchProvenance(request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);

    if (!printedLaunchProvenance && request === 'electron' && loaded?.app?.getAppPath) {
      printedLaunchProvenance = true;
      printLaunchProvenance(loaded.app);
    }

    return loaded;
  };
}
