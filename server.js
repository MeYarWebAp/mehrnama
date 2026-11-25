const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

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

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تلاش‌های ناموفق بیش از حد مجاز. لطفاً ۱۵ دقیقه دیگر تلاش کنید.' }
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/send-verification-code', authLimiter);
app.use('/api/forgot-password', authLimiter);

const gmailUser = process.env.GMAIL_USER || 'mehrnama.info@gmail.com';
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || '';

const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: gmailUser,
        pass: gmailAppPassword
    }
});

const verificationCodes = new Map();
const resetPasswordCodes = new Map();

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

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
                first_name VARCHAR(150),
                last_name VARCHAR(150),
                national_id VARCHAR(50),
                phone VARCHAR(50),
                manager_first_name VARCHAR(150),
                manager_last_name VARCHAR(150),
                manager_national_id VARCHAR(50),
                manager_phone VARCHAR(50),
                user_type VARCHAR(50) NOT NULL,
                phone_or_id VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255) NOT NULL,
                province VARCHAR(100),
                city VARCHAR(100),
                district VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(150);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(150);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_first_name VARCHAR(150);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_last_name VARCHAR(150);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_national_id VARCHAR(50);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_phone VARCHAR(50);`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);

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
                uploader_type VARCHAR(50) DEFAULT 'legal',
                province VARCHAR(100),
                district VARCHAR(100),
                description TEXT,
                file_path VARCHAR(255),
                views INT DEFAULT 0,
                likes INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS uploader_type VARCHAR(50) DEFAULT 'legal';`);
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

app.post('/api/send-verification-code', [
    body('email').isEmail().withMessage('لطفاً یک آدرس ایمیل معتبر وارد کنید.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    if (!gmailAppPassword) {
        return res.status(500).json({
            success: false,
            error: 'رمز برنامه‌ای GMAIL_APP_PASSWORD روی سرور تنظیم نشده است.'
        });
    }

    try {
        const email = normalizeEmail(req.body.email);
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 10 * 60 * 1000;

        verificationCodes.set(email, { code, expiresAt });

        await mailTransporter.sendMail({
            from: `"مهرنما" <${gmailUser}>`,
            to: email,
            subject: 'کد تایید ثبت‌نام در مهرنما',
            text: `کد تایید ثبت‌نام شما در سامانه مهرنما: ${code}\nاین کد تا ۱۰ دقیقه معتبر است.`,
            html: `
                <div dir="rtl" style="font-family: Tahoma, sans-serif; line-height: 1.8; color: #222;">
                    <h2 style="color: #cc0000;">تایید ایمیل در مهرنما</h2>
                    <p>کاربر گرامی، کد تایید ثبت‌نام شما در سامانه مهرنما عبارت است از:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #f3f4f6; padding: 12px 20px; border-radius: 8px; display: inline-block; margin: 10px 0;">
                        ${code}
                    </div>
                    <p style="font-size: 13px; color: #666;">این کد به مدت ۱۰ دقیقه معتبر است.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'کد تایید به ایمیل شما ارسال شد.' });
    } catch (err) {
        next(err);
    }
});

app.post('/api/forgot-password/send-code', [
    body('email').isEmail().withMessage('لطفاً یک آدرس ایمیل معتبر وارد کنید.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    if (!gmailAppPassword) {
        return res.status(500).json({
            success: false,
            error: 'رمز برنامه‌ای GMAIL_APP_PASSWORD روی سرور تنظیم نشده است.'
        });
    }

    try {
        const email = normalizeEmail(req.body.email);
        const pool = getPool(req);
        const userCheck = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
            [email]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'حساب کاربری با این ایمیل یافت نشد.'
            });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 10 * 60 * 1000;

        resetPasswordCodes.set(email, { code, expiresAt });

        await mailTransporter.sendMail({
            from: `"مهرنما" <${gmailUser}>`,
            to: email,
            subject: 'کد بازیابی رمز عبور در مهرنما',
            text: `کد بازیابی رمز عبور شما در سامانه مهرنما: ${code}\nاین کد تا ۱۰ دقیقه معتبر است.`,
            html: `
                <div dir="rtl" style="font-family: Tahoma, sans-serif; line-height: 1.8; color: #222;">
                    <h2 style="color: #cc0000;">بازیابی رمز عبور در مهرنما</h2>
                    <p>کاربر گرامی، کد بازیابی رمز عبور حساب شما در مهرنما عبارت است از:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #f3f4f6; padding: 12px 20px; border-radius: 8px; display: inline-block; margin: 10px 0;">
                        ${code}
                    </div>
                    <p style="font-size: 13px; color: #666;">این کد به مدت ۱۰ دقیقه معتبر است. اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'کد بازیابی رمز عبور به ایمیل شما ارسال شد.' });
    } catch (err) {
        next(err);
    }
});

