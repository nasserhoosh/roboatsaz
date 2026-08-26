// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول‌های اتصال/منو
// ==========================================
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');
const { loadMenuConfig } = require('./menuLoader');
const { buildKeyboard } = require('./menuRenderer');
const userState = require('./userState');

// ==========================================
// ۲. بارگذاری منو از فایل JSON (یک‌بار در استارتاپ)
// ==========================================
const menuConfig = loadMenuConfig();

/**
 * برگرداندن لیست نودهای یک سطح خاص از منو، بر اساس parentId.
 * parentId === null یعنی سطح ریشه.
 */
function getNodesForParent(parentId) {
    if (parentId === null) {
        return menuConfig.rootMenu;
    }
    const parentNode = menuConfig.nodesById.get(parentId);
    return (parentNode && Array.isArray(parentNode.children)) ? parentNode.children : [];
}

/**
 * نمایش یک سطح از منو برای کاربر (ارسال کیبورد متناسب با آن سطح).
 */
async function showMenuLevel(ctx, chatId, parentId, promptText) {
    const nodes = getNodesForParent(parentId);
    const showBack = parentId !== null; // در ریشه دکمه بازگشت نداریم
    const keyboard = buildKeyboard(nodes, showBack, menuConfig.backButtonText);

    await ctx.reply(promptText, { reply_markup: keyboard });
}

// ==========================================
// ۳. راه‌اندازی ربات
// ==========================================
(async () => {
    const bot = await initBotWithFallback();

    if (!bot) {
        console.log('برنامه به دلیل عدم امکان اتصال متوقف شد.');
        process.exit(1);
    }

    // ------------------------------------------
    // /start : بازنشانی وضعیت کاربر و نمایش منوی ریشه
    // ------------------------------------------
    bot.command('start', async (ctx) => {
        const chatId = ctx.chat.id;
        userState.resetStack(chatId);
        await showMenuLevel(ctx, chatId, null, menuConfig.startMessage);
    });

    // ------------------------------------------
    // دکمه بازگشت
    // ------------------------------------------
    bot.hears(menuConfig.backButtonText, async (ctx) => {
        const chatId = ctx.chat.id;
        userState.popLevel(chatId);
        const parentId = userState.getCurrentParentId(chatId);
        const promptText = parentId === null
            ? menuConfig.startMessage
            : menuConfig.nodesById.get(parentId).text;

        await showMenuLevel(ctx, chatId, parentId, promptText);
    });

    // ------------------------------------------
    // هندلر عمومی متن: تشخیص دکمه فشرده‌شده بر اساس سطح فعلی کاربر
    // ------------------------------------------
    bot.on('message', async (ctx) => {
        const text = ctx.message && ctx.message.text;
        if (!text) return; // پیام غیرمتنی نادیده گرفته می‌شود

        const chatId = ctx.chat.id;
        const currentParentId = userState.getCurrentParentId(chatId);
        const parentKey = currentParentId === null ? 'root' : currentParentId;
        const textMap = menuConfig.textIndexByParent.get(parentKey);

        const node = textMap ? textMap.get(text) : undefined;
        if (!node) {
            // متنی که با هیچ دکمه‌ای در سطح فعلی مطابقت ندارد
            return;
        }

        const hasMessage = typeof node.message === 'string' && node.message.length > 0;
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;

        if (hasMessage) {
            await ctx.reply(node.message);
        }

        if (hasChildren) {
            userState.pushLevel(chatId, node.id);
            await showMenuLevel(ctx, chatId, node.id, node.text);
        } else if (!hasMessage) {
            // نه پیام دارد و نه زیرمنو -> دکمه بی‌اثر (در menuLoader هنگام بارگذاری هشدار داده شده)
        }
    });

    // ------------------------------------------
    // مدیریت خطاهای زمان اجرا
    // ------------------------------------------
    bot.catch((err) => {
        console.error('Bot Runtime Error:', err.message);
    });

    console.log('ربات آماده به کار است. در حال دریافت پیام‌ها (Polling)...');
    run(bot);
})();
