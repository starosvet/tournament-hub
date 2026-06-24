/*
 Tournament Hub — Bracket Controller (исправленный)
 Работает с nested-структурой: tournament.rounds[].matches[]
*/

(function () {

    /* ---------- helpers ---------- */

    function getTournamentById(id) {
        const db = DB.getDB();
        return (db.tournaments || []).find(t => t.id === id) || null;
    }

    function findMatchInTournament(tournament, matchId) {
        if (!tournament || !Array.isArray(tournament.rounds)) return null;
        for (const round of tournament.rounds) {
            const match = (round.matches || []).find(m => m.id === matchId);
            if (match) return { match, round };
        }
        return null;
    }

    function getActiveRound(tournament) {
        if (!tournament || !Array.isArray(tournament.rounds)) return null;
        return tournament.rounds[tournament.currentRound || 0] || null;
    }

    /* ---------- public API ---------- */

    function getMatch(matchId) {
        const db = DB.getDB();
        for (const t of (db.tournaments || [])) {
            const found = findMatchInTournament(t, matchId);
            if (found) return found.match;
        }
        return null;
    }

    function getTournament(matchId) {
        const db = DB.getDB();
        for (const t of (db.tournaments || [])) {
            const found = findMatchInTournament(t, matchId);
            if (found) return t;
        }
        return null;
    }

    function vote(matchId, player) {
        if (!Auth.canUserVote(matchId)) return false;

        const db = DB.getDB();
        let targetMatch = null;
        let targetTournament = null;

        // Ищем матч во всех турнирах
        for (const t of (db.tournaments || [])) {
            const found = findMatchInTournament(t, matchId);
            if (found) {
                targetMatch = found.match;
                targetTournament = t;
                break;
            }
        }

        if (!targetMatch || targetMatch.finished) return false;
        if (player !== 1 && player !== 2) return false;

        // Проверяем, что турнир активен
        if (targetTournament && targetTournament.status !== "active") return false;

        if (player === 1) targetMatch.votes1 = (targetMatch.votes1 || 0) + 1;
        if (player === 2) targetMatch.votes2 = (targetMatch.votes2 || 0) + 1;

        DB.saveDB(db);
        Auth.markVote(matchId);

        // Перерендерим сетку если функция доступна
        if (typeof RenderBracket !== "undefined" && RenderBracket.renderBracket) {
            RenderBracket.renderBracket();
        }

        return true;
    }

    function calculateWinner(match) {
        if (!match) return null;
        const v1 = match.votes1 || 0;
        const v2 = match.votes2 || 0;
        if (v1 > v2) return match.player1;
        if (v2 > v1) return match.player2;
        // Ничья — player1 проходит (или можно добавить random)
        return match.player1;
    }

    function finishMatch(matchId) {
        const db = DB.getDB();
        let targetMatch = null;

        for (const t of (db.tournaments || [])) {
            const found = findMatchInTournament(t, matchId);
            if (found) {
                targetMatch = found.match;
                break;
            }
        }

        if (!targetMatch || targetMatch.finished) return false;

        const winner = calculateWinner(targetMatch);
        if (!winner) return false;

        targetMatch.winner = winner;
        targetMatch.finished = true;
        targetMatch.status = "done";

        DB.saveDB(db);
        return winner;
    }

    function getTournamentByMatchId(matchId) {
        const db = DB.getDB();
        for (const t of (db.tournaments || [])) {
            const found = findMatchInTournament(t, matchId);
            if (found) return t;
        }
        return null;
    }

    /* ---------- legacy compatibility ---------- */

    // Для старого кода, который мог обращаться к Bracket.getMatches(round)
    function getMatches(roundIndex) {
        const db = DB.getDB();
        const allMatches = [];
        for (const t of (db.tournaments || [])) {
            if (t.rounds && t.rounds[roundIndex]) {
                allMatches.push(...(t.rounds[roundIndex].matches || []));
            }
        }
        return allMatches;
    }

    window.Bracket = {
        getMatches,
        getMatch,
        getTournament,
        getTournamentById,
        getTournamentByMatchId,
        vote,
        finishMatch,
        calculateWinner,
        findMatchInTournament,
        getActiveRound
    };

})();