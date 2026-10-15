const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// اتصال به پایگاه داده ریموت PostgreSQL (بدون نیاز به SSL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// تابع ایجاد جداول اولیه و داده‌های نمونه در صورت خالی بودن
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS charities (
                id SERIAL PRIMARY KEY,
                institute_name VARCHAR(255) NOT NULL,
                reg_no VARCHAR(100) UNIQUE NOT NULL,
                province VARCHAR(100) NOT NULL,
                city VARCHAR(100) NOT NULL,
                district VARCHAR(100) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                password VARCHAR(255) NOT NULL,
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

// دریافت لیست پروژه‌ها از دیتابیس PostgreSQL
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطا در دریافت پروژه‌ها از دیتابیس' });
    }
});

// ثبت کار نیک جدید در دیتابیس PostgreSQL
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
        res.status(500).json({ error: 'خطا در ثبت پروژه در دیتابیس' });
    }
});

// ویرایش پروژه در دیتابیس PostgreSQL (فقط توسط صاحب کانال/خیریه)
app.put('/api/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, province, district, description, file_path, charity_id } = req.body;
        
        const checkProj = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        if (checkProj.rows.length === 0) {
            return res.status(404).json({ error: 'پروژه مورد نظر یافت نشد' });
        }

        const project = checkProj.rows[0];

        // بررسی مالکیت پروژه
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
