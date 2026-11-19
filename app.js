'use strict';

/* =========================================================
 * WorkLog — 作業時間トラッカー
 * データはすべて localStorage に保存する（サーバー不要）
 * ========================================================= */

const STORE_KEY = 'worklog.data.v1';
const TIMER_KEY = 'worklog.timer.v1';
const TAB_KEY = 'worklog.tab';

const CAT_LABEL = { work: '作業', daily: '日常' };
const MODE_LABEL = { up: 'ストップウォッチ', down: 'カウントダウン', pomo: 'ポモドーロ', manual: '手動' };
const PALETTE = ['#4f7cff', '#ff7a59', '#22a565', '#f5b700', '#9a55f5', '#00b8d9', '#ff5c8a', '#7a8699'];
const PRESETS = [5, 10, 15, 25, 30, 45, 60, 90];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const RING_C = 2 * Math.PI * 90;

const DEFAULT_SETTINGS = {
  pomoWork: 25,
  pomoShort: 5,
  pomoLong: 15,
  pomoInterval: 4,
  autoStart: false,
  sound: true,
  notify: false,
  downMinutes: 25,
};

/* ---------- utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#7a8699');
const pad = n => String(n).padStart(2, '0');
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function fmtClock(totalSec) {
  const s = Math.max(0, totalSec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function fmtDur(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (!h) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
function fmtHM(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtMD(ms, withDow = false) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}` + (withDow ? `(${WEEKDAYS[d.getDay()]})` : '');
}
function startOfDay(ms) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function addDays(ms, n) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
function dateInputValue(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- data ---------- */
function defaultData() {
  const now = Date.now();
  const t = (name, category, color) => ({ id: uid(), name, category, color, archived: false, createdAt: now });
  return {
    version: 1,
    tasks: [
      t('開発作業', 'work', PALETTE[0]),
      t('勉強', 'work', PALETTE[4]),
      t('家事', 'daily', PALETTE[2]),
      t('運動', 'daily', PALETTE[1]),
    ],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeData(d) {
  if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.sessions)) return null;
  const tasks = d.tasks
    .filter(t => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map(t => ({
      id: t.id,
      name: t.name.slice(0, 40),
      category: t.category === 'daily' ? 'daily' : 'work',
      color: safeColor(t.color),
      archived: !!t.archived,
      createdAt: Number(t.createdAt) || Date.now(),
    }));
  const sessions = d.sessions
    .filter(s => s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.dur)) && Number(s.dur) > 0)
    .map(s => ({
      id: typeof s.id === 'string' ? s.id : uid(),
      taskId: typeof s.taskId === 'string' ? s.taskId : null,
      start: Number(s.start),
      end: Number(s.end) || Number(s.start) + Number(s.dur) * 1000,
      dur: Math.round(Number(s.dur)),
      mode: MODE_LABEL[s.mode] ? s.mode : 'manual',
      note: typeof s.note === 'string' ? s.note.slice(0, 100) : '',
    }));
  return { version: 1, tasks, sessions, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
}

function loadData() {
  try {
    const d = normalizeData(JSON.parse(localStorage.getItem(STORE_KEY)));
    if (d) return d;
  } catch (e) { /* 壊れたデータは初期化 */ }
  return defaultData();
}

let data = loadData();
const S = () => data.settings;

function saveData() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
    toast('保存に失敗しました（ストレージの空き容量を確認してください）');
  }
}
// 初回起動時は初期タスクをすぐ保存する（再読み込みで ID が変わらないように）
try { if (!localStorage.getItem(STORE_KEY)) saveData(); } catch (e) { /* ignore */ }

const getTask = id => data.tasks.find(t => t.id === id) || null;
const taskName = id => getTask(id)?.name ?? '（削除されたタスク）';
const taskColor = id => safeColor(getTask(id)?.color);

function addSession(taskId, start, end, ms, mode, note = '') {
  const dur = Math.round(ms / 1000);
  if (dur < 1) return 0;
  data.sessions.push({ id: uid(), taskId, start, end, dur, mode, note });
  saveData();
  return dur;
}

/* ---------- timer state ----------
 * 経過時間は「蓄積 acc + (実行中なら now - startedAt)」で計算するので、
 * タブを閉じたり再読み込みしても続きから再開できる。 */
function freshTimer(mode = 'up', taskId = null) {
  return { mode, taskId, running: false, startedAt: 0, acc: 0, sessionStart: 0, target: 0, phase: 'work', pomoCount: 0 };
}
function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY));
    if (t && MODE_LABEL[t.mode]) return { ...freshTimer(), ...t };
  } catch (e) { /* ignore */ }
  return freshTimer();
}
let timer = loadTimer();
function saveTimer() { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch (e) { /* ignore */ } }

