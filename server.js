const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db'); // فایل اتصال به دیتابیس PostgreSQL

const app = express();

// میان‌افزار (Middleware) برای خواندن داده‌های JSON و فرم‌ها
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// اطمینان از وجود پوشه uploads برای ذخیره موقت فایل‌ها
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// سرو کردن پوشه uploads به صورت استاتیک برای دسترسی به فایل‌ها
app.use('/uploads', express.static(uploadDir));

// تنظیمات Multer برای مدیریت آپلود ویدیو و تصویر
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // محدودیت حجم: 50 مگابایت
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط آپلود فایل‌های تصویری و ویدیویی مجاز است!'), false);
    }
  }
});

// مسیر تست سرور
app.get('/', (req, res) => {
  res.send('به مهرنما خوش آمدید - پلتفرم پروژه‌های خیریه فعال است.');
});

// 1. API ثبت‌نام خیریه
app.post('/api/charities/register', async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'لطفاً نام، ایمیل و رمز عبور را وارد کنید.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO charities (name, email, password, phone) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, name, email, phone, created_at;
    `;
    const values = [name, email, hashedPassword, phone || null];
    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'خیریه با موفقیت ثبت‌نام شد.',
      charity: result.rows[0]
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'این ایمیل قبلاً در سیستم ثبت‌نام شده است.' });
    }
    res.status(500).json({ error: 'خطای داخلی سرور رخ داده است.' });
  }
});

// 2. API ثبت پروژه و آپلود ویدیو/فایل مربوط به خیریه
app.post('/api/projects/create', upload.single('projectFile'), async (req, res) => {
  const { charity_id, title, description } = req.body;

  if (!charity_id || !title || !req.file) {
    return res.status(400).json({ error: 'لطفاً شناسه خیریه، عنوان پروژه و فایل ویدیویی را ارسال کنید.' });
  }

  try {
    const filePath = `/uploads/${req.file.filename}`;

    const query = `
      INSERT INTO projects (charity_id, title, description, file_path) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, charity_id, title, description, file_path, created_at;
    `;
    const values = [charity_id, title, description || '', filePath];
    const result = await pool.query(query, values);

    res.status(201).json({
      message: 'پروژه و فایل آن با موفقیت در دیتابیس ثبت شد.',
      project: result.rows[0]
    });
  } catch (err) {
    console.error('Project creation error:', err);
    res.status(500).json({ error: 'خطا در ثبت پروژه.' });
  }
});

// مدیریت خطاهای Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
