/* ============================================================
   1. DATA — loaded from members.json (see fetch below)
   ============================================================ */
let people = [];

const DAY_MS = 86400000;
const TIMEZONE_OFFSET_HOURS = 3; // GMT+3 — day resets at midnight in this timezone
const TIMEZONE_OFFSET_MS = TIMEZONE_OFFSET_HOURS * 3600000;
const MAX_ATTEMPTS = 5;
const STORAGE_KEY = "serverdle_state_v2";
const NAME_KEY = "mafiadle_username";

/* ============================================================
   1b. FIREBASE CONFIG
   Paste your Firebase project's config below (Project settings →
   General → Your apps → SDK setup and configuration → Config).
   Leave apiKey as-is to disable all Firestore reads/writes.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyASkNRon6_0NyKtDLEd4PXLv4bnX5emziE",
  authDomain: "mafiadle.firebaseapp.com",
  projectId: "mafiadle",
  storageBucket: "mafiadle.firebasestorage.app",
  messagingSenderId: "792188053218",
  appId: "1:792188053218:web:b5f4a0ece13710af55a0bb"
};

// Optional: Discord webhook URL (Server Settings → Integrations → Webhooks).
// Leave as-is to disable posting results to Discord. This is independent
// of Firestore — you can use either, both, or neither.
const DISCORD_WEBHOOK_URL = "PASTE_YOUR_DISCORD_WEBHOOK_URL_HERE";

let db = null;
let firebaseReady = false;

function firebaseConfigured(){
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('PASTE_YOUR') === -1;
}

function discordConfigured(){
  return DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.indexOf('PASTE_YOUR') === -1;
}

function initFirebase(){
  if(!firebaseConfigured()) return;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    firebaseReady = true;
  }catch(e){
    console.error('Failed to init Firebase', e);
    firebaseReady = false;
  }
}

let dayIndex, answerIndex, answer;
let state;
let currentUsername = null;

/* ============================================================
   2. DOM REFERENCES
   ============================================================ */
const input = document.getElementById('guessInput');
const dropdown = document.getElementById('dropdown');
const board = document.getElementById('board');
const message = document.getElementById('message');
const attemptsDots = document.getElementById('attemptsDots');
const attemptsLabel = document.getElementById('attemptsLabel');
const nameGate = document.getElementById('nameGate');
const nameInput = document.getElementById('nameInput');
const nameSubmit = document.getElementById('nameSubmit');
const nameCancel = document.getElementById('nameCancel');
const changeUserBtn = document.getElementById('changeUserBtn');

const leaderboardBtn = document.getElementById('leaderboardBtn');
const todayBtn = document.getElementById('todayBtn');
const leaderboardModal = document.getElementById('leaderboardModal');
const todayModal = document.getElementById('todayModal');
const leaderboardBody = document.getElementById('leaderboardBody');
const todayBody = document.getElementById('todayBody');

/* ============================================================
   2b. NAME GATE — ask once per browser, remember after that
   ============================================================ */
function getSavedUsername(){
  try{ return localStorage.getItem(NAME_KEY); }catch(e){ return null; }
}

function saveUsername(name){
  try{ localStorage.setItem(NAME_KEY, name); }catch(e){}
}

let isChangingName = false;

function submitName(){
  const val = nameInput.value.trim();
  if(!val) return;

  const oldName = currentUsername;
  currentUsername = val;
  saveUsername(val);
  nameGate.classList.remove('show');

  // If this was a rename (not first-time setup) and the name actually changed,
  // migrate all of their existing Firestore results docs to the new name so
  // the leaderboard and today's-results reflect it too.
  if(isChangingName && oldName && oldName !== val){
    migrateUsername(oldName, val);
  }
  isChangingName = false;
}

function cancelNameChange(){
  nameGate.classList.remove('show');
  isChangingName = false;
}

function initNameGate(){
  const saved = getSavedUsername();
  if(saved){
    currentUsername = saved;
    nameGate.classList.remove('show');
    return;
  }
  isChangingName = false;
  nameCancel.style.display = 'none';
  nameGate.classList.add('show');
  nameInput.focus();
}

function openChangeUserGate(){
  isChangingName = true;
  nameInput.value = currentUsername || '';
  nameCancel.style.display = 'block';
  nameGate.classList.add('show');
  nameInput.focus();
  nameInput.select();
}

