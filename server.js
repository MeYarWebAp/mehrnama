const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db'); // وارد کردن تنظیمات دیتابیس از فایل db.js

const app = express();

// میان‌افزار (Middleware) برای خواندن داده‌های JSON از درخواست‌ها
app.use(express.json());

// مسیر تست برای بررسی کارکرد سرور
app.get('/', (req, res) => {
  res.send('به مهرنما خوش آمدید - نسخه آزمایشی (MVP) فعال است.');
});

// API ثبت‌نام خیریه
app.post('/api/charities/register', async (req, res) => {
  const { name, email, password, phone } = req.body;

  // بررسی پر بودن فیلدهای اصلی
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'لطفاً نام، ایمیل و رمز عبور را وارد کنید.' });
  }

  try {
    // هش کردن رمز عبور برای امنیت بالا
    const hashedPassword = await bcrypt.hash(password, 10);

    // درج اطلاعات خیریه در دیتابیس PostgreSQL
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
    
    // خطای تکراری بودن ایمیل در PostgreSQL
    if (err.code === '23505') {
      return res.status(400).json({ error: 'این ایمیل قبلاً در سیستم ثبت‌نام شده است.' });
    }
    
    res.status(500).json({ error: 'خطای داخلی سرور رخ داده است.' });
  }
});

// تعریف پورت سرور (استفاده از پورت ران‌فلر یا پیش‌فرض 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
