const { getPool } = require('../../database/connection');

const TABLES = Object.freeze({
  categories: 'categories',
  brands: 'brands',
  units: 'units'
});

function assertTable(table) {
  if (!TABLES[table]) {
    throw new Error('Invalid catalog table');
  }
  return TABLES[table];
}

function mapCatalog(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    shortName: row.short_name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listCatalog(table) {
  const tableName = assertTable(table);
  const result = await getPool().query(
    `
      SELECT *
      FROM ${tableName}
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `
  );
  return result.rows.map(mapCatalog);
}

async function createCatalog(table, payload) {
  const tableName = assertTable(table);
  const isUnit = tableName === 'units';
  const result = await getPool().query(
    isUnit
      ? `
          INSERT INTO units (name, short_name, is_active)
          VALUES ($1, $2, $3)
          RETURNING *
        `
      : `
          INSERT INTO ${tableName} (name, description, is_active)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
    isUnit ? [payload.name, payload.shortName, payload.isActive] : [payload.name, payload.description, payload.isActive]
  );
  return mapCatalog(result.rows[0]);
}

async function updateCatalog(table, id, payload) {
  const tableName = assertTable(table);
  const isUnit = tableName === 'units';
  const result = await getPool().query(
    isUnit
      ? `
          UPDATE units
          SET name = $2, short_name = $3, is_active = $4, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING *
        `
      : `
          UPDATE ${tableName}
          SET name = $2, description = $3, is_active = $4, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING *
        `,
    isUnit ? [id, payload.name, payload.shortName, payload.isActive] : [id, payload.name, payload.description, payload.isActive]
  );
  return mapCatalog(result.rows[0]);
}

async function softDeleteCatalog(table, id) {
  const tableName = assertTable(table);
  const result = await getPool().query(
    `
      UPDATE ${tableName}
      SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [id]
  );
  return result.rowCount > 0;
}

module.exports = {
  createCatalog,
  listCatalog,
  softDeleteCatalog,
  updateCatalog
};
