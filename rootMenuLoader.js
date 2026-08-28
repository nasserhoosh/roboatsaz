// /home/nasser/apps/robotmaker/rootMenuLoader.js
//
// بارگذاری منوی ریشه از فایل استاتیک root_menu.json (نه از دیتابیس)، با همان
// موتور menuLoader.js که برای منوهای کاربر استفاده می‌شود. یک نود خاص با
// id="my_bots" وجود دارد که children آن در runtime با لیست واقعی ربات‌های
// کاربر پر می‌شود (نه از خودِ JSON).

const fs = require('fs');
const path = require('path');
const { buildMenuIndex } = require('./menuLoader');

const ROOT_MENU_PATH = path.join(__dirname, 'root_menu.json');
const MY_BOTS_NODE_ID = 'my_bots';
const CREATE_BOT_NODE_ID = 'create_bot';

let cachedRootMenuJson = null;

/** خواندن و پارس root_menu.json (فقط یک‌بار در حافظه نگه داشته می‌شود؛ فایل استاتیک است). */
function loadRootMenuJsonRaw() {
    if (cachedRootMenuJson) return cachedRootMenuJson;
    const raw = fs.readFileSync(ROOT_MENU_PATH, 'utf-8');
    cachedRootMenuJson = JSON.parse(raw);
    return cachedRootMenuJson;
}

/**
 * ساخت menuIndex منوی ریشه، با جایگزینی children نود «ربات‌های من» با لیست
 * واقعی ربات‌های کاربر (bot_menus rows).
 *
 * @param {Array<{id:number, menuName:string, menuDescription:string|null}>} userBotRows
 */
function buildRootMenuIndex(userBotRows) {
    const rootMenuJson = JSON.parse(JSON.stringify(loadRootMenuJsonRaw())); // deep clone - هر بار تازه

    const myBotsNode = rootMenuJson.menu.find((node) => node.id === MY_BOTS_NODE_ID);
    if (myBotsNode) {
        myBotsNode.children = userBotRows.map((row) => ({
            id: `bot_${row.id}`,
            text: row.menuName,
            // انتخاب یک ربات از این لیست باید همان مسیر قبلی (ورود به منوی انتخاب‌شده) را طی کند؛
            // این کار در index.js با تشخیص پیشوند id انجام می‌شود، نه از طریق message/children اینجا.
        }));
        // اگر کاربر هیچ رباتی نداشت، حداقل یک آیتم راهنما نشان می‌دهیم تا لیست خالی گیج‌کننده نباشد.
        if (myBotsNode.children.length === 0) {
            myBotsNode.children = [
                { id: '_no_bots_placeholder', text: 'هنوز رباتی نساخته‌اید', message: 'برای شروع، از دکمه‌ی «🤖 ایجاد ربات» استفاده کنید.' },
            ];
        }
    }

    return buildMenuIndex(rootMenuJson);
}

/**
 * نسخه‌ی بی‌سروصدا: نودهای create_bot و bot_* عمداً نه message دارند نه children
 * (چون رفتارشان در index.js هندل می‌شود، نه در خودِ JSON) - هشدار عمومی menuLoader
 * برای این مورد خاص گمراه‌کننده است، پس console.warn موقتاً حین ساخت خاموش می‌شود.
 */
function buildRootMenuIndexQuiet(userBotRows) {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        return buildRootMenuIndex(userBotRows);
    } finally {
        console.warn = originalWarn;
    }
}

module.exports = {
    buildRootMenuIndex: buildRootMenuIndexQuiet,
    MY_BOTS_NODE_ID,
    CREATE_BOT_NODE_ID,
};
