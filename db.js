const { Pool } = require('pg');

// پاکسازی متغیر اتصال برای حذف هرگونه تنظیمات SSL اجباری از درون URL
let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  connectionString = connectionString.replace(/([?&])sslmode=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: false
});

async function initDB() {
  try {
    // 1. ساخت جدول خیریه‌ها
    await pool.query(`
      CREATE TABLE IF NOT EXISTS charities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. ساخت جدول پروژه‌ها و ویدیوها
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        charity_id INT REFERENCES charities(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Tables (charities & projects) are ready.');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}

initDB();

module.exports = pool;
