// /home/nasser/apps/robotmaker/userState.js
//
// نگهداری وضعیت ناوبری هر کاربر.
//
// دو سطح وضعیت داریم:
//   ۱. selectedMenuRowId: کدام منو (کدام رکورد جدول bot_menus) را انتخاب کرده؛
//      null یعنی کاربر هنوز در "لیست انتخاب منو" است (سطح بالاتر از همه‌ی منوها).
//   ۲. stack: زنجیره‌ی id والدها از ریشه‌ی همان منوی انتخاب‌شده تا سطح فعلی
//      (دقیقاً همان مفهوم قبلی، ولی حالا داخل یک منوی مشخص).

const states = new Map(); // chatId -> { selectedMenuRowId: number|null, stack: string[] }

function getState(chatId) {
    if (!states.has(chatId)) {
        states.set(chatId, { selectedMenuRowId: null, stack: [] });
    }
    return states.get(chatId);
}

/** بازنشانی کامل به حالت اولیه (لیست انتخاب منو) - هنگام /start */
function resetToMenuList(chatId) {
    states.set(chatId, { selectedMenuRowId: null, stack: [] });
}

/** ورود به یک منوی مشخص (بعد از انتخاب از لیست) */
function selectMenu(chatId, menuRowId) {
    states.set(chatId, { selectedMenuRowId: menuRowId, stack: [] });
}

/** خروج از منوی فعلی و بازگشت به لیست انتخاب منو */
function exitToMenuList(chatId) {
    states.set(chatId, { selectedMenuRowId: null, stack: [] });
}

function pushLevel(chatId, nodeId) {
    getState(chatId).stack.push(nodeId);
}

/**
 * یک سطح بازگشت به عقب.
 * @returns {boolean} true اگر همچنان داخل منو مانده، false اگر باید به لیست انتخاب منو خارج شود
 */
function popLevel(chatId) {
    const state = getState(chatId);
    if (state.stack.length === 0) {
        // دیگر جایی برای بازگشت داخل این منو نیست -> خروج به لیست انتخاب منو
        exitToMenuList(chatId);
        return false;
    }
    state.stack.pop();
    return true;
}

function getCurrentParentId(chatId) {
    const stack = getState(chatId).stack;
    return stack.length === 0 ? null : stack[stack.length - 1];
}

function getSelectedMenuRowId(chatId) {
    return getState(chatId).selectedMenuRowId;
}

module.exports = {
    getState,
    resetToMenuList,
    selectMenu,
    exitToMenuList,
    pushLevel,
    popLevel,
    getCurrentParentId,
    getSelectedMenuRowId,
};
