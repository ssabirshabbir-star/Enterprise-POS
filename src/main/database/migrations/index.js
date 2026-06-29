const migrations = [];

async function runDatabaseMigrations(client) {
  for (const migration of migrations) {
    await migration(client);
  }
}

module.exports = {
  runDatabaseMigrations,
};
