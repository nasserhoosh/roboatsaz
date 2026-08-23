// /home/nasser/apps/robotmaker/menuEngine.js

// ==========================================
// ۱. تنظیمات اولیه و ورود کتابخانه‌ها
// ==========================================
const fs = require('fs');
const path = require('path');
const { ReplyKeyboardBuilder } = require('node-telegram-bot-api');

// بارگذاری فایل کانفیگ JSON
const configPath = path.join(__dirname, 'menu.json');
const menuConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ساخت نقشه نگاشت متن دکمه‌ها به اکشن‌ها (Action Map)
const buttonActionMap = new Map();

// ==========================================
// ۲. تابع تولید ساختار ReplyKeyboard
// ==========================================
function buildKeyboard(menuKey) {
    const menu = menuConfig.menus[menuKey];
    if (!menu) return null;

    const builder = new ReplyKeyboardBuilder();

    // اضافه کردن دکمه‌های تعریف شده در کانفیگ
    menu.buttons.forEach((row) => {
        const rowTexts = row.map((btn) => {
            // ثبت اطلاعات دکمه برای شنود پیام
            buttonActionMap.set(btn.text, {
                ...btn,
                currentMenuKey: menuKey
            });
            return btn.text;
        });
        builder.row(...rowTexts.map(t => ({ text: t })));
    });

    // افزودن خودکار دکمه «بازگشت» برای منوهای فرزند
    if (menu.parent) {
        const backText = '🔙 بازگشت';
        buttonActionMap.set(backText, {
            action: 'navigate',
            target: menu.parent,
            isBack: true
        });
        builder.row({ text: backText });
    }

    return builder.build({ resize_keyboard: true });
}

// ==========================================
// ۳. خروجی ماژول
// ==========================================
module.exports = {
    menuConfig,
    buttonActionMap,
    buildKeyboard
};