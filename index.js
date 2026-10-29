/**
 * Reel — кинематографичный коллаж к ответу модели, в своём окне.
 *
 * Клон Glintweaver под нано-банану: пост целиком уходит в банану по шаблону,
 * раскадровку на три панели она делает сама, без боковой модели. Рисует
 * через Наистеру или через локальную проксю в Gemini-формате. Полностью
 * независим от Frameweaver, Sideweaver и Glintweaver: свои настройки, свои
 * данные в свайпах, свои ключи — все рисуют одновременно и не ждут друг друга.
 *
 * Этап 1: клон, Наистера и локалка, шаблон «Кино-коллаж», рандом раскладок.
 */

const MODULE_NAME = 'reel';

// Ключ, под которым данные лежат в extra сообщения и свайпов.
const SWIPE_DATA_KEY = 'reel';

// Ключ в chatMetadata: настройки конкретного чата (авто-режим, внешность, рефы).
const CHAT_META_KEY = 'reel';

const DATA_VERSION = 1;

/**
 * Типы генерации, которые считаются настоящим ответом модели.
 * Всё остальное пропускаем: 'first_message' — таверна так подставляет
 * гритинг при входе в чат и при смене гритинга; 'command' — сообщения от
 * слэш-команд вроде /sendas; 'quiet' и 'impersonate' сообщений персонажа
 * не рисуют вообще. Подход и сам фильтр гритинга — из DS Comments.
 *
 * 'continue' здесь намеренно: пост после продолжения другой, коллаж
 * по обрывку был бы неполным. Убери строку, если не нравится.
 */
const CATCH_TYPES = new Set([
    'normal',
    'swipe',
    'regenerate',
    'continue',
    'group_chat',
]);

const TOAST_TITLE = 'Reel';

// Сколько символов поста отдаём банане. Режем с начала, оставляя финал сцены.
const MAX_POST_CHARS = 8000;

// Соотношения сторон, которые можно выбрать. Банана понимает их как есть.
const ASPECT_RATIOS = ['3:4', '2:3', '9:16'];
const ASPECT_LABELS = {
    '3:4': '3:4 — как на твоих скринах',
    '2:3': '2:3 — чуть вытянутее',
    '9:16': '9:16 — во весь экран телефона',
};

// Размер для локальной прокси (Gemini imageConfig.imageSize).
const IMAGE_SIZES = ['1K', '2K', '4K'];

// ═══════════════════════════════════════════════════════════════════════
// Встроенный шаблон
// ═══════════════════════════════════════════════════════════════════════
//
// Твой промпт почти дословно. Что поменяно:
// - банане сказано, где лежит пост (его дописывает расширение в конец);
// - добавлен блок CHARACTERS: внешность из панели персонажей и рефов;
// - «60% of canvas» у первой панели стало «самая большая панель»: проценты
//   теперь задаёт раскладка, и они не спорят друг с другом;
// - строчка «меняй раскладку каждый раз» заменена на {{layout}}: у бананы нет
//   памяти между генами, поэтому раскладку выбирает расширение;
// - субтитр: если пост не на английском, реплика переводится.

const CINEMA_COLLAGE_TEMPLATE = `FULL-BLEED CINEMATIC PHOTO COLLAGE: aesthetic, 35mm Kodak Ektachrome film, full-message chronological storytelling.
Visualize the ENTIRE latest roleplay message (given at the end, under LATEST ROLEPLAY MESSAGE)—from beginning to end—as a vertical full-screen composition with 3 photographic panels. All characters are real living adults with natural proportions and clear skin.

=== CHARACTERS ===
Use the CAST notes and any attached reference images as the exact appearance of each named character: face, hair color and style, eye color, skin tone, build, tattoos and distinctive features. Keep them identical in every panel.

=== FULL-MESSAGE CHRONOLOGY (DO NOT ONLY DRAW THE ENDING) ===
Read the WHOLE latest message from the first paragraph to the last. Never focus solely on the final lines. Map the 3 panels across the full timeline of the post:
Panel 1 (BEGINNING / CLIMAX ACTION, the largest panel): Capture the primary physical action, movement, or setting shift from the FIRST or MIDDLE paragraphs of the message. Show the main characters interacting in the environment.
Panel 2 (MID-MESSAGE TACTILE DETAIL): Macro close-up on a specific touch, gesture, or object interaction described in the middle of the text. Show real skin-on-skin pressure and warmth.
Panel 3 (FINAL BEAT & REACTION): Close-up on a character's face reacting to the final moment or spoken line at the end of the message.

=== SUBTLE ACTING & CONTINUITY ===
Subtle cinematic micro-expressions: soft half-smile, intense lingering gaze, parted lips, tense jaw. (Avoid exaggerated wide-open grins or stiff model poker-faces).
Strict continuity: Keep clothing, hairstyles, and accessories (like glasses) 100% consistent across all 3 panels. Correct two-arm human anatomy.
Action clarity: Strictly respect subject vs. object (who is touching/feeding whom).

=== FULL-BLEED LAYOUT ===
Fill 100% of the vertical canvas edge-to-edge with thin matte black borders (#0A0A0A) and ZERO white space.
Panel arrangement for this image: {{layout}}

=== BACKGROUND EXTRAS (NO NPC LOOK) ===
Background crowd is natural and uneven: irregular spacing, clusters and gaps, different heights and body angles. No symmetrical placement, no rows, no identical poses.
No extra looks at the camera. Their gazes go in different directions.
Extras are partially occluded by railings, columns, banisters or the main characters' bodies, so no one is shown fully frontal and fully visible.
Candid documentary feel, as if real people were caught mid-moment, not posed.

=== CINEMATIC SUBTITLES & COLOR ===
Subtitles: At the bottom, render ONE short key line of dialogue from the message in English (translate it naturally if the message is written in another language) using warm golden-yellow (#FFD54F) italicized serif font with a dark drop shadow. No guillemets (« »). If nobody speaks in the message, use its most striking short thought or line instead.
Camera & Grade: Shot on 35mm Kodak Ektachrome 100D, Panavision anamorphic lenses. Zero eye contact with camera. Warm golden-amber skin tones, soft halation around lights, deep velvety blacks with cool cyan-green shadow undertones, fine film grain.`;

// Раскладки панелей: «Название | текст для бананы», по одной на строку.
// Подставляются в шаблон вместо {{layout}}. Две одинаковые подряд не выпадают.
const DEFAULT_LAYOUTS = [
    'Широкие полосы | Three full-width horizontal widescreen strips stacked top to bottom: Panel 1 on top (about 45% of the height), Panel 2 in the middle (about 25%), Panel 3 at the bottom (about 30%).',
    'Герой сверху | Panel 1 spans the full width of the top 60% of the canvas; the bottom 40% is split vertically into two side-by-side panels: Panel 2 on the left, Panel 3 on the right.',
    'Вертикальный сплит | Panel 1 is a tall column on the left, about 60% of the width and the full height of the canvas; the right column is split horizontally into Panel 2 on top and Panel 3 below.',
    'Оверлей | Panel 1 fills the entire canvas edge to edge; Panel 2 and Panel 3 are smaller inset frames with thin #0A0A0A borders overlapping its lower part (Panel 2 lower left, Panel 3 lower right), never covering the faces in Panel 1.',
    'Диагональ | Panel 1 fills the top 55% of the canvas; a thin, slightly diagonal black gutter separates it from the bottom part, which holds Panel 2 on the left (narrower) and Panel 3 on the right (wider).',
].join('\n');

// Когда рандом раскладок выключен.
const FREE_LAYOUT_TEXT = 'Choose the panel arrangement that best fits this scene.';

const APPEARANCE_INSTRUCTION = `You write a short FIXED APPEARANCE note for an image model.

Using only the CHARACTER CARD and USER PERSONA below, describe the permanent physical appearance of the character named in TARGET in plain English, 2-4 sentences: sex, adult age, species, build and height, skin tone, face, hair color, length and style, eye color, and distinctive traits (scars, tattoos, piercings, horns, animal ears, tail, fins). Describe non-human anatomy exactly.

Do NOT include clothing, pose, expression, emotions, location or anything that changes between scenes.
If the character is a recognizable canonical character from an existing franchise, start with: Character Name (Franchise Title).
If the character is not described anywhere, output exactly: NONE

Output ONLY the description. No preamble, no explanation.`;

// Версия встроенных шаблонов. Растёт, когда меняется текст встроенных:
// у тебя настройки уже сохранены, и без этого остался бы старый текст.
const SEED_VERSION = 1;

// Встроенные, чей текст переписывается при обновлении. Остальные только
// добавляются, если их нет: твои правки в них не трогаются.
const UPDATED_BUILTIN_IDS = [];

// Встроенные шаблоны прошлых версий, которые убираются при обновлении.
const RETIRED_BUILTIN_IDS = [];

const DEFAULT_NAISTERA_ENDPOINT = 'https://naistera.org';
const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:8001';

const defaultSettings = Object.freeze({
    seedVersion: SEED_VERSION,
    enabled: true,
    // Профиль только для черновика внешности по карточке.
    // '' = текущее подключение таверны. Иначе id профиля из Connection Manager.
    profileId: '',
    activePresetId: 'cinema-collage',
    // Удалённые встроенные шаблоны не возвращаются при обновлении.
    removedBuiltIns: [],
    // Позиция и состояние окна. left/top = null — место по умолчанию.
    // promptOpen — раскрыт ли промпт под картинкой.
    // hidden — окно спрятано кнопкой вызова (авто при этом работает).
    window: { left: null, top: null, collapsed: false, promptOpen: false, hidden: false },

    // Кнопка вызова окна: 'bar' — в быстрых ответах, 'floating' — плавающая, 'both'.
    launcherMode: 'bar',
    // Место плавающей кнопки. null — по умолчанию.
    fabPosition: null,

    // Кто рисует: 'naistera' или 'local' (локальная прокся в Gemini-формате).
    provider: 'naistera',
    naisteraKey: '',
    naisteraEndpoint: DEFAULT_NAISTERA_ENDPOINT,
    naisteraModel: 'nano-banana-2',
    localKey: '',
    localEndpoint: DEFAULT_LOCAL_ENDPOINT,
    localModel: 'nano-banana-2.1',
    // Только для локалки: Наистера размер выбирает сама.
    imageSize: '1K',
    aspectRatio: '3:4',
    // Отправлять ли рефы персонажей.
    sendRefs: true,

    // Рандом раскладок панелей — основа шаблона, поэтому включён.
    randomLayout: true,
    layouts: DEFAULT_LAYOUTS,

    // Стили: { id, name, tags }. Активный — глобальный, '' = без стиля.
    styles: [],
    activeStyleId: '',

    // Картинки, дорисованные после ухода из чата: ждут возвращения в него.
    // { chatId, key, messageId, image }
    mailbox: [],
    debug: false,
    presets: [
        { id: 'cinema-collage', name: 'Кино-коллаж (Ektachrome)', builtIn: true, instruction: CINEMA_COLLAGE_TEMPLATE },
    ],
});

const getContext = () => SillyTavern.getContext();

// Состояние модуля.
const state = {
    chatId: null,
    // Растёт на каждой смене чата. Долгие операции запоминают эпоху на
    // старте и не пишут в чужой чат.
    epoch: 0,
    // Живые рисования: ключ свайпа → { controller, cancelReason, retrying }.
    // На смене чата не обрываются — дорисованное ждёт в почтовом ящике.
    drawJobs: new Map(),
    // Какое сообщение показывает окно.
    viewMessageId: null,
    // Открыта ли в окне панель персонажей.
    tagsOpen: false,
    // Правит ли промпт вручную. Пока да — окно не переключается.
    editing: false,
    // Куда сохранять правку: свайп, открытый в момент нажатия «Править».
    editTarget: null,
    // Номер прошлой раскладки: две одинаковые подряд не выпадают.
    lastLayoutIdx: -1,
    // Модели, которые отдал провайдер по кнопке 🔄: { naistera: [...], local: [...] }.
    catalogs: { naistera: [], local: [] },
    // Локальная прокся отвечает только под /compatible — запоминаем после 404.
    localCompatible: false,
    // Наистера не приняла reference_objects — шлём старым полем reference_images.
    naisteraLegacyRefs: false,
    // Список моделей Наистеры уже пробовали подтянуть сами.
    naisteraCatalogTried: false,
};

// ═══════════════════════════════════════════════════════════════════════
// Логи и настройки
// ═══════════════════════════════════════════════════════════════════════

function reelLog(level, ...args) {
    if (level === 'INFO' && !getSettings().debug) return;
    console.log(`[Reel][${level}]`, ...args);
}

/** Свободный id для шаблона (из борда). */
function reelUniquePresetId(presets, base = 'preset') {
    const slug = String(base).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'preset';
    let id = slug;
    let n = 2;
    while (presets.some(p => p.id === id)) id = `${slug}-${n++}`;
    return id;
}

