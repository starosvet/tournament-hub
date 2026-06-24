/*
 Tournament Hub
 Bracket controller
*/

(function () {

    function getMatches(round) {
        const db = DB.getDB();
        return (db.matches || []).filter(m => m.round === round);
    }

    function getMatch(id) {
        const db = DB.getDB();
        return db.matches.find(m => m.id === id) || null;
    }

    function vote(matchId, player) {
        if (!Auth.canUserVote(matchId)) return false;

        const db = DB.getDB();
        const match = db.matches.find(m => m.id === matchId);
        if (!match || match.finished) return false;
        if (player !== 1 && player !== 2) return false;

        if (player === 1) match.votes1 = (match.votes1 || 0) + 1;
        if (player === 2) match.votes2 = (match.votes2 || 0) + 1;

        DB.saveDB(db);
        Auth.markVote(matchId);
        return true;
    }

    function calculateWinner(match) {
        if (!match) return null;
        if (match.votes1 > match.votes2) return match.player1;
        if (match.votes2 > match.votes1) return match.player2;
        return null;
    }

    function finishMatch(matchId) {
        const db = DB.getDB();
        const match = db.matches.find(m => m.id === matchId);
        if (!match || match.finished) return false;

        const winner = calculateWinner(match);
        if (!winner) return false;

        match.winner = winner;
        match.finished = true;
        match.status = "done";

        DB.saveDB(db);
        return winner;
    }

    function finalizeRound(round) {
        const db = DB.getDB();
        const matches = db.matches.filter(m => m.round === round);
        if (!matches.length) return false;

        const winners = [];
        matches.forEach(match => {
            if (match.winner && !winners.includes(match.winner)) {
                winners.push(match.winner);
            }
        });

        if (winners.length < 2) {
            // Турнир окончен
            const t = db.tournaments.find(x => x.id === matches[0].tournamentId);
            if (t) t.status = "finished";
            DB.saveDB(db);
            return "finished";
        }

        createNextRound(winners, round + 1);
        return true;
    }

    function createNextRound(players, round) {
        if (!players || players.length < 2) return false;

        const db = DB.getDB();
        const already = db.matches.some(m => m.round === round);
        if (already) return false;

        const matches = TournamentEngine.createMatches(players);
        const tournamentId = db.matches.find(m => m.round === round - 1)?.tournamentId;

        matches.forEach(match => {
            match.round = round;
            match.status = "pending";
            if (tournamentId) match.tournamentId = tournamentId;
            db.matches.push(match);
        });

        const t = db.tournaments.find(x => x.id === tournamentId);
        if (t) t.rounds = round;

        DB.saveDB(db);
        return true;
    }

    function autoFinalizeRound(round) {
        const matches = getMatches(round);
        matches.forEach(match => {
            if (!match.finished) finishMatch(match.id);
        });
        return finalizeRound(round);
    }

    window.Bracket = {
        getMatches,
        getMatch,
        vote,
        finishMatch,
        finalizeRound,
        autoFinalizeRound,
        createNextRound
    };

})();
