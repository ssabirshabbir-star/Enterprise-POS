const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src');
const docsDir = path.join(rootDir, 'docs');

const textExtensions = new Set(['.js', '.cjs', '.mjs', '.html', '.css', '.md']);
const skippedDirs = new Set(['.git', 'node_modules', 'release', 'dist', 'out']);

const databaseAccessPattern = /getPool\s*\(|\.query\s*\(/i;
const rendererBoundaryPattern = /\bipcRenderer\b|getPool\s*\(|\.query\s*\(/i;
const consolePattern =
  /console\.(log|warn|error)|process\.stdout|process\.stderr|\bstdout\b|\bstderr\b/;
const posApiPattern = /window\.posApi/;

const pendingEnterpriseFeatures = [
  { label: 'Variants', terms: ['variants', 'variations', 'product variations'] },
  { label: 'Multi-Unit', terms: ['multi-unit', 'multi unit', 'unit conversion'] },
  { label: 'FIFO', terms: ['fifo'] },
  { label: 'FEFO', terms: ['fefo'] },
  { label: 'Promotions', terms: ['promotions', 'promotional pricing'] },
  { label: 'Branch Pricing', terms: ['branch pricing', 'branch price'] },
  { label: 'Customer Pricing', terms: ['customer pricing', 'customer-specific price'] },
  { label: 'Price Lists', terms: ['price lists', 'advanced price lists'] },
];

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function walkFiles(startDir) {
  const files = [];
  if (!fs.existsSync(startDir)) return files;

  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;

    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findMatches(files, pattern, filter = () => true) {
  const matches = [];

  for (const file of files) {
    const content = read(file);
    if (!filter(file, content)) continue;

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        matches.push({
          file: toRelative(file),
          line: index + 1,
          text: line.trim(),
        });
      }
      pattern.lastIndex = 0;
    });
  }

  return matches;
}

function isRepositoryOrDatabase(file) {
  const relative = toRelative(file);
  return (
    relative.startsWith('src/main/database/') ||
    relative.endsWith('.repository.js') ||
    relative.includes('/repository/')
  );
}

function isService(file) {
  return toRelative(file).endsWith('.service.js');
}

function isController(file) {
  return toRelative(file).endsWith('.controller.js');
}

function isRendererRuntime(file) {
  const relative = toRelative(file);
  return (
    relative.startsWith('src/renderer/') ||
    relative.endsWith('.renderer.js') ||
    relative.endsWith('.api.js')
  );
}

function isMainProcessRuntime(file) {
  const relative = toRelative(file);
  return (
    relative.startsWith('src/main/') &&
    path.extname(file) === '.js' &&
    !relative.endsWith('.renderer.js') &&
    !relative.endsWith('.api.js') &&
    !relative.endsWith('.seeder.js')
  );
}

function getGodFileReport(files) {
  return files
    .map((file) => {
      const content = read(file);
      const lines = content.split(/\r?\n/).length;
      let status = 'ok';
      if (lines > 1000) status = 'must split';
      else if (lines > 500) status = 'warning';

      return {
        file: toRelative(file),
        lines,
        status,
      };
    })
    .filter((entry) => entry.status !== 'ok')
    .sort((a, b) => b.lines - a.lines);
}

function getPendingRegisterReport() {
  const docsFiles = walkFiles(docsDir);
  const searchableDocs = docsFiles
    .filter((file) => path.extname(file).toLowerCase() === '.md')
    .map((file) => read(file).toLowerCase())
    .join('\n');

  return pendingEnterpriseFeatures
    .filter((feature) => !feature.terms.some((term) => searchableDocs.includes(term)))
    .map((feature) => ({ feature: feature.label, status: 'missing from docs' }));
}

function printTable(title, rows, emptyMessage) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (!rows.length) {
    console.log(emptyMessage);
    return;
  }

  rows.forEach((row) => {
    if (row.text) {
      console.log(`${row.file}:${row.line} ${row.text}`);
      return;
    }

    if (row.lines) {
      console.log(`${row.file} - ${row.lines} lines (${row.status})`);
      return;
    }

    if (row.feature) {
      console.log(`${row.feature} - ${row.status}`);
    }
  });
}

function main() {
  const allSourceFiles = walkFiles(sourceDir);
  const mainRuntimeFiles = allSourceFiles.filter(isMainProcessRuntime);
  const rendererFiles = allSourceFiles.filter(isRendererRuntime);

  const sqlOutsideAllowedLayers = findMatches(
    mainRuntimeFiles,
    databaseAccessPattern,
    (file) => !isRepositoryOrDatabase(file)
  );

  const serviceSqlMatches = findMatches(mainRuntimeFiles.filter(isService), databaseAccessPattern);
  const controllerSqlMatches = findMatches(
    mainRuntimeFiles.filter(isController),
    databaseAccessPattern
  );
  const rendererBoundaryMatches = findMatches(rendererFiles, rendererBoundaryPattern);
  const rendererWithoutPosApi = rendererFiles
    .filter((file) => path.extname(file) === '.js')
    .filter((file) => {
      const content = read(file);
      return file.endsWith('.api.js') && !posApiPattern.test(content);
    })
    .map((file) => ({
      file: toRelative(file),
      line: 1,
      text: 'renderer API wrapper does not reference window.posApi',
    }));
  const consoleMatches = findMatches(mainRuntimeFiles, consolePattern);
  const godFiles = getGodFileReport(allSourceFiles);
  const missingPendingFeatures = getPendingRegisterReport();

  console.log('Enterprise POS Architecture Compliance Report');
  console.log('Mode: report-only, non-blocking');

  printTable(
    'Repository Rule: SQL outside repository/database',
    sqlOutsideAllowedLayers,
    'No matches found.'
  );
  printTable('Service Rule: SQL/getPool in services', serviceSqlMatches, 'No matches found.');
  printTable(
    'Controller Rule: SQL/getPool in controllers',
    controllerSqlMatches,
    'No matches found.'
  );
  printTable(
    'Renderer Rule: ipcRenderer/getPool/SQL in renderer/API files',
    rendererBoundaryMatches,
    'No matches found.'
  );
  printTable(
    'Renderer Rule: API wrappers without window.posApi',
    rendererWithoutPosApi,
    'No matches found.'
  );
  printTable(
    'Console Rule: main-process console/stdout/stderr usage',
    consoleMatches,
    'No matches found.'
  );
  printTable('God File Report: files over 500 lines', godFiles, 'No files over project limits.');
  printTable(
    'Pending Register: deferred enterprise features missing from docs',
    missingPendingFeatures,
    'All tracked deferred features are documented.'
  );

  console.log('\nSummary');
  console.log('-------');
  console.log(`SQL boundary findings: ${sqlOutsideAllowedLayers.length}`);
  console.log(`Service boundary findings: ${serviceSqlMatches.length}`);
  console.log(`Renderer boundary findings: ${rendererBoundaryMatches.length}`);
  console.log(`Main-process logging findings: ${consoleMatches.length}`);
  console.log(`God file findings: ${godFiles.length}`);
  console.log(`Pending register gaps: ${missingPendingFeatures.length}`);
  console.log('\nResult: report generated. This command is non-blocking by design.');
}

main();
