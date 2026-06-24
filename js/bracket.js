// js/bracket.js — логика сетки v3 (победы и Elo у субъектов)

function voteInMatch(tournament, roundIdx, matchIdx, side) {
    let user = getCurrentUser();
    if (!user) {
        return { ok: false, err: "Войдите, чтобы голосовать" };
    }

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

    recordVote(user.id, tournament.id, roundIdx, matchIdx, side);
    
    return { ok: true };
}

// Завершение раунда (только админ)
function finalizeRound(tournament, subjects) {
    if (!isAdmin()) {
        return { ok: false, err: "Только администратор может завершать раунд", tournament };
    }

    let round = tournament.rounds[tournament.currentRound];
    if (!round || !round.startedAt) return { ok: true, tournament };

    round.endedAt = new Date().toISOString();
    round.isActive = false;

    let winners = [];
    let db = getDB();

    for (let m of round.matches) {
        if (m.a.isBye) { m.winner = m.b; m.done = true; winners.push(m.b); continue; }
        if (m.b.isBye) { m.winner = m.a; m.done = true; winners.push(m.a); continue; }

        if (m.votesA > m.votesB) m.winner = m.a;
        else if (m.votesB > m.votesA) m.winner = m.b;
        else m.winner = m.a;

        m.done = true;

        // +1 победа субъекту
        let winnerSubject = db.subjects.find(s => s.id === m.winner.id) || 
                           db.subjects.find(s => s.name === m.winner.name);
        if (winnerSubject) {
            winnerSubject.wins = (winnerSubject.wins || 0) + 1;
        }

        // +1 победа проигравшему (для статистики участия)
        let loser = m.winner.id === m.a.id ? m.b : m.a;
        let loserSubject = db.subjects.find(s => s.id === loser.id) ||
                          db.subjects.find(s => s.name === loser.name);

        // Обновляем Elo
        if (winnerSubject && loserSubject) {
            updateEloAfterMatch(winnerSubject.id, loserSubject.id);
        }

        winners.push(m.winner);
    }

    saveDB(db);

    if (tournament.currentRound + 1 < tournament.rounds.length) {
        let next = tournament.rounds[tournament.currentRound + 1];
        next.matches = createMatches(winners);
        next.isActive = true;
        next.startedAt = new Date().toISOString();
        tournament.currentRound++;

        next.matches.forEach(m => {
            if (m.a.name !== "—" && m.a.name !== "TBD") {
                let orig = db.subjects.find(s => s.name === m.a.name);
                if (orig) tournament._playerMap[m.a.id] = orig.id;
            }
            if (m.b.name !== "—" && m.b.name !== "TBD") {
                let orig = db.subjects.find(s => s.name === m.b.name);
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

// Автозавершение по таймеру
function autoFinalizeRound(tournament) {
    let round = tournament.rounds[tournament.currentRound];
    if (!round || !round.isActive) return tournament;
    
    let timeLeft = getTimeLeft(round.startedAt, tournament.config?.voteDurationHours || 24);
    if (timeLeft > 0) return tournament;
    
    round.endedAt = new Date().toISOString();
    round.isActive = false;

    let winners = [];
    let db = getDB();

    for (let m of round.matches) {
        if (m.a.isBye) { m.winner = m.b; m.done = true; winners.push(m.b); continue; }
        if (m.b.isBye) { m.winner = m.a; m.done = true; winners.push(m.a); continue; }

        if (m.votesA > m.votesB) m.winner = m.a;
        else if (m.votesB > m.votesA) m.winner = m.b;
        else m.winner = m.a;

        m.done = true;

        // +1 победа субъекту
        let winnerSubject = db.subjects.find(s => s.id === m.winner.id) || 
                           db.subjects.find(s => s.name === m.winner.name);
        if (winnerSubject) {
            winnerSubject.wins = (winnerSubject.wins || 0) + 1;
        }

        let loser = m.winner.id === m.a.id ? m.b : m.a;
        let loserSubject = db.subjects.find(s => s.id === loser.id) ||
                          db.subjects.find(s => s.name === loser.name);

        if (winnerSubject && loserSubject) {
            updateEloAfterMatch(winnerSubject.id, loserSubject.id);
        }

        winners.push(m.winner);
    }

    saveDB(db);

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
