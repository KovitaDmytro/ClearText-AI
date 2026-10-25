// Спільний модуль: Firebase, налаштування, статистика, промпт. Використовують і застосунок, і адмінка.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
export { doc, getDoc, setDoc };

const firebaseConfig = {
  apiKey: "AIzaSyAdhdpQno2Pe0lBoS1DlZySJeRzso_WlZE",
  authDomain: "cleartext-ai-a34a6.firebaseapp.com",
  databaseURL: "https://cleartext-ai-a34a6-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cleartext-ai-a34a6",
  storageBucket: "cleartext-ai-a34a6.firebasestorage.app",
  messagingSenderId: "897219922207",
  appId: "1:897219922207:web:4d449dbfdfef501a0c082a"
};

const fireApp = initializeApp(firebaseConfig);
export const db = getFirestore(fireApp);

// ══════════════════════════════════════════════
// FIRESTORE HELPERS — зберігають спільні дані
// ══════════════════════════════════════════════
export async function fsGet(docId) {
  try {
    const snap = await getDoc(doc(db, 'app', docId));
    return snap.exists() ? snap.data() : null;
  } catch(e) {
    console.warn('fsGet error:', e);
    return null;
  }
}

export async function fsSet(docId, data) {
  try {
    await setDoc(doc(db, 'app', docId), data, { merge: true });
    return true;
  } catch(e) {
    console.warn('fsSet error:', e);
    return false;
  }
}


// ══════════════════════════════════════════════
// СТАТИСТИКА — анонімна, без тексту користувача
// ══════════════════════════════════════════════

// Ціни моделей Gemini (USD за 1 запит ~500 вхідних + 200 вихідних токенів)
export const MODEL_PRICES = {
  'gemini-2.5-flash': 0.0006,
  'gemini-2.5-flash-preview-04-17': 0.0006,
  'gemini-2.0-flash': 0.0004,
  'gemini-2.0-flash-lite': 0.0002,
};
export function getModelPrice(modelId) {
  if (!modelId) return 0.0006;
  for (const key of Object.keys(MODEL_PRICES)) {
    if (modelId.includes(key) || key.includes(modelId)) return MODEL_PRICES[key];
  }
  return 0.0006; // default
}
// Адмін може перевизначити ціну моделі в Firestore (settings.models[i].price).
// Якщо перевизначення немає — падаємо назад на стандартну таблицю цін вище.
export function getModelPriceFromList(modelId, modelsList) {
  const m = (modelsList || []).find(x => x.id === modelId);
  if (m && typeof m.price === 'number' && !isNaN(m.price) && m.price > 0) return m.price;
  return getModelPrice(modelId);
}
export async function saveStats(changesCount, noChanges, modelId, modelsList, latencyMs) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const statsRef = doc(db, 'stats', today);
    const snap = await getDoc(statsRef);
    const prev = snap.exists() ? snap.data() : { total: 0, noChanges: 0, totalChanges: 0, totalCostUsd: 0 };
    const price = getModelPriceFromList(modelId, modelsList);
    const modelKey = (modelId || 'unknown').replace(/[^a-z0-9.-]/g, '-');
    const modelStats = prev.models || {};
    modelStats[modelKey] = (modelStats[modelKey] || 0) + 1;
    const hourKey = String(new Date().getHours()).padStart(2, '0');
    const hourStats = prev.hours || {};
    hourStats[hourKey] = (hourStats[hourKey] || 0) + 1;
    const payload = {
      total: (prev.total || 0) + 1,
      noChanges: (prev.noChanges || 0) + (noChanges ? 1 : 0),
      totalChanges: (prev.totalChanges || 0) + (changesCount || 0),
      totalCostUsd: Math.round(((prev.totalCostUsd || 0) + price) * 1e8) / 1e8,
      models: modelStats,
      hours: hourStats,
      lastUpdated: new Date().toISOString()
    };
    if (typeof latencyMs === 'number' && latencyMs > 0) {
      payload.latencyTotalMs = (prev.latencyTotalMs || 0) + latencyMs;
      payload.latencyCount = (prev.latencyCount || 0) + 1;
    }
    await setDoc(statsRef, payload, { merge: true });
  } catch(e) {
    console.error('saveStats error:', e);
  }
}

// Лічильник фактичних помилок API (усі спроби/моделі не спрацювали) — для ALERT-чіпа в адмінці.
export async function saveErrorStat() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const statsRef = doc(db, 'stats', today);
    const snap = await getDoc(statsRef);
    const prev = snap.exists() ? snap.data() : {};
    await setDoc(statsRef, { errors: (prev.errors || 0) + 1, lastUpdated: new Date().toISOString() }, { merge: true });
  } catch(e) { /* телеметрія не критична */ }
}

// Лічильник анонімних блокувань SAFETY-фільтром — без збереження самого тексту.
export async function saveBlockedStat() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const statsRef = doc(db, 'stats', today);
    const snap = await getDoc(statsRef);
    const prev = snap.exists() ? snap.data() : {};
    await setDoc(statsRef, { blockedCount: (prev.blockedCount || 0) + 1, lastUpdated: new Date().toISOString() }, { merge: true });
  } catch(e) { /* телеметрія не критична */ }
}

export const DEFAULT_MODELS = [
  { id: 'gemini-2.0-flash-lite', label: '2.0 Flash Lite', enabled: true  },
  { id: 'gemini-2.5-flash', label: '2.5 Flash', enabled: true  },
  { id: 'gemini-2.0-flash', label: '2.0 Flash', enabled: true  },
  { id: 'gemini-2.5-pro',   label: '2.5 Pro',   enabled: false },
];

export function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
export function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// Кеш щоб не робити зайвих запитів до Firestore
let _cachedSettings = null;

