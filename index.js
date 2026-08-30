// /home/nasser/apps/robotmaker/index.js

// ==========================================
// ۱. ورود کتابخانه‌ها و ماژول‌های اتصال/منو/دیتابیس/پروفایل
// ==========================================
const { run } = require('node-telegram-bot-api/node');
const { initBotWithFallback } = require('./connection');
const { getMenuListForUser, getMenuIndexById } = require('./menuRepository');
const { getChildrenType, getDisplayText } = require('./menuLoader');
const { buildRootMenuIndex, MY_BOTS_NODE_ID, CREATE_BOT_NODE_ID } = require('./rootMenuLoader');
const {
    buildKeyboard,
    buildSoftMenuKeyboard,
    buildSoftMenuText,
    buildRequestContactKeyboard,
    buildBackOnlyKeyboard,
    buildConfirmationKeyboard,
} = require('./menuRenderer');
const userState = require('./userState');
const profileRepository = require('./profileRepository');
const walletRepository = require('./walletRepository');
const { loadPaymentPolicy } = require('./paymentPolicy');
const {
    REQUEST_CONTACT_BUTTON_TEXT,
    CONFIRM_BUTTON_TEXT,
    PHONE_SHARE_INSTRUCTION_PHOTO_FILE_ID,
    PHONE_SHARE_INSTRUCTION_CAPTION,
    ASK_FULL_NAME_MESSAGE,
    buildConfirmationMessage,
    buildGatewayLinkMessage,
} = require('./onboardingConfig');

const BOT_NODE_ID_PREFIX = 'bot_'; // پیشوندی که rootMenuLoader برای id هر ربات در سافت‌منوی «ربات‌های من» می‌سازد

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
 * نمایش منوی ریشه (از root_menu.json، به‌همراه لیست پویا در سافت‌منوی «ربات‌های من»).
 * جایگزین showMenuList قبلی؛ به‌جای لیست تخت bot_menus، از موتور کامل menuLoader
 * (دکمه‌ای + سافت‌منو + آیکون) برای خودِ ریشه هم استفاده می‌کند.
 */
async function showRootMenu(ctx, chatId, fromId) {
    const rootMenuIndex = await buildFreshRootMenuIndex(fromId);
    userState.resetToMenuList(chatId);
    await showMenuLevel(ctx, rootMenuIndex, null, rootMenuIndex.startMessage);
}

/**
 * ساخت rootMenuIndex تازه (لیست ربات‌های کاربر همیشه fresh از DB خوانده می‌شود،
 * دقیقاً مثل getMenuIndexById برای منوهای معمولی - بدون کش، تا تغییرات فوری دیده شوند).
 */