function getSettings() {
    const context = getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = context.extensionSettings[MODULE_NAME];
    // Дозаполняем недостающие ключи после обновления расширения.
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    if (!settings.window || typeof settings.window !== 'object') {
        settings.window = structuredClone(defaultSettings.window);
    }
    if (!['naistera', 'local'].includes(settings.provider)) settings.provider = 'naistera';
    if (!ASPECT_RATIOS.includes(settings.aspectRatio)) settings.aspectRatio = defaultSettings.aspectRatio;
    if (!IMAGE_SIZES.includes(settings.imageSize)) settings.imageSize = defaultSettings.imageSize;
    if (typeof settings.layouts !== 'string') settings.layouts = DEFAULT_LAYOUTS;
    if (!Array.isArray(settings.styles)) settings.styles = [];
    if (!Array.isArray(settings.mailbox)) settings.mailbox = [];
    if (!Array.isArray(settings.presets) || settings.presets.length === 0) {
        settings.presets = structuredClone(defaultSettings.presets);
    }
    if (settings.seedVersion !== SEED_VERSION) {
        settings.presets = settings.presets.filter(p => !(p.builtIn && RETIRED_BUILTIN_IDS.includes(p.id)));
        const removed = Array.isArray(settings.removedBuiltIns) ? settings.removedBuiltIns : [];
        for (const seeded of defaultSettings.presets) {
            if (removed.includes(seeded.id)) continue;
            const index = settings.presets.findIndex(p => p.id === seeded.id);
            if (index === -1) settings.presets.push(structuredClone(seeded));
            else if (UPDATED_BUILTIN_IDS.includes(seeded.id)) settings.presets[index] = structuredClone(seeded);
        }
        // Был выбран ушедший встроенный — переключаем на новый встроенный.
        if (!settings.presets.some(p => p.id === settings.activePresetId)) {
            const fallback = settings.presets.find(p => p.id === 'cinema-collage') || settings.presets[0];
            settings.activePresetId = fallback?.id || 'cinema-collage';
        }
        settings.seedVersion = SEED_VERSION;
    }
    return settings;
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function getActivePreset() {
    const settings = getSettings();
    return settings.presets.find(p => p.id === settings.activePresetId) || settings.presets[0];
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// ═══════════════════════════════════════════════════════════════════════
// Настройки чата (chatMetadata)
// ═══════════════════════════════════════════════════════════════════════

function getCurrentChatId() {
    const context = getContext();
    return context.getCurrentChatId?.() ?? context.chatId ?? null;
}

function isGroupChat() {
    return !!getContext().groupId;
}

/** Объект настроек текущего чата или null, если чат не открыт (лендинг). */
function getChatState() {
    if (!getCurrentChatId()) return null;
    const meta = getContext().chatMetadata;
    if (!meta) return null;
    if (!meta[CHAT_META_KEY] || typeof meta[CHAT_META_KEY] !== 'object') {
        meta[CHAT_META_KEY] = { auto: false };
    }
    const chatState = meta[CHAT_META_KEY];
    if (!chatState.characters || typeof chatState.characters !== 'object') {
        chatState.characters = { char: '', user: '', extra: [] };
    }
    if (!Array.isArray(chatState.characters.extra)) chatState.characters.extra = [];
    // Рефы: { char|user|<id доп. персонажа>: { path, always } }.
    if (!chatState.refs || typeof chatState.refs !== 'object') chatState.refs = {};
    return chatState;
}

function isAutoOn() {
    return getChatState()?.auto === true;
}

async function saveChatState() {
    await getContext().saveMetadata();
}

async function setAuto(value) {
    const chatState = getChatState();
    if (!chatState) return false;
    chatState.auto = !!value;
    await saveChatState();
    reelLog('INFO', `Авто в чате ${getCurrentChatId()}: ${chatState.auto ? 'вкл' : 'выкл'}`);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════
// Хранилище в свайпе
// ═══════════════════════════════════════════════════════════════════════
//
// Как таверна хранит свайпы: у активного свайпа данные живут в message.extra,
// а в swipe_info[i].extra лежит копия. При уходе со свайпа таверна копирует
// message.extra в swipe_info (syncMesToSwipe), при приходе — обратно
// (syncSwipeToMes). Поэтому писать только в swipe_info нельзя: первый же
// свайп перетрёт это содержимым message.extra.
//
// Вторая ловушка: при генерации нового свайпа таверна чистит в extra только
// свои известные ключи, и наши данные переезжают в новый свайп «по
// наследству». Поэтому каждая запись помечена ключом свайпа — его send_date
// (так же свайпы опознаёт DS Comments), и запись с чужим ключом считается
// пустой.

/** send_date свайпа — его отпечаток. */
function getSwipeKey(message, swipeIdx) {
    if (!message) return null;
    const currentIdx = typeof message.swipe_id === 'number' ? message.swipe_id : 0;
    if (swipeIdx === currentIdx) return message.send_date ?? null;
    return message.swipe_info?.[swipeIdx]?.send_date ?? null;
}

function getCurrentSwipeIdx(message) {
    return typeof message?.swipe_id === 'number' ? message.swipe_id : 0;
}

/**
 * Данные Reel для свайпа или null. Унаследованные от другого свайпа
 * (с чужим ключом) тоже дают null.
 */
function readSwipeData(message, swipeIdx = getCurrentSwipeIdx(message)) {
    if (!message) return null;
    const isCurrent = swipeIdx === getCurrentSwipeIdx(message);
    const extra = isCurrent ? message.extra : message.swipe_info?.[swipeIdx]?.extra;
    const data = extra?.[SWIPE_DATA_KEY];
    if (!data || typeof data !== 'object') return null;
    const key = getSwipeKey(message, swipeIdx);
    if (!key || data.key !== key) return null;
    return data;
}

/**
 * Ищет свайп по ключу. Начинает с подсказанного номера сообщения и идёт
 * в обе стороны: если за время генерации удалили сообщение выше, номер
 * сдвинется, а ключ останется.
 *
 * @returns {{ messageId: number, swipeIdx: number } | null}
 */
function findSwipeByKey(key, hintMessageId = null) {
    if (!key) return null;
    const chat = getContext().chat || [];
    const order = [];
    const hint = Number.isInteger(hintMessageId) ? hintMessageId : chat.length - 1;
    for (let offset = 0; offset < chat.length; offset++) {
        const down = hint - offset;
        const up = hint + offset;
        if (down >= 0 && down < chat.length) order.push(down);
        if (offset > 0 && up >= 0 && up < chat.length) order.push(up);
    }
    for (const messageId of order) {
        const message = chat[messageId];
        if (!message || message.is_user || message.is_system) continue;
        const swipeCount = Array.isArray(message.swipes) ? message.swipes.length : 1;
        for (let swipeIdx = 0; swipeIdx < swipeCount; swipeIdx++) {
            if (getSwipeKey(message, swipeIdx) === key) return { messageId, swipeIdx };
        }
    }
    return null;
}

/**
 * Дописывает поля в данные свайпа и сохраняет чат.
 * target — то, что запомнили на старте: { chatId, key, messageId }.
 *
 * @returns {Promise<'ok' | 'chat-gone' | 'swipe-gone'>}
 */
async function writeSwipeData(target, patch) {
    if (getCurrentChatId() !== target.chatId) return 'chat-gone';
    const found = findSwipeByKey(target.key, target.messageId);
    if (!found) return 'swipe-gone';

    const context = getContext();
    const message = context.chat[found.messageId];
    const previous = readSwipeData(message, found.swipeIdx) || {};
    const data = { ...previous, ...patch, v: DATA_VERSION, key: target.key };

    const isCurrent = found.swipeIdx === getCurrentSwipeIdx(message);
    if (isCurrent) {
        if (!message.extra || typeof message.extra !== 'object') message.extra = {};
        message.extra[SWIPE_DATA_KEY] = data;
    }
    const info = message.swipe_info?.[found.swipeIdx];
    if (info && typeof info === 'object') {
        if (!info.extra || typeof info.extra !== 'object') info.extra = {};
        info.extra[SWIPE_DATA_KEY] = structuredClone(data);
    }

    await context.saveChat();
    reelLog('INFO', `Записано в #${found.messageId}[${found.swipeIdx}]:`, data);
    renderWindow();
    return 'ok';
}

/** Цель для записи: текущий свайп сообщения. */
function makeTarget(messageId) {
    const message = getContext().chat?.[messageId];
    if (!message) return null;
    const key = getSwipeKey(message, getCurrentSwipeIdx(message));
    if (!key) return null;
    return { chatId: getCurrentChatId(), key, messageId };
}

// ═══════════════════════════════════════════════════════════════════════
// Текст поста (портировано из Сториборда)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Превращает сырой текст сообщения в чистую прозу: выкидывает блоки
 * с картинками, остатки тегов генерации и всю разметку. Разбор через
 * DOMParser, а не регулярками: блоки вложенные, и регулярка рано или
 * поздно срежет половину поста.
 */
function cleanMessageText(raw, maxChars) {
    let text = String(raw || '');
    if (!text.trim()) return '';

    try {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        for (const el of doc.querySelectorAll('img, video')) {
            const wrapper = el.closest('div');
            (wrapper && wrapper.parentElement ? wrapper : el).remove();
        }
        for (const br of doc.querySelectorAll('br')) br.replaceWith('\n');
        for (const block of doc.querySelectorAll('p, div, li, h1, h2, h3, h4, blockquote')) {
            block.append('\n');
        }
        text = doc.body.textContent || '';
    } catch (error) {
        reelLog('WARN', 'DOMParser не справился, чищу регулярками:', error?.message);
        text = text.replace(/<[^>]+>/g, ' ');
    }

    text = text
        .replace(/\[(?:IMG|VID):[^\]]*\]/gi, ' ')
        .replace(/\[IMG:[✓✔][^\]]*\]/gi, ' ')
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (text.length > maxChars) {
        text = text.slice(-maxChars);
        const cut = text.indexOf('\n');
        if (cut > 0 && cut < 300) text = text.slice(cut + 1);
    }
    return text;
}

/** Сырой текст конкретного свайпа: у текущего он в mes, у остальных — в swipes. */
function getSwipeText(message, swipeIdx) {
    if (!message) return '';
    if (swipeIdx === getCurrentSwipeIdx(message)) return String(message.mes ?? '');
    const fromSwipes = Array.isArray(message.swipes) ? message.swipes[swipeIdx] : null;
    return String(fromSwipes ?? message.mes ?? '');
}

/** Описание карточки персонажа. В группе собираем всех участников. */
function getCharacterCard() {
    const context = getContext();
    const parts = [];
    const describe = (character) => {
        if (!character) return;
        const chunks = [character.description, character.personality]
            .map(s => String(s || '').trim())
            .filter(Boolean);
        if (chunks.length) parts.push(`${character.name}:\n${chunks.join('\n')}`);
    };

    if (context.groupId) {
        const group = (context.groups || []).find(g => g.id === context.groupId);
        for (const member of (group?.members || [])) {
            describe((context.characters || []).find(c => c.avatar === member));
        }
    } else if (context.characterId !== undefined && context.characterId !== null) {
        describe(context.characters?.[context.characterId]);
    }
    return parts.join('\n\n');
}

function getPersona() {
    return String(getContext().powerUserSettings?.persona_description || '').trim();
}

function substitute(text) {
    try { return getContext().substituteParams(text); } catch (_) { return text; }
}

/** Первое имя из поля «Вейн, Veyne» — им персонаж и подписывается для бананы. */
function displayName(name) {
    return String(name || '').split(',')[0].trim();
}

// ═══════════════════════════════════════════════════════════════════════
// Сборка промпта для бананы
// ═══════════════════════════════════════════════════════════════════════
//
// Боковой модели нет: банана сама читает пост и раскладывает его на панели.
// Расширение только собирает текст: шаблон с подставленной раскладкой,
// внешность героев (CAST), пожелание и сам пост.

/**
 * Строки «Имя: внешность» для CAST. Главный персонаж и ты — всегда, если
 * внешность заполнена. Дополнительные — только если их имя есть в посте
 * (или в пожелании) или у их рефа стоит «Всегда отправлять»: иначе банана
 * дорисует в кадр того, кого в сцене нет.
 */
function getCastLines(shotText) {
    const chatState = getChatState();
    if (!chatState) return [];
    const context = getContext();
    const chars = chatState.characters;
    const lines = [];
    const push = (name, notes) => {
        const n = displayName(name);
        const t = String(notes || '').trim();
        if (n && t) lines.push(`- ${n}: ${t}`);
    };
    if (!isGroupChat()) push(context.name2, chars.char);
    push(context.name1, chars.user);
    for (const extra of chars.extra) {
        const inShot = nameMatchesText(extra.name, shotText) || !!chatState.refs[extra.id]?.always;
        if (inShot) push(extra.name, extra.tags);
    }
    return lines;
}

/** «Название | текст» по строкам → [{ name, text }]. Без «|» вся строка — текст. */
function parseLayouts(raw) {
    return String(raw || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map((line, i) => {
            const bar = line.indexOf('|');
            const name = bar > 0 ? line.slice(0, bar).trim() : '';
            const text = (bar > 0 ? line.slice(bar + 1) : line).trim();
            return text ? { name: name || `Раскладка ${i + 1}`, text } : null;
        })
        .filter(Boolean);
}

/** Случайная раскладка, не та же, что в прошлый раз. null — рандом выключен или список пуст. */
function pickLayout() {
    const settings = getSettings();
    if (!settings.randomLayout) return null;
    const layouts = parseLayouts(settings.layouts);
    if (!layouts.length) return null;
    let pool = layouts.map((_, i) => i);
    if (pool.length > 1) pool = pool.filter(i => i !== state.lastLayoutIdx);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    state.lastLayoutIdx = idx;
    return layouts[idx];
}

const LAYOUT_MACRO_RE = /\{\{layout\}\}/gi;

/**
 * Итоговый текст для бананы. {{layout}} подставляем до макросов таверны:
 * незнакомые макросы новая таверна может вырезать.
 */
function buildFinalPrompt(template, layout, cast, wish, post) {
    const layoutText = layout ? layout.text : FREE_LAYOUT_TEXT;
    const text = substitute(String(template || '').replace(LAYOUT_MACRO_RE, () => layoutText)).trim();
    const sections = [];
    if (text) sections.push(text);
    if (cast.length) sections.push(`=== CAST ===\n${cast.join('\n')}`);
    if (wish) {
        sections.push(`=== DIRECTOR'S NOTE (highest priority for framing, poses and expressions; never overrides character appearance) ===\n${wish}`);
    }
    sections.push(`=== LATEST ROLEPLAY MESSAGE ===\n${post}`);
    return sections.join('\n\n');
}

/**
 * Собирает промпт для текущего свайпа и сразу отправляет его рисоваться.
 * Каждая сборка — новая раскладка, свежий текст поста и внешность из панели.
 */
async function runAssemble(messageId, { wish = '' } = {}) {
    wish = String(wish || '').trim();
    const target = makeTarget(messageId);
    if (!target) {
        reelLog('WARN', `#${messageId}: не нашла свайп, пропуск`);
        return;
    }
    const message = getContext().chat?.[messageId];
    const post = substitute(cleanMessageText(message?.mes, MAX_POST_CHARS));
    if (!post) {
        toastr.warning('Пост пустой — снимать нечего', TOAST_TITLE, { timeOut: 3000 });
        return;
    }

    const preset = getActivePreset();
    const template = String(preset?.instruction || '');
    const layoutUsed = /\{\{layout\}\}/i.test(template);
    const layout = layoutUsed ? pickLayout() : null;
    const cast = getCastLines(`${post}\n${wish}`);
    const prompt = buildFinalPrompt(template, layout, cast, wish, post);

    // Во время ручной правки окно не перескакивает на новый пост.
    if (!state.editing) state.viewMessageId = messageId;
    reelLog('INFO', `#${messageId}: собран промпт, шаблон «${preset?.name}», раскладка «${layout?.name || 'на выбор бананы'}»`, prompt);

    const result = await writeSwipeData(target, {
        status: 'prompt',
        prompt,
        presetName: preset?.name || '',
        layoutName: layout?.name || '',
        promptAt: Date.now(),
        wish,
        edited: false,
        error: null,
    });
    if (result === 'ok') runDraw(target);
}

/** Смена чата: рисования не обрываются — дорисованное доедет в почтовый ящик. */
function abortAllJobs() {
    /* сборка мгновенная, обрывать нечего */
}

// ═══════════════════════════════════════════════════════════════════════
// Черновик внешности по карточке (боковая модель — только здесь)
// ═══════════════════════════════════════════════════════════════════════

const HELPER_MAX_TOKENS = 2000;

/** Служебный запрос выбранным профилем или текущим подключением таверны. */
async function requestModel(instruction, contextText) {
    const context = getContext();
    const settings = getSettings();

    if (settings.profileId) {
        const messages = [
            { role: 'system', content: instruction },
            { role: 'user', content: contextText },
        ];
        // includePreset: false — ролевой пресет профиля притащил бы в
        // служебный запрос свой системный промпт и джейлбрейк.
        // Служебным запросам интернет не нужен: без этого Claude при включённом
        // где-то поиске может уйти гуглить и вернуть пустой ответ (tool_use).
        const result = await context.ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            HELPER_MAX_TOKENS,
            { includePreset: false, extractData: true },
            { enable_web_search: false, reasoning_effort: 'min' },
        );
        return String(result?.content ?? result ?? '');
    }

    const raw = await context.generateRaw({
        prompt: [{ role: 'user', content: contextText }],
        systemPrompt: instruction,
        responseLength: HELPER_MAX_TOKENS,
    });
    return typeof raw === 'string' ? raw : String(raw?.content || raw?.text || raw || '');
}

/** Срезает рассуждения, обёртку ``` и вступление модели («Okay, here is…»). */
function stripPreamble(text) {
    let out = String(text || '').trim();
    out = out.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
    out = out.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
    const preamble = /^(Okay|Alright|Sure|Here(?:'s| is)|Certainly|Of course|I'll|Let me|Understood)\b[^\n]*[:\n]/i;
    if (preamble.test(out)) {
        const paragraphs = out.split(/\n{2,}/);
        if (paragraphs.length > 1) out = paragraphs.slice(1).join('\n\n').trim();
        else out = out.replace(preamble, '').trim();
    }
    return out;
}

/** Чистит прозу: лишние пробелы и пустые строки, абзацы оставляет. */
function cleanProse(text) {
    return String(text || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t\u00a0]+$/g, '').replace(/^[ \t\u00a0]+/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Схлопывает в одну строку и снимает обрамляющие кавычки. */
function flattenLine(text) {
    let out = String(text || '')
        .replace(/[\r\n\u2028\u2029\u0085\v\f]+/g, ' ')
        .replace(/[ \t\u00a0]{2,}/g, ' ')
        .trim();
    out = out.replace(/^["'`*_]+|["'`*_]+$/g, '').trim();
    return out;
}

// Начало ответа, по которому видно отказ модели.
const REFUSAL_RE = /^[\s"'*_]*(I['’]?m sorry|I am sorry|Sorry\b|I apologi[sz]e|I can(?:not|['’]?t)\b|I won['’]?t\b|I will not\b|I['’]?m (?:not able|unable)|I am (?:not able|unable)|As an AI\b|Unfortunately\b|I must decline|I['’]?m not comfortable)/i;

function looksLikeRefusal(text) {
    return REFUSAL_RE.test(String(text || ''));
}

async function suggestTags(name) {
    const context = getContext();
    const card = substitute(getCharacterCard());
    const persona = substitute(getPersona());
    const sections = [];
    if (card) sections.push(`CHARACTER CARD:\n${card}`);
    if (persona) sections.push(`USER PERSONA (${context.name1}):\n${persona}`);
    sections.push(`TARGET: ${name}`);

    const raw = await requestModel(APPEARANCE_INSTRUCTION, sections.join('\n\n'));
    const text = stripPreamble(raw);
    if (looksLikeRefusal(text)) return { tags: '', refused: true };
    const tags = flattenLine(text);
    if (!tags || /^NONE\b/i.test(tags)) return { tags: '', refused: false };
    return { tags, refused: false };
}
// ═══════════════════════════════════════════════════════════════════════
// Банана: Наистера и локальная прокся (портировано из Frameweaver)
// ═══════════════════════════════════════════════════════════════════════

// Банана бывает долгой, особенно на трёх панелях — ждём до 5 минут.
const DRAW_TIMEOUT_MS = 300000;
const CATALOG_TIMEOUT_MS = 30000;
// Паузы перед повторами на 429 и 502/503/504. 500 не повторяем: это обычно
// ошибка в самом запросе, повтор ничего не даст.
const DRAW_RETRY_DELAYS = [5000, 15000, 30000];

// Та же приписка, что у Frameweaver: с ней банана уже проверена.
const REF_PROMPT_INSTRUCTION = '[CRITICAL: The reference image(s) attached show the EXACT appearance of the character(s). You MUST precisely copy their: face structure, eye color, hair color and style, skin tone, body type, clothing, and all distinctive features. Do not deviate from the reference appearances.]';

const PROVIDER_LABELS = { naistera: 'Наистера', local: 'локалка' };

function withRefInstruction(prompt, refCount) {
    return refCount > 0 ? `${REF_PROMPT_INSTRUCTION}\n\n${prompt}` : prompt;
}

/** Базовый адрес Наистеры без /api/generate и хвостовых слэшей. */
function getNaisteraBase() {
    const raw = String(getSettings().naisteraEndpoint || '').trim().replace(/\/+$/, '');
    return (raw || DEFAULT_NAISTERA_ENDPOINT).replace(/\/api\/(?:generate|models)$/i, '');
}

/** Базовый адрес локалки без /v1beta/models… и хвостовых слэшей. */
function getLocalBase() {
    const raw = String(getSettings().localEndpoint || '').trim().replace(/\/+$/, '');
    return (raw || DEFAULT_LOCAL_ENDPOINT)
        .replace(/\/v1beta\/models(?:\/[^?]*)?$/i, '')
        .replace(/\/v1(?:beta)?$/i, '');
}

/** Модель в путь URL: слэши провайдера сохраняем, обход пути запрещаем. */
function encodeModelForPath(model) {
    const segments = String(model || '').split('/');
    if (segments.some(s => s === '' || s === '.' || s === '..')) {
        throw new Error(`Invalid model id for URL path: ${model}`);
    }
    return segments.map(encodeURIComponent).join('/');
}

function endpointHasCompatiblePrefix(base) {
    try {
        return /(^|\/)compatible(\/|$)/i.test(new URL(base, window.location.href).pathname);
    } catch (_) {
        return true;
    }
}

/** Гугловский нативный API хочет x-goog-api-key; прокси и агрегаторы — Bearer. */
function endpointNeedsGoogleHeader(base) {
    try {
        return new URL(base, window.location.href).hostname.toLowerCase().endsWith('googleapis.com');
    } catch (_) {
        return false;
    }
}

function getLocalHeaders(withJson = true) {
    const key = String(getSettings().localKey || '').trim();
    const headers = withJson ? { 'Content-Type': 'application/json' } : {};
    if (key) {
        headers.Authorization = `Bearer ${key}`;
        if (endpointNeedsGoogleHeader(getLocalBase())) headers['x-goog-api-key'] = key;
    }
    return headers;
}

/** Пробелы, дефисы и регистр — единственное, чем «nano banana 2» отличается от «nano-banana-2». */
function squashModelId(value) {
    return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}

function isRetryableStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
}

function httpError(status, text) {
    const error = new Error(`API Error (${status})${text ? `: ${String(text).slice(0, 400)}` : ''}`);
    error.status = status;
    return error;
}

/** fetch с таймаутом, который уважает и твою отмену. */
async function timedFetch(url, init, signal, timeoutMs = DRAW_TIMEOUT_MS) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        return await fetch(url, { ...init, signal: timeout.signal });
    } catch (error) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (timeout.signal.aborted) throw new Error(`no response within ${Math.round(timeoutMs / 60000) || 1} min (${new URL(url, window.location.href).origin})`);
        throw new Error(`Network/CORS error: ${error?.message || 'Failed to fetch'} (${new URL(url, window.location.href).origin})`);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

// ─── Списки моделей ──────────────────────────────────────────────────────

/** Модели провайдера. Для Наистеры — только бананы, если они в списке есть. */
async function fetchCatalog(provider) {
    const settings = getSettings();
    if (provider === 'naistera') {
        const key = String(settings.naisteraKey || '').trim();
        const headers = { Accept: 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        const response = await timedFetch(`${getNaisteraBase()}/api/models`, { method: 'GET', headers }, null, CATALOG_TIMEOUT_MS);
        if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
        const payload = await response.json();
        const ids = (Array.isArray(payload?.models) ? payload.models : [])
            .filter(m => m?.id && m.visible !== false && m.deprecated !== true)
            .map(m => String(m.id));
        const bananas = ids.filter(id => /banana/i.test(id));
        return bananas.length ? bananas : ids;
    }

    const base = getLocalBase();
    const urls = [`${base}/v1beta/models`, `${base}/v1/models`];
    if (!endpointHasCompatiblePrefix(base)) urls.push(`${base}/compatible/v1/models`);
    let lastError = null;
    for (const url of urls) {
        try {
            const response = await timedFetch(url, { method: 'GET', headers: getLocalHeaders(false) }, null, CATALOG_TIMEOUT_MS);
            if (!response.ok) { lastError = httpError(response.status, ''); continue; }
            const data = await response.json();
            let ids = [];
            if (Array.isArray(data?.data)) ids = data.data.map(m => m?.id).filter(Boolean);
            else if (Array.isArray(data?.models)) {
                ids = data.models.map(m => {
                    const n = String(m?.name || m?.id || '');
                    return n.startsWith('models/') ? n.slice('models/'.length) : n;
                }).filter(Boolean);
            }
            if (ids.length) return ids;
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError) throw lastError;
    return [];
}

/** Имя модели Наистеры, которое сервер примет: сверяем со списком, если он есть. */
async function resolveNaisteraModel() {
    const settings = getSettings();
    const saved = String(settings.naisteraModel || '').trim() || defaultSettings.naisteraModel;
    if (!state.catalogs.naistera.length && !state.naisteraCatalogTried) {
        state.naisteraCatalogTried = true;
        try {
            state.catalogs.naistera = await fetchCatalog('naistera');
            refreshModelDatalists();
        } catch (error) {
            reelLog('WARN', 'Список моделей Наистеры не загрузился:', error?.message);
        }
    }
    const catalog = state.catalogs.naistera;
    if (!catalog.length || catalog.includes(saved)) return saved;
    return catalog.find(id => squashModelId(id) === squashModelId(saved)) || saved;
}

// ─── Наистера ────────────────────────────────────────────────────────────

/** refs: [{ name, dataUrl }]. Возвращает data URL картинки. */
async function requestNaistera(prompt, refs, signal) {
    const settings = getSettings();
    const url = `${getNaisteraBase()}/api/generate`;
    const model = await resolveNaisteraModel();
    const body = {
        prompt: withRefInstruction(prompt, refs.length),
        aspect_ratio: settings.aspectRatio,
        model,
    };
    const setRefs = () => {
        delete body.reference_objects;
        delete body.reference_images;
        if (!refs.length) return;
        if (state.naisteraLegacyRefs) body.reference_images = refs.map(r => r.dataUrl);
        else body.reference_objects = refs.map(r => ({ image: r.dataUrl, description: r.name }));
    };
    setRefs();

    const post = () => timedFetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${String(settings.naisteraKey || '').trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    }, signal);

    reelLog('INFO', `Наистера: ${model}, ${body.aspect_ratio}, рефов ${refs.length}, промпт ${body.prompt.length} симв.`);
    let response = await post();
    let errorText = response.ok ? '' : await response.text().catch(() => '');

    // Старые сборки Наистеры знают только reference_images.
    if (!response.ok && response.status === 400 && body.reference_objects && /\breference_objects\b/i.test(errorText)) {
        state.naisteraLegacyRefs = true;
        setRefs();
        response = await post();
        errorText = response.ok ? '' : await response.text().catch(() => '');
    }
    if (!response.ok) throw httpError(response.status, errorText);

    const result = await response.json();
    if (!result?.data_url) throw new Error('No data_url in Naistera response');
    return result.data_url;
}

// ─── Локальная прокся (Gemini generateContent) ───────────────────────────

function splitDataUrl(src) {
    const m = String(src || '').match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (m) return { mime: m[1], b64: m[2] };
    return { mime: 'image/png', b64: String(src || '') };
}

function buildGeminiBody(prompt, refs, omitImageConfig) {
    const settings = getSettings();
    const parts = [];
    for (const ref of refs) {
        const { mime, b64 } = splitDataUrl(ref.dataUrl);
        parts.push({ inlineData: { mimeType: mime, data: b64 } });
    }
    parts.push({ text: withRefInstruction(prompt, refs.length) });
    const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
    if (!omitImageConfig) generationConfig.imageConfig = { aspectRatio: settings.aspectRatio, imageSize: settings.imageSize };
    return { contents: [{ role: 'user', parts }], generationConfig };
}

/** Пустой конверт ({candidates: null, 0 токенов}) — тихий отказ ещё до генерации. */
function isEmptyEnvelope(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.error || r.promptFeedback || r.prompt_feedback) return false;
    if (Array.isArray(r.candidates) && r.candidates.length > 0) return false;
    if (Array.isArray(r.data) && r.data.length > 0) return false;
    const um = r.usageMetadata || r.usage_metadata;
    const zeroTokens = um && (um.promptTokenCount === 0 || um.prompt_token_count === 0);
    return !!(zeroTokens && (r.candidates === null || r.candidates === undefined));
}

/** Достаёт картинку из ответа или бросает понятную ошибку. */
function parseGeminiImage(result) {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    for (const part of (candidates[0]?.content?.parts || [])) {
        if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
    }
    const d0 = Array.isArray(result?.data) ? result.data[0] : null;
    if (d0?.b64_json) return `data:image/png;base64,${d0.b64_json}`;
    if (d0?.url) return d0.url;

    if (result?.error && (result.error.message || result.error.code || result.error.status)) {
        const error = new Error(`Provider error: ${result.error.message || 'unspecified'} (code=${result.error.code ?? result.error.status ?? 'n/a'})`);
        if (typeof result.error.code === 'number') error.status = result.error.code;
        throw error;
    }
    const pf = result?.promptFeedback || result?.prompt_feedback;
    if (pf && (pf.blockReason || pf.block_reason)) {
        const detail = pf.blockReasonMessage || pf.block_reason_message || '';
        throw new Error(`Blocked by safety filter (prompt): ${pf.blockReason || pf.block_reason}${detail ? ` — ${detail}` : ''}`);
    }
    if (candidates.length) {
        const fr = candidates[0].finishReason || candidates[0].finish_reason;
        if (fr && /^(IMAGE_SAFETY|SAFETY|PROHIBITED_CONTENT|RECITATION|BLOCKLIST|SPII|IMAGE_PROHIBITED_CONTENT|IMAGE_OTHER)$/i.test(fr)) {
            throw new Error(`Blocked by safety filter (image): ${fr}`);
        }
        if (fr) throw new Error(`Generation stopped without image: finishReason=${fr}`);
    }
    reelLog('WARN', 'Ответ локалки без картинки:', result);
    throw new Error('No image in provider response');
}

async function requestLocal(prompt, refs, signal) {
    const settings = getSettings();
    const base = getLocalBase();
    const model = String(settings.localModel || '').trim();
    const suffix = `/v1beta/models/${encodeModelForPath(model)}:generateContent`;
    const canProbe = !endpointHasCompatiblePrefix(base);
    let url = canProbe && state.localCompatible ? `${base}/compatible${suffix}` : `${base}${suffix}`;

    let currentRefs = refs;
    let omitImageConfig = false;
    const post = () => timedFetch(url, {
        method: 'POST',
        headers: getLocalHeaders(),
        body: JSON.stringify(buildGeminiBody(prompt, currentRefs, omitImageConfig)),
    }, signal);

    reelLog('INFO', `Локалка: ${model}, ${settings.aspectRatio}, ${settings.imageSize}, рефов ${refs.length}, ${url}`);
    let response = await post();

    // Некоторые прокси отвечают только под /compatible: пробуем один раз и запоминаем.
    if (!response.ok && response.status === 404 && canProbe && !state.localCompatible) {
        const firstText = await response.text().catch(() => '');
        url = `${base}/compatible${suffix}`;
        const probe = await post();
        if (!probe.ok) throw httpError(404, firstText);
        state.localCompatible = true;
        response = probe;
    }
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
    let result = await response.json();

    // Пустой конверт: сначала без imageConfig, потом без рефов — как во Frameweaver.
    if (isEmptyEnvelope(result)) {
        reelLog('WARN', 'Локалка вернула пустой конверт, повтор без imageConfig');
        omitImageConfig = true;
        response = await post();
        if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
        result = await response.json();
        if (isEmptyEnvelope(result) && currentRefs.length) {
            reelLog('WARN', 'Снова пустой конверт, повтор без рефов');
            toastr.warning('Банана не приняла рефы — снимаю без них', TOAST_TITLE, { timeOut: 4000 });
            currentRefs = [];
            response = await post();
            if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
            result = await response.json();
        }
        if (isEmptyEnvelope(result)) throw new Error('Provider returned an empty envelope. Check model access on the proxy.');
    }
    return parseGeminiImage(result);
}

// ─── Стиль ───────────────────────────────────────────────────────────────

function getActiveStyle() {
    const settings = getSettings();
    if (!settings.activeStyleId) return null;
    return settings.styles.find(s => s.id === settings.activeStyleId) || null;
}

/** Стиль — отдельным абзацем в начало промпта. */
function composeFinalPrompt(prompt, style) {
    const styleText = String(style?.tags || '').trim();
    const body = String(prompt || '').trim();
    return styleText ? `${styleText}\n\n${body}` : body;
}

// ─── Файлы ───────────────────────────────────────────────────────────────

async function toDataUrl(image, signal) {
    if (/^data:image\//i.test(image)) return image;
    const response = await fetch(image, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`не скачалась картинка (${response.status})`);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('не прочиталась картинка'));
        reader.readAsDataURL(blob);
    });
}

/** Папка на сервере: имя персонажа (в группе — группы), без опасных символов. */
function getUploadFolderName() {
    const context = getContext();
    let name = '';
    if (context.groupId) {
        name = (context.groups || []).find(g => g.id === context.groupId)?.name || '';
    } else if (context.characterId !== undefined && context.characterId !== null) {
        name = context.characters?.[context.characterId]?.name || '';
    }
    name = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 64);
    return name || 'reel';
}

/** Сохраняет картинку через таверну в /user/images/<папка>/. */
async function uploadImage(dataUrl, folder, prefix = 'reel') {
    const match = String(dataUrl).match(/^data:image\/([\w+.-]+);base64,(.+)$/);
    if (!match) throw new Error('картинка пришла в странном формате');
    const format = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}_${Math.random().toString(36).slice(2, 6)}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({ image: match[2], format, ch_name: folder, filename }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || `сохранение не удалось (${response.status})`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('таверна не вернула путь к файлу');
    return result.path;
}

// ─── Рефы ────────────────────────────────────────────────────────────────

// Больше четырёх — путаница и слоп.
const MAX_REFS = 4;
// Папка для рефов на сервере (/user/images/reel_refs/).
const REF_FOLDER = 'reel_refs';

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Имя целым словом в тексте, без учёта регистра. Через запятую — варианты имени. */
function nameMatchesText(nameField, text) {
    if (!nameField || !text) return false;
    for (const alias of String(nameField).split(',').map(a => a.trim()).filter(Boolean)) {
        const words = alias.split(/\s+/).filter(Boolean).map(escapeRegExp);
        if (!words.length) continue;
        const pattern = `(?<![\\p{L}\\p{M}\\p{N}_])${words.join('\\s+')}(?![\\p{L}\\p{M}\\p{N}_])`;
        if (new RegExp(pattern, 'iu').test(text)) return true;
    }
    return false;
}

/** Все персонажи чата с рефами: { key, name, path, always } в порядке панели. */
function getRefEntries() {
    const chatState = getChatState();
    if (!chatState) return [];
    const context = getContext();
    const out = [];
    const push = (key, name) => {
        const ref = chatState.refs[key];
        if (ref?.path) out.push({ key, name: String(name || '').trim(), path: ref.path, always: !!ref.always });
    };
    if (!isGroupChat()) push('char', context.name2);
    push('user', context.name1);
    for (const extra of chatState.characters.extra) push(extra.id, extra.name);
    return out;
}

/**
 * Какие рефы уходят: «всегда» и те, чьё имя есть в посте или пожелании.
 * Ищем не в промпте: там CAST перечисляет всех, и рефы уходили бы всегда.
 */
function pickRefsForShot(shotText) {
    return getRefEntries()
        .filter(entry => entry.always || nameMatchesText(entry.name, shotText))
        .slice(0, MAX_REFS);
}

/** Файл рефа с сервера таверны → data URL. */
async function loadRefDataUrl(path, signal) {
    const response = await fetch(path, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('не прочитался файл'));
        reader.readAsDataURL(blob);
    });
}

