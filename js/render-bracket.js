/* ============================================================
   Tournament Hub Bracket Renderer (FIXED v6 — Shikimori Edition)
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

  let realtimeSubscribed = false;
  let previousVotes = new Map();
  const MAX_VOTES_CACHE = 100;
  let currentTournamentId = null;
  let isRendering = false;

  async function loadTournament(tournamentId) {
    if (window.TH && window.TH.getTournament) {
      try {
        const { data, error } = await window.TH.getTournament(tournamentId);
        if (error) throw error;
        if (data) return data;
      } catch (e) { console.warn('Supabase tournament load failed:', e); }
    }
    // Fallback to local
    const db = window.DB ? window.DB.getDB() : { tournaments: [] };
    return (db.tournaments || []).find(t => t.id === tournamentId) || null;
  }

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function renderMatch(match, isRoundActive, tournamentStatus) {
    const p1 = match.player1 || { name: "???", image_url: '' };
    const p2 = match.player2 || { name: "???", image_url: '' };
    const votes1 = match.votes1 || 0;
    const votes2 = match.votes2 || 0;
    const total = votes1 + votes2;
    const pct1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
    const pct2 = total > 0 ? Math.round((votes2 / total) * 100) : 50;
    const isFinished = match.finished || match.status === 'done';
    const wId = match.winner_id || (match.winner ? match.winner.id : null);
    const p1Win = isFinished && wId && p1.id === wId;
    const p2Win = isFinished && wId && p2.id === wId;

    // Check if user can vote
    let canVote = false;
    let voteReason = '';
    if (isRoundActive && !isFinished && tournamentStatus === 'active') {
      if (window.TH && window.TH.hasVoted) {
        try {
          const hasVoted = await window.TH.hasVoted(match.id);
          canVote = !hasVoted;
          if (hasVoted) voteReason = 'Вы уже голосовали';
        } catch (e) { canVote = true; }
      } else {
        const voted = JSON.parse(localStorage.getItem('th_voted_matches') || '[]');
        canVote = !voted.includes(match.id);
        if (!canVote) voteReason = 'Вы уже голосовали';
      }
    }

    // Shikimori-style: big cards, clear VS, click to vote
    const p1Image = p1.image_url || p1.image || '';
    const p2Image = p2.image_url || p2.image || '';
    const p1Class = p1Win ? 'winner' : (isFinished ? 'loser' : '');
    const p2Class = p2Win ? 'winner' : (isFinished ? 'loser' : '');
    const p1Opacity = isFinished && !p1Win ? 'style="opacity:0.5"' : '';
    const p2Opacity = isFinished && !p2Win ? 'style="opacity:0.5"' : '';

    const voteBtn1 = canVote ? `onclick="RenderBracket.castVote('${match.id}', 1, this)"` : '';
    const voteBtn2 = canVote ? `onclick="RenderBracket.castVote('${match.id}', 2, this)"` : '';
    const cursor1 = canVote ? 'pointer' : 'default';
    const cursor2 = canVote ? 'pointer' : 'default';

    return `
      <div class="bracket-match ${isFinished ? 'done' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        <div class="match-players">
          <div class="player-card ${p1Class}" ${p1Opacity} ${voteBtn1} style="cursor:${cursor1}">
            <div class="player-image-wrap">
              ${p1Image ? `<img src="${escapeHTML(p1Image)}" alt="${escapeHTML(p1.name)}" onerror="this.style.display='none';this.parentElement.classList.add('no-image')">` : '<div class="no-image">👤</div>'}
            </div>
            <div class="player-info">
              <div class="player-name">${escapeHTML(p1.name)}</div>
              <div class="player-votes">${votes1} голосов</div>
            </div>
            <div class="vote-bar" style="width:${pct1}%"></div>
            ${p1Win ? '<div class="winner-badge">🏆</div>' : ''}
          </div>

          <div class="vs-divider">
            <span class="vs-text">VS</span>
            <div class="vs-score">${votes1} : ${votes2}</div>
          </div>

          <div class="player-card ${p2Class}" ${p2Opacity} ${voteBtn2} style="cursor:${cursor2}">
            <div class="player-image-wrap">
              ${p2Image ? `<img src="${escapeHTML(p2Image)}" alt="${escapeHTML(p2.name)}" onerror="this.style.display='none';this.parentElement.classList.add('no-image')">` : '<div class="no-image">👤</div>'}
            </div>
            <div class="player-info">
              <div class="player-name">${escapeHTML(p2.name)}</div>
              <div class="player-votes">${votes2} голосов</div>
            </div>
            <div class="vote-bar" style="width:${pct2}%"></div>
            ${p2Win ? '<div class="winner-badge">🏆</div>' : ''}
          </div>
        </div>
        ${!isFinished && !canVote && voteReason ? `<div class="vote-hint">${voteReason}</div>` : ''}
        ${canVote ? '<div class="vote-hint active">👆 Нажмите на участника, чтобы проголосовать</div>' : ''}
      </div>`;
  }

  async function castVote(matchId, playerIndex, el) {
    // Visual feedback immediately
    if (el) {
      el.style.transform = 'scale(0.95)';
      setTimeout(() => el.style.transform = '', 150);
    }

    try {
      if (window.TH && window.TH.castVote) {
        await window.TH.castVote(matchId, playerIndex);
        toast('✅ Голос засчитан!');
      } else {
        // Local fallback
        const db = window.DB ? window.DB.getDB() : { tournaments: [] };
        let found = false;
        for (const t of (db.tournaments || [])) {
          if (t.rounds) {
            for (const r of t.rounds) {
              const m = (r.matches || []).find(x => x.id === matchId);
              if (m) {
                if (playerIndex === 1) m.votes1 = (m.votes1 || 0) + 1;
                else m.votes2 = (m.votes2 || 0) + 1;
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
        if (found && window.DB) window.DB.saveDB(db);
        const voted = JSON.parse(localStorage.getItem('th_voted_matches') || '[]');
        if (!voted.includes(matchId)) { voted.push(matchId); localStorage.setItem('th_voted_matches', JSON.stringify(voted)); }
        toast('✅ Голос засчитан (локально)');
      }

      // Re-render
      if (currentTournamentId) {
        const container = document.getElementById("bracket-container");
        if (container) await renderBracket(currentTournamentId, container);
      }
    } catch (e) {
      toast('❌ ' + (e.message || 'Ошибка голосования'));
      console.error('Vote error:', e);
    }
  }

  function animateVote(matchId, votes1, votes2) {
    const key = matchId;
    const prev = previousVotes.get(key);
    if (prev && (prev.votes1 !== votes1 || prev.votes2 !== votes2)) {
      const el = document.getElementById(`match-${matchId}`);
      if (el) { 
        el.classList.add("vote-just-cast"); 
        setTimeout(() => el.classList.remove("vote-just-cast"), 400); 
      }
    }
    if (previousVotes.size > MAX_VOTES_CACHE) { 
      const firstKey = previousVotes.keys().next().value; 
      previousVotes.delete(firstKey); 
    }
    previousVotes.set(key, { votes1, votes2 });
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

    // Update header
    const header = document.getElementById('bracket-header');
    if (header) header.innerHTML = `<h1>🏆 ${escapeHTML(tournament.title || 'Турнир')}</h1>`;

    const sub = document.getElementById('bracket-sub');
    if (sub) {
      const statusMap = { draft: 'Черновик', active: 'Активен', finished: 'Завершён', archived: 'Архивирован' };
      sub.textContent = tournament.description || `Статус: ${statusMap[tournament.status] || tournament.status}`;
    }

    const activeRound = tournament.current_round || tournament.currentRound || 0;
    const rounds = tournament.rounds || [];

    if (!rounds.length) {
      container.innerHTML = `<div class="empty-state"><h3>Сетка ещё не создана</h3><p>Администратор должен запустить турнир</p></div>`;
      isRendering = false;
      return;
    }

    let html = '';
    for (let idx = 0; idx < rounds.length; idx++) {
      const round = rounds[idx];
      const isActive = idx === activeRound && tournament.status === "active";
      const isPast = idx < activeRound || tournament.status === "finished";
      const isFuture = idx > activeRound && tournament.status === "active";
      const roundTitle = round.name || `Раунд ${idx + 1}`;

      const matchesHtml = [];
      for (const m of (round.matches || [])) {
        animateVote(m.id, m.votes1 || 0, m.votes2 || 0);
        matchesHtml.push(await renderMatch(m, isActive, tournament.status));
      }

      html += `
        <section class="round-col ${isActive ? "active" : ""} ${isPast ? "past" : ""} ${isFuture ? "future" : ""}">
          <h2 class="round-title">${escapeHTML(roundTitle)}</h2>
          <div class="round-matches">${matchesHtml.join("") || "<p style='color:var(--text-3);text-align:center;padding:20px;'>Нет матчей</p>"}</div>
        </section>`;
    }

    let footer = "";
    if (tournament.status === "finished" && tournament.winner) {
      const w = tournament.winner;
      const wImage = w.image_url || w.image || '';
      footer = `
        <section class="champion-card">
          <h2>🏆 Чемпион</h2>
          <span class="champion-crown">👑</span>
          <div class="champion-avatar">
            ${wImage ? `<img src="${escapeHTML(wImage)}" alt="${escapeHTML(w.name || '')}" onerror="this.style.display='none'">` : '<div style="font-size:4em">🏆</div>'}
          </div>
          <p class="champ-name">${escapeHTML(w.name || w.title || "Победитель")}</p>
          <p class="champ-wins">Победитель турнира!</p>
        </section>`;
    }

    container.innerHTML = `<div class="bracket-grid">${html}</div>${footer}`;
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
