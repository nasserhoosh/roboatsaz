// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول‌های اتصال/منو/دیتابیس/پروفایل
// ==========================================
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');
const { getMenuListForUser, getMenuIndexById } = require('./menuRepository');
const { getChildrenType, getDisplayText } = require('./menuLoader');
const {
    buildKeyboard,
    buildMenuListKeyboard,
    buildSoftMenuKeyboard,
    buildSoftMenuText,
    buildRequestContactKeyboard,
    buildBackOnlyKeyboard,
    buildConfirmationKeyboard,
} = require('./menuRenderer');
const userState = require('./userState');
const profileRepository = require('./profileRepository');
const {
    CREATE_BOT_BUTTON_TEXT,
    REQUEST_CONTACT_BUTTON_TEXT,
    CONFIRM_BUTTON_TEXT,
    PHONE_SHARE_INSTRUCTION_TEXT,
    ASK_FULL_NAME_MESSAGE,
    buildConfirmationMessage,
    buildGatewayLinkMessage,
} = require('./onboardingConfig');

const INVALID_SOFT_MENU_INPUT_MESSAGE = '⚠️ عدد واردشده معتبر نیست. لطفاً یکی از شماره‌های لیست را ارسال کنید.';
const BACK_BUTTON_TEXT = '🔙 بازگشت'; // دکمه‌ی بازگشتِ سراسری (خارج از یک منوی مشخص - مثلاً در onboarding)
const GENERIC_ERROR_MESSAGE = '⚠️ خطایی در پردازش درخواست شما رخ داد. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.';

/**
 * لاگ کامل خطا (با استک) در کنسول + تلاش برای اطلاع‌رسانی به کاربر در تلگرام.
 * ارسال پیام خطا به کاربر خودش هم می‌تواند throw کند (مثلاً اگر شبکه قطع باشد)؛
 * آن را جداگانه catch می‌کنیم تا خودِ گزارش خطا باعث کرش نشود.
 */
async function reportError(ctx, context, err) {
    console.error(`Bot Runtime Error [${context}]:`, err);
    try {
        await ctx.reply(GENERIC_ERROR_MESSAGE);
    } catch (sendErr) {
        console.error('Failed to send error message to user:', sendErr);
    }
}

/**
 * اجرای یک پرامیس با سقف زمانی؛ اگر ظرف مدت مشخص resolve/reject نشود،
 * خودش reject می‌کند تا هیچ عملیاتی بی‌صدا و بی‌نهایت معلق نماند.
 */
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
        ),
    ]);
}

// ==========================================
// ۲. توابع کمکی نمایش منو (بدون تغییر نسبت به قبل)
// ==========================================

/**
 * نمایش لیست انتخاب منو (سطح بالاتر از همه‌ی منوهای این کاربر)، به‌همراه دکمه‌ی «ایجاد ربات».
 * این سطح همیشه دکمه‌ای است (نه سافت)، چون مفهوم children_type فقط داخل یک منوی JSON معنا دارد.
 * برخلاف قبل، کاربر بدون منو هم همین لیست را می‌بیند (فقط با دکمه‌ی «ایجاد ربات»)،
 * نه پیام «دسترسی ندارید».
 */
async function showMenuList(ctx, chatId, fromId) {
    const menuRows = await getMenuListForUser(fromId);

    userState.resetToMenuList(chatId);
    const keyboard = buildMenuListKeyboard(menuRows, CREATE_BOT_BUTTON_TEXT);

    const promptText = menuRows.length > 0
        ? 'لطفاً یکی از منوهای زیر را انتخاب کنید:'
        : 'برای شروع، روی «🤖 ایجاد ربات» بزنید.';

    await ctx.reply(promptText, { reply_markup: keyboard });
}

/** برگرداندن لیست نودهای یک سطح خاص از یک menuIndex مشخص */
function getNodesForParent(menuIndex, parentId) {
    if (parentId === null) {
        return menuIndex.rootMenu;
    }
    const parentNode = menuIndex.nodesById.get(parentId);
    return (parentNode && Array.isArray(parentNode.children)) ? parentNode.children : [];
}

/**
 * نمایش یک سطح از منوی داخلی (بعد از انتخاب یک منو از لیست یا هر جابه‌جایی سطح).
 * بسته به children_type همان سطح، یا کیبورد دکمه‌ای می‌سازد یا لیست عددی (سافت‌منو).
 */
