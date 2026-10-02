// /home/nasser/apps/robotmaker/onboardingConfig.js
//
// ثابت‌های مربوط به فلوی «ایجاد ربات» (درخواست شماره تلفن، نام، تأیید، لینک درگاه).

const CREATE_BOT_BUTTON_TEXT = '🤖 ایجاد ربات';
const REQUEST_CONTACT_BUTTON_TEXT = '📱 اشتراک‌گذاری شماره تلفن';
const CONFIRM_BUTTON_TEXT = '✅ تأیید';

// file_id عکس دستورالعمل اشتراک‌گذاری شماره تلفن (از تلگرام گرفته شده).
const PHONE_SHARE_INSTRUCTION_PHOTO_FILE_ID =
    'https://sorat.top/photos/onboarding.jpg';

const PHONE_SHARE_INSTRUCTION_CAPTION =
    'برای ادامه، لطفاً شماره تلفن خود را با استفاده از دکمه‌ی زیر به اشتراک بگذارید.';

const ASK_FULL_NAME_MESSAGE = 'ممنون! حالا لطفاً نام و نام خانوادگی کامل خود را ارسال کنید.';

function buildConfirmationMessage(phoneNumber, fullName) {
    return `لطفاً اطلاعات زیر را بررسی و تأیید کنید:\n\n📱 شماره تلفن: ${phoneNumber}\n👤 نام کامل: ${fullName}\n\nدر صورت تأیید، روی دکمه‌ی «${CONFIRM_BUTTON_TEXT}» بزنید.`;
}

/**
 * ساخت لینک درگاه برای یک پروفایل (بر اساس GATEWAY_BASE_URL در .env و توکن/هش پروفایل).
 */
function buildGatewayLink(profileId) {
    const baseUrl = process.env.GATEWAY_BASE_URL || 'https://gateway.example.com/create';
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${profileId}`;
}

function buildGatewayLinkMessage(profileId) {
    const link = buildGatewayLink(profileId);
    return `پروفایل شما با موفقیت ثبت شد. 🎉\n\nبرای ساخت منوی ربات خود، از لینک زیر استفاده کنید:\n${link}`;
}

module.exports = {
    CREATE_BOT_BUTTON_TEXT,
    REQUEST_CONTACT_BUTTON_TEXT,
    CONFIRM_BUTTON_TEXT,
    PHONE_SHARE_INSTRUCTION_PHOTO_FILE_ID,
    PHONE_SHARE_INSTRUCTION_CAPTION,
    ASK_FULL_NAME_MESSAGE,
    buildConfirmationMessage,
    buildGatewayLink,
    buildGatewayLinkMessage,
};
