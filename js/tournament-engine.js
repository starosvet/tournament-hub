// js/tournament-engine.js — Швейцарская система турниров

/**
 * Основной движок для управления турнирами со швейцарской системой
 */

class TournamentEngine {
  
  /**
   * Создать турнир со швейцарской системой
   * @param {string} name - Название турнира
   * @param {string} description - Описание
   * @param {Array} players - Массив участников
   * @param {number} roundCount - Количество раундов
   * @param {Object} config - Дополнительные параметры
   */
  static createSwissTournament(name, description, players, roundCount = 5, config = {}) {
    const tournament = {
      id: Date.now(),
      name,
      description,
      type: 'swiss',
      status: 'pending', // pending, active, completed
      config: {
        roundCount,
        voteDurationHours: config.voteDurationHours || 24,
        minPlayersForPairing: config.minPlayersForPairing || 2
      },
      participants: players.map((p, idx) => ({
        id: p.id || `p_${Date.now()}_${idx}`,
        name: p.name,
        url: p.url || '#',
        avatar: p.avatar || null,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        buchholzScore: 0, // Для разрешения ничьих
        registered: true,
        joinedAt: new Date().toISOString()
      })),
      rounds: [],
      standings: [],
      winner: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      rules: {
        winPoints: 2,
        drawPoints: 1,
        lossPoints: 0
      }
    };

    // Создаём раунды
    for (let i = 0; i < roundCount; i++) {
      tournament.rounds.push({
        id: i,
        name: `Раунд ${i + 1}`,
        matches: [],
        startedAt: null,
        endedAt: null,
        status: 'pending'
      });
    }

    return tournament;
  }

