const recentLogs = [];
const MAX_LOGS = 100;

function sanitizeError(error) {
  if (!error) return null;
  return {
    name: String(error.name || 'Error'),
    message: String(error.message || error || ''),
    code: error.code ? String(error.code) : undefined,
  };
}

function safeLog(level, context, error, metadata) {
  try {
    recentLogs.push({
      at: new Date().toISOString(),
      level: String(level || 'error'),
      context: String(context || ''),
      error: sanitizeError(error),
      metadata: metadata && typeof metadata === 'object' ? { ...metadata } : undefined,
    });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  } catch {
    // Logging must never affect application flow.
  }
}

function logError(context, error, metadata) {
  safeLog('error', context, error, metadata);
}

function logWarn(context, error, metadata) {
  safeLog('warn', context, error, metadata);
}

function getRecentLogs() {
  return recentLogs.slice();
}

module.exports = {
  getRecentLogs,
  logError,
  logWarn,
};
