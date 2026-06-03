const { initializeDatabase } = require('../src/main/database/schema');
const { getPool, closeDatabase } = require('../src/main/database/connection');
const { loadEnvironment } = require('../src/main/config/env');

loadEnvironment();

const customers = [
  ['Ali Raza', '0300-1204501', 'Lahore, Punjab'],
  ['Sara Khan', '0311-1204502', 'Karachi, Sindh'],
  ['Usman Ahmed', '0321-1204503', 'Faisalabad, Punjab'],
  ['Ayesha Malik', '0333-1204504', 'Islamabad'],
  ['Bilal Hussain', '0345-1204505', 'Multan, Punjab'],
  ['Zain Ali', '0355-1204506', 'Peshawar, Khyber Pakhtunkhwa'],
  ['Hina Tariq', '0366-1204507', 'Quetta, Balochistan'],
  ['Hamza Butt', '0377-1204508', 'Rawalpindi, Punjab'],
  ['Fatima Noor', '0301-1204509', 'Hyderabad, Sindh'],
  ['Danish Iqbal', '0302-1204510', 'Sialkot, Punjab'],
  ['Maham Saleem', '0303-1204511', 'Gujranwala, Punjab'],
  ['Omar Farooq', '0304-1204512', 'Sargodha, Punjab'],
  ['Nida Yasir', '0305-1204513', 'Bahawalpur, Punjab'],
  ['Kamran Akhtar', '0306-1204514', 'Sukkur, Sindh'],
  ['Rabia Yousaf', '0307-1204515', 'Mardan, Khyber Pakhtunkhwa'],
  ['Faisal Rehman', '0308-1204516', 'Abbottabad, Khyber Pakhtunkhwa'],
  ['Noor Fatima', '0309-1204517', 'Gujrat, Punjab'],
  ['Saad Mehmood', '0310-1204518', 'Jhelum, Punjab'],
  ['Areeba Sheikh', '0312-1204519', 'Larkana, Sindh'],
  ['Waleed Anwar', '0313-1204520', 'Okara, Punjab'],
  ['Mehwish Aslam', '0314-1204521', 'Kasur, Punjab'],
  ['Irfan Qureshi', '0315-1204522', 'Sheikhupura, Punjab'],
  ['Sana Javed', '0316-1204523', 'Mirpur, Azad Kashmir'],
  ['Talha Nadeem', '0317-1204524', 'Mingora, Khyber Pakhtunkhwa'],
  ['Kiran Shah', '0318-1204525', 'Nawabshah, Sindh'],
  ['Asad Mirza', '0319-1204526', 'Rahim Yar Khan, Punjab'],
  ['Zoya Tariq', '0320-1204527', 'Dera Ghazi Khan, Punjab'],
  ['Hassan Rauf', '0322-1204528', 'Chiniot, Punjab'],
  ['Muneeba Ali', '0323-1204529', 'Vehari, Punjab'],
  ['Shahzaib Khan', '0324-1204530', 'Kohat, Khyber Pakhtunkhwa'],
  ['Iqra Batool', '0325-1204531', 'Bannu, Khyber Pakhtunkhwa'],
  ['Adnan Siddiqui', '0326-1204532', 'Khairpur, Sindh'],
  ['Laiba Ahmed', '0327-1204533', 'Muzaffargarh, Punjab'],
  ['Rizwan Malik', '0328-1204534', 'Mandi Bahauddin, Punjab'],
  ['Eman Zahra', '0329-1204535', 'Toba Tek Singh, Punjab'],
  ['Arham Sheikh', '0330-1204536', 'Dadu, Sindh'],
  ['Mariam Khalid', '0331-1204537', 'Jacobabad, Sindh'],
  ['Sohail Abbas', '0332-1204538', 'Khanewal, Punjab'],
  ['Aiman Riaz', '0334-1204539', 'Hafizabad, Punjab'],
  ['Taha Jamil', '0335-1204540', 'Swabi, Khyber Pakhtunkhwa'],
  ['Sadia Noreen', '0336-1204541', 'Chakwal, Punjab'],
  ['Umair Latif', '0337-1204542', 'Nowshera, Khyber Pakhtunkhwa'],
  ['Alina Saeed', '0338-1204543', 'Charsadda, Khyber Pakhtunkhwa'],
  ['Noman Arif', '0339-1204544', 'Attock, Punjab'],
  ['Rimsha Gul', '0340-1204545', 'Mianwali, Punjab'],
  ['Junaid Akram', '0341-1204546', 'Bhakkar, Punjab'],
  ['Aqsa Ilyas', '0342-1204547', 'Narowal, Punjab'],
  ['Yasir Hameed', '0343-1204548', 'Pakpattan, Punjab'],
  ['Sobia Farhan', '0344-1204549', 'Lodhran, Punjab'],
  ['Haris Waqar', '0346-1204550', 'Haripur, Khyber Pakhtunkhwa']
];

function emailFor(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@customer.local`;
}

async function run() {
  await initializeDatabase();
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    let inserted = 0;

    for (const [name, phone, address] of customers) {
      const result = await client.query(
        `
          INSERT INTO customers (name, phone, email, address, credit_limit, current_balance, is_active)
          SELECT $1::varchar, $2::varchar, $3::varchar, $4::text, 25000, 0, TRUE
          WHERE NOT EXISTS (
            SELECT 1 FROM customers WHERE phone = $2::text AND deleted_at IS NULL
          )
          RETURNING id
        `,
        [name, phone, emailFor(name), address]
      );
      if (result.rows[0]) inserted += 1;
    }

    await client.query(
      "INSERT INTO activity_logs (action, status, message, metadata) VALUES ('seed.customers', 'success', 'Customer seed verified', $1::jsonb)",
      [JSON.stringify({ requested: customers.length, inserted })]
    );

    await client.query('COMMIT');
    console.log(`Verified ${customers.length} customer entries. Inserted ${inserted} new customers.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closeDatabase();
  }
}

run().catch((error) => {
  console.error('Customer seed failed:', error);
  process.exitCode = 1;
});
