/* Tournament Hub Tournament manager */
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
    db.tournaments.push(tournament);
    DB.saveDB(db);
    return { success: true, tournament };
  }

  function getTournament(id) {
    const db = DB.getDB();
    return (db.tournaments || []).find(t => t.id === id) || null;
  }

  function startTournament(id) {
    const tournament = getTournament(id);
    if (!tournament || tournament.status !== STATUS.DRAFT) return false;

    const matches = TournamentEngine.createMatches(tournament.players);
    tournament.status = STATUS.ACTIVE;
    tournament.rounds = [{ id: 0, name: TournamentEngine.roundName(tournament.players.length), matches }];
    tournament.currentRound = 0;

    const db = DB.getDB();
    const idx = db.tournaments.findIndex(x => x.id === id);
    if (idx !== -1) db.tournaments[idx] = tournament;
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
    return (db.tournaments || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