const elapsed = () => timer.acc + (timer.running ? Date.now() - timer.startedAt : 0);
const isActive = () => timer.running || timer.acc > 0;
const phaseMinutes = p => (p === 'work' ? S().pomoWork : p === 'short' ? S().pomoShort : S().pomoLong);
const recordsCurrent = () => timer.mode !== 'pomo' || timer.phase === 'work';

function idleTarget() {
  if (timer.mode === 'down') return S().downMinutes * 60000;
  if (timer.mode === 'pomo') return phaseMinutes(timer.phase) * 60000;
  return 0;
}
const currentTarget = () => (isActive() ? timer.target : idleTarget());

function startTimer() {
  if (timer.running) return;
  if (!getTask(timer.taskId)) { toast('先にタスクを選んでください'); $('#taskSelect').focus(); return; }
  unlockAudio();
  const now = Date.now();
  if (!isActive()) {
    timer.sessionStart = now;
    timer.target = idleTarget();
  }
  timer.running = true;
  timer.startedAt = now;
  saveTimer();
  renderTimer();
}

function pauseTimer() {
  if (!timer.running) return;
  timer.acc = elapsed();
  timer.running = false;
  saveTimer();
  renderTimer();
}

function resetTimer(keepPomo = false) {
  const { mode, taskId, phase, pomoCount } = timer;
  timer = freshTimer(mode, taskId);
  if (keepPomo) { timer.phase = phase; timer.pomoCount = pomoCount; }
  saveTimer();
  renderTimer();
  renderToday();
}

function stopTimer() {
  if (!isActive()) return;
  let ms = elapsed();
  if (timer.mode !== 'up') ms = Math.min(ms, timer.target);
  if (recordsCurrent()) {
    const dur = addSession(timer.taskId, timer.sessionStart, Date.now(), ms, timer.mode);
    if (dur) toast(`「${taskName(timer.taskId)}」に ${fmtDur(dur)} 記録しました`);
  }
  resetTimer(false);
}

function discardTimer() {
  if (!isActive()) return;
  if (elapsed() > 60000 && recordsCurrent() && !confirm('このセッションを記録せずに破棄しますか？')) return;
  resetTimer(true);
  toast('破棄しました');
}

function advancePomoPhase(completedWork) {
  if (timer.phase === 'work') {
    if (completedWork) timer.pomoCount++;
    timer.phase = completedWork && timer.pomoCount % S().pomoInterval === 0 ? 'long' : 'short';
  } else {
    timer.phase = 'work';
  }
}

function skipPhase() {
  if (timer.mode !== 'pomo') return;
  if (timer.phase === 'work' && isActive()) {
    const dur = addSession(timer.taskId, timer.sessionStart, Date.now(), Math.min(elapsed(), timer.target), 'pomo');
    if (dur) toast(`${fmtDur(dur)} を記録して休憩へ`);
  }
  advancePomoPhase(false);
  const { mode, taskId, phase, pomoCount } = timer;
  timer = { ...freshTimer(mode, taskId), phase, pomoCount };
  saveTimer();
  renderTimer();
  renderToday();
}

/* 目標時間に到達したかチェック（バックグラウンドで遅れて気づいた場合も正しい終了時刻で記録する） */
function checkCompletion() {
  let changed = false, msg = null, guard = 0;
  while (timer.running && timer.mode !== 'up' && elapsed() >= timer.target && guard++ < 50) {
    changed = true;
    const endAt = timer.startedAt + (timer.target - timer.acc);
    const name = taskName(timer.taskId);
    if (recordsCurrent()) addSession(timer.taskId, timer.sessionStart, endAt, timer.target, timer.mode);

    if (timer.mode === 'down') {
      msg = ['時間になりました', `「${name}」 ${fmtDur(timer.target / 1000)} を記録しました`];
      timer = freshTimer('down', timer.taskId);
      break;
    }

    const finished = timer.phase;
    advancePomoPhase(true);
    msg = finished === 'work'
      ? [`ポモドーロ #${timer.pomoCount} 完了`, `${timer.phase === 'long' ? '長い' : '短い'}休憩（${phaseMinutes(timer.phase)}分）に入りましょう`]
      : ['休憩終了', `次の作業（${phaseMinutes('work')}分）を始めましょう`];
    timer.target = phaseMinutes(timer.phase) * 60000;
    timer.acc = 0;
    if (S().autoStart) {
      timer.running = true;
      timer.startedAt = endAt;
      timer.sessionStart = endAt;
    } else {
      timer.running = false;
      timer.startedAt = 0;
      timer.sessionStart = 0;
    }
  }
  if (!changed) return;
  saveTimer();
  renderTimer();
  renderToday();
  if (msg) { alertUser(msg[0], msg[1]); toast(msg[0]); }
}

