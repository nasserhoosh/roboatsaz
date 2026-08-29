// /home/nasser/apps/robotmaker/walletRepository.js
//
// دسترسی به جدول‌های wallets و payments.

const { prisma } = require('./db');

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

/** ساخت یک درخواست پرداخت (شارژ) جدید. */
async function createPaymentRequest(fromId, coinsRequested, amountRial) {
    const verifyPayment = await generateUniqueVerifyCode();
    return prisma.payment.create({
        data: {
            fromId: BigInt(fromId),
            amountRial: BigInt(amountRial),
            verifyPayment,
            coinsRequested,
            status: 'pending',
        },
    });
}

/** لیست تاریخچه‌ی پرداخت‌های یک کاربر (جدیدترین اول). */
async function getPaymentHistory(fromId) {
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
        where: { verifyPayment: verifyCode, status: 'pending', amountRial: baseAmount },
    });

    if (!payment) {
        return { success: false, reason: 'هیچ پرداخت در انتظاری با این مشخصات یافت نشد.' };
    }

    await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await creditWallet(payment.fromId, payment.coinsRequested);

    return { success: true, payment };
}

module.exports = {
    getOrCreateWallet,
    creditWallet,
    debitWalletIfSufficient,
    createPaymentRequest,
    getPaymentHistory,
    confirmPaymentByAmount,
};
