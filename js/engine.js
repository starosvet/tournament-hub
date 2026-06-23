// js/engine.js — ядро турнирного движка

function shuffle(arr) {
  let indices = arr.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map(i => arr[i]);
}

function createMatches(players) {
  let result = [];
  let p = shuffle([...players]);
  for (let i = 0; i < p.length; i += 2) {
    if (i + 1 >= p.length) break;
    result.push({
      a: p[i],
      b: p[i + 1],
      votesA: 0,
      votesB: 0,
      winner: null,
      done: false
    });
  }
  return result;
}

function createBracket(players) {
  let count = players.length;
  let bracketSize = 1;
  while (bracketSize < count) bracketSize *= 2;
  let byes = bracketSize - count;
  
  let participants = shuffle([...players]);
  for (let i = 0; i < byes; i++) {
    participants.push({ id: `bye_${i}`, name: "—", url: "#", isBye: true, wins: 0 });
  }
  participants = shuffle(participants);
  
  let rounds = [];
  let current = participants;
  
  while (current.length > 1) {
    let matches = createMatches(current);
    rounds.push({
      id: rounds.length,
      name: getRoundName(matches.length),
      matches: matches,
      startedAt: null,
      endedAt: null,
      isActive: rounds.length === 0
    });
    
    current = [];
    for (let i = 0; i < matches.length / 2; i++) {
      current.push({ id: `tbd_${rounds.length}_${i}`, name: "TBD", url: "#", isPlaceholder: true, wins: 0 });
    }
  }
  
  return {
    id: Date.now(),
    name: "Новый турнир",
    description: "",
    status: "active",
    config: { totalRounds: rounds.length, voteDurationHours: 24 },
    rounds: rounds,
    currentRound: 0,
    winner: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null
  };
}

function getRoundName(matchCount) {
  const names = { 1: "Финал", 2: "1/2 финала", 4: "1/4 финала", 8: "1/8 финала", 
                  16: "1/16 финала", 32: "1/32 финала", 64: "1/64 финала" };
  return names[matchCount] || `Раунд ${matchCount}`;
}

function getTimeLeft(startedAt, hours) {
  if (!startedAt) return 0;
  let deadline = new Date(startedAt).getTime() + hours * 3600000;
  return Math.max(0, deadline - Date.now());
}

function formatDuration(ms) {
  if (ms <= 0) return "00:00:00";
  let h = Math.floor(ms / 3600000);
  let m = Math.floor((ms % 3600000) / 60000);
  let s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