async function showMenuLevel(ctx, menuIndex, parentId, promptText) {
    const nodes = getNodesForParent(menuIndex, parentId);
    const type = getChildrenType(menuIndex, parentId);

    if (type === 'soft') {
        const text = buildSoftMenuText(promptText, nodes);
        const keyboard = buildSoftMenuKeyboard(menuIndex.backButtonText);
        await ctx.reply(text, { reply_markup: keyboard });
    } else {
        const keyboard = buildKeyboard(nodes, true, menuIndex.backButtonText);
        await ctx.reply(promptText, { reply_markup: keyboard });
    }
}

/**
 * پیدا کردن نودِ انتخاب‌شده توسط کاربر در سطح فعلی، با توجه به نوع سطح (دکمه‌ای یا سافت).
 * @returns {{node: object|null, invalidSoftInput: boolean}}
 */
function resolveSelectedNode(menuIndex, currentParentId, text) {
    const type = getChildrenType(menuIndex, currentParentId);
    const nodes = getNodesForParent(menuIndex, currentParentId);

    if (type === 'soft') {
        const trimmed = text.trim();
        const num = Number(trimmed);
        const isValidIndex = Number.isInteger(num) && num >= 1 && num <= nodes.length;
        if (!isValidIndex) {
            return { node: null, invalidSoftInput: true };
        }
        return { node: nodes[num - 1], invalidSoftInput: false };
    }

    const parentKey = currentParentId === null ? 'root' : currentParentId;
    const textMap = menuIndex.textIndexByParent.get(parentKey);
    const node = textMap ? textMap.get(text) : undefined;
    return { node: node || null, invalidSoftInput: false };
}

// ==========================================
// ۳. توابع کمکی فلوی onboarding («ایجاد ربات»)
// ==========================================

/** شروع فلوی onboarding: ارسال متن دستورالعمل + دکمه‌ی اشتراک‌گذاری شماره. */
async function startCreateBotFlow(ctx, chatId) {
    console.log(`[onboarding] startCreateBotFlow: chatId=${chatId}`);
    userState.startOnboarding(chatId);
    const keyboard = buildRequestContactKeyboard(REQUEST_CONTACT_BUTTON_TEXT, BACK_BUTTON_TEXT);
    console.log(`[onboarding] sending instruction message to chatId=${chatId}`);
    await withTimeout(
        ctx.reply(PHONE_SHARE_INSTRUCTION_TEXT, { reply_markup: keyboard }),
        10000,
        'ctx.reply(instruction text)'
    );
    console.log(`[onboarding] instruction message sent to chatId=${chatId}`);
}

/**
 * اگر کاربر پروفایل کامل دارد: مستقیم لینک درگاه ارسال می‌شود.
 * اگر ندارد: فلوی درخواست شماره تلفن شروع می‌شود.
 */
async function handleCreateBotButton(ctx, chatId, fromId) {
    console.log(`[onboarding] handleCreateBotButton: fromId=${fromId}, chatId=${chatId}`);

    console.log(`[onboarding] fetching profile for fromId=${fromId}`);
    const profile = await withTimeout(
        profileRepository.getProfile(fromId),
        8000,
        'profileRepository.getProfile'
    );
    console.log(`[onboarding] profile fetched:`, profile);

    if (profileRepository.isProfileCompleted(profile)) {
        console.log(`[onboarding] profile already completed, sending gateway link`);
        await withTimeout(
            ctx.reply(buildGatewayLinkMessage(profile.id)),
            10000,
            'ctx.reply(gateway link)'
        );
        return;
    }

    await startCreateBotFlow(ctx, chatId);
}

/** پردازش دریافت contact (بعد از زدن دکمه‌ی اشتراک‌گذاری شماره). */
async function handleContactShared(ctx, chatId, fromId) {
    const contact = ctx.message.contact;

    // نکته‌ی امنیتی: مطمئن شویم شماره‌ی خودِ کاربر است، نه یک مخاطب دیگر که فوروارد شده.
    if (!contact.user_id || String(contact.user_id) !== String(fromId)) {
        await ctx.reply('⚠️ لطفاً فقط شماره تلفن خودتان را به اشتراک بگذارید.');
        return;
    }

    await profileRepository.savePhoneNumber(fromId, contact.phone_number);
    userState.setOnboardingAwaitingName(chatId);

    const keyboard = buildBackOnlyKeyboard(BACK_BUTTON_TEXT);
    await ctx.reply(ASK_FULL_NAME_MESSAGE, { reply_markup: keyboard });
}

