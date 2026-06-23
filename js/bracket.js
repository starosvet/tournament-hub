// js/bracket.js — логика сетки и голосования

function voteInMatch(tournament, roundIdx, matchIdx, side) {
  let voteKey = "vote_" + tournament.id + "_" + roundIdx + "_" + matchIdx;
  if (localStorage.getItem(voteKey)) {
    return { ok: false, err: "Вы уже голосовали" };
  }
  
  let round = tournament.rounds[roundIdx];
  if (!round || !round.isActive || round.endedAt) {
    return { ok: false, err: "Голосование закрыто" };
  }
  
  let match = round.matches[matchIdx];
  if (!match || match.done || match.a.isBye || match.b.isBye) {
    return { ok: false, err: "Матч недоступен" };
  }
  
  if (side === 0) match.votesA++;
  else match.votesB++;
  
  localStorage.setItem(voteKey, side === 0 ? "A" : "B");
  return { ok: true };
}

function finalizeRound(tournament, allPlayers) {
  let round = tournament.rounds[tournament.currentRound];
  if (!round || !round.startedAt) return tournament;
  
  round.endedAt = new Date().toISOString();
  round.isActive = false;
  
  let winners = [];
  
  for (let m of round.matches) {
    if (m.a.isBye) { m.winner = m.b; m.done = true; winners.push(m.b); continue; }
    if (m.b.isBye) { m.winner = m.a; m.done = true; winners.push(m.a); continue; }
    
    if (m.votesA > m.votesB) m.winner = m.a;
    else if (m.votesB > m.votesA) m.winner = m.b;
    else m.winner = m.a;
    
    m.done = true;
    
    // Обновляем wins в ОРИГИНАЛЬНЫХ объектах db.players через маппинг
    let origWinnerId = tournament._playerMap ? tournament._playerMap[m.winner.id] : null;
    if (origWinnerId) {
      let orig = allPlayers.find(p => p.id === origWinnerId);
      if (orig) orig.wins = (orig.wins || 0) + 1;
    } else {
      // Fallback: ищем по имени
      let orig = allPlayers.find(p => p.name === m.winner.name);
      if (orig) orig.wins = (orig.wins || 0) + 1;
    }
    
    winners.push(m.winner);
  }
  
  // Следующий раунд
  if (tournament.currentRound + 1 < tournament.rounds.length) {
    let next = tournament.rounds[tournament.currentRound + 1];
    next.matches = createMatches(winners);
    next.isActive = true;
    next.startedAt = new Date().toISOString();
    tournament.currentRound++;
    
    // Обновляем маппинг для нового раунда
    next.matches.forEach(m => {
      if (m.a.name !== "—" && m.a.name !== "TBD") {
        let orig = allPlayers.find(op => op.name === m.a.name);
        if (orig) tournament._playerMap[m.a.id] = orig.id;
      }
      if (m.b.name !== "—" && m.b.name !== "TBD") {
        let orig = allPlayers.find(op => op.name === m.b.name);
        if (orig) tournament._playerMap[m.b.id] = orig.id;
      }
    });
  } else {
    tournament.status = "completed";
    tournament.winner = winners[0] || null;
    tournament.completedAt = new Date().toISOString();
  }
  
  return tournament;
}