/** Сохраняет картинку рефа на сервер, возвращает путь. */
async function saveRefImage(dataUrl) {
    return await uploadImage(dataUrl, REF_FOLDER, 'reel_ref');
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('не прочитался файл'));
        reader.readAsDataURL(file);
    });
}

// ─── Рисование ───────────────────────────────────────────────────────────

/** Чего не хватает в настройках для рисования, или пусто. */
function getMissingDrawSetting() {
    const settings = getSettings();
    if (settings.provider === 'local') {
        if (!String(settings.localModel || '').trim()) return 'Не задана модель локалки';
        return '';
    }
    if (!String(settings.naisteraKey || '').trim()) return 'Не задан ключ Наистеры';
    return '';
}

/**
 * Рисует коллаж по промпту свайпа. Повторный запуск для того же свайпа
 * отменяет прошлый. При смене чата не обрывается: файл сохраняется, а ссылка
 * ждёт в почтовом ящике, пока ты не вернёшься в этот чат.
 */
async function runDraw(target) {
    if (!target) return;
    const settings = getSettings();
    const missing = getMissingDrawSetting();
    if (missing) {
        toastr.warning(`${missing} — загляни в настройки Reel`, TOAST_TITLE, { timeOut: 4000 });
        return;
    }

    const found = findSwipeByKey(target.key, target.messageId);
    const message = found ? getContext().chat[found.messageId] : null;
    const data = message ? readSwipeData(message, found.swipeIdx) : null;
    if (!data?.prompt) {
        toastr.warning('Сначала нужен промпт — жми 🎬', TOAST_TITLE, { timeOut: 3000 });
        return;
    }

    const previous = state.drawJobs.get(target.key);
    if (previous) {
        previous.cancelReason = 'superseded';
        previous.controller.abort();
    }
    const job = { controller: new AbortController(), cancelReason: null, retrying: false, target };
    state.drawJobs.set(target.key, job);

    const provider = settings.provider;
    const style = getActiveStyle();
    const folder = getUploadFolderName();
    const finalPrompt = composeFinalPrompt(data.prompt, style);
    const aspect = settings.aspectRatio;

    await writeSwipeData(target, { drawStatus: 'drawing', drawError: null, drawStartedAt: Date.now() });
    toastr.info('Снимаю в банане…', TOAST_TITLE, { timeOut: 2000 });

    // Рефы: читаем файлы; битый реф пропускаем, рисуем без него.
    const refs = [];
    if (settings.sendRefs) {
        const shotText = `${cleanMessageText(getSwipeText(message, found.swipeIdx), MAX_POST_CHARS)}\n${data.wish || ''}`;
        for (const entry of pickRefsForShot(shotText)) {
            try {
                const dataUrl = await loadRefDataUrl(entry.path, job.controller.signal);
                refs.push({ name: displayName(entry.name) || '?', dataUrl });
            } catch (error) {
                if (error?.name === 'AbortError') break;
                reelLog('WARN', `Реф «${entry.name}» не прочитался:`, error);
                toastr.warning(`Реф «${entry.name || '?'}» не найден, снимаю без него`, TOAST_TITLE, { timeOut: 4000 });
            }
        }
    }
    reelLog('INFO', `Снимаю #${target.messageId}: ${PROVIDER_LABELS[provider]}, ${aspect}, стиль «${style?.name || 'нет'}», рефы: ${refs.map(r => r.name).join(', ') || 'нет'}`, finalPrompt);

    let path = null;
    let model = '';
    let failure = null;
    try {
        let imageUrl = null;
        for (let attempt = 0; ; attempt++) {
            try {
                if (provider === 'local') {
                    model = String(settings.localModel || '').trim();
                    imageUrl = await requestLocal(finalPrompt, refs, job.controller.signal);
                } else {
                    model = await resolveNaisteraModel();
                    imageUrl = await requestNaistera(finalPrompt, refs, job.controller.signal);
                }
                break;
            } catch (error) {
                const retryable = error?.name !== 'AbortError' && isRetryableStatus(error?.status);
                if (!retryable || attempt >= DRAW_RETRY_DELAYS.length) throw error;
                reelLog('WARN', `Банана: ${error.message}, повтор через ${DRAW_RETRY_DELAYS[attempt] / 1000} с`);
                job.retrying = true;
                renderWindow();
                await sleep(DRAW_RETRY_DELAYS[attempt], job.controller.signal);
                job.retrying = false;
                renderWindow();
            }
        }
        const dataUrl = await toDataUrl(imageUrl, job.controller.signal);
        path = await uploadImage(dataUrl, folder);
    } catch (error) {
        failure = error;
    }

    // Нас заменили или отменили — результат не наш.
    if (state.drawJobs.get(target.key) !== job) return;
    state.drawJobs.delete(target.key);

    if (failure) {
        if (failure?.name === 'AbortError') return;
        reelLog('WARN', `Съёмка #${target.messageId} упала:`, failure);
        const text = String(failure?.message || failure);
        if (getCurrentChatId() === target.chatId) {
            await writeSwipeData(target, { drawStatus: 'error', drawError: text });
        } else {
            renderWindow();
        }
        toastr.error(`Банана не сняла (${text.slice(0, 200)}). Промпт сохранён — попробуй ещё раз`, TOAST_TITLE, { timeOut: 8000 });
        return;
    }

    const image = {
        path,
        provider,
        model,
        aspect,
        styleName: style?.name || '',
        refs: refs.map(r => r.name),
        createdAt: Date.now(),
    };

    if (getCurrentChatId() !== target.chatId) {
        getSettings().mailbox.push({ chatId: target.chatId, key: target.key, messageId: target.messageId, image });
        saveSettings();
        toastr.info('Коллаж для другого чата сохранён — появится, когда вернёшься в него', TOAST_TITLE, { timeOut: 4000 });
        renderWindow();
        return;
    }
    await setImage(target, image);
}