async function buildFreshRootMenuIndex(fromId) {
    const menuRows = await getMenuListForUser(fromId);
    return buildRootMenuIndex(menuRows);
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

/** شروع فلوی onboarding: ارسال عکس دستورالعمل + دکمه‌ی اشتراک‌گذاری شماره. */
async function startCreateBotFlow(ctx, chatId) {
    console.log(`[onboarding] startCreateBotFlow: chatId=${chatId}`);
    userState.startOnboarding(chatId);
    const keyboard = buildRequestContactKeyboard(REQUEST_CONTACT_BUTTON_TEXT, BACK_BUTTON_TEXT);
    console.log(`[onboarding] sending instruction photo to chatId=${chatId}`);
    // نکته: این پکیج متد ctx.replyWithPhoto ندارد؛ ارسال عکس باید از طریق ctx.api.sendPhoto
    // (یا bot.api.sendPhoto) با پارامترهای کامل (chat_id و ...) انجام شود، نه ctx.reply.
    await withTimeout(
        ctx.api.sendPhoto({
            chat_id: chatId,
            photo: PHONE_SHARE_INSTRUCTION_PHOTO_FILE_ID,
            caption: PHONE_SHARE_INSTRUCTION_CAPTION,
            reply_markup: keyboard,
        }),
        10000,
        'ctx.api.sendPhoto(instruction photo)'
    );
    console.log(`[onboarding] instruction photo sent to chatId=${chatId}`);
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

    // هدیه‌ی خوش‌آمد یک‌بار برای کاربر تازه‌وارد (فقط همین‌جا، چون تکمیل پروفایل هم فقط یک‌بار رخ می‌دهد)
    const policy = loadPaymentPolicy();
    if (policy.welcome_gift_coins > 0) {
        await walletRepository.creditWallet(fromId, policy.welcome_gift_coins);
    }

    userState.endOnboarding(chatId);

    await ctx.reply(buildGatewayLinkMessage(profile.id));
    await showRootMenu(ctx, chatId, fromId);
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
            await showRootMenu(ctx, chatId, fromId);
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

            // -------- حالت صفر: کاربر در وسط فلوی onboarding است --------
            if (userState.isOnboarding(chatId)) {
                const step = userState.getOnboardingStep(chatId);

                if (text === BACK_BUTTON_TEXT) {
                    userState.endOnboarding(chatId);
                    await showRootMenu(ctx, chatId, fromId);
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

            // -------- حالت ۱: کاربر در منوی ریشه است (root_menu.json + سافت‌منوی «ربات‌های من») --------
            if (state.selectedMenuRowId === null) {
                const rootMenuIndex = await buildFreshRootMenuIndex(fromId);
                const currentParentId = userState.getCurrentParentId(chatId);

                // دکمه بازگشت در سطوح داخلی منوی ریشه (مثلاً داخل سافت‌منوی «ربات‌های من»)
                if (text === rootMenuIndex.backButtonText && currentParentId !== null) {
                    const stillInside = userState.popLevel(chatId);
                    const parentId = stillInside ? userState.getCurrentParentId(chatId) : null;
                    const promptText = parentId === null
                        ? rootMenuIndex.startMessage
                        : getDisplayText(rootMenuIndex.nodesById.get(parentId));
                    await showMenuLevel(ctx, rootMenuIndex, parentId, promptText);
                    return;
                }

                const { node, invalidSoftInput } = resolveSelectedNode(rootMenuIndex, currentParentId, text);

                if (invalidSoftInput) {
                    await ctx.reply(INVALID_SOFT_MENU_INPUT_MESSAGE);
                    const promptText = currentParentId === null
                        ? rootMenuIndex.startMessage
                        : getDisplayText(rootMenuIndex.nodesById.get(currentParentId));
                    await showMenuLevel(ctx, rootMenuIndex, currentParentId, promptText);
                    return;
                }

                if (!node) return; // متن نامرتبط در سطح ریشه؛ نادیده گرفته می‌شود

                // دکمه‌ی ویژه: ایجاد ربات
                if (node.id === CREATE_BOT_NODE_ID) {
                    await handleCreateBotButton(ctx, chatId, fromId);
                    return;
                }

                // انتخاب یک ربات واقعی از سافت‌منوی «ربات‌های من»
                if (node.id.startsWith(BOT_NODE_ID_PREFIX)) {
                    const botRowId = Number(node.id.slice(BOT_NODE_ID_PREFIX.length));
                    const menuIndex = await getMenuIndexById(botRowId, fromId);
                    if (!menuIndex) {
                        await showRootMenu(ctx, chatId, fromId);
                        return;
                    }
                    userState.selectMenu(chatId, botRowId);
                    await showMenuLevel(ctx, menuIndex, null, menuIndex.startMessage);
                    return;
                }

                // دکمه‌ی معمولی دیگر از root_menu.json (مثلاً پرداخت/راهنما در آینده): فقط پیام دارد یا زیرمنوی استاتیک
                const hasMessage = typeof node.message === 'string' && node.message.length > 0;
                const hasChildren = Array.isArray(node.children) && node.children.length > 0;
                if (hasMessage) await ctx.reply(node.message);
                if (hasChildren) {
                    userState.pushLevel(chatId, node.id);
                    await showMenuLevel(ctx, rootMenuIndex, node.id, getDisplayText(node));
                }
                return;
            }

            // -------- حالت ۲: کاربر داخل یک منوی مشخص (bot_menus) است --------
            const menuIndex = await getMenuIndexById(state.selectedMenuRowId, fromId);
            if (!menuIndex) {
                // منو دیگر در دسترس نیست (مثلاً حذف شده) -> بازگشت به منوی ریشه
                await showRootMenu(ctx, chatId, fromId);
                return;
            }

            // دکمه بازگشت (در هر دو نوع سطح - دکمه‌ای یا سافت - همین یک متن است)
            if (text === menuIndex.backButtonText) {
                const stillInsideMenu = userState.popLevel(chatId);
                if (!stillInsideMenu) {
                    await showRootMenu(ctx, chatId, fromId);
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
