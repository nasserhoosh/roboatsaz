// /home/nasser/apps/robotmaker/connection.js

// ==========================================
// ۱. تنظیمات اولیه و ورود کتابخانه‌ها
// ==========================================
require('dotenv').config();

// وارد کردن صحیح کلاس Bot از کتابخانه grammy
const { Bot } = require('grammy');
const { ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');

const token = process.env.BOT_TOKEN;

// دریافت و تفکیک لیست پروکسی‌ها از فایل .env
const rawProxies = process.env.PROXIES || process.env.HTTP_PROXY || '';
const proxyList = rawProxies
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.startsWith('http') ? p : `http://${p}`);

// ==========================================
// ۲. تابع ارزیابی اتصالات (مستقیم + لیست پروکسی‌ها)
// ==========================================
async function initBotWithFallback() {
    console.log('--- شروع ارزیابی شبکه ---');
    const defaultDispatcher = getGlobalDispatcher();

    // تست اول: اتصال مستقیم بدون پروکسی
    try {
        console.log('۱. در حال تست اتصال مستقیم (بدون پروکسی)...');
        setGlobalDispatcher(defaultDispatcher);

        const tempBot = new Bot(token);
        const me = await tempBot.api.getMe();

        console.log(`✅ اتصال مستقیم موفقیت‌آمیز بود! نام ربات: @${me.username}`);
        return tempBot;
    } catch (directError) {
        console.warn('⚠️ اتصال مستقیم ناموفق بود:', directError.message);
    }

    // تست دوم: پیمایش لیست پروکسی‌ها
    if (proxyList.length === 0) {
        console.error('❌ هیچ پروکسی مشخصی در فایل .env تعریف نشده است.');
        return null;
    }

    for (let i = 0; i < proxyList.length; i++) {
        const proxyUrl = proxyList[i];
        console.log(`۲.${i + 1}. در حال بررسی پروکسی: ${proxyUrl} ...`);

        try {
            const proxyAgent = new ProxyAgent(proxyUrl);
            setGlobalDispatcher(proxyAgent);

            const tempBot = new Bot(token);
            const me = await tempBot.api.getMe();

            console.log(`✅ اتصال موفق با پروکسی ${proxyUrl}! نام ربات: @${me.username}`);
            return tempBot;
        } catch (proxyError) {
            console.warn(`❌ خطای اتصال روی پروکسی ${proxyUrl}:`, proxyError.message);
        }
    }

    // بازگرداندن تنظیمات شبکه در صورت شکست کامل
    setGlobalDispatcher(defaultDispatcher);
    console.error('❌ تمامی مسیرهای اتصال (مستقیم و لیست پروکسی‌ها) با خطا مواجه شدند.');
    return null;
}

// ==========================================
// ۳. خروجی ماژول
// ==========================================
module.exports = { initBotWithFallback };