// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و فایل تنظیمات
// ==========================================
const fs = require('fs');
const path = require('path');
const { Keyboard } = require('grammy');
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

// ساخت دکمه‌های ReplyKeyboard بر اساس لایه‌بندی در JSON
function buildKeyboard(menuNode, isRoot = false) {
    const keyboard = new Keyboard();

    if (menuNode && menuNode.layout) {
        menuNode.layout.forEach(row => {
            row.forEach(btnText => {
                keyboard.text(btnText);
            });
            keyboard.row();
        });
    }

    // اگر منوی ریشه نبود، دکمه بازگشت اضافه شود
    if (!isRoot) {
        keyboard.text(config.back_button_text).row();
    }

    return keyboard.resized();
}

// ==========================================
// ۳. راه‌اندازی و تعاریف منطق ربات
// ==========================================
(async () => {
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

        const keyboard = buildKeyboard(config.menu, true);

        // ارسال تصویر با استفاده از متد api.sendPhoto در grammY
        if (config.start && config.start.file_id) {
            await ctx.api.sendPhoto(ctx.chat.id, config.start.file_id, {
                caption: config.start.caption || '',
                reply_markup: keyboard
            });
        } else {
            await ctx.reply(config.start.caption || 'خوش آمدید!', {
                reply_markup: keyboard
            });
        }
    });

    // ------------------------------------------
    // هندلر دریافت تمام پیام‌های متنی (مدیریت منوها)
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
                userPath.pop(); // برگشت به سطح قبل
                userState.set(userId, userPath);
            }
            
            const parentMenu = getCurrentMenuNode(userPath);
            const isRoot = userPath.length === 0;
            const keyboard = buildKeyboard(parentMenu, isRoot);

            await ctx.reply('بازگشت به منوی قبلی:', { reply_markup: keyboard });
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
                const keyboard = buildKeyboard(selectedItem, isRoot);

                await ctx.reply(`منوی ${text}:`, { reply_markup: keyboard });
            } else if (selectedItem.type === 'message') {
                // ارسال پاسخ نهایی پیام به کاربر (حفظ کیبورد فعلی)
                await ctx.reply(selectedItem.response);
            }
        }
    });

    // مدیریت خطاهای زمان اجرا
    bot.catch((err) => {
        console.error('Bot Runtime Error:', err.message);
    });

    console.log('ربات با منوی پویا آماده به کار است. در حال دریافت پیام‌ها (Polling)...');
    
    // شروع دریافت پیام‌ها به روش استاندارد
    bot.start();
})();