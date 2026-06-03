const { loadEnvironment } = require('../src/main/config/env');
const { closeDatabase, withTransaction } = require('../src/main/database/connection');
const { initializeDatabase } = require('../src/main/database/schema');

loadEnvironment();

const SUPPLIERS = [
  ['Al-Noor Traders', '0300-1204501', 'alnoor.traders@example.local', 'Lahore, Punjab', 0],
  ['Zahid Electronics', '0301-1204502', 'zahid.electronics@example.local', 'Karachi, Sindh', 12000],
  ['Khan & Sons Wholesale', '0302-1204503', 'khan.sons@example.local', 'Faisalabad, Punjab', 8500],
  ['Super Wholesale Ltd.', '0303-1204504', 'super.wholesale@example.local', 'Islamabad', 15000],
  ['New Asia Traders', '0304-1204505', 'newasia.traders@example.local', 'Multan, Punjab', 0],
  ['Ghani Importers', '0305-1204506', 'ghani.importers@example.local', 'Peshawar, KPK', 21000],
  ['Best Supply Co.', '0306-1204507', 'best.supply@example.local', 'Quetta, Balochistan', 0],
  ['Global Traders', '0307-1204508', 'global.traders@example.local', 'Rawalpindi, Punjab', 7300],
  ['Urban Basket Suppliers', '0308-1204509', 'urban.basket@example.local', 'Lahore, Punjab', 0],
  ['Fresh Mart Distributors', '0309-1204510', 'freshmart.distributors@example.local', 'Karachi, Sindh', 11200],
  ['Punjab Grocery Supply', '0310-1204511', 'punjab.grocery@example.local', 'Gujranwala, Punjab', 5400],
  ['Sindh Food Traders', '0311-1204512', 'sindh.food@example.local', 'Hyderabad, Sindh', 0],
  ['Capital Wholesale Hub', '0312-1204513', 'capital.wholesale@example.local', 'Islamabad', 18700],
  ['Metro Retail Suppliers', '0313-1204514', 'metro.retail@example.local', 'Lahore, Punjab', 0],
  ['Royal Foods Distribution', '0314-1204515', 'royal.foods@example.local', 'Sialkot, Punjab', 9200],
  ['Prime Household Supply', '0315-1204516', 'prime.household@example.local', 'Karachi, Sindh', 0],
  ['Sunrise General Traders', '0316-1204517', 'sunrise.general@example.local', 'Bahawalpur, Punjab', 6100],
  ['Pak Fresh Suppliers', '0317-1204518', 'pak.fresh@example.local', 'Faisalabad, Punjab', 0],
  ['City Mart Wholesale', '0318-1204519', 'citymart.wholesale@example.local', 'Rawalpindi, Punjab', 13200],
  ['Blue Ocean Importers', '0319-1204520', 'blue.ocean@example.local', 'Karachi, Sindh', 0],
  ['Golden Grain Traders', '0320-1204521', 'golden.grain@example.local', 'Multan, Punjab', 7400],
  ['Green Valley Foods', '0321-1204522', 'green.valley@example.local', 'Lahore, Punjab', 0],
  ['Everfresh Distributors', '0322-1204523', 'everfresh@example.local', 'Peshawar, KPK', 9800],
  ['Moonlight Wholesale', '0323-1204524', 'moonlight.wholesale@example.local', 'Quetta, Balochistan', 0],
  ['National Grocery Depot', '0324-1204525', 'national.grocery@example.local', 'Islamabad', 16500],
  ['Eastern Foods Supply', '0325-1204526', 'eastern.foods@example.local', 'Lahore, Punjab', 0],
  ['Western Retail Traders', '0326-1204527', 'western.retail@example.local', 'Karachi, Sindh', 8300],
  ['Makkah Wholesale Store', '0327-1204528', 'makkah.wholesale@example.local', 'Gujrat, Punjab', 0],
  ['Madina Supply Network', '0328-1204529', 'madina.supply@example.local', 'Sahiwal, Punjab', 11900],
  ['Sapphire Grocery Traders', '0329-1204530', 'sapphire.grocery@example.local', 'Hyderabad, Sindh', 0],
  ['Diamond Food Distributors', '0330-1204531', 'diamond.food@example.local', 'Karachi, Sindh', 14700],
  ['Crescent Wholesale Mart', '0331-1204532', 'crescent.wholesale@example.local', 'Lahore, Punjab', 0],
  ['Falcon Retail Supply', '0332-1204533', 'falcon.retail@example.local', 'Islamabad', 6300],
  ['Shaheen Traders', '0333-1204534', 'shaheen.traders@example.local', 'Peshawar, KPK', 0],
  ['United Grocery Partners', '0334-1204535', 'united.grocery@example.local', 'Faisalabad, Punjab', 10800],
  ['Premier Supply House', '0335-1204536', 'premier.supply@example.local', 'Rawalpindi, Punjab', 0],
  ['Express Wholesale Co.', '0336-1204537', 'express.wholesale@example.local', 'Karachi, Sindh', 7200],
  ['Bright Star Suppliers', '0337-1204538', 'bright.star@example.local', 'Lahore, Punjab', 0],
  ['Noble Food Traders', '0338-1204539', 'noble.food@example.local', 'Multan, Punjab', 9100],
  ['Galaxy General Supply', '0339-1204540', 'galaxy.general@example.local', 'Quetta, Balochistan', 0],
  ['Heritage Grocery Hub', '0340-1204541', 'heritage.grocery@example.local', 'Islamabad', 12400],
  ['Reliable Mart Suppliers', '0341-1204542', 'reliable.mart@example.local', 'Sialkot, Punjab', 0],
  ['Quality Wholesale Depot', '0342-1204543', 'quality.wholesale@example.local', 'Gujranwala, Punjab', 15700],
  ['Starline Distributors', '0343-1204544', 'starline.distributors@example.local', 'Karachi, Sindh', 0],
  ['Bismillah Traders', '0344-1204545', 'bismillah.traders@example.local', 'Lahore, Punjab', 6800],
  ['Apex Retail Supply', '0345-1204546', 'apex.retail@example.local', 'Faisalabad, Punjab', 0],
  ['Millat Food Suppliers', '0346-1204547', 'millat.food@example.local', 'Peshawar, KPK', 11300],
  ['Harmony Grocery Traders', '0347-1204548', 'harmony.grocery@example.local', 'Hyderabad, Sindh', 0],
  ['A-One Wholesale Traders', '0348-1204549', 'aone.wholesale@example.local', 'Rawalpindi, Punjab', 9500],
  ['Pak Star Distribution', '0349-1204550', 'pakstar.distribution@example.local', 'Karachi, Sindh', 0]
];

