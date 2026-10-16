const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Connessione al database PostgreSQL con SSL disabilitato per Runflare
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/mehrnama',
    ssl: false
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
                phone_or_id VARCHAR(255) UNIQUE NOT NULL,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Aggiunta/Verifica automatica della colonna views per evitare l'errore 500
        await pool.query(`
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
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
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                charity_id INT NOT NULL,
                charity_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, charity_id)
            );
        `);

        const projectCheck = await pool.query('SELECT COUNT(*) FROM projects');
        if (parseInt(projectCheck.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path, views)
                VALUES (
                    'ساخت دبستان سه کلاسه روستایی در مناطق محروم',
                    'موسسه خیریه و نیکوکاری باران مهر',
                    1,
                    'سیستان و بلوچستان',
                    'دشتیاری',
                    'پروژه احداث و تجهیز یک دبستان استاندارد و ایمن برای دانش‌آموزان عزیز روستاهای دورافتاده سیستان و بلوچستان.',
                    'https://picsum.photos/600/400',
                    0
                )
            `);
        }
        console.log('Database tables initialized successfully.');
    } catch (err) {
        console.error('Error initializing DB:', err);
    }
}
initDB();

app.post('/api/register', async (req, res) => {
    try {
        const { name, user_type, phone_or_id, password, province, city, district } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, user_type, phone_or_id, password, province, city, district)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, user_type`,
            [name, user_type, phone_or_id, hashedPassword, province, city, district]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, error: 'شناسه یا شماره تلفن قبلا ثبت شده است.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone_or_id, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE phone_or_id = $1', [phone_or_id]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'کاربری با این مشخصات یافت نشد.' });
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
        console.error(err);
        res.status(500).json({ success: false, error: 'خطا در ورود به سامانه.' });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar daryaft-e projaha' });
    }
});

app.post('/api/projects', upload.single('media_file'), async (req, res) => {
    try {
        const { title, charity_name, charity_id, province, district, description } = req.body;
        let filePath = 'https://picsum.photos/600/400';
        if (req.file) {
            filePath = '/uploads/' + req.file.filename;
        }
        const result = await pool.query(
            `INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path, views)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0) RETURNING *`,
            [title, charity_name, charity_id || 1, province, district || 'مرکزی', description, filePath]
        );
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Khata dar sabt-e proje' });
    }
});

app.put('/api/projects/:id', upload.single('media_file'), async (req, res) => {
    try {
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
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Khata dar virayesh-e proje' });
    }
});

app.post('/api/projects/:id/view', async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await pool.query(
            'UPDATE projects SET views = COALESCE(views, 0) + 1 WHERE id = $1 RETURNING views',
            [projectId]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, views: result.rows[0].views });
        } else {
            res.status(404).json({ success: false, error: 'Proje yaft nashod' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Khata dar sabt-e bazdid' });
    }
});

app.get('/api/comments/:video_id', async (req, res) => {
    try {
        const { video_id } = req.params;
        const result = await pool.query('SELECT user_name as user, text FROM comments WHERE video_id = $1 ORDER BY id DESC', [video_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

app.post('/api/comments', async (req, res) => {
    try {
        const { video_id, user_name, text } = req.body;
        await pool.query('INSERT INTO comments (video_id, user_name, text) VALUES ($1, $2, $3)', [video_id, user_name, text]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.get('/api/subscriptions/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const result = await pool.query('SELECT charity_id as id, charity_name as name FROM subscriptions WHERE user_id = $1', [user_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

app.post('/api/subscriptions/toggle', async (req, res) => {
    try {
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
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.listen(port, () => {
    console.log(`Mehrnama server is running on port ${port}`);
});
