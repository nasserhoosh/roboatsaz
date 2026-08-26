// /home/nasser/apps/robotmaker/menuLoader.js
//
// خواندن و اعتبارسنجی فایل menu.json و ساخت ساختارهای کمکی برای مسیریابی سریع.
//
// ساختار هر نود منو:
//   {
//     id: string        (یکتا در کل درخت - الزامی)
//     text: string       (متن روی دکمه - الزامی)
//     message?: string   (پیامی که هنگام کلیک ارسال می‌شود - اختیاری)
//     children?: Node[]  (زیرمنو - اختیاری)
//   }
//
// چهار حالت ممکن برای هر دکمه:
//   message + children  -> پیام ارسال می‌شود و زیرمنو هم باز می‌شود
//   message بدون children -> فقط پیام ارسال می‌شود (برگ)
//   children بدون message -> فقط زیرمنو باز می‌شود
//   نه message نه children -> دکمه بی‌اثر (فقط لاگ هشدار)

const fs = require('fs');
const path = require('path');

function loadMenuConfig(filePath = path.join(__dirname, 'menu.json')) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(raw);

    if (!config.start_message || typeof config.start_message !== 'string') {
        throw new Error('menu.json: فیلد "start_message" الزامی و باید رشته باشد.');
    }
    if (!Array.isArray(config.menu)) {
        throw new Error('menu.json: فیلد "menu" باید یک آرایه باشد.');
    }

    const backButtonText = config.back_button_text || '🔙 بازگشت';

    // نگاشت‌های کمکی برای مسیریابی O(1) به‌جای پیمایش درخت در هر پیام
    const nodesById = new Map();      // id -> node
    const parentOf = new Map();       // id -> parentId | null
    const textIndexByParent = new Map(); // parentKey -> Map(text -> node)  (parentKey: 'root' یا parentId)

    function indexChildren(children, parentId) {
        const parentKey = parentId === null ? 'root' : parentId;
        const textMap = new Map();

        for (const node of children) {
            validateNode(node, parentId);

            if (nodesById.has(node.id)) {
                throw new Error(`menu.json: شناسه تکراری "${node.id}" یافت شد. هر id باید در کل درخت یکتا باشد.`);
            }

            nodesById.set(node.id, node);
            parentOf.set(node.id, parentId);

            if (textMap.has(node.text)) {
                throw new Error(`menu.json: متن دکمه تکراری "${node.text}" در یک سطح از منو (والد: ${parentKey}). این باعث ابهام در تشخیص دکمه فشرده‌شده می‌شود.`);
            }
            textMap.set(node.text, node);

            if (Array.isArray(node.children) && node.children.length > 0) {
                indexChildren(node.children, node.id);
            }
        }

        textIndexByParent.set(parentKey, textMap);
    }

    function validateNode(node, parentId) {
        if (!node || typeof node !== 'object') {
            throw new Error(`menu.json: نودی نامعتبر زیر والد "${parentId}" یافت شد.`);
        }
        if (!node.id || typeof node.id !== 'string') {
            throw new Error(`menu.json: هر دکمه باید فیلد "id" رشته‌ای و غیرخالی داشته باشد (والد: ${parentId}).`);
        }
        if (!node.text || typeof node.text !== 'string') {
            throw new Error(`menu.json: دکمه با id="${node.id}" باید فیلد "text" رشته‌ای داشته باشد.`);
        }
        if (node.message !== undefined && typeof node.message !== 'string') {
            throw new Error(`menu.json: فیلد "message" در دکمه "${node.id}" باید رشته باشد.`);
        }
        if (node.children !== undefined && !Array.isArray(node.children)) {
            throw new Error(`menu.json: فیلد "children" در دکمه "${node.id}" باید آرایه باشد.`);
        }
        if (!node.message && (!node.children || node.children.length === 0)) {
            console.warn(`⚠️  هشدار: دکمه "${node.id}" (${node.text}) نه پیام دارد و نه زیرمنو؛ با کلیک روی آن هیچ اتفاقی نمی‌افتد.`);
        }
    }

    indexChildren(config.menu, null);

    return {
        startMessage: config.start_message,
        backButtonText,
        rootMenu: config.menu,
        nodesById,
        parentOf,
        textIndexByParent,
    };
}

module.exports = { loadMenuConfig };
