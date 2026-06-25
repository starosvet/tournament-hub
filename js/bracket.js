/* ============================================================
   Tournament Hub — Bracket Controller (FIXED v5 — safe sub-mutations)
   ============================================================ */
(function () {
  'use strict';

  function getTournamentById(id) {
    const db = window.DB.getDB();
    return (db.tournaments || []).find(t => t.id === id) || null;
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
    return tournament.rounds[tournament.currentRound || 0] || null;
  }

  // --- ГОЛОСОВАНИЕ ЗА УЧАСТНИКА В МАТЧЕ ---
  async function vote(matchId, playerNumber) {
    const db = window.DB.getDB();
    let targetMatch = null;
    let targetTournament = null;

    for (const t of (db.tournaments || [])) {
      const found = findMatchInTournament(t, matchId);
      if (found) {
        targetMatch = found.match;
        targetTournament = t;
        break;
      }
    }

    if (!targetMatch || !targetTournament) {
      return { success: false, error: "Матч не найден в структуре активных сеток." };
    }

    if (targetMatch.finished) {
      return { success: false, error: "Голосование за этот поединок уже закрыто." };
    }

    // Проверка дублирования голосов через локальные маркеры безопасности
    const voteKey = `voted_match_${matchId}`;
    if (localStorage.getItem(voteKey)) {
      return { success: false, error: "Вы уже оставили свой голос в этом матче." };
    }

    // Инкрементируем сторону голосования
    if (playerNumber === 1) {
      targetMatch.votes1 = (targetMatch.votes1 || 0) + 1;
    } else if (playerNumber === 2) {
      targetMatch.votes2 = (targetMatch.votes2 || 0) + 1;
    } else {
      return { success: false, error: "Неверный идентификатор стороны." };
    }

    localStorage.setItem(voteKey, "true");

    // Интеграция с сервером Supabase (если онлайн-режим доступен)
    if (window.TH && typeof window.TH.castVote === 'function') {
      try {
        await window.TH.castVote(matchId, playerNumber);
      } catch (e) {
        console.warn("Сервер Supabase отклонил трансляцию голоса, пишем в локальный кэш:", e);
      }
    }

    window.DB.saveDB(db);
    return { success: true, match: targetMatch };
  }

  // --- РУЧНОЕ ИЛИ АВТОМАТИЧЕСКОЕ ЗАКРЫТИЕ МАТЧА АДМИНИСТРАТОРОМ ---
  function finishMatch(matchId) {
    const db = window.DB.getDB();
    let foundData = null;

    for (const t of (db.tournaments || [])) {
      const found = findMatchInTournament(t, matchId);
      if (found) {
        foundData = { ...found, tournament: t };
        break;
      }
    }

    if (!foundData) return { success: false, error: "Матч не найден." };

    const { match, tournament } = foundData;
    if (match.finished) return { success: true, match };

    // Вычисляем победителя на основе накопленных кликов
    if ((match.votes1 || 0) >= (match.votes2 || 0)) {
      match.winner_id = match.player1 ? match.player1.id : null;
    } else {
      match.winner_id = match.player2 ? match.player2.id : null;
    }

    match.finished = true;

    // Запускаем пересчёт Elo-дельты для участников поединка
    if (match.player1 && match.player2) {
      const rating1 = match.player1.elo || 1000;
      const rating2 = match.player2.elo || 1000;
      
      const outcome1 = match.winner_id === match.player1.id ? 1 : 0;
      const outcome2 = match.winner_id === match.player2.id ? 1 : 0;

      match.player1.elo = rating1 + window.TournamentEngine.calculateEloChange(rating1, rating2, outcome1);
      match.player2.elo = rating2 + window.TournamentEngine.calculateEloChange(rating2, rating1, outcome2);
    }

    // Проверяем, закрылся ли весь раунд целиком для автоматического продвижения дальше
    const currentRound = tournament.rounds[tournament.currentRound || 0];
    const allMatchesFinished = currentRound.matches.every(m => m.finished);

    if (allMatchesFinished) {
      window.Tournament.advanceRound(tournament.id);
    } else {
      window.TournamentEngine.propagateWinners(tournament.rounds);
      window.DB.saveDB(db);
    }

    return { success: true, match };
  }

  window.Bracket = {
    getTournamentById,
    findMatchInTournament,
    getActiveRound,
    vote,
    finishMatch
  };
})();
