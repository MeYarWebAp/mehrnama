const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

async function initDB() {
    try {
        // ایجاد جداول پایه
        await pool.query(`
            CREATE TABLE IF NOT EXISTS charity_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS regular_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS charity_projects (
                id SERIAL PRIMARY KEY,
                charity_id INT REFERENCES charity_users(id),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_comments (
                id SERIAL PRIMARY KEY,
                project_id INT REFERENCES charity_projects(id),
                author_name VARCHAR(100) NOT NULL,
                comment_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // اضافه کردن ستون‌های تکمیلی به جدول خیریه اگر وجود نداشته باشند
        await pool.query(`
            ALTER TABLE charity_users ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100);
            ALTER TABLE charity_users ADD COLUMN IF NOT EXISTS landline_phone VARCHAR(50);
            ALTER TABLE charity_users ADD COLUMN IF NOT EXISTS province VARCHAR(100);
            ALTER TABLE charity_users ADD COLUMN IF NOT EXISTS district VARCHAR(100);
            ALTER TABLE charity_users ADD COLUMN IF NOT EXISTS location_name VARCHAR(100);
        `);

        console.log("DB Tables and columns verified successfully.");

        const checkCharities = await pool.query('SELECT COUNT(*) FROM charity_users;');
        const count = parseInt(checkCharities.rows[0].count);
        console.log(`Current charities count: ${count}`);

        if (count < 20) {
            console.log("Charities count < 20. Truncating and seeding 20 charities...");
            await pool.query('TRUNCATE TABLE project_comments CASCADE;');
            await pool.query('TRUNCATE TABLE charity_projects CASCADE;');
            await pool.query('TRUNCATE TABLE charity_users CASCADE;');
            await seedSampleData();
        }
    } catch (err) {
        console.error("DB Initialization Error:", err);
    }
}

async function seedSampleData() {
    const provincesAndCities = [
        { province: 'تهران', district: 'تهران', location: 'تجریش' },
        { province: 'اصفهان', district: 'اصفهان', location: 'منطقه ۱' },
        { province: 'خراسان رضوی', district: 'مشهد', location: 'احمدآباد' },
        { province: 'فارس', district: 'شیراز', location: 'عفیف‌آباد' },
        { province: 'آذربایجان شرقی', district: 'تبریز', location: 'ولیعصر' },
        { province: 'خوزستان', district: 'اهواز', location: 'کیانپارس' },
        { province: 'مازندران', district: 'ساری', location: 'معلم' },
        { province: 'گیلان', district: 'رشت', location: 'گلسار' },
        { province: 'کرمان', district: 'کرمان', location: 'جهاد' },
        { province: 'البرز', district: 'کرج', location: 'جهانشهر' },
        { province: 'قم', district: 'قم', location: 'صفاییه' },
        { province: 'کرمانشاه', district: 'کرمانشاه', location: 'مسکن' },
        { province: 'سیستان و بلوچستان', district: 'زاهدان', location: 'دانشگاه' },
        { province: 'هرمزگان', district: 'بندرعباس', location: 'گلشهر' },
        { province: 'یزد', district: 'یزد', location: 'صفائیه' },
        { province: 'لرستان', district: 'خرم‌آباد', location: 'شهدای شرقی' },
        { province: 'گلستان', district: 'گرگان', location: 'ناهارخوران' },
        { province: 'مرکزی', district: 'اراک', location: 'پوسینا' },
        { province: 'همدان', district: 'همدان', location: 'جهاد' },
        { province: 'اردبیل', district: 'اردبیل', location: 'حافظ' }
    ];

    const charityNames = [
        'خیریه مهر آفرین', 'بنیاد نیکوکاری باران', 'موسسه خیریه امید فردا', 'کانال همدلی و احسان',
        'خیریه روشنای اندیشه', 'موسسه دست‌های مهربان', 'بنیاد خیریه فجر مهر', 'خیریه یاور محرومان',
        'موسسه همیار جوانان', 'خیریه پناه‌گاه عاطفه', 'بنیاد نیکوکاری نسیم رحمت', 'خیریه گل‌های بهشتی',
        'موسسه خیریه جوادالائمه', 'خیریه نور هدایت', 'بنیاد همدلان جوان', 'خیریه سبز اندیشان',
        'موسسه نیکوکاری پرتو مهر', 'خیریه فجر هدایت', 'بنیاد خیریه خیر ماندگار', 'موسسه حامیان کرامت'
    ];

    const projectTitles = [
        'تزیع بسته‌های معیشتی و مواد غذایی',
        'پویش تأمین لوازم‌التحریر دانش‌آموزان',
        'پروژه تأمین دارو و درمان بیماران نیازمند',
        'یاری‌رسانی عمومی و توزیع اقلام گرمایشی',
        'احداث و بازسازی خانه نیازمندان در روستا',
        'توزیع پوشاک عیدانه بین کودکان محروم',
        'پروژه تأمین جهیزیه نوعروسان نیازمند',
        'توسعه و تجهیز کتابخانه مناطق محروم'
    ];

    const hashedPassword = await bcrypt.hash('123456', 10);

    for (let i = 0; i < 20; i++) {
        const loc = provincesAndCities[i];
        const name = charityNames[i];
        const email = `charity${i + 1}@mehrnama.info`;
        const phone = `0912345${i < 10 ? '0' + i : i}`;
        const regNum = `REG-${1000 + i}`;
        const landline = `0218888${i < 10 ? '0' + i : i}`;

        const charityRes = await pool.query(
            `INSERT INTO charity_users 
            (name, email, phone, password, registration_number, landline_phone, province, district, location_name) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING id`,
            [name, email, phone, hashedPassword, regNum, landline, loc.province, loc.district, loc.location]
        );

        const charityId = charityRes.rows[0].id;
        const projectCount = Math.floor(Math.random() * 3) + 2;

        for (let j = 0; j < projectCount; j++) {
            const title = projectTitles[Math.floor(Math.random() * projectTitles.length)];
            const description = `گزارش کامل و مستندات مربوط به فعالیت خیرخواهانه انجام شده توسط ${name} در منطقه ${loc.location} استان ${loc.province}.`;
            const filePath = `https://picsum.photos/seed/mehrnama_${charityId_${j}}/600/400`;

            await pool.query(
                `INSERT INTO charity_projects (charity_id, title, description, file_path) 
                VALUES ($1, $2, $3, $4)`,
                [charityId, title, description, filePath]
            );
        }
    }
    console.log("Successfully seeded 20 charities and projects.");
}

