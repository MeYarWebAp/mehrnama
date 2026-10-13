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
    // 1. بررسی و ساخت جدول خیریه‌ها به صورت امن
    const charityCheck = await pool.query("SELECT TO_REGCLASS('public.charities');");
    if (!charityCheck.rows[0].to_regclass) {
      await pool.query(`
        CREATE TABLE charities (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Table charities created successfully.');
    } else {
      console.log('Table charities already exists.');
    }

    // 2. بررسی و ساخت جدول پروژه‌ها به صورت امن
    const projectCheck = await pool.query("SELECT TO_REGCLASS('public.projects');");
    if (!projectCheck.rows[0].to_regclass) {
      await pool.query(`
        CREATE TABLE projects (
          id SERIAL PRIMARY KEY,
          charity_id INT REFERENCES charities(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          file_path VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Table projects created successfully.');
    } else {
      console.log('Table projects already exists.');
    }

    console.log('Database initialization completed.');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}

initDB();

module.exports = pool;
