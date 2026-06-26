/* ============================================================
   TOURNAMENT ENGINE – Swiss System + Groups (безопасная версия)
   ============================================================ */
(function () {
  'use strict';

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ===== SWISS PAIRING =====
  function calculateScores(players, allMatches) {
    const scores = {};
    (players || []).forEach(p => { scores[p.id] = { wins: 0, losses: 0, points: 0 }; });
    (allMatches || []).forEach(m => {
      if (m.finished && m.winner_id) {
        if (!scores[m.winner_id]) scores[m.winner_id] = { wins: 0, losses: 0, points: 0 };
        scores[m.winner_id].wins++;
        scores[m.winner_id].points += 1;
        const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        if (loserId) {
          if (!scores[loserId]) scores[loserId] = { wins: 0, losses: 0, points: 0 };
          scores[loserId].losses++;
        }
      }
    });
    return scores;
  }

  function generateSwissPairs(players, previousMatches, groupSize) {
    const scores = calculateScores(players, previousMatches);
    const sorted = [...players].sort((a, b) => {
      const ptsA = scores[a.id]?.points || 0;
      const ptsB = scores[b.id]?.points || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return (scores[b.id]?.wins || 0) - (scores[a.id]?.wins || 0);
    });

    // Track who played whom
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
        const ptsDiff = Math.abs((scores[p1.id]?.points || 0) - (scores[p2.id]?.points || 0));
        let score = 1000 - ptsDiff * 10;
        if (alreadyPlayed) score -= 5000;
        if (score > bestScore) { bestScore = score; bestOpponent = p2; }
      }

      if (bestOpponent) {
        pairs.push([p1, bestOpponent]);
        used.add(p1.id);
        used.add(bestOpponent.id);
      } else {
        pairs.push([p1, null]);
        used.add(p1.id);
      }
    }

    return pairs;
  }

  // ===== GROUP SPLITTER =====
  function splitIntoGroups(players, groupCount) {
    const shuffled = shuffle(players);
    const total = shuffled.length;
    const baseSize = Math.floor(total / groupCount);
    const extra = total % groupCount;
    const groups = [];
    let start = 0;
    for (let g = 0; g < groupCount; g++) {
      const size = baseSize + (g < extra ? 1 : 0);
      groups.push(shuffled.slice(start, start + size));
      start += size;
    }
    return groups;
  }

  // ===== ROUND GENERATOR =====
  function createRound(players, roundNumber, previousMatches, groupCount, pairingMode) {
    groupCount = Math.max(1, Math.min(groupCount || 1, Math.floor(players.length / 2)));

    let groups;
    if (roundNumber === 0 || pairingMode === 'random') {
      groups = splitIntoGroups(players, groupCount);
    } else {
      // Swiss: sort by score, then split into groups
      const scores = calculateScores(players, previousMatches || []);
      const sorted = [...players].sort((a, b) => {
        const ptsA = scores[a.id]?.points || 0;
        const ptsB = scores[b.id]?.points || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;
        return (scores[b.id]?.wins || 0) - (scores[a.id]?.wins || 0);
      });
      groups = splitIntoGroups(sorted, groupCount);
    }

    const round = {
      id: generateId(),
      round_number: roundNumber,
      name: `Раунд ${roundNumber + 1}`,
      group_count: groups.length,
      active_group_index: 0,
      is_active: true,
      started_at: new Date().toISOString(),
      matches: []
    };

    // Generate matches within each group
    for (let g = 0; g < groups.length; g++) {
      const groupPlayers = groups[g];
      // Pair within group (Swiss style: strong vs strong within group)
      const pairs = generateSwissPairs(groupPlayers, previousMatches || []);
      for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
        const [p1, p2] = pairs[pIdx];
        round.matches.push({
          id: generateId(),
          group_index: g,
          match_order: pIdx,
          player1_id: p1?.id || null,
          player2_id: p2?.id || null,
          votes1: 0,
          votes2: 0,
          finished: false,
          winner_id: null,
          status: 'pending'
        });
      }
    }

    return round;
  }

  // ===== ADVANCE ROUND =====
  function advanceRound(tournament, force) {
    if (!tournament || !tournament.rounds) return { ok: false, err: "Неверная структура турнира" };

    const currIdx = tournament.current_round || tournament.currentRound || 0;
    const currentRound = tournament.rounds[currIdx];
    if (!currentRound) return { ok: false, err: "Текущий раунд не найден" };

    // Check if all matches are finished
    const unfinished = currentRound.matches.some(m => !m.finished);
    if (unfinished && !force) return { ok: false, err: "Не все матчи завершены" };

    // Finish unfinished matches
    currentRound.matches.forEach(m => {
      if (!m.finished) {
        const winnerId = (m.votes1 || 0) >= (m.votes2 || 0) ? m.player1_id : m.player2_id;
        if (winnerId) {
          m.winner_id = winnerId;
          m.finished = true;
          m.status = 'done';
        } else {
          // If no winner (e.g., both null), skip
          m.finished = true;
          m.status = 'done';
        }
      }
    });

    currentRound.is_active = false;
    currentRound.ended_at = new Date().toISOString();

    const totalRounds = tournament.total_rounds || tournament.totalRounds || 10;
    const nextRoundNum = currIdx + 1;

    if (nextRoundNum >= totalRounds) {
      tournament.status = 'finished';
      tournament.completed_at = new Date().toISOString();
      // Determine overall winner
      const allPlayers = tournament.players || [];
      const allMatches = [];
      tournament.rounds.forEach(r => { r.matches.forEach(m => allMatches.push(m)); });
      const scores = calculateScores(allPlayers, allMatches);
      const winner = allPlayers.sort((a, b) => (scores[b.id]?.points || 0) - (scores[a.id]?.points || 0))[0];
      tournament.winner = winner;
      tournament.winner_id = winner?.id || null;
      return { ok: true, finished: true };
    }

    // Create next round
    const allPlayers = tournament.players || [];
    const allMatches = [];
    tournament.rounds.forEach(r => { r.matches.forEach(m => allMatches.push(m)); });
    const groupCount = tournament.group_count || Math.max(1, Math.floor(allPlayers.length / 4));
    const pairingMode = tournament.pairing_mode || 'swiss';

    const nextRound = createRound(
      allPlayers,
      nextRoundNum,
      allMatches,
      groupCount,
      pairingMode
    );

    tournament.rounds.push(nextRound);
    tournament.current_round = nextRoundNum;
    tournament.currentRound = nextRoundNum;

    // Schedule rest day
    if (tournament.rest_days_between_rounds > 0) {
      const restUntil = new Date();
      restUntil.setDate(restUntil.getDate() + tournament.rest_days_between_rounds);
      nextRound.started_at = restUntil.toISOString();
      nextRound.rest_day_after = true;
    }

    return { ok: true, finished: false, nextRound };
  }

  // ===== CREATE INITIAL ROUNDS =====
  function createInitialRounds(players, totalRounds, groupCount, pairingMode) {
    const allPlayers = players || [];
    const rounds = [];
    let allMatches = [];

    for (let r = 0; r < totalRounds; r++) {
      const round = createRound(allPlayers, r, allMatches, groupCount, r === 0 ? 'random' : pairingMode);
      rounds.push(round);
      round.matches.forEach(m => allMatches.push(m));
    }

    return rounds;
  }

  // ===== EXPOSE =====
  window.TournamentEngine = {
    shuffle,
    generateId,
    calculateScores,
    generateSwissPairs,
    splitIntoGroups,
    createRound,
    createInitialRounds,
    advanceRound
  };
})();
