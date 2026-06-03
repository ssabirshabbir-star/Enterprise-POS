const { loadEnvironment } = require('../src/main/config/env');
const { initializeDatabase } = require('../src/main/database/schema');
const { closeDatabase } = require('../src/main/database/connection');

async function run() {
  loadEnvironment();
  await initializeDatabase();
  console.log('Database schema verified/migrated successfully.');
}

run()
  .catch((error) => {
    console.error(`Database migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
