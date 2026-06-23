// js/bracket.js — логика сетки и голосования

function voteInMatch(tournament, roundIdx, matchIdx, side) {
  let voteKey = `vote_${tournament.id}_${roundIdx}_${matchIdx}`;
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
    
    // Обновляем wins в ОРИГИНАЛЬНЫХ объектах db.players
    let origA = allPlayers.find(p => p.id === m.a.id);
    let origB = allPlayers.find(p => p.id === m.b.id);
    let origWinner = allPlayers.find(p => p.id === m.winner.id);
    
    if (origA) origA.wins = origA.wins || 0;
    if (origB) origB.wins = origB.wins || 0;
    if (origWinner) { origWinner.wins = (origWinner.wins || 0) + 1; }
    
    winners.push(m.winner);
  }
  
  // Следующий раунд
  if (tournament.currentRound + 1 < tournament.rounds.length) {
    let next = tournament.rounds[tournament.currentRound + 1];
    next.matches = createMatches(winners);
    next.isActive = true;
    next.startedAt = new Date().toISOString();
    tournament.currentRound++;
  } else {
    tournament.status = "completed";
    tournament.winner = winners[0] || null;
    tournament.completedAt = new Date().toISOString();
  }
  
  return tournament;
}
