// /home/nasser/apps/robotmaker/paymentPolicy.js
//
// خواندن payment_policy.json و توابع کمکی محاسباتی (تبدیل سکه/ریال، هدیه‌ی مناسبتی).

const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, 'payment_policy.json');

let cachedPolicy = null;

/** خواندن policy از فایل (کش می‌شود؛ فایل استاتیک است - برای اعمال فوری تغییرات، پروسه را ری‌استارت کنید). */
function loadPaymentPolicy() {
    if (cachedPolicy) return cachedPolicy;
    const raw = fs.readFileSync(POLICY_PATH, 'utf-8');
    cachedPolicy = JSON.parse(raw);
    return cachedPolicy;
}

/** آیا هدیه‌ی مناسبتی الان فعال است (تاریخ فعلی داخل بازه)؟ */
function isSeasonalGiftActiveNow(policy = loadPaymentPolicy()) {
    const g = policy.seasonal_gift;
    if (!g || !g.enabled) return false;
    const now = new Date();
    if (g.starts_at && now < new Date(g.starts_at)) return false;
    if (g.ends_at && now > new Date(g.ends_at)) return false;
    return true;
}

/**
 * موجودی مؤثر کاربر = موجودی واقعی wallets + هدیه‌ی مناسبتی (اگر الان فعال باشد).
 * هدیه‌ی مناسبتی در wallets ذخیره نمی‌شود؛ فقط در محاسبه‌ی لحظه‌ای لحاظ می‌شود
 * تا با پایان بازه، خودکار (بدون نیاز به job پاک‌سازی) از موجودی مؤثر خارج شود.
 */
function getEffectiveBalance(walletBalance, policy = loadPaymentPolicy()) {
    const seasonalBonus = isSeasonalGiftActiveNow(policy) ? policy.seasonal_gift.coins : 0;
    return walletBalance + seasonalBonus;
}

/** تبدیل تعداد سکه به مبلغ ریالی. */
function coinsToRial(coins, policy = loadPaymentPolicy()) {
    return coins * policy.coin_to_rial_rate;
}

module.exports = {
    loadPaymentPolicy,
    isSeasonalGiftActiveNow,
    getEffectiveBalance,
    coinsToRial,
};