// APIs
app.post('/api/users/register', async (req, res) => {
    const { name, phone, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO regular_users (name, phone, password) VALUES ($1, $2, $3) RETURNING id, name, phone',
            [name, phone, hashedPassword]
        );
        res.status(201).json({ message: 'User registered', user: result.rows[0] });
    } catch (err) {
        res.status(400).json({ error: 'Registration error' });
    }
});

app.post('/api/users/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM regular_users WHERE phone = $1', [phone]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
        res.json({ message: 'Login successful', user: { id: user.id, name: user.name, phone: user.phone } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/charities/register', async (req, res) => {
    const { name, email, phone, password, registration_number, landline_phone, province, district, location_name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO charity_users 
            (name, email, phone, password, registration_number, landline_phone, province, district, location_name) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, email`,
            [name, email, phone, hashedPassword, registration_number, landline_phone, province, district, location_name]
        );
        res.status(201).json({ message: 'Charity registered', charity: result.rows[0] });
    } catch (err) {
        res.status(400).json({ error: 'Charity registration error' });
    }
});

app.post('/api/charities/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM charity_users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
        const charity = result.rows[0];
        const validPassword = await bcrypt.compare(password, charity.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
        res.json({ message: 'Login successful', charity: { id: charity.id, name: charity.name, email: charity.email } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

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
        res.status(500).json({ error: 'Project creation failed' });
    }
});

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
        res.status(500).json({ error: 'Fetching projects failed' });
    }
});

app.get('/api/charities/:id/projects', async (req, res) => {
    const charityId = req.params.id;
    try {
        const charityRes = await pool.query('SELECT id, name, email, phone FROM charity_users WHERE id = $1', [charityId]);
        if (charityRes.rows.length === 0) return res.status(404).json({ error: 'Channel not found.' });
        const projectsRes = await pool.query(
            'SELECT * FROM charity_projects WHERE charity_id = $1 ORDER BY created_at DESC',
            [charityId]
        );
        res.json({ charity: charityRes.rows[0], projects: projectsRes.rows });
    } catch (err) {
        res.status(500).json({ error: 'Fetching channel failed' });
    }
});

app.get('/api/projects/:id/comments', async (req, res) => {
    const projectId = req.params.id;
    try {
        const result = await pool.query('SELECT * FROM project_comments WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Fetching comments failed' });
    }
});

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
        res.status(500).json({ error: 'Posting comment failed' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ابتدا دیتابیس کامل مقداردهی و به‌روزرسانی شود، سپس سرور روشن شود
initDB().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
});
