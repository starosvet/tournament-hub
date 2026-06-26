/* ============================================================
   Tournament Hub Core Engine (v6 — Group System + Swiss)
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

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ========== GROUP PAIRING ==========
  // Swiss system: sort by score, then pair adjacent players
  // For groups: split sorted list into N groups, then pair within each group
  function generateGroupPairs(players, previousMatches, groupCount) {
    groupCount = groupCount || 2;

    // Sort by points (desc), then wins (desc)
    const sorted = [...players].sort((a, b) => {
      const ptsA = a.score?.points || 0;
      const ptsB = b.score?.points || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return (b.score?.wins || 0) - (a.score?.wins || 0);
    });

    // Track who played with whom
    const playedWith = {};
    (previousMatches || []).forEach(m => {
      if (m.player1_id && m.player2_id) {
        playedWith[m.player1_id] = playedWith[m.player1_id] || new Set();
        playedWith[m.player2_id] = playedWith[m.player2_id] || new Set();
        playedWith[m.player1_id].add(m.player2_id);
        playedWith[m.player2_id].add(m.player1_id);
      }
    });

    // Distribute into groups evenly (round-robin for balance)
    // Each group gets mix of strong/medium/weak
    const groups = [];
    for (let i = 0; i < groupCount; i++) groups.push([]);

    for (let i = 0; i < sorted.length; i++) {
      const groupIdx = i % groupCount;
      groups[groupIdx].push(sorted[i]);
    }

    // Pair within each group (Swiss: avoid rematches, minimize score diff)
    const allPairs = [];
    groups.forEach((group, gIdx) => {
      const groupPairs = [];
      const used = new Set();
      
      for (const p1 of group) {
        if (used.has(p1.id)) continue;
        
        let bestOpponent = null;
        let bestScore = -Infinity;
        
        for (const p2 of group) {
          if (p1.id === p2.id || used.has(p2.id)) continue;
          const alreadyPlayed = playedWith[p1.id]?.has(p2.id);
          const ptsDiff = Math.abs((p1.score?.points || 0) - (p2.score?.points || 0));
          let score = 1000 - ptsDiff * 10;
          if (alreadyPlayed) score -= 5000;
          if (score > bestScore) { bestScore = score; bestOpponent = p2; }
        }

        if (bestOpponent) {
          groupPairs.push({ player1: p1, player2: bestOpponent, groupNumber: gIdx });
          used.add(p1.id);
          used.add(bestOpponent.id);
        } else if (!used.has(p1.id)) {
          // Bye - auto win
          groupPairs.push({ player1: p1, player2: null, groupNumber: gIdx });
          used.add(p1.id);
        }
      }
      
      allPairs.push(...groupPairs);
    });

    return allPairs;
  }

  // ========== ROUND 1: RANDOM GROUPS ==========
  function generateRandomGroupPairs(players, groupCount) {
    groupCount = groupCount || 2;
    const shuffled = shuffle(players);
    
    const groups = [];
    for (let i = 0; i < groupCount; i++) groups.push([]);
    
    for (let i = 0; i < shuffled.length; i++) {
      const groupIdx = i % groupCount;
      groups[groupIdx].push(shuffled[i]);
    }

    const allPairs = [];
    groups.forEach((group, gIdx) => {
      for (let i = 0; i < group.length; i += 2) {
        const p1 = group[i];
        const p2 = group[i + 1] || null;
        allPairs.push({ player1: p1, player2: p2, groupNumber: gIdx });
      }
    });

    return allPairs;
  }

  // ========== CREATE ROUND ==========
  function createRound(tournament, roundNumber, isFirstRound) {
    const groupCount = tournament.group_count || tournament.groupCount || 2;
    const players = tournament.players || [];
    
    if (!players.length) return null;

    let pairs;
    if (isFirstRound) {
      pairs = generateRandomGroupPairs(players, groupCount);
    } else {
      const previousMatches = [];
      (tournament.rounds || []).forEach(r => {
        previousMatches.push(...(r.matches || []));
      });
      pairs = generateGroupPairs(players, previousMatches, groupCount);
    }

    const matches = pairs.map((pair, idx) => ({
      id: generateId(),
      player1: pair.player1,
      player2: pair.player2,
      player1_id: pair.player1?.id || null,
      player2_id: pair.player2?.id || null,
      group_number: pair.groupNumber,
      votes1: 0,
      votes2: 0,
      finished: false,
      winner_id: null,
      status: 'pending',
      match_order: idx
    }));

    // Auto-finish bye matches
    matches.forEach(m => {
      if (m.player1 && !m.player2) {
        m.finished = true;
        m.winner_id = m.player1.id;
        m.status = 'done';
        m.votes1 = 1;
      }
    });

    return {
      id: generateId(),
      round_number: roundNumber,
      name: `Раунд ${roundNumber + 1}`,
      is_active: false,
      isBreak: false,
      group_count: groupCount,
      matches: matches,
      startedAt: null,
      endedAt: null
    };
  }

  // ========== FINALIZE ROUND WITH GROUPS ==========
  function finalizeRound(tournament) {
    if (!tournament || !Array.isArray(tournament.rounds)) {
      return { ok: false, err: "Неверная структура турнира" };
    }
    
    const currIdx = tournament.currentRound || tournament.current_round || 0;
    const currentRound = tournament.rounds[currIdx];
    if (!currentRound) return { ok: false, err: "Текущий раунд не найден" };

    // Finish unfinished matches by votes
    const unfinished = currentRound.matches.some(m => !m.finished);
    if (unfinished) {
      currentRound.matches.forEach(m => {
        if (!m.finished) {
          if ((m.votes1 || 0) >= (m.votes2 || 0)) {
            m.winner_id = m.player1 ? m.player1.id : (m.player2 ? m.player2.id : null);
          } else {
            m.winner_id = m.player2 ? m.player2.id : (m.player1 ? m.player1.id : null);
          }
          m.finished = true;
          m.status = 'done';
        }
      });
    }

    // Update player scores
    const playerMap = {};
    (tournament.players || []).forEach(p => {
      playerMap[p.id] = p;
      if (!p.score) p.score = { wins: 0, losses: 0, points: 0 };
    });

    currentRound.matches.forEach(m => {
      if (m.finished && m.winner_id) {
        const winner = playerMap[m.winner_id];
        if (winner) {
          winner.score.wins++;
          winner.score.points++;
        }
        const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        if (loserId) {
          const loser = playerMap[loserId];
          if (loser) loser.score.losses++;
        }
      }
    });

    // Check if tournament should end
    const totalRounds = tournament.total_rounds || tournament.totalRounds || 10;
    if (currIdx >= totalRounds - 1) {
      tournament.status = "finished";
      
      // Determine winner by points
      const sorted = [...tournament.players].sort((a, b) => {
        const ptsB = (b.score?.points || 0);
        const ptsA = (a.score?.points || 0);
        if (ptsB !== ptsA) return ptsB - ptsA;
        return (b.score?.wins || 0) - (a.score?.wins || 0);
      });
      
      tournament.winner = sorted[0] || null;
      tournament.standings = sorted;
      currentRound.is_active = false;
      currentRound.endedAt = new Date().toISOString();
      
      return { ok: true, finished: true };
    }

    // Setup break before next round
    const breakDuration = tournament.break_duration_hours || 24;
    currentRound.is_active = false;
    currentRound.endedAt = new Date().toISOString();

    // Create next round
    const nextRound = createRound(tournament, currIdx + 1, false);
    if (!nextRound) return { ok: false, err: "Ошибка создания раунда" };

    nextRound.isBreak = true;
    nextRound.breakEndsAt = new Date(Date.now() + breakDuration * 60 * 60 * 1000).toISOString();
    
    tournament.rounds.push(nextRound);
    tournament.currentRound = currIdx + 1;
    tournament.current_round = currIdx + 1;

    return { ok: true, finished: false, break: true };
  }

  // ========== END BREAK AND ACTIVATE NEXT ROUND ==========
  function endBreak(tournament) {
    const currIdx = tournament.currentRound || tournament.current_round || 0;
    const round = tournament.rounds[currIdx];
    if (!round || !round.isBreak) return { ok: false, err: "Нет активного перерыва" };
    
    round.isBreak = false;
    round.is_active = true;
    round.startedAt = new Date().toISOString();
    
    return { ok: true };
  }

  // ========== START TOURNAMENT ==========
  function startTournament(tournament) {
    if (!tournament) return { success: false, error: "Турнир не найден" };
    if (tournament.status !== 'draft') return { success: false, error: "Турнир уже запущен" };
    
    const players = tournament.players || [];
    if (players.length < 2) return { success: false, error: "Минимум 2 участника" };

    // Ensure even distribution
    const groupCount = tournament.group_count || tournament.groupCount || 2;
    const perGroup = Math.floor(players.length / groupCount);
    if (perGroup < 2) {
      return { success: false, error: `Слишком мало участников для ${groupCount} групп` };
    }

    // Initialize scores
    players.forEach(p => {
      if (!p.score) p.score = { wins: 0, losses: 0, points: 0 };
    });

    const firstRound = createRound(tournament, 0, true);
    if (!firstRound) return { success: false, error: "Ошибка создания первого раунда" };
    
    firstRound.is_active = true;
    firstRound.startedAt = new Date().toISOString();
    
    tournament.rounds = [firstRound];
    tournament.currentRound = 0;
    tournament.current_round = 0;
    tournament.status = 'active';
    
    return { success: true, tournament };
  }

  // ========== CHECK AND AUTO-OPEN GROUPS ==========
  function checkGroupOpenings(round) {
    if (!round || round.isBreak) return [];
    
    const roundStart = round.startedAt ? new Date(round.startedAt) : new Date();
    const now = new Date();
    const dayDiff = Math.floor((now - roundStart) / (1000 * 60 * 60 * 24));
    
    const openGroups = [];
    const groupCount = round.group_count || 2;
    
    for (let g = 0; g < groupCount; g++) {
      if (g <= dayDiff) openGroups.push(g);
    }
    
    return openGroups;
  }

  // ========== LEGACY: Single bracket (for non-group tournaments) ==========
  function roundTitle(totalSubjects) {
    if (totalSubjects <= 2) return "Финал";
    if (totalSubjects <= 4) return "1/2 финала";
    if (totalSubjects <= 8) return "1/4 финала";
    if (totalSubjects <= 16) return "1/8 финала";
    if (totalSubjects <= 32) return "1/16 финала";
    return `1/${totalSubjects} финала`;
  }

  function createBracket(players) {
    if (!Array.isArray(players) || players.length < 2) return null;
    const shuffled = shuffle(players);
    const count = shuffled.length;
    let power = 2;
    while (power < count) power *= 2;
    const roundsCount = Math.log2(power);
    const rounds = [];
    let currentRoundSubjects = power;
    for (let i = 0; i < roundsCount; i++) {
      rounds.push({ id: generateId(), name: roundTitle(currentRoundSubjects), is_active: i === 0, matches: [] });
      currentRoundSubjects /= 2;
    }
    const firstRoundMatches = rounds[0].matches;
    let playerIdx = 0;
    for (let m = 0; m < power / 2; m++) {
      const p1 = shuffled[playerIdx] || null;
      playerIdx++;
      const p2 = (playerIdx < count) ? (shuffled[playerIdx] || null) : null;
      if (playerIdx < count) playerIdx++;
      const match = { id: generateId(), player1: p1, player2: p2, votes1: 0, votes2: 0, finished: false, winner_id: null };
      if (match.player1 && !match.player2) { match.finished = true; match.winner_id = match.player1.id; match.votes1 = 1; }
      else if (!match.player1 && match.player2) { match.finished = true; match.winner_id = match.player2.id; match.votes2 = 1; }
      firstRoundMatches.push(match);
    }
    for (let r = 1; r < rounds.length; r++) {
      const prevCount = rounds[r - 1].matches.length;
      for (let m = 0; m < prevCount / 2; m++) {
        rounds[r].matches.push({ id: generateId(), player1: null, player2: null, votes1: 0, votes2: 0, finished: false, winner_id: null });
      }
    }
    propagateWinners(rounds);
    return { rounds };
  }

  function propagateWinners(rounds) {
    for (let r = 0; r < rounds.length - 1; r++) {
      const currentMatches = rounds[r].matches;
      const nextMatches = rounds[r + 1].matches;
      for (let m = 0; m < currentMatches.length; m++) {
        const match = currentMatches[m];
        if (match.finished && match.winner_id) {
          const nextMatchIdx = Math.floor(m / 2);
          const isPlayer1Slot = m % 2 === 0;
          const nextMatch = nextMatches[nextMatchIdx];
          if (!nextMatch) continue;
          const winnerObj = (match.player1 && match.player1.id === match.winner_id) ? match.player1 : match.player2;
          if (isPlayer1Slot) nextMatch.player1 = winnerObj;
          else nextMatch.player2 = winnerObj;
          if (nextMatch.player1 && !nextMatch.player2 && nextMatch.player1.id) {
            nextMatch.finished = true;
            nextMatch.winner_id = nextMatch.player1.id;
          }
        }
      }
    }
  }

  window.TournamentEngine = {
    shuffle, roundTitle, createBracket, finalizeRound, propagateWinners,
    generateGroupPairs, generateRandomGroupPairs, createRound,
    startTournament, endBreak, checkGroupOpenings
  };
  window.createBracket = createBracket;
  window.finalizeRound = finalizeRound;
})();
