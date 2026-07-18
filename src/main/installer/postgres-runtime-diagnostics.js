const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DLL_FAMILY_PATTERNS = Object.freeze([
  /^libpq\.dll$/i,
  /^libssl.*\.dll$/i,
  /^libcrypto.*\.dll$/i,
  /^libiconv.*\.dll$/i,
  /^libintl.*\.dll$/i,
  /^icu.*\.dll$/i,
  /^zlib.*\.dll$/i,
  /^lz4.*\.dll$/i,
  /^zstd.*\.dll$/i,
  /^libxml2.*\.dll$/i,
  /^libxslt.*\.dll$/i,
  /^vcruntime.*\.dll$/i,
  /^msvcp.*\.dll$/i,
]);

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function fileSummary(filePath) {
  const exists = Boolean(filePath && fs.existsSync(filePath));
  if (!exists) return { path: filePath, exists: false };
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    exists: true,
    size: stats.size,
    sha256: stats.isFile() ? sha256File(filePath) : null,
  };
}

function walkFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        output.push(fullPath);
      }
    }
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function buildInventory(root) {
  return walkFiles(root).map((filePath) => {
    const stats = fs.statSync(filePath);
    return {
      relativePath: path.relative(root, filePath).replace(/\\/g, '/'),
      size: stats.size,
      sha256: sha256File(filePath),
    };
  });
}

function summarizeDirectory(root) {
  const inventory = buildInventory(root);
  return {
    path: root,
    exists: Boolean(root && fs.existsSync(root)),
    fileCount: inventory.length,
    files: inventory,
  };
}

function dllFamilyPresence(binDir, libDir) {
  const files = [...walkFiles(binDir), ...walkFiles(libDir)];
  return DLL_FAMILY_PATTERNS.map((pattern) => {
    const matches = files
      .filter((filePath) => pattern.test(path.basename(filePath)))
      .map((filePath) => path.relative(path.dirname(binDir), filePath).replace(/\\/g, '/'))
      .sort();
    return {
      pattern: pattern.source,
      present: matches.length > 0,
      matches,
    };
  });
}

function parsePeArchitecture(pePath) {
  const buffer = fs.readFileSync(pePath);
  const peOffset = buffer.readUInt32LE(0x3c);
  const signature = buffer.toString('ascii', peOffset, peOffset + 4);
  if (signature !== 'PE\u0000\u0000') {
    throw new Error(`File is not a PE executable: ${pePath}`);
  }
  const machine = buffer.readUInt16LE(peOffset + 4);
  const map = {
    0x014c: 'x86',
    0x8664: 'x64',
    0xaa64: 'arm64',
  };
  return {
    machine,
    architecture: map[machine] || `unknown-0x${machine.toString(16)}`,
  };
}

function readNullTerminatedAscii(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.toString('ascii', offset, end);
}

function sectionTable(buffer, peOffset) {
  const sectionCount = buffer.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const sectionOffset = peOffset + 24 + optionalHeaderSize;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * 40;
    sections.push({
      name: readNullTerminatedAscii(buffer, offset),
      virtualSize: buffer.readUInt32LE(offset + 8),
      virtualAddress: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      rawPointer: buffer.readUInt32LE(offset + 20),
    });
  }
  return sections;
}

function rvaToOffset(sections, rva) {
  for (const section of sections) {
    const span = Math.max(section.virtualSize, section.rawSize);
    if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
      return section.rawPointer + (rva - section.virtualAddress);
    }
  }
  return null;
}

function readPeImports(pePath) {
  const buffer = fs.readFileSync(pePath);
  const peOffset = buffer.readUInt32LE(0x3c);
  const signature = buffer.toString('ascii', peOffset, peOffset + 4);
  if (signature !== 'PE\u0000\u0000') {
    throw new Error(`File is not a PE executable: ${pePath}`);
  }
  const optionalOffset = peOffset + 24;
  const magic = buffer.readUInt16LE(optionalOffset);
  const dataDirectoryOffset = optionalOffset + (magic === 0x20b ? 112 : 96);
  const importRva = buffer.readUInt32LE(dataDirectoryOffset + 8);
  if (!importRva) return [];
  const sections = sectionTable(buffer, peOffset);
  const importOffset = rvaToOffset(sections, importRva);
  if (importOffset === null) return [];
  const imports = [];
  for (let offset = importOffset; offset < buffer.length; offset += 20) {
    const nameRva = buffer.readUInt32LE(offset + 12);
    const firstThunk = buffer.readUInt32LE(offset + 16);
    if (nameRva === 0 && firstThunk === 0) break;
    const nameOffset = rvaToOffset(sections, nameRva);
    if (nameOffset !== null) imports.push(readNullTerminatedAscii(buffer, nameOffset));
  }
  return [...new Set(imports)].sort((a, b) => a.localeCompare(b));
}

