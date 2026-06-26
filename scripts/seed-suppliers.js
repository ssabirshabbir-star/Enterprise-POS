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
  ['Pak Star Distribution', '0349-1204550', 'pakstar.distribution@example.local', 'Karachi, Sindh', 0],
  ['Morning Fresh Traders', '0350-1204551', 'morning.fresh@example.local', 'Lahore, Punjab', 4200],
  ['Classic Wholesale Network', '0351-1204552', 'classic.wholesale@example.local', 'Karachi, Sindh', 0],
  ['Fine Foods Partners', '0352-1204553', 'fine.foods@example.local', 'Faisalabad, Punjab', 8800],
  ['North Star Supplies', '0353-1204554', 'north.star@example.local', 'Islamabad', 0],
  ['South City Distributors', '0354-1204555', 'south.city@example.local', 'Hyderabad, Sindh', 7600],
  ['Lahore Retail Depot', '0355-1204556', 'lahore.retail@example.local', 'Lahore, Punjab', 0],
  ['Karachi General Traders', '0356-1204557', 'karachi.general@example.local', 'Karachi, Sindh', 10100],
  ['Faisalabad Supply Point', '0357-1204558', 'faisalabad.supply@example.local', 'Faisalabad, Punjab', 0],
  ['Islamabad Food Service', '0358-1204559', 'islamabad.food@example.local', 'Islamabad', 13400],
  ['Rawalpindi Grocery Link', '0359-1204560', 'rawalpindi.grocery@example.local', 'Rawalpindi, Punjab', 0],
  ['Peshawar Wholesale Line', '0360-1204561', 'peshawar.wholesale@example.local', 'Peshawar, KPK', 5600],
  ['Quetta Retail Supply', '0361-1204562', 'quetta.retail@example.local', 'Quetta, Balochistan', 0],
  ['Multan Food Bazaar', '0362-1204563', 'multan.food@example.local', 'Multan, Punjab', 11800],
  ['Sialkot Goods Traders', '0363-1204564', 'sialkot.goods@example.local', 'Sialkot, Punjab', 0],
  ['Gujranwala Wholesale Mart', '0364-1204565', 'gujranwala.wholesale@example.local', 'Gujranwala, Punjab', 6900],
  ['Hyderabad Fresh Supply', '0365-1204566', 'hyderabad.fresh@example.local', 'Hyderabad, Sindh', 0],
  ['Evergreen Grocery Co.', '0366-1204567', 'evergreen.grocery@example.local', 'Lahore, Punjab', 9300],
  ['Silverline Distribution', '0367-1204568', 'silverline.distribution@example.local', 'Karachi, Sindh', 0],
  ['Bluebell Household Traders', '0368-1204569', 'bluebell.household@example.local', 'Islamabad', 14900],
  ['Pakistan Retail Exchange', '0369-1204570', 'pakistan.retail@example.local', 'Rawalpindi, Punjab', 0],
  ['Green Farm Suppliers', '0370-1204571', 'green.farm@example.local', 'Faisalabad, Punjab', 5200],
  ['Daily Needs Wholesale', '0371-1204572', 'daily.needs@example.local', 'Karachi, Sindh', 0],
  ['Family Mart Partners', '0372-1204573', 'family.mart@example.local', 'Lahore, Punjab', 8400],
  ['Value Choice Traders', '0373-1204574', 'value.choice@example.local', 'Multan, Punjab', 0],
  ['Grand Bazaar Suppliers', '0374-1204575', 'grand.bazaar@example.local', 'Peshawar, KPK', 12600],
  ['Smart Basket Distribution', '0375-1204576', 'smart.basket@example.local', 'Islamabad', 0],
  ['Retail Roots Supply', '0376-1204577', 'retail.roots@example.local', 'Karachi, Sindh', 4700],
  ['Golden Cart Traders', '0377-1204578', 'golden.cart@example.local', 'Lahore, Punjab', 0],
  ['Pure Life Wholesale', '0378-1204579', 'pure.life@example.local', 'Quetta, Balochistan', 10900],
  ['Home Choice Suppliers', '0379-1204580', 'home.choice@example.local', 'Hyderabad, Sindh', 0],
  ['Urban Shelf Traders', '0380-1204581', 'urban.shelf@example.local', 'Rawalpindi, Punjab', 6400],
  ['Quick Mart Distribution', '0381-1204582', 'quick.mart@example.local', 'Karachi, Sindh', 0],
  ['Fresh Basket Wholesale', '0382-1204583', 'fresh.basket@example.local', 'Faisalabad, Punjab', 9700],
  ['Pak Household Hub', '0383-1204584', 'pak.household@example.local', 'Lahore, Punjab', 0],
  ['Green Leaf Traders', '0384-1204585', 'green.leaf@example.local', 'Peshawar, KPK', 13200],
  ['Daily Fresh Partners', '0385-1204586', 'daily.fresh@example.local', 'Islamabad', 0],
  ['Royal Basket Supply', '0386-1204587', 'royal.basket@example.local', 'Sialkot, Punjab', 5800],
  ['Trade Link Grocery', '0387-1204588', 'trade.link@example.local', 'Karachi, Sindh', 0],
  ['City Food Warehouse', '0388-1204589', 'city.food.warehouse@example.local', 'Gujranwala, Punjab', 11200],
  ['National Retail Supply', '0389-1204590', 'national.retail@example.local', 'Lahore, Punjab', 0],
  ['Premium Goods Traders', '0390-1204591', 'premium.goods@example.local', 'Rawalpindi, Punjab', 7200],
  ['Trusted Grocery Suppliers', '0391-1204592', 'trusted.grocery@example.local', 'Multan, Punjab', 0],
  ['Alpha Wholesale Store', '0392-1204593', 'alpha.wholesale@example.local', 'Karachi, Sindh', 9000],
  ['Bravo Foods Distribution', '0393-1204594', 'bravo.foods@example.local', 'Hyderabad, Sindh', 0],
  ['Central Supply Network', '0394-1204595', 'central.supply@example.local', 'Islamabad', 14300],
  ['Delta Retail Traders', '0395-1204596', 'delta.retail@example.local', 'Peshawar, KPK', 0],
  ['Elite Grocery Partners', '0396-1204597', 'elite.grocery@example.local', 'Lahore, Punjab', 6500],
  ['Future Mart Suppliers', '0397-1204598', 'future.mart@example.local', 'Faisalabad, Punjab', 0],
  ['Grocery World Traders', '0398-1204599', 'grocery.world@example.local', 'Karachi, Sindh', 11700],
  ['Horizon Wholesale Depot', '0399-1204600', 'horizon.wholesale@example.local', 'Quetta, Balochistan', 0]
];

async function seedSuppliers() {
  await initializeDatabase();

  let inserted = 0;
  await withTransaction(async (client) => {
    for (const [name, phone, email, address, openingBalance] of SUPPLIERS) {
      const existing = await client.query(
        'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1',
        [name]
      );
      if (existing.rows[0]) continue;

      const result = await client.query(
        `
          INSERT INTO suppliers (name, phone, email, address, opening_balance, current_balance, is_active)
          VALUES ($1, $2, $3, $4, $5, $5, TRUE)
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
