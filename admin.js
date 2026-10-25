// Адмін-панель. Окрема сторінка (admin.html): користувачі застосунку цього коду не завантажують.
import { db, doc, getDoc, setDoc, fsGet, fsSet, getSettings, invalidateCache, show, hide, escHtml, buildFixPrompt,
         lsGet, lsSet, getModelPrice, getModelPriceFromList, DEFAULT_MODELS, DEFAULT_TEMPLATES } from './shared.js';

// ══════════════════════════════════════════════
// LOCAL STORAGE HELPERS — тільки для сесії адміна
// ══════════════════════════════════════════════
const KEYS = {
  ADMIN_USER: 'ct_admin_user',
  ADMIN_PASS: 'ct_admin_pass',
  ADMIN_SES:  'ct_admin_session',
  ADMIN_LOCKOUT: 'ct_admin_lockout',
};

const DEFAULT_ADMIN = { user: 'admin', pass: 'Ct-UeecbtoH08ngUH' };
const LOGIN_LOCKOUT_THRESHOLD = 5;   // невдалих спроб поспіль
const LOGIN_LOCKOUT_MS = 60 * 1000;  // 1 хвилина блокування
function getAdminUser(){ return lsGet(KEYS.ADMIN_USER, DEFAULT_ADMIN.user); }
function getAdminPass(){ return lsGet(KEYS.ADMIN_PASS, DEFAULT_ADMIN.pass); }

function isAdminSession() { return sessionStorage.getItem(KEYS.ADMIN_SES) === 'ok'; }
function setAdminSession(v) {
  if (v) sessionStorage.setItem(KEYS.ADMIN_SES, 'ok');
  else sessionStorage.removeItem(KEYS.ADMIN_SES);
}

// ══════════════════════════════════════════════
// ROUTING (лише адмінка)
// ══════════════════════════════════════════════
async function route() {
  if (isAdminSession()) await showAdmin(); else showAdminLogin();
}
const goHome = () => window.location.replace('index.html');

function showAdminLogin() {
  hide('admin-screen');
  show('admin-login-screen', true);
  applyLockoutUI();
}
async function showAdmin() {
  hide('admin-login-screen');
  show('admin-screen', true);
  await renderAdmin();
}

// ══════════════════════════════════════════════
// ADMIN LOGIN
// ══════════════════════════════════════════════
document.getElementById('adminPassToggle').onclick = () => {
  const inp = document.getElementById('adminPassInput');
  const s = inp.type === 'password';
  inp.type = s ? 'text' : 'password';
  document.getElementById('adminPassToggle').innerHTML = s ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
};

document.getElementById('adminLoginBtn').onclick = doAdminLogin;
document.getElementById('adminPassInput').addEventListener('keydown', e => { if(e.key==='Enter') doAdminLogin(); });
document.getElementById('adminLoginInput').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('adminPassInput').focus(); });

document.getElementById('adminBackLink').onclick = () => {
  goHome();
};

// ══════════════════════════════════════════════
// АВТОБЛОКУВАННЯ ПІСЛЯ НЕВДАЛИХ СПРОБ ВХОДУ (на цьому пристрої)
// ══════════════════════════════════════════════
function getLockoutState() {
  return lsGet(KEYS.ADMIN_LOCKOUT, { fails: 0, lockedUntil: 0 });
}
function setLockoutState(state) { lsSet(KEYS.ADMIN_LOCKOUT, state); }

function registerFailedLogin() {
  const state = getLockoutState();
  state.fails = (state.fails || 0) + 1;
  if (state.fails >= LOGIN_LOCKOUT_THRESHOLD) {
    state.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    state.fails = 0;
  }
  setLockoutState(state);
  return state;
}
function clearLockoutState() { setLockoutState({ fails: 0, lockedUntil: 0 }); }

function isLockedOut() {
  const state = getLockoutState();
  return state.lockedUntil && Date.now() < state.lockedUntil;
}