/** پردازش دریافت نام کامل (مرحله‌ی awaiting_name). */
async function handleFullNameInput(ctx, chatId, fromId, text) {
    const fullName = text.trim();
    if (!fullName) {
        await ctx.reply('لطفاً یک نام معتبر ارسال کنید.');
        return;
    }

    userState.setOnboardingAwaitingConfirmation(chatId, fullName);

    const profile = await profileRepository.getProfile(fromId);
    const keyboard = buildConfirmationKeyboard(CONFIRM_BUTTON_TEXT, BACK_BUTTON_TEXT);
    await ctx.reply(buildConfirmationMessage(profile.phoneNumber, fullName), { reply_markup: keyboard });
}

/** پردازش تأیید نهایی (مرحله‌ی awaiting_confirmation). */
async function handleConfirmation(ctx, chatId, fromId) {
    const fullName = userState.getPendingFullName(chatId);

    await profileRepository.saveFullName(fromId, fullName);
    const profile = await profileRepository.markProfileCompleted(fromId);

    userState.endOnboarding(chatId);

    await ctx.reply(buildGatewayLinkMessage(profile.id));
    await showMenuList(ctx, chatId, fromId);
}

// ==========================================
// ۴. راه‌اندازی ربات
// ==========================================
(async () => {
    const bot = await initBotWithFallback();

    if (!bot) {
        console.log('برنامه به دلیل عدم امکان اتصال متوقف شد.');
        process.exit(1);
    }

    // ------------------------------------------
    // میدل‌ور تشخیصی سراسری: هر آپدیت دریافتی را قبل از هر پردازشی لاگ می‌کند،
    // تا مشخص شود آیا polling اصلاً پیام‌ها را دریافت می‌کند یا نه.
    // ------------------------------------------
    bot.use(async (ctx, next) => {
        console.log('[incoming update]', JSON.stringify({
            hasMessage: !!ctx.message,
            text: ctx.message && ctx.message.text,
            hasContact: !!(ctx.message && ctx.message.contact),
            chatId: ctx.chat && ctx.chat.id,
            fromId: ctx.from && ctx.from.id,
        }));
        try {
            await next();
        } catch (err) {
            console.error('[middleware] error propagated from downstream handler:', err);
        }
        console.log('[incoming update] handled.');
    });

    // ------------------------------------------
    // /start : به‌روزرسانی اطلاعات تلگرامی + همیشه لیست منوهای کاربر
    // ------------------------------------------
    bot.command('start', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            const fromId = ctx.from.id;
            await profileRepository.upsertTelegramInfo(fromId, ctx.from);
            await showMenuList(ctx, chatId, fromId);
        } catch (err) {
            await reportError(ctx, '/start', err);
        }
    });

    // ------------------------------------------
    // هندلر واحد پیام (contact + متن)
    // نکته‌ی مهم: این پکیج زنجیره‌ای koa-style است - چند bot.on('message', ...) جدا
    // اگر هیچ‌کدام صریحاً next() را صدا نزنند، فقط اولی اجرا می‌شود و بقیه هرگز
    // فراخوانی نمی‌شوند. به همین دلیل منطق contact و متن هر دو در یک هندلر واحد آمده‌اند.
    // ------------------------------------------
    bot.on('message', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            const fromId = ctx.from.id;

            // -------- شاخه‌ی contact --------
            if (ctx.message && ctx.message.contact) {
                if (userState.isOnboarding(chatId) && userState.getOnboardingStep(chatId) === 'awaiting_contact') {
                    await handleContactShared(ctx, chatId, fromId);
                }
                // اگر contact خارج از این مرحله برسد، نادیده گرفته می‌شود.
                return;
            }

            // -------- شاخه‌ی متن --------
            const text = ctx.message && ctx.message.text;
            if (!text) return; // سایر انواع پیام (عکس، استیکر و ...) نادیده گرفته می‌شوند

            console.log(`[text handler] chatId=${chatId} fromId=${fromId} text=${JSON.stringify(text)}`);

            // دکمه‌ی «ایجاد ربات» از هرجای منوی ریشه قابل کلیک است
            if (text === CREATE_BOT_BUTTON_TEXT) {
                console.log('[text handler] matched CREATE_BOT_BUTTON_TEXT');
                await handleCreateBotButton(ctx, chatId, fromId);
                return;
            }

            // -------- حالت صفر: کاربر در وسط فلوی onboarding است --------
            if (userState.isOnboarding(chatId)) {
                const step = userState.getOnboardingStep(chatId);

                if (text === BACK_BUTTON_TEXT) {
                    userState.endOnboarding(chatId);
                    await showMenuList(ctx, chatId, fromId);
                    return;
                }

                if (step === 'awaiting_contact') {
                    // در این مرحله فقط دکمه‌ی اشتراک‌گذاری (که پیام contact می‌فرستد) یا بازگشت معتبر است؛
                    // پیام متنی دیگری نادیده گرفته می‌شود.
                    return;
                }

                if (step === 'awaiting_name') {
                    await handleFullNameInput(ctx, chatId, fromId, text);
                    return;
                }

                if (step === 'awaiting_confirmation') {
                    if (text === CONFIRM_BUTTON_TEXT) {
                        await handleConfirmation(ctx, chatId, fromId);
                    }
                    // متن دیگری در این مرحله نادیده گرفته می‌شود.
                    return;
                }

                return;
            }

            const state = userState.getState(chatId);

            // -------- حالت ۱: کاربر در «لیست انتخاب منو» است (همیشه دکمه‌ای) --------
            if (state.selectedMenuRowId === null) {
                const menuRows = await getMenuListForUser(fromId);

                const chosenRow = menuRows.find((row) => row.menuName === text);
                if (!chosenRow) {
                    // متنی که با هیچ نام منویی مطابقت ندارد؛ نادیده گرفته می‌شود
                    return;
                }

                const menuIndex = await getMenuIndexById(chosenRow.id, fromId);
                if (!menuIndex) {
                    await showMenuList(ctx, chatId, fromId);
                    return;
                }

                userState.selectMenu(chatId, chosenRow.id);
                await showMenuLevel(ctx, menuIndex, null, menuIndex.startMessage);
                return;
            }

            // -------- حالت ۲: کاربر داخل یک منوی مشخص است --------
            const menuIndex = await getMenuIndexById(state.selectedMenuRowId, fromId);
            if (!menuIndex) {
                // منو دیگر در دسترس نیست (مثلاً حذف شده) -> بازگشت به لیست
                await showMenuList(ctx, chatId, fromId);
                return;
            }

            // دکمه بازگشت (در هر دو نوع سطح - دکمه‌ای یا سافت - همین یک متن است)
            if (text === menuIndex.backButtonText) {
                const stillInsideMenu = userState.popLevel(chatId);
                if (!stillInsideMenu) {
                    await showMenuList(ctx, chatId, fromId);
                    return;
                }
                const parentId = userState.getCurrentParentId(chatId);
                const promptText = parentId === null
                    ? menuIndex.startMessage
                    : getDisplayText(menuIndex.nodesById.get(parentId));
                await showMenuLevel(ctx, menuIndex, parentId, promptText);
                return;
            }

            // انتخاب آیتم داخل سطح فعلی (دکمه‌ای یا عددی، بسته به children_type)
            const currentParentId = userState.getCurrentParentId(chatId);
            const { node, invalidSoftInput } = resolveSelectedNode(menuIndex, currentParentId, text);

            if (invalidSoftInput) {
                await ctx.reply(INVALID_SOFT_MENU_INPUT_MESSAGE);
                const parentId = currentParentId;
                const promptText = parentId === null
                    ? menuIndex.startMessage
                    : getDisplayText(menuIndex.nodesById.get(parentId));
                await showMenuLevel(ctx, menuIndex, parentId, promptText);
                return;
            }

            if (!node) {
                // متنی که با هیچ دکمه‌ای در سطح فعلی (دکمه‌ای) مطابقت ندارد؛ نادیده گرفته می‌شود
                return;
            }

            const hasMessage = typeof node.message === 'string' && node.message.length > 0;
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;

            if (hasMessage) {
                await ctx.reply(node.message);
            }

            if (hasChildren) {
                userState.pushLevel(chatId, node.id);
                await showMenuLevel(ctx, menuIndex, node.id, getDisplayText(node));
            }
            // اگر نه message دارد و نه children: آیتم بی‌اثر (هشدار در menuLoader هنگام بارگذاری چاپ شده)
        } catch (err) {
            await reportError(ctx, 'message handler', err);
        }
    });

    // ------------------------------------------
    // مدیریت خطاهای زمان اجرا (آخرین خط دفاعی - خطاهایی که در try/catch های بالا گرفته نشده باشند)
    // ------------------------------------------
    bot.catch((err) => {
        console.error('Bot Runtime Error (uncaught):', err);
    });

    console.log('ربات آماده به کار است. در حال دریافت پیام‌ها (Polling)...');
    run(bot);
})();