// /home/nasser/apps/robotmaker/menuRenderer.js
//
// ساخت ReplyKeyboard از روی لیستی از نودهای منو.

const { ReplyKeyboardBuilder } = require('node-telegram-bot-api');

const BUTTONS_PER_ROW = 2;

/**
 * ساخت reply_markup برای یک سطح از منو.
 * @param {Array} nodes - لیست نودهای این سطح
 * @param {boolean} showBackButton - آیا دکمه بازگشت اضافه شود
 * @param {string} backButtonText
 */
function buildKeyboard(nodes, showBackButton, backButtonText) {
    const builder = new ReplyKeyboardBuilder();

    for (let i = 0; i < nodes.length; i += BUTTONS_PER_ROW) {
        const rowNodes = nodes.slice(i, i + BUTTONS_PER_ROW);
        for (const node of rowNodes) {
            builder.text(node.text);
        }
        builder.row();
    }

    if (showBackButton) {
        builder.text(backButtonText).row();
    }

    return builder.build({ resize_keyboard: true });
}

/**
 * ساخت reply_markup برای لیست انتخاب منو (سطح بالاتر از همه‌ی منوهای یک کاربر).
 * ورودی رکوردهای جدول bot_menus است (هر رکورد یک دکمه با متن menuName).
 * دکمه بازگشتی در این سطح معنا ندارد چون بالاترین سطح است.
 */
function buildMenuListKeyboard(menuRows) {
    const pseudoNodes = menuRows.map((row) => ({ text: row.menuName }));
    return buildKeyboard(pseudoNodes, false, null);
}

module.exports = { buildKeyboard, buildMenuListKeyboard };