/* ---------- sound & notification ---------- */
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* ignore */ }
}
function beep(force = false) {
  if (!force && !S().sound) return;
  unlockAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + 0.05;
  [0, 0.3, 0.6, 1.1].forEach((off, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = i === 3 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + off);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + off + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + (i === 3 ? 0.6 : 0.25));
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + off);
    o.stop(t0 + off + 0.65);
  });
}
function alertUser(title, body) {
  beep();
  if (!S().notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icons/icon-192.png', tag: 'worklog' };
  try {
    new Notification(title, opts);
  } catch (e) {
    navigator.serviceWorker?.ready.then(r => r.showNotification(title, opts)).catch(() => {});
  }
}

/* ---------- render: timer ---------- */
function renderTimer() {
  const active = isActive();
  document.body.dataset.phase = timer.mode === 'pomo' ? timer.phase : '';

  $$('#modeSwitch button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === timer.mode);
    b.disabled = active && b.dataset.mode !== timer.mode;
  });
  $('#taskSelect').disabled = active;
  $('#downOptions').hidden = timer.mode !== 'down';
  $('#pomoOptions').hidden = timer.mode !== 'pomo';
  $$('#presets button').forEach(b => {
    b.disabled = active;
    b.classList.toggle('active', Number(b.dataset.min) === S().downMinutes);
  });
  const dm = $('#downMinutes');
  dm.disabled = active;
  if (document.activeElement !== dm) dm.value = S().downMinutes;

  const btn = $('#btnStart');
  btn.textContent = timer.running ? '一時停止' : active ? '再開' : '開始';
  $('#btnStop').disabled = !active;
  $('#btnStop').textContent = recordsCurrent() ? '停止して記録' : '休憩をやめる';
  $('#btnReset').disabled = !active;
  $('#btnReset').hidden = !recordsCurrent();
  $('#btnSkip').hidden = timer.mode !== 'pomo';
  $('#btnSkip').textContent = timer.phase === 'work' ? '休憩へスキップ' : '作業へスキップ';

  if (timer.mode === 'pomo') {
    const n = S().pomoInterval;
    let filled = timer.pomoCount % n;
    if (filled === 0 && timer.pomoCount > 0 && timer.phase === 'long') filled = n;
    $('#pomoDots').innerHTML =
      Array.from({ length: n }, (_, i) => `<span class="pomo-dot${i < filled ? ' done' : ''}"></span>`).join('') +
      `<span>今回 ${timer.pomoCount} ポモドーロ</span>`;
  }
  updateDisplay();
}

function updateDisplay() {
  const el = elapsed();
  let text, progress;
  if (timer.mode === 'up') {
    text = fmtClock(Math.floor(el / 1000));
    progress = (el % 3600000) / 3600000; // 1時間で1周
  } else {
    const tgt = currentTarget();
    text = fmtClock(Math.ceil(Math.max(0, tgt - el) / 1000));
    progress = tgt ? Math.min(1, el / tgt) : 0;
  }
  $('#timeDisplay').textContent = text;
  const ring = $('#ringFg');
  ring.style.strokeDasharray = RING_C;
  ring.style.strokeDashoffset = RING_C * (1 - progress);

  let phase = MODE_LABEL[timer.mode];
  if (timer.mode === 'pomo') {
    phase = timer.phase === 'work' ? `作業 #${timer.pomoCount + 1}` : timer.phase === 'short' ? '短い休憩' : '長い休憩';
  }
  if (isActive() && !timer.running) phase += '（一時停止中）';
  $('#phaseLabel').textContent = phase;
  $('#taskLabel').textContent = getTask(timer.taskId) ? taskName(timer.taskId) : 'タスク未選択';

  document.title = isActive() ? `${text} ${timer.running ? '▶' : '⏸'} ${getTask(timer.taskId)?.name ?? ''} | WorkLog` : 'WorkLog';
}