// Renames every one of this user's stored results docs from oldName to newName
// (results are keyed as "username_date", so each doc needs a new id).
async function migrateUsername(oldName, newName){
  if(!firebaseConfigured() || !firebaseReady) return;
  try{
    const snap = await db.collection('results').where('username', '==', oldName).get();
    if(snap.empty) return;

    const batch = db.batch();
    snap.forEach(doc => {
      const data = doc.data();
      const newId = `${newName}_${data.date}`;
      batch.set(db.collection('results').doc(newId), { ...data, username: newName });
      batch.delete(doc.ref);
    });
    await batch.commit();
  }catch(e){
    console.error('Failed to migrate username in Firestore', e);
  }
}

nameSubmit.addEventListener('click', submitName);
nameCancel.addEventListener('click', cancelNameChange);
changeUserBtn.addEventListener('click', openChangeUserGate);
nameInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){
    e.preventDefault();
    submitName();
  } else if(e.key === 'Escape' && isChangingName){
    cancelNameChange();
  }
});

function changeUser(){
  const prevName = currentUsername || '';
  nameInput.value = prevName;
  nameGate.classList.add('show');
  nameInput.focus();
  nameInput.select();
}

changeUserBtn.addEventListener('click', changeUser);

function openChangeUser(){
  nameInput.value = currentUsername || '';
  nameGate.classList.add('show');
  nameInput.focus();
  nameInput.select();
}

/* ============================================================
   2c. STATS MODALS — all-time leaderboard & today's results
   ============================================================ */
function getTodayDateStr(){
  const idx = Math.floor((Date.now() + TIMEZONE_OFFSET_MS) / DAY_MS);
  return new Date(idx * DAY_MS).toISOString().slice(0, 10);
}

function openModal(modal){ modal.classList.add('show'); }
function closeModal(modal){ modal.classList.remove('show'); }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    closeModal(document.getElementById(btn.dataset.close));
  });
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if(e.target === modal) closeModal(modal); // click outside the box closes it
  });
});

function renderLoading(container){
  container.innerHTML = '<p class="modal-loading">جارِ التحميل...</p>';
}

function renderErrorMsg(container){
  container.innerHTML = '<p class="modal-error">تعذّر تحميل البيانات. تأكد أن إعدادات Firebase مضبوطة بشكل صحيح.</p>';
}

async function openLeaderboard(){
  openModal(leaderboardModal);
  if(!firebaseConfigured() || !firebaseReady){
    leaderboardBody.innerHTML = '<p class="modal-error">لم يتم ربط الموقع بقاعدة البيانات بعد.</p>';
    return;
  }
  renderLoading(leaderboardBody);
  try{
    const snap = await db.collection('results').get();

    // Aggregate per-user stats client-side from every stored result doc.
    const stats = {};
    snap.forEach(doc => {
      const r = doc.data();
      if(!r.username) return;
      if(!stats[r.username]){
        stats[r.username] = { username: r.username, played: 0, wins: 0, totalAttempts: 0 };
      }
      const s = stats[r.username];
      s.played += 1;
      if(r.won){
        s.wins += 1;
        s.totalAttempts += (r.attemptsUsed || 0);
      }
    });

    const board = Object.values(stats).map(s => ({
      username: s.username,
      played: s.played,
      wins: s.wins,
      winRate: s.played ? Math.round((s.wins / s.played) * 100) : 0,
      avgAttempts: s.wins ? (s.totalAttempts / s.wins).toFixed(1) : null
    })).sort((a, b) => b.winRate - a.winRate || b.played - a.played);

    renderLeaderboard(board);
  }catch(e){
    console.error('Failed to load leaderboard', e);
    renderErrorMsg(leaderboardBody);
  }
}

