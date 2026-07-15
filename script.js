/* ============================================================
   1. DATA — loaded from members.json (see fetch below)
   ============================================================ */
let people = [];

const DAY_MS = 86400000;
const TIMEZONE_OFFSET_HOURS = 3; // GMT+3 — day resets at midnight in this timezone
const TIMEZONE_OFFSET_MS = TIMEZONE_OFFSET_HOURS * 3600000;
const MAX_ATTEMPTS = 5;
const STORAGE_KEY = "serverdle_state_v1";

let dayIndex, answerIndex, answer;
let state;

/* ============================================================
   2. DOM REFERENCES
   ============================================================ */
const input = document.getElementById('guessInput');
const dropdown = document.getElementById('dropdown');
const board = document.getElementById('board');
const message = document.getElementById('message');
const attemptsDots = document.getElementById('attemptsDots');
const attemptsLabel = document.getElementById('attemptsLabel');

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
  const g = guessList || [];
  const a = answerList || [];
  const overlap = g.filter(i => a.includes(i));

  if(g.length === a.length && overlap.length === a.length){
    return 'green'; // identical sets
  } else if(overlap.length > 0){
    return 'yellow'; // at least one shared value
  } else {
    return 'red'; // no overlap at all
  }
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
  attemptsLabel.textContent = state.finished
    ? (state.won ? 'تم الحل!' : 'انتهت المحاولات')
    : `تبقّى ${left} محاولة${left === 1 ? '' : ''}`;
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
  nameCell.setAttribute('data-label','Name');
  row.appendChild(nameCell);

  const fields = [
    ['joinYear', person.joinYear],
    ['interest', (person.interest || []).join(', ')],
    ['favorite', (person.favorite || []).join(', ')],
    ['chatActivity', person.chatActivity],
    ['status', person.status]
  ];

  const labels = { joinYear:'سنة الانضمام', interest:'الاهتمامات', favorite:'Favorite', chatActivity:'نشاط الدردشة', status:'الحالة' };

  fields.forEach(([key, value]) => {
    const cell = document.createElement('div');
    cell.className = 'cell ' + result[key];
    cell.textContent = value;
    cell.setAttribute('data-label', labels[key]);
    row.appendChild(cell);
  });

  board.appendChild(row);
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
   8. DISCORD-BOT-READY HOOK
   ============================================================ */
function getServerdleResult(){
  return {
    date: new Date(dayIndex * DAY_MS).toISOString().slice(0,10),
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

  // Example (disabled by default) for future backend integration:
  // fetch('https://your-discord-bot-endpoint.example.com/api/result', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(detail)
  // });
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
   9. INIT — fetch members.json, then set up the day's game
   ============================================================ */
async function init(){
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
  answerIndex = pickAnswerIndex(dayIndex, people.length);
  answer = people[answerIndex];

  state = loadState() || { dayIndex, guesses: [], finished: false, won: false };

  renderAll();
}

init();