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
      return { success: false, error: "Минимум 2 участника" };
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : ("t_" + Date.now());
    const tournament = {
      id,
      title: title.trim(),
      description: (description || "").trim(),
      players: players.map(p => typeof p === "string" ? { id: p, name: p, image: "", type: "character" } : p),
      status: STATUS.DRAFT,
      createdAt: Date.now(),
      rounds: [],
      currentRound: 0,
      winner: null,
      completedAt: null,
      config: { voteDurationHours: 24, minVotes: 1, allowGuest: true }
    };

    DB.updateDB(db => {
      if (!Array.isArray(db.tournaments)) db.tournaments = [];
      db.tournaments.push(tournament);
      db.activeTournamentId = id;
    });

    return { success: true, tournament };
  }

  function getTournament(id) {
    const db = DB.getDB();
    return (db.tournaments || []).find(t => t.id === id) || null;
  }

  function listTournaments() {
    const db = DB.getDB();
    return (db.tournaments || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function deleteTournament(id) {
    DB.updateDB(db => {
      db.tournaments = (db.tournaments || []).filter(t => t.id !== id);
      if (db.activeTournamentId === id) db.activeTournamentId = null;
    });
  }

  function startTournament(id) {
    const db = DB.getDB();
    const t = (db.tournaments || []).find(x => x.id === id);
    if (!t) return { success: false, error: "Турнир не найден" };
    if (t.status !== STATUS.DRAFT) return { success: false, error: "Турнир уже запущен" };

    const engine = new TournamentEngine();
    const bracket = engine.createBracket(t.players);
    
    t.rounds = bracket.rounds;
    t.currentRound = 0;
    t.status = STATUS.ACTIVE;
    t._playerMap = bracket._playerMap;

    DB.updateDB(db => {
      const idx = (db.tournaments || []).findIndex(x => x.id === id);
      if (idx >= 0) db.tournaments[idx] = t;
      db.activeTournamentId = id;
    });

    return { success: true, tournament: t };
  }

  function advanceRound(id) {
    const db = DB.getDB();
    const t = (db.tournaments || []).find(x => x.id === id);
    if (!t) return { success: false, error: "Турнир не найден" };
    if (t.status !== STATUS.ACTIVE) return { success: false, error: "Турнир не активен" };

    const engine = new TournamentEngine();
    const result = engine.finalizeRound(t);
    
    if (!result.ok) return { success: false, error: result.err };

    DB.updateDB(db => {
      const idx = (db.tournaments || []).findIndex(x => x.id === id);
      if (idx >= 0) db.tournaments[idx] = result.tournament;
    });

    return { success: true, tournament: result.tournament, finished: result.finished };
  }

  window.Tournament = {
    STATUS,
    createTournament,
    getTournament,
    listTournaments,
    deleteTournament,
    startTournament,
    advanceRound
  };
})();
