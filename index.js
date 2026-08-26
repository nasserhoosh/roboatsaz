// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول‌های اتصال/منو/دیتابیس
// ==========================================
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');
const { getMenuListForUser, getMenuIndexById } = require('./menuRepository');
const { getChildrenType, getDisplayText } = require('./menuLoader');
const {
    buildKeyboard,
    buildMenuListKeyboard,
    buildSoftMenuKeyboard,
    buildSoftMenuText,
} = require('./menuRenderer');
const userState = require('./userState');

const NO_ACCESS_MESSAGE = 'متاسفانه شما به این ربات دسترسی ندارید.';
const INVALID_SOFT_MENU_INPUT_MESSAGE = '⚠️ عدد واردشده معتبر نیست. لطفاً یکی از شماره‌های لیست را ارسال کنید.';

// ==========================================
// ۲. توابع کمکی نمایش
// ==========================================

/**
 * نمایش لیست انتخاب منو (سطح بالاتر از همه‌ی منوهای این کاربر).
 * این سطح همیشه دکمه‌ای است (نه سافت)، چون مفهوم children_type فقط داخل یک منوی JSON معنا دارد.
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

/**
 * نمایش یک سطح از منوی داخلی (بعد از انتخاب یک منو از لیست یا هر جابه‌جایی سطح).
 * بسته به children_type همان سطح، یا کیبورد دکمه‌ای می‌سازد یا لیست عددی (سافت‌منو).
 */
async function showMenuLevel(ctx, menuIndex, parentId, promptText) {
    const nodes = getNodesForParent(menuIndex, parentId);
    const type = getChildrenType(menuIndex, parentId);

    if (type === 'soft') {
        const text = buildSoftMenuText(promptText, nodes);
        const keyboard = buildSoftMenuKeyboard(menuIndex.backButtonText);
        await ctx.reply(text, { reply_markup: keyboard });
    } else {
        const keyboard = buildKeyboard(nodes, true, menuIndex.backButtonText);
        await ctx.reply(promptText, { reply_markup: keyboard });
    }
}

/**
 * پیدا کردن نودِ انتخاب‌شده توسط کاربر در سطح فعلی، با توجه به نوع سطح (دکمه‌ای یا سافت).
 * @returns {{node: object|null, invalidSoftInput: boolean}}
 *   invalidSoftInput یعنی سطح سافت بوده ولی ورودی کاربر عدد معتبر در بازه نبوده.
 */
function resolveSelectedNode(menuIndex, currentParentId, text) {
    const type = getChildrenType(menuIndex, currentParentId);
    const nodes = getNodesForParent(menuIndex, currentParentId);

    if (type === 'soft') {
        const trimmed = text.trim();
        const num = Number(trimmed);
        const isValidIndex = Number.isInteger(num) && num >= 1 && num <= nodes.length;
        if (!isValidIndex) {
            return { node: null, invalidSoftInput: true };
        }
        return { node: nodes[num - 1], invalidSoftInput: false };
    }

    const parentKey = currentParentId === null ? 'root' : currentParentId;
    const textMap = menuIndex.textIndexByParent.get(parentKey);
    const node = textMap ? textMap.get(text) : undefined;
    return { node: node || null, invalidSoftInput: false };
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

        // -------- حالت ۱: کاربر در «لیست انتخاب منو» است (همیشه دکمه‌ای) --------
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

        // دکمه بازگشت (در هر دو نوع سطح - دکمه‌ای یا سافت - همین یک متن است)
        if (text === menuIndex.backButtonText) {
            const stillInsideMenu = userState.popLevel(chatId);
            if (!stillInsideMenu) {
                await showMenuList(ctx, chatId, fromId);
                return;
            }
            const parentId = userState.getCurrentParentId(chatId);
            const promptText = parentId === null
                ? menuIndex.startMessage
                : getDisplayText(menuIndex.nodesById.get(parentId));
            await showMenuLevel(ctx, menuIndex, parentId, promptText);
            return;
        }

        // انتخاب آیتم داخل سطح فعلی (دکمه‌ای یا عددی، بسته به children_type)
        const currentParentId = userState.getCurrentParentId(chatId);
        const { node, invalidSoftInput } = resolveSelectedNode(menuIndex, currentParentId, text);

        if (invalidSoftInput) {
            await ctx.reply(INVALID_SOFT_MENU_INPUT_MESSAGE);
            const parentId = currentParentId;
            const promptText = parentId === null
                ? menuIndex.startMessage
                : getDisplayText(menuIndex.nodesById.get(parentId));
            await showMenuLevel(ctx, menuIndex, parentId, promptText);
            return;
        }

        if (!node) {
            // متنی که با هیچ دکمه‌ای در سطح فعلی (دکمه‌ای) مطابقت ندارد؛ نادیده گرفته می‌شود
            return;
        }

        const hasMessage = typeof node.message === 'string' && node.message.length > 0;
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;

        if (hasMessage) {
            await ctx.reply(node.message);
        }

        if (hasChildren) {
            userState.pushLevel(chatId, node.id);
            await showMenuLevel(ctx, menuIndex, node.id, getDisplayText(node));
        }
        // اگر نه message دارد و نه children: آیتم بی‌اثر (هشدار در menuLoader هنگام بارگذاری چاپ شده)
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
