const { Pool } = require('pg');

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
    // 1. ساخت جدول خیریه‌ها با مدیریت خطای تداخل سیستمی
    try {
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
      console.log('Table charities is ready.');
    } catch (err) {
      if (err.code === '23505') {
        console.log('Table charities already exists in catalog, skipping.');
      } else {
        throw err;
      }
    }

    // 2. ساخت جدول پروژه‌ها با مدیریت خطای تداخل سیستمی
    try {
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
      console.log('Table projects is ready.');
    } catch (err) {
      if (err.code === '23505') {
        console.log('Table projects already exists in catalog, skipping.');
      } else {
        throw err;
      }
    }

    console.log('Database initialization completed.');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}

initDB();

module.exports = pool;
