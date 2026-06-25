/*
 Tournament Hub — Bracket Controller (FIXED v4 — async vote, proper DB updates, safe fallback)
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

    // FIX: async vote с правильной проверкой canUserVote и markVote
    async function vote(matchId, player) {
        const canVote = await Auth.canUserVote(matchId);
        if (!canVote) {
            toast("Вы уже голосовали в этом матче");
            return false;
        }

        // Находим tournament_id для markVote
        let targetTournamentId = null;

        DB.updateDB(db => {
            for (const t of (db.tournaments || [])) {
                const found = findMatchInTournament(t, matchId);
                if (found) {
                    const match = found.match;
                    if (match.finished) return;
                    if (player !== 1 && player !== 2) return;
                    if (t.status !== "active") return;

                    if (player === 1) match.votes1 = (match.votes1 || 0) + 1;
                    if (player === 2) match.votes2 = (match.votes2 || 0) + 1;

                    targetTournamentId = t.id;
                    break;
                }
            }
        });

        if (!targetTournamentId) {
            toast("Ошибка: турнир не найден");
            return false;
        }

        // FIX: передаём tournamentId в markVote
        await Auth.markVote(matchId, targetTournamentId, player);

        if (typeof RenderBracket !== "undefined" && RenderBracket.renderBracket) {
            const urlParams = new URLSearchParams(window.location.search);
            const currentTid = urlParams.get("id");
            if (currentTid === targetTournamentId) {
                RenderBracket.renderBracket();
            }
        }

        return true;
    }

    function calculateWinner(match) {
        if (!match) return null;
        const v1 = match.votes1 || 0;
        const v2 = match.votes2 || 0;
        if (v1 > v2) return match.player1;
        if (v2 > v1) return match.player2;
        return match.player1;
    }

    function finishMatch(matchId) {
        let result = null;
        let tournamentId = null;
        let isFinal = false;

        DB.updateDB(db => {
            for (const t of (db.tournaments || [])) {
                const found = findMatchInTournament(t, matchId);
                if (found) {
                    const match = found.match;
                    if (match.finished) return;

                    const winner = calculateWinner(match);
                    if (!winner) return;

                    match.winner = winner;
                    match.finished = true;
                    match.status = "done";
                    result = winner;
                    tournamentId = t.id;

                    const currentRound = t.rounds[t.currentRound || 0];
                    if (currentRound) {
                        const allFinished = (currentRound.matches || []).every(m => m.finished);
                        const isLastRound = t.currentRound >= (t.rounds.length - 1);
                        isFinal = allFinished && isLastRound;
                    }
                    break;
                }
            }
        });

        if (isFinal && tournamentId) {
            Tournament.advanceRound(tournamentId);
        }

        return result;
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