  /**
   * Сформировать пары для раунда (швейцарская система)
   */
  static generatePairings(tournament, roundIndex) {
    const round = tournament.rounds[roundIndex];
    if (!round) return null;

    const participants = tournament.participants.filter(p => p.registered);
    if (participants.length < 2) return null;

    // Сортируем по очкам (desc), потом по Бухгольцу
    const sorted = [...participants].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.buchholzScore - a.buchholzScore;
    });

    const matches = [];
    const used = new Set();

    // Группируем по очкам и ищем пары
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;

      let opponent = null;
      // Ищем противника с похожим рейтингом
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        opponent = sorted[j];
        break;
      }

      if (!opponent) continue;

      used.add(sorted[i].id);
      used.add(opponent.id);

      matches.push({
        id: `match_${tournament.id}_${roundIndex}_${matches.length}`,
        roundId: roundIndex,
        playerA: { ...sorted[i] },
        playerB: { ...opponent },
        votesA: 0,
        votesB: 0,
        result: null, // null, 'A', 'B', 'draw'
        status: 'pending', // pending, voting, finished
        startedAt: null,
        endedAt: null
      });
    }

    // Если остался один непарный участник (фрирауд)
    if (used.size < sorted.length) {
      const lastPlayer = sorted.find(p => !used.has(p.id));
      if (lastPlayer) {
        matches.push({
          id: `match_${tournament.id}_${roundIndex}_bye`,
          roundId: roundIndex,
          playerA: { ...lastPlayer },
          playerB: null,
          votesA: 0,
          votesB: 0,
          result: 'A', // Автоматическая победа
          status: 'finished',
          isBye: true,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString()
        });
      }
    }

    round.matches = matches;
    round.status = 'active';
    round.startedAt = new Date().toISOString();

    return matches;
  }

  /**
   * Зафиксировать результат матча
   */
  static finishMatch(tournament, roundIndex, matchId, result) {
    const round = tournament.rounds[roundIndex];
    const match = round?.matches.find(m => m.id === matchId);
    
    if (!match) return { ok: false, error: 'Match not found' };
    if (match.status === 'finished') return { ok: false, error: 'Match already finished' };

    // Определяем победителя по большинству голосов
    let matchResult = null;
    if (match.votesA > match.votesB) {
      matchResult = 'A';
    } else if (match.votesB > match.votesA) {
      matchResult = 'B';
    } else {
      matchResult = 'draw';
    }

    match.result = matchResult;
    match.status = 'finished';
    match.endedAt = new Date().toISOString();

    // Обновляем статистику участников
    const pA = tournament.participants.find(p => p.id === match.playerA.id);
    const pB = match.playerB ? tournament.participants.find(p => p.id === match.playerB.id) : null;

    if (matchResult === 'A') {
      if (pA) {
        pA.wins++;
        pA.points += tournament.rules.winPoints;
      }
      if (pB) {
        pB.losses++;
        pB.points += tournament.rules.lossPoints;
      }
    } else if (matchResult === 'B') {
      if (pA) {
        pA.losses++;
        pA.points += tournament.rules.lossPoints;
      }
      if (pB) {
        pB.wins++;
        pB.points += tournament.rules.winPoints;
      }
    } else if (matchResult === 'draw') {
      if (pA) {
        pA.draws++;
        pA.points += tournament.rules.drawPoints;
      }
      if (pB) {
        pB.draws++;
        pB.points += tournament.rules.drawPoints;
      }
    }

    return { ok: true, result: matchResult };
  }

  /**
   * Завершить раунд и перейти к следующему
   */
  static finishRound(tournament, roundIndex) {
    const round = tournament.rounds[roundIndex];
    if (!round) return { ok: false, error: 'Round not found' };

    // Проверяем, что все матчи завершены
    const unfinished = round.matches.filter(m => m.status !== 'finished');
    if (unfinished.length > 0) {
      return { ok: false, error: 'Not all matches are finished' };
    }

    round.status = 'completed';
    round.endedAt = new Date().toISOString();

    // Пересчитываем Бухгольц-счёт (сумма очков противников)
    tournament.participants.forEach(p => {
      let buchholz = 0;
      round.matches.forEach(m => {
        if (m.playerA.id === p.id && m.playerB) {
          const opponent = tournament.participants.find(op => op.id === m.playerB.id);
          if (opponent) buchholz += opponent.points;
        } else if (m.playerB && m.playerB.id === p.id) {
          const opponent = tournament.participants.find(op => op.id === m.playerA.id);
          if (opponent) buchholz += opponent.points;
        }
      });
      p.buchholzScore = buchholz;
    });

    // Обновляем турнирную таблицу
    this.updateStandings(tournament);

    // Проверяем, завершен ли турнир
    if (roundIndex === tournament.rounds.length - 1) {
      tournament.status = 'completed';
      tournament.completedAt = new Date().toISOString();
      tournament.winner = tournament.standings[0];
    }

    return { ok: true, nextRound: roundIndex + 1 };
  }

  /**
   * Обновить турнирную таблицу (standings)
   */
  static updateStandings(tournament) {
    tournament.standings = [...tournament.participants]
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.buchholzScore - a.buchholzScore;
      })
      .map((p, idx) => ({
        place: idx + 1,
        ...p
      }));

    return tournament.standings;
  }

  /**
   * Добавить голос в матч
   */
  static vote(tournament, roundIndex, matchId, votedFor) {
    const round = tournament.rounds[roundIndex];
    const match = round?.matches.find(m => m.id === matchId);
    
    if (!match) return { ok: false, error: 'Match not found' };
    if (match.status === 'finished') return { ok: false, error: 'Voting finished' };

    if (votedFor === 'A') {
      match.votesA++;
    } else if (votedFor === 'B') {
      match.votesB++;
    }

    return { ok: true, votesA: match.votesA, votesB: match.votesB };
  }

  /**
   * Получить текущий раунд
   */
  static getCurrentRound(tournament) {
    for (const [idx, round] of tournament.rounds.entries()) {
      if (round.status !== 'completed') {
        return { round, index: idx };
      }
    }
    return null;
  }

  /**
   * Проверить, завершён ли турнир
   */
  static isCompleted(tournament) {
    return tournament.status === 'completed';
  }
}

// Экспорт для использования
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TournamentEngine;
}
