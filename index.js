// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول اتصال
// ==========================================
const { ReplyKeyboardBuilder } = require('node-telegram-bot-api');
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');

// ==========================================
// ۲. راه‌اندازی و تعاریف منطق ربات
// ==========================================
(async () => {
    // دریافت نمونه رباتِ متصل‌شده از ماژول شبکه
    const bot = await initBotWithFallback();

    if (!bot) {
        console.log('برنامه به دلیل عدم امکان اتصال متوقف شد.');
        process.exit(1);
    }

    // ==========================================
    // ۳. تعریف دستورات و هندلرها
    // ==========================================
    bot.command('start', async (ctx) => {
        const keyboard = new ReplyKeyboardBuilder()
            .text('نمایش پیام')
            .build({ resize_keyboard: true });

        await ctx.reply('خوش آمدید! برای دریافت پیام روی دکمه زیر کلیک کنید:', {
            reply_markup: keyboard
        });
    });

    bot.hears('نمایش پیام', async (ctx) => {
        await ctx.reply('Hello World!');
    });

    // مدیریت خطاهای زمان اجرا
    bot.catch((err) => {
        console.error('Bot Runtime Error:', err.message);
    });

    console.log('ربات آماده به کار است. در حال دریافت پیام‌ها (Polling)...');
    run(bot);
})();