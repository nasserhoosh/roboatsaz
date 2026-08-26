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

module.exports = { buildKeyboard };