function renderLeaderboard(board){
  if(!board || board.length === 0){
    leaderboardBody.innerHTML = '<p class="modal-empty">لا توجد نتائج مسجلة بعد.</p>';
    return;
  }
  const rows = board.map((u, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${u.username}</td>
      <td>${u.wins}/${u.played}</td>
      <td>${u.winRate}%</td>
      <td>${u.avgAttempts ?? '—'}</td>
    </tr>
  `).join('');
  leaderboardBody.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr><th></th><th>الاسم</th><th>الفوز/اللعب</th><th>النسبة</th><th>متوسط المحاولات</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function openToday(){
  openModal(todayModal);
  if(!firebaseConfigured() || !firebaseReady){
    todayBody.innerHTML = '<p class="modal-error">لم يتم ربط الموقع بقاعدة البيانات بعد.</p>';
    return;
  }
  renderLoading(todayBody);
  try{
    const date = getTodayDateStr();
    const snap = await db.collection('results').where('date', '==', date).get();
    const results = snap.docs.map(doc => doc.data());
    renderToday(results);
  }catch(e){
    console.error('Failed to load today\'s results', e);
    renderErrorMsg(todayBody);
  }
}

function renderToday(results){
  if(!results || results.length === 0){
    todayBody.innerHTML = '<p class="modal-empty">ماحد لعب تحدي اليوم بعد.</p>';
    return;
  }
  const rows = results.map(r => `
    <tr>
      <td>${r.username}</td>
      <td class="${r.won ? 'result-win' : 'result-loss'}">${r.won ? '✅ فاز' : '❌ خسر'}</td>
      <td>${r.attemptsUsed}/${r.maxAttempts}</td>
    </tr>
  `).join('');
  todayBody.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr><th>الاسم</th><th>النتيجة</th><th>المحاولات</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

leaderboardBtn.addEventListener('click', openLeaderboard);
todayBtn.addEventListener('click', openToday);
changeUserBtn.addEventListener('click', openChangeUser);

/* ============================================================
   3. STATE PERSISTENCE
   ============================================================ */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(parsed.dayIndex !== dayIndex) return null; // stale day, discard
    return parsed;
  }catch(e){ return null; }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    dayIndex,
    guesses: state.guesses,
    finished: state.finished,
    won: state.won
  }));
}

/* ============================================================
   4. COMPARISON LOGIC
   ============================================================ */
function compareList(guessList, answerList){
  const gSet = new Set(guessList || []);
  const aSet = new Set(answerList || []);

  // Are the sets perfectly identical?
  const isIdentical = gSet.size === aSet.size && [...gSet].every(item => aSet.has(item));

  if(isIdentical){
    return 'green';
  }

  // Is there any shared value at all?
  const hasOverlap = [...gSet].some(item => aSet.has(item));

  if(hasOverlap){
    return 'yellow';
  }

  return 'red';
}

function compareGuess(guess){
  const result = {};

  const diff = Math.abs(guess.joinYear - answer.joinYear);
  if(diff === 0) result.joinYear = 'green';
  else if(diff === 1) result.joinYear = 'yellow';
  else result.joinYear = 'red';

  result.interest = compareList(guess.interest, answer.interest);
  result.favorite = compareList(guess.favorite, answer.favorite);

  ['chatActivity','status'].forEach(key => {
    result[key] = (guess[key] === answer[key]) ? 'green' : 'red';
  });

  return result;
}

/* ============================================================
   5. RENDERING
   ============================================================ */
function renderDots(){
  attemptsDots.innerHTML = '';
  for(let i=0; i<MAX_ATTEMPTS; i++){
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.guesses.length ? ' used' : '');
    attemptsDots.appendChild(d);
  }

  const left = MAX_ATTEMPTS - state.guesses.length;

  let attemptsText = '';
  if (left === 1) attemptsText = 'محاولة واحدة';
  else if (left === 2) attemptsText = 'محاولتان';
  else attemptsText = `${left} محاولات`;

  attemptsLabel.textContent = state.finished
    ? (state.won ? 'تم الحل!' : 'انتهت المحاولات')
    : `تبقّى ${attemptsText}`;
}

function renderRow(guessName){
  const person = people.find(p => p.name === guessName);
  if(!person) return;
  const result = compareGuess(person);

  const row = document.createElement('div');
  row.className = 'guess-row';

  const nameCell = document.createElement('div');
  nameCell.className = 'cell name-cell';
  nameCell.textContent = person.name;
  nameCell.setAttribute('data-label','الاسم');
  row.appendChild(nameCell);

  const fields = [
    ['joinYear', person.joinYear],
    ['interest', (person.interest || []).join(', ')],
    ['favorite', (person.favorite || []).join(', ')],
    ['chatActivity', person.chatActivity],
    ['status', person.status]
  ];

  const labels = {
    joinYear:'سنة الانضمام',
    interest:'الاهتمامات',
    favorite:'المفضلة',
    chatActivity:'نشاط الدردشة',
    status:'الحالة'
  };

  fields.forEach(([key, value]) => {
    const cell = document.createElement('div');
    cell.className = 'cell ' + result[key];
    cell.textContent = value;
    cell.setAttribute('data-label', labels[key]);
    row.appendChild(cell);
  });

  board.insertBefore(row, board.firstChild);
}

function renderBoard(){
  board.innerHTML = '';
  state.guesses.forEach(g => renderRow(g));
}

function renderMessage(){
  message.classList.remove('show','win','lose');
  if(!state.finished) return;

  if(state.won){
    message.textContent = `🎉 فزت! الإجابة كانت ${answer.name}.`;
    message.classList.add('show','win');
  } else {
    message.textContent = `❌ انتهت محاولاتك. الإجابة كانت ${answer.name}.`;
    message.classList.add('show','lose');
  }
}

function renderLockState(){
  input.disabled = state.finished;
}

function renderAll(){
  renderDots();
  renderBoard();
  renderMessage();
  renderLockState();
}

/* ============================================================
   6. AUTOCOMPLETE
   ============================================================ */
let activeIndex = -1;

function getMatches(query){
  const q = query.trim().toLowerCase();
  if(!q) return [];
  return people.filter(p => p.name.toLowerCase().includes(q));
}

function isAlreadyGuessed(name){
  return state.guesses.includes(name);
}

function renderDropdown(matches){
  dropdown.innerHTML = '';
  activeIndex = -1;

  if(matches.length === 0){
    dropdown.classList.remove('show');
    return;
  }

  matches.forEach(person => {
    const item = document.createElement('div');
    const already = isAlreadyGuessed(person.name);
    item.className = 'dropdown-item' + (already ? ' disabled' : '');
    item.innerHTML = `<span>${person.name}</span>${already ? '<small>تم تخمينه مسبقًا</small>' : ''}`;
    if(!already){
      item.addEventListener('click', () => submitGuess(person.name));
    }
    dropdown.appendChild(item);
  });

  dropdown.classList.add('show');
}

input.addEventListener('input', () => {
  if(state.finished) return;
  const matches = getMatches(input.value);
  renderDropdown(matches);
});

input.addEventListener('focus', () => {
  if(state.finished) return;
  const matches = getMatches(input.value);
  if(matches.length) renderDropdown(matches);
});

document.addEventListener('click', (e) => {
  if(!e.target.closest('.search-wrap')){
    dropdown.classList.remove('show');
  }
});

input.addEventListener('keydown', (e) => {
  const items = Array.from(dropdown.querySelectorAll('.dropdown-item:not(.disabled)'));
  if(!dropdown.classList.contains('show') || items.length === 0) return;

  if(e.key === 'ArrowDown'){
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
    items.forEach(i => i.classList.remove('active'));
    items[activeIndex].classList.add('active');
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    items.forEach(i => i.classList.remove('active'));
    items[activeIndex].classList.add('active');
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(activeIndex >= 0 && items[activeIndex]){
      items[activeIndex].click();
    } else {
      const exact = people.find(p => p.name.toLowerCase() === input.value.trim().toLowerCase());
      if(exact && !isAlreadyGuessed(exact.name)) submitGuess(exact.name);
    }
  } else if(e.key === 'Escape'){
    dropdown.classList.remove('show');
  }
});

/* ============================================================
   7. GUESS SUBMISSION
   ============================================================ */
function submitGuess(name){
  if(state.finished) return;
  if(isAlreadyGuessed(name)) return;
  const person = people.find(p => p.name === name);
  if(!person) return;

  state.guesses.push(name);
  input.value = '';
  dropdown.classList.remove('show');

  if(name === answer.name){
    state.won = true;
    state.finished = true;
  } else if(state.guesses.length >= MAX_ATTEMPTS){
    state.finished = true;
    state.won = false;
  }

  saveState();
  renderAll();

  if(state.finished){
    emitResult();
  }
}

/* ============================================================
   8. RESULT EMISSION — Firestore write + optional Discord webhook
   ============================================================ */
function getServerdleResult(){
  return {
    date: new Date(dayIndex * DAY_MS).toISOString().slice(0,10),
    username: currentUsername || 'مجهول',
    answer: answer.name,
    won: state.won,
    attemptsUsed: state.guesses.length,
    maxAttempts: MAX_ATTEMPTS,
    guesses: state.guesses
  };
}
window.getServerdleResult = getServerdleResult;

function emitResult(){
  const detail = getServerdleResult();
  document.dispatchEvent(new CustomEvent('serverdle:finished', { detail }));
  saveResultToFirestore(detail);
  sendResultToDiscord(detail);
}

async function saveResultToFirestore(detail){
  if(!firebaseConfigured() || !firebaseReady) return;
  try{
    // Deterministic doc id => one result per user per day (upsert on retry/refresh).
    const docId = `${detail.username}_${detail.date}`;
    await db.collection('results').doc(docId).set({
      ...detail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){
    console.error('Failed to save result to Firestore', e);
  }
}

async function sendResultToDiscord(detail){
  if(!discordConfigured()) return;

  const content = detail.won
    ? `🎉 **${detail.username}** حل تحدي اليوم (${detail.date}) وعرف إنه **${detail.answer}** بمحاولة رقم ${detail.attemptsUsed}/${detail.maxAttempts}!`
    : `❌ **${detail.username}** خسر تحدي اليوم (${detail.date}). الإجابة كانت **${detail.answer}**.`;

  try{
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  }catch(e){
    console.error('Failed to send result to Discord webhook', e);
  }
}

/* ============================================================
   9b. DAILY ANSWER SELECTION
   Deterministic "random" pick per day: looks random, but every
   player's browser computes the exact same answer for the same
   date (no server needed), and no member repeats until at least
   5 other members have been the answer since their last turn.
   ============================================================ */
const NO_REPEAT_WINDOW = 5;
// Fixed reference point so the sequence is stable forever, for everyone.
const GAME_START_DAY = Math.floor(Date.UTC(2025, 0, 1) / DAY_MS);

// Manual overrides: force a specific date's answer to a specific member name,
// regardless of what the RNG would have picked. Keyed by "YYYY-MM-DD".
// Only takes effect the first time that date is ever locked in Firestore —
// harmless to leave old entries here forever.
const ANSWER_OVERRIDES = {
  "2026-07-16": "مازن"
};

// Small seeded PRNG (mulberry32) — same seed always gives same output,
// which is what makes this "random but identical for every player".
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickAnswerIndex(targetDayIndex, peopleCount){
  const history = [];
  const start = Math.min(GAME_START_DAY, targetDayIndex);

  for(let day = start; day <= targetDayIndex; day++){
    const rng = mulberry32(day); // new deterministic seed per day
    const windowSize = Math.min(NO_REPEAT_WINDOW, peopleCount - 1);
    const recentlyUsed = history.slice(-windowSize);
    const candidates = [];
    for(let i = 0; i < peopleCount; i++){
      if(!recentlyUsed.includes(i)) candidates.push(i);
    }
    const pick = candidates[Math.floor(rng() * candidates.length)];
    history.push(pick);
  }

  return history[history.length - 1];
}

/* ============================================================
   9c. ANSWER LOCKING
   The first time a given date is ever played, its answer is
   written to Firestore ("answers/{date}") and locked forever.
   Every subsequent load — even after members.json is edited —
   reads that same locked answer back, so edits can never change
   what a past or already-started day's answer was.
   ============================================================ */
function findByName(name){
  const q = (name || '').trim().toLowerCase();
  return people.find(p => p.name.trim().toLowerCase() === q);
}

async function resolveAnswer(dateStr){
  // No Firestore configured — fall back to pure local computation (old behavior).
  if(!firebaseConfigured() || !firebaseReady){
    answerIndex = pickAnswerIndex(dayIndex, people.length);
    answer = people[answerIndex];
    return;
  }

  const docRef = db.collection('answers').doc(dateStr);

  try{
    const lockedName = await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      if(doc.exists){
        return doc.data().name; // already locked by an earlier play — use it as-is
      }

      // First time this date is being played: decide the answer once and lock it.
      let chosenName;
      if(ANSWER_OVERRIDES[dateStr] && findByName(ANSWER_OVERRIDES[dateStr])){
        chosenName = findByName(ANSWER_OVERRIDES[dateStr]).name;
      } else {
        const idx = pickAnswerIndex(dayIndex, people.length);
        chosenName = people[idx].name;
      }

      tx.set(docRef, {
        name: chosenName,
        dayIndex,
        lockedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return chosenName;
    });

    const found = findByName(lockedName);
    if(found){
      answer = found;
    } else {
      // Locked name no longer exists in members.json (e.g. removed) — safe fallback.
      console.warn(`Locked answer "${lockedName}" not found in current members.json, falling back.`);
      answerIndex = pickAnswerIndex(dayIndex, people.length);
      answer = people[answerIndex];
    }
  }catch(e){
    console.error('Failed to resolve locked answer, falling back to local computation', e);
    answerIndex = pickAnswerIndex(dayIndex, people.length);
    answer = people[answerIndex];
  }
}

/* ============================================================
   9. INIT — fetch members.json, then set up the day's game
   ============================================================ */
async function init(){
  initNameGate();
  initFirebase();

  try{
    const res = await fetch('members.json');
    people = await res.json();
  }catch(err){
    message.textContent = 'تعذّر تحميل members.json — تأكد أن الملف موجود وأنك تشغّل الموقع عبر خادم (وليس عبر file://).';
    message.classList.add('show','lose');
    console.error(err);
    return;
  }

  dayIndex = Math.floor((Date.now() + TIMEZONE_OFFSET_MS) / DAY_MS);
  const dateStr = new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

  await resolveAnswer(dateStr);

  state = loadState() || { dayIndex, guesses: [], finished: false, won: false };

  renderAll();
}

// Prevent DOM-null race conditions on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}