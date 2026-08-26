// /home/nasser/apps/robotmaker/userState.js
//
// نگهداری وضعیت ناوبری هر کاربر (در کدام سطح از منو قرار دارد).
// stack شامل زنجیره‌ی id والدها از ریشه تا سطح فعلی است.
// stack خالی = کاربر در منوی ریشه است.

const userStacks = new Map(); // chatId -> string[] (stack of node ids, from root to current)

function getStack(chatId) {
    if (!userStacks.has(chatId)) {
        userStacks.set(chatId, []);
    }
    return userStacks.get(chatId);
}

function resetStack(chatId) {
    userStacks.set(chatId, []);
}

function pushLevel(chatId, nodeId) {
    getStack(chatId).push(nodeId);
}

function popLevel(chatId) {
    const stack = getStack(chatId);
    stack.pop();
    return stack;
}

/**
 * شناسه‌ی والدِ فعلی که کاربر منوی آن را می‌بیند (یا null برای ریشه).
 */
function getCurrentParentId(chatId) {
    const stack = getStack(chatId);
    return stack.length === 0 ? null : stack[stack.length - 1];
}

module.exports = {
    getStack,
    resetStack,
    pushLevel,
    popLevel,
    getCurrentParentId,
};
