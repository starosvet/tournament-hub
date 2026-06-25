/* ============================================================
   Tournament Hub Core tournament engine (FIXED v3 — Shikimori-style mechanics)
   ============================================================ */
(function () {

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function roundTitle(totalSubjects) {
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
      return { id: generateId(), name: p, image: "", type: "character", elo: 1000, wins: 0, losses: 0 };
    }
    return {
      id: p.id || generateId(),
      name: p.name || p.title || "Без имени",
      image: p.image || p.url || "",
      type: p.type || "character",
      description: p.description || "",
      elo: p.elo || 1000,
      wins: p.wins || 0,
      losses: p.losses || 0
    };
  }

  /* ==========================================================
     SHIKIMORI-STYLE: Система бай для нечётного числа участников
     ========================================================== */
  function addByes(players) {
    const count = players.length;
    // Находим ближайшую степень двойки СВЕРХУ
    let target = 2;
    while (target < count) target *= 2;
    
    const byesNeeded = target - count;
    const result = [...players];
    
    for (let i = 0; i < byesNeeded; i++) {
      result.push({
        id: generateId(),
        name: "BYE",
        image: "",
        type: "bye",
        description: "Автоматический проход",
        isBye: true,
        elo: 0
      });
    }
    
    return result;
  }

  /* ==========================================================
     SHIKIMORI-STYLE: ELO рейтинг
     ========================================================== */
  const K_FACTOR = 32;

  function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  function calculateEloChange(winner, loser) {
    const winnerRating = winner.elo || 1000;
    const loserRating = loser.elo || 1000;
    const expectedWinner = expectedScore(winnerRating, loserRating);
    const expectedLoser = expectedScore(loserRating, winnerRating);

    return {
      winnerNew: Math.round(winnerRating + K_FACTOR * (1 - expectedWinner)),
      loserNew: Math.round(loserRating + K_FACTOR * (0 - expectedLoser))
    };
  }

  /* ==========================================================
     SHIKIMORI-STYLE: Создание матчей с учётом ELO (seeding)
     ========================================================== */
  function createMatches(players) {
    if (!players || players.length < 2) return [];
    
    // Добавляем бай если нужно
    const withByes = addByes(players.map(normalizePlayer).filter(Boolean));
    const shuffled = shuffle(withByes);
    const matches = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      const player1 = shuffled[i] || null;
      const player2 = shuffled[i + 1] || null;
      
      // Если один из участников — BYE, другой автоматически побеждает
      const isByeMatch = player1?.isBye || player2?.isBye;
      
      matches.push({
        id: generateId(),
        player1,
        player2,
        votes1: 0,
        votes2: 0,
        winner: isByeMatch ? (player1?.isBye ? player2 : player1) : null,
        finished: isByeMatch,
        status: isByeMatch ? "done" : "pending",
        isByeMatch: isByeMatch,
        startedAt: new Date().toISOString()
      });
    }

    return matches;
  }

  function getWinner(match) {
    if (!match) return null;
    if (match.isByeMatch) return match.winner;
    if ((match.votes1 || 0) > (match.votes2 || 0)) return match.player1;
    if ((match.votes2 || 0) > (match.votes1 || 0)) return match.player2;
    return null; // Ничья — требует тай-брейка
  }

  /* ==========================================================
     SHIKIMORI-STYLE: Тай-брейк при ничьей
     ========================================================== */
  function resolveTieBreaker(match) {
    if (!match) return null;
    const v1 = match.votes1 || 0;
    const v2 = match.votes2 || 0;
    
    if (v1 === v2) {
      // Тай-брейк по ELO (выше рейтинг = победа)
      const elo1 = match.player1?.elo || 1000;
      const elo2 = match.player2?.elo || 1000;
      
      if (elo1 !== elo2) {
        return elo1 > elo2 ? match.player1 : match.player2;
      }
      
      // Если ELO равны — случайный выбор
      return Math.random() > 0.5 ? match.player1 : match.player2;
    }
    
    return getWinner(match);
  }

  function createBracket(subjects) {
    const players = (subjects || []).map(normalizePlayer).filter(Boolean);
    if (players.length < 2) {
      return {
        id: generateId(),
        title: "Новый турнир",
        description: "",
        subjectType: players[0]?.type || "character",
        createdAt: new Date().toISOString(),
        status: "draft",
        currentRound: 0,
        rounds: [],
        winner: null,
        completedAt: null,
        config: { 
          voteDurationHours: 24, 
          minVotes: 1, 
          allowGuest: true,
          useElo: true,
          tieBreaker: 'elo' // 'elo', 'random', 'admin'
        },
        _playerMap: {}
      };
    }

    const initialMatches = createMatches(players);
    const rounds = [{
      id: 0,
      name: roundTitle(players.length),
      matches: initialMatches,
      isActive: true,
      startedAt: new Date().toISOString(),
      endedAt: null
    }];

    let remaining = initialMatches.filter(m => !m.isByeMatch).length;
    while (remaining > 1) {
      remaining = Math.ceil(remaining / 2);
      rounds.push({
        id: rounds.length,
        name: roundTitle(remaining * 2),
        matches: [],
        isActive: false,
        startedAt: null,
        endedAt: null
      });
    }

    const tournament = {
      id: generateId(),
      title: "",
      description: "",
      subjectType: players[0]?.type || "character",
      createdAt: new Date().toISOString(),
      status: "draft",
      currentRound: 0,
      rounds,
      winner: null,
      completedAt: null,
      config: { 
        voteDurationHours: 24, 
        minVotes: 1, 
        allowGuest: true,
        useElo: true,
        tieBreaker: 'elo'
      },
      _playerMap: {}
    };

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

  /* ==========================================================
     SHIKIMORI-STYLE: Финализация раунда с ELO-обновлением
     ========================================================== */
  function finalizeRound(tournament, force) {
    if (!tournament) return { ok: false, err: "Нет турнира" };

    const currentRound = tournament.rounds?.[tournament.currentRound];
    if (!currentRound) return { ok: false, err: "Нет текущего раунда" };

    const unfinished = currentRound.matches.filter(m => !m.finished && !m.isByeMatch && !getWinner(m));
    if (unfinished.length > 0 && !force) {
      return {
        ok: false,
        err: "Не все матчи завершены (" + unfinished.length + " без голосов). Нажмите 'Завершить принудительно' или дождитесь голосов."
      };
    }

    const winners = [];
    currentRound.matches.forEach(match => {
      if (match.finished) {
        if (!match.isByeMatch && match.winner) {
          // Обновляем ELO
          const loser = match.winner.id === match.player1?.id ? match.player2 : match.player1;
          if (tournament.config.useElo && match.winner.elo !== undefined && loser?.elo !== undefined) {
            const changes = calculateEloChange(match.winner, loser);
            match.winner.elo = changes.winnerNew;
            match.winner.wins = (match.winner.wins || 0) + 1;
            if (loser) {
              loser.elo = changes.loserNew;
              loser.losses = (loser.losses || 0) + 1;
            }
          }
        }
        winners.push(match.winner);
        return;
      }

      const winner = resolveTieBreaker(match);
      if (winner) {
        match.winner = winner;
        match.finished = true;
        match.status = "done";
        
        // Обновляем ELO
        if (!match.isByeMatch && tournament.config.useElo) {
          const loser = winner.id === match.player1?.id ? match.player2 : match.player1;
          if (winner.elo !== undefined && loser?.elo !== undefined) {
            const changes = calculateEloChange(winner, loser);
            winner.elo = changes.winnerNew;
            winner.wins = (winner.wins || 0) + 1;
            loser.elo = changes.loserNew;
            loser.losses = (loser.losses || 0) + 1;
          }
        }
        
        winners.push(winner);
      } else if (force) {
        match.winner = match.player1;
        match.finished = true;
        match.status = "done";
        winners.push(match.player1);
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
      name: roundTitle(winners.length),
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
    DB.updateDB(db => {
      const t = (db.tournaments || []).find(x => x.id === tournamentId);
      if (t && Array.isArray(t.rounds)) {
        t.rounds.forEach(round => {
          (round.matches || []).forEach(match => {
            if (!match.isByeMatch) {
              match.votes1 = 0;
              match.votes2 = 0;
              match.winner = null;
              match.finished = false;
              match.status = "pending";
            }
          });
        });
      }
    });
    return true;
  }

  /* ==========================================================
     SHIKIMORI-STYLE: Настройки турнира
     ========================================================== */
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
    const useElo = document.getElementById("useElo");
    const tieBreaker = document.getElementById("tieBreaker");

    if (dur) t.config.voteDurationHours = parseInt(dur.value, 10) || 24;
    if (minVotes) t.config.minVotes = parseInt(minVotes.value, 10) || 1;
    if (allowGuest) t.config.allowGuest = !!allowGuest.checked;
    if (useElo) t.config.useElo = !!useElo.checked;
    if (tieBreaker) t.config.tieBreaker = tieBreaker.value || 'elo';

    DB.saveDB(db);
    toast("Настройки турнира сохранены");
    return true;
  }

  window.TournamentEngine = { shuffle, createMatches, getWinner, roundTitle, calculateEloChange, expectedScore };
  window.createBracket = createBracket;
  window.getActiveTournament = getActiveTournament;
  window.finalizeRound = finalizeRound;
  window.resetVotes = resetVotes;
  window.saveVoteSettings = saveVoteSettings;
})();
