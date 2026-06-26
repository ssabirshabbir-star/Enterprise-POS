const { getPool } = require('../../database/connection');

const PAKISTANI_NAMES = [
  'Ahmed Ali', 'Muhammad Hassan', 'Fatima Khan', 'Aisha Malik', 'Usman Raza',
  'Sana Iqbal', 'Bilal Ahmad', 'Nadia Butt', 'Hamza Sheikh', 'Zainab Chaudhry',
  'Imran Javed', 'Sara Khalid', 'Tariq Mahmood', 'Amna Siddiqui', 'Faisal Mirza',
  'Hina Baig', 'Asad Nawaz', 'Rabia Aziz', 'Kamran Hussain', 'Sumaira Anwar',
  'Junaid Farooq', 'Ayesha Qureshi', 'Adnan Gilani', 'Madiha Rashid', 'Omer Shahzad',
  'Rida Tauqeer', 'Waseem Akram', 'Sobia Arif', 'Zubair Haider', 'Mehwish Yaseen',
  'Shahid Iqbal', 'Farah Naz', 'Danish Saleem', 'Lubna Babar', 'Naeem Akhtar',
  'Samina Yousaf', 'Rizwan Mehmood', 'Kiran Sajid', 'Sohail Zafar', 'Anum Waheed',
  'Adeel Bhatti', 'Nosheen Hameed', 'Zafar Ullah', 'Ghazala Perveen', 'Arslan Choudry',
  'Saima Shabbir', 'Talha Nawab', 'Uzma Hanif', 'Jawad Sultan', 'Rubina Satti',
  'Imtiaz Rauf', 'Shaista Parveen', 'Nasir Iqbal', 'Faiza Maqbool', 'Khurram Shafiq',
  'Asma Zaheer', 'Waqas Abbasi', 'Mariam Aslam', 'Khalid Mehmood', 'Huma Tahir',
  'Dawood Ibrahim', 'Bushra Ejaz', 'Nadeem Akhtar', 'Amber Riaz', 'Umar Farooq',
  'Nazia Yaqoob', 'Babar Azam', 'Saba Manzoor', 'Aamir Liaquat', 'Tehmina Durrani',
  'Saad Rafiq', 'Shazia Rashid', 'Mubashir Hasan', 'Zara Siddique', 'Waheed Murad',
  'Qamar Javed', 'Parveen Shakir', 'Tahir Gul', 'Musarrat Nazir', 'Imran Shaukat',
  'Tehreem Bashir', 'Mudassar Nazar', 'Humaira Arshad', 'Javed Akhtar', 'Sakina Ali',
  'Rashid Latif', 'Pervez Elahi', 'Gul Panra', 'Umair Sandhu', 'Shirin Farhad',
  'Anwar Masood', 'Nausheen Shah', 'Naseem Shah', 'Fozia Azeem', 'Shaheen Abbas',
  'Amjad Sabri', 'Sumbal Iqbal', 'Rehan Safdar', 'Attia Ashraf', 'Ejaz Ahmad',
  'Sadaf Kanwal', 'Naveed Tariq', 'Iqra Aziz', 'Kashif Riaz', 'Aiman Zaman'
];

const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala'];
const AREAS = ['Model Town', 'Gulberg', 'DHA', 'Bahria Town', 'Johar Town', 'Garden Town', 'Cantt', 'Saddar', 'F-10', 'G-11'];

function randomPhone() {
  const prefixes = ['0300', '0301', '0302', '0303', '0311', '0312', '0321', '0322', '0333', '0345'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = String(Math.floor(Math.random() * 9000000) + 1000000);
  return `${prefix}${suffix}`;
}

function randomCity() {
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  return `${area}, ${city}`;
}

function randomBalance() {
  const amounts = [0, 0, 0, 500, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 0, 0, 2500];
  return amounts[Math.floor(Math.random() * amounts.length)];
}

function randomCreditLimit() {
  const limits = [0, 5000, 10000, 15000, 20000, 25000, 50000, 75000, 100000];
  return limits[Math.floor(Math.random() * limits.length)];
}

async function seedCustomers() {
  const pool = getPool();
  
  // Check how many non-walk-in customers already exist
  const existing = await pool.query('SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL AND is_walk_in = FALSE');
  const currentCount = Number(existing.rows[0]?.count || 0);
  
  if (currentCount >= 100) {
    return { ok: true, message: `Seeder skipped: ${currentCount} customers already exist.`, seeded: 0 };
  }

  const needed = 100 - currentCount;
  const names = PAKISTANI_NAMES.slice(0, needed);
  let seeded = 0;

  for (const name of names) {
    try {
      const openingBalance = randomBalance();
      const creditLimit = randomCreditLimit();
      const phone = randomPhone();
      const address = randomCity();
      const isActive = Math.random() > 0.1; // 90% active

      const result = await pool.query(
        `INSERT INTO customers (name, phone, address, credit_limit, opening_balance, current_balance, is_active)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [name, phone, address, creditLimit, openingBalance, isActive]
      );

      if (result.rows[0]?.id && openingBalance > 0) {
        await pool.query(
          'INSERT INTO customer_ledger (customer_id, entry_type, debit, credit, balance, notes) VALUES ($1, $2, $3, 0, $3, $4)',
          [result.rows[0].id, 'OPENING_BALANCE', openingBalance, 'Opening balance (seeded)']
        );
      }

      seeded += 1;
    } catch (err) {
      console.warn('Seeder: skipped customer due to error:', err.message);
    }
  }

  return { ok: true, message: `${seeded} customer(s) seeded successfully.`, seeded };
}

module.exports = { seedCustomers };