async function seedSuppliers() {
  await initializeDatabase();

  let inserted = 0;
  await withTransaction(async (client) => {
    for (const [name, phone, email, address, openingBalance] of SUPPLIERS) {
      const result = await client.query(
        `
          INSERT INTO suppliers (name, phone, email, address, opening_balance, current_balance, is_active)
          VALUES ($1, $2, $3, $4, $5, $5, TRUE)
          ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING
          RETURNING id
        `,
        [name, phone, email, address, openingBalance]
      );

      if (result.rows[0]) {
        inserted += 1;
        if (Number(openingBalance) > 0) {
          await client.query(
            `
              INSERT INTO supplier_ledger (supplier_id, reference_type, reference_id, entry_type, debit, credit, balance, notes)
              VALUES ($1, 'opening_balance', NULL, 'OPENING', $2, 0, $2, 'Seeded opening balance')
            `,
            [result.rows[0].id, openingBalance]
          );
        }
      }
    }

    await client.query(
      `
        INSERT INTO activity_logs (action, status, message, metadata)
        VALUES ('seed.suppliers', 'success', 'Supplier seed completed', $1::jsonb)
      `,
      [JSON.stringify({ requested: SUPPLIERS.length, inserted })]
    );
  });

  console.log(`Supplier seed complete. Inserted ${inserted} new suppliers; ${SUPPLIERS.length - inserted} already existed.`);
}

seedSuppliers()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