/** Картинка свайпа: одна, новая заменяет старую. */
function getSwipeImage(data) {
    return data?.image?.path ? data.image : null;
}

/** Кладёт картинку в свайп, заменяя прежнюю. Старый файл остаётся в папке. */
async function setImage(target, image) {
    return await writeSwipeData(target, { image, drawStatus: 'done', drawError: null });
}

async function cancelDraw(key) {
    const job = state.drawJobs.get(key);
    if (!job) return;
    job.cancelReason = 'user';
    job.controller.abort();
    state.drawJobs.delete(key);
    await writeSwipeData(job.target, { drawStatus: 'cancelled' });
}

/** Раскладывает дорисованное, пока тебя не было в этом чате. */
async function deliverMailbox() {
    const settings = getSettings();
    const chatId = getCurrentChatId();
    if (!chatId || !settings.mailbox.length) return;
    const mine = settings.mailbox.filter(item => item.chatId === chatId);
    if (!mine.length) return;
    settings.mailbox = settings.mailbox.filter(item => item.chatId !== chatId);
    saveSettings();
    let delivered = 0;
    for (const item of mine) {
        const result = await setImage({ chatId, key: item.key, messageId: item.messageId }, item.image);
        if (result === 'ok') delivered++;
    }
    reelLog('INFO', `Почтовый ящик: доставлено ${delivered} из ${mine.length}`);
    if (delivered) renderWindow();
}

// ═══════════════════════════════════════════════════════════════════════
// Окно
// ═══════════════════════════════════════════════════════════════════════

const WINDOW_WIDTH = 360;
const WINDOW_MARGIN = 8;

function buildWindow() {
    if (document.getElementById('reel_window')) return;
    const html = `
        <div id="reel_window" class="reel-window" hidden>
            <div class="reel-head" id="reel_head">
                <span class="reel-title"><i class="fa-solid fa-film reel-title-icon"></i>#<span id="reel_msg_no">—</span></span>
                <label class="reel-auto" title="Авто в этом чате">
                    <input type="checkbox" id="reel_win_auto">
                    <span>Авто</span>
                </label>
                <div class="reel-head-btns">
                    <button type="button" class="reel-icon" id="reel_btn_tags" title="Персонажи этого чата"><i class="fa-solid fa-gear"></i></button>
                    <button type="button" class="reel-icon" id="reel_btn_collapse" title="Свернуть"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
            </div>
            <div class="reel-body" id="reel_body">
                <div class="reel-view" id="reel_view_main">
                    <div class="reel-status" id="reel_status"></div>
                    <div class="reel-image-wrap" id="reel_image_wrap" hidden>
                        <img class="reel-image" id="reel_image" alt="" title="Открыть в полный размер">
                    </div>
                    <div class="reel-prompt-head" id="reel_prompt_head" hidden>
                        <button type="button" class="reel-prompt-toggle" id="reel_prompt_toggle"></button>
                        <button type="button" class="reel-icon reel-expand" id="reel_btn_expand" title="Развернуть"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
                    </div>
                    <div class="reel-prompt-block" id="reel_prompt_block">
                        <div class="reel-prompt" id="reel_prompt"></div>
                        <textarea class="text_pole reel-prompt-edit" id="reel_prompt_edit" spellcheck="false" hidden></textarea>
                        <div class="reel-meta" id="reel_meta"></div>
                        <div class="reel-actions" id="reel_actions_prompt">
                            <button type="button" class="reel-btn reel-btn-small" id="reel_btn_edit">📋 Править</button>
                        </div>
                        <div class="reel-actions" id="reel_actions_edit" hidden>
                            <button type="button" class="reel-btn" id="reel_btn_edit_save">Сохранить</button>
                            <button type="button" class="reel-btn" id="reel_btn_edit_cancel">Отмена</button>
                        </div>
                    </div>
                    <div class="reel-style-row" id="reel_preset_row">
                        <label for="reel_win_preset" class="reel-style-label">Шаблон</label>
                        <select id="reel_win_preset" class="text_pole reel-style-select"></select>
                    </div>
                    <div class="reel-style-row reel-style-row-tight" id="reel_style_row">
                        <label for="reel_style" class="reel-style-label">Стиль</label>
                        <select id="reel_style" class="text_pole reel-style-select"></select>
                    </div>
                    <input type="text" id="reel_wish" class="text_pole reel-wish" placeholder="💬 Пожелание: например, первая панель — общий план зала, он без очков" autocomplete="off">
                    <div class="reel-actions" id="reel_actions_main">
                        <button type="button" class="reel-btn" id="reel_btn_reprompt" title="Свежий текст поста, новая раскладка, пожелание — и сразу в банану">🎬 Снять</button>
                        <button type="button" class="reel-btn" id="reel_btn_draw" title="Тот же промпт и та же раскладка ещё раз">🎨 Нарисовать</button>
                    </div>
                </div>
                <div class="reel-view" id="reel_view_tags" hidden></div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('reel_win_auto').addEventListener('change', async (e) => {
        const ok = await setAuto(e.target.checked);
        if (!ok) e.target.checked = false;
        refreshChatControls();
    });

    document.getElementById('reel_btn_tags').addEventListener('click', () => {
        state.tagsOpen = !state.tagsOpen;
        if (state.tagsOpen && getSettings().window.collapsed) setCollapsed(false);
        renderWindow({ rebuildTags: true });
    });

    document.getElementById('reel_btn_collapse').addEventListener('click', () => {
        setCollapsed(!getSettings().window.collapsed);
    });

    const repromptWithWish = () => {
        const id = state.viewMessageId;
        if (id === null || !getContext().chat?.[id]) return;
        const wishInput = document.getElementById('reel_wish');
        const wish = wishInput.value;
        // Пожелание разовое: очищаем, чтобы не уехало на следующий пост.
        wishInput.value = '';
        runAssemble(id, { wish });
    };
    document.getElementById('reel_btn_reprompt').addEventListener('click', repromptWithWish);
    document.getElementById('reel_wish').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (!document.getElementById('reel_btn_reprompt').disabled) repromptWithWish();
    });

    document.getElementById('reel_btn_draw').addEventListener('click', () => {
        runDraw(makeTarget(state.viewMessageId));
    });

    document.getElementById('reel_image').addEventListener('click', (e) => openLightbox(e.currentTarget.src));

    document.getElementById('reel_btn_expand').addEventListener('click', openPromptExpanded);

    document.getElementById('reel_prompt_toggle').addEventListener('click', () => {
        // Без картинки промпт виден всегда, сворачивать нечего.
        const message = getContext().chat?.[state.viewMessageId];
        if (!getSwipeImage(readSwipeData(message))) return;
        getSettings().window.promptOpen = !getSettings().window.promptOpen;
        saveSettings();
        renderWindow();
    });

    document.getElementById('reel_win_preset').addEventListener('change', (e) => {
        getSettings().activePresetId = e.target.value;
        saveSettings();
        refreshPresetSelect();
    });

    document.getElementById('reel_style').addEventListener('change', (e) => {
        getSettings().activeStyleId = e.target.value;
        saveSettings();
    });

    document.getElementById('reel_btn_edit').addEventListener('click', startEditing);
    document.getElementById('reel_btn_edit_cancel').addEventListener('click', stopEditing);
    document.getElementById('reel_btn_edit_save').addEventListener('click', saveEditedPrompt);

    document.getElementById('reel_status').addEventListener('click', (e) => {
        if (!e.target.closest('[data-act="cancel"]')) return;
        const message = getContext().chat?.[state.viewMessageId];
        const key = getSwipeKey(message, getCurrentSwipeIdx(message));
        if (key) cancelDraw(key);
    });

    initDrag();
    initScrollFollow();
    window.addEventListener('resize', () => applyWindowPosition());
    applyWindowPosition();
}

function setCollapsed(collapsed) {
    getSettings().window.collapsed = !!collapsed;
    saveSettings();
    renderWindow();
}

/** Ставит окно на сохранённое место, не давая ему уехать за экран. */
function applyWindowPosition() {
    const win = document.getElementById('reel_window');
    if (!win) return;
    const { left, top } = getSettings().window;
    if (typeof left !== 'number' || typeof top !== 'number') {
        win.style.left = '';
        win.style.top = '';
        win.style.left = '16px';
        win.style.top = '';
        win.style.bottom = '90px';
        return;
    }
    const clamped = clampPosition(left, top, win);
    win.style.right = '';
    win.style.bottom = '';
    win.style.left = `${clamped.left}px`;
    win.style.top = `${clamped.top}px`;
}

function clampPosition(left, top, win) {
    const width = win.offsetWidth || WINDOW_WIDTH;
    const height = win.querySelector('.reel-head')?.offsetHeight || 40;
    return {
        left: Math.min(Math.max(WINDOW_MARGIN, left), window.innerWidth - width - WINDOW_MARGIN),
        top: Math.min(Math.max(WINDOW_MARGIN, top), window.innerHeight - height - WINDOW_MARGIN),
    };
}

function initDrag() {
    const win = document.getElementById('reel_window');
    const head = document.getElementById('reel_head');
    let drag = null;

    head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, input, label')) return;
        const rect = win.getBoundingClientRect();
        drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        head.setPointerCapture(e.pointerId);
        win.classList.add('reel-dragging');
        e.preventDefault();
    });

    head.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const pos = clampPosition(e.clientX - drag.dx, e.clientY - drag.dy, win);
        win.style.right = '';
        win.style.bottom = '';
        win.style.left = `${pos.left}px`;
        win.style.top = `${pos.top}px`;
    });

    const end = (e) => {
        if (!drag) return;
        drag = null;
        win.classList.remove('reel-dragging');
        try { head.releasePointerCapture(e.pointerId); } catch (_) { /* уже отпущен */ }
        const rect = win.getBoundingClientRect();
        getSettings().window.left = Math.round(rect.left);
        getSettings().window.top = Math.round(rect.top);
        saveSettings();
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
}

// ─── Ручная правка промпта ───────────────────────────────────────────────

function startEditing() {
    const message = getContext().chat?.[state.viewMessageId];
    const data = readSwipeData(message);
    if (!data?.prompt) return;
    state.editing = true;
    state.editTarget = makeTarget(state.viewMessageId);
    getSettings().window.promptOpen = true;
    const textarea = document.getElementById('reel_prompt_edit');
    textarea.value = data.prompt;
    renderWindow();
    textarea.focus();
}

function stopEditing() {
    state.editing = false;
    state.editTarget = null;
    renderWindow();
    followScroll();
}

async function saveEditedPrompt() {
    const text = cleanProse(document.getElementById('reel_prompt_edit').value);
    if (!text) {
        toastr.warning('Промпт пустой — нечего сохранять', TOAST_TITLE, { timeOut: 2500 });
        return;
    }
    const target = state.editTarget;
    if (!target) return;
    state.editing = false;
    state.editTarget = null;
    await writeSwipeData(target, { status: 'prompt', prompt: text, edited: true, error: null });
    followScroll();
}

// ─── Промпт в большом окне ───────────────────────────────────────────────

/** В большом окне проза показывается как есть. */
function promptToSections(prompt) {
    return String(prompt || '');
}

/** При сохранении — та же чистка, что у ответа модели. */
function sectionsToPrompt(text) {
    return cleanProse(text);
}

function openPromptExpanded() {
    const messageId = state.viewMessageId;
    const message = getContext().chat?.[messageId];
    const data = readSwipeData(message);
    if (!data?.prompt) return;

    // Если в маленьком окне уже идёт правка — берём недописанное оттуда.
    const target = state.editing && state.editTarget ? state.editTarget : makeTarget(messageId);
    if (!target) return;
    const source = state.editing
        ? String(document.getElementById('reel_prompt_edit').value || '')
        : data.prompt;
    const meta = document.getElementById('reel_meta')?.textContent || '';

    document.getElementById('reel_expand_overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'reel_expand_overlay';
    overlay.className = 'reel-popup-ov';
    overlay.innerHTML = `
        <div class="reel-popup reel-expand-popup" role="dialog" aria-label="Промпт">
            <div class="reel-popup-head">
                <div class="reel-popup-title">⊹ Промпт #${escapeHtml(String(messageId))} ⊹</div>
                <button class="reel-popup-x" type="button" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="reel-expand-body">
                <textarea class="text_pole reel-expand-text" spellcheck="false"></textarea>
                ${meta ? `<div class="reel-meta">${escapeHtml(meta)}</div>` : ''}
            </div>
            <div class="reel-popup-btns">
                <button class="reel-pbtn primary" data-act="save">Сохранить</button>
                <button class="reel-pbtn" data-act="save-draw">Сохранить и снять</button>
                <button class="reel-pbtn ghost" data-act="close">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('.reel-expand-text');
    textarea.value = promptToSections(source);

    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.reel-popup-x').addEventListener('click', close);
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });

    const save = async (andDraw) => {
        const prompt = sectionsToPrompt(textarea.value);
        if (!prompt) {
            toastr.warning('Промпт пустой — нечего сохранять', TOAST_TITLE, { timeOut: 2500 });
            return;
        }
        close();
        // Правка в маленьком окне закрывается: сохранено уже здесь.
        state.editing = false;
        state.editTarget = null;
        const result = await writeSwipeData(target, { status: 'prompt', prompt, edited: true, error: null });
        if (andDraw && result === 'ok') runDraw(target);
        followScroll();
    };
    overlay.querySelector('[data-act="save"]').addEventListener('click', () => save(false));
    overlay.querySelector('[data-act="save-draw"]').addEventListener('click', () => save(true));

    textarea.focus();
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
}

