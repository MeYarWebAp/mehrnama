# Dockerfile
FROM node:22-alpine

# تنظیم پوشه کاری
WORKDIR /app

# کپی کردن فایل‌های نیازمندی و نصب وابستگی‌های پروداکشن
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# کپی کردن کل کد پروژه با مالکیت کاربر node
COPY --chown=node:node . .

# ایجاد پوشه آپلود با مالکیت کاربر node
RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads

# استفاده از کاربر غیر-root برای افزایش امنیت
USER node

# باز کردن پورت ۳۰۰۰
EXPOSE 3000

# دستور اجرای برنامه
CMD ["npm", "start"]
