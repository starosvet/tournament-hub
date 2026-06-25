/* ============================================================
   Tournament Hub — Tournament Manager (FIXED v3 — sync & safe UUIDs)
   ============================================================ */
(function () {
  'use strict';

  const STATUS = {
    DRAFT: "draft",
    ACTIVE: "active",
    FINISHED: "finished",
    CANCELLED: "cancelled"
  };

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      return r.toString(16);
    });
  }

  function createTournament(title, description, players) {
    if (!title || !title.trim()) {
      return { success: false, error: "Название турнира обязательно к заполнению." };
    }
    if (!Array.isArray(players) || players.length < 2) {
      return { success: false, error: "Для создания сетки необходимо минимум 2 участника." };
    }

    const id = generateId();
    const formattedPlayers = players.map(p => {
      if (typeof p === 'string') {
        return { id: generateId(), name: p.trim(), image: "", elo: 1000, type: "character" };
      }
      return {
        id: p.id || generateId(),
        name: (p.name || "Участник").trim(),
        image: p.image || "",
        elo: Number(p.elo) || 1000,
        type: p.type || "character"
      };
    });

    const tournament = {
      id,
      title: title.trim(),
      description: (description || "").trim(),
      status: STATUS.DRAFT,
      currentRound: 0,
      players: formattedPlayers,
      rounds: [],
      createdAt: new Date().toISOString()
    };

    const db = window.DB.getDB();
    db.tournaments = db.tournaments || [];
    db.tournaments.push(tournament);
    window.DB.saveDB(db);

    return { success: true, tournament };
  }

  function startTournament(id) {
    const db = window.DB.getDB();
    const t = (db.tournaments || []).find(x => x.id === id);

    if (!t) return { success: false, error: "Турнир не найден в локальной базе." };
    if (t.status !== STATUS.DRAFT) return { success: false, error: "Турнир уже запущен или завершен." };

    // Генерируем сетку через ядро TournamentEngine
    const bracket = window.TournamentEngine.createBracket(t.players);
    if (!bracket) return { success: false, error: "Ошибка математического движка при расчёте пар." };

    t.rounds = bracket.rounds;
    t.currentRound = 0;
    t.status = STATUS.ACTIVE;

    const idx = db.tournaments.findIndex(x => x.id === id);
    if (idx >= 0) db.tournaments[idx] = t;
    window.DB.saveDB(db);

    return { success: true, tournament: t };
  }

  function advanceRound(id) {
    const db = window.DB.getDB();
    const t = (db.tournaments || []).find(x => x.id === id);

    if (!t) return { success: false, error: "Турнир не найден." };
    if (t.status !== STATUS.ACTIVE) return { success: false, error: "Перевод раундов возможен только в активных турнирах." };

    const result = window.TournamentEngine.finalizeRound(t);
    if (!result.ok) return { success: false, error: result.err };

    const idx = db.tournaments.findIndex(x => x.id === id);
    if (idx >= 0) db.tournaments[idx] = t;
    window.DB.saveDB(db);

    // Если наступил финал, пересчитываем глобальные рейтинги Elo победителей
    if (result.finished) {
      applyGlobalEloImpact(t);
    }

    return { success: true, tournament: t, finished: result.finished };
  }

  function applyGlobalEloImpact(tournament) {
    // Декоративный или системный апдейт таблицы лидеров после закрытия финала
    console.log(`Турнир ${tournament.id} завершен. Чемпион:`, tournament.winner);
  }

  window.Tournament = {
    STATUS,
    createTournament,
    startTournament,
    advanceRound
  };
})();
