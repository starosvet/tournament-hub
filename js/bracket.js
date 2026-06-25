/* ============================================================
   Tournament Hub — Bracket Controller (FIXED v7 — Supabase First)
   ============================================================ */
(function () {
  'use strict';

  function getTournamentById(id) {
    if (window.DB) {
      const db = window.DB.getDB();
      return (db.tournaments || []).find(t => t.id === id) || null;
    }
    return null;
  }

  function findMatchInTournament(tournament, matchId) {
    if (!tournament || !Array.isArray(tournament.rounds)) return null;
    for (let rIdx = 0; rIdx < tournament.rounds.length; rIdx++) {
      const round = tournament.rounds[rIdx];
      const match = (round.matches || []).find(m => m.id === matchId);
      if (match) return { match, round, roundIndex: rIdx };
    }
    return null;
  }

  function getActiveRound(tournament) {
    if (!tournament || !Array.isArray(tournament.rounds)) return null;
    return tournament.rounds[tournament.currentRound || tournament.current_round || 0] || null;
  }

  async function vote(matchId, playerNumber) {
    // Try Supabase first
    if (window.TH && window.TH.castVote) {
      try {
        return await window.TH.castVote(matchId, playerNumber);
      } catch (e) {
        console.warn('Supabase vote failed, trying local:', e.message);
      }
    }

    // Local fallback
    const db = window.DB ? window.DB.getDB() : { tournaments: [] };
    let targetMatch = null, targetTournament = null;
    for (const t of (db.tournaments || [])) {
      const found = findMatchInTournament(t, matchId);
      if (found) { targetMatch = found.match; targetTournament = t; break; }
    }
    if (!targetMatch || !targetTournament) return { success: false, error: "Матч не найден." };
    if (targetMatch.finished) return { success: false, error: "Голосование закрыто." };

    const voteKey = `voted_match_${matchId}`;
    if (localStorage.getItem(voteKey)) return { success: false, error: "Вы уже голосовали." };

    if (playerNumber === 1) targetMatch.votes1 = (targetMatch.votes1 || 0) + 1;
    else if (playerNumber === 2) targetMatch.votes2 = (targetMatch.votes2 || 0) + 1;
    else return { success: false, error: "Неверный выбор." };

    localStorage.setItem(voteKey, "true");
    if (window.DB) window.DB.saveDB(db);
    return { success: true, match: targetMatch };
  }

  function finishMatch(matchId) {
    // This is now handled by admin.js / server
    console.warn('finishMatch is deprecated — use admin panel to advance rounds');
    return { success: false, error: "Используйте панель администратора для завершения матчей" };
  }

  window.Bracket = { getTournamentById, findMatchInTournament, getActiveRound, vote, finishMatch };
})();
