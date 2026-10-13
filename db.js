const { Pool } = require('pg');

// اتصال به دیتابیس با استفاده از متغیر محیطی ران‌فلر
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // برای ارتباط امن با دیتابیس‌های ابری
});

// تابع برای ساخت جدول خیریه‌ها در صورت عدم وجود
async function initDB() {
  const query = `
    CREATE TABLE IF NOT EXISTS charities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log('Charities table is ready.');
  } catch (err) {
    console.error('Error creating table:', err);
  }
}

initDB();

module.exports = pool;