let _lockoutInterval = null;
function applyLockoutUI() {
  const btn = document.getElementById('adminLoginBtn');
  const errBox = document.getElementById('adminLoginError');
  if (_lockoutInterval) { clearInterval(_lockoutInterval); _lockoutInterval = null; }
  if (!isLockedOut()) {
    if (btn) btn.disabled = false;
    return;
  }
  if (btn) btn.disabled = true;
  const tick = () => {
    const state = getLockoutState();
    const remaining = Math.max(0, Math.ceil((state.lockedUntil - Date.now()) / 1000));
    if (remaining <= 0) {
      clearInterval(_lockoutInterval);
      _lockoutInterval = null;
      if (btn) btn.disabled = false;
      errBox.style.display = 'none';
      return;
    }
    errBox.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Забагато невдалих спроб. Спробуйте через ${remaining}с.`;
    errBox.style.display = 'block';
  };
  tick();
  _lockoutInterval = setInterval(tick, 1000);
}

function doAdminLogin() {
  if (isLockedOut()) { applyLockoutUI(); return; }
  const user = document.getElementById('adminLoginInput').value.trim();
  const pass = document.getElementById('adminPassInput').value;
  const errBox = document.getElementById('adminLoginError');

  if (user === getAdminUser() && pass === getAdminPass()) {
    errBox.style.display = 'none';
    clearLockoutState();
    setAdminSession(true);
    _adminSessionStart = Date.now();
    logEvent('Успішний вхід в адмінку (логін: ' + user + ')', 'ok');
    pushAudit('Успішний вхід в адмінку (логін: ' + user + ')');
    showAdmin();
  } else {
    logEvent('Невдала спроба входу (логін: ' + (user || '—') + ')', 'fail');
    const state = registerFailedLogin();
    if (state.lockedUntil && Date.now() < state.lockedUntil) {
      pushAudit('Автоблокування входу після кількох невдалих спроб (логін: ' + (user || '—') + ')');
      applyLockoutUI();
    } else {
      errBox.style.display = 'block';
    }
    const card = document.querySelector('.admin-login-card');
    card.animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}],{duration:300});
    document.getElementById('adminPassInput').value = '';
    document.getElementById('adminPassInput').focus();
  }
}

// ══════════════════════════════════════════════
// ADMIN LOGOUT
// ══════════════════════════════════════════════
document.getElementById('adminLogoutBtn').onclick = () => {
  setAdminSession(false);
  goHome();
};

// ══════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════
async function renderAdmin() {
  const settings = await getSettings();

  // Maintenance mode
  const maintToggle = document.getElementById('maintenanceToggle');
  if (maintToggle) {
    maintToggle.checked = !!settings.maintenanceMode;
    updateMaintenanceUI(!!settings.maintenanceMode);
  }

  // API key
  const inp = document.getElementById('adminApiKeyInput');
  inp.value = settings.apiKey || '';
  const dot = document.getElementById('apiStatusDot');
  dot.style.display = 'inline-block';
  dot.className = 'status-dot' + (settings.apiKey ? '' : ' off');

  renderAdminModels(settings.models || DEFAULT_MODELS);
  renderAdminTestModelSelect(settings.models || DEFAULT_MODELS);

  // Templates editor draft
  _templatesDraft = JSON.parse(JSON.stringify((settings.templates && settings.templates.length) ? settings.templates : DEFAULT_TEMPLATES));
  renderTemplatesEditor();

  // Announcement banner
  const bannerToggle = document.getElementById('bannerToggle');
  if (bannerToggle) {
    bannerToggle.checked = !!settings.bannerEnabled;
    updateBannerUI(!!settings.bannerEnabled);
  }
  const bannerTextInput = document.getElementById('bannerTextInput');
  if (bannerTextInput) bannerTextInput.value = settings.bannerText || '';
  const bannerTypeSelect = document.getElementById('bannerTypeSelect');
  if (bannerTypeSelect) bannerTypeSelect.value = settings.bannerType || 'info';

  // Daily request limit
  const limitToggle = document.getElementById('limitToggle');
  const limitInput = document.getElementById('limitValueInput');
  if (limitToggle) {
    limitToggle.checked = !!settings.dailyLimitEnabled;
    updateLimitUI(!!settings.dailyLimitEnabled);
  }
  if (limitInput) limitInput.value = settings.dailyLimit ? settings.dailyLimit : '';

  // Tech panel (diagnostics / log / json) — admin-only, no effect on user app
  if (!_adminSessionStart) _adminSessionStart = Date.now();
  restoreLog();
  renderAuditLog(settings.auditLog);
  runDiagnostics();
  refreshRawJson();
  loadPeriodStats(_currentPeriodDays || 1);
  checkErrorAlert();
  loadHourlyBreakdown();
}

// ALERT-чіп у шапці адмінки, якщо сьогодні були помилки API
async function checkErrorAlert() {
  const chip = document.getElementById('adminAlertChip');
  if (!chip) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await getDoc(doc(db, 'stats', today));
    const errors = snap.exists() ? (snap.data().errors || 0) : 0;
    if (errors > 0) {
      chip.textContent = `⚠ Помилки сьогодні: ${errors}`;
      chip.style.display = 'inline-flex';
    } else {
      chip.style.display = 'none';
    }
  } catch(e) {
    chip.style.display = 'none';
  }
}

// Погодинний розподіл запитів за сьогодні
async function loadHourlyBreakdown() {
  const chartEl = document.getElementById('hourlyBarChart');
  if (!chartEl) return;
  chartEl.innerHTML = '<div class="bar-chart-empty">Завантаження…</div>';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await getDoc(doc(db, 'stats', today));
    const hours = snap.exists() ? (snap.data().hours || {}) : {};
    const data = [];
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, '0');
      data.push({ hour: key, total: hours[key] || 0 });
    }
    const max = Math.max(1, ...data.map(d => d.total));
    chartEl.innerHTML = '';
    data.forEach(d => {
      const col = document.createElement('div');
      col.className = 'bar-chart-col';
      col.title = `${d.hour}:00 — ${d.total} запитів`;
      col.innerHTML = `<div class="bar-chart-bar" style="height:${Math.max(2, Math.round((d.total / max) * 100))}%"></div>`;
      chartEl.appendChild(col);
    });
  } catch(e) {
    chartEl.innerHTML = '<div class="bar-chart-empty">Помилка завантаження</div>';
  }
}

document.getElementById('hourlyRefreshBtn')?.addEventListener('click', loadHourlyBreakdown);

function renderAdminTestModelSelect(models) {
  const sel = document.getElementById('adminTestModelSelect');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = (m.label || m.id) + (m.enabled ? '' : ' (вимкнена)');
    if (!m.enabled) opt.className = 'opt-disabled-model';
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === prevVal)) sel.value = prevVal;
}

// ══════════════════════════════════════════════
// ADMIN — РЕДАКТОР ШАБЛОНІВ (settings.templates у Firestore)
// Впливає на вкладку "Шаблони" у користувачів лише після натискання
// "Зберегти шаблони"; за замовчуванням користувач бачить DEFAULT_TEMPLATES.
// ══════════════════════════════════════════════
let _templatesDraft = [];

function renderTemplatesEditor() {
  const list = document.getElementById('templatesEditorList');
  if (!list) return;
  list.innerHTML = '';
  _templatesDraft.forEach((cat, ci) => {
    const block = document.createElement('div');
    block.className = 'tpl-cat-block';
    const header = document.createElement('div');
    header.className = 'admin-row';
    header.style.gap = '8px';
    header.innerHTML = `
      <input type="text" class="model-add-input tpl-cat-title-input" data-cat="${ci}" value="${escHtml(cat.title || '')}" placeholder="Назва категорії" style="flex:1">
      <button class="btn-del-model" data-cat="${ci}" data-action="delcat" title="Видалити категорію"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    block.appendChild(header);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'tpl-items';
    (cat.items || []).forEach((phrase, ii) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.style.gap = '8px';
      row.innerHTML = `
        <input type="text" class="model-add-input" data-cat="${ci}" data-item="${ii}" value="${escHtml(phrase)}" style="flex:1">
        <button class="btn-del-model" data-cat="${ci}" data-item="${ii}" data-action="delitem" title="Видалити фразу"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      itemsWrap.appendChild(row);
    });
    block.appendChild(itemsWrap);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-model';
    addBtn.type = 'button';
    addBtn.dataset.cat = ci;
    addBtn.dataset.action = 'additem';
    addBtn.textContent = '+ Фраза';
    addBtn.style.alignSelf = 'flex-start';
    block.appendChild(addBtn);

    list.appendChild(block);
  });

  // Category title edits
  list.querySelectorAll('.tpl-cat-title-input').forEach(inp => {
    inp.addEventListener('input', () => { _templatesDraft[+inp.dataset.cat].title = inp.value; });
  });
  // Phrase edits
  list.querySelectorAll('.tpl-items input').forEach(inp => {
    inp.addEventListener('input', () => { _templatesDraft[+inp.dataset.cat].items[+inp.dataset.item] = inp.value; });
  });
  // Delete category
  list.querySelectorAll('[data-action="delcat"]').forEach(btn => {
    btn.addEventListener('click', () => { _templatesDraft.splice(+btn.dataset.cat, 1); renderTemplatesEditor(); });
  });
  // Delete phrase
  list.querySelectorAll('[data-action="delitem"]').forEach(btn => {
    btn.addEventListener('click', () => { _templatesDraft[+btn.dataset.cat].items.splice(+btn.dataset.item, 1); renderTemplatesEditor(); });
  });
  // Add phrase
  list.querySelectorAll('[data-action="additem"]').forEach(btn => {
    btn.addEventListener('click', () => { _templatesDraft[+btn.dataset.cat].items.push(''); renderTemplatesEditor(); });
  });
}

document.getElementById('addTemplateCatBtn')?.addEventListener('click', () => {
  _templatesDraft.push({ title: '', items: [''] });
  renderTemplatesEditor();
});

document.getElementById('saveTemplatesBtn')?.addEventListener('click', async () => {
  // Прибираємо порожні категорії/фрази перед збереженням
  const cleaned = _templatesDraft
    .map(c => ({ title: (c.title || '').trim(), items: (c.items || []).map(i => i.trim()).filter(Boolean) }))
    .filter(c => c.title && c.items.length);
  const ok = await fsSet('settings', { templates: cleaned });
  invalidateCache();
  if (ok) {
    _templatesDraft = JSON.parse(JSON.stringify(cleaned));
    renderTemplatesEditor();
    showTmpMsg('templatesSavedMsg');
    logEvent(`Шаблони збережено (${cleaned.length} категорій)`, 'ok');
    pushAudit(`Оновлено шаблони (${cleaned.length} категорій)`);
  } else {
    logEvent('Помилка збереження шаблонів', 'fail');
  }
});

function updateMaintenanceUI(isOn) {
  const label = document.getElementById('maintenanceStatusLabel');
  const dot = document.getElementById('maintenanceStatusDot');
  if (label) {
    label.textContent = isOn ? 'Увімкнено — застосунок недоступний для користувачів' : 'Вимкнено — застосунок працює';
    label.style.color = isOn ? 'var(--rose)' : 'var(--text)';
  }
  if (dot) {
    dot.style.display = 'inline-block';
    dot.className = 'status-dot' + (isOn ? ' off' : '');
  }
}

document.getElementById('maintenanceToggle').addEventListener('change', async (e) => {
  const checked = e.target.checked;
  const toggle = e.target;
  toggle.disabled = true;
  const ok = await fsSet('settings', { maintenanceMode: checked });
  invalidateCache();
  toggle.disabled = false;
  if (ok) {
    updateMaintenanceUI(checked);
    showTmpMsg('maintenanceSavedMsg');
    logEvent('Режим технічних робіт: ' + (checked ? 'УВІМКНЕНО' : 'вимкнено'), checked ? 'fail' : 'ok');
    pushAudit('Режим технічних робіт: ' + (checked ? 'увімкнено' : 'вимкнено'));
  } else {
    // Відкат чекбокса якщо збереження не вдалось
    toggle.checked = !checked;
  }
});

// ══════════════════════════════════════════════
// ADMIN — ДЕННИЙ ЛІМІТ ЗАПИТІВ (опційно, вимкнено за замовчуванням)
// ══════════════════════════════════════════════
function updateLimitUI(isOn) {
  const label = document.getElementById('limitStatusLabel');
  const dot = document.getElementById('limitStatusDot');
  if (label) {
    label.textContent = isOn ? 'Увімкнено — застосунок обмежує кількість запитів' : 'Вимкнено — без обмежень';
    label.style.color = isOn ? 'var(--rose)' : 'var(--text)';
  }
  if (dot) {
    dot.style.display = 'inline-block';
    dot.className = 'status-dot' + (isOn ? '' : ' off');
  }
}

document.getElementById('limitToggle')?.addEventListener('change', async (e) => {
  const checked = e.target.checked;
  const toggle = e.target;
  toggle.disabled = true;
  const ok = await fsSet('settings', { dailyLimitEnabled: checked });
  invalidateCache();
  toggle.disabled = false;
  if (ok) {
    updateLimitUI(checked);
    showTmpMsg('limitSavedMsg');
    logEvent('Денний ліміт запитів: ' + (checked ? 'УВІМКНЕНО' : 'вимкнено'), checked ? 'info' : 'ok');
  } else {
    toggle.checked = !checked;
  }
});

document.getElementById('saveLimitBtn')?.addEventListener('click', async () => {
  const inp = document.getElementById('limitValueInput');
  const val = parseInt(inp.value, 10);
  if (isNaN(val) || val < 1) { inp.animate([{borderColor:'rgba(251,113,133,0.6)'},{borderColor:''}],{duration:400}); return; }
  const ok = await fsSet('settings', { dailyLimit: val });
  invalidateCache();
  if (ok) { showTmpMsg('limitSavedMsg'); logEvent(`Денний ліміт запитів встановлено: ${val}`, 'ok'); pushAudit(`Денний ліміт запитів встановлено: ${val}`); }
});

// ══════════════════════════════════════════════
// ADMIN — ОГОЛОШЕННЯ (БАНЕР ДЛЯ КОРИСТУВАЧІВ)
// Вимкнено за замовчуванням. Коли увімкнено — показується у #app-screen.
// ══════════════════════════════════════════════
function updateBannerUI(isOn) {
  const label = document.getElementById('bannerStatusLabel');
  const dot = document.getElementById('bannerStatusDot');
  if (label) {
    label.textContent = isOn ? 'Увімкнено — банер видно користувачам' : 'Вимкнено — банер не показується';
    label.style.color = isOn ? 'var(--rose)' : 'var(--text)';
  }
  if (dot) {
    dot.style.display = 'inline-block';
    dot.className = 'status-dot' + (isOn ? '' : ' off');
  }
}

document.getElementById('bannerToggle')?.addEventListener('change', async (e) => {
  const checked = e.target.checked;
  const toggle = e.target;
  toggle.disabled = true;
  const ok = await fsSet('settings', { bannerEnabled: checked });
  invalidateCache();
  toggle.disabled = false;
  if (ok) {
    updateBannerUI(checked);
    showTmpMsg('bannerSavedMsg');
    logEvent('Банер оголошення: ' + (checked ? 'УВІМКНЕНО' : 'вимкнено'), checked ? 'info' : 'ok');
    pushAudit('Банер оголошення: ' + (checked ? 'увімкнено' : 'вимкнено'));
  } else {
    toggle.checked = !checked;
  }
});

document.getElementById('saveBannerBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('bannerTextInput').value.trim().slice(0, 140);
  const type = document.getElementById('bannerTypeSelect').value || 'info';
  const ok = await fsSet('settings', { bannerText: text, bannerType: type });
  invalidateCache();
  if (ok) {
    showTmpMsg('bannerSavedMsg');
    logEvent('Текст банера оновлено', 'ok');
    pushAudit('Текст банера оновлено: "' + text.slice(0, 60) + '"');
  }
});


function renderAdminModels(models) {
  const list = document.getElementById('modelsList');
  list.innerHTML = '';
  models.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = 'model-item';
    item.innerHTML = `
      <div style="flex:1">
        <div class="model-item-name">${escHtml(m.id)}</div>
        ${m.label ? `<div class="model-item-label">${escHtml(m.label)}</div>` : ''}
      </div>
      <input type="number" class="model-price-input" data-idx="${i}" value="${typeof m.price === 'number' && m.price > 0 ? m.price : ''}" placeholder="${getModelPrice(m.id).toFixed(4)}" step="0.0001" min="0" title="Ціна за запит (USD), порожньо = за замовчуванням">
      <label class="model-toggle">
        <input type="checkbox" ${m.enabled ? 'checked' : ''} data-idx="${i}">
        <span class="model-toggle-slider"></span>
      </label>
      <button class="btn-del-model" data-idx="${i}" title="Видалити"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.model-toggle input').forEach(cb => {
    cb.addEventListener('change', async () => {
      const settings = await getSettings();
      const mods = settings.models || DEFAULT_MODELS;
      mods[+cb.dataset.idx].enabled = cb.checked;
      await fsSet('settings', { models: mods });
      invalidateCache();
      showTmpMsg('modelsSavedMsg');
      pushAudit(`Модель ${mods[+cb.dataset.idx].id}: ${cb.checked ? 'увімкнено' : 'вимкнено'}`);
    });
  });

  list.querySelectorAll('.model-price-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const settings = await getSettings();
      const mods = settings.models || DEFAULT_MODELS;
      const raw = inp.value.trim();
      const val = raw === '' ? null : parseFloat(raw);
      if (val === null || isNaN(val) || val <= 0) delete mods[+inp.dataset.idx].price;
      else mods[+inp.dataset.idx].price = val;
      await fsSet('settings', { models: mods });
      invalidateCache();
      showTmpMsg('modelsSavedMsg');
      logEvent(`Ціну моделі ${mods[+inp.dataset.idx].id} оновлено`, 'ok');
      pushAudit(`Ціну моделі ${mods[+inp.dataset.idx].id} оновлено`);
    });
  });

  list.querySelectorAll('.btn-del-model').forEach(btn => {
    btn.onclick = async () => {
      const settings = await getSettings();
      const mods = settings.models || DEFAULT_MODELS;
      const removedId = mods[+btn.dataset.idx]?.id;
      mods.splice(+btn.dataset.idx, 1);
      await fsSet('settings', { models: mods });
      invalidateCache();
      const s2 = await getSettings();
      renderAdminModels(s2.models || DEFAULT_MODELS);
      showTmpMsg('modelsSavedMsg');
      pushAudit(`Модель видалено: ${removedId}`);
    };
  });
}