// ─── Окно едет за прокруткой чата ────────────────────────────────────────

/**
 * Ответ модели, который пересекает середину видимой части чата. Если по
 * середине твоё сообщение или служебное — ближайший ответ модели выше,
 * а если выше нет — ниже.
 */
function findMessageAtCenter() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return null;
    const chat = getContext().chat || [];
    const rect = chatEl.getBoundingClientRect();
    const center = rect.top + rect.height / 2;

    let above = null;
    let below = null;
    for (const el of chatEl.querySelectorAll('.mes[mesid]')) {
        const id = Number(el.getAttribute('mesid'));
        const message = chat[id];
        if (!message || message.is_user || message.is_system) continue;
        const box = el.getBoundingClientRect();
        if (box.top <= center && box.bottom >= center) return id;
        if (box.bottom < center) above = id;
        else if (below === null) below = id;
    }
    return above ?? below;
}

function followScroll() {
    if (state.editing || !getCurrentChatId()) return;
    const id = findMessageAtCenter();
    if (id === null || id === state.viewMessageId) return;
    state.viewMessageId = id;
    renderWindow();
}

function initScrollFollow() {
    let scheduled = false;
    const onScroll = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            followScroll();
        });
    };
    // #chat может появиться позже расширения, поэтому слушаем на документе
    // в фазе перехвата: событие scroll не всплывает, но перехватывается.
    document.addEventListener('scroll', (e) => {
        if (e.target?.id === 'chat') onScroll();
    }, { capture: true, passive: true });
}

/** Последний ответ модели с данными, иначе просто последний ответ модели. */
function resolveDefaultView() {
    const chat = getContext().chat || [];
    let lastAi = null;
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message || message.is_user || message.is_system) continue;
        if (lastAi === null) lastAi = i;
        if (readSwipeData(message)) return i;
    }
    return lastAi;
}

function ensureViewValid() {
    const chat = getContext().chat || [];
    const message = chat[state.viewMessageId];
    if (state.viewMessageId === null || !message || message.is_user || message.is_system) {
        state.viewMessageId = resolveDefaultView();
    }
}

/**
 * Перерисовывает окно. Панель персонажей перестраивается только по запросу
 * или при смене чата: иначе запись промпта в фоне стирала бы недописанные
 * теги прямо под курсором.
 */
function renderWindow({ rebuildTags = false } = {}) {
    syncLaunchers();
    const win = document.getElementById('reel_window');
    if (!win) return;
    const visible = getSettings().enabled && !!getCurrentChatId() && !getSettings().window.hidden;
    win.hidden = !visible;
    if (!visible) return;

    const collapsed = !!getSettings().window.collapsed;
    win.classList.toggle('reel-collapsed', collapsed);
    const collapseBtn = document.getElementById('reel_btn_collapse');
    collapseBtn.innerHTML = collapsed
        ? '<i class="fa-solid fa-chevron-up"></i>'
        : '<i class="fa-solid fa-chevron-down"></i>';
    collapseBtn.title = collapsed ? 'Развернуть' : 'Свернуть';

    document.getElementById('reel_btn_tags').classList.toggle('active', state.tagsOpen);
    document.getElementById('reel_view_main').hidden = state.tagsOpen;
    document.getElementById('reel_view_tags').hidden = !state.tagsOpen;

    ensureViewValid();
    document.getElementById('reel_msg_no').textContent = state.viewMessageId ?? '—';

    if (state.tagsOpen) {
        const panel = document.getElementById('reel_view_tags');
        if (rebuildTags || panel.dataset.chatId !== String(getCurrentChatId())) renderTagsPanel();
    } else {
        renderMainView();
    }
}

function renderMainView() {
    const $ = (id) => document.getElementById(id);
    const statusEl = $('reel_status');
    const promptEl = $('reel_prompt');
    const metaEl = $('reel_meta');
    const editEl = $('reel_prompt_edit');
    const imageWrap = $('reel_image_wrap');
    const imageEl = $('reel_image');
    const toggleEl = $('reel_prompt_toggle');
    const headEl = $('reel_prompt_head');
    const promptBlock = $('reel_prompt_block');
    const repromptBtn = $('reel_btn_reprompt');
    const drawBtn = $('reel_btn_draw');
    const editBtn = $('reel_btn_edit');

    refreshStyleSelect();
    refreshPresetSelect();

    const message = getContext().chat?.[state.viewMessageId];
    if (!message) {
        state.editing = false;
        statusEl.textContent = 'В чате пока нет ответов модели.';
        statusEl.hidden = false;
        imageWrap.hidden = true;
        headEl.hidden = true;
        promptBlock.hidden = true;
        $('reel_actions_main').hidden = true;
        $('reel_style_row').hidden = true;
        $('reel_preset_row').hidden = true;
        $('reel_wish').hidden = true;
        return;
    }
    $('reel_actions_main').hidden = false;
    $('reel_style_row').hidden = false;
    $('reel_preset_row').hidden = false;
    $('reel_wish').hidden = false;

    const data = readSwipeData(message);
    const key = getSwipeKey(message, getCurrentSwipeIdx(message));
    const drawJob = key ? state.drawJobs.get(key) : null;
    const status = data?.status;
    const drawStatus = data?.drawStatus;

    // Статус: сначала живая съёмка, потом ошибки, потом «пусто».
    const cancel = ' <a href="javascript:void(0)" class="reel-link" data-act="cancel">Отменить</a>';
    let statusHtml = '';
    if (drawJob) statusHtml = `${drawJob.retrying ? 'Банана занята, пробую ещё раз…' : 'Снимаю в банане…'}${cancel}`;
    else if (!data?.prompt) statusHtml = 'Этот свайп ещё не снят. Жми 🎬';
    else if (drawStatus === 'drawing') statusHtml = 'Съёмка прервана — попробуй ещё раз.';
    else if (drawStatus === 'error') statusHtml = escapeHtml(`Банана не сняла${data.drawError ? ` (${String(data.drawError).slice(0, 200)})` : ''}.`);
    else if (drawStatus === 'cancelled' || status === 'cancelled') statusHtml = 'Отменено.';
    statusEl.innerHTML = statusHtml;
    statusEl.hidden = !statusHtml;

    // Картинка одна на свайп; пока перерисовывается, висит старая.
    const image = getSwipeImage(data);
    imageWrap.hidden = !image;
    if (image) {
        if (imageEl.getAttribute('src') !== image.path) imageEl.setAttribute('src', image.path);
        imageEl.title = 'Открыть в полный размер';
    } else {
        imageEl.removeAttribute('src');
    }

    // Промпт: с картинкой сворачивается в строку, без неё виден всегда.
    const hasPrompt = !!data?.prompt;
    const open = !image || state.editing || !!getSettings().window.promptOpen;
    headEl.hidden = !hasPrompt;
    toggleEl.textContent = !image ? 'Промпт' : (open ? 'Промпт ▾' : 'Промпт ▸');
    toggleEl.classList.toggle('reel-static', !image);
    promptBlock.hidden = !hasPrompt || !open;

    editEl.hidden = !state.editing;
    $('reel_actions_edit').hidden = !state.editing;
    $('reel_actions_prompt').hidden = state.editing;
    promptEl.hidden = state.editing;
    promptEl.textContent = data?.prompt || '';

    const meta = [];
    if (hasPrompt && data.layoutName) meta.push(`раскладка: ${data.layoutName}`);
    if (hasPrompt && data.presetName) meta.push(`шаблон: ${data.presetName}`);
    if (hasPrompt && data.edited) meta.push('правлено вручную');
    if (hasPrompt && data.wish) meta.push(`пожелание: ${data.wish}`);
    if (image) {
        const where = PROVIDER_LABELS[image.provider] || '';
        meta.push(`кадр: ${image.aspect || '?'}, ${image.model || '?'}${where ? ` (${where})` : ''}${image.styleName ? `, ${image.styleName}` : ''}`);
        if (Array.isArray(image.refs) && image.refs.length) meta.push(`рефы: ${image.refs.join(', ')}`);
    }
    metaEl.textContent = meta.join(' · ');
    metaEl.hidden = !meta.length;

    const busy = !!drawJob;
    repromptBtn.textContent = hasPrompt ? '🎬 Новый дубль' : '🎬 Снять';
    repromptBtn.disabled = false;
    drawBtn.textContent = image ? '🔁 Повторить' : '🎨 Нарисовать';
    drawBtn.disabled = !hasPrompt || busy;
    editBtn.disabled = busy;
}

