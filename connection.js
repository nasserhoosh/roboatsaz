// /home/nasser/apps/robotmaker/connection.js

// ==========================================
// ۱. تنظیمات اولیه و ورود کتابخانه‌ها
// ==========================================
require('dotenv').config();

const { Bot } = require('node-telegram-bot-api');
const { ProxyAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');

const token = process.env.BOT_TOKEN;

// دریافت و تفکیک لیست پروکسی‌ها از فایل .env
const rawProxies = process.env.PROXIES || process.env.HTTP_PROXY || '';
const proxyList = rawProxies
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.startsWith('http') ? p : `http://${p}`);

// تایم‌اوت برای تست اتصال (بر حسب میلی‌ثانیه)
const PROXY_TEST_TIMEOUT_MS = parseInt(process.env.PROXY_TEST_TIMEOUT_MS || '8000', 10);

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
        const me = await withTimeout(
            tempBot.api.getMe(),
            PROXY_TEST_TIMEOUT_MS,
            'direct connection'
        );

        console.log(`✅ اتصال مستقیم موفقیت‌آمیز بود! نام ربات: @${me.username}`);
        return tempBot;
    } catch (directError) {
        console.warn('⚠️ اتصال مستقیم ناموفق بود.');
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
            const me = await withTimeout(
                tempBot.api.getMe(),
                PROXY_TEST_TIMEOUT_MS,
                `proxy ${proxyUrl}`
            );

            console.log(`✅ اتصال موفق با پروکسی ${proxyUrl}! نام ربات: @${me.username}`);
            return tempBot;
        } catch (proxyError) {
            console.warn(`❌ پروکسی ${proxyUrl} پاسخگو نبود.`);
        }
    }

    // بازگرداندن تنظیمات شبکه در صورت شکست کامل
    setGlobalDispatcher(defaultDispatcher);
    console.error('❌ تمامی مسیرهای اتصال (مستقیم و لیست پروکسی‌ها) با خطا مواجه شدند.');
    return null;
}

/**
 * اجرای یک پرامیس با سقف زمانی؛ اگر ظرف مدت مشخص resolve/reject نشود،
 * خودش reject می‌کند تا هیچ عملیاتی بی‌صدا و بی‌نهایت معلق نماند.
 */
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
        ),
    ]);
}

// ==========================================
// ۳. خروجی ماژول
// ==========================================
module.exports = { initBotWithFallback };