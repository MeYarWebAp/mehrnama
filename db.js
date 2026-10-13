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
    // ساخت جدول کاربران خیریه با نام جدید
    await pool.query(`
      CREATE TABLE IF NOT EXISTS charity_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table charity_users is ready.');

    // ساخت جدول پروژه‌ها با نام جدید
    await pool.query(`
      CREATE TABLE IF NOT EXISTS charity_projects (
        id SERIAL PRIMARY KEY,
        charity_id INT REFERENCES charity_users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table charity_projects is ready.');

    console.log('Database initialization completed successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDB();

module.exports = pool;