function refreshStyleSelect() {
    const select = document.getElementById('reel_style');
    if (!select) return;
    const settings = getSettings();
    const options = [{ id: '', name: 'Без стиля' }, ...settings.styles];
    const html = options
        .map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || 'Без названия')}</option>`)
        .join('');
    if (select.dataset.html !== html) {
        select.innerHTML = html;
        select.dataset.html = html;
    }
    const exists = options.some(s => s.id === settings.activeStyleId);
    select.value = exists ? settings.activeStyleId : '';
}

function openLightbox(src) {
    if (!src) return;
    document.getElementById('reel_lightbox')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'reel_lightbox';
    overlay.className = 'reel-lightbox';
    overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════════════
// Панель «Персонажи этого чата»
// ═══════════════════════════════════════════════════════════════════════

const TAGS_PLACEHOLDER = 'по-английски, например: adult male wolf demi-human, tall and lean, long silver hair, grey eyes, scar across the left brow';

function newExtraId() {
    return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function renderTagsPanel() {
    const panel = document.getElementById('reel_view_tags');
    const chatState = getChatState();
    panel.dataset.chatId = String(getCurrentChatId());
    if (!chatState) { panel.innerHTML = ''; return; }
    const context = getContext();
    const chars = chatState.characters;

    const refBlock = (refKey) => {
        const ref = chatState.refs[refKey];
        const has = !!ref?.path;
        return `
            <div class="reel-ref">
                ${has
                    ? `<img class="reel-ref-thumb" src="${escapeHtml(ref.path)}" alt="" title="Открыть в полный размер" data-act="ref-view">`
                    : '<div class="reel-ref-thumb reel-ref-empty"><i class="fa-solid fa-image"></i></div>'}
                <div class="reel-ref-ctrl">
                    <div class="reel-ref-btns">
                        <button type="button" class="reel-btn reel-btn-small" data-act="ref-upload">📎 ${has ? 'Заменить реф' : 'Загрузить реф'}</button>
                        ${has ? '<button type="button" class="reel-icon" data-act="ref-remove" title="Убрать реф"><i class="fa-solid fa-xmark"></i></button>' : ''}
                    </div>
                    <label class="reel-ref-always"${has ? '' : ' hidden'}>
                        <input type="checkbox" data-act="ref-always"${ref?.always ? ' checked' : ''}>
                        <span>Всегда отправлять</span>
                    </label>
                </div>
                <input type="file" accept="image/*" data-act="ref-file" hidden>
            </div>`;
    };

    const row = (slot, name, tags, { editableName = false, id = '' } = {}) => `
        <div class="reel-char" data-slot="${slot}" data-id="${escapeHtml(id)}">
            <div class="reel-char-top">
                ${editableName
                    ? `<input type="text" class="text_pole reel-char-name-input" data-f="name" value="${escapeHtml(name)}" placeholder="Имя персонажа">`
                    : `<span class="reel-char-name">${escapeHtml(name || '—')}</span>`}
                <button type="button" class="reel-btn reel-btn-small" data-act="suggest">✨ Предложить по карточке</button>
                ${editableName ? '<button type="button" class="reel-icon" data-act="remove" title="Удалить"><i class="fa-solid fa-trash"></i></button>' : ''}
            </div>
            <textarea class="text_pole reel-char-tags" data-f="tags" rows="3" placeholder="${escapeHtml(TAGS_PLACEHOLDER)}">${escapeHtml(tags)}</textarea>
            ${refBlock(slot === 'extra' ? id : slot)}
        </div>`;

    const rows = [];
    if (!isGroupChat()) rows.push(row('char', context.name2, chars.char));
    rows.push(row('user', context.name1, chars.user));
    for (const extra of chars.extra) {
        rows.push(row('extra', extra.name, extra.tags, { editableName: true, id: extra.id }));
    }

    panel.innerHTML = `
        <div class="reel-tags-title">Персонажи этого чата</div>
        ${isGroupChat() ? '<div class="reel-hint">В групповом чате добавь участников через ＋.</div>' : ''}
        <button type="button" class="reel-btn reel-btn-import" data-act="import-fw">Взять рефы из Frameweaver</button>
        <div class="reel-hint">Внешность уходит банане блоком CAST: персонаж и ты — всегда, остальные — когда их имя есть в посте. Реф уходит, если имя есть в посте или стоит «Всегда отправлять». Не больше ${MAX_REFS}. Несколько имён — через запятую: «Вейн, Veyne».</div>
        ${rows.join('')}
        <button type="button" class="reel-btn" data-act="add">＋ Добавить персонажа</button>`;

    panel.querySelector('[data-act="add"]').addEventListener('click', async () => {
        getChatState().characters.extra.push({ id: newExtraId(), name: '', tags: '' });
        await saveChatState();
        renderTagsPanel();
        [...panel.querySelectorAll('.reel-char[data-slot="extra"]')].pop()?.querySelector('[data-f="name"]')?.focus();
    });

    for (const rowEl of panel.querySelectorAll('.reel-char')) {
        for (const field of rowEl.querySelectorAll('[data-f]')) {
            field.addEventListener('change', () => saveTagRow(rowEl));
        }
        rowEl.querySelector('[data-act="suggest"]').addEventListener('click', (e) => onSuggestClick(rowEl, e.currentTarget));
        rowEl.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
            const chatState2 = getChatState();
            chatState2.characters.extra = chatState2.characters.extra.filter(x => x.id !== rowEl.dataset.id);
            delete chatState2.refs[rowEl.dataset.id];
            await saveChatState();
            renderTagsPanel();
        });
        bindRefControls(rowEl);
    }

    panel.querySelector('[data-act="import-fw"]').addEventListener('click', (e) => importRefsFromFrameweaver(e.currentTarget));
}

/** Ключ рефа для строки панели. */
function getRowRefKey(rowEl) {
    return rowEl.dataset.slot === 'extra' ? rowEl.dataset.id : rowEl.dataset.slot;
}

function bindRefControls(rowEl) {
    const fileInput = rowEl.querySelector('[data-act="ref-file"]');
    rowEl.querySelector('[data-act="ref-upload"]').addEventListener('click', () => fileInput.click());
    rowEl.querySelector('[data-act="ref-view"]')?.addEventListener('click', (e) => openLightbox(e.currentTarget.getAttribute('src')));

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            toastr.warning('Это не картинка', TOAST_TITLE, { timeOut: 2500 });
            return;
        }
        const chatId = getCurrentChatId();
        const refKey = getRowRefKey(rowEl);
        try {
            const path = await saveRefImage(await readFileAsDataUrl(file));
            if (getCurrentChatId() !== chatId) return;
            const chatState = getChatState();
            if (!chatState) return;
            chatState.refs[refKey] = { path, always: !!chatState.refs[refKey]?.always };
            await saveChatState();
            renderTagsPanel();
        } catch (error) {
            reelLog('WARN', 'Реф не сохранился:', error);
            toastr.error(`Реф не сохранился (${String(error?.message || error).slice(0, 120)})`, TOAST_TITLE, { timeOut: 5000 });
        }
    });

    rowEl.querySelector('[data-act="ref-remove"]')?.addEventListener('click', async () => {
        const chatState = getChatState();
        if (!chatState) return;
        delete chatState.refs[getRowRefKey(rowEl)];
        await saveChatState();
        renderTagsPanel();
    });

    rowEl.querySelector('[data-act="ref-always"]')?.addEventListener('change', async (e) => {
        const chatState = getChatState();
        const ref = chatState?.refs[getRowRefKey(rowEl)];
        if (!ref) return;
        ref.always = e.currentTarget.checked;
        await saveChatState();
    });
}

// ─── Импорт рефов из Frameweaver ─────────────────────────────────────────
//
// Frameweaver хранит рефы в extensionSettings.inline_image_gen: общие слоты
// (charRef, userRef, npcReferences), по персонажу (characterRefs[владелец])
// или по чату (chatMetadata.iig_refs) — смотря что выбрано у него в refScope.
// Берём его текущий набор; если там пусто — пробуем остальные.

function hasFwImage(ref) {
    return !!(ref && (ref.imagePath || ref.imageBase64 || ref.imageData));
}

function getFrameweaverRefContainer() {
    const context = getContext();
    const fw = context.extensionSettings?.inline_image_gen;
    if (!fw || typeof fw !== 'object') return null;

    const chatBucket = context.chatMetadata?.iig_refs;
    let ownerKey = null;
    if (context.groupId) ownerKey = `group:${String(context.groupId)}`;
    else {
        const avatar = context.characters?.[context.characterId]?.avatar;
        if (avatar) ownerKey = `character:${avatar}`;
    }
    const charBucket = ownerKey ? fw.characterRefs?.[ownerKey] : null;

    const byScope = { 'per-chat': chatBucket, 'per-character': charBucket, global: fw };
    const order = [fw.refScope, 'per-chat', 'per-character', 'global'];
    const filled = (c) => c && typeof c === 'object'
        && [c.charRef, c.userRef, ...(Array.isArray(c.npcReferences) ? c.npcReferences : [])].some(hasFwImage);
    for (const scope of order) {
        if (filled(byScope[scope])) return { container: byScope[scope], fw };
    }
    return { container: null, fw };
}

/** Картинка рефа фрейма → data URL (файл или base64). */
async function fwRefToDataUrl(ref) {
    if (ref.imagePath) {
        try { return await loadRefDataUrl(ref.imagePath); } catch (error) {
            if (!ref.imageBase64 && !ref.imageData) throw error;
        }
    }
    const b64 = String(ref.imageBase64 || ref.imageData || '');
    if (b64.startsWith('data:')) return b64;
    const mime = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${b64}`;
}

function firstAlias(name) {
    return String(name || '').split(',')[0].trim().toLowerCase();
}

async function importRefsFromFrameweaver(button) {
    const context = getContext();
    const chatState = getChatState();
    if (!chatState) return;
    const found = getFrameweaverRefContainer();
    if (!found) {
        toastr.warning('Frameweaver не найден', TOAST_TITLE, { timeOut: 3000 });
        return;
    }
    if (!found.container) {
        toastr.warning('У Frameweaver нет рефов для этого чата', TOAST_TITLE, { timeOut: 3000 });
        return;
    }
    const { container, fw } = found;

    // План: куда ляжет каждый реф фрейма.
    const plan = [];
    const nameOrFallback = (ref, fallback) => String(ref?.name || fallback || '').trim();
    const findExtra = (name) => chatState.characters.extra.find(x => firstAlias(x.name) && firstAlias(x.name) === firstAlias(name));

    if (hasFwImage(container.charRef)) {
        const name = nameOrFallback(container.charRef, context.name2);
        if (!isGroupChat()) plan.push({ ref: container.charRef, key: 'char', name, always: !!fw.charRefAlways });
        else if (name) plan.push({ ref: container.charRef, extraName: name, always: !!fw.charRefAlways });
    }
    if (hasFwImage(container.userRef)) {
        plan.push({ ref: container.userRef, key: 'user', name: nameOrFallback(container.userRef, context.name1), always: !!fw.userRefAlways });
    }
    for (const npc of (Array.isArray(container.npcReferences) ? container.npcReferences : [])) {
        if (!hasFwImage(npc) || !String(npc.name || '').trim()) continue;
        const name = String(npc.name).trim();
        const lower = firstAlias(name);
        if (!isGroupChat() && lower === firstAlias(context.name2)) plan.push({ ref: npc, key: 'char', name, always: false });
        else if (lower === firstAlias(context.name1)) plan.push({ ref: npc, key: 'user', name, always: false });
        else plan.push({ ref: npc, extraName: name, always: false });
    }
    if (!plan.length) {
        toastr.warning('У Frameweaver нет рефов для этого чата', TOAST_TITLE, { timeOut: 3000 });
        return;
    }

    // Не трогаем уже загруженное без спроса.
    const conflicts = plan.filter(item => {
        const key = item.key || findExtra(item.extraName)?.id;
        return key && chatState.refs[key]?.path;
    });
    if (conflicts.length) {
        const answer = await context.callGenericPopup(
            `У ${conflicts.map(c => c.name || c.extraName).join(', ')} уже есть реф. Заменить рефами из Frameweaver?`,
            context.POPUP_TYPE.CONFIRM);
        if (answer !== context.POPUP_RESULT.AFFIRMATIVE) return;
    }

    const chatId = getCurrentChatId();
    button.disabled = true;
    toastr.info('Забираю рефы из Frameweaver…', TOAST_TITLE, { timeOut: 2000 });
    let taken = 0;
    let failed = 0;
    try {
        for (const item of plan) {
            let path;
            try {
                path = await saveRefImage(await fwRefToDataUrl(item.ref));
            } catch (error) {
                failed++;
                reelLog('WARN', `Реф «${item.name || item.extraName}» из Frameweaver не взялся:`, error);
                continue;
            }
            if (getCurrentChatId() !== chatId) return;
            const live = getChatState();
            let key = item.key;
            if (!key) {
                let extra = live.characters.extra.find(x => firstAlias(x.name) && firstAlias(x.name) === firstAlias(item.extraName));
                if (!extra) {
                    extra = { id: newExtraId(), name: item.extraName, tags: '' };
                    live.characters.extra.push(extra);
                }
                key = extra.id;
            }
            live.refs[key] = { path, always: item.always };
            taken++;
        }
        await saveChatState();
        renderTagsPanel();
        const tail = failed ? `, не взялось: ${failed}` : '';
        toastr.success(`Взял рефов: ${taken}${tail}`, TOAST_TITLE, { timeOut: 3000 });
    } finally {
        button.disabled = false;
    }
}

/** Имя персонажа в строке панели. */
function getRowName(rowEl) {
    const context = getContext();
    if (rowEl.dataset.slot === 'char') return context.name2;
    if (rowEl.dataset.slot === 'user') return context.name1;
    return String(rowEl.querySelector('[data-f="name"]')?.value || '').trim();
}

async function saveTagRow(rowEl) {
    const chatState = getChatState();
    if (!chatState) return;
    const tags = String(rowEl.querySelector('[data-f="tags"]').value || '').trim();
    const slot = rowEl.dataset.slot;
    if (slot === 'char' || slot === 'user') {
        chatState.characters[slot] = tags;
    } else {
        const extra = chatState.characters.extra.find(x => x.id === rowEl.dataset.id);
        if (!extra) return;
        extra.tags = tags;
        extra.name = getRowName(rowEl);
    }
    await saveChatState();
}

async function onSuggestClick(rowEl, button) {
    const context = getContext();
    const name = getRowName(rowEl);
    if (!name) {
        toastr.warning('Сначала впиши имя персонажа', TOAST_TITLE, { timeOut: 2500 });
        return;
    }
    const textarea = rowEl.querySelector('[data-f="tags"]');
    if (textarea.value.trim()) {
        const answer = await context.callGenericPopup('Заменить текущее описание черновиком?', context.POPUP_TYPE.CONFIRM);
        if (answer !== context.POPUP_RESULT.AFFIRMATIVE) return;
    }

    const epoch = state.epoch;
    button.disabled = true;
    toastr.info('Набрасываю внешность по карточке…', TOAST_TITLE, { timeOut: 2000 });
    try {
        const { tags, refused } = await suggestTags(name);
        if (epoch !== state.epoch) return;
        if (refused) {
            toastr.error('Модель отказалась. Выбери другой профиль в настройках Reel', TOAST_TITLE, { timeOut: 6000 });
            return;
        }
        if (!tags) {
            toastr.warning(`Модель не нашла, как выглядит ${name}`, TOAST_TITLE, { timeOut: 4000 });
            return;
        }
        // Панель могли перерисовать, пока модель думала: ищем строку заново.
        const liveRow = findLiveRow(rowEl);
        if (!liveRow) return;
        liveRow.querySelector('[data-f="tags"]').value = tags;
        await saveTagRow(liveRow);
    } catch (error) {
        reelLog('WARN', 'Черновик тегов не удался:', error);
        toastr.warning(`Модель не нашла, как выглядит ${name}`, TOAST_TITLE, { timeOut: 4000 });
    } finally {
        button.disabled = false;
    }
}

function findLiveRow(rowEl) {
    if (rowEl.isConnected) return rowEl;
    const panel = document.getElementById('reel_view_tags');
    const { slot, id } = rowEl.dataset;
    return panel?.querySelector(slot === 'extra'
        ? `.reel-char[data-slot="extra"][data-id="${CSS.escape(id)}"]`
        : `.reel-char[data-slot="${slot}"]`) || null;
}

// ═══════════════════════════════════════════════════════════════════════
// Кнопка вызова (портировано из DS Comments)
// ═══════════════════════════════════════════════════════════════════════

const FAB_SIZE = 40;
// Сколько пикселей хода отличает перетаскивание от клика.
const DRAG_THRESHOLD_PX = 6;

function getQuickReplyHost() {
    const bar = document.querySelector('#send_form #qr--bar')
        || document.getElementById('qr--bar')
        || document.querySelector('#send_form .qr--bar');
    if (!bar) return null;
    return bar.querySelector('.qr--buttons') || bar;
}

function toggleWindowHidden() {
    const win = getSettings().window;
    win.hidden = !win.hidden;
    saveSettings();
    renderWindow();
    if (!win.hidden) followScroll();
}

/** Ставит, убирает и подсвечивает кнопки по настройке. Можно звать сколько угодно. */
function ensureLaunchers() {
    const settings = getSettings();
    const mode = settings.launcherMode || 'bar';
    const enabled = settings.enabled;
    const wantBar = enabled && (mode === 'bar' || mode === 'both');
    const wantFab = enabled && (mode === 'floating' || mode === 'both');

    let bar = document.getElementById('reel_launcher');
    if (wantBar) {
        const host = getQuickReplyHost();
        if (host) {
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'reel_launcher';
                bar.className = 'qr--button menu_button interactable reel-launcher';
                bar.tabIndex = 0;
                bar.setAttribute('role', 'button');
                bar.title = 'Reel';
                bar.innerHTML = '<i class="fa-solid fa-film" aria-hidden="true"></i>';
                bar.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleWindowHidden(); });
                bar.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWindowHidden(); }
                });
            }
            if (bar.parentElement !== host) host.appendChild(bar);
        }
    } else if (bar) {
        bar.remove();
    }

    let fab = document.getElementById('reel_fab');
    if (wantFab && !fab) fab = buildFab();
    else if (!wantFab && fab) { fab.remove(); fab = null; }
    if (fab) fab.hidden = !getCurrentChatId();

    syncLaunchers();
}

/** Подсветка «окно открыто» и пульс, пока что-то пишется или рисуется. */
function syncLaunchers() {
    const open = !getSettings().window.hidden;
    const busy = state.drawJobs.size > 0;
    for (const id of ['reel_launcher', 'reel_fab']) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle('reel-launcher-active', open);
        el.classList.toggle('reel-busy', busy);
    }
}

function buildFab() {
    const fab = document.createElement('div');
    fab.id = 'reel_fab';
    fab.className = 'reel-fab';
    fab.title = 'Reel';
    fab.setAttribute('role', 'button');
    fab.innerHTML = '<i class="fa-solid fa-film" aria-hidden="true"></i>';
    document.body.appendChild(fab);
    placeFab(fab);

    let drag = null;
    fab.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const rect = fab.getBoundingClientRect();
        drag = { startX: e.clientX, startY: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
        fab.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    fab.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        const pos = clampFab(e.clientX - drag.dx, e.clientY - drag.dy);
        fab.style.left = `${pos.left}px`;
        fab.style.top = `${pos.top}px`;
    });
    const end = (e) => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        try { fab.releasePointerCapture(e.pointerId); } catch (_) { /* уже отпущен */ }
        if (!moved) { toggleWindowHidden(); return; }
        const rect = fab.getBoundingClientRect();
        getSettings().fabPosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
        saveSettings();
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => placeFab(fab));
    return fab;
}

function clampFab(left, top) {
    return {
        left: Math.min(Math.max(0, left), window.innerWidth - FAB_SIZE),
        top: Math.min(Math.max(0, top), window.innerHeight - FAB_SIZE),
    };
}

function placeFab(fab) {
    const saved = getSettings().fabPosition;
    const pos = saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)
        ? clampFab(saved.left, saved.top)
        : clampFab(20, window.innerHeight - FAB_SIZE - 80);
    fab.style.left = `${pos.left}px`;
    fab.style.top = `${pos.top}px`;
}

/**
 * Таверна пересобирает панель быстрых ответов (смена чата, правка QR),
 * и наша кнопка пропадает. Следим за #send_form и втыкаем её обратно.
 */
