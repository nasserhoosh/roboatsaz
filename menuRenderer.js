// /home/nasser/apps/robotmaker/menuRenderer.js
//
// ساخت ReplyKeyboard از روی لیستی از نودهای منو.
// از getDisplayText استفاده می‌شود تا آیکون (در صورت وجود) هم روی دکمه‌ها
// و هم در خطوط سافت‌منو نمایش داده شود.

const { ReplyKeyboardBuilder } = require('node-telegram-bot-api');
const { getDisplayText } = require('./menuLoader');

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
            builder.text(getDisplayText(node));
        }
        builder.row();
    }

    if (showBackButton) {
        builder.text(backButtonText).row();
    }

    return builder.build({ resize_keyboard: true });
}

/**
 * ساخت کیبورد سافت‌منو: فقط یک دکمه‌ی بازگشت (کاربر باید عدد را تایپ کند).
 */
function buildSoftMenuKeyboard(backButtonText) {
    const builder = new ReplyKeyboardBuilder();
    builder.text(backButtonText).row();
    return builder.build({ resize_keyboard: true });
}

/**
 * کیبورد درخواست شماره تلفن (برای فلوی «ایجاد ربات»):
 * یک دکمه‌ی request_contact + یک دکمه‌ی بازگشت، هرکدام در ردیف خودشان.
 */
function buildRequestContactKeyboard(requestContactLabel, backButtonText) {
    const builder = new ReplyKeyboardBuilder();
    builder.requestContact(requestContactLabel).row();
    builder.text(backButtonText).row();
    return builder.build({ resize_keyboard: true });
}

/**
 * کیبورد ساده‌ی تک‌دکمه‌ای بازگشت (برای مراحلی از onboarding که کیبورد دیگری لازم نیست،
 * مثل انتظار برای تایپ نام کامل).
 */
function buildBackOnlyKeyboard(backButtonText) {
    const builder = new ReplyKeyboardBuilder();
    builder.text(backButtonText).row();
    return builder.build({ resize_keyboard: true });
}

/**
 * کیبورد تأیید نهایی onboarding: دکمه‌ی تأیید + دکمه‌ی بازگشت (برای لغو/ویرایش از نو).
 */
function buildConfirmationKeyboard(confirmLabel, backButtonText) {
    const builder = new ReplyKeyboardBuilder();
    builder.text(confirmLabel).row();
    builder.text(backButtonText).row();
    return builder.build({ resize_keyboard: true });
}

/**
 * ساخت reply_markup برای لیست انتخاب منو (سطح بالاتر از همه‌ی منوهای یک کاربر).
 * ورودی رکوردهای جدول bot_menus است (هر رکورد یک دکمه با متن menuName)
 * به‌علاوه‌ی دکمه‌ی «ایجاد ربات» که همیشه در ردیف مستقل خودش در انتها اضافه می‌شود.
 * دکمه بازگشتی در این سطح معنا ندارد چون بالاترین سطح است.
 * (سطح لیست منو icon ندارد چون از خودِ جدول bot_menus می‌آید نه از menu_json.)
 */
function buildMenuListKeyboard(menuRows, createBotButtonText) {
    const pseudoNodes = menuRows.map((row) => ({ text: row.menuName }));
    const builder = new ReplyKeyboardBuilder();

    for (let i = 0; i < pseudoNodes.length; i += BUTTONS_PER_ROW) {
        const rowNodes = pseudoNodes.slice(i, i + BUTTONS_PER_ROW);
        for (const node of rowNodes) {
            builder.text(node.text);
        }
        builder.row();
    }

    builder.text(createBotButtonText).row(); // همیشه در ردیف مستقل خودش

    return builder.build({ resize_keyboard: true });
}

/**
 * ساخت متن لیست شماره‌گذاری‌شده‌ی سافت‌منو از روی نودها (با آیکون در صورت وجود).
 * خروجی چیزی شبیه:
 *   عنوان
 *
 *   1. 🍆 محصول A
 *   2. محصول B
 *
 *   عدد مورد نظر را ارسال کنید.
 */
function buildSoftMenuText(promptText, nodes) {
    const lines = nodes.map((node, index) => `${index + 1}. ${getDisplayText(node)}`);
    return `${promptText}\n\n${lines.join('\n')}\n\nلطفاً عدد مورد نظر را ارسال کنید.`;
}

module.exports = {
    buildKeyboard,
    buildMenuListKeyboard,
    buildSoftMenuKeyboard,
    buildSoftMenuText,
    buildRequestContactKeyboard,
    buildBackOnlyKeyboard,
    buildConfirmationKeyboard,
};
