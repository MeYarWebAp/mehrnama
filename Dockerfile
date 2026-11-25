# Dockerfile
FROM node:18-alpine

# نصب ffmpeg برای سازگاری و پخش صحیح ویدیو و صدا
RUN apk add --no-cache ffmpeg

# تنظیم پوشه کاری
WORKDIR /app

# کپی کردن فایل‌های نیازمندی
COPY package*.json ./

# نصب نیازمندی‌ها
RUN npm install --production

# کپی کردن کل کد پروژه
COPY . .

# باز کردن پورت ۳۰۰۰
EXPOSE 3000

# دستور اجرای برنامه
CMD ["npm", "start"]
```[cite: 7]

پس از ذخیره این تغییرات، ایمیج را دوباره `build` کنید تا `ffmpeg` داخل کانتینر نصب شود. آیا مایلید کد تبدیل خودکار ویدیوهای آپلودشده به فرمت استاندارد `MP4 (H.264 + AAC)` را هم به `server_2.js` اضافه کنم؟