function watchQuickReplyBar() {
    let timer = null;
    const remount = () => {
        clearTimeout(timer);
        timer = setTimeout(ensureLaunchers, 100);
    };
    const attach = () => {
        const sendForm = document.getElementById('send_form');
        if (!sendForm) { setTimeout(attach, 500); return; }
        new MutationObserver(remount).observe(sendForm, { childList: true, subtree: true });
        ensureLaunchers();
    };
    attach();
}

// ═══════════════════════════════════════════════════════════════════════
// Менеджер шаблонов (портировано из Сториборда)
// ═══════════════════════════════════════════════════════════════════════

function newPresetId(base = 'preset') {
    return reelUniquePresetId(getSettings().presets, base);
}

/** Выпадашки шаблона в настройках и в окне — один и тот же выбор. */
function refreshPresetSelect() {
    const settings = getSettings();
    const html = settings.presets
        .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join('');
    for (const id of ['reel_preset', 'reel_win_preset']) {
        const select = document.getElementById(id);
        if (!select) continue;
        if (select.dataset.html !== html) {
            select.innerHTML = html;
            select.dataset.html = html;
        }
        select.value = settings.activePresetId;
    }
}

function openPresetManager() {
    document.getElementById('reel_presets_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'reel_presets_overlay';
    overlay.className = 'reel-popup-ov';
    overlay.innerHTML = `
        <div class="reel-popup reel-presets" role="dialog" aria-label="Шаблоны">
            <div class="reel-popup-head">
                <div class="reel-popup-title">⊹ Шаблоны ⊹</div>
                <button class="reel-popup-x" type="button" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="reel-presets-cols">
                <div class="reel-presets-side">
                    <div class="reel-presets-list"></div>
                    <div class="reel-presets-side-btns">
                        <button class="reel-pbtn" data-act="new">Новый</button>
                        <button class="reel-pbtn" data-act="duplicate">Дублировать</button>
                        <button class="reel-pbtn" data-act="delete">Удалить</button>
                    </div>
                </div>
                <div class="reel-presets-form"></div>
            </div>
            <div class="reel-popup-btns">
                <button class="reel-pbtn primary" data-act="save">Сохранить</button>
                <button class="reel-pbtn" data-act="export">Экспорт</button>
                <button class="reel-pbtn" data-act="import">Импорт</button>
                <button class="reel-pbtn ghost" data-act="close">Закрыть</button>
            </div>
            <input type="file" accept="application/json,.json" class="reel-import-input" hidden>
        </div>`;
    document.body.appendChild(overlay);

    let editingId = getActivePreset()?.id || getSettings().presets[0]?.id;
    const listEl = overlay.querySelector('.reel-presets-list');
    const formEl = overlay.querySelector('.reel-presets-form');

    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.reel-popup-x').addEventListener('click', close);
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });

    function renderList() {
        const settings = getSettings();
        listEl.innerHTML = settings.presets.map(p => `
            <div class="reel-preset-item ${p.id === editingId ? 'active' : ''}" data-id="${escapeHtml(p.id)}">
                <span class="reel-preset-name">${escapeHtml(p.name)}</span>
                ${p.builtIn ? '<span class="reel-preset-tag">встроенный</span>' : ''}
            </div>`).join('');
        for (const item of listEl.querySelectorAll('.reel-preset-item')) {
            item.addEventListener('click', () => {
                editingId = item.dataset.id;
                renderList();
                renderForm();
            });
        }
        overlay.querySelector('[data-act="delete"]').disabled = settings.presets.length <= 1;
    }

    function renderForm() {
        const preset = getSettings().presets.find(p => p.id === editingId);
        if (!preset) { formEl.innerHTML = ''; return; }
        const locked = !!preset.builtIn;
        const ro = locked ? 'readonly disabled' : '';
        formEl.innerHTML = `
            ${locked ? '<div class="reel-warn">Встроенный шаблон — только для чтения, чтобы до него доходили обновления. Нажми «Дублировать» и правь копию.</div>' : ''}
            <label class="reel-field-label">Название</label>
            <input type="text" class="text_pole" data-f="name" value="${escapeHtml(preset.name)}" ${ro}>
            <label class="reel-field-label">Текст для бананы</label>
            <textarea class="text_pole reel-ta-big" data-f="instruction" spellcheck="false" ${ro}>${escapeHtml(preset.instruction || '')}</textarea>
            <div class="reel-hint">{{layout}} — сюда встаёт раскладка панелей. В конец сами дописываются блоки CAST (внешность из панели персонажей), пожелание и пост целиком. Макросы таверны вроде {{char}} и {{user}} работают.</div>`;
        const saveBtn = overlay.querySelector('[data-act="save"]');
        saveBtn.disabled = locked;
        saveBtn.title = locked ? 'Встроенный шаблон не редактируется — сделай копию' : '';
    }

    function collectForm() {
        const out = {};
        for (const field of formEl.querySelectorAll('[data-f]')) out[field.dataset.f] = field.value;
        return out;
    }

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
        const settings = getSettings();
        const preset = settings.presets.find(p => p.id === editingId);
        if (!preset) return;
        if (preset.builtIn) {
            toastr.info('Встроенный шаблон не редактируется — нажми «Дублировать»', TOAST_TITLE, { timeOut: 3500 });
            return;
        }
        const values = collectForm();
        if (!String(values.name || '').trim()) {
            toastr.error('У шаблона должно быть название', TOAST_TITLE);
            return;
        }
        Object.assign(preset, { name: values.name.trim(), instruction: values.instruction });
        saveSettings();
        renderList();
        refreshPresetSelect();
        toastr.success('Шаблон сохранён', TOAST_TITLE, { timeOut: 1500 });
    });

    overlay.querySelector('[data-act="new"]').addEventListener('click', () => {
        const id = newPresetId('preset');
        getSettings().presets.push({ id, name: 'Новый шаблон', instruction: '' });
        editingId = id;
        saveSettings();
        renderList();
        renderForm();
        refreshPresetSelect();
    });

    overlay.querySelector('[data-act="duplicate"]').addEventListener('click', () => {
        const settings = getSettings();
        const source = settings.presets.find(p => p.id === editingId);
        if (!source) return;
        const copy = structuredClone(source);
        copy.id = newPresetId(source.id);
        copy.name = `${source.name} — копия`;
        delete copy.builtIn;
        settings.presets.push(copy);
        editingId = copy.id;
        saveSettings();
        renderList();
        renderForm();
        refreshPresetSelect();
    });

    overlay.querySelector('[data-act="delete"]').addEventListener('click', () => {
        const settings = getSettings();
        if (settings.presets.length <= 1) return;
        const index = settings.presets.findIndex(p => p.id === editingId);
        if (index === -1) return;
        const [removedPreset] = settings.presets.splice(index, 1);
        if (removedPreset.builtIn) {
            if (!Array.isArray(settings.removedBuiltIns)) settings.removedBuiltIns = [];
            if (!settings.removedBuiltIns.includes(removedPreset.id)) settings.removedBuiltIns.push(removedPreset.id);
        }
        if (settings.activePresetId === removedPreset.id) settings.activePresetId = settings.presets[0].id;
        editingId = settings.presets[0].id;
        saveSettings();
        renderList();
        renderForm();
        refreshPresetSelect();
        toastr.info(`Шаблон «${removedPreset.name}» удалён`, TOAST_TITLE, { timeOut: 2000 });
    });

    overlay.querySelector('[data-act="export"]').addEventListener('click', () => {
        const payload = JSON.stringify({ reelTemplates: 1, presets: getSettings().presets }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `reel-templates-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    const importInput = overlay.querySelector('.reel-import-input');
    overlay.querySelector('[data-act="import"]').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const incoming = Array.isArray(parsed) ? parsed : parsed?.presets;
            if (!Array.isArray(incoming) || incoming.length === 0) throw new Error('в файле нет шаблонов');
            const settings = getSettings();
            let added = 0;
            for (const raw of incoming) {
                if (!raw || typeof raw !== 'object' || !raw.instruction) continue;
                // Импорт всегда добавляет, а не заменяет: свои шаблоны дороже.
                const preset = {
                    id: newPresetId(raw.name || raw.id || 'imported'),
                    name: String(raw.name || 'Импортированный'),
                    instruction: String(raw.instruction || ''),
                };
                settings.presets.push(preset);
                editingId = preset.id;
                added++;
            }
            if (!added) throw new Error('ни один шаблон не подошёл по формату');
            saveSettings();
            renderList();
            renderForm();
            refreshPresetSelect();
            toastr.success(`Импортировано шаблонов: ${added}`, TOAST_TITLE, { timeOut: 2500 });
        } catch (error) {
            toastr.error(`Не удалось импортировать: ${error?.message}`, TOAST_TITLE, { timeOut: 5000 });
        } finally {
            importInput.value = '';
        }
    });

    renderList();
    renderForm();
}

// ═══════════════════════════════════════════════════════════════════════
// События
// ═══════════════════════════════════════════════════════════════════════

/** Настоящий ли это ответ модели, который стоит рисовать. */
function isCatchableReply(messageId, renderType) {
    if (!CATCH_TYPES.has(renderType)) {
        reelLog('INFO', `#${messageId}: пропуск, тип «${renderType}» — не ответ модели`);
        return false;
    }
    const message = getContext().chat?.[Number(messageId)];
    if (!message || message.is_user || message.is_system) return false;
    const text = String(message.mes || '').trim();
    if (!text || text === '...' || text.length < 5) {
        reelLog('INFO', `#${messageId}: пропуск, пустой пост`);
        return false;
    }
    return true;
}

async function onCharacterMessageRendered(messageId, renderType) {
    if (!getSettings().enabled) return;
    if (!isCatchableReply(messageId, renderType)) return;
    if (!isAutoOn()) return;
    runAssemble(Number(messageId));
}

function onChatChanged() {
    abortAllJobs();
    state.epoch += 1;
    state.chatId = getCurrentChatId();
    state.viewMessageId = null;
    state.editing = false;
    reelLog('INFO', `Смена чата → ${state.chatId || 'лендинг'}, эпоха ${state.epoch}`);
    refreshChatControls();
    ensureLaunchers();
    renderWindow();
    // Таверна дорисовывает сообщения после события — подхватываем позицию
    // и раскладываем почту чуть позже.
    const epoch = state.epoch;
    setTimeout(() => {
        if (epoch !== state.epoch) return;
        followScroll();
        deliverMailbox();
    }, 400);
}

function onMessageSwiped(messageId) {
    const id = Number(messageId);
    const message = getContext().chat?.[id];
    if (message && getSettings().debug) {
        const data = readSwipeData(message);
        reelLog('INFO', `Свайп #${id}[${getCurrentSwipeIdx(message)}]:`, data ? `status=${data.status}` : 'нет данных');
    }
    if (id === state.viewMessageId) {
        state.editing = false;
        renderWindow();
    }
}

function onMessageDeleted() {
    // Номер сообщения в окне мог уехать или исчезнуть.
    state.viewMessageId = null;
    state.editing = false;
    renderWindow();
    followScroll();
}

// ═══════════════════════════════════════════════════════════════════════
// Панель настроек
// ═══════════════════════════════════════════════════════════════════════

function buildSettingsPanel() {
    const container = document.getElementById('extensions_settings');
    if (!container || document.getElementById('reel_settings_root')) return;

    const settings = getSettings();
    const html = `
        <div id="reel_settings_root" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-film" style="margin-right: 6px;"></i>⊹ REEL ⊹</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="reel-settings">
                    <p class="reel-intro">Кинематографичный коллаж к ответу модели — в своём окне. Пост целиком уходит в нано-банану по шаблону, раскадровку на три панели она делает сама. Независим от Frameweaver, Sideweaver и Glintweaver.</p>

                    <label class="checkbox_label">
                        <input type="checkbox" id="reel_enabled" ${settings.enabled ? 'checked' : ''}>
                        <span>Включено</span>
                    </label>

                    <label for="reel_launcher_mode" class="reel-label">Кнопка вызова</label>
                    <select id="reel_launcher_mode" class="text_pole">
                        <option value="bar" ${settings.launcherMode === 'bar' ? 'selected' : ''}>В быстрых ответах</option>
                        <option value="floating" ${settings.launcherMode === 'floating' ? 'selected' : ''}>Плавающая кнопка</option>
                        <option value="both" ${settings.launcherMode === 'both' ? 'selected' : ''}>Обе</option>
                    </select>
                    <div class="reel-hint">Если быстрые ответы выключены, кнопки там не будет — выбери плавающую.</div>

                    <div class="reel-section">
                        <label class="checkbox_label">
                            <input type="checkbox" id="reel_auto_chat">
                            <span>Авто в этом чате</span>
                        </label>
                        <div class="reel-hint" id="reel_auto_hint"></div>
                    </div>

                    <label for="reel_preset" class="reel-label">Шаблон</label>
                    <select id="reel_preset" class="text_pole"></select>
                    <div class="menu_button menu_button_icon" id="reel_manage_presets" style="margin-top: 6px;">
                        <i class="fa-solid fa-sliders"></i>
                        <span>Управление шаблонами</span>
                    </div>

                    <div class="reel-group-title">Банана</div>

                    <label for="reel_provider" class="reel-label">Кто рисует</label>
                    <select id="reel_provider" class="text_pole">
                        <option value="naistera" ${settings.provider === 'naistera' ? 'selected' : ''}>Наистера</option>
                        <option value="local" ${settings.provider === 'local' ? 'selected' : ''}>Локальная прокся</option>
                    </select>

                    <div id="reel_naistera_block" class="reel-subsection" ${settings.provider === 'naistera' ? '' : 'hidden'}>
                        <label for="reel_naistera_key" class="reel-label">Ключ Наистеры</label>
                        <input type="password" id="reel_naistera_key" class="text_pole" autocomplete="off" value="${escapeHtml(settings.naisteraKey)}">
                        <div class="reel-hint">Свой, отдельный от Frameweaver — можно тот же ключ, можно другой.</div>

                        <label for="reel_naistera_endpoint" class="reel-label">Endpoint URL</label>
                        <input type="text" id="reel_naistera_endpoint" class="text_pole" autocomplete="off" placeholder="${DEFAULT_NAISTERA_ENDPOINT}" value="${escapeHtml(settings.naisteraEndpoint)}">
                        <div class="reel-hint">Пусто — ${DEFAULT_NAISTERA_ENDPOINT}.</div>

                        <label for="reel_naistera_model" class="reel-label">Модель</label>
                        <div class="reel-model-row">
                            <select id="reel_naistera_model" class="text_pole"></select>
                            <button type="button" class="reel-icon" data-refresh="naistera" title="Подтянуть список моделей"><i class="fa-solid fa-rotate"></i></button>
                        </div>
                    </div>

                    <div id="reel_local_block" class="reel-subsection" ${settings.provider === 'local' ? '' : 'hidden'}>
                        <label for="reel_local_endpoint" class="reel-label">Endpoint URL</label>
                        <input type="text" id="reel_local_endpoint" class="text_pole" autocomplete="off" placeholder="${DEFAULT_LOCAL_ENDPOINT}" value="${escapeHtml(settings.localEndpoint)}">
                        <div class="reel-hint">Адрес из консоли прокси. Пусто — ${DEFAULT_LOCAL_ENDPOINT}.</div>

                        <label for="reel_local_key" class="reel-label">Ключ</label>
                        <input type="password" id="reel_local_key" class="text_pole" autocomplete="off" value="${escapeHtml(settings.localKey)}">
                        <div class="reel-hint">Тот, что ты задала в прокси.</div>

                        <label for="reel_local_model" class="reel-label">Модель</label>
                        <div class="reel-model-row">
                            <select id="reel_local_model" class="text_pole"></select>
                            <button type="button" class="reel-icon" data-refresh="local" title="Подтянуть список моделей"><i class="fa-solid fa-rotate"></i></button>
                        </div>
                        <div class="reel-hint">Консоль должна быть запущена, иначе список не подтянется.</div>

                        <label for="reel_image_size" class="reel-label">Размер</label>
                        <select id="reel_image_size" class="text_pole">
                            ${IMAGE_SIZES.map(size => `<option value="${size}" ${settings.imageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
                        </select>
                        <div class="reel-hint">Наистера размер выбирает сама, поэтому только здесь. Твои примеры — это 1K.</div>
                    </div>

                    <label for="reel_aspect" class="reel-label">Соотношение сторон</label>
                    <select id="reel_aspect" class="text_pole">
                        ${ASPECT_RATIOS.map(ar => `<option value="${ar}" ${settings.aspectRatio === ar ? 'selected' : ''}>${escapeHtml(ASPECT_LABELS[ar])}</option>`).join('')}
                    </select>

                    <label class="checkbox_label reel-section">
                        <input type="checkbox" id="reel_send_refs" ${settings.sendRefs ? 'checked' : ''}>
                        <span>Отправлять рефы персонажей</span>
                    </label>
                    <div class="reel-hint">Рефы загружаются в окне, в панели ⚙ «Персонажи этого чата». Можно забрать из Frameweaver одной кнопкой.</div>

                    <div class="reel-group-title">Раскладки панелей</div>

                    <label class="checkbox_label">
                        <input type="checkbox" id="reel_random_layout" ${settings.randomLayout ? 'checked' : ''}>
                        <span>🎲 Рандомная раскладка</span>
                    </label>
                    <div class="reel-hint">Каждый дубль — случайная раскладка из списка, две одинаковые подряд не выпадают. Выключено — банана выбирает сама.</div>

                    <textarea id="reel_layouts" class="text_pole reel-jb-text" rows="8" spellcheck="false">${escapeHtml(settings.layouts)}</textarea>
                    <div class="reel-hint">Одна раскладка на строку: «Название | текст для бананы». Встаёт в шаблон вместо {{layout}}.</div>
                    <div class="menu_button menu_button_icon" id="reel_layouts_reset" style="margin-top: 6px;">
                        <i class="fa-solid fa-rotate-left"></i><span>Вернуть встроенные раскладки</span>
                    </div>

                    <div class="reel-group-title">Стили</div>
                    <div id="reel_styles_list" class="reel-styles-list"></div>
                    <div class="reel-style-btns">
                        <div class="menu_button menu_button_icon" id="reel_style_add">
                            <i class="fa-solid fa-plus"></i><span>Новый стиль</span>
                        </div>
                        <div class="menu_button menu_button_icon" id="reel_style_import">
                            <i class="fa-solid fa-file-import"></i><span>Импорт из Frameweaver</span>
                        </div>
                    </div>
                    <input type="file" id="reel_style_import_file" accept="application/json,.json" hidden>
                    <div class="reel-hint">Стиль дописывается абзацем перед шаблоном. Шаблон и так задаёт плёнку и цвет, поэтому по умолчанию — без стиля.</div>

                    <div class="reel-group-title">Черновик внешности</div>
                    <label for="reel_profile" class="reel-label">Профиль подключения</label>
                    <select id="reel_profile" class="text_pole"></select>
                    <div class="reel-hint" id="reel_profile_hint">Нужен только кнопке «✨ Предложить по карточке» в панели персонажей. Пусто — текущее подключение таверны.</div>

                    <label class="checkbox_label reel-section">
                        <input type="checkbox" id="reel_debug" ${settings.debug ? 'checked' : ''}>
                        <span>Подробные логи в консоль</span>
                    </label>
                </div>
            </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', html);
    refreshPresetSelect();
    refreshModelDatalists();

    document.getElementById('reel_enabled').addEventListener('change', (e) => {
        getSettings().enabled = !!e.target.checked;
        saveSettings();
        ensureLaunchers();
        renderWindow();
    });

    document.getElementById('reel_launcher_mode').addEventListener('change', (e) => {
        const value = e.target.value;
        getSettings().launcherMode = ['bar', 'floating', 'both'].includes(value) ? value : 'bar';
        saveSettings();
        ensureLaunchers();
    });

    document.getElementById('reel_auto_chat').addEventListener('change', async (e) => {
        const ok = await setAuto(e.target.checked);
        if (!ok) e.target.checked = false;
        refreshChatControls();
    });

    document.getElementById('reel_preset').addEventListener('change', (e) => {
        getSettings().activePresetId = e.target.value;
        saveSettings();
        refreshPresetSelect();
    });

    document.getElementById('reel_manage_presets').addEventListener('click', openPresetManager);

    document.getElementById('reel_provider').addEventListener('change', (e) => {
        const provider = e.target.value === 'local' ? 'local' : 'naistera';
        getSettings().provider = provider;
        saveSettings();
        document.getElementById('reel_naistera_block').hidden = provider !== 'naistera';
        document.getElementById('reel_local_block').hidden = provider !== 'local';
    });

    const bindText = (id, key) => {
        document.getElementById(id).addEventListener('change', (e) => {
            getSettings()[key] = String(e.target.value || '').trim();
            saveSettings();
        });
    };
    bindText('reel_naistera_key', 'naisteraKey');
    bindText('reel_naistera_endpoint', 'naisteraEndpoint');
    bindText('reel_local_key', 'localKey');
    bindText('reel_local_endpoint', 'localEndpoint');

    // Сменили адрес или ключ — старый список моделей и выученные обходы больше не верны.
    for (const id of ['reel_naistera_key', 'reel_naistera_endpoint']) {
        document.getElementById(id).addEventListener('change', () => {
            state.naisteraCatalogTried = false;
            state.naisteraLegacyRefs = false;
        });
    }
    document.getElementById('reel_local_endpoint').addEventListener('change', () => { state.localCompatible = false; });

    document.getElementById('reel_naistera_model').addEventListener('change', (e) => {
        getSettings().naisteraModel = e.target.value;
        saveSettings();
    });
    document.getElementById('reel_local_model').addEventListener('change', (e) => {
        getSettings().localModel = e.target.value;
        saveSettings();
    });

    for (const button of document.querySelectorAll('#reel_settings_root [data-refresh]')) {
        button.addEventListener('click', () => refreshCatalog(button.dataset.refresh, button));
    }

    document.getElementById('reel_image_size').addEventListener('change', (e) => {
        getSettings().imageSize = IMAGE_SIZES.includes(e.target.value) ? e.target.value : defaultSettings.imageSize;
        saveSettings();
    });

    document.getElementById('reel_aspect').addEventListener('change', (e) => {
        getSettings().aspectRatio = ASPECT_RATIOS.includes(e.target.value) ? e.target.value : defaultSettings.aspectRatio;
        saveSettings();
    });

    document.getElementById('reel_send_refs').addEventListener('change', (e) => {
        getSettings().sendRefs = !!e.target.checked;
        saveSettings();
    });

    document.getElementById('reel_random_layout').addEventListener('change', (e) => {
        getSettings().randomLayout = !!e.target.checked;
        saveSettings();
    });

    const layoutsInput = document.getElementById('reel_layouts');
    layoutsInput.addEventListener('change', (e) => {
        getSettings().layouts = String(e.target.value || '');
        saveSettings();
        if (!parseLayouts(getSettings().layouts).length) {
            toastr.warning('Список раскладок пуст — банана будет выбирать сама', TOAST_TITLE, { timeOut: 3500 });
        }
    });
    document.getElementById('reel_layouts_reset').addEventListener('click', async () => {
        const context = getContext();
        const answer = await context.callGenericPopup('Вернуть встроенные раскладки? Твои правки в списке пропадут.', context.POPUP_TYPE.CONFIRM);
        if (answer !== context.POPUP_RESULT.AFFIRMATIVE) return;
        getSettings().layouts = DEFAULT_LAYOUTS;
        layoutsInput.value = DEFAULT_LAYOUTS;
        state.lastLayoutIdx = -1;
        saveSettings();
    });

    document.getElementById('reel_style_add').addEventListener('click', () => {
        const style = { id: newStyleId(), name: 'Новый стиль', tags: '' };
        getSettings().styles.push(style);
        saveSettings();
        renderStylesList(style.id);
        renderWindow();
    });

    const importFile = document.getElementById('reel_style_import_file');
    document.getElementById('reel_style_import').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        importFile.value = '';
        if (file) await importStylesFromFile(file);
    });

    renderStylesList();

    document.getElementById('reel_debug').addEventListener('change', (e) => {
        getSettings().debug = !!e.target.checked;
        saveSettings();
    });

    setupProfileDropdown();
    refreshChatControls();
}

