// js/bracket.js — логика сетки и голосования v2 (с защитой)

function voteInMatch(tournament, roundIdx, matchIdx, side) {
    let user = getCurrentUser();
    if (!user) {
        return { ok: false, err: "Войдите, чтобы голосовать" };
    }

    // Анти-накрутка: проверяем в базе
    if (!canUserVote(user.id, tournament.id, roundIdx, matchIdx)) {
        return { ok: false, err: "Вы уже голосовали в этом матче" };
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

    // Записываем голос в базу
    recordVote(user.id, tournament.id, roundIdx, matchIdx, side);
    
    return { ok: true };
}

// ЗАЩИТА: только админ может завершать раунд досрочно
function finalizeRound(tournament, allPlayers) {
    // Проверка прав администратора
    if (!isAdmin()) {
        return { ok: false, err: "Только администратор может завершать раунд", tournament };
    }

    let round = tournament.rounds[tournament.currentRound];
    if (!round || !round.startedAt) return { ok: true, tournament };

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

        let origWinnerId = tournament._playerMap ? tournament._playerMap[m.winner.id] : null;
        if (origWinnerId) {
            let orig = allPlayers.find(p => p.id === origWinnerId);
            if (orig) orig.wins = (orig.wins || 0) + 1;
        } else {
            let orig = allPlayers.find(p => p.name === m.winner.name);
            if (orig) orig.wins = (orig.wins || 0) + 1;
        }

        winners.push(m.winner);
    }

    if (tournament.currentRound + 1 < tournament.rounds.length) {
        let next = tournament.rounds[tournament.currentRound + 1];
        next.matches = createMatches(winners);
        next.isActive = true;
        next.startedAt = new Date().toISOString();
        tournament.currentRound++;

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

    return { ok: true, tournament };
}

// Автозавершение по таймеру (без проверки админа — это системное)
function autoFinalizeRound(tournament, allPlayers) {
    let round = tournament.rounds[tournament.currentRound];
    if (!round || !round.isActive) return tournament;
    
    let timeLeft = getTimeLeft(round.startedAt, tournament.config.voteDurationHours || 24);
    if (timeLeft > 0) return tournament;
    
    // Время вышло — завершаем автоматически
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
        winners.push(m.winner);
    }

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