document.getElementById('adminApiKeyToggle').onclick = () => {
  const inp = document.getElementById('adminApiKeyInput');
  const s = inp.type === 'password';
  inp.type = s ? 'text' : 'password';
  document.getElementById('adminApiKeyToggle').innerHTML = s ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
};

// Save API key → Firestore
document.getElementById('saveApiKeyBtn').onclick = async () => {
  const val = document.getElementById('adminApiKeyInput').value.trim();
  const btn = document.getElementById('saveApiKeyBtn');
  btn.textContent = '⏳ Збереження...';
  btn.disabled = true;

  const ok = await fsSet('settings', { apiKey: val });
  invalidateCache();

  const dot = document.getElementById('apiStatusDot');
  dot.className = 'status-dot' + (val ? '' : ' off');
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Зберегти';
  btn.disabled = false;

  if (ok) { showTmpMsg('apiKeySavedMsg'); logEvent('API ключ збережено', 'ok'); pushAudit('API ключ оновлено'); refreshRawJson(); }
  else {
    document.getElementById('apiKeySavedMsg').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Помилка збереження. Перевір правила Firestore.';
    document.getElementById('apiKeySavedMsg').style.color = 'var(--rose)';
    document.getElementById('apiKeySavedMsg').style.display = 'block';
    setTimeout(() => {
      document.getElementById('apiKeySavedMsg').style.display = 'none';
      document.getElementById('apiKeySavedMsg').style.color = '';
      document.getElementById('apiKeySavedMsg').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> API ключ збережено!';
    }, 3000);
  }
};

