// /home/nasser/apps/robotmaker/menuRepository.js
//
// لایه‌ی دسترسی به داده: خواندن منوها از جدول bot_menus با Prisma،
// به‌علاوه کش سبک روی menuIndex ساخته‌شده (چون ساخت ایندکس هر بار گران است
// ولی محتوای منو بین دو کلیک معمولاً تغییر نمی‌کند).

const { prisma } = require('./db');
const { buildMenuIndex } = require('./menuLoader');

// کش: menuRowId -> menuIndex (ساختار ایندکس‌شده‌ی همان menuLoader قبلی)
const menuIndexCache = new Map();

/**
 * لیست منوهای متعلق به یک from_id (برای نمایش لیست انتخاب در /start).
 * @returns {Promise<Array<{id:number, menuName:string, menuDescription:string|null}>>}
 */
async function getMenuListForUser(fromId) {
    const rows = await prisma.botMenu.findMany({
        where: { fromId: BigInt(fromId) },
        select: { id: true, menuName: true, menuDescription: true },
        orderBy: { id: 'asc' },
    });
    return rows;
}

/**
 * گرفتن menuIndex برای یک رکورد خاص (بر اساس id سریال جدول)، با کش.
 * همچنین from_id چک می‌شود تا کاربری منوی متعلق به کاربر دیگر را (با حدس id) نگیرد.
 */
async function getMenuIndexById(menuRowId, fromId) {
    const cacheKey = `${menuRowId}`;
    if (menuIndexCache.has(cacheKey)) {
        return menuIndexCache.get(cacheKey);
    }

    const row = await prisma.botMenu.findUnique({ where: { id: menuRowId } });
    if (!row || row.fromId !== BigInt(fromId)) {
        return null; // یا وجود ندارد یا متعلق به این کاربر نیست
    }

    const menuIndex = buildMenuIndex(row.menuJson);
    menuIndex.menuName = row.menuName;
    menuIndex.menuRowId = row.id;

    menuIndexCache.set(cacheKey, menuIndex);
    return menuIndex;
}

/** پاک‌سازی کش یک منوی خاص (مثلاً بعد از ویرایش دستی در دیتابیس) */
function invalidateMenuCache(menuRowId) {
    menuIndexCache.delete(`${menuRowId}`);
}

module.exports = {
    getMenuListForUser,
    getMenuIndexById,
    invalidateMenuCache,
};
