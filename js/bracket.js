const STAGE_NAMES = {
  1: "Финал",
  2: "1/2 финала",
  4: "1/4 финала",
  8: "1/8 финала",
  16: "1/16 финала",
  32: "1/32 финала",
  64: "1/64 финала",
  128: "1/128 финала"
};

function getStageName(matchCount) {
  return STAGE_NAMES[matchCount] || `Раунд ${matchCount}`;
}

function createBracket(players) {
  const shuffled = shuffle([...players]);
  const count = shuffled.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(count)));
  const byes = bracketSize - count;
  
  const participants = [...shuffled];
  for (let i = 0; i < byes; i++) {
    participants.push({ id: `bye_${i}`, name: "—", url: "#", isBye: true, wins: 0 });
  }
  
  const finalList = shuffle(participants);
  const rounds = [];
  let currentPlayers = finalList;
  
  while (currentPlayers.length > 1) {
    const matches = createMatches(currentPlayers);
    rounds.push({
      id: rounds.length,
      name: getStageName(matches.length),
      matches: matches,
      startedAt: null,
      endedAt: null,
      isActive: rounds.length === 0
    });
    
    currentPlayers = matches.map((m, idx) => ({
      id: `winner_r${rounds.length}_${idx}`,
      name: "TBD",
      url: "#",
      isPlaceholder: true,
      wins: 0
    }));
  }
  
  return {
    id: Date.now(),
    createdAt: new Date(),
    status: "active",
    rounds: rounds,
    currentRound: 0,
    winner: null
  };
}

function getTimeLeft(startedAt, durationHours) {
  if (!startedAt) return 0;
  const deadline = new Date(startedAt).getTime() + durationHours * 3600 * 1000;
  return Math.max(0, deadline - Date.now());
}

function finalizeRound(tournament) {
  const round = tournament.rounds[tournament.currentRound];
  if (!round) return tournament;
  
  round.endedAt = new Date();
  round.isActive = false;
  
  const winners = [];
  round.matches.forEach(m => {
    if (m.a.isBye) { m.winner = m.b; m.done = true; winners.push(m.b); return; }
    if (m.b.isBye) { m.winner = m.a; m.done = true; winners.push(m.a); return; }
    
    if (m.votesA > m.votesB) m.winner = m.a;
    else if (m.votesB > m.votesA) m.winner = m.b;
    else m.winner = m.a;
    
    m.done = true;
    if (!m.winner.wins) m.winner.wins = 0;
    m.winner.wins++;
    winners.push(m.winner);
    
    if (!tournament.logs) tournament.logs = [];
    tournament.logs.push({
      date: new Date(),
      winner: m.winner.name,
      match: m,
      roundName: round.name
    });
  });
  
  const db = getDB();
  winners.forEach(w => {
    const p = db.players.find(x => x.id === w.id || x.name === w.name);
    if (p) { p.wins = (p.wins || 0) + 1; }
  });
  saveDB(db);
  
  if (tournament.currentRound + 1 < tournament.rounds.length) {
    const nextRound = tournament.rounds[tournament.currentRound + 1];
    nextRound.matches = createMatches(winners);
    nextRound.isActive = true;
    nextRound.startedAt = new Date();
    tournament.currentRound++;
  } else {
    tournament.status = "completed";
    tournament.winner = winners[0] || null;
    tournament.completedAt = new Date();
    
    const db2 = getDB();
    if (!db2.pastTournaments) db2.pastTournaments = [];
    db2.pastTournaments.push({...tournament});
    saveDB(db2);
  }
  
  return tournament;
}

function voteMatch(tournament, roundIdx, matchIdx, side) {
  const voteKey = `vote_${tournament.id}_${roundIdx}_${matchIdx}`;
  if (localStorage.getItem(voteKey)) {
    return { success: false, error: "Вы уже голосовали в этом матче" };
  }
  
  const round = tournament.rounds[roundIdx];
  if (!round || !round.isActive || round.endedAt) {
    return { success: false, error: "Голосование закрыто" };
  }
  
  const match = round.matches[matchIdx];
  if (match.done || match.a.isBye || match.b.isBye) {
    return { success: false, error: "Этот матч недоступен для голосования" };
  }
  
  if (side === 0) match.votesA++;
  else match.votesB++;
  
  localStorage.setItem(voteKey, side === 0 ? "A" : "B");
  return { success: true, match };
}
