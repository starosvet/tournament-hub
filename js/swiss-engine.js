/* ============================================================
   Tournament Hub — Swiss Engine (Unified v1)
   Единый модуль швейцарской системы. Используется всеми файлами.
   ============================================================ */
(function () {
  'use strict';

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ========== ШВЕЙЦАРСКАЯ СИСТЕМА: Генерация пар ==========
  function generateSwissPairs(players, previousMatches) {
    // Сортировка: очки DESC → Buchholz DESC → победы DESC
    const sorted = [...players].sort((a, b) => {
      const ptsA = (a.score?.points ?? a.score_points ?? 0);
      const ptsB = (b.score?.points ?? b.score_points ?? 0);
      if (ptsB !== ptsA) return ptsB - ptsA;
      const buchA = (a.score?.buchholz ?? a.score_buchholz ?? 0);
      const buchB = (b.score?.buchholz ?? b.score_buchholz ?? 0);
      if (buchB !== buchA) return buchB - buchA;
      const winsA = (a.score?.wins ?? a.score_wins ?? 0);
      const winsB = (b.score?.wins ?? b.score_wins ?? 0);
      return winsB - winsA;
    });

    // История встреч
    const playedWith = {};
    (previousMatches || []).forEach(m => {
      if (m.player1_id && m.player2_id) {
        playedWith[m.player1_id] = playedWith[m.player1_id] || new Set();
        playedWith[m.player2_id] = playedWith[m.player2_id] || new Set();
        playedWith[m.player1_id].add(m.player2_id);
        playedWith[m.player2_id].add(m.player1_id);
      }
    });

    const pairs = [];
    const used = new Set();

    for (const p1 of sorted) {
      if (used.has(p1.id)) continue;
      let bestOpponent = null;
      let bestScore = -Infinity;

      for (const p2 of sorted) {
        if (p1.id === p2.id || used.has(p2.id)) continue;
        const alreadyPlayed = playedWith[p1.id]?.has(p2.id);
        const ptsDiff = Math.abs(
          (p1.score?.points ?? p1.score_points ?? 0) - 
          (p2.score?.points ?? p2.score_points ?? 0)
        );
        const buchDiff = Math.abs(
          (p1.score?.buchholz ?? p1.score_buchholz ?? 0) - 
          (p2.score?.buchholz ?? p2.score_buchholz ?? 0)
        );

        // Приоритет: одинаковые очки > близкий Buchholz > не играли раньше
        let score = 10000 - ptsDiff * 1000 - buchDiff * 10;
        if (alreadyPlayed) score -= 50000; // Жёсткий штраф за рематч

        if (score > bestScore) { bestScore = score; bestOpponent = p2; }
      }

      if (bestOpponent) {
        pairs.push([p1, bestOpponent]);
        used.add(p1.id);
        used.add(bestOpponent.id);
      } else {
        // BYE — свободная победа
        pairs.push([p1, null]);
        used.add(p1.id);
      }
    }

    return pairs;
  }

  // ========== РАСЧЁТ СТЕНДИНГОВ (с Buchholz) ==========
  function calculateStandings(allPlayers, allMatches) {
    const scores = {};
    for (const p of allPlayers) {
      scores[p.id] = { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 };
    }

    for (const m of allMatches) {
      if (!m.finished) continue;
      const v1 = m.votes1 || 0;
      const v2 = m.votes2 || 0;

      if (v1 > v2) {
        if (m.player1_id) { scores[m.player1_id].wins++; scores[m.player1_id].points += 1; }
        if (m.player2_id) { scores[m.player2_id].losses++; }
      } else if (v2 > v1) {
        if (m.player2_id) { scores[m.player2_id].wins++; scores[m.player2_id].points += 1; }
        if (m.player1_id) { scores[m.player1_id].losses++; }
      } else if (v1 === v2 && v1 > 0) {
        // Ничья — оба получают 0.5
        if (m.player1_id) { scores[m.player1_id].draws++; scores[m.player1_id].points += 0.5; }
        if (m.player2_id) { scores[m.player2_id].draws++; scores[m.player2_id].points += 0.5; }
      }
    }

    // Расчёт Buchholz (сумма очков всех соперников)
    for (const p of allPlayers) {
      let buchholz = 0;
      for (const m of allMatches) {
        if (!m.finished) continue;
        let opponentId = null;
        if (m.player1_id === p.id) opponentId = m.player2_id;
        else if (m.player2_id === p.id) opponentId = m.player1_id;
        if (opponentId) {
          buchholz += scores[opponentId]?.points || 0;
        }
      }
      scores[p.id].buchholz = buchholz;
    }

    return scores;
  }

  // ========== СОРТИРОВКА ИГРОКОВ ==========
  function sortPlayersByStandings(players, standings) {
    return [...players].sort((a, b) => {
      const sa = standings[a.id] || { points: 0, buchholz: 0, wins: 0 };
      const sb = standings[b.id] || { points: 0, buchholz: 0, wins: 0 };
      if (sb.points !== sa.points) return sb.points - sa.points;
      if (sb.buchholz !== sa.buchholz) return sb.buchholz - sa.buchholz;
      return sb.wins - sa.wins;
    });
  }

  // ========== BYE: автоматическая победа ==========
  function applyByeResults(pairs, roundNumber) {
    const byeMatches = [];
    for (const [p1, p2] of pairs) {
      if (!p2) {
        // BYE — p1 получает техническую победу
        byeMatches.push({
          id: generateId(),
          player1_id: p1.id,
          player2_id: null,
          votes1: 1,
          votes2: 0,
          finished: true,
          winner_id: p1.id,
          status: 'done',
          isBye: true
        });
      }
    }
    return byeMatches;
  }

  window.SwissEngine = {
    generateSwissPairs,
    calculateStandings,
    sortPlayersByStandings,
    applyByeResults,
    generateId
  };
})();