/* 今日の記録（実行中のセッションも含めてライブ表示） */
function renderToday() {
  const from = startOfDay(Date.now());
  const sums = new Map();
  data.sessions.forEach(s => { if (s.start >= from) sums.set(s.taskId, (sums.get(s.taskId) || 0) + s.dur); });
  let liveId = null;
  if (isActive() && recordsCurrent()) {
    liveId = timer.taskId;
    const ms = timer.mode === 'up' ? elapsed() : Math.min(elapsed(), timer.target);
    sums.set(liveId, (sums.get(liveId) || 0) + Math.floor(ms / 1000));
  }
  const rows = [...sums].filter(([, sec]) => sec > 0).map(([id, sec]) => ({ id, sec })).sort((a, b) => b.sec - a.sec);
  const total = rows.reduce((a, r) => a + r.sec, 0);
  $('#todayTotal').textContent = total ? `合計 ${fmtDur(total)}` : '';
  renderBars($('#todayList'), rows.map(r => ({
    name: taskName(r.id), color: taskColor(r.id), sec: r.sec, live: r.id === liveId && timer.running,
  })), 'まだ記録がありません。タスクを選んで開始しましょう。');
}

function renderBars(el, rows, emptyText, total = 0) {
  if (!rows.length) { el.innerHTML = `<p class="empty">${esc(emptyText)}</p>`; return; }
  const max = Math.max(...rows.map(r => r.sec), 1);
  el.innerHTML = rows.map(r => `
    <div class="bar-row">
      <div class="bar-label"><span class="dot" style="background:${r.color}"></span><span class="name">${esc(r.name)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.sec / max * 100).toFixed(1)}%;background:${r.color}"></div></div>
      <div class="bar-value">${fmtDur(r.sec)}${total ? ` <span class="muted">${Math.round(r.sec / total * 100)}%</span>` : ''}${r.live ? '<span class="live">● 計測中</span>' : ''}</div>
    </div>`).join('');
}

/* ---------- render: task selects ---------- */
function taskOptionsHtml() {
  const active = data.tasks.filter(t => !t.archived);
  return ['work', 'daily'].map(cat => {
    const opts = active.filter(t => t.category === cat).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    return opts ? `<optgroup label="${CAT_LABEL[cat]}">${opts}</optgroup>` : '';
  }).join('');
}

function renderTaskSelects() {
  const html = taskOptionsHtml();
  const sel = $('#taskSelect');
  const cur = getTask(timer.taskId);
  sel.innerHTML = '<option value="">タスクを選択…</option>' + html +
    (cur && cur.archived ? `<option value="${esc(cur.id)}">${esc(cur.name)}（アーカイブ）</option>` : '');
  if (!cur && !isActive()) {
    const first = data.tasks.find(t => !t.archived);
    timer.taskId = first ? first.id : null;
    saveTimer();
  }
  sel.value = timer.taskId || '';

  const man = $('#manTask');
  const prev = man.value;
  man.innerHTML = '<option value="">タスクを選択…</option>' + html;
  man.value = getTask(prev) && !getTask(prev).archived ? prev : (timer.taskId || '');
}

/* ---------- render: tasks tab ---------- */
function renderTaskList() {
  const showArchived = $('#showArchived').checked;
  const from = startOfDay(Date.now());
  const today = new Map(), total = new Map(), count = new Map();
  data.sessions.forEach(s => {
    total.set(s.taskId, (total.get(s.taskId) || 0) + s.dur);
    count.set(s.taskId, (count.get(s.taskId) || 0) + 1);
    if (s.start >= from) today.set(s.taskId, (today.get(s.taskId) || 0) + s.dur);
  });
  const list = data.tasks.filter(t => showArchived || !t.archived);
  if (!list.length) { $('#taskList').innerHTML = '<p class="empty">タスクがありません。上のフォームから追加してください。</p>'; return; }
  $('#taskList').innerHTML = list.map(t => `
    <div class="task-row${t.archived ? ' archived' : ''}" data-id="${esc(t.id)}">
      <input type="color" value="${safeColor(t.color)}" data-action="color" title="色を変更">
      <div class="task-main">
        <div class="task-name">${esc(t.name)}</div>
        <div class="muted small">今日 ${fmtDur(today.get(t.id) || 0)} ・ 累計 ${fmtDur(total.get(t.id) || 0)}（${count.get(t.id) || 0}件）</div>
      </div>
      <div class="task-acts">
        <select data-action="cat" title="カテゴリ">
          <option value="work"${t.category === 'work' ? ' selected' : ''}>作業</option>
          <option value="daily"${t.category === 'daily' ? ' selected' : ''}>日常</option>
        </select>
        <button class="btn sm" data-action="rename">名前変更</button>
        <button class="btn sm" data-action="archive">${t.archived ? '戻す' : 'アーカイブ'}</button>
        <button class="btn sm danger" data-action="delete">削除</button>
      </div>
    </div>`).join('');
}