// Add model → Firestore
document.getElementById('addModelBtn').onclick = async () => {
  const inp = document.getElementById('newModelInput');
  const val = inp.value.trim();
  if (!val) return;

  const settings = await getSettings();
  const mods = settings.models || DEFAULT_MODELS;
  if (mods.find(m => m.id === val)) { inp.value = ''; return; }
  mods.push({ id: val, label: '', enabled: true });
  await fsSet('settings', { models: mods });
  invalidateCache();
  renderAdminModels(mods);
  inp.value = '';
  showTmpMsg('modelsSavedMsg');
  pushAudit(`Додано модель: ${val}`);
};
document.getElementById('newModelInput').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('addModelBtn').click(); });

// Save admin credentials → localStorage (тільки на пристрої адміна)
document.getElementById('saveCredsBtn').onclick = () => {
  const login = document.getElementById('newAdminLogin').value.trim();
  const pass  = document.getElementById('newAdminPass').value;
  const pass2 = document.getElementById('newAdminPassConfirm').value;
  const errBox = document.getElementById('credsErrorBox');
  errBox.style.display = 'none';

  if (!login) { errBox.textContent = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Введіть логін'; errBox.style.display = 'block'; return; }
  if (pass.length < 6) { errBox.textContent = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Пароль мінімум 6 символів'; errBox.style.display = 'block'; return; }
  if (pass !== pass2) { errBox.textContent = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Паролі не збігаються'; errBox.style.display = 'block'; return; }

  lsSet(KEYS.ADMIN_USER, login);
  lsSet(KEYS.ADMIN_PASS, pass);
  document.getElementById('newAdminLogin').value = '';
  document.getElementById('newAdminPass').value = '';
  document.getElementById('newAdminPassConfirm').value = '';
  showTmpMsg('credsSavedMsg');
  logEvent('Дані входу адміна оновлено (логін: ' + login + ')', 'ok');
  pushAudit('Дані входу адміна оновлено (логін: ' + login + ')');
};

function showTmpMsg(id) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ══════════════════════════════════════════════
// ADMIN — TECH PANEL (diagnostics / api tester / raw json / log / danger zone)
// Everything below is admin-only: it does not touch fixText(), the Gemini
// prompt, renderAppModels(), or anything rendered inside #app-screen.
// ══════════════════════════════════════════════
let _adminSessionStart = null;

// Персистентний аудит-журнал (зберігається у Firestore settings.auditLog,
// на відміну від logEvent()/sessionStorage — переживає перезавантаження і видно на всіх пристроях).
async function pushAudit(action) {
  try {
    const settings = await getSettings();
    const log = Array.isArray(settings.auditLog) ? settings.auditLog.slice(-99) : [];
    log.push({ time: new Date().toISOString(), user: getAdminUser(), action });
    await fsSet('settings', { auditLog: log });
    invalidateCache();
    renderAuditLog(log);
  } catch(e) { /* аудит не критичний — тихо ігноруємо помилку */ }
}

function renderAuditLog(log) {
  const box = document.getElementById('auditLog');
  if (!box) return;
  if (!log || !log.length) { box.innerHTML = '<div class="term-log-line term-log-line--dim">// історія порожня</div>'; return; }
  box.innerHTML = '';
  log.slice().reverse().forEach(e => {
    const line = document.createElement('div');
    line.className = 'term-log-line';
    const dt = new Date(e.time);
    const dtStr = isNaN(dt) ? e.time : dt.toLocaleString('uk-UA', { hour12: false });
    line.textContent = `[${dtStr}] (${e.user || '?'}) ${e.action}`;
    box.appendChild(line);
  });
}

function logEvent(msg, type) {
  const time = new Date().toLocaleTimeString('uk-UA', { hour12: false });
  const log = JSON.parse(sessionStorage.getItem('ct_admin_log') || '[]');
  log.push({ time, msg, type });
  sessionStorage.setItem('ct_admin_log', JSON.stringify(log.slice(-200)));
  restoreLog();
}

// Пошук + фільтр за типом застосовуються тут же, при кожному рендері журналу
function restoreLog() {
  const box = document.getElementById('activityLog');
  if (!box) return;
  const search = (document.getElementById('logSearchInput')?.value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('logFilterSelect')?.value || '';
  box.innerHTML = '';
  let log = JSON.parse(sessionStorage.getItem('ct_admin_log') || '[]');
  if (typeFilter) log = log.filter(e => e.type === typeFilter);
  if (search) log = log.filter(e => e.msg.toLowerCase().includes(search));
  if (!log.length) { box.innerHTML = '<div class="term-log-line term-log-line--dim">// журнал порожній або нічого не знайдено</div>'; return; }
  log.forEach(e => {
    const line = document.createElement('div');
    line.className = 'term-log-line' + (e.type ? ' term-log-line--' + e.type : '');
    line.textContent = `[${e.time}] ${e.msg}`;
    box.appendChild(line);
  });
  box.scrollTop = box.scrollHeight;
}

document.getElementById('clearLogBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('ct_admin_log');
  restoreLog();
});

document.getElementById('exportLogBtn')?.addEventListener('click', () => {
  const log = JSON.parse(sessionStorage.getItem('ct_admin_log') || '[]');
  const text = log.length ? log.map(e => `[${e.time}] ${e.type ? '[' + e.type + '] ' : ''}${e.msg}`).join('\n') : '// журнал порожній';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleartext-log-${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('logSearchInput')?.addEventListener('input', () => restoreLog());
document.getElementById('logFilterSelect')?.addEventListener('change', () => restoreLog());

// Live clock + session uptime (admin header + diagnostics card)
function tickAdminClock() {
  const now = new Date().toLocaleTimeString('uk-UA', { hour12: false });
  const clockEl = document.getElementById('diagClock');
  if (clockEl) clockEl.textContent = now;
  const termClock = document.getElementById('admTermClock');
  if (termClock) termClock.textContent = now;
  const sinceEl = document.getElementById('diagSessionSince');
  if (sinceEl && _adminSessionStart) {
    const diff = Math.floor((Date.now() - _adminSessionStart) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    sinceEl.textContent = `${m}:${s}`;
  }
}
setInterval(tickAdminClock, 1000);

async function runDiagnostics() {
  const statusEl = document.getElementById('diagOverallStatus');
  const fbEl = document.getElementById('diagFirebaseStatus');
  const latEl = document.getElementById('diagLatency');
  const onlineEl = document.getElementById('diagOnline');
  const swEl = document.getElementById('diagSW');
  const dispEl = document.getElementById('diagDisplayMode');
  const platEl = document.getElementById('diagPlatform');
  const uaEl = document.getElementById('diagUA');
  if (!statusEl) return;
  statusEl.textContent = 'CHECKING…';
  statusEl.className = 'term-chip';

  if (onlineEl) { onlineEl.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE'; onlineEl.className = 'diag-value ' + (navigator.onLine ? 'ok' : 'fail'); }

  if (swEl) {
    try {
      const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
      swEl.textContent = regs.length ? `АКТИВНИЙ ×${regs.length}` : 'НЕ ЗАРЕЄСТРОВАНО';
      swEl.className = 'diag-value ' + (regs.length ? 'ok' : 'warn');
    } catch { swEl.textContent = 'N/A'; }
  }

  if (dispEl) {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    dispEl.textContent = standalone ? 'STANDALONE' : 'BROWSER';
  }
  if (platEl) platEl.textContent = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '—';
  if (uaEl) uaEl.textContent = navigator.userAgent;

  const swVerEl = document.getElementById('diagSWVersion');
  if (swVerEl) {
    try {
      const res = await fetch('sw.js', { cache: 'no-store' });
      const txt = await res.text();
      const m = txt.match(/CACHE\s*=\s*['"]([^'"]+)['"]/);
      swVerEl.textContent = m ? m[1] : 'невідомо';
    } catch { swVerEl.textContent = 'N/A'; }
  }

  const t0 = performance.now();
  try {
    await fsGet('settings');
    const ms = Math.round(performance.now() - t0);
    if (fbEl) { fbEl.textContent = 'OK'; fbEl.className = 'diag-value ok'; }
    if (latEl) latEl.textContent = ms + ' ms';
    statusEl.textContent = 'OK';
    statusEl.className = 'term-chip term-chip--ok';
  } catch (e) {
    if (fbEl) { fbEl.textContent = 'ПОМИЛКА'; fbEl.className = 'diag-value fail'; }
    if (latEl) latEl.textContent = '—';
    statusEl.textContent = 'FAIL';
    statusEl.className = 'term-chip term-chip--fail';
  }
}
document.getElementById('diagRefreshBtn')?.addEventListener('click', () => {
  logEvent('Запущено оновлення діагностики', 'info');
  runDiagnostics();
});

document.getElementById('diagUpdateSwBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('diagUpdateSwBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '⏳ Оновлення…';
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.update(); logEvent('Service Worker: примусове оновлення виконано', 'ok'); }
      else logEvent('Service Worker: реєстрацію не знайдено', 'fail');
    } else {
      logEvent('Service Worker недоступний у цьому браузері', 'fail');
    }
  } catch (e) {
    logEvent('Помилка оновлення Service Worker: ' + e.message, 'fail');
  }
  btn.disabled = false;
  btn.innerHTML = orig;
  runDiagnostics();
});

document.getElementById('diagCopyBtn')?.addEventListener('click', async () => {
  const lines = [
    `Firestore: ${document.getElementById('diagFirebaseStatus')?.textContent}`,
    `Затримка БД: ${document.getElementById('diagLatency')?.textContent}`,
    `Мережа: ${document.getElementById('diagOnline')?.textContent}`,
    `Service Worker: ${document.getElementById('diagSW')?.textContent}`,
    `Версія SW кешу: ${document.getElementById('diagSWVersion')?.textContent}`,
    `Режим показу: ${document.getElementById('diagDisplayMode')?.textContent}`,
    `Платформа: ${document.getElementById('diagPlatform')?.textContent}`,
    `Локальний час: ${document.getElementById('diagClock')?.textContent}`,
    `User-Agent: ${document.getElementById('diagUA')?.textContent}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(lines);
    logEvent('Діагностику скопійовано в буфер обміну', 'info');
  } catch (e) {
    logEvent('Не вдалося скопіювати діагностику: ' + e.message, 'fail');
  }
});

// API key tester — isolated GET request, separate from the user-facing generateContent call
document.getElementById('testApiKeyBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('testApiKeyBtn');
  const resBox = document.getElementById('apiTestResult');
  const key = document.getElementById('adminApiKeyInput').value.trim();
  resBox.style.display = 'block';
  if (!key) {
    resBox.innerHTML = '<div class="term-log-line term-log-line--fail">// помилка: ключ порожній</div>';
    return;
  }
  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = '⏳ Перевірка…';
  resBox.innerHTML = '<div class="term-log-line term-log-line--dim">// надсилання запиту...</div>';
  const t0 = performance.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const ms = Math.round(performance.now() - t0);
    const data = await res.json();
    if (res.ok) {
      const count = (data.models || []).length;
      resBox.innerHTML =
        `<div class="term-log-line term-log-line--ok">// HTTP ${res.status} OK</div>` +
        `<div class="term-log-line">// затримка: ${ms} ms</div>` +
        `<div class="term-log-line">// доступно моделей: ${count}</div>`;
      logEvent(`Тест API ключа: успішно (${ms} ms, ${count} моделей)`, 'ok');
    } else {
      resBox.innerHTML =
        `<div class="term-log-line term-log-line--fail">// HTTP ${res.status}</div>` +
        `<div class="term-log-line term-log-line--fail">// ${escHtml((data.error && data.error.message) || 'невідома помилка')}</div>`;
      logEvent(`Тест API ключа: помилка HTTP ${res.status}`, 'fail');
    }
  } catch (e) {
    resBox.innerHTML = `<div class="term-log-line term-log-line--fail">// мережева помилка: ${escHtml(e.message)}</div>`;
    logEvent('Тест API ключа: мережева помилка', 'fail');
  }
  btn.disabled = false;
  btn.innerHTML = origHtml;
});

// AI corrector tester — runs buildFixPrompt() through the selected model once,
// isolated from fixText(): does not save stats, does not touch the user app screen.
document.getElementById('adminTestRunBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('adminTestRunBtn');
  const resBox = document.getElementById('adminTestResult');
  const text = document.getElementById('adminTestInput').value.trim();
  const model = document.getElementById('adminTestModelSelect').value;
  const key = (document.getElementById('adminApiKeyInput').value.trim()) || (await getSettings()).apiKey;
  resBox.style.display = 'block';

  if (!text) { resBox.innerHTML = '<div class="term-log-line term-log-line--fail">// помилка: введіть текст для тесту</div>'; return; }
  if (!key) { resBox.innerHTML = '<div class="term-log-line term-log-line--fail">// помилка: немає API ключа (заповніть поле вище)</div>'; return; }
  if (!model) { resBox.innerHTML = '<div class="term-log-line term-log-line--fail">// помилка: немає доступних моделей</div>'; return; }

  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = '⏳ Тестування…';
  resBox.innerHTML = `<div class="term-log-line term-log-line--dim">// надсилання запиту до ${escHtml(model)}...</div>`;
  const t0 = performance.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildFixPrompt(text) }] }],
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
    const ms = Math.round(performance.now() - t0);
    const data = await res.json();
    if (!res.ok || data.error) {
      resBox.innerHTML = `<div class="term-log-line term-log-line--fail">// HTTP ${res.status}</div><div class="term-log-line term-log-line--fail">// ${escHtml((data.error && data.error.message) || 'невідома помилка')}</div>`;
      logEvent(`Тест виправлення: помилка HTTP ${res.status} (${model})`, 'fail');
      return;
    }
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      resBox.innerHTML = `<div class="term-log-line term-log-line--fail">// заблоковано фільтром безпеки (SAFETY)</div>`;
      logEvent(`Тест виправлення: заблоковано SAFETY (${model})`, 'fail');
      return;
    }
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch(e) { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }

    if (parsed) {
      resBox.innerHTML =
        `<div class="term-log-line term-log-line--ok">// HTTP ${res.status} OK · ${ms} ms · модель: ${escHtml(model)}</div>` +
        `<div class="term-log-line">// виправлено: ${escHtml(parsed.corrected || '—')}</div>` +
        `<div class="term-log-line">// змін: ${(parsed.changes || []).length}${parsed.noChanges ? ' (текст без помилок)' : ''}</div>` +
        (parsed.changes && parsed.changes.length ? parsed.changes.map(c => `<div class="term-log-line term-log-line--dim">//  "${escHtml(c.before)}" → "${escHtml(c.after)}" — ${escHtml(c.reason || '')}</div>`).join('') : '');
      logEvent(`Тест виправлення успішний (${ms} ms, модель: ${model})`, 'ok');
    } else {
      resBox.innerHTML = `<div class="term-log-line term-log-line--fail">// не вдалося розпізнати відповідь моделі</div><div class="term-log-line term-log-line--dim">// сира відповідь: ${escHtml(raw.slice(0, 300))}</div>`;
      logEvent('Тест виправлення: не вдалося розпізнати JSON-відповідь', 'fail');
    }
  } catch (e) {
    resBox.innerHTML = `<div class="term-log-line term-log-line--fail">// мережева помилка: ${escHtml(e.message)}</div>`;
    logEvent('Тест виправлення: мережева помилка', 'fail');
  }
  btn.disabled = false;
  btn.innerHTML = origHtml;
});

