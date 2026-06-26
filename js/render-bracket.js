/* ============================================================
   Tournament Hub Bracket Renderer (v11 — Fixed Group Voting)
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

  let realtimeSubscribed = false;
  let currentTournamentId = null;
  let isRendering = false;
  let groupStatusMap = {}; // ✅ FIX: Кэш статусов групп

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

  function renderPlayerName(player, isWinner) {
    if (!player) return '<span style="color:var(--text-3);">???</span>';
    const name = escapeHTML(player.name || '???');
    const articleUrl = player.article_url || '';
    if (articleUrl) {
      return `<a href="${escapeHTML(articleUrl)}" target="_blank" class="shiki-player-name-link" style="color:${isWinner ? 'var(--green)' : 'var(--text)'};text-decoration:none;font-weight:700;" onclick="event.stopPropagation();">${name} 🔗</a>`;
    }
    return `<span style="font-weight:700;">${name}</span>`;
  }

  function renderPlayerImage(player) {
    const imageUrl = player?.image_url || player?.image || '';
    if (imageUrl) {
      return `<img src="${escapeHTML(imageUrl)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img');this.parentElement.innerHTML='👤'">`;
    }
    return '';
  }

  async function autoFetchMissingImages(players) {
    if (!window.FandomAPI) return;
    for (const p of players) {
      if (p && !p.image_url && p.article_url && window.FandomAPI.isFandomUrl(p.article_url)) {
        const img = await window.FandomAPI.fetchImageFromUrl(p.article_url);
        if (img) {
          p.image_url = img;
          const imgEl = document.querySelector(`[data-player-id="${p.id}"] .shiki-player-img img`);
          if (imgEl) imgEl.src = img;
        }
      }
    }
  }

  // ✅ FIX: Проверка canVote с учётом статуса группы
  async function canVoteForMatch(match, groupStatus, tournamentStatus) {
    const isFinished = match.finished || match.status === 'done';
    const isBye = match.isBye || (!match.player2_id && match.player1_id);
    
    // ✅ FIX: Группа должна быть открыта (open или voting)
    const isGroupOpen = groupStatus === 'open' || groupStatus === 'voting';
    
    if (!isGroupOpen || isFinished || tournamentStatus !== 'active' || isBye) {
      return false;
    }
    
    // Проверяем голосовал ли пользователь
    if (window.TH && window.TH.hasVoted) {
      try { return !(await window.TH.hasVoted(match.id)); } catch (e) { return true; }
    } else {
      return !localStorage.getItem('th_voted_match_' + match.id);
    }
  }

  async function renderMatch(match, groupStatus, tournamentStatus) {
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

    // ✅ FIX: Используем groupStatus из параметра
    const canVote = await canVoteForMatch(match, groupStatus, tournamentStatus);

    if (isBye) {
      return `
      <div class="shiki-match bye-match" id="match-${match.id}">
        <div class="shiki-bye-label">BYE — Тех. победа</div>
        <div class="shiki-match-inner">
          <div class="shiki-player winner">
            <div class="shiki-player-img">
              ${renderPlayerImage(p1) || '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${renderPlayerName(p1, p1Win)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p1.score?.points !== undefined ? p1.score.points : (p1.score_points || 0)} очков</span>
                <span class="shiki-wl">${p1.score?.wins !== undefined ? p1.score.wins : (p1.score_wins || 0)}W / ${p1.score?.losses !== undefined ? p1.score.losses : (p1.score_losses || 0)}L</span>
              </div>
            </div>
            <div class="shiki-crown">👑</div>
          </div>
          <div class="shiki-center">
            <div class="shiki-vs">BYE</div>
            <div style="font-size:28px;margin:8px 0;">✅</div>
            <div style="font-size:11px;color:var(--green);font-weight:700;">Авто-победа (+1 очко)</div>
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

    return `
      <div class="shiki-match ${isFinished ? 'finished' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        ${isDraw ? '<div class="shiki-draw-badge">⚖️ НИЧЬЯ</div>' : ''}
        <div class="shiki-match-inner">
          <div data-player-id="${p1?.id || ''}" class="shiki-player ${p1Win ? 'winner' : ''} ${!p1Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 1, this)"` : ''}>
            <div class="shiki-player-img">
              ${renderPlayerImage(p1) || '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${renderPlayerName(p1, p1Win)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p1.score?.points !== undefined ? p1.score.points : (p1.score_points || 0)} очков</span>
                <span class="shiki-wl">${p1.score?.wins !== undefined ? p1.score.wins : (p1.score_wins || 0)}W / ${p1.score?.losses !== undefined ? p1.score.losses : (p1.score_losses || 0)}L</span>
              </div>
            </div>
            ${p1Win ? '<div class="shiki-crown">👑</div>' : ''}
          </div>

          <div class="shiki-center">
            <div class="shiki-vs">VS</div>
            <div class="shiki-vote-count">${votes1} — ${votes2}</div>
            <div class="shiki-vote-bar">
              <div class="shiki-bar-left" style="width:${pct1}%"></div>
              <div class="shiki-bar-right" style="width:${pct2}%"></div>
            </div>
            ${isDraw ? '<div style="font-size:11px;color:var(--accent);font-weight:700;">⚖️ Ничья = 0.5 очка</div>' : ''}
            ${canVote ? '<div class="shiki-vote-hint">👆 Нажми, чтобы проголосовать</div>' : ''}
            ${!canVote && !isFinished ? '<div class="shiki-voted-mark">✅ Вы проголосовали</div>' : ''}
            ${isFinished ? '<div class="shiki-voted-mark">🏁 Матч завершён</div>' : ''}
          </div>

          <div data-player-id="${p2?.id || ''}" class="shiki-player ${p2Win ? 'winner' : ''} ${!p2Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 2, this)"` : ''}>
            <div class="shiki-player-img">
              ${renderPlayerImage(p2) || '<div class="shiki-player-img no-img">👤</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${renderPlayerName(p2, p2Win)}</div>
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
                  ${renderPlayerName(p, false)}
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

  function renderGroupHeader(group, roundIdx, totalRounds) {
    const isOpen = group.status === 'open' || group.status === 'voting';
    const isClosed = group.status === 'closed';
    const isPending = group.status === 'pending';

    let statusBadge = '';
    if (isOpen) statusBadge = '<span style="background:rgba(52,211,153,0.15);color:var(--green);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">🔥 Открыта</span>';
    else if (isClosed) statusBadge = '<span style="background:rgba(96,165,250,0.15);color:var(--blue);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">✓ Закрыта</span>';
    else statusBadge = '<span style="background:var(--bg-4);color:var(--text-3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">⏳ Ожидает</span>';

    const dateStr = group.opened_at ? new Date(group.opened_at).toLocaleDateString('ru-RU') : '';

    return `
      <div class="shiki-round-header ${isOpen ? 'active' : ''}" style="margin-bottom:12px;">
        <div class="shiki-round-num">Раунд ${roundIdx + 1}</div>
        <div class="shiki-round-name">${escapeHTML(group.name || 'Группа')}</div>
        ${dateStr ? `<div class="shiki-round-date">${dateStr}</div>` : ''}
        ${statusBadge}
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
      const groupsInfo = `${tournament.groups_per_round || 1}гр × ${tournament.players_per_group || participants}уч`;
      sub.innerHTML = `<span class="shiki-status-badge ${tournament.status}">${statusMap[tournament.status] || tournament.status}</span> 
                       <span class="shiki-meta">${participants} участников · ${rounds} раундов · ${groupsInfo} · Швейцарская система</span>`;
    }

    // Загружаем группы и матчи из Supabase
    let rounds = [];
    let groups = [];
    let matches = [];

    if (window.TH && window.TH.getClient) {
      try {
        const client = window.TH.getClient();
        const { data: roundsData } = await client.from('rounds').select('*').eq('tournament_id', tournament.id).order('round_number', { ascending: true });
        rounds = roundsData || [];
        
        const { data: groupsData } = await client.from('groups').select('*').eq('tournament_id', tournament.id).order('match_order_start', { ascending: true });
        groups = groupsData || [];
        
        const { data: matchesData } = await client.from('matches').select('*').eq('tournament_id', tournament.id);
        
        // Подгружаем игроков отдельно если нужно
        if (matchesData && matchesData.length > 0 && !matchesData[0].player1) {
          const { data: allPlayers } = await client.from('players').select('*').eq('tournament_id', tournament.id);
          const playerMap = {};
          (allPlayers || []).forEach(p => { playerMap[p.id] = p; });
          
          matches = matchesData.map(m => ({
            ...m,
            player1: m.player1_id ? playerMap[m.player1_id] : null,
            player2: m.player2_id ? playerMap[m.player2_id] : null
          }));
        } else {
          matches = matchesData || [];
        }
      } catch (e) { 
        console.warn('Failed to load from Supabase:', e);
      }
    }

    // Fallback
    if (!rounds.length && tournament.rounds) rounds = tournament.rounds;
    if (!matches.length && tournament.rounds) {
      matches = [];
      for (const r of tournament.rounds) {
        for (const m of (r.matches || [])) {
          matches.push({ ...m, round_id: r.id, player1: m.player1, player2: m.player2 });
        }
      }
    }
    if (!groups.length && tournament.groups) groups = tournament.groups;

    // ✅ FIX: Строим мапу статусов групп
    groupStatusMap = {};
    groups.forEach(g => { groupStatusMap[g.id] = g.status; });

    if (!rounds.length) {
      container.innerHTML = `<div class="empty-state"><h3>Турнир ещё не запущен</h3><p>Администратор должен запустить первый раунд</p></div>`;
      isRendering = false;
      return;
    }

    // Build rounds HTML
    let roundsHtml = '';
    const roundsToRender = rounds.length ? rounds : (tournament.rounds || []);

    for (let idx = 0; idx < roundsToRender.length; idx++) {
      const round = roundsToRender[idx];
      const roundGroups = groups.filter(g => g.round_id === round.id);
      const isRoundActive = idx === (tournament.current_round || tournament.currentRound || 0) && tournament.status === 'active';

      if (roundGroups.length === 0) {
        // Fallback: без групп
        const roundMatches = matches.filter(m => m.round_id === round.id);
        const matchesHtml = [];
        for (const m of roundMatches) {
          matchesHtml.push(await renderMatch(m, 'open', tournament.status));
        }

        roundsHtml += `
          <div class="shiki-round ${isRoundActive ? 'active' : ''}">
            <div class="shiki-round-header ${isRoundActive ? 'active' : ''}">
              <div class="shiki-round-num">Раунд ${idx + 1}</div>
              <div class="shiki-round-name">${escapeHTML(round.name || `Раунд ${idx + 1}`)}</div>
            </div>
            <div class="shiki-matches">
              ${matchesHtml.join('') || '<p class="shiki-no-matches">Нет матчей</p>'}
            </div>
          </div>`;
      } else {
        // С группами
        let groupsHtml = '';
        for (const group of roundGroups) {
          const groupMatches = matches.filter(m => m.group_id === group.id);
          // ✅ FIX: Передаём реальный статус группы
          const groupStatus = group.status || 'pending';
          
          const matchesHtml = [];
          for (const m of groupMatches) {
            matchesHtml.push(await renderMatch(m, groupStatus, tournament.status));
          }

          groupsHtml += `
            <div style="margin-bottom:32px;">
              ${renderGroupHeader(group, idx, tournament.total_rounds || 10)}
              <div class="shiki-matches">
                ${matchesHtml.join('') || '<p class="shiki-no-matches">Нет матчей в этой группе</p>'}
              </div>
            </div>`;
        }

        roundsHtml += `
          <div class="shiki-round ${isRoundActive ? 'active' : ''}">
            <div class="shiki-round-header ${isRoundActive ? 'active' : ''}" style="margin-bottom:20px;">
              <div class="shiki-round-num">Раунд ${idx + 1} / ${tournament.total_rounds || 10}</div>
              <div class="shiki-round-name">${escapeHTML(round.name || `Раунд ${idx + 1}`)}</div>
              ${isRoundActive ? '<div class="shiki-round-status">🔥 Активен</div>' : ''}
            </div>
            ${groupsHtml}
          </div>`;
      }
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
            <div class="shiki-champion-score">${wScore.points !== undefined ? wScore.points : (wScore.score_points || 0)} очков · ${wScore.wins !== undefined ? wScore.wins : (wScore.score_wins || 0)} побед · Buchholz: ${wScore.buchholz !== undefined ? wScore.buchholz : (wScore.score_buchholz || 0)}</div>
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

    if (tournament.players) autoFetchMissingImages(tournament.players);
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
