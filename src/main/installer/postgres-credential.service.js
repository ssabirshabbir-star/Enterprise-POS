const crypto = require('crypto');

function generateManagedPostgresPassword(options = {}) {
  const bytes = Number.isInteger(options.bytes) ? options.bytes : 32;
  if (bytes < 24) throw new Error('Managed PostgreSQL password entropy is too low.');
  return crypto.randomBytes(bytes).toString('base64url');
}

function redactConnectionFields(input = {}) {
  const output = { ...input };
  for (const key of Object.keys(output)) {
    if (/password|secret|token|connectionString|databaseUrl/i.test(key)) {
      output[key] = output[key] ? '[redacted]' : output[key];
    }
  }
  return output;
}

module.exports = {
  generateManagedPostgresPassword,
  redactConnectionFields,
};
