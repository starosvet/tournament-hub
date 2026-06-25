/* ============================================================
   Tournament Hub Core Engine (FIXED v5 — bracket, ELO, propagation)
   ============================================================ */
(function () {
  'use strict';
  const DEFAULT_ELO = 1000;
  const K_FACTOR = 32;

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

  function roundTitle(totalSubjects) {
    if (totalSubjects <= 2) return "Финал";
    if (totalSubjects <= 4) return "1/2 финала";
    if (totalSubjects <= 8) return "1/4 финала";
    if (totalSubjects <= 16) return "1/8 финала";
    if (totalSubjects <= 32) return "1/16 финала";
    return `1/${totalSubjects} финала`;
  }

  function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  function calculateEloChange(ratingA, ratingB, outcomeA) {
    const expected = expectedScore(ratingA, ratingB);
    return Math.round(K_FACTOR * (outcomeA - expected));
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
            nextMatch.votes1 = 1;
          }
        }
      }
    }
  }

  function finalizeRound(tournament) {
    if (!tournament || !Array.isArray(tournament.rounds)) return { ok: false, err: "Неверная структура турнира" };
    const currIdx = tournament.currentRound || 0;
    const currentRound = tournament.rounds[currIdx];
    if (!currentRound) return { ok: false, err: "Текущий раунд не найден" };
    const unfinished = currentRound.matches.some(m => !m.finished);
    if (unfinished) {
      currentRound.matches.forEach(m => {
        if (!m.finished) {
          if ((m.votes1 || 0) >= (m.votes2 || 0)) m.winner_id = m.player1 ? m.player1.id : (m.player2 ? m.player2.id : null);
          else m.winner_id = m.player2 ? m.player2.id : (m.player1 ? m.player1.id : null);
          m.finished = true;
        }
      });
    }
    if (currIdx >= tournament.rounds.length - 1) {
      tournament.status = "finished";
      const finalMatch = currentRound.matches[0];
      tournament.winner = finalMatch ? ((finalMatch.winner_id === finalMatch.player1?.id) ? finalMatch.player1 : finalMatch.player2) : null;
      return { ok: true, finished: true };
    }
    const nextRound = tournament.rounds[currIdx + 1];
    currentRound.is_active = false;
    nextRound.is_active = true;
    for (let m = 0; m < currentRound.matches.length; m++) {
      const match = currentRound.matches[m];
      const nextMatchIdx = Math.floor(m / 2);
      const isPlayer1Slot = m % 2 === 0;
      const nextMatch = nextRound.matches[nextMatchIdx];
      if (nextMatch) {
        const winnerObj = (match.player1 && match.player1.id === match.winner_id) ? match.player1 : match.player2;
        if (isPlayer1Slot) nextMatch.player1 = winnerObj;
        else nextMatch.player2 = winnerObj;
        if (nextMatch.player1 && !nextMatch.player2 && nextMatch.player1.id) {
          nextMatch.finished = true;
          nextMatch.winner_id = nextMatch.player1.id;
        }
      }
    }
    tournament.currentRound = currIdx + 1;
    return { ok: true, finished: false };
  }

  window.TournamentEngine = {
    shuffle, roundTitle, expectedScore, calculateEloChange,
    createBracket, finalizeRound, propagateWinners
  };
  window.createBracket = createBracket;
  window.finalizeRound = finalizeRound;
})();