// /home/nasser/apps/robotmaker/menuLoader.js
//
// ساخت ساختارهای کمکیِ مسیریابی از روی یک menu_json (که از دیتابیس خوانده شده).
// این تابع دیگر از فایل نمی‌خواند؛ یک شیء JS (خروجی ستون jsonb) می‌گیرد.
//
// ساختار هر نود منو:
//   {
//     id: string        (یکتا در کل درخت این منو - الزامی)
//     text: string       (متن روی دکمه - الزامی)
//     message?: string   (پیامی که هنگام کلیک ارسال می‌شود - اختیاری)
//     children?: Node[]  (زیرمنو - اختیاری)
//   }

function buildMenuIndex(menuJson) {
    if (!menuJson || typeof menuJson !== 'object') {
        throw new Error('menu_json نامعتبر است (شیء نیست).');
    }
    if (!menuJson.start_message || typeof menuJson.start_message !== 'string') {
        throw new Error('menu_json: فیلد "start_message" الزامی و باید رشته باشد.');
    }
    if (!Array.isArray(menuJson.menu)) {
        throw new Error('menu_json: فیلد "menu" باید یک آرایه باشد.');
    }

    const backButtonText = menuJson.back_button_text || '🔙 بازگشت';

    const nodesById = new Map();
    const parentOf = new Map();
    const textIndexByParent = new Map();

    function indexChildren(children, parentId) {
        const parentKey = parentId === null ? 'root' : parentId;
        const textMap = new Map();

        for (const node of children) {
            validateNode(node, parentId);

            if (nodesById.has(node.id)) {
                throw new Error(`menu_json: شناسه تکراری "${node.id}" یافت شد. هر id باید در کل درخت یکتا باشد.`);
            }

            nodesById.set(node.id, node);
            parentOf.set(node.id, parentId);

            if (textMap.has(node.text)) {
                throw new Error(`menu_json: متن دکمه تکراری "${node.text}" در یک سطح از منو (والد: ${parentKey}).`);
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
            throw new Error(`menu_json: نودی نامعتبر زیر والد "${parentId}" یافت شد.`);
        }
        if (!node.id || typeof node.id !== 'string') {
            throw new Error(`menu_json: هر دکمه باید فیلد "id" رشته‌ای و غیرخالی داشته باشد (والد: ${parentId}).`);
        }
        if (!node.text || typeof node.text !== 'string') {
            throw new Error(`menu_json: دکمه با id="${node.id}" باید فیلد "text" رشته‌ای داشته باشد.`);
        }
        if (node.message !== undefined && typeof node.message !== 'string') {
            throw new Error(`menu_json: فیلد "message" در دکمه "${node.id}" باید رشته باشد.`);
        }
        if (node.children !== undefined && !Array.isArray(node.children)) {
            throw new Error(`menu_json: فیلد "children" در دکمه "${node.id}" باید آرایه باشد.`);
        }
        if (!node.message && (!node.children || node.children.length === 0)) {
            console.warn(`⚠️  هشدار: دکمه "${node.id}" (${node.text}) نه پیام دارد و نه زیرمنو.`);
        }
    }

    indexChildren(menuJson.menu, null);

    return {
        startMessage: menuJson.start_message,
        backButtonText,
        rootMenu: menuJson.menu,
        nodesById,
        parentOf,
        textIndexByParent,
    };
}

module.exports = { buildMenuIndex };
