// /home/nasser/apps/robotmaker/walletRepository.js
//
// دسترسی به جدول‌های wallets و payments.
//
// payments هم شارژهای کیف‌پول (type='topup') و هم کسر بابت ثبت اولین توکن ربات
// (type='bot_token_charge') را نگه می‌دارد؛ coinsDelta برای شارژ مثبت و برای
// کسر توکن منفی است - این یک منبع واحد برای کل تاریخچه‌ی تراکنش‌های کاربر می‌سازد.
//
// هر پرداخت (از هر نوع) یک trackingCode یکتای ۸ کاراکتری الفبایی-عددی دارد که
// در همه‌ی حالت‌ها (موفق/لغوشده/منقضی‌شده) به کاربر نمایش داده می‌شود.
//
// نکته‌ی مهم: PENDING_EXPIRY_MS تنها منبع مدت انقضای pending در کل پروژه است؛
// هر جای دیگری (مثلاً routes/api.js) که به این مقدار نیاز دارد باید همین
// export را import کند، نه اینکه عدد را جداگانه هاردکد کند - وگرنه تغییر این
// مقدار در یک فایل و نه فایل دیگر باعث ناهماهنگی (دقیقاً همان باگی که رخ داد) می‌شود.

const { prisma } = require('./db');

const PENDING_EXPIRY_MS = 5 * 60 * 1000; // ۵ دقیقه - تنها محل تعریف این مقدار در کل پروژه

const TRACKING_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف/ارقام مشابه‌الشکل (O/0, I/1)
const TRACKING_CODE_LENGTH = 8;

/** گرفتن یا ساختن کیف‌پول کاربر (اگر وجود نداشت، با موجودی صفر ساخته می‌شود). */
async function getOrCreateWallet(fromId) {
    return prisma.wallet.upsert({
        where: { fromId: BigInt(fromId) },
        update: {},
        create: { fromId: BigInt(fromId), balanceCoins: 0 },
    });
}

/** افزودن سکه به کیف‌پول (مثلاً بعد از تأیید پرداخت یا هدیه‌ی خوش‌آمد). مقدار منفی مجاز نیست. */
async function creditWallet(fromId, coins) {
    if (coins <= 0) throw new Error('creditWallet: مقدار باید مثبت باشد.');
    return prisma.wallet.upsert({
        where: { fromId: BigInt(fromId) },
        update: { balanceCoins: { increment: coins }, updatedAt: new Date() },
        create: { fromId: BigInt(fromId), balanceCoins: coins },
    });
}

/**
 * کسر سکه از کیف‌پول به‌صورت اتمیک (فقط اگر موجودی کافی باشد).
 * از یک UPDATE شرطی استفاده می‌کند تا race condition بین دو درخواست هم‌زمان رخ ندهد.
 * @returns {boolean} true اگر کسر موفق بود، false اگر موجودی کافی نبود.
 */
async function debitWalletIfSufficient(fromId, coins) {
    if (coins <= 0) throw new Error('debitWalletIfSufficient: مقدار باید مثبت باشد.');

    const result = await prisma.$executeRaw`
        UPDATE wallets
        SET balance_coins = balance_coins - ${coins}, updated_at = now()
        WHERE from_id = ${BigInt(fromId)} AND balance_coins >= ${coins}
    `;

    return result > 0; // تعداد ردیف‌های تغییریافته - اگر ۰ بود یعنی موجودی کافی نبود یا کیف‌پول وجود نداشت
}

/** منقضی‌کردن pending هایی که بیش از PENDING_EXPIRY_MS از ساختشان گذشته (فقط برای همین کاربر - ارزان و کافی). */
async function expireStalePendingPayments(fromId) {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_MS);
    await prisma.payment.updateMany({
        where: { fromId: BigInt(fromId), status: 'pending', type: 'topup', createdAt: { lt: cutoff } },
        data: { status: 'expired' },
    });
}

