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

// Создание сетки. ВАЖНО: сохраняем оригинальные id участников
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
    
    // Placeholder'ы для следующего раунда
    currentPlayers = [];
    for (let idx = 0; idx < matches.length / 2; idx++) {
      currentPlayers.push({
        id: `placeholder_r${rounds.length}_${idx}`,
        name: "TBD",
        url: "#",
        isPlaceholder: true,
        wins: 0
      });
    }
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

// Финализировать текущий раунд tournament.
// Возвращает ОБНОВЛЁННЫЙ tournament. НЕ вызывает getDB/saveDB!
function finalizeRound(tournament) {
  const roundIdx = tournament.currentRound;
  const round = tournament.rounds[roundIdx];
  
  if (!round) return tournament;
  if (!round.startedAt) {
    console.error("Раунд не начат — startedAt отсутствует");
    return tournament;
  }
  
  round.endedAt = new Date();
  round.isActive = false;
  
  const winners = [];
  
  for (let i = 0; i < round.matches.length; i++) {
    const m = round.matches[i];
    
    if (m.a.isBye) {
      m.winner = m.b;
      m.done = true;
      winners.push(m.b);
      continue;
    }
    if (m.b.isBye) {
      m.winner = m.a;
      m.done = true;
      winners.push(m.a);
      continue;
    }
    
    if (m.votesA > m.votesB) m.winner = m.a;
    else if (m.votesB > m.votesA) m.winner = m.b;
    else m.winner = m.a;
    
    m.done = true;
    if (!m.winner.wins) m.winner.wins = 0;
    m.winner.wins++;
    winners.push(m.winner);
  }
  
  // Есть ли следующий раунд?
  if (roundIdx + 1 < tournament.rounds.length) {
    const nextRound = tournament.rounds[roundIdx + 1];
    nextRound.matches = createMatches(winners);
    nextRound.isActive = true;
    nextRound.startedAt = new Date();
    tournament.currentRound = roundIdx + 1;
  } else {
    // Финал — турнир завершён
    tournament.status = "completed";
    tournament.winner = winners[0] || null;
    tournament.completedAt = new Date();
  }
  
  return tournament;
}

// Голосование. Возвращает результат, НЕ сохраняет в localStorage!
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
  if (!match || match.done || match.a.isBye || match.b.isBye) {
    return { success: false, error: "Этот матч недоступен для голосования" };
  }
  
  if (side === 0) match.votesA++;
  else match.votesB++;
  
  localStorage.setItem(voteKey, side === 0 ? "A" : "B");
  return { success: true, match: match };
}
