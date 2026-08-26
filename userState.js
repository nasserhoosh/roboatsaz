// /home/nasser/apps/robotmaker/userState.js
//
// نگهداری وضعیت ناوبری هر کاربر.
//
// state.mode یکی از دو مقدار است:
//   "menu"        - حالت عادی ناوبری منو (پیش‌فرض)
//   "onboarding"  - کاربر در وسط فلوی «ایجاد ربات» (درخواست شماره/نام/تأیید) است
//
// برای حالت "menu":
//   selectedMenuRowId: کدام منو (کدام رکورد جدول bot_menus) را انتخاب کرده؛
//     null یعنی کاربر هنوز در "لیست انتخاب منو" است.
//   stack: زنجیره‌ی id والدها از ریشه‌ی همان منوی انتخاب‌شده تا سطح فعلی.
//
// برای حالت "onboarding":
//   onboardingStep: یکی از "awaiting_contact" | "awaiting_name" | "awaiting_confirmation"
//   pendingFullName: نامی که کاربر تایپ کرده ولی هنوز تأیید نکرده (برای نمایش در تأیید)

const states = new Map();

function defaultState() {
    return {
        mode: 'menu',
        selectedMenuRowId: null,
        stack: [],
        onboardingStep: null,
        pendingFullName: null,
    };
}

function getState(chatId) {
    if (!states.has(chatId)) {
        states.set(chatId, defaultState());
    }
    return states.get(chatId);
}

/** بازنشانی کامل به حالت اولیه (لیست انتخاب منو) - هنگام /start */
function resetToMenuList(chatId) {
    states.set(chatId, defaultState());
}

/** ورود به یک منوی مشخص (بعد از انتخاب از لیست) */
function selectMenu(chatId, menuRowId) {
    states.set(chatId, { ...defaultState(), selectedMenuRowId: menuRowId });
}

/** خروج از منوی فعلی و بازگشت به لیست انتخاب منو */
function exitToMenuList(chatId) {
    states.set(chatId, defaultState());
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

// ------------------ Onboarding ------------------

/** شروع فلوی onboarding: درخواست شماره تلفن. */
function startOnboarding(chatId) {
    const state = getState(chatId);
    state.mode = 'onboarding';
    state.onboardingStep = 'awaiting_contact';
    state.pendingFullName = null;
}

/** بعد از دریافت شماره، وارد مرحله‌ی دریافت نام می‌شویم. */
function setOnboardingAwaitingName(chatId) {
    const state = getState(chatId);
    state.onboardingStep = 'awaiting_name';
}

/** بعد از دریافت نام، وارد مرحله‌ی تأیید می‌شویم؛ نام را موقتاً نگه می‌داریم. */
function setOnboardingAwaitingConfirmation(chatId, fullName) {
    const state = getState(chatId);
    state.onboardingStep = 'awaiting_confirmation';
    state.pendingFullName = fullName;
}

/** پایان onboarding (چه با تأیید موفق چه با لغو) -> بازگشت به لیست منو. */
function endOnboarding(chatId) {
    exitToMenuList(chatId);
}

function isOnboarding(chatId) {
    return getState(chatId).mode === 'onboarding';
}

function getOnboardingStep(chatId) {
    return getState(chatId).onboardingStep;
}

function getPendingFullName(chatId) {
    return getState(chatId).pendingFullName;
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
    startOnboarding,
    setOnboardingAwaitingName,
    setOnboardingAwaitingConfirmation,
    endOnboarding,
    isOnboarding,
    getOnboardingStep,
    getPendingFullName,
};
