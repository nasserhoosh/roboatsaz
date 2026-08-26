// /home/nasser/apps/robotmaker/profileRepository.js
//
// دسترسی به جدول profiles: خواندن، ساخت/به‌روزرسانی پروفایل کاربر.

const { prisma } = require('./db');

/** گرفتن پروفایل یک کاربر (یا null اگر وجود ندارد). */
async function getProfile(fromId) {
    return prisma.profile.findUnique({ where: { fromId: BigInt(fromId) } });
}

/** آیا پروفایل کامل شده (شماره+نام تأیید شده) است؟ */
function isProfileCompleted(profile) {
    return !!(profile && profile.profileCompletedAt);
}

/**
 * ساخت یا به‌روزرسانی اطلاعات تلگرامی پایه‌ی کاربر (username/first/last name).
 * این تابع مستقل از فلوی تکمیل پروفایل است و می‌تواند در هر تعامل صدا زده شود
 * تا این اطلاعات همیشه به‌روز بمانند.
 */
async function upsertTelegramInfo(fromId, telegramUser) {
    const data = {
        telegramUsername: telegramUser.username || null,
        telegramFirstName: telegramUser.first_name || null,
        telegramLastName: telegramUser.last_name || null,
    };

    return prisma.profile.upsert({
        where: { fromId: BigInt(fromId) },
        update: data,
        create: { fromId: BigInt(fromId), ...data },
    });
}

/** ذخیره‌ی شماره تلفن دریافتی از contact share. */
async function savePhoneNumber(fromId, phoneNumber) {
    return prisma.profile.upsert({
        where: { fromId: BigInt(fromId) },
        update: { phoneNumber },
        create: { fromId: BigInt(fromId), phoneNumber },
    });
}

/** ذخیره‌ی نام کامل واردشده توسط کاربر. */
async function saveFullName(fromId, fullName) {
    return prisma.profile.update({
        where: { fromId: BigInt(fromId) },
        data: { fullName },
    });
}

/** تکمیل نهایی پروفایل بعد از تأیید کاربر (ثبت زمان تکمیل). */
async function markProfileCompleted(fromId) {
    return prisma.profile.update({
        where: { fromId: BigInt(fromId) },
        data: { profileCompletedAt: new Date() },
    });
}

module.exports = {
    getProfile,
    isProfileCompleted,
    upsertTelegramInfo,
    savePhoneNumber,
    saveFullName,
    markProfileCompleted,
};