/** آیا کاربر یک درخواست شارژ pending (غیرمنقضی) فعال دارد؟ */
async function getActivePendingTopup(fromId) {
    await expireStalePendingPayments(fromId);
    return prisma.payment.findFirst({
        where: { fromId: BigInt(fromId), status: 'pending', type: 'topup' },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * ساخت یک کد ۳ رقمی که در بین پرداخت‌های pending فعلی تکراری نباشد.
 * ابتدا چند تلاش تصادفی سریع (حالت معمول، بدون کوئری سنگین)؛ اگر همه شکست خورد
 * (یعنی فضای کد تقریباً پر است)، یک‌بار کل کدهای استفاده‌شده را می‌خواند و
 * قطعی‌ترین کد آزاد را پیدا می‌کند - تا در حالت اشباع هم false-negative ندهیم.
 */
async function generateUniqueVerifyCode() {
    const RANDOM_ATTEMPTS = 20;
    for (let i = 0; i < RANDOM_ATTEMPTS; i++) {
        const code = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const existing = await prisma.payment.findFirst({
            where: { verifyPayment: code, status: 'pending' },
        });
        if (!existing) return code;
    }

    // fallback قطعی: کل کدهای در حال استفاده را بگیر و اولین کد آزاد را پیدا کن
    const pending = await prisma.payment.findMany({
        where: { status: 'pending' },
        select: { verifyPayment: true },
    });
    const usedCodes = new Set(pending.map((p) => p.verifyPayment));
    for (let n = 0; n < 1000; n++) {
        const code = String(n).padStart(3, '0');
        if (!usedCodes.has(code)) return code;
    }

    throw new Error('امکان تولید کد یکتای پرداخت وجود ندارد (همه‌ی ۱۰۰۰ حالت در حال استفاده است).');
}

/** ساخت یک کد رهگیری ۸ کاراکتری الفبایی-عددی که در کل جدول payments یکتا باشد. */
async function generateUniqueTrackingCode() {
    const MAX_ATTEMPTS = 20;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let code = '';
        for (let j = 0; j < TRACKING_CODE_LENGTH; j++) {
            code += TRACKING_CODE_CHARS[Math.floor(Math.random() * TRACKING_CODE_CHARS.length)];
        }
        const existing = await prisma.payment.findUnique({ where: { trackingCode: code } });
        if (!existing) return code;
    }
    throw new Error('امکان تولید کد رهگیری یکتا وجود ندارد.');
}

/**
 * ساخت یک درخواست پرداخت (شارژ) جدید.
 * @returns {{success: boolean, payment?: object, reason?: string}}
 */
async function createPaymentRequest(fromId, coins, amountRial) {
    const activePending = await getActivePendingTopup(fromId);
    if (activePending) {
        return { success: false, reason: 'شما یک درخواست شارژ در انتظار پرداخت دارید. ابتدا آن را لغو کنید یا پرداخت را تکمیل کنید.' };
    }

    const verifyPayment = await generateUniqueVerifyCode();
    const trackingCode = await generateUniqueTrackingCode();
    const payment = await prisma.payment.create({
        data: {
            fromId: BigInt(fromId),
            amountRial: BigInt(amountRial),
            verifyPayment,
            coinsDelta: coins,
            status: 'pending',
            type: 'topup',
            trackingCode,
        },
    });
    return { success: true, payment };
}

/**
 * لغو دستی یک درخواست شارژ pending توسط خودِ کاربر.
 * @returns {{success: boolean, payment?: object}}
 */
async function cancelPendingTopup(fromId, paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.fromId !== BigInt(fromId) || payment.status !== 'pending' || payment.type !== 'topup') {
        return { success: false };
    }
    const updated = await prisma.payment.update({ where: { id: paymentId }, data: { status: 'expired' } });
    return { success: true, payment: updated };
}

/** ثبت یک تراکنش کسر اعتبار بابت اولین ثبت توکن ربات (برای درج در تاریخچه‌ی یکپارچه). */
async function recordBotTokenCharge(fromId, coins) {
    const trackingCode = await generateUniqueTrackingCode();
    return prisma.payment.create({
        data: {
            fromId: BigInt(fromId),
            amountRial: 0n,
            verifyPayment: '---',
            coinsDelta: -Math.abs(coins),
            status: 'confirmed',
            type: 'bot_token_charge',
            trackingCode,
            confirmedAt: new Date(),
        },
    });
}

/** لیست تاریخچه‌ی کامل تراکنش‌های یک کاربر (شارژ + کسر توکن)، جدیدترین اول. */
async function getPaymentHistory(fromId) {
    await expireStalePendingPayments(fromId);
    return prisma.payment.findMany({
        where: { fromId: BigInt(fromId) },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * تأیید یک پرداخت بر اساس مبلغ کامل واریزی (شامل ۳ رقم کد در انتها).
 * ۳ رقم آخر را جدا می‌کند، در بین pending ها جستجو می‌کند، مبلغ اصلی را هم چک می‌کند،
 * و در صورت تطابق: status -> confirmed + اعتبار سکه به کیف‌پول اضافه می‌شود.
 * @returns {{success: boolean, payment?: object, reason?: string}}
 */
async function confirmPaymentByAmount(totalAmountRial) {
    const amount = BigInt(totalAmountRial);
    if (amount < 1000n) {
        return { success: false, reason: 'مبلغ نامعتبر است (کمتر از ۱۰۰۰ ریال).' };
    }

    const verifyCode = String(amount % 1000n).padStart(3, '0');
    const baseAmount = amount - BigInt(verifyCode);

    const payment = await prisma.payment.findFirst({
        where: { verifyPayment: verifyCode, status: 'pending', amountRial: baseAmount, type: 'topup' },
    });

    if (!payment) {
        return { success: false, reason: 'هیچ پرداخت در انتظاری با این مشخصات یافت نشد.' };
    }

    const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await creditWallet(payment.fromId, payment.coinsDelta);

    return { success: true, payment: updated };
}

/** گرفتن یک پرداخت با شناسه، فقط اگر متعلق به همان کاربر باشد (برای نمایش نتیجه‌ی نهایی به فرانت). */
async function getPaymentForUser(fromId, paymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.fromId !== BigInt(fromId)) return null;
    return payment;
}

module.exports = {
    PENDING_EXPIRY_MS,
    getOrCreateWallet,
    creditWallet,
    debitWalletIfSufficient,
    getActivePendingTopup,
    createPaymentRequest,
    cancelPendingTopup,
    recordBotTokenCharge,
    getPaymentHistory,
    confirmPaymentByAmount,
    getPaymentForUser,
};
