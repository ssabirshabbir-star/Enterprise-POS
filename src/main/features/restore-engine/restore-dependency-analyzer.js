const validationResult = require('./restore-validation-result.model');

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function duplicates(values) {
  return unique(values.filter((value, index) => values.indexOf(value) !== index));
}

function tableName(table) {
  return cleanString(table?.name);
}

function dependencyReferences(table) {
  return normalizeList(table?.dependencies || table?.dependsOn || table?.requiredTables);
}

function hasDependencyDeclaration(table) {
  return (
    Object.prototype.hasOwnProperty.call(table || {}, 'dependencies') ||
    Object.prototype.hasOwnProperty.call(table || {}, 'dependsOn') ||
    Object.prototype.hasOwnProperty.call(table || {}, 'requiredTables')
  );
}

function dependencyCheck(
  id,
  passed,
  message,
  details = {},
  severity = validationResult.VALIDATION_SEVERITIES.ERROR
) {
  return validationResult.createValidationCheck(id, passed, message, details, severity);
}

function circularDependencies(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(node, trail) {
    if (visiting.has(node)) {
      const start = trail.indexOf(node);
      cycles.push([...trail.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    const refs = graph[node] || [];
    refs.forEach((ref) => visit(ref, [...trail, ref]));
    visiting.delete(node);
    visited.add(node);
  }

  Object.keys(graph).forEach((node) => visit(node, [node]));
  const deduped = new Map();
  cycles.forEach((cycle) => {
    const key = [...new Set(cycle)].sort().join('|');
    if (!deduped.has(key)) deduped.set(key, cycle);
  });
  return [...deduped.values()];
}

function analyzeDependencies({ manifest = null, packageSummary = {} } = {}) {
  const coverage = manifest?.coverageDeclaration || {};
  const includedTables = Array.isArray(coverage.includedTables) ? coverage.includedTables : [];
  const declaredTables = includedTables.map(tableName).filter(Boolean);
  const duplicateTableNames = duplicates(declaredTables);
  const declarations = includedTables.map((table) => {
    const name = tableName(table);
    const references = dependencyReferences(table);
    return {
      table: name || null,
      dependencyDeclared: hasDependencyDeclaration(table),
      references,
      duplicateReferences: duplicates(references),
      selfReferences: references.filter((ref) => ref === name),
      unknownReferences: references.filter((ref) => !declaredTables.includes(ref)),
    };
  });
  const knownReferenceGraph = declarations.reduce((graph, declaration) => {
    if (!declaration.table) return graph;
    graph[declaration.table] = declaration.references.filter((ref) => declaredTables.includes(ref));
    return graph;
  }, {});
  const missingDependencyDeclarations = declarations
    .filter((declaration) => declaration.table && !declaration.dependencyDeclared)
    .map((declaration) => declaration.table);
  const duplicateDependencyDeclarations = declarations.filter(
    (declaration) => declaration.duplicateReferences.length
  );
  const selfDependencies = declarations.filter((declaration) => declaration.selfReferences.length);
  const unknownDependencyReferences = declarations.filter(
    (declaration) => declaration.unknownReferences.length
  );
  const cycles = circularDependencies(knownReferenceGraph);

  const checks = [
    dependencyCheck(
      'dependency.manifest.present',
      Boolean(manifest),
      'Manifest is available for dependency assessment.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    dependencyCheck(
      'dependency.tables.present',
      declaredTables.length > 0,
      'Declared table list is available for dependency assessment.',
      { declaredTableCount: declaredTables.length },
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    dependencyCheck(
      'dependency.table_names.unique',
      duplicateTableNames.length === 0,
      'Declared table names are unique.',
      { duplicateTableNames }
    ),
    dependencyCheck(
      'dependency.declarations.present',
      missingDependencyDeclarations.length === 0,
      'Dependency declarations are present for declared tables.',
      { missingDependencyDeclarations },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    dependencyCheck(
      'dependency.references.known',
      unknownDependencyReferences.length === 0,
      'Dependency references point to declared tables.',
      { unknownDependencyReferences }
    ),
    dependencyCheck(
      'dependency.references.unique',
      duplicateDependencyDeclarations.length === 0,
      'Dependency references are not duplicated within a table declaration.',
      { duplicateDependencyDeclarations }
    ),
    dependencyCheck(
      'dependency.self_references.absent',
      selfDependencies.length === 0,
      'Dependency declarations do not reference their own table.',
      { selfDependencies }
    ),
    dependencyCheck(
      'dependency.cycles.absent',
      cycles.length === 0,
      'Dependency declarations do not contain circular references.',
      { cycles }
    ),
  ];
  const report = validationResult.createValidationResult({
    status: validationResult.VALIDATION_STATUSES.PASSED,
    message: 'Read-only Restore dependency assessment completed. Restore remains unavailable.',
    packageSummary,
    checks,
  });

  return freeze({
    assessmentType: 'restore_dependency_assessment',
    dependencyStatus: report.validationStatus,
    status: report.status,
    readOnly: true,
    assessmentOnly: true,
    dependencyOnly: true,
    noRestoreExecuted: true,
    noRestorePlanCreated: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    dependencySummary: {
      declaredTableCount: declaredTables.length,
      declaredTables,
      declarations,
      missingDependencyDeclarations,
      unknownDependencyReferences,
      duplicateDependencyDeclarations,
      selfDependencies,
      circularDependencies: cycles,
    },
    findings: report.findings,
    summary: report.summary,
    severitySummary: report.severitySummary,
    message: report.message,
  });
}

module.exports = {
  analyzeDependencies,
};
