const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// اتصال به دیتابیس PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// سرو کردن فایل‌های استاتیک پوشه فرانت‌اند
app.use(express.static(path.join(__dirname)));
// سرو کردن پوشه آپلودها
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// تنظیمات Multer برای آپلود فایل‌ها
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        const fs = require('fs');
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ۱. ثبت‌نام خیریه جدید
app.post('/api/charities/register', async (req, res) => {
    const { name, email, phone, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO charity_users (name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
            [name, email, phone, hashedPassword]
        );
        res.status(201).json({ message: 'ثبت‌نام با موفقیت انجام شد', charity: result.rows[0] });
    } catch (err) {
        console.error('Register error:', err);
        res.status(400).json({ error: 'خطا در ثبت‌نام. ممکن است ایمیل تکراری باشد.' });
    }
});

// ۲. ورود خیریه
app.post('/api/charities/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM charity_users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
        }
        const charity = result.rows[0];
        const validPassword = await bcrypt.compare(password, charity.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
        }
        res.json({ 
            message: 'ورود موفقیت‌آمیز', 
            charity: { id: charity.id, name: charity.name, email: charity.email } 
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'خطای سرور' });
    }
});

// ۳. ایجاد پروژه جدید (آپلود ویدیو/تصویر)
app.post('/api/projects/create', upload.single('projectFile'), async (req, res) => {
    const { charity_id, title, description } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const result = await pool.query(
            'INSERT INTO charity_projects (charity_id, title, description, file_path) VALUES ($1, $2, $3, $4) RETURNING *',
            [charity_id, title, description, filePath]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Project create error:', err);
        res.status(500).json({ error: 'خطا در ثبت پروژه' });
    }
});

// ۴. دریافت لیست تمام پروژه‌ها (مرتب‌شده بر اساس جدیدترین - Last-In, First-Show)
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, c.name AS charity_name 
            FROM charity_projects p 
            JOIN charity_users c ON p.charity_id = c.id 
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch projects error:', err);
        res.status(500).json({ error: 'خطا در دریافت پروژه‌ها' });
    }
});

// ۵. دریافت پروژه‌های یک کانال خاص
app.get('/api/charities/:id/projects', async (req, res) => {
    const charityId = req.params.id;
    try {
        const charityRes = await pool.query('SELECT id, name, email, phone FROM charity_users WHERE id = $1', [charityId]);
        if (charityRes.rows.length === 0) {
            return res.status(404).json({ error: 'کانال مورد نظر یافت نشد.' });
        }
        const projectsRes = await pool.query(
            'SELECT * FROM charity_projects WHERE charity_id = $1 ORDER BY created_at DESC',
            [charityId]
        );
        res.json({
            charity: charityRes.rows[0],
            projects: projectsRes.rows
        });
    } catch (err) {
        console.error('Fetch channel error:', err);
        res.status(500).json({ error: 'خطا در دریافت اطلاعات کانال' });
    }
});

// ۶. دریافت نظرات یک پروژه
app.get('/api/projects/:id/comments', async (req, res) => {
    const projectId = req.params.id;
    try {
        const result = await pool.query(
            'SELECT * FROM project_comments WHERE project_id = $1 ORDER BY created_at DESC',
            [projectId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch comments error:', err);
        res.status(500).json({ error: 'خطا در دریافت نظرات' });
    }
});

// ۷. ثبت نظر جدید برای پروژه
app.post('/api/projects/:id/comments', async (req, res) => {
    const projectId = req.params.id;
    const { author_name, comment_text } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO project_comments (project_id, author_name, comment_text) VALUES ($1, $2, $3) RETURNING *',
            [projectId, author_name, comment_text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Post comment error:', err);
        res.status(500).json({ error: 'خطا در ثبت نظر' });
    }
});

// مسیر اصلی فرانت‌اند
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.