// Raw JSON settings — view / export / import
async function refreshRawJson() {
  const ta = document.getElementById('rawSettingsJson');
  if (!ta) return;
  const settings = await getSettings();
  ta.value = JSON.stringify(settings, null, 2);
}
document.getElementById('refreshJsonBtn')?.addEventListener('click', () => {
  invalidateCache();
  refreshRawJson();
  logEvent('Оновлено перегляд JSON налаштувань', 'info');
});

document.getElementById('exportJsonBtn')?.addEventListener('click', async () => {
  const settings = await getSettings();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleartext-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  logEvent('Експортовано settings.json', 'info');
});

document.getElementById('importJsonInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error('Очікується JSON-об\u2019єкт');
    if (!confirm('Перезаписати поточні налаштування вмістом файлу? Цю дію не можна скасувати.')) { e.target.value = ''; return; }
    const ok = await fsSet('settings', obj);
    invalidateCache();
    if (ok) {
      await renderAdmin();
      showTmpMsg('jsonSavedMsg');
      logEvent('Імпортовано налаштування з файлу ' + file.name, 'ok');
      pushAudit('Імпортовано налаштування з файлу ' + file.name);
    } else {
      logEvent('Помилка запису імпортованих налаштувань', 'fail');
    }
  } catch (err) {
    alert('Помилка імпорту: ' + err.message);
    logEvent('Помилка імпорту JSON: ' + err.message, 'fail');
  }
  e.target.value = '';
});

