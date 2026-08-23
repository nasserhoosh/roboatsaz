// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و فایل تنظیمات
// ==========================================
const fs = require('fs');
const path = require('path');
const { initBotWithFallback } = require('./connection');

// خواندن تنظیمات از فایل JSON
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// نگه‌داری وضعیت منوی فعلی هر کاربر (User State Management)
const userState = new Map();

// ==========================================
// ۲. توابع کمکی ساخت کیبورد و پیمایش منو
// ==========================================

// دریافت منوی فعلی کاربر بر اساس مسیر پیمایش شده
function getCurrentMenuNode(pathArray) {
    let current = config.menu;
    for (const key of pathArray) {
        if (current && current.items && current.items[key]) {
            current = current.items[key];
        } else {
            return null;
        }
    }
    return current;
}

// ساخت ساختار ReplyKeyboard بر اساس لایه‌بندی JSON
function buildKeyboard(menuNode, isRoot = false) {
    const keyboardRows = [];

    // اضافه کردن سطرهای منو طبق layout در فایل JSON
    if (menuNode && menuNode.layout) {
        menuNode.layout.forEach(row => {
            const rowButtons = row.map(btnText => ({ text: btnText }));
            keyboardRows.push(rowButtons);
        });
    }

    // اضافه کردن دکمه بازگشت در صورتی که منوی اصلی نباشد
    if (!isRoot) {
        keyboardRows.push([{ text: config.back_button_text }]);
    }

    return {
        reply_markup: {
            keyboard: keyboardRows,
            resize_keyboard: true
        }
    };
}

// ==========================================
// ۳. راه‌اندازی و تعاریف منطق ربات
// ==========================================
(async () => {
    // دریافت نمونه رباتِ متصل‌شده از ماژول شبکه
    const bot = await initBotWithFallback();

    if (!bot) {
        console.log('برنامه به دلیل عدم امکان اتصال متوقف شد.');
        process.exit(1);
    }

    // ------------------------------------------
    // هندلر دستور /start
    // ------------------------------------------
    bot.command('start', async (ctx) => {
        const userId = ctx.from.id;

        // ریست کردن مسیر کاربر به منوی اصلی
        userState.set(userId, []);

        const options = buildKeyboard(config.menu, true);

        // ارسال تصویر خوش‌آمدگویی به همراه کپشن و کیبورد
        if (config.start && config.start.file_id) {
            await ctx.replyWithPhoto(config.start.file_id, {
                caption: config.start.caption || '',
                reply_markup: options.reply_markup
            });
        } else {
            await ctx.reply(config.start.caption || 'خوش آمدید!', options);
        }
    });

    // ------------------------------------------
    // هندلر دریافت پیام‌های متنی (مدیریت منوها)
    // ------------------------------------------
    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id;

        // صرف‌نظر از اجرای متن‌هایی که دستور هستند (مثل /start)
        if (text.startsWith('/')) return;

        // دریافت مسیر فعلی کاربر در درخت منو
        let userPath = userState.get(userId) || [];
        let currentMenu = getCurrentMenuNode(userPath);

        if (!currentMenu) {
            userPath = [];
            currentMenu = config.menu;
            userState.set(userId, userPath);
        }

        // ۱. مدیریت کلیک روی دکمه «بازگشت»
        if (text === config.back_button_text) {
            if (userPath.length > 0) {
                userPath.pop(); // برگشت به یک سطح قبل
                userState.set(userId, userPath);
            }

            const parentMenu = getCurrentMenuNode(userPath);
            const isRoot = userPath.length === 0;
            const options = buildKeyboard(parentMenu, isRoot);

            await ctx.reply('بازگشت به منوی قبلی:', options);
            return;
        }

        // ۲. بررسی وجود دکمه کلیک‌شده در منوی فعلی
        if (currentMenu.items && currentMenu.items[text]) {
            const selectedItem = currentMenu.items[text];

            if (selectedItem.type === 'menu') {
                // هدایت کاربر به زیرمنوی جدید
                userPath.push(text);
                userState.set(userId, userPath);

                const isRoot = userPath.length === 0;
                const options = buildKeyboard(selectedItem, isRoot);

                await ctx.reply(`منوی ${text}:`, options);
            } else if (selectedItem.type === 'message') {
                // ارسال پاسخ نهایی متناظر با دکمه
                await ctx.reply(selectedItem.response);
            }
        }
    });

    // مدیریت خطاهای زمان اجرا
    bot.catch((err) => {
        console.error('Bot Runtime Error:', err.message);
    });

    console.log('ربات با موفقیت اجرا شد و آماده دریافت پیام است.');
})();