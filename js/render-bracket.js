/* ============================================================
   Tournament Hub Bracket Renderer (v9 — SHIKIMORI ENHANCED)
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

  let realtimeSubscribed = false;
  let currentTournamentId = null;
  let isRendering = false;

  async function loadTournament(tournamentId) {
    if (window.TH && window.TH.getTournament) {
      try {
        const { data, error } = await window.TH.getTournament(tournamentId);
        if (error) throw error;
        if (data) return data;
      } catch (e) { console.warn('Supabase load failed:', e); }
    }
    const db = window.DB ? window.DB.getDB() : { tournaments: [] };
    return (db.tournaments || []).find(t => t.id === tournamentId) || null;
  }

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ========== SHIKIMORI MATCH CARD (улучшенная) ==========
  async function renderMatch(match, isRoundActive, tournamentStatus) {
    const p1 = match.player1 || { name: "???", image_url: '', score: { points: 0, wins: 0, losses: 0 } };
    const p2 = match.player2 || { name: "???", image_url: '', score: { points: 0, wins: 0, losses: 0 } };
    const votes1 = match.votes1 || 0;
    const votes2 = match.votes2 || 0;
    const total = votes1 + votes2;
    const pct1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
    const pct2 = total > 0 ? Math.round((votes2 / total) * 100) : 50;
    const isFinished = match.finished || match.status === 'done';
    const isDraw = match.isDraw || (isFinished && votes1 === votes2 && votes1 > 0);
    const wId = match.winner_id || (match.winner ? match.winner.id : null);
    const p1Win = isFinished && wId && p1.id === wId;
    const p2Win = isFinished && wId && p2.id === wId;
    const isBye = match.isBye || (!p2.id && p1.id);

    let canVote = false;
    if (isRoundActive && !isFinished && tournamentStatus === 'active' && !isBye) {
      if (window.TH && window.TH.hasVoted) {
        try { canVote = !(await window.TH.hasVoted(match.id)); } catch (e) { canVote = true; }
      } else {
        canVote = !localStorage.getItem('th_voted_match_' + match.id);
      }
    }

    const p1Image = p1.image_url || p1.image || '';
    const p2Image = p2.image_url || p2.image || '';

    // BYE матч
    if (isBye) {
      return `
      <div class="shiki-match bye-match" id="match-${match.id}">
        <div class="shiki-bye-label">BYE — Тех. победа</div>
        <div class="shiki-match-inner">
          <div class="shiki-player winner">
            <div class="shiki-player-img">
              ${p1Image ? `<img src="${escapeHTML(p1Image)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${escapeHTML(p1.name)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p1.score?.points !== undefined ? p1.score.points : (p1.score_points || 0)} очков</span>
                <span class="shiki-wl">${p1.score?.wins !== undefined ? p1.score.wins : (p1.score_wins || 0)}W / ${p1.score?.losses !== undefined ? p1.score.losses : (p1.score_losses || 0)}L</span>
              </div>
            </div>
            <div class="shiki-crown">👑</div>
          </div>
          <div class="shiki-center">
            <div class="shiki-vs">BYE</div>
            <div class="shiki-vote-count">+1</div>
            <div style="font-size:11px;color:var(--green);font-weight:700;">Авто-победа</div>
          </div>
          <div class="shiki-player loser" style="opacity:0.3;">
            <div class="shiki-player-img no-img">—</div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">Нет соперника</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    // Обычный матч
    return `
      <div class="shiki-match ${isFinished ? 'finished' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        ${isDraw ? '<div class="shiki-draw-badge">⚖️ НИЧЬЯ</div>' : ''}
        <div class="shiki-match-inner">
          <!-- Player 1 -->
          <div class="shiki-player ${p1Win ? 'winner' : ''} ${!p1Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 1, this)"` : ''}>
            <div class="shiki-player-img">
              ${p1Image ? `<img src="${escapeHTML(p1Image)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${escapeHTML(p1.name)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p1.score?.points !== undefined ? p1.score.points : (p1.score_points || 0)} очков</span>
                <span class="shiki-wl">${p1.score?.wins !== undefined ? p1.score.wins : (p1.score_wins || 0)}W / ${p1.score?.losses !== undefined ? p1.score.losses : (p1.score_losses || 0)}L</span>
              </div>
            </div>
            ${p1Win ? '<div class="shiki-crown">👑</div>' : ''}
          </div>

          <!-- Center VS -->
          <div class="shiki-center">
            <div class="shiki-vs">VS</div>
            <div class="shiki-vote-count">${votes1} — ${votes2}</div>
            <div class="shiki-vote-bar">
              <div class="shiki-bar-left" style="width:${pct1}%"></div>
              <div class="shiki-bar-right" style="width:${pct2}%"></div>
            </div>
            ${isDraw ? '<div style="font-size:11px;color:var(--accent);font-weight:700;">⚖️ Ничья = 0.5 очка</div>' : ''}
            ${canVote ? '<div class="shiki-vote-hint">👆 Выбери победителя</div>' : ''}
            ${!canVote && !isFinished ? '<div class="shiki-voted-mark">✓ Проголосовано</div>' : ''}
            ${isFinished ? '<div class="shiki-voted-mark">🏁 Завершён</div>' : ''}
          </div>

          <!-- Player 2 -->
          <div class="shiki-player ${p2Win ? 'winner' : ''} ${!p2Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 2, this)"` : ''}>
            <div class="shiki-player-img">
              ${p2Image ? `<img src="${escapeHTML(p2Image)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${escapeHTML(p2.name)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p2.score?.points !== undefined ? p2.score.points : (p2.score_points || 0)} очков</span>
                <span class="shiki-wl">${p2.score?.wins !== undefined ? p2.score.wins : (p2.score_wins || 0)}W / ${p2.score?.losses !== undefined ? p2.score.losses : (p2.score_losses || 0)}L</span>
              </div>
            </div>
            ${p2Win ? '<div class="shiki-crown">👑</div>' : ''}
          </div>
        </div>
      </div>`;
  }

  // ========== STANDINGS TABLE ==========
  function renderStandings(players) {
    if (!players || !players.length) return '';
    return `
      <div class="shiki-standings">
        <h3 class="shiki-section-title">📊 Турнирная таблица</h3>
        <p style="color:var(--text-3);font-size:12px;margin-bottom:16px;">
          Сортировка: Очки → Коэффициент Бухгольца → Победы
        </p>
        <table class="shiki-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Участник</th>
              <th>Очки</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th title="Сумма очков соперников">Buchholz ⓘ</th>
            </tr>
          </thead>
          <tbody>
            ${players.map((p, i) => {
              const score = p.score || {};
              const points = score.points !== undefined ? score.points : (p.score_points || 0);
              const wins = score.wins !== undefined ? score.wins : (p.score_wins || 0);
              const losses = score.losses !== undefined ? score.losses : (p.score_losses || 0);
              const draws = score.draws !== undefined ? score.draws : (p.score_draws || 0);
              const buchholz = score.buchholz !== undefined ? score.buchholz : (p.score_buchholz || 0);
              const isTop3 = i < 3;
              return `
              <tr class="${isTop3 ? 'top-' + (i+1) : ''}">
                <td class="shiki-rank">${i + 1}</td>
                <td class="shiki-name">
                  <div class="shiki-avatar-small">
                    ${p.image_url || p.image ? `<img src="${escapeHTML(p.image_url || p.image)}" onerror="this.style.display='none'">` : '👤'}
                  </div>
                  ${escapeHTML(p.name)}
                </td>
                <td class="shiki-pts">${points}</td>
                <td class="shiki-w">${wins}</td>
                <td class="shiki-l">${losses}</td>
                <td style="color:var(--accent);font-weight:700;">${draws}</td>
                <td style="color:var(--text-2);font-weight:600;font-family:monospace;">${buchholz}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ========== ROUND HEADER ==========
  function renderRoundHeader(round, idx, totalRounds, tournament) {
    const isActive = idx === (tournament.current_round || tournament.currentRound || 0) && tournament.status === 'active';
    const isCurrent = idx === (tournament.current_round || tournament.currentRound || 0);
    const dateStr = round.startedAt ? new Date(round.startedAt).toLocaleDateString('ru-RU') : '';

    return `
      <div class="shiki-round-header ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}">
        <div class="shiki-round-num">Раунд ${idx + 1} / ${totalRounds}</div>
        <div class="shiki-round-name">${escapeHTML(round.name || `Раунд ${idx + 1}`)}</div>
        ${dateStr ? `<div class="shiki-round-date">${dateStr}</div>` : ''}
        ${isActive ? '<div class="shiki-round-status">🔥 Активен</div>' : ''}
        ${!isActive && isCurrent && tournament.status !== 'active' ? '<div class="shiki-round-status wait">⏳ Ожидает</div>' : ''}
      </div>`;
  }

  async function castVote(matchId, playerIndex, el) {
    if (el) {
      el.style.transform = 'scale(0.97)';
      setTimeout(() => el.style.transform = '', 150);
    }

    try {
      if (window.TH && window.TH.castVote) {
        await window.TH.castVote(matchId, playerIndex);
        toast('✅ Голос засчитан!');
      } else {
        const db = window.DB ? window.DB.getDB() : { tournaments: [] };
        for (const t of (db.tournaments || [])) {
          if (t.rounds) {
            for (const r of t.rounds) {
              const m = (r.matches || []).find(x => x.id === matchId);
              if (m) {
                if (playerIndex === 1) m.votes1 = (m.votes1 || 0) + 1;
                else m.votes2 = (m.votes2 || 0) + 1;
                if (window.DB) window.DB.saveDB(db);
                break;
              }
            }
          }
        }
        localStorage.setItem('th_voted_match_' + matchId, 'true');
        toast('✅ Голос засчитан (локально)');
      }

      if (currentTournamentId) {
        const container = document.getElementById("bracket-container");
        if (container) await renderBracket(currentTournamentId, container);
      }
    } catch (e) {
      toast('❌ ' + (e.message || 'Ошибка голосования'));
    }
  }

  function subscribeToTournamentUpdates(tournamentId, container) {
    if (realtimeSubscribed || !window.TH || !window.TH.subscribeToMatches) return;
    realtimeSubscribed = true;
    window.TH.subscribeToMatches(tournamentId, async () => {
      const t = await loadTournament(tournamentId);
      if (t) await renderBracket(t, container);
    });
  }

  async function renderBracket(tournamentOrId, container) {
    if (isRendering) return;
    isRendering = true;

    if (!container) { isRendering = false; return; }

    let tournament = null;
    if (typeof tournamentOrId === "string") {
      currentTournamentId = tournamentOrId;
      tournament = await loadTournament(tournamentOrId);
      subscribeToTournamentUpdates(tournamentOrId, container);
    } else {
      tournament = tournamentOrId;
      currentTournamentId = tournament.id;
    }

    if (!tournament) {
      container.innerHTML = `<div class="empty-state"><h3>Турнир не найден</h3><p>Проверьте ID в URL</p></div>`;
      isRendering = false;
      return;
    }

    // Header
    const header = document.getElementById('bracket-header');
    if (header) header.innerHTML = `<h1>🏆 ${escapeHTML(tournament.title || 'Турнир')}</h1>`;

    const sub = document.getElementById('bracket-sub');
    if (sub) {
      const statusMap = { draft: 'Черновик', active: 'Активен', finished: 'Завершён', archived: 'Архивирован' };
      const participants = tournament.players?.length || 0;
      const rounds = tournament.total_rounds || tournament.totalRounds || 10;
      sub.innerHTML = `<span class="shiki-status-badge ${tournament.status}">${statusMap[tournament.status] || tournament.status}</span> 
                       <span class="shiki-meta">${participants} участников · ${rounds} раундов · Швейцарская система</span>`;
    }

    const rounds = tournament.rounds || [];
    const totalRounds = tournament.total_rounds || tournament.totalRounds || rounds.length || 10;
    const activeRound = tournament.current_round || tournament.currentRound || 0;

    if (!rounds.length) {
      container.innerHTML = `<div class="empty-state"><h3>Турнир ещё не запущен</h3><p>Администратор должен запустить первый раунд</p></div>`;
      isRendering = false;
      return;
    }

    // Build rounds HTML
    let roundsHtml = '';
    for (let idx = 0; idx < rounds.length; idx++) {
      const round = rounds[idx];
      const isRoundActive = idx === activeRound && tournament.status === 'active';

      const matchesHtml = [];
      for (const m of (round.matches || [])) {
        matchesHtml.push(await renderMatch(m, isRoundActive, tournament.status));
      }

      roundsHtml += `
        <div class="shiki-round ${isRoundActive ? 'active' : ''} ${idx < activeRound ? 'past' : ''} ${idx > activeRound ? 'future' : ''}">
          ${renderRoundHeader(round, idx, totalRounds, tournament)}
          <div class="shiki-matches">
            ${matchesHtml.join('') || '<p class="shiki-no-matches">Нет матчей в этом раунде</p>'}
          </div>
        </div>`;
    }

    // Standings
    const standingsHtml = renderStandings(tournament.standings || tournament.players || []);

    // Champion
    let championHtml = '';
    if (tournament.status === 'finished' && tournament.winner) {
      const w = tournament.winner;
      const wImage = w.image_url || w.image || '';
      const wScore = w.score || {};
      championHtml = `
        <div class="shiki-champion">
          <div class="shiki-champion-title">🏆 Победитель турнира</div>
          <div class="shiki-champion-card">
            <div class="shiki-champion-img">
              ${wImage ? `<img src="${escapeHTML(wImage)}" onerror="this.style.display='none'">` : '<div class="no-img">🏆</div>'}
            </div>
            <div class="shiki-champion-name">${escapeHTML(w.name || w.title || 'Победитель')}</div>
            <div class="shiki-champion-score">${wScore.points !== undefined ? wScore.points : (w.score_points || 0)} очков · ${wScore.wins !== undefined ? wScore.wins : (w.score_wins || 0)} побед · Buchholz: ${wScore.buchholz !== undefined ? wScore.buchholz : (w.score_buchholz || 0)}</div>
          </div>
        </div>`;
    }

    container.innerHTML = `
      <div class="shiki-container">
        ${standingsHtml}
        <div class="shiki-rounds">
          ${roundsHtml}
        </div>
        ${championHtml}
      </div>`;

    isRendering = false;
  }

  window.RenderBracket = { renderBracket, castVote };

  document.addEventListener("DOMContentLoaded", () => {
    let attempts = 0;
    const checkInit = setInterval(() => {
      if (window.TH && window.TH.isReady) {
        clearInterval(checkInit);
        const id = getUrlParam("id");
        if (id) renderBracket(id, document.getElementById("bracket-container"));
        else {
          const container = document.getElementById("bracket-container");
          if (container) container.innerHTML = `<div class="empty-state"><h3>Выберите турнир</h3><p><a href="index.html">← На главную</a></p></div>`;
        }
      }
      attempts++;
      if (attempts > 50) clearInterval(checkInit);
    }, 100);
  });
})();
