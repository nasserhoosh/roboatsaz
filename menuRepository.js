// /home/nasser/apps/robotmaker/menuRepository.js
//
// لایه‌ی دسترسی به داده: خواندن منوها از جدول bot_menus با Prisma.
//
// عمداً بدون کش: هر فراخوانی مستقیماً از DB می‌خواند تا تغییرات دستی
// (مثلاً ویرایش menu_json در Adminer) بدون نیاز به ری‌استارت پروسه
// بلافاصله در ربات اعمال شود. هزینه‌ی این کوئری اضافه ناچیز است، چون
// هر پیام کاربر در معماری فعلی از قبل حداقل یک کوئری به DB می‌زند.

const { prisma } = require('./db');
const { buildMenuIndex } = require('./menuLoader');

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
 * گرفتن menuIndex برای یک رکورد خاص (بر اساس id سریال جدول)، همیشه تازه از DB.
 * همچنین from_id چک می‌شود تا کاربری منوی متعلق به کاربر دیگر را (با حدس id) نگیرد.
 */
async function getMenuIndexById(menuRowId, fromId) {
    const row = await prisma.botMenu.findUnique({ where: { id: menuRowId } });
    if (!row || row.fromId !== BigInt(fromId)) {
        return null; // یا وجود ندارد یا متعلق به این کاربر نیست
    }

    const menuIndex = buildMenuIndex(row.menuJson);
    menuIndex.menuName = row.menuName;
    menuIndex.menuRowId = row.id;

    return menuIndex;
}

module.exports = {
    getMenuListForUser,
    getMenuIndexById,
};
