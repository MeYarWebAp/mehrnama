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
    // 1. پاکسازی نوع تکراری احتمالی و ساخت جدول charities
    try {
      await pool.query(`DROP TYPE IF EXISTS charities CASCADE;`);
    } catch (e) {
      // اگر نوع وجود نداشت نادیده گرفته شود
    }

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

    // 2. پاکسازی نوع تکراری احتمالی و ساخت جدول projects
    try {
      await pool.query(`DROP TYPE IF EXISTS projects CASCADE;`);
    } catch (e) {
      // اگر نوع وجود نداشت نادیده گرفته شود
    }

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

    console.log('Database initialization completed successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDB();

module.exports = pool;