function resolveImport(importName, searchDirs) {
  for (const searchDir of searchDirs) {
    const candidate = path.join(searchDir, importName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function analyzePeDependencies(entryFiles, searchDirs) {
  const byName = new Map();
  const pending = entryFiles.filter((filePath) => fs.existsSync(filePath));
  const visited = new Set();
  while (pending.length > 0) {
    const filePath = pending.pop();
    const key = path.resolve(filePath).toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);
    let imports = [];
    let architecture = null;
    let parseError = null;
    try {
      imports = readPeImports(filePath);
      architecture = parsePeArchitecture(filePath);
    } catch (error) {
      parseError = error.message;
    }
    const resolvedImports = imports.map((importName) => {
      const resolvedPath = resolveImport(importName, searchDirs);
      if (resolvedPath && !visited.has(path.resolve(resolvedPath).toLowerCase())) {
        pending.push(resolvedPath);
      }
      return {
        name: importName,
        resolvedPath,
        resolved: Boolean(resolvedPath),
      };
    });
    byName.set(filePath, {
      path: filePath,
      architecture,
      imports: resolvedImports,
      parseError,
    });
  }
  const missing = [];
  for (const entry of byName.values()) {
    for (const dependency of entry.imports) {
      if (!dependency.resolved) {
        missing.push({ importer: entry.path, name: dependency.name });
      }
    }
  }
  return {
    searchDirs,
    files: [...byName.values()],
    missing,
  };
}

function redactArgs(args, sensitivePaths = []) {
  return args.map((arg) => {
    const text = String(arg);
    if (sensitivePaths.some((sensitivePath) => sensitivePath && text === sensitivePath)) {
      return '<redacted-sensitive-path>';
    }
    return text;
  });
}

function postgresCommandEnvironment(binDir, extra = {}, baseEnv = process.env) {
  const currentPath = baseEnv.PATH || baseEnv.Path || '';
  return {
    ...baseEnv,
    ...extra,
    PGCONNECT_TIMEOUT: extra.PGCONNECT_TIMEOUT || baseEnv.PGCONNECT_TIMEOUT || '5',
    PATH: [binDir, currentPath].filter(Boolean).join(path.delimiter),
  };
}

function postgresCommandOptions(executablePath, extra = {}) {
  const binDir = path.dirname(executablePath);
  return {
    cwd: binDir,
    env: postgresCommandEnvironment(binDir, extra.env || {}),
    timeoutMs: extra.timeoutMs,
  };
}

function relevantPathEntries(env = process.env) {
  return String(env.PATH || env.Path || '')
    .split(path.delimiter)
    .filter((entry) => /postgres|pgsql|managed-postgres|enterprise pos/i.test(entry));
}

function buildInitdbLaunchDiagnostics({
  command,
  args,
  cwd,
  env,
  dataDir,
  passwordFile,
  runtimeRoot,
  result = null,
} = {}) {
  const binDir = path.join(runtimeRoot, 'pgsql', 'bin');
  const libDir = path.join(runtimeRoot, 'pgsql', 'lib');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const searchDirs = [
    binDir,
    cwd,
    path.join(systemRoot, 'System32'),
    path.join(systemRoot, 'SysWOW64'),
    ...String(env?.PATH || '')
      .split(path.delimiter)
      .filter(Boolean),
  ];
  const uniqueSearchDirs = [...new Set(searchDirs.filter(Boolean))];
  const entryFiles = [
    command,
    path.join(binDir, 'postgres.exe'),
    path.join(binDir, 'pg_ctl.exe'),
    path.join(binDir, 'psql.exe'),
    path.join(binDir, 'createdb.exe'),
  ];
  let dependencyAnalysis = null;
  try {
    dependencyAnalysis = analyzePeDependencies(entryFiles, uniqueSearchDirs);
  } catch (error) {
    dependencyAnalysis = { error: error.message };
  }
  return {
    timestampUtc: new Date().toISOString(),
    executable: fileSummary(command),
    args: redactArgs(args, [passwordFile]),
    cwd,
    dataDir,
    passwordFile: {
      present: Boolean(passwordFile && fs.existsSync(passwordFile)),
      path: passwordFile ? '<redacted-sensitive-path>' : null,
    },
    environment: {
      pathRelevantEntries: relevantPathEntries(env),
      pathStartsWithPostgresBin: String(env?.PATH || '').split(path.delimiter)[0] === binDir,
      PATHEXT: env?.PATHEXT || process.env.PATHEXT || null,
      PROCESSOR_ARCHITECTURE:
        env?.PROCESSOR_ARCHITECTURE || process.env.PROCESSOR_ARCHITECTURE || null,
      PROCESSOR_ARCHITEW6432:
        env?.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITEW6432 || null,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
    },
    runtimeRoot,
    bin: summarizeDirectory(binDir),
    lib: summarizeDirectory(libDir),
    dllFamilyPresence: dllFamilyPresence(binDir, libDir),
    dependencyAnalysis,
    result: result
      ? {
          pid: result.pid || null,
          processCreated: Boolean(result.processCreated),
          exitCode: result.exitCode,
          signal: result.signal,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          elapsedMs: result.elapsedMs,
          error: result.error || null,
        }
      : null,
  };
}

module.exports = {
  analyzePeDependencies,
  buildInitdbLaunchDiagnostics,
  buildInventory,
  fileSummary,
  parsePeArchitecture,
  postgresCommandEnvironment,
  postgresCommandOptions,
  readPeImports,
  sha256File,
  summarizeDirectory,
};