function nextColor() {
  const used = new Set(data.tasks.map(t => t.color.toLowerCase()));
  return PALETTE.find(c => !used.has(c.toLowerCase())) || PALETTE[data.tasks.length % PALETTE.length];
}

/* ---------- render: stats tab ---------- */
let statPeriod = 'week';
let statCat = 'all';

function periodStart(p) {
  const today = startOfDay(Date.now());
  if (p === 'today') return today;
  if (p === 'week') return addDays(today, -6);
  if (p === 'month') return addDays(today, -29);
  return -Infinity;
}
const matchCat = s => statCat === 'all' || getTask(s.taskId)?.category === statCat;

function renderStats() {
  $$('#periodSwitch button').forEach(b => b.classList.toggle('active', b.dataset.period === statPeriod));
  const from = periodStart(statPeriod);
  const list = data.sessions.filter(s => s.start >= from && matchCat(s));
  const total = list.reduce((a, s) => a + s.dur, 0);

  const today = startOfDay(Date.now());
  const first = data.sessions.length ? startOfDay(Math.min(...data.sessions.map(s => s.start))) : today;
  const days = statPeriod === 'today' ? 1 : statPeriod === 'week' ? 7 : statPeriod === 'month' ? 30
    : Math.max(1, Math.round((today - first) / 86400000) + 1);
  const activeDays = new Set(list.map(s => startOfDay(s.start))).size;
  const pomos = list.filter(s => s.mode === 'pomo' && s.dur >= S().pomoWork * 60 - 1).length;
  const byCat = { work: 0, daily: 0 };
  list.forEach(s => { const c = getTask(s.taskId)?.category; if (c) byCat[c] += s.dur; });

  const card = (label, value, sub = '') => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  $('#statCards').innerHTML = [
    card('合計時間', fmtDur(total), `${list.length} 件の記録`),
    card('1日あたり平均', fmtDur(total / days), `${days} 日間`),
    card('記録した日数', `${activeDays} 日`, statPeriod === 'today' ? '' : `${days} 日中`),
    statCat === 'all' ? card('作業 / 日常', `${Math.round(byCat.work / 3600 * 10) / 10}h / ${Math.round(byCat.daily / 3600 * 10) / 10}h`, '時間') : '',
    card('完了ポモドーロ', `${pomos} 回`, `${S().pomoWork}分 × ${pomos}`),
  ].join('');

  const sums = new Map();
  list.forEach(s => sums.set(s.taskId, (sums.get(s.taskId) || 0) + s.dur));
  const rows = [...sums].map(([id, sec]) => ({ name: taskName(id), color: taskColor(id), sec })).sort((a, b) => b.sec - a.sec);
  renderBars($('#taskBars'), rows, 'この期間の記録はありません。', total);

  const chartDays = statPeriod === 'month' ? 30 : statPeriod === 'all' ? Math.min(Math.max(days, 7), 90) : 7;
  renderDailyChart(chartDays);
  renderSessionList(list);
}

function niceStep(maxHours) {
  const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12];
  return steps.find(s => maxHours / s <= 4) || 24;
}

function renderDailyChart(days) {
  $('#dailyTitle').textContent = `日別の推移（直近 ${days} 日）`;
  const today = startOfDay(Date.now());
  const start = addDays(today, -(days - 1));
  const keys = Array.from({ length: days }, (_, i) => addDays(start, i));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const buckets = keys.map(() => new Map());
  const used = new Set();
  data.sessions.forEach(s => {
    if (s.start < start || !matchCat(s)) return;
    const i = idx.get(startOfDay(s.start));
    if (i == null) return;
    buckets[i].set(s.taskId, (buckets[i].get(s.taskId) || 0) + s.dur);
    used.add(s.taskId);
  });
  const totals = buckets.map(b => [...b.values()].reduce((a, v) => a + v, 0));
  const maxH = Math.max(...totals, 0) / 3600;
  const step = maxH > 0 ? niceStep(maxH) : 0.25;
  const top = maxH > 0 ? Math.ceil(maxH / step) * step : 1;

  const W = 640, H = 240, L = 40, R = 8, T = 16, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const slot = pw / days, bw = Math.min(36, slot * 0.7);
  const y = h => T + ph - (h / top) * ph;
  const axis = v => (v < 1 && v > 0 ? `${Math.round(v * 60)}m` : `${+v.toFixed(2)}h`);

  const order = data.tasks.map(t => t.id).concat([...used].filter(id => !getTask(id)));
  let svg = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${axis(v)}</text>`;
  }
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : days <= 31 ? 5 : 14;
  keys.forEach((k, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    let cur = 0;
    order.forEach(id => {
      const sec = buckets[i].get(id);
      if (!sec) return;
      const h0 = cur / 3600, h1 = (cur + sec) / 3600;
      cur += sec;
      svg += `<rect x="${x.toFixed(1)}" y="${y(h1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y(h0) - y(h1)).toFixed(1)}" fill="${taskColor(id)}" rx="2"><title>${fmtMD(k, true)} ${esc(taskName(id))}: ${fmtDur(sec)}</title></rect>`;
    });
    if (days <= 14 && totals[i] > 0) {
      svg += `<text class="total" x="${(x + bw / 2).toFixed(1)}" y="${(y(totals[i] / 3600) - 4).toFixed(1)}" text-anchor="middle">${(totals[i] / 3600).toFixed(1)}h</text>`;
    }
    if ((days - 1 - i) % labelEvery === 0) {
      svg += `<text x="${(L + slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${fmtMD(k, days <= 7)}</text>`;
    }
  });
  $('#dailyChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="日別の作業時間">${svg}</svg>`;
  $('#dailyLegend').innerHTML = order.filter(id => used.has(id))
    .map(id => `<span><span class="dot" style="background:${taskColor(id)}"></span>${esc(taskName(id))}</span>`).join('');
}

