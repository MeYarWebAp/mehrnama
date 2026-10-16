const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload folder setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer storage setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// PostgreSQL Database Connection on Runflare
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Initialize Database Tables
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
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
                views INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                video_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                charity_id INTEGER NOT NULL,
                charity_name VARCHAR(255) NOT NULL,
                UNIQUE(user_id, charity_id)
            );
        `);
        console.log('Database tables initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

initDB();

// Register User / Charity
app.post('/api/register', async (req, res) => {
    try {
        const { name, user_type, phone_or_id, password, province, city, district } = req.body;
        
        const checkUser = await pool.query('SELECT * FROM users WHERE phone_or_id = $1', [phone_or_id]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: 'Karbari ba in shomare ya shenase ghablan sabt-nam karde ast.' });
        }

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
        res.status(500).json({ error: 'Khata dar sabt-nam karbar' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { phone_or_id, password, user_type } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE phone_or_id = $1 AND user_type = $2', [phone_or_id, user_type]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Karbari ba in etelaat yaft nashod.' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Ramz-e oboor nadorost ast.' });
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
        res.status(500).json({ error: 'Khata dar farayand-e vorood' });
    }
});

// Get Projects List
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar daryaft-e پروژه ها' });
    }
});

// Create New Project with File Upload
app.post('/api/projects', upload.single('media_file'), async (req, res) => {
    try {
        const { title, charity_name, charity_id, province, district, description } = req.body;
        const file_path = req.file ? `/uploads/${req.file.filename}` : (req.body.file_path || 'https://picsum.photos/seed/upload/600/400');

        const query = `
            INSERT INTO projects (title, charity_name, charity_id, province, district, description, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
        `;
        const values = [title, charity_name, charity_id || 1, province, district || 'مرکزی', description, file_path];
        const result = await pool.query(query, values);
        
        res.json({ success: true, project: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar sabt-e proje' });
    }
});

// Edit Project
app.put('/api/projects/:id', upload.single('media_file'), async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, province, district, description, charity_id } = req.body;
        
        const checkProj = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        if (checkProj.rows.length === 0) {
            return res.status(404).json({ error: 'Proje yaft nashod' });
        }

        const project = checkProj.rows[0];
        if (charity_id && project.charity_id != charity_id && charity_id != 99) {
            return res.status(403).json({ error: 'Shoma ejaze-ye virayesh in proje ra nadarid' });
        }
        
        let file_path = req.file ? `/uploads/${req.file.filename}` : (req.body.file_path || project.file_path);

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
        res.status(500).json({ error: 'Khata dar virayesh-e proje' });
    }
});

// Increment View Count
app.post('/api/projects/:id/view', async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await pool.query(
            'UPDATE projects SET views = views + 1 WHERE id = $1 RETURNING views',
            [projectId]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, views: result.rows[0].views });
        } else {
            res.status(404).json({ error: 'Proje yaft nashod' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar sabt-e bazdid' });
    }
});

// Get Comments
app.get('/api/comments/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const result = await pool.query('SELECT user_name as user, text FROM comments WHERE video_id = $1 ORDER BY id DESC', [videoId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar daryaft-e nazarat' });
    }
});

// Add Comment
app.post('/api/comments', async (req, res) => {
    try {
        const { video_id, user_name, text } = req.body;
        const result = await pool.query(
            'INSERT INTO comments (video_id, user_name, text) VALUES ($1, $2, $3) RETURNING user_name as user, text',
            [video_id, user_name, text]
        );
        res.json({ success: true, comment: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar sabt-e nazar' });
    }
});

// Get Subscriptions
app.get('/api/subscriptions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query('SELECT charity_id as id, charity_name as name FROM subscriptions WHERE user_id = $1', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Khata dar daryaft-e eshterak-ha' });
    }
});

// Toggle Subscription
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
        res.status(500).json({ error: 'Khata dar taghyir-e vaziat-e eshterak' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