app.post('/api/forgot-password/reset', [
    body('email').isEmail().withMessage('ایمیل معتبر الزامی است.'),
    body('code').trim().notEmpty().withMessage('کد بازیابی الزامی است.'),
    body('new_password').isLength({ min: 6 }).withMessage('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const email = normalizeEmail(req.body.email);
        const submittedCode = String(req.body.code || '').trim();
        const savedEntry = resetPasswordCodes.get(email);

        if (!savedEntry || Date.now() > savedEntry.expiresAt) {
            resetPasswordCodes.delete(email);
            return res.status(400).json({
                success: false,
                error: 'کد بازیابی منقضی شده یا ارسال نشده است. لطفاً دوباره کد درخواست کنید.'
            });
        }

        if (savedEntry.code !== submittedCode) {
            return res.status(400).json({
                success: false,
                error: 'کد بازیابی واردشده صحیح نیست.'
            });
        }

        const pool = getPool(req);
        const hashedPassword = await bcrypt.hash(req.body.new_password, 10);
        const updateResult = await pool.query(
            'UPDATE users SET password = $1 WHERE LOWER(email) = $2 RETURNING id',
            [hashedPassword, email]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'حساب کاربری با این ایمیل یافت نشد.'
            });
        }

        resetPasswordCodes.delete(email);
        res.json({ success: true, message: 'رمز عبور شما با موفقیت تغییر کرد.' });
    } catch (err) {
        next(err);
    }
});

app.post('/api/register', [
    body('email').isEmail().withMessage('ایمیل معتبر الزامی است.'),
    body('verification_code').trim().notEmpty().withMessage('کد تایید ایمیل الزامی است.'),
    body('password').isLength({ min: 6 }).withMessage('رمز عبور باید حداقل ۶ کاراکتر باشد.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const email = normalizeEmail(req.body.email);
        const submittedCode = String(req.body.verification_code || '').trim();
        const savedEntry = verificationCodes.get(email);

        if (!savedEntry || Date.now() > savedEntry.expiresAt) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                error: 'کد تایید منقضی شده یا ارسال نشده است. لطفاً دوباره کد درخواست کنید.'
            });
        }

        if (savedEntry.code !== submittedCode) {
            return res.status(400).json({
                success: false,
                error: 'کد تایید واردشده صحیح نیست.'
            });
        }

        const userType = req.body.user_type === 'legal' ? 'legal' : 'real';

        let firstName = String(req.body.first_name || '').trim();
        let lastName = String(req.body.last_name || '').trim();
        let nationalId = String(req.body.national_id || '').trim();
        let phone = String(req.body.phone || '').trim();

        let orgName = String(req.body.name || '').trim();
        let regNo = String(req.body.reg_no || req.body.phone_or_id || '').trim();
        let managerFirstName = String(req.body.manager_first_name || '').trim();
        let managerLastName = String(req.body.manager_last_name || '').trim();
        let managerNationalId = String(req.body.manager_national_id || '').trim();
        let managerPhone = String(req.body.manager_phone || '').trim();

        let displayName = '';
        let uniqueIdentifier = '';

        if (userType === 'real') {
            if (!firstName || !lastName || !nationalId || !phone) {
                return res.status(400).json({
                    success: false,
                    error: 'لطفاً نام، نام خانوادگی، کد ملی و شماره همراه منطبق با کد ملی را کامل وارد کنید.'
                });
            }
            displayName = `${firstName} ${lastName}`.trim();
            uniqueIdentifier = email;
        } else {
            if (!orgName || !regNo || !managerFirstName || !managerLastName || !managerNationalId || !managerPhone) {
                return res.status(400).json({
                    success: false,
                    error: 'لطفاً نام موسسه، شماره ثبت و مشخصات کامل مدیر موسسه (نام، نام خانوادگی، کد ملی و شماره همراه) را وارد کنید.'
                });
            }
            displayName = orgName;
            uniqueIdentifier = email;
        }

        const pool = getPool(req);
        const existingEmail = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (existingEmail.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'این ایمیل قبلاً در سامانه ثبت شده است.'
            });
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const result = await pool.query(
            `INSERT INTO users (
                name, first_name, last_name, national_id, phone,
                manager_first_name, manager_last_name, manager_national_id, manager_phone,
                user_type, phone_or_id, email, password, province, city, district
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id, name, user_type, email`,
            [
                displayName,
                userType === 'real' ? firstName : null,
                userType === 'real' ? lastName : null,
                userType === 'real' ? nationalId : null,
                userType === 'real' ? phone : null,
                userType === 'legal' ? managerFirstName : null,
                userType === 'legal' ? managerLastName : null,
                userType === 'legal' ? managerNationalId : null,
                userType === 'legal' ? managerPhone : null,
                userType,
                uniqueIdentifier,
                email,
                hashedPassword,
                req.body.province || null,
                req.body.city || null,
                req.body.district || null
            ]
        );

        verificationCodes.delete(email);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

