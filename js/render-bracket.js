/* ============================================================
   Tournament Hub Bracket Renderer (v8 — Group System + Shikimori)
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

  let realtimeSubscribed = false;
  let currentTournamentId = null;
  let isRendering = false;
  let currentGroupIndex = 0;
  let currentRoundIndex = 0;

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

  // ========== STANDINGS TABLE ==========
  function renderStandings(players, limit) {
    if (!players || !players.length) return '';
    const sorted = [...players].sort((a, b) => {
      const ptsA = (a.score?.points || 0);
      const ptsB = (b.score?.points || 0);
      if (ptsB !== ptsA) return ptsB - ptsA;
      const winsA = (a.score?.wins || 0);
      const winsB = (b.score?.wins || 0);
      if (winsB !== winsA) return winsB - winsA;
      return (a.score?.losses || 0) - (b.score?.losses || 0);
    });
    
    const displayLimit = Math.min(limit || 50, sorted.length);
    const displayPlayers = sorted.slice(0, displayLimit);

    return `
      <div class="shiki-standings">
        <h3 class="shiki-section-title">📊 Турнирная таблица <span style="color:var(--text-3);font-size:0.7em;">(Топ ${displayLimit})</span></h3>
        <table class="shiki-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Участник</th>
              <th>Очки</th>
              <th>W</th>
              <th>L</th>
            </tr>
          </thead>
          <tbody>
            ${displayPlayers.map((p, i) => `
              <tr class="${i < 3 ? 'top-' + (i+1) : ''}">
                <td class="shiki-rank">${i + 1}</td>
                <td class="shiki-name">
                  <div class="shiki-avatar-small">
                    ${p.image_url || p.image ? `<img src="${escapeHTML(p.image_url || p.image)}" onerror="this.style.display='none'">` : '👤'}
                  </div>
                  ${escapeHTML(p.name)}
                </td>
                <td class="shiki-pts">${p.score?.points || 0}</td>
                <td class="shiki-w">${p.score?.wins || 0}</td>
                <td class="shiki-l">${p.score?.losses || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${sorted.length > displayLimit ? `<p style="text-align:center;color:var(--text-3);font-size:12px;margin-top:12px;">...и ещё ${sorted.length - displayLimit} участников</p>` : ''}
      </div>`;
  }

  // ========== MATCH CARD ==========
  async function renderMatch(match, isRoundActive, tournamentStatus, groupIsOpen) {
    const p1 = match.player1 || { name: "???", image_url: '', score: { points: 0, wins: 0, losses: 0 } };
    const p2 = match.player2 || { name: "???", image_url: '', score: { points: 0, wins: 0, losses: 0 } };
    const votes1 = match.votes1 || 0;
    const votes2 = match.votes2 || 0;
    const total = votes1 + votes2;
    const pct1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
    const pct2 = total > 0 ? Math.round((votes2 / total) * 100) : 50;
    const isFinished = match.finished || match.status === 'done';
    const wId = match.winner_id || (match.winner ? match.winner.id : null);
    const p1Win = isFinished && wId && p1.id === wId;
    const p2Win = isFinished && wId && p2.id === wId;

    let canVote = false;
    if (isRoundActive && !isFinished && tournamentStatus === 'active' && groupIsOpen) {
      if (window.TH && window.TH.hasVoted) {
        try { canVote = !(await window.TH.hasVoted(match.id)); } catch (e) { canVote = true; }
      } else {
        canVote = !localStorage.getItem('th_voted_match_' + match.id);
      }
    }

    const p1Image = p1.image_url || p1.image || '';
    const p2Image = p2.image_url || p2.image || '';

    return `
      <div class="shiki-match ${isFinished ? 'finished' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        <div class="shiki-match-inner">
          <div class="shiki-player ${p1Win ? 'winner' : ''} ${!p1Win && isFinished ? 'loser' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 1, this)"` : ''}
               style="cursor:${canVote ? 'pointer' : 'default'}">
            <div class="shiki-player-img">
              ${p1Image ? `<img src="${escapeHTML(p1Image)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : '<div class="no-img">❓</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${escapeHTML(p1.name)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p1.score?.points || 0}pts</span>
                <span class="shiki-wl">${p1.score?.wins || 0}W/${p1.score?.losses || 0}L</span>
              </div>
            </div>
            ${p1Win ? '<div class="shiki-crown">👑</div>' : ''}
          </div>

          <div class="shiki-center">
            <div class="shiki-vs">VS</div>
            <div class="shiki-vote-count">${votes1} — ${votes2</div>
            <div class="shiki-vote-bar">
              <div class="shiki-bar-left" style="width:${pct1}%"></div>
              <div class="shiki-bar-right" style="width:${pct2}%"></div>
            </div>
            ${canVote ? '<div class="shiki-vote-hint">👆 Выбери победителя</div>' : ''}
            ${!canVote && !isFinished ? '<div class="shiki-voted-mark">✓ Проголосовано</div>' : ''}
            ${isFinished ? '<div class="shiki-voted-mark">🏁 Завершён</div>' : ''}
          </div>

          <div class="shiki-player ${p2Win ? 'winner' : ''} ${!p2Win && isFinished ? 'loser' : ''}" 
               ${canVote ? `onclick="RenderBracket.castVote('${match.id}', 2, this)"` : ''}
               style="cursor:${canVote ? 'pointer' : 'default'}">
            <div class="shiki-player-img">
              ${p2Image ? `<img src="${escapeHTML(p2Image)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : '<div class="no-img">❓</div>'}
              <div class="shiki-player-overlay"></div>
            </div>
            <div class="shiki-player-info">
              <div class="shiki-player-name">${escapeHTML(p2.name)}</div>
              <div class="shiki-player-stats">
                <span class="shiki-points">${p2.score?.points || 0}pts</span>
                <span class="shiki-wl">${p2.score?.wins || 0}W/${p2.score?.losses || 0}L</span>
              </div>
            </div>
            ${p2Win ? '<div class="shiki-crown">👑</div>' : ''}
          </div>
        </div>
      </div>`;
  }

  // ========== GROUP TABS ==========
  function renderGroupTabs(round, groupCount, activeGroupIndex) {
    if (!groupCount || groupCount <= 1) return '';
    
    const tabs = [];
    for (let i = 0; i < groupCount; i++) {
      const isActive = i === activeGroupIndex;
      const isLocked = i > activeGroupIndex && round.isActive;
      tabs.push(`
        <button class="group-tab ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}" 
                onclick="${isLocked ? '' : `RenderBracket.switchGroup(${i})`}">
          Группа ${String.fromCharCode(65 + i)} ${isActive ? '🔥' : ''}
        </button>
      `);
    }
    
    return `<div class="group-tabs">${tabs.join('')}</div>`;
  }

  // ========== ROUND NAVIGATION ==========
  function renderRoundNav(rounds, currentRoundIdx, totalRounds) {
    const hasPrev = currentRoundIdx > 0;
    const hasNext = currentRoundIdx < (rounds.length - 1);
    
    const round = rounds[currentRoundIdx];
    const statusText = round.isActive ? '🔥 Активен' : (currentRoundIdx < (rounds.length - 1) ? '✓ Завершён' : '⏳ Ожидает');
    
    return `
      <div class="round-nav">
        <button class="round-nav-btn" ${!hasPrev ? 'disabled' : ''} onclick="RenderBracket.prevRound()">←</button>
        <div class="round-nav-info">
          <h3>Раунд ${currentRoundIdx + 1} / ${totalRounds}</h3>
          <span>${escapeHTML(round.name || `Раунд ${currentRoundIdx + 1}`)} · ${statusText}</span>
        </div>
        <button class="round-nav-btn" ${!hasNext ? 'disabled' : ''} onclick="RenderBracket.nextRound()">→</button>
      </div>
    `;
  }

  // ========== BREAK SCREEN ==========
  function renderBreakScreen(tournament, nextRoundStartTime) {
    const now = new Date();
    const nextStart = nextRoundStartTime ? new Date(nextRoundStartTime) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const diff = nextStart - now;
    
    let countdownText = '';
    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      countdownText = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    } else {
      countdownText = '00:00:00';
    }

    return `
      <div class="break-screen">
        <div class="break-title">⏳ Перерыв между раундами</div>
        <div class="break-subtitle">Формируются новые группы на основе результатов...</div>
        <div class="break-countdown" id="break-countdown">${countdownText}</div>
        <div class="break-hint">Следующий раунд начнётся автоматически</div>
      </div>
    `;
  }

  // ========== MATCH CAROUSEL ==========
  function renderMatchCarousel(matches, isRoundActive, tournamentStatus, groupIsOpen) {
    if (!matches || !matches.length) {
      return '<p class="shiki-no-matches">Нет матчей в этой группе</p>';
    }

    // Split matches into slides of 3
    const slides = [];
    for (let i = 0; i < matches.length; i += 3) {
      slides.push(matches.slice(i, i + 3));
    }

    const slidesHtml = slides.map((slide, idx) => `
      <div class="match-carousel-slide" data-slide="${idx}">
        ${slide.map(m => renderMatch(m, isRoundActive, tournamentStatus, groupIsOpen)).join('')}
      </div>
    `).join('');

    const dotsHtml = slides.map((_, idx) => `
      <div class="carousel-dot ${idx === 0 ? 'active' : ''}" onclick="RenderBracket.goToSlide(${idx})"></div>
    `).join('');

    return `
      <div class="match-carousel">
        <div class="match-carousel-track" id="carousel-track">
          ${slidesHtml}
        </div>
        <div class="carousel-dots">
          ${dotsHtml}
        </div>
      </div>
    `;
  }

  // ========== VOTE ==========
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

  // ========== NAVIGATION ==========
  function switchGroup(index) {
    currentGroupIndex = index;
    if (currentTournamentId) {
      const container = document.getElementById("bracket-container");
      if (container) renderBracket(currentTournamentId, container);
    }
  }

  function prevRound() {
    if (currentRoundIndex > 0) {
      currentRoundIndex--;
      currentGroupIndex = 0;
      const container = document.getElementById("bracket-container");
      if (container && currentTournamentId) renderBracket(currentTournamentId, container);
    }
  }

  function nextRound() {
    const tournament = window._cachedTournament;
    if (tournament && currentRoundIndex < (tournament.rounds || []).length - 1) {
      currentRoundIndex++;
      currentGroupIndex = 0;
      const container = document.getElementById("bracket-container");
      if (container && currentTournamentId) renderBracket(currentTournamentId, container);
    }
  }

  function goToSlide(index) {
    const track = document.getElementById('carousel-track');
    const dots = document.querySelectorAll('.carousel-dot');
    if (track) {
      track.style.transform = `translateX(-${index * 100}%)`;
    }
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
  }

  // ========== MAIN RENDER ==========
  async function renderBracket(tournamentOrId, container) {
    if (isRendering) return;
    isRendering = true;

    if (!container) { isRendering = false; return; }

    let tournament = null;
    if (typeof tournamentOrId === "string") {
      currentTournamentId = tournamentOrId;
      tournament = await loadTournament(tournamentOrId);
    } else {
      tournament = tournamentOrId;
      currentTournamentId = tournament.id;
    }
    
    window._cachedTournament = tournament;

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
      const groupCount = tournament.group_count || tournament.use_groups ? 2 : 1;
      sub.innerHTML = `<span class="shiki-status-badge ${tournament.status}">${statusMap[tournament.status] || tournament.status}</span> 
                       <span class="shiki-meta">${participants} участников · ${groupCount} групп · ${rounds} раундов · Групповая система</span>`;
    }

    const rounds = tournament.rounds || [];
    const totalRounds = tournament.total_rounds || tournament.totalRounds || rounds.length || 10;
    const activeRound = tournament.current_round || tournament.currentRound || 0;
    const groupCount = tournament.group_count || (tournament.use_groups ? 2 : 1);

    if (!rounds.length) {
      container.innerHTML = `<div class="empty-state"><h3>Турнир ещё не запущен</h3><p>Администратор должен запустить первый раунд</p></div>`;
      isRendering = false;
      return;
    }

    // Ensure currentRoundIndex is valid
    if (currentRoundIndex >= rounds.length) currentRoundIndex = rounds.length - 1;
    if (currentRoundIndex < 0) currentRoundIndex = 0;

    const round = rounds[currentRoundIndex];
    const isRoundActive = currentRoundIndex === activeRound && tournament.status === 'active';
    const isBreak = tournament.status === 'active' && currentRoundIndex === activeRound && round.isBreak;
    
    // Build standings
    const standingsHtml = renderStandings(tournament.standings || tournament.players || [], 50);

    // Round navigation
    const roundNavHtml = renderRoundNav(rounds, currentRoundIndex, totalRounds);

    let contentHtml = '';

    if (isBreak) {
      // Show break screen
      const nextRoundStart = round.breakEndsAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      contentHtml = renderBreakScreen(tournament, nextRoundStart);
    } else {
      // Group the matches
      const matchesByGroup = {};
      (round.matches || []).forEach(m => {
        const gNum = m.group_number || 0;
        if (!matchesByGroup[gNum]) matchesByGroup[gNum] = [];
        matchesByGroup[gNum].push(m);
      });

      // Ensure currentGroupIndex is valid
      const availableGroups = Object.keys(matchesByGroup).map(Number).sort((a, b) => a - b);
      if (!availableGroups.includes(currentGroupIndex)) {
        currentGroupIndex = availableGroups[0] || 0;
      }

      // Determine which groups are open based on day
      const roundStart = round.startedAt ? new Date(round.startedAt) : new Date();
      const now = new Date();
      const dayDiff = Math.floor((now - roundStart) / (1000 * 60 * 60 * 24));
      
      const groupTabsHtml = renderGroupTabs(round, groupCount, currentGroupIndex);
      
      // Build group content
      let groupsHtml = '';
      
      for (let g = 0; g < groupCount; g++) {
        const groupMatches = matchesByGroup[g] || [];
        const isGroupOpen = g <= dayDiff || !isRoundActive;
        
        if (g === currentGroupIndex) {
          const carouselHtml = await Promise.all(groupMatches.map(m => renderMatch(m, isRoundActive, tournament.status, isGroupOpen)));
          groupsHtml = carouselHtml.join('');
        }
      }

      contentHtml = `
        ${groupTabsHtml}
        <div class="shiki-matches">
          ${groupsHtml || '<p class="shiki-no-matches">Нет матчей в этой группе</p>'}
        </div>
      `;
    }

    // Champion (if finished)
    let championHtml = '';
    if (tournament.status === 'finished' && tournament.winner) {
      const w = tournament.winner;
      const wImage = w.image_url || w.image || '';
      championHtml = `
        <div class="shiki-champion">
          <div class="shiki-champion-title">🏆 Победитель турнира</div>
          <div class="shiki-champion-card">
            <div class="shiki-champion-img">
              ${wImage ? `<img src="${escapeHTML(wImage)}" onerror="this.style.display='none'">` : '<div style="font-size:4em;">🏆</div>'}
            </div>
            <div class="shiki-champion-name">${escapeHTML(w.name || w.title || 'Победитель')}</div>
            <div class="shiki-champion-score">${w.score?.points || 0} очков · ${w.score?.wins || 0} побед · ${w.score?.losses || 0} поражений</div>
          </div>
        </div>`;
    }

    // Top 10 summary (if finished)
    let top10Html = '';
    if (tournament.status === 'finished') {
      const sorted = [...(tournament.players || [])].sort((a, b) => {
        const ptsB = (b.score?.points || 0);
        const ptsA = (a.score?.points || 0);
        if (ptsB !== ptsA) return ptsB - ptsA;
        return (b.score?.wins || 0) - (a.score?.wins || 0);
      });
      const top10 = sorted.slice(0, 10);
      
      top10Html = `
        <div class="shiki-standings" style="margin-top:32px;">
          <h3 class="shiki-section-title">🏅 Итоговый топ-10</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${top10.map((p, i) => `
              <div style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:var(--bg);border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:20px;font-weight:800;color:${i < 3 ? 'var(--accent)' : 'var(--text-3)'};width:36px;">${i + 1}</div>
                <div class="shiki-avatar-small" style="width:40px;height:40px;">
                  ${p.image_url || p.image ? `<img src="${escapeHTML(p.image_url || p.image)}">` : '👤'}
                </div>
                <div style="flex:1;">
                  <div style="font-weight:700;">${escapeHTML(p.name)}</div>
                  <div style="font-size:12px;color:var(--text-3);">${p.score?.wins || 0}W · ${p.score?.losses || 0}L · ${p.score?.points || 0}pts</div>
                </div>
                ${i === 0 ? '<div style="font-size:24px;">👑</div>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="shiki-container">
        ${standingsHtml}
        ${roundNavHtml}
        ${contentHtml}
        ${championHtml}
        ${top10Html}
      </div>
    `;

    // Start countdown if break
    if (isBreak) {
      startBreakCountdown();
    }

    isRendering = false;
  }

  function startBreakCountdown() {
    const el = document.getElementById('break-countdown');
    if (!el) return;
    
    const update = () => {
      const text = el.textContent;
      const parts = text.split(':').map(Number);
      let total = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (total <= 0) {
        el.textContent = '00:00:00';
        // Auto-refresh when countdown ends
        setTimeout(() => {
          if (currentTournamentId) {
            const container = document.getElementById("bracket-container");
            if (container) renderBracket(currentTournamentId, container);
          }
        }, 2000);
        return;
      }
      total--;
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };
    
    setInterval(update, 1000);
  }

  function subscribeToTournamentUpdates(tournamentId, container) {
    if (realtimeSubscribed || !window.TH || !window.TH.subscribeToMatches) return;
    realtimeSubscribed = true;
    window.TH.subscribeToMatches(tournamentId, async () => {
      const t = await loadTournament(tournamentId);
      if (t) await renderBracket(t, container);
    });
  }

  window.RenderBracket = { 
    renderBracket, castVote, switchGroup, prevRound, nextRound, goToSlide 
  };

  document.addEventListener("DOMContentLoaded", () => {
    let attempts = 0;
    const checkInit = setInterval(() => {
      if (window.TH && window.TH.isReady) {
        clearInterval(checkInit);
        const id = getUrlParam("id");
        if (id) {
          renderBracket(id, document.getElementById("bracket-container"));
          subscribeToTournamentUpdates(id, document.getElementById("bracket-container"));
        } else {
          const container = document.getElementById("bracket-container");
          if (container) container.innerHTML = `<div class="empty-state"><h3>Выберите турнир</h3><p><a href="index.html">← На главную</a></p></div>`;
        }
      }
      attempts++;
      if (attempts > 50) clearInterval(checkInit);
    }, 100);
  });
})();
