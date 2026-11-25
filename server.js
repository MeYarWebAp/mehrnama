const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

// تنظیمات ارسال ایمیل از طریق Gmail
const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER || 'mehrnama.info@gmail.com',
        pass: process.env.SMTP_PASS
    }
});

// حافظه موقت برای نگهداری کدهای تایید (ایمیل -> { code, expiresAt, userData })
const verificationCodes = new Map();

// تنظیمات CORS برای هر دو دامنه
const corsOptions = {
    origin: ['https://mehrnama.info', 'https://einherzwiekristall.de', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تلاش‌های ناموفق بیش از حد مجاز. لطفاً ۱۵ دقیقه دیگر تلاش کنید.' }
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/verify-email', authLimiter);

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/mkv', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('فرمت فایل نامعتبر است. فقط تصاویر و ویدیوهای مجاز پذیرفته می‌شوند.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: fileFilter
});

const dbConnectionString = process.env.DATABASE2_URL || process.env.DATABASE_URL || 'postgresql://postgres:sdU4FbObdDnTdQ2Cdf9w@database2-gir-service:5432/databaseeqd_db';

const poolEinHerz = new Pool({
    connectionString: dbConnectionString,
    ssl: false
});

function getPool(req) {
    return poolEinHerz;
}

async function initDBForPool(pool, isGerman = false) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
                phone_or_id VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                is_verified BOOLEAN DEFAULT FALSE,
                password VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                city VARCHAR(100),
                district VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE;`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS regular_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS charities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                city VARCHAR(100),
                district VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS charity_users (
                id SERIAL PRIMARY KEY,
                charity_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                national_id VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                city VARCHAR(100),
                district VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                charity_name VARCHAR(255) NOT NULL,
                charity_id INT,
                province VARCHAR(100),
                district VARCHAR(100),
                description TEXT,
                file_path VARCHAR(255),
                views INT DEFAULT 0,
                likes INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;`);
        await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS charity_projects (
                id SERIAL PRIMARY KEY,
                charity_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                district VARCHAR(100),
                description TEXT,
                file_path VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_likes (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                project_id INT NOT NULL,
                UNIQUE(user_id, project_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                video_id INT NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_comments (
                id SERIAL PRIMARY KEY,
                project_id INT NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                charity_id INT NOT NULL,
                charity_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, charity_id)
            );
        `);
    } catch (err) {
        console.error('Error initializing DB:', err);
    }
}

initDBForPool(poolEinHerz, true);

app.get('/', (req, res) => {
    const hostname = req.hostname || req.headers.host || '';
    if (hostname.includes('einherzwiekristall')) {
        res.sendFile(path.join(__dirname, 'public', 'index-de.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// مرحله ۱ ثبت‌نام: اعتبارسنجی اطلاعات و ارسال کد تایید به ایمیل
app.post('/api/register', [
    body('name').trim().notEmpty().withMessage('نام الزامی است.'),
    body('email').isEmail().withMessage('لطفاً یک نشانی ایمیل معتبر وارد کنید.'),
    body('password').isLength({ min: 6 }).withMessage('رمز عبور باید حداقل ۶ کاراکتر باشد.')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        if (!process.env.SMTP_PASS) {
            return res.status(500).json({
                success: false,
                error: 'تنظیمات رمز عبور SMTP روی سرور انجام نشده است.'
            });
        }

        const pool = getPool(req);
        const { name, user_type, email, phone_or_id, password, province, city, district } = req.body;
        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1 OR LOWER(phone_or_id) = $1',
            [normalizedEmail]
        );
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'این ایمیل قبلاً در سامانه ثبت شده است.' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        verificationCodes.set(normalizedEmail, {
            code: otpCode,
            expiresAt: Date.now() + 10 * 60 * 1000,
            userData: {
                name: name.trim(),
                user_type: user_type || 'regular',
                email: normalizedEmail,
                phone_or_id: normalizedEmail,
                phone: phone_or_id ? phone_or_id.trim() : null,
                password: hashedPassword,
                province: province || null,
                city: city || null,
                district: district || null
            }
        });

        await mailTransporter.sendMail({
            from: `"مهرنما - تصویر شفاف مهربانی" <${process.env.SMTP_USER || 'mehrnama.info@gmail.com'}>`,
            to: normalizedEmail,
            subject: 'کد تایید ثبت‌نام در سامانه مهرنما',
            html: `
                <div dir="rtl" style="font-family: Tahoma, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #ffffff;">
                    <h2 style="color: #cc0000; margin-top: 0;">خوش آمدید، ${name.trim()} عزیز!</h2>
                    <p style="color: #333; font-size: 14px; line-height: 1.7;">
                        برای تکمیل ثبت‌نام در سامانه <strong>مهرنما</strong>، لطفاً کد تایید زیر را در صفحه ثبت‌نام وارد نمایید:
                    </p>
                    <div style="background-color: #f8f9fa; border: 2px dashed #cc0000; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 26px; font-weight: bold; letter-spacing: 6px; color: #111;">${otpCode}</span>
                    </div>
                    <p style="color: #777; font-size: 12px;">
                        این کد تا ۱۰ دقیقه معتبر است. اگر شما درخواست ثبت‌نام نداده‌اید، این ایمیل را نادیده بگیرید.
                    </p>
                </div>
            `
        });

        res.json({
            success: true,
            requiresVerification: true,
            message: 'کد تایید ۶ رقمی به ایمیل شما ارسال شد.'
        });
    } catch (err) {
        console.error('Register / Mail Error:', err);
        res.status(500).json({
            success: false,
            error: 'خطا در ارسال ایمیل تایید. لطفاً از صحت ایمیل یا تنظیمات SMTP سرور اطمینان حاصل کنید.'
        });
    }
});

// مرحله ۲ ثبت‌نام: بررسی کد تایید ایمیل و ثبت نهایی در دیتابیس
app.post('/api/verify-email', [
    body('email').isEmail().withMessage('ایمیل نامعتبر است.'),
    body('code').trim().isLength({ min: 6, max: 6 }).withMessage('کد تایید باید ۶ رقم باشد.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const normalizedEmail = req.body.email.trim().toLowerCase();
        const code = req.body.code.trim();

        const record = verificationCodes.get(normalizedEmail);
        if (!record) {
            return res.status(400).json({ success: false, error: 'درخواست تاییدی برای این ایمیل یافت نشد. لطفاً دوباره ثبت‌نام کنید.' });
        }

        if (Date.now() > record.expiresAt) {
            verificationCodes.delete(normalizedEmail);
            return res.status(400).json({ success: false, error: 'کد تایید منقضی شده است. لطفاً مجدداً درخواست دهید.' });
        }

        if (record.code !== code) {
            return res.status(400).json({ success: false, error: 'کد تایید وارد شده صحیح نیست.' });
        }

        const u = record.userData;
        const result = await pool.query(
            `INSERT INTO users (name, user_type, phone_or_id, email, phone, is_verified, password, province, city, district)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9) RETURNING id, name, user_type, email`,
            [u.name, u.user_type, u.phone_or_id, u.email, u.phone, u.password, u.province, u.city, u.district]
        );

        verificationCodes.delete(normalizedEmail);

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
});

// API ورود (پشتیبانی از ایمیل و شناسه‌های قبلی)
app.post('/api/login', [
    body('phone_or_id').trim().notEmpty().withMessage('ایمیل یا شناسه الزامی است.'),
    body('password').notEmpty().withMessage('رمز عبور الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const identifier = req.body.phone_or_id.trim().toLowerCase();
        const { password } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(phone_or_id) = $1',
            [identifier]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'کاربری با این ایمیل یا مشخصات یافت نشد.' });
        }
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'رمز عبور اشتباه است.' });
        }
        res.json({
            success: true,
            user: { id: user.id, name: user.name, type: user.user_type }
        });
    } catch (err) {
        next(err);
    }
});

// API لیست پروژه‌ها
app.get('/api/projects', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// API ساخت پروژه جدید
app.post('/api/projects', upload.single('media_file'), [
    body('title').trim().notEmpty().withMessage('عنوان پروژه الزامی است.'),
    body('charity_name').trim().notEmpty().withMessage('نام خیریه الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const { title, charity_name, charity_id, province, district, description, user_type } = req.body;

        if (user_type !== 'legal' && user_type !== 'charity') {
            return res.status(403).json({
                success: false,
                error: 'دسترسی غیرمجاز.'
            });
        }

        let filePath = '';
        if (req.file) {
            filePath = '/uploads/' + req.file.filename;
        }

        const result = await pool.query(
            `INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path, views, likes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0) RETURNING *`,
            [title.trim(), charity_name.trim(), charity_id || 1, province || null, district || 'مرکزی', description || '', filePath]
        );
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// API ویرایش پروژه
app.put('/api/projects/:id', upload.single('media_file'), [
    body('title').trim().notEmpty().withMessage('عنوان پروژه الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const { id } = req.params;
        const { title, province, district, description } = req.body;

        let query = `UPDATE projects SET title = $1, province = $2, district = $3, description = $4`;
        let params = [title.trim(), province || null, district || null, description || ''];

        if (req.file) {
            const filePath = '/uploads/' + req.file.filename;
            query += `, file_path = $5 WHERE id = $6 RETURNING *`;
            params.push(filePath, id);
        } else {
            query += ` WHERE id = $5 RETURNING *`;
            params.push(id);
        }

        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'پروژه یافت نشد.' });
        }
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// API تعداد بازدید
app.post('/api/projects/:id/view', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const result = await pool.query(
            'UPDATE projects SET views = COALESCE(views, 0) + 1 WHERE id = $1 RETURNING views',
            [projectId]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, views: result.rows[0].views });
        } else {
            res.status(404).json({ success: false, error: 'Not found' });
        }
    } catch (err) {
        next(err);
    }
});

// API لایک
app.post('/api/projects/:id/like', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({ success: false, error: 'شناسه کاربر معتبر نیست.' });
        }

        const check = await pool.query(
            'SELECT * FROM project_likes WHERE user_id = $1 AND project_id = $2',
            [user_id, projectId]
        );

        let liked = false;
        let updateResult;

        if (check.rows.length > 0) {
            await pool.query('DELETE FROM project_likes WHERE user_id = $1 AND project_id = $2', [user_id, projectId]);
            updateResult = await pool.query(
                'UPDATE projects SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = $1 RETURNING likes',
                [projectId]
            );
            liked = false;
        } else {
            await pool.query('INSERT INTO project_likes (user_id, project_id) VALUES ($1, $2)', [user_id, projectId]);
            updateResult = await pool.query(
                'UPDATE projects SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING likes',
                [projectId]
            );
            liked = true;
        }

        res.json({
            success: true,
            liked: liked,
            likes: updateResult.rows[0].likes
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/projects/:id/user-liked', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const projectId = req.params.id;
        const userId = req.query.user_id;
        if (!userId) return res.json({ liked: false });

        const check = await pool.query(
            'SELECT * FROM project_likes WHERE user_id = $1 AND project_id = $2',
            [userId, projectId]
        );
        res.json({ liked: check.rows.length > 0 });
    } catch (err) {
        next(err);
    }
});

// API کامنت‌ها
app.get('/api/comments/:video_id', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { video_id } = req.params;
        const result = await pool.query('SELECT user_name as user, text FROM comments WHERE video_id = $1 ORDER BY id DESC', [video_id]);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.post('/api/comments', [
    body('video_id').notEmpty().withMessage('شناسه محتوا الزامی است.'),
    body('user_name').trim().notEmpty().withMessage('نام کاربر الزامی است.'),
    body('text').trim().notEmpty().withMessage('متن دیدگاه الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const { video_id, user_name, text } = req.body;
        await pool.query(
            'INSERT INTO comments (video_id, user_name, text) VALUES ($1, $2, $3)',
            [video_id, user_name.trim(), text.trim()]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// API اشتراک‌ها
app.get('/api/subscriptions/:user_id', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { user_id } = req.params;
        const result = await pool.query('SELECT charity_id as id, charity_name as name FROM subscriptions WHERE user_id = $1', [user_id]);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.post('/api/subscriptions/toggle', [
    body('user_id').notEmpty().withMessage('شناسه کاربر الزامی است.'),
    body('charity_id').notEmpty().withMessage('شناسه خیریه الزامی است.'),
    body('charity_name').trim().notEmpty().withMessage('نام خیریه الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const { user_id, charity_id, charity_name } = req.body;
        const check = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
        if (check.rows.length > 0) {
            await pool.query('DELETE FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
            res.json({ success: true, subscribed: false });
        } else {
            await pool.query(
                'INSERT INTO subscriptions (user_id, charity_id, charity_name) VALUES ($1, $2, $3)',
                [user_id, charity_id, charity_name.trim()]
            );
            res.json({ success: true, subscribed: true });
        }
    } catch (err) {
        next(err);
    }
});

app.use((err, req, res, next) => {
    console.error('Server Error Detail:', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'خطای داخلی سرور'
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
