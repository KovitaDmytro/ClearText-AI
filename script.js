// Застосунок для користувачів. Адмінка винесена в admin.html / admin.js.
import { db, doc, getDoc, fsGet, fsSet, getSettings, invalidateCache, show, hide, escHtml, buildFixPrompt,
         saveStats, saveErrorStat, saveBlockedStat, DEFAULT_MODELS, DEFAULT_TEMPLATES } from './shared.js';

// ══════════════════════════════════════════════
// ROUTING
// ══════════════════════════════════════════════
async function route() {
  if (!navigator.onLine) { showOffline(); return; }
  show('no-api-screen', true);
  const settings = await getSettings();
  if (settings.maintenanceMode) {
    showNoApi('maintenance');
  } else if (settings.apiKey) {
    showApp(settings);
  } else {
    showNoApi('nokey');
  }
}
window.route = route; window.hide = hide; // для inline-обробника кнопки на екрані «офлайн»

window.addEventListener('online',  () => { hide('offline-screen'); route(); });
window.addEventListener('offline', () => showOffline());

function showApp(settings) {
  hide('no-api-screen');
  hide('offline-screen');
  show('app-screen', true);
  renderAppModels(settings.models || DEFAULT_MODELS);
  renderTemplates(settings.templates);
  renderBanner(settings);
  document.getElementById('text-input').focus();
  requestAnimationFrame(() => {
    const activeBtn = document.querySelector('.tab-btn.active');
    const indicator = document.getElementById('tabIndicator');
    if (activeBtn && indicator) {
      moveTabIndicator(activeBtn, true);
    }
  });
}

function showOffline() {
  hide('no-api-screen');
  hide('app-screen');
  show('offline-screen', true);
}

function showNoApi(reason) {
  hide('app-screen');
  hide('offline-screen');
  const noKeyEl = document.getElementById('noApiTextNoKey');
  const maintEl = document.getElementById('noApiTextMaintenance');
  if (noKeyEl && maintEl) {
    const isMaintenance = reason === 'maintenance';
    noKeyEl.style.display = isMaintenance ? 'none' : 'inline';
    maintEl.style.display = isMaintenance ? 'inline' : 'none';
  }
  show('no-api-screen', true);
}

// Показ банера в застосунку користувача (викликається з showApp())
function renderBanner(settings) {
  const el = document.getElementById('appBanner');
  const textEl = document.getElementById('appBannerText');
  if (!el || !textEl) return;
  if (settings.bannerEnabled && settings.bannerText) {
    textEl.textContent = settings.bannerText;
    el.className = 'app-banner' + (settings.bannerType && settings.bannerType !== 'info' ? ' app-banner--' + settings.bannerType : '');
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}

// ══════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════
let selectedLang = 'uk';

function renderAppModels(models) {
  const sel = document.getElementById('modelSelect');
  sel.innerHTML = '';
  models.filter(m => m.enabled).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    sel.appendChild(opt);
  });
}