// ══════════════════════════════════════════════
// ADMIN — СТАТИСТИКА ЗА ПЕРІОД (сьогодні / 7 днів / 30 днів)
// Читає ті самі документи 'stats/{date}', що й основна статистика,
// нічого не пише і не впливає на застосунок для користувачів.
// ══════════════════════════════════════════════
let _currentPeriodDays = 1;
let _lastPeriodData = [];

function isoDateMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function loadPeriodStats(days) {
  _currentPeriodDays = days;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.toggle('active', +t.dataset.days === days));

  const totalEl = document.getElementById('periodTotal');
  const avgEl = document.getElementById('periodAvg');
  const costEl = document.getElementById('periodCost');
  const chartEl = document.getElementById('periodBarChart');
  if (!totalEl || !chartEl) return;

  totalEl.textContent = '…';
  avgEl.textContent = '…';
  costEl.textContent = '…';
  chartEl.innerHTML = '<div class="bar-chart-empty">Завантаження…</div>';

  const settingsForPrice = await getSettings();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(isoDateMinus(i));

  const results = await Promise.all(dates.map(async d => {
    try {
      const snap = await getDoc(doc(db, 'stats', d));
      if (!snap.exists()) return { date: d, total: 0, cost: 0 };
      const data = snap.data();
      let cost = parseFloat(data.totalCostUsd) || 0;
      if (!cost && data.models) {
        cost = Object.entries(data.models).reduce((sum, [m, c]) => sum + getModelPriceFromList(m, settingsForPrice.models) * c, 0);
      }
      return { date: d, total: data.total || 0, cost };
    } catch(e) {
      return { date: d, total: 0, cost: 0 };
    }
  }));

  _lastPeriodData = results;
  const totalSum = results.reduce((s, r) => s + r.total, 0);
  const costSum = results.reduce((s, r) => s + r.cost, 0);
  totalEl.textContent = totalSum;
  avgEl.textContent = (totalSum / days).toFixed(1);
  costEl.textContent = costSum < 0.01 ? '$' + costSum.toFixed(6) : '$' + costSum.toFixed(4);

  const max = Math.max(1, ...results.map(r => r.total));
  chartEl.innerHTML = '';
  results.forEach(r => {
    const col = document.createElement('div');
    col.className = 'bar-chart-col';
    const dayLabel = r.date.slice(5).replace('-', '/');
    col.title = `${r.date}: ${r.total} запитів`;
    col.innerHTML = `<div class="bar-chart-bar" style="height:${Math.max(2, Math.round((r.total / max) * 100))}%"></div>` +
      (days <= 7 ? `<div style="font-size:9px;color:var(--adm-dim);writing-mode:vertical-rl">${dayLabel}</div>` : '');
    chartEl.appendChild(col);
  });
}

