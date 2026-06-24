/* Tournament Hub Core tournament engine */
(function () {
  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function roundName(totalSubjects) {
    if (totalSubjects <= 2) return "Финал";
    if (totalSubjects <= 4) return "1/2 финала";
    if (totalSubjects <= 8) return "1/4 финала";
    if (totalSubjects <= 16) return "1/8 финала";
    if (totalSubjects <= 32) return "1/16 финала";
    if (totalSubjects <= 64) return "1/32 финала";
    return "1/" + (totalSubjects / 2) + " финала";
  }

  function normalizePlayer(p) {
    if (!p) return null;
    if (typeof p === "string") {
      return { id: p, name: p, image: "", type: "character" };
    }
    return {
      id: p.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      name: p.name || p.title || "Без имени",
      image: p.image || p.url || "",
      type: p.type || "character",
      description: p.description || ""
    };
  }

  function createMatches(players) {
    if (!players || players.length < 2) return [];
    const shuffled = shuffle(players.map(normalizePlayer));
    const matches = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      const player1 = shuffled[i] || null;
      const player2 = shuffled[i + 1] || null;
      matches.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + i,
        player1,
        player2,
        votes1: 0,
        votes2: 0,
        winner: null,
        finished: false,
        status: "pending"
      });
    }

    return matches;
  }

  function getWinner(match) {
    if (!match) return null;
    if ((match.votes1 || 0) > (match.votes2 || 0)) return match.player1;
    if ((match.votes2 || 0) > (match.votes1 || 0)) return match.player2;
    return null;
  }

  function createBracket(subjects) {
    const players = (subjects || []).map(normalizePlayer).filter(Boolean);
    if (players.length < 2) {
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        name: "Новый турнир",
        description: "",
        subjectType: players[0]?.type || "character",
        createdAt: new Date().toISOString(),
        status: "draft",
        currentRound: 0,
        rounds: [],
        winner: null,
        completedAt: null,
        config: { voteDurationHours: 24, minVotes: 1, allowGuest: true },
        _playerMap: {}
      };
    }

    const initialMatches = createMatches(players);
    const rounds = [{
      id: 0,
      name: roundName(players.length),
      matches: initialMatches,
      isActive: true,
      startedAt: new Date().toISOString(),
      endedAt: null
    }];

    let remaining = initialMatches.length;
    while (remaining > 1) {
      remaining = Math.ceil(remaining / 2);
      rounds.push({
        id: rounds.length,
        name: roundName(remaining * 2),
        matches: [],
        isActive: false,
        startedAt: null,
        endedAt: null
      });
    }

    const tournament = {
      id: crypto.randomUUID ? crypto.randomUUID() : ("t_" + Date.now()),
      name: "",
      description: "",
      subjectType: players[0]?.type || "character",
      createdAt: new Date().toISOString(),
      status: "draft",
      currentRound: 0,
      rounds,
      winner: null,
      completedAt: null,
      config: { voteDurationHours: 24, minVotes: 1, allowGuest: true },
      _playerMap: {}
    };

    rounds[0].matches.forEach(m => {
      if (m.player1) tournament._playerMap[m.player1.id] = m.player1.id;
      if (m.player2) tournament._playerMap[m.player2.id] = m.player2.id;
    });

    return tournament;
  }

  function getActiveTournament(db) {
    if (!db) db = DB.getDB();
    if (db.activeTournamentId) {
      const byId = (db.tournaments || []).find(t => t.id === db.activeTournamentId);
      if (byId) return byId;
    }
    return (db.tournaments || []).find(t => t.status === "active") || null;
  }

  function finalizeRound(tournament, subjects) {
    if (!tournament) return { ok: false, err: "Нет турнира" };

    const currentRound = tournament.rounds?.[tournament.currentRound];
    if (!currentRound) return { ok: false, err: "Нет текущего раунда" };

    const winners = [];
    currentRound.matches.forEach(match => {
      if (match.finished) {
        winners.push(match.winner || getWinner(match));
        return;
      }
      const winner = getWinner(match);
      if (winner) {
        match.winner = winner;
        match.finished = true;
        match.status = "done";
        winners.push(winner);
      }
    });

    currentRound.isActive = false;
    currentRound.endedAt = new Date().toISOString();

    if (winners.length < 2) {
      tournament.status = "finished";
      tournament.completedAt = new Date().toISOString();
      tournament.winner = winners[0] || null;
      return { ok: true, tournament, finished: true };
    }

    const nextMatches = createMatches(winners);
    const nextRoundIndex = tournament.currentRound + 1;
    tournament.rounds[nextRoundIndex] = tournament.rounds[nextRoundIndex] || {
      id: nextRoundIndex,
      name: roundName(winners.length),
      matches: [],
      isActive: false,
      startedAt: null,
      endedAt: null
    };
    tournament.rounds[nextRoundIndex].matches = nextMatches;
    tournament.rounds[nextRoundIndex].isActive = true;
    tournament.rounds[nextRoundIndex].startedAt = new Date().toISOString();
    tournament.currentRound = nextRoundIndex;
    tournament.status = "active";
    tournament.winner = null;
    tournament.completedAt = null;

    return { ok: true, tournament, finished: false };
  }

  function resetVotes(tournamentId) {
    const db = DB.getDB();
    const t = (db.tournaments || []).find(x => x.id === tournamentId);
    if (t && Array.isArray(t.rounds)) {
      t.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
          match.votes1 = 0;
          match.votes2 = 0;
          match.winner = null;
          match.finished = false;
          match.status = "pending";
        });
      });
    }
    DB.saveDB(db);
    return true;
  }

  function saveVoteSettings() {
    const db = DB.getDB();
    const t = getActiveTournament(db);
    if (!t) {
      toast("Нет активного турнира");
      return false;
    }

    t.config = t.config || {};
    const dur = document.getElementById("voteDuration");
    const minVotes = document.getElementById("minVotes");
    const allowGuest = document.getElementById("allowGuest");

    if (dur) t.config.voteDurationHours = parseInt(dur.value, 10) || 24;
    if (minVotes) t.config.minVotes = parseInt(minVotes.value, 10) || 1;
    if (allowGuest) t.config.allowGuest = !!allowGuest.checked;

    DB.saveDB(db);
    toast("Настройки голосования сохранены");
    return true;
  }

  window.TournamentEngine = { shuffle, createMatches, getWinner, roundName };
  window.createBracket = createBracket;
  window.getActiveTournament = getActiveTournament;
  window.finalizeRound = finalizeRound;
  window.resetVotes = resetVotes;
  window.saveVoteSettings = saveVoteSettings;
})();
