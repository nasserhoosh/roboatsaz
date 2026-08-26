// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول‌های اتصال/منو/دیتابیس
// ==========================================
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');
const { getMenuListForUser, getMenuIndexById } = require('./menuRepository');
const { buildKeyboard, buildMenuListKeyboard } = require('./menuRenderer');
const userState = require('./userState');

const NO_ACCESS_MESSAGE = 'متاسفانه شما به این ربات دسترسی ندارید.';

// ==========================================
// ۲. توابع کمکی نمایش
// ==========================================

/**
 * نمایش لیست انتخاب منو (سطح بالاتر از همه‌ی منوهای این کاربر).
 * اگر کاربر هیچ منویی نداشته باشد، پیام عدم دسترسی نمایش داده می‌شود.
 * @returns {boolean} true اگر لیست نمایش داده شد، false اگر کاربر دسترسی نداشت
 */
async function showMenuList(ctx, chatId, fromId) {
    const menuRows = await getMenuListForUser(fromId);

    if (menuRows.length === 0) {
        await ctx.reply(NO_ACCESS_MESSAGE);
        return false;
    }

    userState.resetToMenuList(chatId);
    const keyboard = buildMenuListKeyboard(menuRows);
    await ctx.reply('لطفاً یکی از منوهای زیر را انتخاب کنید:', { reply_markup: keyboard });
    return true;
}

/** برگرداندن لیست نودهای یک سطح خاص از یک menuIndex مشخص */
function getNodesForParent(menuIndex, parentId) {
    if (parentId === null) {
        return menuIndex.rootMenu;
    }
    const parentNode = menuIndex.nodesById.get(parentId);
    return (parentNode && Array.isArray(parentNode.children)) ? parentNode.children : [];
}

/** نمایش یک سطح از منوی داخلی (بعد از انتخاب یک منو از لیست) */
async function showMenuLevel(ctx, menuIndex, parentId, promptText) {
    const nodes = getNodesForParent(menuIndex, parentId);
    const showBack = true; // همیشه در داخل یک منوی انتخاب‌شده دکمه بازگشت داریم
    const keyboard = buildKeyboard(nodes, showBack, menuIndex.backButtonText);
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
    // /start : همیشه لیست منوهای کاربر نمایش داده می‌شود
    // ------------------------------------------
    bot.command('start', async (ctx) => {
        const chatId = ctx.chat.id;
        const fromId = ctx.from.id;
        await showMenuList(ctx, chatId, fromId);
    });

    // ------------------------------------------
    // هندلر عمومی متن
    // ------------------------------------------
    bot.on('message', async (ctx) => {
        const text = ctx.message && ctx.message.text;
        if (!text) return; // پیام غیرمتنی نادیده گرفته می‌شود

        const chatId = ctx.chat.id;
        const fromId = ctx.from.id;
        const state = userState.getState(chatId);

        // -------- حالت ۱: کاربر در «لیست انتخاب منو» است --------
        if (state.selectedMenuRowId === null) {
            const menuRows = await getMenuListForUser(fromId);

            if (menuRows.length === 0) {
                await ctx.reply(NO_ACCESS_MESSAGE);
                return;
            }

            const chosenRow = menuRows.find((row) => row.menuName === text);
            if (!chosenRow) {
                // متنی که با هیچ نام منویی مطابقت ندارد؛ نادیده گرفته می‌شود
                return;
            }

            const menuIndex = await getMenuIndexById(chosenRow.id, fromId);
            if (!menuIndex) {
                await ctx.reply(NO_ACCESS_MESSAGE);
                return;
            }

            userState.selectMenu(chatId, chosenRow.id);
            await showMenuLevel(ctx, menuIndex, null, menuIndex.startMessage);
            return;
        }

        // -------- حالت ۲: کاربر داخل یک منوی مشخص است --------
        const menuIndex = await getMenuIndexById(state.selectedMenuRowId, fromId);
        if (!menuIndex) {
            // منو دیگر در دسترس نیست (مثلاً حذف شده) -> بازگشت به لیست
            await showMenuList(ctx, chatId, fromId);
            return;
        }

        // دکمه بازگشت
        if (text === menuIndex.backButtonText) {
            const stillInsideMenu = userState.popLevel(chatId);
            if (!stillInsideMenu) {
                await showMenuList(ctx, chatId, fromId);
                return;
            }
            const parentId = userState.getCurrentParentId(chatId);
            const promptText = parentId === null
                ? menuIndex.startMessage
                : menuIndex.nodesById.get(parentId).text;
            await showMenuLevel(ctx, menuIndex, parentId, promptText);
            return;
        }

        // دکمه‌ی معمولی داخل منو
        const currentParentId = userState.getCurrentParentId(chatId);
        const parentKey = currentParentId === null ? 'root' : currentParentId;
        const textMap = menuIndex.textIndexByParent.get(parentKey);
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
            await showMenuLevel(ctx, menuIndex, node.id, node.text);
        }
        // اگر نه message دارد و نه children: دکمه بی‌اثر (هشدار در menuLoader هنگام بارگذاری چاپ شده)
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