document.querySelectorAll('.period-tab').forEach(btn => {
  btn.addEventListener('click', () => loadPeriodStats(+btn.dataset.days));
});

document.getElementById('periodExportBtn')?.addEventListener('click', () => {
  if (!_lastPeriodData.length) return;
  const rows = ['date,total_requests,cost_usd', ...(_lastPeriodData.map(r => `${r.date},${r.total},${r.cost.toFixed(6)}`))];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleartext-stats-${_currentPeriodDays}d-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  logEvent(`Експортовано CSV статистики (${_currentPeriodDays} дн.)`, 'info');
});

// Danger zone
document.getElementById('resetStatsBtn')?.addEventListener('click', async () => {
  if (!confirm('Скинути статистику за сьогодні? Дію неможливо скасувати.')) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await setDoc(doc(db, 'stats', today), { total: 0, noChanges: 0, totalChanges: 0, totalCostUsd: 0, models: {}, lastUpdated: new Date().toISOString() });
    logEvent('Статистику за ' + today + ' скинуто', 'ok');
    pushAudit('Статистику за ' + today + ' скинуто');
  } catch (e) {
    logEvent('Помилка скидання статистики: ' + e.message, 'fail');
    alert('Помилка: ' + e.message);
  }
});

document.getElementById('resetModelsBtn')?.addEventListener('click', async () => {
  if (!confirm('Відновити список моделей за замовчуванням?')) return;
  await fsSet('settings', { models: DEFAULT_MODELS });
  invalidateCache();
  const s = await getSettings();
  renderAdminModels(s.models || DEFAULT_MODELS);
  refreshRawJson();
  logEvent('Моделі відновлено до значень за замовчуванням', 'ok');
  pushAudit('Моделі відновлено до значень за замовчуванням');
});