// ══════════════════════════════════════════════
// TAB BAR — Виправлення / Шаблони (плаваючий острівець)
// ══════════════════════════════════════════════
// ── Рідка лінза таб-бару: пружинна фізика, розтягування і «хвиля» при русі ──
function createLens() {
  const ind = document.getElementById('tabIndicator');
  const nav = document.getElementById('tabBar');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { x: 0, w: 0, sx: 1, sy: 1 };   // поточні значення
  const V = { x: 0, w: 0, sx: 0, sy: 0 };   // швидкості
  const T = { x: 0, w: 0, sx: 1, sy: 1 };   // цілі
  let k = 190, c = 15, raf = 0, last = 0, ready = false;
  let D = 0, drag = false;                                  // D — «вологість»: відблиск-роса видно лише в русі

  const step = (key, kk, cc, h) => {
    const a = -kk * (S[key] - T[key]) - cc * V[key];
    V[key] += a * h;
    S[key] += V[key] * h;
  };
  const paint = () => {
    const sp = Math.abs(V.x);
    const extra = Math.min(sp * 0.05, 40);                 // лінза розтягується у русі
    const squash = 1 - Math.min(sp / 9000, 0.1);           // і трохи сплющується
    const bw = S.w + extra, pad = (bw * S.sx - bw) / 2;     // pad — наскільки збільшення виступає з боків
    const navW = nav.offsetWidth || 0;
    let left = S.x - extra / 2;
    // лінза ніколи не виходить за межі панелі (а отже — і за межі екрана)
    if (navW) left = Math.max(3 + pad, Math.min(navW - 3 - pad - bw, left));
    ind.style.width = Math.max(0, bw) + 'px';
    ind.style.translate = left + 'px 0';
    ind.style.scale = `${S.sx} ${S.sy * squash}`;
    ind.style.setProperty('--dew', D.toFixed(3));
  };
  const settled = Td =>
    Td === 0 && D < 0.01 &&
    Math.abs(S.x - T.x) < 0.05 && Math.abs(V.x) < 0.5 &&
    Math.abs(S.w - T.w) < 0.05 && Math.abs(V.w) < 0.5 &&
    Math.abs(S.sx - T.sx) < 0.001 && Math.abs(V.sx) < 0.01 &&
    Math.abs(S.sy - T.sy) < 0.001 && Math.abs(V.sy) < 0.01;
  const frame = now => {
    const dt = Math.min((now - last) / 1000 || 0.016, 0.032);
    last = now;
    const h = dt / 2;
    const Td = (drag || Math.abs(V.x) > 40) ? 1 : 0;
    D += (Td - D) * Math.min(1, dt * (Td > D ? 14 : 5));
    for (let i = 0; i < 2; i++) {
      step('x', k, c, h); step('w', 200, 16, h);
      step('sx', 240, 17, h); step('sy', 240, 17, h);
    }
    if (settled(Td)) {
      D = 0;
      S.x = T.x; S.w = T.w; S.sx = T.sx; S.sy = T.sy;
      V.x = V.w = V.sx = V.sy = 0;
      paint(); raf = 0; return;
    }
    paint();
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const snapTo = (x, w) => {
    S.x = T.x = x; S.w = T.w = w; V.x = V.w = 0; ready = true; D = drag ? 1 : 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    paint();
  };
  return {
    to(x, w, snap) {
      if (snap || reduce || !ready) { snapTo(x, w); return; }
      T.x = x; T.w = w; k = 190; c = 15; run();
    },
    follow(x, w) {
      if (reduce || !ready) { snapTo(x, w); return; }
      T.x = x; T.w = w; k = 480; c = 36; run();
    },
    lens(on) { drag = on; T.sx = on ? 1.08 : 1; T.sy = on ? 1.3 : 1; if (reduce) { S.sx = T.sx; S.sy = T.sy; D = on ? 1 : 0; paint(); } else run(); }
  };
}
function getLens() { return window.__ctLens || (window.__ctLens = createLens()); }

function moveTabIndicator(btn, snap) {
  const nav = document.getElementById('tabBar');
  const indicator = document.getElementById('tabIndicator');
  if (!nav || !indicator || !btn || !btn.offsetWidth) return;
  // offsetLeft/offsetWidth — розміри в макеті, збільшення панелі (scale) їх не збиває
  getLens().to(btn.offsetLeft, btn.offsetWidth, snap);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelector('.app-body')?.scrollTo?.({ top: 0, behavior: 'instant' });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  moveTabIndicator(activeBtn);
  if (tabId === 'tab-speak') renderSpeakTab();
  else { stopSpeaking(); stopListening(); }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Тримаємо індикатор під активною вкладкою і при зміні розміру вікна
window.addEventListener('resize', () => {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) moveTabIndicator(activeBtn, true);
});

// Бере текст (з шаблону чи новини), переносить у поле виправлення і перемикає вкладку
function useTextInFixer(text) {
  const input = document.getElementById('text-input');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('errorBox').style.display = 'none';
  switchTab('tab-fix');
  setTimeout(() => { input.focus(); input.setSelectionRange(text.length, text.length); }, 50);
}


function renderTemplates(categories) {
  const list = document.getElementById('templates-list');
  if (!list) return;
  const cats = (categories && categories.length) ? categories : DEFAULT_TEMPLATES;
  list.innerHTML = '';
  cats.forEach(cat => {
    const block = document.createElement('div');
    block.className = 'template-cat';
    const catTitle = document.createElement('div');
    catTitle.className = 'template-cat-title';
    catTitle.textContent = cat.title;
    block.appendChild(catTitle);
    const group = document.createElement('div');
    group.className = 'template-group';
    block.appendChild(group);
    (cat.items || []).forEach(phrase => {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.innerHTML = `
        <div class="template-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></div>
        <div class="template-text">${escHtml(phrase)}</div>
        <div class="template-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>`;
      item.addEventListener('click', () => useTextInFixer(phrase));
      group.appendChild(item);
    });
    list.appendChild(block);
  });
}



document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedLang = btn.dataset.lang;
  };
});

