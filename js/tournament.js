/*
 Tournament Hub
 Tournament manager
*/

(function () {

    const STATUS = {
        DRAFT: "draft",
        ACTIVE: "active",
        FINISHED: "finished",
        CANCELLED: "cancelled"
    };

    function createTournament(title, description, players) {
        if (!title || !title.trim()) {
            return { success: false, error: "Название обязательно" };
        }

        if (!Array.isArray(players) || players.length < 2) {
            return { success: false, error: "Нужно минимум 2 участника" };
        }

        const tournament = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            title: title.trim(),
            description: description ? description.trim() : "",
            players,
            status: STATUS.DRAFT,
            createdAt: Date.now(),
            rounds: 0
        };

        const db = DB.getDB();
        if (!Array.isArray(db.tournaments)) {
            db.tournaments = [];
        }
        db.tournaments.push(tournament);
        DB.saveDB(db);

        return { success: true, tournament };
    }

    function getTournament(id) {
        const db = DB.getDB();
        return db.tournaments.find(t => t.id === id) || null;
    }

    function startTournament(id) {
        const tournament = getTournament(id);
        if (!tournament) return false;
        if (tournament.status !== STATUS.DRAFT) return false;

        const matches = TournamentEngine.createMatches(tournament.players);

        const db = DB.getDB();
        const t = db.tournaments.find(x => x.id === id);
        t.status = STATUS.ACTIVE;
        t.rounds = 1;

        matches.forEach(m => {
            m.round = 1;
            m.status = "pending";
            m.tournamentId = id;
            db.matches.push(m);
        });

        DB.saveDB(db);
        return true;
    }

    function finishTournament(id) {
        const db = DB.getDB();
        const t = db.tournaments.find(x => x.id === id);
        if (!t) return false;
        t.status = STATUS.FINISHED;
        DB.saveDB(db);
        return true;
    }

    function cancelTournament(id) {
        const db = DB.getDB();
        const t = db.tournaments.find(x => x.id === id);
        if (!t) return false;
        t.status = STATUS.CANCELLED;
        DB.saveDB(db);
        return true;
    }

    function listTournaments() {
        const db = DB.getDB();
        return (db.tournaments || []).sort((a, b) => b.createdAt - a.createdAt);
    }

    window.Tournament = {
        STATUS,
        createTournament,
        getTournament,
        startTournament,
        finishTournament,
        cancelTournament,
        listTournaments
    };

})();
