const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

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

async function seedDatabase() {
    try {
        console.log("در حال پاکسازی جدول‌های قبلی برای درج دقیق داده‌های جدید...");
        // حذف داده‌های قبلی با رعایت کلیدهای خارجی (Cascade)
        await pool.query(`TRUNCATE TABLE project_comments CASCADE;`);
        await pool.query(`TRUNCATE TABLE charity_projects CASCADE;`);
        await pool.query(`TRUNCATE TABLE charity_users CASCADE;`);

        console.log("شروع درج ۲۰ خیریه و پروژه‌های آن‌ها...");
        const hashedPassword = await bcrypt.hash('123456', 10);

        for (let i = 0; i < 20; i++) {
            const loc = provincesAndCities[i];
            const name = charityNames[i];
            const email = `charity${i + 1}@mehrnama.info`;
            const phone = `0912345${i < 10 ? '0' + i : i}`;
            const regNum = `REG-${1000 + i}`;
            const landline = `0218888${i < 10 ? '0' + i : i}`;

            // ۱. ثبت خیریه
            const charityRes = await pool.query(
                `INSERT INTO charity_users 
                (name, email, phone, password, registration_number, landline_phone, province, district, location_name) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                RETURNING id`,
                [name, email, phone, hashedPassword, regNum, landline, loc.province, loc.district, loc.location]
            );

            const charityId = charityRes.rows[0].id;

            // ۲. تولید تصادفی بین ۲ تا ۴ پروژه برای هر خیریه
            const projectCount = Math.floor(Math.random() * 3) + 2; // بین ۲ تا ۴
            for (let j = 0; j < projectCount; j++) {
                const title = projectTitles[Math.floor(Math.random() * projectTitles.length)];
                const description = `گزارش کامل و مستندات مربوط به فعالیت خیرخواهانه انجام شده توسط ${name} در منطقه ${loc.location} استان ${loc.province}.`;
                const filePath = `https://picsum.photos/seed/mehrnama_${charityId}_${j}/600/400`;

                await pool.query(
                    `INSERT INTO charity_projects (charity_id, title, description, file_path) 
                    VALUES ($1, $2, $3, $4)`,
                    [charityId, title, description, filePath]
                );
            }
        }

        console.log("عملیات با موفقیت کامل انجام شد! دقیقاً ۲۰ خیریه با پروژه‌هایشان ثبت شدند.");
        process.exit(0);
    } catch (err) {
        console.error("خطا در درج داده‌های نمونه:", err);
        process.exit(1);
    }
}

seedDatabase();