document.getElementById('resetTemplatesBtn')?.addEventListener('click', async () => {
  if (!confirm('Відновити шаблони за замовчуванням? Кастомні фрази буде втрачено.')) return;
  await fsSet('settings', { templates: DEFAULT_TEMPLATES });
  invalidateCache();
  _templatesDraft = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  renderTemplatesEditor();
  refreshRawJson();
  logEvent('Шаблони відновлено до значень за замовчуванням', 'ok');
  pushAudit('Шаблони відновлено до значень за замовчуванням');
});

document.getElementById('resetCredsBtn')?.addEventListener('click', () => {
  if (!confirm('Скинути логін і пароль адміна до значень за замовчуванням на цьому пристрої?')) return;
  lsSet(KEYS.ADMIN_USER, DEFAULT_ADMIN.user);
  lsSet(KEYS.ADMIN_PASS, DEFAULT_ADMIN.pass);
  logEvent('Дані входу адміна скинуто до значень за замовчуванням', 'ok');
  pushAudit('Дані входу адміна скинуто до значень за замовчуванням (цей пристрій)');
  alert('Дані входу скинуто до значень за замовчуванням.');
});


// ══════════════════════════════════════════════

// Завантаження статистики в адмін
document.getElementById('loadStatsBtn').addEventListener('click', async () => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const snap = await getDoc(doc(db, 'stats', today));
    if (snap.exists()) {
      const d = snap.data();
      const total = d.total || 0;
      const totalChanges = d.totalChanges || 0;
      const noChanges = d.noChanges || 0;
      let totalCostUsd = parseFloat(d.totalCostUsd) || 0;
      // Якщо totalCostUsd не збереглось — рахуємо з моделей (з урахуванням цін адміна)
      if (totalCostUsd === 0 && Object.keys(d.models || {}).length > 0) {
        const settingsForPrice = await getSettings();
        totalCostUsd = Object.entries(d.models || {}).reduce((sum, [m, c]) => {
          return sum + getModelPriceFromList(m, settingsForPrice.models) * c;
        }, 0);
      }
      // Якщо і моделей немає — рахуємо з total по дефолтній ціні
      if (totalCostUsd === 0 && total > 0) {
        totalCostUsd = total * 0.0006;
      }
      const models = d.models || {};
      document.getElementById('statTotal').textContent = total;
      document.getElementById('statChanges').textContent = totalChanges;
      document.getElementById('statNoChange').textContent = noChanges;
      document.getElementById('statBlocked').textContent = d.blockedCount || 0;
      document.getElementById('statLatency').textContent = (d.latencyCount > 0)
        ? Math.round(d.latencyTotalMs / d.latencyCount) + ' мс'
        : '—';

      // Автокурс USD/UAH
      let uahRate = 41.5;
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD');
        const d = await r.json();
        if (d?.rates?.UAH) uahRate = d.rates.UAH;
      } catch(e) { console.warn('Rate fetch failed:', e); }
      document.getElementById('statUahRate').textContent = uahRate.toFixed(2);

      const costUah = (totalCostUsd * uahRate).toFixed(4);
      const usdStr = totalCostUsd < 0.01 ? '$' + totalCostUsd.toFixed(6) : '$' + totalCostUsd.toFixed(4);
      document.getElementById('statCostUsd').textContent = usdStr;
      document.getElementById('statCostUah').textContent = costUah + ' ₴';

      // Розбивка по моделях
      const modelList = Object.entries(models).map(([m, c]) => `<span style="font-size:11px;background:rgba(52,211,153,0.1);border-radius:6px;padding:2px 6px;color:var(--green)">${m}: ${c}</span>`).join(' ');
      const modelInfo = document.getElementById('statModelInfo');
      if (modelInfo) modelInfo.innerHTML = modelList || '—';
    } else {
      document.getElementById('statTotal').textContent = '0';
      document.getElementById('statChanges').textContent = '0';
      document.getElementById('statNoChange').textContent = '0';
      document.getElementById('statCostUsd').textContent = '$0.000000';
      document.getElementById('statCostUah').textContent = '0.0000 ₴';
      document.getElementById('statBlocked').textContent = '0';
      document.getElementById('statLatency').textContent = '—';
    }
  } catch(e) {
    console.warn('Stats error:', e);
  }
});

// ══════════════════════════════════════════════
// ADMIN — СВІТЛА/ТЕМНА ТЕМА АДМІНКИ (косметика, лише для адміна)
// ══════════════════════════════════════════════
const THEME_KEY = 'ct_admin_theme';
function applyAdminTheme(theme) {
  document.body.classList.toggle('admin-light-theme', theme === 'light');
  const icon = document.getElementById('adminThemeIcon');
  if (icon) {
    icon.innerHTML = theme === 'light'
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}
applyAdminTheme(localStorage.getItem(THEME_KEY) || 'dark');

document.getElementById('adminThemeBtn')?.addEventListener('click', () => {
  const next = document.body.classList.contains('admin-light-theme') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyAdminTheme(next);
});

// ══════════════════════════════════════════════
// ADMIN — ГАРЯЧІ КЛАВІШІ (лише коли відкрита адмінка)
// Ctrl/Cmd+S — зберегти API ключ · Ctrl/Cmd+L — вийти · Ctrl/Cmd+F — фокус пошуку в журналі
// ══════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  const adminScreen = document.getElementById('admin-screen');
  if (!adminScreen || adminScreen.style.display === 'none' || adminScreen.style.display === '') return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    document.getElementById('saveApiKeyBtn')?.click();
  } else if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    document.getElementById('adminLogoutBtn')?.click();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    document.getElementById('logSearchInput')?.focus();
  }
});


route();