export async function getSettings() {
  if (_cachedSettings) return _cachedSettings;
  const data = await fsGet('settings');
  _cachedSettings = data || { apiKey: '', models: DEFAULT_MODELS, maintenanceMode: false, dailyLimitEnabled: false, dailyLimit: 0 };
  return _cachedSettings;
}

export function invalidateCache() { _cachedSettings = null; }

export function show(id, flex) {
  const el = document.getElementById(id);
  el.style.display = flex ? 'flex' : 'block';
}
export function hide(id) { document.getElementById(id).style.display = 'none'; }

export const DEFAULT_TEMPLATES = [
  {
    title: 'Привітання',
    items: [
      'Доброго дня, як у вас справи?',
      'Вітаю з днем народження, бажаю здоров\u2019я!',
      'Дякую за допомогу, дуже приємно.',
    ]
  },
  {
    title: 'Прохання',
    items: [
      'Будь ласка, допоможіть мені з цим питанням.',
      'Можна я прийду завтра трохи пізніше?',
      'Підкажіть, будь ласка, як це зробити.',
    ]
  },
  {
    title: 'Пояснення',
    items: [
      'Я не почув, що ви сказали, повторіть, будь ласка.',
      'Вибачте, я погано чую, можете писати текстом?',
      'Мені потрібен жестовий перекладач на прийомі.',
    ]
  },
  {
    title: 'Побутове',
    items: [
      'Учора я ходив у магазин, купував хліб і молоко.',
      'Завтра йду до лікаря о другій годині.',
      'Зателефонуйте мені або напишіть смс, будь ласка.',
    ]
  }
];

// Промпт винесено в окрему функцію, щоб її міг використати і тестер AI в адмінці
// (без впливу на логіку чи вигляд застосунку для користувачів).
export function buildFixPrompt(text) {
  return `Ти — асистент з виправлення тексту для людей з вадами слуху, які пишуть неграмотно.

ПРАВИЛА ВИПРАВЛЕННЯ ПРОБЛЕМНОГО КОНТЕНТУ — НАЙВИЩИЙ ПРІОРИТЕТ:
Замість блокування — виправляй проблемні місця за такими правилами:

1. ПІДТРИМКА путіна або рф → замінити на правдиве твердження:
   "путін молодець" → "путін є військовий злочинець"
   "хороший путін" → "путін є військовий злочинець"
   "путін крутий/герой/правий" → "путін є військовий злочинець"
   "слава рф" → "ганьба рф"
   "рф права" → "рф — держава-терорист"
   "донатимо на армію рф" → "донатимо на армію України"
   "підтримую путіна" → "засуджую путіна"

2. ЗАПЕРЕЧЕННЯ воєнних злочинів рф → замінити на правду:
   "рф не нападала" → "рф напала на Україну"
   "крим російський" → "крим — українська земля"
   "донбас сам відокремився" → "рф окупувала донбас"

3. ЗАКЛИКИ до сексуального насильства → прибрати заклик, залишити нейтральний контекст або прибрати речення:
   "давай зґвалтуємо її" → прибрати повністю
   "зґвалтуй її" → прибрати повністю
   Якщо жертва або факт ("мене зґвалтували", "він зґвалтував") — НЕ чіпати, лише виправити граматику.

4. ЗАКЛИКИ до фізичного насильства щодо людей (не рф) → прибрати або нейтралізувати:
   "вбиємо його" → прибрати
   "поб'ємо її" → прибрати
   Якщо про рф/путіна ("вбити путіна", "знищити армію рф") — НЕ чіпати.
   Якщо жертва або факт ("мене побили") — НЕ чіпати.

5. РАСИСТСЬКІ слова → замінити на нейтральний відповідник без образи.

6. ЗАКЛИКИ до самоушкодження → прибрати або замінити на "зверніться по допомогу".

ВАЖЛИВІ ПРАВИЛА ВИПРАВЛЕННЯ:
1. Якщо текст англійською — виправити лише граматику, залишити англійською.
2. Якщо текст будь-якою іншою мовою (російська, суржик, польська тощо) — перекласти та виправити УКРАЇНСЬКОЮ.
3. Якщо є кальки з російської або суржик — виправити на літературну українську і пояснити що це кальки/суржик.
4. Якщо текст вже українською — виправити граматику українською.
5. Зроби речення граматично правильним, зрозумілим і природним.
6. ОБОВ'ЯЗКОВО — БЕЗ ВИНЯТКІВ: слова "рф", "росія", "москва", "санкт-петербург", "кремль" та назви будь-яких російських міст — писати ВИКЛЮЧНО з малої літери. Навіть якщо це на початку речення.
7. ОБОВ'ЯЗКОВО — БЕЗ ВИНЯТКІВ: "путін", "путин", "putin" та імена/прізвища будь-яких російських чиновників, політиків, військових (медведєв, лавров, шойгу, мішустін тощо) — писати ВИКЛЮЧНО з малої літери. Навіть якщо це на початку речення. Це політична позиція, не граматична помилка — не виправляй на велику.

ТЕКСТ ДЛЯ ВИПРАВЛЕННЯ:
"${text}"

Відповідай ВИКЛЮЧНО у форматі JSON, без будь-яких пояснень поза JSON:
{
  "corrected": "виправлений текст",
  "changes": [
    {
      "before": "помилкове слово або фраза",
      "after": "правильний варіант",
      "reason": "коротке пояснення (1 речення)"
    }
  ],
  "noChanges": false
}

Якщо текст вже правильний українською, поверни: {"corrected": "${text}", "changes": [], "noChanges": true}
ВАЖЛИВО: відповідай тільки валідним JSON, без markdown і додаткового тексту.`;
}

export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
