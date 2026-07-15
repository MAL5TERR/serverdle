const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadData(){
  try{
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }catch(e){
    return { results: [] };
  }
}

function saveData(data){
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Upsert so re-submitting the same user+date overwrites instead of
// creating duplicate leaderboard entries (e.g. if they refresh mid-game).
function upsertResult(result){
  const data = loadData();
  const idx = data.results.findIndex(r => r.username === result.username && r.date === result.date);
  if(idx >= 0) data.results[idx] = result;
  else data.results.push(result);
  saveData(data);
  return data;
}

function getLeaderboard(){
  const data = loadData();
  const byUser = {};
  for(const r of data.results){
    if(!byUser[r.username]) byUser[r.username] = { username: r.username, played: 0, wins: 0, totalAttempts: 0 };
    const u = byUser[r.username];
    u.played += 1;
    if(r.won){
      u.wins += 1;
      u.totalAttempts += r.attemptsUsed;
    }
  }
  return Object.values(byUser)
    .map(u => ({
      ...u,
      winRate: u.played ? Math.round((u.wins / u.played) * 100) : 0,
      avgAttempts: u.wins ? +(u.totalAttempts / u.wins).toFixed(2) : null
    }))
    .sort((a, b) => b.wins - a.wins || (a.avgAttempts ?? 99) - (b.avgAttempts ?? 99));
}

function getUserStats(username){
  const data = loadData();
  const mine = data.results.filter(r => r.username === username);
  const wins = mine.filter(r => r.won);
  return {
    username,
    played: mine.length,
    wins: wins.length,
    winRate: mine.length ? Math.round((wins.length / mine.length) * 100) : 0,
    avgAttempts: wins.length ? +(wins.reduce((s, r) => s + r.attemptsUsed, 0) / wins.length).toFixed(2) : null
  };
}

function dateMinusDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Counts consecutive daily wins ending at the player's most recent entry.
// A miss or a gap in dates breaks the streak.
function getStreak(username){
  const data = loadData();
  const mine = data.results.filter(r => r.username === username).sort((a, b) => b.date.localeCompare(a.date));
  if(mine.length === 0) return 0;

  const byDate = new Map(mine.map(r => [r.date, r]));
  let cursor = mine[0].date;
  if(!byDate.get(cursor).won) return 0;

  let streak = 0;
  while(byDate.has(cursor) && byDate.get(cursor).won){
    streak += 1;
    cursor = dateMinusDays(cursor, 1);
  }
  return streak;
}

function resetUser(username){
  const data = loadData();
  const before = data.results.length;
  data.results = data.results.filter(r => r.username !== username);
  saveData(data);
  return before - data.results.length;
}

module.exports = { loadData, saveData, upsertResult, getLeaderboard, getUserStats, getStreak, resetUser };