function renderSessionList(list) {
  const el = $('#sessionList');
  if (!list.length) { el.innerHTML = '<p class="empty">記録はありません。</p>'; return; }
  const LIMIT = 300;
  const sorted = list.slice().sort((a, b) => b.start - a.start);
  const shown = sorted.slice(0, LIMIT);
  const groups = new Map();
  shown.forEach(s => {
    const k = startOfDay(s.start);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  });
  let html = '';
  groups.forEach((items, day) => {
    const sum = items.reduce((a, s) => a + s.dur, 0);
    html += `<div class="day-group"><div class="day-head"><span>${fmtMD(day, true)}</span><span class="muted">${fmtDur(sum)}</span></div>`;
    html += items.map(s => `
      <div class="sess" data-id="${esc(s.id)}">
        <span class="time-range">${fmtHM(s.start)} – ${fmtHM(s.end)}</span>
        <span class="what"><span class="dot" style="background:${taskColor(s.taskId)}"></span><span class="txt">${esc(taskName(s.taskId))}${s.note ? ` <span class="muted">— ${esc(s.note)}</span>` : ''}</span><span class="badge">${MODE_LABEL[s.mode] || ''}</span></span>
        <span class="dur">${fmtDur(s.dur)}</span>
        <span class="acts"><button class="btn sm ghost" data-action="edit" title="編集">編集</button><button class="btn sm ghost danger" data-action="del" title="削除">削除</button></span>
      </div>`).join('');
    html += '</div>';
  });
  if (sorted.length > LIMIT) html += `<p class="more">ほか ${sorted.length - LIMIT} 件（CSV書き出しで全件確認できます）</p>`;
  el.innerHTML = html;
}

/* ---------- render: settings ---------- */
function renderSettings() {
  const s = S();
  $('#setWork').value = s.pomoWork;
  $('#setShort').value = s.pomoShort;
  $('#setLong').value = s.pomoLong;
  $('#setInterval').value = s.pomoInterval;
  $('#setAuto').checked = s.autoStart;
  $('#setSound').checked = s.sound;
  $('#setNotify').checked = s.notify && 'Notification' in window && Notification.permission === 'granted';
}

function renderAll() {
  renderTaskSelects();
  renderTimer();
  renderToday();
  renderTaskList();
  renderStats();
  renderSettings();
}

/* ---------- tabs ---------- */
function showTab(name) {
  if (!$(`#tab-${name}`)) name = 'timer';
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'stats') renderStats();
  if (name === 'tasks') renderTaskList();
  try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* ignore */ }
}

/* ---------- export / import ---------- */
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };

function exportCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['日付', '開始', '終了', 'タスク', 'カテゴリ', '分', '秒', '種類', 'メモ'].map(q).join(',')];
  data.sessions.slice().sort((a, b) => a.start - b.start).forEach(s => {
    const t = getTask(s.taskId);
    lines.push([dateInputValue(s.start), fmtHM(s.start), fmtHM(s.end), taskName(s.taskId), t ? CAT_LABEL[t.category] : '',
      (s.dur / 60).toFixed(1), s.dur, MODE_LABEL[s.mode] || '', s.note].map(q).join(','));
  });
  download(`worklog-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}

/* ---------- events ---------- */
function bindEvents() {
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // timer
  $$('#modeSwitch button').forEach(b => b.addEventListener('click', () => {
    if (isActive() || timer.mode === b.dataset.mode) return;
    timer = freshTimer(b.dataset.mode, timer.taskId);
    saveTimer();
    renderTimer();
  }));
  $('#taskSelect').addEventListener('change', e => {
    if (isActive()) return;
    timer.taskId = e.target.value || null;
    saveTimer();
    renderTimer();
  });
  $('#presets').innerHTML = PRESETS.map(m => `<button type="button" data-min="${m}">${m}分</button>`).join('');
  $$('#presets button').forEach(b => b.addEventListener('click', () => {
    S().downMinutes = Number(b.dataset.min);
    saveData();
    renderTimer();
  }));
  $('#downMinutes').addEventListener('change', e => {
    S().downMinutes = clampInt(e.target.value, 1, 600, S().downMinutes);
    saveData();
    renderTimer();
  });
  $('#btnStart').addEventListener('click', () => (timer.running ? pauseTimer() : startTimer()));
  $('#btnStop').addEventListener('click', stopTimer);
  $('#btnReset').addEventListener('click', discardTimer);
  $('#btnSkip').addEventListener('click', skipPhase);

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || !$('#tab-timer').classList.contains('active')) return;
    if (e.target.closest('input, select, textarea, button')) return;
    e.preventDefault();
    timer.running ? pauseTimer() : startTimer();
  });

  // tasks
  $('#taskColor').value = nextColor();
  $('#taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#taskName').value.trim();
    if (!name) return;
    if (data.tasks.some(t => t.name === name && !t.archived)) { toast('同じ名前のタスクがあります'); return; }
    const task = { id: uid(), name, category: $('#taskCat').value, color: safeColor($('#taskColor').value), archived: false, createdAt: Date.now() };
    data.tasks.push(task);
    saveData();
    $('#taskName').value = '';
    $('#taskColor').value = nextColor();
    if (!isActive()) { timer.taskId = task.id; saveTimer(); }
    renderAll();
    toast(`「${name}」を追加しました`);
  });
  $('#showArchived').addEventListener('change', renderTaskList);
  $('#taskList').addEventListener('change', e => {
    const row = e.target.closest('.task-row');
    const t = row && getTask(row.dataset.id);
    if (!t) return;
    if (e.target.dataset.action === 'color') t.color = safeColor(e.target.value);
    if (e.target.dataset.action === 'cat') t.category = e.target.value === 'daily' ? 'daily' : 'work';
    saveData();
    renderAll();
  });
  $('#taskList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    const row = e.target.closest('.task-row');
    const t = row && getTask(row.dataset.id);
    if (!btn || !t) return;
    const busy = isActive() && timer.taskId === t.id;
    if (btn.dataset.action === 'rename') {
      const name = prompt('新しいタスク名', t.name);
      if (name && name.trim()) { t.name = name.trim().slice(0, 40); saveData(); renderAll(); }
    } else if (btn.dataset.action === 'archive') {
      if (busy) { toast('計測中のタスクはアーカイブできません'); return; }
      t.archived = !t.archived;
      saveData();
      renderAll();
      toast(t.archived ? 'アーカイブしました（記録は残ります）' : '元に戻しました');
    } else if (btn.dataset.action === 'delete') {
      if (busy) { toast('計測中のタスクは削除できません'); return; }
      const n = data.sessions.filter(s => s.taskId === t.id).length;
      if (!confirm(`「${t.name}」を削除します。${n ? `このタスクの記録 ${n} 件も削除されます。` : ''}\n記録を残したい場合は「アーカイブ」を使ってください。`)) return;
      data.tasks = data.tasks.filter(x => x.id !== t.id);
      data.sessions = data.sessions.filter(s => s.taskId !== t.id);
      saveData();
      renderAll();
    }
  });

  // stats
  $$('#periodSwitch button').forEach(b => b.addEventListener('click', () => { statPeriod = b.dataset.period; renderStats(); }));
  $('#catFilter').addEventListener('change', e => { statCat = e.target.value; renderStats(); });
  $('#sessionList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    const row = e.target.closest('.sess');
    const s = row && data.sessions.find(x => x.id === row.dataset.id);
    if (!btn || !s) return;
    if (btn.dataset.action === 'del') {
      if (!confirm(`${fmtMD(s.start)} ${fmtHM(s.start)} の「${taskName(s.taskId)}」（${fmtDur(s.dur)}）を削除しますか？`)) return;
      data.sessions = data.sessions.filter(x => x.id !== s.id);
    } else {
      const v = prompt('作業時間（分）', (s.dur / 60).toFixed(1).replace(/\.0$/, ''));
      if (v === null) return;
      const min = Number(v);
      if (!Number.isFinite(min) || min <= 0) { toast('正しい分数を入力してください'); return; }
      const note = prompt('メモ（空欄でもOK）', s.note || '');
      s.dur = Math.round(min * 60);
      s.end = s.start + s.dur * 1000;
      if (note !== null) s.note = note.slice(0, 100);
    }
    saveData();
    renderAll();
  });
  $('#manDate').value = dateInputValue(Date.now());
  $('#manTime').value = fmtHM(Date.now() - 30 * 60000);
  $('#manualForm').addEventListener('submit', e => {
    e.preventDefault();
    const taskId = $('#manTask').value;
    if (!getTask(taskId)) { toast('タスクを選んでください'); return; }
    const start = new Date(`${$('#manDate').value}T${$('#manTime').value}`).getTime();
    const min = Number($('#manMin').value);
    if (!Number.isFinite(start) || !(min > 0)) { toast('日時と分数を確認してください'); return; }
    addSession(taskId, start, start + min * 60000, min * 60000, 'manual', $('#manNote').value.trim().slice(0, 100));
    $('#manNote').value = '';
    renderAll();
    toast(`「${taskName(taskId)}」に ${fmtDur(min * 60)} 追加しました`);
  });

  // settings
  const num = (id, key, min, max) => $(id).addEventListener('change', e => {
    S()[key] = clampInt(e.target.value, min, max, S()[key]);
    e.target.value = S()[key];
    saveData();
    if (!isActive()) renderTimer();
  });
  num('#setWork', 'pomoWork', 1, 180);
  num('#setShort', 'pomoShort', 1, 60);
  num('#setLong', 'pomoLong', 1, 120);
  num('#setInterval', 'pomoInterval', 1, 12);
  $('#setAuto').addEventListener('change', e => { S().autoStart = e.target.checked; saveData(); });
  $('#setSound').addEventListener('change', e => { S().sound = e.target.checked; saveData(); });
  $('#setNotify').addEventListener('change', async e => {
    if (!e.target.checked) { S().notify = false; saveData(); return; }
    if (!('Notification' in window)) { e.target.checked = false; toast('このブラウザは通知に対応していません'); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    S().notify = p === 'granted';
    e.target.checked = S().notify;
    saveData();
    toast(S().notify ? '通知をオンにしました' : '通知が許可されませんでした（ブラウザの設定を確認してください）');
  });
  $('#btnTestSound').addEventListener('click', () => beep(true));

  $('#btnExport').addEventListener('click', () => download(`worklog-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json'));
  $('#btnExportCsv').addEventListener('click', exportCsv);
  $('#importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let d = null;
      try { d = normalizeData(JSON.parse(reader.result)); } catch (err) { /* invalid */ }
      if (!d) { toast('読み込めませんでした（WorkLog の JSON ファイルを選んでください）'); return; }
      if (!confirm(`タスク ${d.tasks.length} 件・記録 ${d.sessions.length} 件を読み込みます。\n現在のデータは置き換えられます。よろしいですか？`)) return;
      data = d;
      saveData();
      if (!isActive()) timer.taskId = null;
      renderAll();
      toast('読み込みました');
    };
    reader.readAsText(file);
  });
  $('#btnClear').addEventListener('click', () => {
    if (!confirm('すべてのタスクと記録を削除して初期状態に戻します。元に戻せません。よろしいですか？')) return;
    data = defaultData();
    timer = freshTimer();
    saveData();
    saveTimer();
    renderAll();
    toast('初期化しました');
  });

  // 他のタブ・ウィンドウでの変更を反映
  window.addEventListener('storage', e => {
    if (e.key === STORE_KEY) { data = loadData(); renderAll(); }
    if (e.key === TIMER_KEY) { timer = loadTimer(); renderTaskSelects(); renderTimer(); renderToday(); }
  });
}

/* ---------- main loop ---------- */
let lastSec = -1;
function tick() {
  checkCompletion();
  updateDisplay();
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== lastSec) {
    lastSec = sec;
    if (timer.running && $('#tab-timer').classList.contains('active')) renderToday();
  }
}

function init() {
  bindEvents();
  renderAll();
  let tab = 'timer';
  try { tab = localStorage.getItem(TAB_KEY) || 'timer'; } catch (e) { /* ignore */ }
  showTab(tab);
  checkCompletion();
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
