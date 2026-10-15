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

// Database tables auto-creation
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS charity_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                registration_number VARCHAR(100),
                landline_phone VARCHAR(50),
                province VARCHAR(100),
                district VARCHAR(100),
                location_name VARCHAR(100)
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
        console.log("Database tables verified successfully.");
    } catch (err) {
        console.error("Database initialization error:", err);
    }
}
initDB();

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

// Regular User Registration
app.post('/api/users/register', async (req, res) => {
    const { name, phone, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO regular_users (name, phone, password) VALUES ($1, $2, $3) RETURNING id, name, phone',
            [name, phone, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (err) {
        console.error('User register error:', err);
        res.status(400).json({ error: 'Registration error. Phone number might already exist.' });
    }
});

// Regular User Login
app.post('/api/users/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM regular_users WHERE phone = $1', [phone]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid phone number or password.' });
        }
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid phone number or password.' });
        }
        res.json({ 
            message: 'Login successful', 
            user: { id: user.id, name: user.name, phone: user.phone } 
        });
    } catch (err) {
        console.error('User login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Charity Registration with detailed fields
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
        res.status(201).json({ message: 'Charity registered successfully', charity: result.rows[0] });
    } catch (err) {
        console.error('Charity register error:', err);
        res.status(400).json({ error: 'Charity registration error. Email or data might be duplicate.' });
    }
});

// Charity Login
app.post('/api/charities/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM charity_users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }
        const charity = result.rows[0];
        const validPassword = await bcrypt.compare(password, charity.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }
        res.json({ 
            message: 'Login successful', 
            charity: { id: charity.id, name: charity.name, email: charity.email } 
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create Project
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
        res.status(500).json({ error: 'Project creation failed' });
    }
});

// Get Projects
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
        res.status(500).json({ error: 'Fetching projects failed' });
    }
});

// Get Charity Channel Projects
app.get('/api/charities/:id/projects', async (req, res) => {
    const charityId = req.params.id;
    try {
        const charityRes = await pool.query('SELECT id, name, email, phone FROM charity_users WHERE id = $1', [charityId]);
        if (charityRes.rows.length === 0) {
            return res.status(404).json({ error: 'Channel not found.' });
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
        res.status(500).json({ error: 'Fetching channel data failed' });
    }
});

// Get Comments
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
        res.status(500).json({ error: 'Fetching comments failed' });
    }
});

// Post Comment
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
        res.status(500).json({ error: 'Posting comment failed' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
