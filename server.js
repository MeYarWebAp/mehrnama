const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// اتصال به دیتابیس PostgreSQL روی Runflare
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// ساخت جداول کاربران و پروژه‌ها
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL, -- 'real' یا 'legal'
                phone_or_id VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                city VARCHAR(100),
                district VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                charity_name VARCHAR(255) NOT NULL,
                charity_id INTEGER DEFAULT 1,
                province VARCHAR(100) NOT NULL,
                district VARCHAR(100) DEFAULT 'مرکزی',
                description TEXT,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database tables initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

initDB();

// ثبت‌نام کاربر جدید در دیتابیس
app.post('/api/register', async (req, res) => {
    try {
        const { name, user_type, phone_or_id, password, province, city, district } = req.body;
        
        // بررسی تکراری نبودن شماره/شناسه
        const checkUser = await pool.query('SELECT * FROM users WHERE phone_or_id = $1', [phone_or_id]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: 'کاربری با این شماره یا شناسه قبلاً ثبت‌نام کرده است.' });
        }

        // هش کردن رمز عبور
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = `
            INSERT INTO users (name, user_type, phone_or_id, password, province, city, district)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, user_type, phone_or_id;
        `;
        const values = [name, user_type, phone_or_id, hashedPassword, province || null, city || null, district || null];
        const result = await pool.query(query, values);

        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در ثبت‌نام کاربر' });
    }
});

// ورود کاربر بر اساس دیتابیس
app.post('/api/login', async (req, res) => {
    try {
        const { phone_or_id, password, user_type } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE phone_or_id = $1 AND user_type = $2', [phone_or_id, user_type]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'کاربری با این اطلاعات یافت نشد.' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'رمز عبور نادرست است.' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                type: user.user_type,
                phone_or_id: user.phone_or_id
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در فرآیند ورود' });
    }
});

// دریافت لیست پروژه‌ها
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در دریافت پروژه‌ها' });
    }
});

// ثبت پروژه جدید
app.post('/api/projects', async (req, res) => {
    try {
        const { title, charity_name, charity_id, province, district, description, file_path } = req.body;
        const query = `
            INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
        `;
        const values = [title, charity_name, charity_id || 1, province, district || 'مرکزی', description, file_path];
        const result = await pool.query(query, values);
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در ثبت پروژه' });
    }
});

// ویرایش پروژه (با بررسی مالکیت)
app.put('/api/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, province, district, description, file_path, charity_id } = req.body;
        
        const checkProj = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        if (checkProj.rows.length === 0) {
            return res.status(404).json({ error: 'پروژه یافت نشد' });
        }

        const project = checkProj.rows[0];

        if (charity_id && project.charity_id != charity_id && charity_id != 99) {
            return res.status(403).json({ error: 'شما اجازه ویرایش این پروژه را ندارید' });
        }
        
        const query = `
            UPDATE projects 
            SET title = $1, province = $2, district = $3, description = $4, file_path = $5
            WHERE id = $6 RETURNING *;
        `;
        const values = [title, province, district || 'مرکزی', description, file_path, projectId];
        const result = await pool.query(query, values);
        
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در ویرایش پروژه' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
