/* ============================================================
   SHIKIMORI BRACKET RENDERER – Swiss System + Groups + Carousel
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }
  let currentTournamentId = null;
  let isRendering = false;
  let carouselState = {};

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

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

  // ===== STANDINGS TABLE =====
  function renderStandings(players) {
    if (!players || !players.length) return '';
    const sorted = [...players].sort((a, b) => {
      const ptsA = (a.score?.points || 0);
      const ptsB = (b.score?.points || 0);
      if (ptsB !== ptsA) return ptsB - ptsA;
      return (b.score?.wins || 0) - (a.score?.wins || 0);
    });
    const top = sorted.slice(0, 50);
    return `
      <div class="shiki-standings">
        <div class="shiki-standings-header">
          <h3>📊 Турнирная таблица <span class="standings-hint">(W = победы, L = поражения)</span></h3>
          <span style="font-size:12px;color:var(--text-3);">${sorted.length} участников</span>
        </div>
        <table class="shiki-table">
          <thead><tr>
            <th>#</th>
            <th>Участник</th>
            <th>Очки</th>
            <th>W</th>
            <th>L</th>
            <th>±</th>
          </tr></thead>
          <tbody>
            ${top.map((p, i) => {
              const diff = (p.score?.wins || 0) - (p.score?.losses || 0);
              return `<tr class="${i < 3 ? 'top-' + (i+1) : ''}">
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
                <td class="shiki-diff">${diff > 0 ? '+' + diff : diff}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ===== MATCH CARD =====
  function renderMatchCard(match, isOpen, tournamentStatus) {
    const p1 = match.player1 || { name: "???", image_url: '' };
    const p2 = match.player2 || { name: "???", image_url: '' };
    const v1 = match.votes1 || 0;
    const v2 = match.votes2 || 0;
    const total = v1 + v2;
    const pct1 = total > 0 ? Math.round((v1 / total) * 100) : 50;
    const pct2 = total > 0 ? Math.round((v2 / total) * 100) : 50;
    const isFinished = match.finished || match.status === 'done';
    const wId = match.winner_id || (match.winner ? match.winner.id : null);
    const p1Win = isFinished && wId && p1.id === wId;
    const p2Win = isFinished && wId && p2.id === wId;

    let canVote = false;
    if (isOpen && !isFinished && tournamentStatus === 'active') {
      const votedKey = 'th_voted_match_' + match.id;
      canVote = !localStorage.getItem(votedKey);
    }

    const p1Img = p1.image_url || p1.image || '';
    const p2Img = p2.image_url || p2.image || '';

    return `
      <div class="shiki-match ${isFinished ? 'finished' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        <div class="shiki-match-inner">
          <div class="shiki-match-players">
            <!-- Player 1 -->
            <div class="shiki-player ${p1Win ? 'winner' : ''} ${!p1Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}"
                 onclick="${canVote ? `RenderBracket.castVote('${match.id}', 1, this)` : ''}"
                 style="cursor:${canVote ? 'pointer' : 'default'}">
              <div class="player-avatar ${p1Win ? 'winner-avatar' : ''}">
                ${p1Img ? `<img src="${escapeHTML(p1Img)}" onerror="this.style.display='none'">` : '👤'}
              </div>
              <div class="player-name">${escapeHTML(p1.name)}</div>
              <div class="player-score">${p1.score?.points || 0} pts</div>
              <div class="player-votes">${v1}</div>
              ${p1Win ? '<div class="crown">👑</div>' : ''}
            </div>

            <!-- VS Center -->
            <div class="shiki-vs-center">
              <div class="shiki-vs-text">VS</div>
              <div class="shiki-vs-votes">${v1} — ${v2}</div>
              <div class="shiki-vs-bar">
                <div class="bar-left" style="width:${pct1}%"></div>
                <div class="bar-right" style="width:${pct2}%"></div>
              </div>
              ${canVote ? '<div class="shiki-vote-hint">👆 Выбери</div>' : ''}
              ${!canVote && !isFinished ? '<div class="shiki-voted-mark">✓ Проголосовано</div>' : ''}
              ${isFinished ? '<div style="font-size:11px;color:var(--text-3);margin-top:4px;">🏁 Завершён</div>' : ''}
            </div>

            <!-- Player 2 -->
            <div class="shiki-player ${p2Win ? 'winner' : ''} ${!p2Win && isFinished ? 'loser' : ''} ${canVote ? 'can-vote' : ''}"
                 onclick="${canVote ? `RenderBracket.castVote('${match.id}', 2, this)` : ''}"
                 style="cursor:${canVote ? 'pointer' : 'default'}">
              <div class="player-avatar ${p2Win ? 'winner-avatar' : ''}">
                ${p2Img ? `<img src="${escapeHTML(p2Img)}" onerror="this.style.display='none'">` : '👤'}
              </div>
              <div class="player-name">${escapeHTML(p2.name)}</div>
              <div class="player-score">${p2.score?.points || 0} pts</div>
              <div class="player-votes">${v2}</div>
              ${p2Win ? '<div class="crown">👑</div>' : ''}
            </div>
          </div>
        </div>
      </div>`;
  }

  // ===== CAROUSEL =====
  function renderCarousel(matches, isOpen, tournamentStatus, groupIdx) {
    if (!matches || !matches.length) return '<p class="shiki-no-matches">Нет матчей в этой группе</p>';

    const containerId = 'carousel-' + groupIdx;
    const matchCards = matches.map(m => renderMatchCard(m, isOpen, tournamentStatus));

    return `
      <div class="shiki-carousel-wrapper" id="wrapper-${groupIdx}">
        <div class="shiki-carousel-track" id="${containerId}" style="transform:translateX(0px);">
          ${matchCards.join('')}
        </div>
        <button class="shiki-carousel-btn prev" onclick="RenderBracket.carouselMove('${groupIdx}', -1)">‹</button>
        <button class="shiki-carousel-btn next" onclick="RenderBracket.carouselMove('${groupIdx}', 1)">›</button>
      </div>
    `;
  }

  function getVisibleCount(containerWidth) {
    if (containerWidth < 640) return 1;
    if (containerWidth < 1024) return 2;
    return 3;
  }

  window.RenderBracket = window.RenderBracket || {};

  window.RenderBracket.carouselMove = function(groupIdx, dir) {
    const track = document.getElementById('carousel-' + groupIdx);
    if (!track) return;
    const container = track.parentElement;
    const containerWidth = container.clientWidth;
    const visible = getVisibleCount(containerWidth);
    const total = track.children.length;
    const maxIndex = Math.max(0, total - visible);

    if (!carouselState[groupIdx]) carouselState[groupIdx] = 0;
    let current = carouselState[groupIdx];
    current = Math.max(0, Math.min(maxIndex, current + dir));
    carouselState[groupIdx] = current;

    const cardWidth = track.children[0]?.offsetWidth + 20 || 300;
    const offset = current * (cardWidth);
    track.style.transform = 'translateX(-' + offset + 'px)';

    // Update buttons
    const prevBtn = container.querySelector('.prev');
    const nextBtn = container.querySelector('.next');
    if (prevBtn) prevBtn.classList.toggle('hidden', current === 0);
    if (nextBtn) nextBtn.classList.toggle('hidden', current >= maxIndex);
  };

  window.RenderBracket.castVote = async function(matchId, playerIndex, el) {
    if (el) {
      el.style.transform = 'scale(0.95)';
      setTimeout(() => el.style.transform = '', 200);
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
  };

  // ===== MAIN RENDER =====
  async function renderBracket(tournamentOrId, container) {
    if (isRendering) return;
    isRendering = true;

    let tournament = null;
    if (typeof tournamentOrId === "string") {
      currentTournamentId = tournamentOrId;
      tournament = await loadTournament(tournamentOrId);
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
    const activeRoundIdx = tournament.current_round || tournament.currentRound || 0;

    if (!rounds.length) {
      container.innerHTML = `<div class="empty-state"><h3>Турнир ещё не запущен</h3><p>Администратор должен запустить первый раунд</p></div>`;
      isRendering = false;
      return;
    }

    // Standings
    const standingsHtml = renderStandings(tournament.standings || tournament.players || []);

    // Rounds
    let roundsHtml = '';
    for (let idx = 0; idx < rounds.length; idx++) {
      const round = rounds[idx];
      const isActive = idx === activeRoundIdx && tournament.status === 'active';
      const isPast = idx < activeRoundIdx;
      const isFuture = idx > activeRoundIdx;

      const groupCount = round.group_count || 1;
      const matches = round.matches || [];
      const groups = {};
      for (const m of matches) {
        const g = m.group_index || 0;
        if (!groups[g]) groups[g] = [];
        groups[g].push(m);
      }

      const groupKeys = Object.keys(groups).sort((a,b) => Number(a) - Number(b));
      const activeGroup = round.active_group_index || 0;

      // Group tabs
      let tabsHtml = '<div class="shiki-group-tabs">';
      for (let g = 0; g < groupCount; g++) {
        const isOpen = g <= activeGroup && isActive;
        const isLocked = g > activeGroup || !isActive;
        const matchCount = groups[g] ? groups[g].length : 0;
        tabsHtml += `<button class="shiki-group-tab ${g === activeGroup ? 'active' : ''} ${isLocked ? 'locked' : ''}"
                     onclick="RenderBracket.switchGroup('${idx}', ${g})" ${isLocked ? 'disabled' : ''}>
                     Группа ${g+1} <span class="group-vote-count">${matchCount} матчей</span>
                   </button>`;
      }
      tabsHtml += '</div>';

      // Carousel for active group
      const activeMatches = groups[activeGroup] || [];
      const isOpen = isActive && activeGroup < groupCount;

      const roundStatus = isActive ? 'active' : (isPast ? 'closed' : 'wait');
      const statusLabel = isActive ? '🔥 Активен' : (isPast ? '✓ Завершён' : '⏳ Ожидает');

      roundsHtml += `
        <div class="shiki-round ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}" id="round-${idx}">
          <div class="shiki-round-header ${isActive ? 'active' : ''}">
            <div class="shiki-round-num">Раунд ${idx+1} / ${totalRounds}</div>
            <div class="shiki-round-name">${escapeHTML(round.name || `Раунд ${idx+1}`)}</div>
            <div class="shiki-round-date">${round.startedAt ? new Date(round.startedAt).toLocaleDateString('ru-RU') : ''}</div>
            <div class="shiki-round-status ${roundStatus}">${statusLabel}</div>
            <div class="shiki-round-group-info">Групп: ${groupCount} · Активна: ${activeGroup+1}</div>
          </div>
          ${tabsHtml}
          <div id="group-container-${idx}">
            ${renderCarousel(activeMatches, isOpen, tournament.status, idx + '-' + activeGroup)}
          </div>
        </div>`;
    }

    // Champion
    let championHtml = '';
    if (tournament.status === 'finished' && tournament.winner) {
      const w = tournament.winner;
      const wImg = w.image_url || w.image || '';
      championHtml = `
        <div class="shiki-champion">
          <div class="shiki-champion-title">🏆 Победитель турнира</div>
          <div class="shiki-champion-card">
            <div class="shiki-champion-img">
              ${wImg ? `<img src="${escapeHTML(wImg)}" onerror="this.style.display='none'">` : '<div style="font-size:3em;">🏆</div>'}
            </div>
            <div class="shiki-champion-name">${escapeHTML(w.name || w.title || 'Победитель')}</div>
            <div class="shiki-champion-score">${w.score?.points || 0} очков · ${w.score?.wins || 0} побед</div>
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

    // Init carousel positions
    for (let idx = 0; idx < rounds.length; idx++) {
      const key = idx + '-' + (rounds[idx]?.active_group_index || 0);
      setTimeout(() => {
        const track = document.getElementById('carousel-' + key);
        if (track) {
          const containerEl = track.parentElement;
          const containerWidth = containerEl.clientWidth;
          const visible = getVisibleCount(containerWidth);
          const total = track.children.length;
          const maxIndex = Math.max(0, total - visible);
          carouselState[key] = 0;
          const prevBtn = containerEl.querySelector('.prev');
          const nextBtn = containerEl.querySelector('.next');
          if (prevBtn) prevBtn.classList.add('hidden');
          if (nextBtn) nextBtn.classList.toggle('hidden', maxIndex === 0);
        }
      }, 100);
    }

    isRendering = false;
  }

  window.RenderBracket.switchGroup = function(roundIdx, groupIdx) {
    const container = document.getElementById('group-container-' + roundIdx);
    if (!container) return;
    const key = roundIdx + '-' + groupIdx;
    // Re-render just that group - for simplicity, we re-render the whole bracket
    if (currentTournamentId) {
      renderBracket(currentTournamentId, document.getElementById("bracket-container"));
    }
  };

  // ===== INIT =====
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

  // Export
  window.RenderBracket.renderBracket = renderBracket;
  window.RenderBracket.carouselMove = window.RenderBracket.carouselMove;
  window.RenderBracket.castVote = window.RenderBracket.castVote;
  window.RenderBracket.switchGroup = window.RenderBracket.switchGroup;
})();
