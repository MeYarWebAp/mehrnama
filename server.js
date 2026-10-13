// server.jsmm
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ...صفحه اصلی ساده مهرنما
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>مهرنما | تصویر شفاف مهربانی</title>
      <style>
        body { font-family: Tahoma, sans-serif; text-align: center; background: #f4f7f6; padding: 50px; }
        h1 { color: #2c3e50; }
        p { color: #7f8c8d; }
        .card { background: white; padding: 20px; border-radius: 8px; max-width: 500px; margin: auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>به مهرنما خوش آمدید</h1>
        <p>بستر تخصصی معرفی ویدیویی پروژه‌های اجتماعی و شفاف‌سازی خیریه‌ها</p>
        <p><strong>نسخه آزمایشی (MVP) در حال راه‌اندازی است...</strong></p>
      </div>
    </body>
    </html>
  `);
});

// API نمونه برای لیست ویدیوها
app.get('/api/videos', (req, res) => {
  res.json([
    { id: 1, title: 'پروژه ساخت مدرسه در سیستان', charity: 'خیریه نمونه', duration: '03:45' }
  ]);
});

app.listen(PORT, () => {
  console.log(`Mehrnama server is running on port ${PORT}`);
});
