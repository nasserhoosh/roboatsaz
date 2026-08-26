// /home/nasser/apps/robotmaker/menuLoader.js
//
// ساخت ساختارهای کمکیِ مسیریابی از روی یک menu_json (که از دیتابیس خوانده شده).
// این تابع دیگر از فایل نمی‌خواند؛ یک شیء JS (خروجی ستون jsonb) می‌گیرد.
//
// ساختار هر نود منو:
//   {
//     id: string              (یکتا در کل درخت این منو - الزامی)
//     text: string             (متن روی دکمه/آیتم - الزامی)
//     icon?: string            (ایموجی که قبل از text نمایش داده می‌شود - اختیاری)
//     message?: string         (پیامی که هنگام انتخاب ارسال می‌شود - اختیاری)
//     children?: Node[]        (زیرمنو - اختیاری)
//     children_type?: string   ("buttons" | "soft" - نحوه‌ی نمایش children این نود؛
//                               پیش‌فرض "buttons" - اختیاری، فقط وقتی children دارد معنا دارد)
//   }
//
// همچنین خودِ ریشه‌ی منو (menu_json.menu) می‌تواند children_type مستقل داشته باشد
// از طریق فیلد سطح بالا menu_json.root_children_type (پیش‌فرض "buttons").
//
// نکته‌ی مهم درباره‌ی icon: متن نمایشی هر نود (که هم روی دکمه‌ی ReplyKeyboard چاپ
// می‌شود و هم در خط لیست سافت‌منو) از طریق getDisplayText ساخته می‌شود.
// چون در ReplyKeyboard متنِ فشرده‌شده توسط کاربر دقیقاً همان متن چاپ‌شده روی دکمه
// برمی‌گردد، textIndexByParent هم بر اساس همین متنِ کامل (شامل آیکون) ایندکس می‌شود -
// در غیر این صورت تشخیص دکمه‌ی دکمه‌ای شکست می‌خورد.

const VALID_CHILDREN_TYPES = new Set(['buttons', 'soft']);

/** متن نمایشی یک نود: آیکون (در صورت وجود) + یک فاصله + text. */
function getDisplayText(node) {
    return node.icon ? `${node.icon} ${node.text}` : node.text;
}

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

    const rootChildrenType = validateChildrenType(
        menuJson.root_children_type,
        'ریشه‌ی منو (root_children_type)'
    ) || 'buttons';

    const nodesById = new Map();
    const parentOf = new Map();
    const textIndexByParent = new Map();
    const childrenTypeByParent = new Map(); // parentKey -> "buttons" | "soft"

    childrenTypeByParent.set('root', rootChildrenType);

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

            const displayText = getDisplayText(node);
            if (textMap.has(displayText)) {
                throw new Error(`menu_json: متن نمایشی تکراری "${displayText}" در یک سطح از منو (والد: ${parentKey}).`);
            }
            textMap.set(displayText, node);

            if (Array.isArray(node.children) && node.children.length > 0) {
                const childType = validateChildrenType(
                    node.children_type,
                    `دکمه "${node.id}"`
                ) || 'buttons';
                childrenTypeByParent.set(node.id, childType);

                indexChildren(node.children, node.id);
            }
        }

        textIndexByParent.set(parentKey, textMap);
    }

    function validateChildrenType(value, contextLabel) {
        if (value === undefined) return undefined;
        if (typeof value !== 'string' || !VALID_CHILDREN_TYPES.has(value)) {
            throw new Error(`menu_json: مقدار "children_type" در ${contextLabel} باید یکی از "buttons" یا "soft" باشد.`);
        }
        return value;
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
        if (node.icon !== undefined && typeof node.icon !== 'string') {
            throw new Error(`menu_json: فیلد "icon" در دکمه "${node.id}" باید رشته باشد.`);
        }
        if (node.message !== undefined && typeof node.message !== 'string') {
            throw new Error(`menu_json: فیلد "message" در دکمه "${node.id}" باید رشته باشد.`);
        }
        if (node.children !== undefined && !Array.isArray(node.children)) {
            throw new Error(`menu_json: فیلد "children" در دکمه "${node.id}" باید آرایه باشد.`);
        }
        if (node.children_type !== undefined && (!Array.isArray(node.children) || node.children.length === 0)) {
            throw new Error(`menu_json: فیلد "children_type" در دکمه "${node.id}" فقط وقتی معنا دارد که "children" غیرخالی داشته باشد.`);
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
        childrenTypeByParent,
    };
}

/** نوع نمایش children یک والد خاص را برمی‌گرداند ("buttons" یا "soft"). */
function getChildrenType(menuIndex, parentId) {
    const parentKey = parentId === null ? 'root' : parentId;
    return menuIndex.childrenTypeByParent.get(parentKey) || 'buttons';
}

module.exports = { buildMenuIndex, getChildrenType, getDisplayText };
