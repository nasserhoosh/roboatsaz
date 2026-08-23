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

// ساخت دکمه‌های ReplyKeyboard برای node-telegram-bot-api
function buildKeyboard(menuNode, isRoot = false) {
    const keyboardRows = [];

    // ساخت سطرهای منو طبق layout در فایل JSON
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
    // دریافت نمونه bot متصل‌شده از ماژول شبکه
    const bot = await initBotWithFallback();

    if (!bot) {
        console.log('برنامه به دلیل عدم امکان اتصال متوقف شد.');
        process.exit(1);
    }

    // ------------------------------------------
    // هندلر دستور /start
    // ------------------------------------------
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // ریست کردن مسیر کاربر به منوی اصلی
        userState.set(userId, []);

        const options = buildKeyboard(config.menu, true);

        // ارسال تصویر خوش‌آمدگویی به همراه کپشن و کیبورد
        if (config.start && config.start.file_id) {
            options.caption = config.start.caption || '';
            await bot.sendPhoto(chatId, config.start.file_id, options);
        } else {
            await bot.sendMessage(chatId, config.start.caption || 'خوش آمدید!', options);
        }
    });

    // ------------------------------------------
    // هندلر دریافت پیام‌های متنی (مدیریت منوها)
    // ------------------------------------------
    bot.on('message', async (msg) => {
        // اگر پیام متنی نباشد یا دستور باشد، پردازش نشود
        if (!msg.text || msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

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

            await bot.sendMessage(chatId, 'بازگشت به منوی قبلی:', options);
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

                await bot.sendMessage(chatId, `منوی ${text}:`, options);
            } else if (selectedItem.type === 'message') {
                // ارسال پاسخ نهایی متناظر با دکمه
                await bot.sendMessage(chatId, selectedItem.response);
            }
        }
    });

    // مدیریت خطاهای زمان اجرا
    bot.on('polling_error', (error) => {
        console.error('Bot Polling Error:', error.message);
    });

    console.log('ربات با موفقیت اجرا شد و آماده دریافت پیام است.');
})();