// ─── Модели ──────────────────────────────────────────────────────────────

/**
 * Выпадашки моделей: список провайдера плюс сохранённая модель, даже если
 * её в списке нет — чтобы рабочий выбор не подменился молча.
 */
function refreshModelDatalists() {
    const settings = getSettings();
    const fill = (selectId, provider, saved) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const ids = [...state.catalogs[provider]];
        if (saved && !ids.includes(saved)) ids.unshift(saved);
        select.innerHTML = ids.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
        if (saved) select.value = saved;
    };
    fill('reel_naistera_model', 'naistera', String(settings.naisteraModel || ''));
    fill('reel_local_model', 'local', String(settings.localModel || ''));
}

async function refreshCatalog(provider, button = null, { silent = false } = {}) {
    if (button) button.disabled = true;
    try {
        const ids = await fetchCatalog(provider);
        state.catalogs[provider] = ids;
        if (provider === 'naistera') state.naisteraCatalogTried = true;
        refreshModelDatalists();
        if (!silent) {
            if (ids.length) toastr.success(`Моделей: ${ids.length}`, TOAST_TITLE, { timeOut: 2000 });
            else toastr.warning('Провайдер вернул пустой список', TOAST_TITLE, { timeOut: 3500 });
        }
    } catch (error) {
        reelLog('WARN', `Список моделей (${provider}) не загрузился:`, error);
        if (!silent) toastr.error(`Список моделей не загрузился (${String(error?.message || error).slice(0, 160)})`, TOAST_TITLE, { timeOut: 6000 });
    } finally {
        if (button) button.disabled = false;
    }
}

// ─── Стили ───────────────────────────────────────────────────────────────

function newStyleId() {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Список стилей в настройках: каждый сворачивается, раскрыт только нужный. */
function renderStylesList(openId = null) {
    const list = document.getElementById('reel_styles_list');
    if (!list) return;
    const styles = getSettings().styles;
    if (!styles.length) {
        list.innerHTML = '<div class="reel-hint">Стилей пока нет.</div>';
        return;
    }
    list.innerHTML = styles.map(style => `
        <details class="reel-style-item" data-id="${escapeHtml(style.id)}" ${style.id === openId ? 'open' : ''}>
            <summary>${escapeHtml(style.name || 'Без названия')}</summary>
            <div class="reel-style-body">
                <div class="reel-style-top">
                    <input type="text" class="text_pole" data-f="name" value="${escapeHtml(style.name)}" placeholder="Название">
                    <button type="button" class="reel-icon" data-act="remove" title="Удалить"><i class="fa-solid fa-trash"></i></button>
                </div>
                <textarea class="text_pole reel-jb-text" data-f="tags" rows="4" spellcheck="false" placeholder="теги стиля через запятую">${escapeHtml(style.tags)}</textarea>
            </div>
        </details>`).join('');

    for (const item of list.querySelectorAll('.reel-style-item')) {
        const style = () => getSettings().styles.find(s => s.id === item.dataset.id);
        item.querySelector('[data-f="name"]').addEventListener('change', (e) => {
            const target = style();
            if (!target) return;
            target.name = String(e.target.value || '').trim() || 'Без названия';
            item.querySelector('summary').textContent = target.name;
            saveSettings();
            renderWindow();
        });
        item.querySelector('[data-f="tags"]').addEventListener('change', (e) => {
            const target = style();
            if (!target) return;
            target.tags = String(e.target.value || '').trim();
            saveSettings();
        });
        item.querySelector('[data-act="remove"]').addEventListener('click', () => {
            const settings = getSettings();
            settings.styles = settings.styles.filter(s => s.id !== item.dataset.id);
            if (settings.activeStyleId === item.dataset.id) settings.activeStyleId = '';
            saveSettings();
            renderStylesList();
            renderWindow();
        });
    }
}

/** Импорт из файла экспорта Фреймвивера: список с галками. */
async function importStylesFromFile(file) {
    let incoming;
    try {
        const parsed = JSON.parse(await file.text());
        const raw = Array.isArray(parsed) ? parsed : parsed?.styles;
        incoming = (Array.isArray(raw) ? raw : [])
            .map(s => ({ name: String(s?.name || '').trim(), tags: String(s?.value ?? s?.tags ?? '').trim() }))
            .filter(s => s.tags);
        if (!incoming.length) throw new Error('в файле нет стилей');
    } catch (error) {
        toastr.error(`Не удалось прочитать файл: ${error?.message}`, TOAST_TITLE, { timeOut: 5000 });
        return;
    }

    document.getElementById('reel_import_overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'reel_import_overlay';
    overlay.className = 'reel-popup-ov';
    overlay.innerHTML = `
        <div class="reel-popup reel-import" role="dialog" aria-label="Импорт стилей">
            <div class="reel-popup-head">
                <div class="reel-popup-title">⊹ Импорт стилей ⊹</div>
                <button class="reel-popup-x" type="button" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="reel-import-list">
                ${incoming.map((s, i) => `
                    <label class="checkbox_label reel-import-item">
                        <input type="checkbox" data-i="${i}" ${/novel|\bnai\b/i.test(s.name) ? '' : 'checked'}>
                        <span>${escapeHtml(s.name || 'Без названия')}</span>
                    </label>`).join('')}
            </div>
            <div class="reel-popup-btns">
                <button class="reel-pbtn primary" data-act="import">Импортировать</button>
                <button class="reel-pbtn ghost" data-act="close">Отмена</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.reel-popup-x').addEventListener('click', close);
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('[data-act="import"]').addEventListener('click', () => {
        const picked = [...overlay.querySelectorAll('input[data-i]:checked')].map(el => incoming[Number(el.dataset.i)]);
        // Импорт всегда добавляет, ничего не заменяет.
        const settings = getSettings();
        for (const s of picked) settings.styles.push({ id: newStyleId(), name: s.name || 'Без названия', tags: s.tags });
        saveSettings();
        close();
        renderStylesList();
        renderWindow();
        toastr.success(`Импортировано стилей: ${picked.length}`, TOAST_TITLE, { timeOut: 2500 });
    });
}

/** Выпадашку профилей рисует и обновляет сама таверна (как в борде). */
function setupProfileDropdown() {
    const context = getContext();
    const hint = document.getElementById('reel_profile_hint');
    try {
        context.ConnectionManagerRequestService.handleDropdown(
            '#reel_profile',
            getSettings().profileId,
            (profile) => {
                getSettings().profileId = profile?.id || '';
                saveSettings();
                reelLog('INFO', `Выбран профиль: ${profile?.name || 'текущее подключение'}`);
            },
        );
    } catch (error) {
        reelLog('WARN', 'Профили подключений недоступны:', error?.message);
        const select = document.getElementById('reel_profile');
        if (select) select.style.display = 'none';
        if (hint) hint.textContent = 'Connection Manager отключён — будет использовано текущее подключение таверны.';
    }
}

/** Галки «Авто» (в панели и в окне) отражают текущий чат; на лендинге неактивны. */
function refreshChatControls() {
    const hasChat = !!getCurrentChatId();
    const on = hasChat && isAutoOn();
    for (const id of ['reel_auto_chat', 'reel_win_auto']) {
        const checkbox = document.getElementById(id);
        if (!checkbox) continue;
        checkbox.disabled = !hasChat;
        checkbox.checked = on;
    }
    const hint = document.getElementById('reel_auto_hint');
    if (hint) {
        hint.textContent = hasChat
            ? 'Запоминается отдельно для каждого чата.'
            : 'Открой чат, чтобы включить.';
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Запуск
// ═══════════════════════════════════════════════════════════════════════

jQuery(async () => {
    const context = getContext();
    const types = context.event_types;

    getSettings();
    buildSettingsPanel();
    buildWindow();
    watchQuickReplyBar();

    state.chatId = getCurrentChatId();

    context.eventSource.on(types.CHAT_CHANGED, onChatChanged);
    context.eventSource.on(types.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
    if (types.MESSAGE_SWIPED) context.eventSource.on(types.MESSAGE_SWIPED, onMessageSwiped);
    if (types.MESSAGE_DELETED) context.eventSource.on(types.MESSAGE_DELETED, onMessageDeleted);

    refreshChatControls();
    renderWindow();
    setTimeout(() => { followScroll(); deliverMailbox(); }, 400);

    // Тихо подтягиваем список моделей активного провайдера: локалка может
    // быть выключена, Наистера — без ключа, тогда просто остаётся сохранённая.
    const settings = getSettings();
    if (settings.provider === 'local') refreshCatalog('local', null, { silent: true });
    else if (String(settings.naisteraKey || '').trim()) refreshCatalog('naistera', null, { silent: true });
    reelLog('INFO', 'Загружено');
});
