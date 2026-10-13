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
    // استفاده از دستورات جداگانه با هندلینگ دقیق خطا برای جلوگیری از توقف سرور
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
      console.log('Notice on charities table initialization:', err.message);
    }

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
      console.log('Notice on projects table initialization:', err.message);
    }

    console.log('Database initialization completed successfully.');
  } catch (err) {
    console.error('General database error:', err);
  }
}

initDB();

module.exports = pool;