app.post('/api/login', [
    body('email').isEmail().withMessage('لطفاً ایمیل معتبر وارد کنید.'),
    body('password').notEmpty().withMessage('رمز عبور الزامی است.')
], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const pool = getPool(req);
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'کاربری با این ایمیل یافت نشد.' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'رمز عبور اشتباه است.' });
        }

        res.json({
            success: true,
            user: { id: user.id, name: user.name, type: user.user_type, email: user.email }
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/projects', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

app.post('/api/projects', upload.single('media_file'), async (req, res, next) => {
    try {
        const pool = getPool(req);
        const title = String(req.body.title || '').trim();
        const charityName = String(req.body.charity_name || '').trim();
        const charityId = req.body.charity_id ? Number(req.body.charity_id) : null;
        const uploaderType = req.body.user_type === 'real' ? 'real' : 'legal';
        const province = String(req.body.province || '').trim();
        const district = String(req.body.district || 'مرکزی').trim();
        const description = String(req.body.description || '').trim();

        if (!title || !province || !charityId) {
            return res.status(400).json({
                success: false,
                error: 'لطفاً وارد حساب کاربری شوید و عنوان و استان را تکمیل کنید.'
            });
        }

        let filePath = '';
        if (req.file) {
            filePath = '/uploads/' + req.file.filename;
        }

        const result = await pool.query(
            `INSERT INTO projects (title, charity_name, charity_id, uploader_type, province, district, description, file_path, views, likes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0) RETURNING *`,
            [
                title,
                charityName || (uploaderType === 'real' ? 'کاربر حقیقی' : 'موسسه خیریه'),
                charityId,
                uploaderType,
                province,
                district || 'مرکزی',
                description,
                filePath
            ]
        );
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

app.put('/api/projects/:id', upload.single('media_file'), async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { id } = req.params;
        const { title, province, district, description } = req.body;

        let query = `UPDATE projects SET title = $1, province = $2, district = $3, description = $4`;
        let params = [title, province, district, description];

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

app.post('/api/comments', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { video_id, user_name, text } = req.body;
        await pool.query('INSERT INTO comments (video_id, user_name, text) VALUES ($1, $2, $3)', [video_id, user_name, text]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

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

app.post('/api/subscriptions/toggle', async (req, res, next) => {
    try {
        const pool = getPool(req);
        const { user_id, charity_id, charity_name } = req.body;
        const check = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
        if (check.rows.length > 0) {
            await pool.query('DELETE FROM subscriptions WHERE user_id = $1 AND charity_id = $2', [user_id, charity_id]);
            res.json({ success: true, subscribed: false });
        } else {
            await pool.query('INSERT INTO subscriptions (user_id, charity_id, charity_name) VALUES ($1, $2, $3)', [user_id, charity_id, charity_name]);
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