const textInput = document.getElementById('text-input');
textInput.addEventListener('input', () => {
  const len = textInput.value.length;
  document.getElementById('charCount').textContent = `${len} / 800`;
  document.getElementById('charCount').style.setProperty('--p', Math.min(len, 800) / 800);
  if (len > 800) textInput.value = textInput.value.slice(0, 800);
});

document.getElementById('fixBtn').onclick = fixText;
textInput.addEventListener('keydown', e => { if (e.key==='Enter' && e.ctrlKey) fixText(); });


async function fixText() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.animate([{borderColor:'rgba(251,113,133,0.5)'},{borderColor:''}],{duration:400});
    return;
  }

  // Клієнтська перевірка — блокуємо одразу без запиту до API

  const settings = await getSettings();
  const apiKey = settings.apiKey;
  if (!apiKey) {
    document.getElementById('errorBox').textContent = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> API ключ не налаштовано. Зверніться до адміністратора.';
    document.getElementById('errorBox').style.display = 'block';
    return;
  }

  // Денний ліміт запитів — вмикається лише вручну адміном, за замовчуванням вимкнено
  if (settings.dailyLimitEnabled && settings.dailyLimit > 0) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const snap = await getDoc(doc(db, 'stats', today));
      const totalToday = snap.exists() ? (snap.data().total || 0) : 0;
      if (totalToday >= settings.dailyLimit) {
        document.getElementById('errorBox').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Денний ліміт запитів вичерпано (${settings.dailyLimit}). Спробуйте завтра.`;
        document.getElementById('errorBox').style.display = 'block';
        return;
      }
    } catch(e) { /* при помилці перевірки — не блокуємо користувача */ }
  }

  const btn = document.getElementById('fixBtn');
  btn.classList.add('loading');
  btn.disabled = true;
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('errorBox').style.display = 'none';

  const prompt = buildFixPrompt(text);
  const _fixStart = performance.now();

  // ── AUTO-ROTATING MODEL CALL ──────────────────
  // Builds ordered list: selected model first, then others, cycling forever
  // until we get a valid result or hit a non-retriable error (SAFETY, bad key).
  try {
    const settings2 = await getSettings();
    const enabledModels = (settings2.models || DEFAULT_MODELS).filter(m => m.enabled).map(m => m.id);
    if (!enabledModels.length) {
      document.getElementById('errorBox').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Немає увімкнених моделей. Зверніться до адміністратора.`;
      document.getElementById('errorBox').style.display = 'block';
      return;
    }

    // Start from selected model, then rotate through the rest
    const selectedModel = document.getElementById('modelSelect').value;
    const startIdx = enabledModels.indexOf(selectedModel);
    const orderedModels = startIdx >= 0
      ? [...enabledModels.slice(startIdx), ...enabledModels.slice(0, startIdx)]
      : enabledModels;

    // Errors that mean "this model can't help" → try next model
    function isRetriable(err) {
      const msg = (err.message || err.status || '').toString().toLowerCase();
      return (
        err.code === 429 ||
        err.code === 503 ||
        err.code === 404 ||
        msg.includes('quota') ||
        msg.includes('rate') ||
        msg.includes('limit') ||
        msg.includes('not found') ||
        msg.includes('deprecated') ||
        msg.includes('unavailable') ||
        msg.includes('overloaded') ||
        msg.includes('invalid model') ||
        msg.includes('does not exist') ||
        msg.includes('no longer') ||
        msg.includes('preview') ||
        msg.includes('resource_exhausted') ||
        msg.includes('service_unavailable')
      );
    }

    let usedModel = null;
    let parsed = null;
    let lastErr = null;
    let attempts = 0;

    for (let round = 0; round < 3; round++) { // up to 3 full cycles
      for (const model of orderedModels) {
        attempts++;
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
                safetySettings: [
                  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                ]
              })
            }
          );

          const data = await res.json();

          // Non-retriable: bad API key
          if (data.error?.code === 400 || data.error?.code === 401 || data.error?.code === 403) {
            showError(data.error);
            saveErrorStat();
            return;
          }

          // Retriable API error (quota, model not found, etc.)
          if (data.error) {
            lastErr = data.error;
            if (isRetriable(data.error)) {
              // Small delay before next model to avoid hammering
              await new Promise(r => setTimeout(r, 400));
              continue; // try next model
            }
            showError(data.error);
            saveErrorStat();
            return;
          }

          // Safety block — not retriable, content issue
          if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            showBlocked('Текст містить недопустимий контент і не може бути оброблений.');
            saveBlockedStat();
            return;
          }

          let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          raw = raw.replace(/```json|```/g, '').trim();

          let tryParsed;
          try { tryParsed = JSON.parse(raw); }
          catch(e) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) tryParsed = JSON.parse(match[0]);
            else { lastErr = { message: 'Не вдалося розпізнати відповідь AI' }; continue; }
          }

          if (tryParsed.blocked) {
            showBlocked(tryParsed.reason || 'Текст містить недопустимий контент.');
            saveBlockedStat();
            return;
          }

          // SUCCESS
          usedModel = model;
          parsed = tryParsed;
          break;

        } catch(err) {
          lastErr = err;
          if (isRetriable(err)) {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          // Unexpected network error — still try next model
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
      }
      if (parsed) break;
      // Brief pause between full cycles
      if (round < 2) await new Promise(r => setTimeout(r, 1000));
    }

    if (!parsed) {
      // All models exhausted
      const errMsg = lastErr?.message || 'Усі моделі тимчасово недоступні. Спробуйте пізніше.';
      document.getElementById('errorBox').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${errMsg}`;
      document.getElementById('errorBox').style.display = 'block';
      saveErrorStat();
      return;
    }

    // Update the select UI to reflect which model actually responded
    if (usedModel) {
      const sel = document.getElementById('modelSelect');
      if ([...sel.options].some(o => o.value === usedModel)) sel.value = usedModel;
    }

    showResult(parsed);
    const _latencyMs = Math.round(performance.now() - _fixStart);
    await saveStats(parsed.changes ? parsed.changes.length : 0, parsed.noChanges, usedModel || selectedModel, settings2.models, _latencyMs);

  } catch(err) {
    document.getElementById('errorBox').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${err.message}`;
    document.getElementById('errorBox').style.display = 'block';
    saveErrorStat();
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showError(err) {
  const box = document.getElementById('errorBox');
  const isQuota = err.message?.toLowerCase().includes('quota');
  const retry = err.message?.match(/retry in ([\d.]+)s/i);
  const sec = retry ? Math.ceil(parseFloat(retry[1])) : null;
  const timeStr = sec ? (sec >= 3600 ? `${Math.ceil(sec/3600)} год` : sec >= 60 ? `${Math.ceil(sec/60)} хв` : `${sec}с`) : null;
  if (isQuota) box.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ліміт вичерпано${timeStr ? ` — спробуйте через ${timeStr}` : ''}. Спробуйте пізніше.`;
  else if (err.code === 400 || err.code === 403) box.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> Невірний API ключ. Зверніться до адміністратора.';
  else box.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${err.message}`;
  box.style.display = 'block';
}

function showBlocked(reason) {
  const box = document.getElementById('errorBox');
  box.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> <strong>Текст заблоковано.</strong> ${reason}`;
  box.style.display = 'block';
}

function showResult(data) {
  const card = document.getElementById('result-card');
  const resultText = document.getElementById('result-text');
  const changesList = document.getElementById('changes-list');
  const badge = document.getElementById('changes-badge');
  resultText.textContent = data.corrected;
  _lastFixedText = data.corrected || '';
  changesList.innerHTML = '';
  if (data.noChanges || data.changes.length === 0) {
    badge.textContent = '0';
    changesList.innerHTML = `<div class="no-changes"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Текст вже правильний! Помилок не знайдено.</div>`;
  } else {
    badge.textContent = data.changes.length;
    data.changes.forEach(c => {
      const item = document.createElement('div');
      item.className = 'change-item';
      item.innerHTML = `
        <div class="change-row">
          <span class="change-before">${escHtml(c.before)}</span>
          <span class="change-arrow">→</span>
          <span class="change-after">${escHtml(c.after)}</span>
        </div>
        <div class="change-reason">${escHtml(c.reason)}</div>`;
      changesList.appendChild(item);
    });
  }
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// ══════════════════════════════════════════════
// СПІЛЬНІ ФУНКЦІЇ: копіювати / поділитися / прочитати вголос
// Використовуються і в картці результату, і на вкладці «Спілкування».
// ══════════════════════════════════════════════
let _lastFixedText = '';

async function copyText(text, btn) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); }
  catch(e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (!btn) return;
  const origHtml = btn.innerHTML;
  const checkSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  btn.innerHTML = btn.querySelector('span') ? `${checkSvg}<span>Скопійовано!</span>` : checkSvg;
  btn.classList.add('success');
  setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('success'); }, 2000);
}

async function shareText(text) {
  if (!text) return;
  // Використовуємо нативний Web Share API якщо доступний (iOS/Android)
  if (navigator.share) {
    try { await navigator.share({ text }); } catch(e) { /* користувач закрив меню */ }
    return;
  }
  // Fallback — показуємо кастомне меню (тільки на ПК)
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,4,20,0.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fadeIn 0.2s ease';
  const enc = encodeURIComponent(text);
  menu.innerHTML = `
    <div style="width:100%;max-width:480px;background:var(--ct-sheet);box-shadow:inset 0 1px 0 var(--ct-rim-hi);border-radius:34px 34px 0 0;padding:16px 16px calc(env(safe-area-inset-bottom,0px) + 16px);margin:0">
      <div style="width:36px;height:4px;background:var(--ct-hair);border-radius:2px;margin:0 auto 20px"></div>
      <div style="font-size:14px;font-weight:600;color:var(--ct-text2);text-align:center;margin-bottom:14px">Поділитись через</div>
      <div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px">
        <a href="https://t.me/share/url?url=&text=${enc}" target="_blank" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;background:var(--ct-fill2);border-radius:22px;text-decoration:none;color:var(--ct-text);font-size:13px;font-weight:600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#29B6F6"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
          Telegram
        </a>
        <a href="https://wa.me/?text=${enc}" target="_blank" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;background:var(--ct-fill2);border-radius:22px;text-decoration:none;color:var(--ct-text);font-size:13px;font-weight:600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </a>
        <a href="viber://forward?text=${enc}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;background:var(--ct-fill2);border-radius:22px;text-decoration:none;color:var(--ct-text);font-size:13px;font-weight:600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#7360F2"><path d="M11.4 0C8.96-.03 3.96.46 1.65 2.46-.15 4.16-.77 6.66-.8 9.73c-.03 3.07-.06 8.83 5.4 10.36v2.38s-.04.93.58.93c.77 0 1.22-.79 1.96-1.63.4-.44.96-1.09 1.38-1.59 3.8.32 6.72-.41 7.05-.52.77-.25 5.12-1.6 5.83-6.55.74-5.1-.36-8.32-2.35-9.77C17.44-.13 15.4.03 14.4.03L11.4 0zm.1 2.5c.87 0 2.64-.1 4.27 1.07 1.5 1.08 2.36 3.72 1.73 7.96-.59 4.02-4.02 4.82-4.62 5.01-.28.09-2.89.74-6.2.5l-.6-.04-.43.5s-.56.65-.95 1.1c0-.52-.05-1.05-.05-1.05l-.38-.11C1.35 16.1 1.72 11.13 1.74 8.83c.02-2.47.5-4.46 1.96-5.82C5.5 1.34 9.74 2.5 11.5 2.5z"/></svg>
          Viber
        </a>
      </div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:16px;background:var(--ct-fill2);border:none;border-radius:999px;color:var(--ct-text);font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;-webkit-appearance:none">Скасувати</button>
    </div>`;
  document.body.appendChild(menu);
  menu.onclick = e => { if (e.target === menu) menu.remove(); };
}

// ── Text-to-Speech (Web Speech API) ──────────────────
let _speechUtterance = null;
function pickUkrainianVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return voices.find(v => v.lang?.toLowerCase().startsWith('uk')) || null;
}
function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  document.querySelectorAll('.speak-action-btn--primary.speaking').forEach(btn => {
    btn.classList.remove('speaking');
    const label = btn.querySelector('span');
    if (label) label.textContent = 'Прочитати вголос';
  });
}
function speakText(text, btn) {
  if (!text) return;
  if (!('speechSynthesis' in window)) {
    alert('На жаль, цей браузер не підтримує озвучення тексту.');
    return;
  }
  // Повторне натискання під час озвучення — зупиняє
  if (window.speechSynthesis.speaking) {
    stopSpeaking();
    return;
  }
  _speechUtterance = new SpeechSynthesisUtterance(text);
  _speechUtterance.lang = 'uk-UA';
  _speechUtterance.rate = 0.95;
  const voice = pickUkrainianVoice();
  if (voice) _speechUtterance.voice = voice;
  const label = btn?.querySelector('span');
  if (btn) btn.classList.add('speaking');
  if (label) label.textContent = 'Зупинити';
  _speechUtterance.onend = () => stopSpeaking();
  _speechUtterance.onerror = () => stopSpeaking();
  window.speechSynthesis.speak(_speechUtterance);
}
// Голоси у Chrome вантажаться асинхронно — прогріваємо список заздалегідь
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => pickUkrainianVoice();
}

// ── Вкладка «Спілкування» ──────────────────
// Текст можна або написати самостійно прямо тут, або підтягнути
// останній виправлений варіант з вкладки «Виправлення».
let _speakTextSynced = ''; // останнє значення, яке ми самі підставили з _lastFixedText

function renderSpeakTab() {
  const textEl = document.getElementById('speakText');
  if (!textEl) return;
  // Підставляємо свіжий виправлений текст лише якщо користувач
  // ще не написав у полі щось своє (поле порожнє або містить
  // те саме значення, яке ми підставили минулого разу).
  if (_lastFixedText && (textEl.value === '' || textEl.value === _speakTextSynced)) {
    textEl.value = _lastFixedText;
    _speakTextSynced = _lastFixedText;
  }
}

document.getElementById('speakGotoFixBtn')?.addEventListener('click', () => switchTab('tab-fix'));
document.getElementById('speakReadBtn')?.addEventListener('click', (e) => {
  const el = document.getElementById('speakText');
  const text = el?.value.trim() || '';
  if (!text) {
    // Порожнє поле — не мовчимо, а показуємо користувачу, що саме треба зробити
    el?.focus();
    el?.classList.add('speak-textarea--empty-flash');
    setTimeout(() => el?.classList.remove('speak-textarea--empty-flash'), 900);
    return;
  }
  speakText(text, e.currentTarget);
});

// ══════════════════════════════════════════════
// РОЗПІЗНАВАННЯ МОВИ СПІВРОЗМОВНИКА (Web Speech API, browser-native STT)
// Працює локально в браузері — нічого не надсилається на наш сервер чи в Gemini,
// поки людина сама не натисне «Виправити цей текст».
// ══════════════════════════════════════════════
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let _recognition = null;
let _listenShouldContinue = false;
let _finalTranscript = '';

function initSpeechRecognition() {
  const micBtn = document.getElementById('listenMicBtn');
  const unsupportedBox = document.getElementById('listenUnsupported');
  if (!SpeechRecognitionApi) {
    if (micBtn) micBtn.style.display = 'none';
    if (unsupportedBox) unsupportedBox.style.display = 'flex';
    return;
  }
  _recognition = new SpeechRecognitionApi();
  _recognition.lang = 'uk-UA';
  _recognition.continuous = true;
  _recognition.interimResults = true;

  _recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) _finalTranscript += chunk + ' ';
      else interim += chunk;
    }
    renderListenTranscript(interim);
  };

  _recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return; // не критично, продовжуємо/перезапустимо
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setListenStatus(false);
      _listenShouldContinue = false;
      document.getElementById('listenStatusText').textContent = 'Немає доступу до мікрофона';
      return;
    }
    // Мережеві та інші помилки — зупиняємось, щоб не зациклюватись
    _listenShouldContinue = false;
    setListenStatus(false);
  };

  _recognition.onend = () => {
    // Деякі браузери самі зупиняють сесію після паузи в мовленні —
    // перезапускаємо, поки людина явно не натиснула "стоп".
    if (_listenShouldContinue) {
      try { _recognition.start(); } catch(e) { /* вже запущено */ }
    } else {
      setListenStatus(false);
    }
  };
}

function setListenStatus(isListening) {
  const micBtn = document.getElementById('listenMicBtn');
  const dot = document.getElementById('listenStatusDot');
  const statusText = document.getElementById('listenStatusText');
  if (micBtn) micBtn.classList.toggle('listening', isListening);
  if (dot) dot.classList.toggle('live', isListening);
  if (statusText) statusText.textContent = isListening ? 'Слухаю…' : 'Не слухає';
}

function renderListenTranscript(interim) {
  const box = document.getElementById('listenTranscript');
  if (!box) return;
  const finalText = _finalTranscript.trim();
  if (!finalText && !interim) {
    box.innerHTML = '<span class="listen-placeholder" id="listenPlaceholder">Тут з\'явиться розпізнаний текст…</span>';
  } else {
    box.innerHTML = `${escHtml(finalText)}${interim ? ' <span class="interim">' + escHtml(interim) + '</span>' : ''}`;
  }
  box.scrollTop = box.scrollHeight;
  document.getElementById('listenActions').style.display = finalText ? 'flex' : 'none';
}

function startListening() {
  if (!_recognition) return;
  stopSpeaking(); // не озвучувати й слухати одночасно
  _listenShouldContinue = true;
  try { _recognition.start(); setListenStatus(true); }
  catch(e) { /* вже запущено — ігноруємо */ }
}

function stopListening() {
  if (!_recognition) return;
  _listenShouldContinue = false;
  try { _recognition.stop(); } catch(e) { /* не запущено */ }
  setListenStatus(false);
}

document.getElementById('listenMicBtn')?.addEventListener('click', () => {
  if (_listenShouldContinue) stopListening();
  else startListening();
});

document.getElementById('listenUseBtn')?.addEventListener('click', () => {
  const text = _finalTranscript.trim();
  if (!text) return;
  stopListening();
  textInput.value = text;
  textInput.dispatchEvent(new Event('input'));
  switchTab('tab-fix');
  textInput.focus();
});

document.getElementById('listenCopyBtn')?.addEventListener('click', (e) => {
  copyText(_finalTranscript.trim(), e.currentTarget);
});

document.getElementById('listenClearBtn')?.addEventListener('click', () => {
  _finalTranscript = '';
  renderListenTranscript('');
});

initSpeechRecognition();

document.getElementById('shareBtn').onclick = () => shareText(document.getElementById('result-text').textContent);

document.getElementById('copyBtn').onclick = () => copyText(document.getElementById('result-text').textContent, document.getElementById('copyBtn'));

document.getElementById('useBtn').onclick = () => {
  const text = document.getElementById('result-text').textContent;
  if (!text) return;
  textInput.value = text;
  textInput.dispatchEvent(new Event('input'));
  document.getElementById('result-card').style.display = 'none';
  textInput.focus();
  textInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

document.getElementById('clearBtn').onclick = () => {
  textInput.value = '';
  textInput.dispatchEvent(new Event('input'));
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('errorBox').style.display = 'none';
  textInput.focus();
};


// START
route();



// ── Таб-бар: один рух — затисни і проведи пальцем, як в iOS ──
(function initTabDrag() {
  const nav = document.getElementById('tabBar');
  const ind = document.getElementById('tabIndicator');
  if (!nav || !ind) return;
  const btns = () => [...nav.querySelectorAll('.tab-btn')];
  let dragging = false, moved = false, startX = 0, target = null, pid = null;

  // Координата пальця в «макетних» пікселях панелі (з поправкою на її збільшення під час жесту)
  const local = x => {
    const nr = nav.getBoundingClientRect();
    const k = nr.width / nav.offsetWidth || 1;
    return (x - nr.left) / k;
  };
  const nearest = x => {
    const lx = local(x);
    let best = null, bd = Infinity;
    btns().forEach(b => {
      const d = Math.abs(lx - (b.offsetLeft + b.offsetWidth / 2));
      if (d < bd) { bd = d; best = b; }
    });
    return best;
  };
  const followFinger = x => {
    const list = btns();
    const w = list[0].offsetWidth;
    const min = list[0].offsetLeft, max = list[list.length - 1].offsetLeft;
    getLens().follow(Math.max(min, Math.min(max, local(x) - w / 2)), w);
  };
  const setTarget = b => {
    if (!b || b === target) return;
    target = b;
    btns().forEach(x => x.classList.toggle('is-target', x === b));
    if (navigator.vibrate) navigator.vibrate(6);
  };

  nav.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; pid = e.pointerId;
    try { nav.setPointerCapture(pid); } catch (_) {}
    nav.classList.add('dragging');
    const b = nearest(e.clientX);
    getLens().lens(true);
    getLens().to(b.offsetLeft, b.offsetWidth);       // лінза «перетікає» до вкладки під пальцем
    setTarget(b);
  });
  nav.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (!moved && Math.abs(e.clientX - startX) > 4) moved = true;
    if (moved) followFinger(e.clientX);
    setTarget(nearest(e.clientX));
  });
  const end = e => {
    if (!dragging) return;
    dragging = false;
    try { nav.releasePointerCapture(pid); } catch (_) {}
    nav.classList.remove('dragging');
    btns().forEach(x => x.classList.remove('is-target'));
    getLens().lens(false);
    const b = e.type === 'pointercancel' ? document.querySelector('.tab-btn.active') : (target || nearest(e.clientX));
    target = null;
    if (!b) return;
    if (b.classList.contains('active')) moveTabIndicator(b); else switchTab(b.dataset.tab);
  };
  nav.addEventListener('pointerup', end);
  nav.addEventListener('pointercancel', end);
})();

