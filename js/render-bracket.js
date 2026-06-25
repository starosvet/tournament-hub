/* ============================================================
   Tournament Hub Bracket Renderer (FIXED v5)
   ============================================================ */
(function () {
  'use strict';

  function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

  let realtimeSubscribed = false;
  let previousVotes = new Map();
  const MAX_VOTES_CACHE = 100;

  async function loadTournament(tournamentId) {
    if (window.TH) {
      try { const { data } = await window.TH.getTournament(tournamentId); if (data) return normalizeTournament(data); }
      catch (e) { console.warn('Supabase tournament load failed:', e); }
    }
    return Bracket.getTournamentById(tournamentId);
  }

  function normalizeTournament(t) {
    return {
      id: t.id, title: t.title, description: t.description, status: t.status,
      createdAt: t.created_at, currentRound: t.current_round || 0,
      winner: t.winner_id ? { id: t.winner_id, name: t.winner_name || "Победитель" } : (t.winner || null),
      players: t.players || [],
      rounds: (t.rounds || []).map(r => ({ id: r.id, name: r.name, isActive: r.is_active, startedAt: r.started_at, matches: r.matches || [] }))
    };
  }

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function renderMatch(match, isRoundActive) {
    const p1 = match.player1 || { name: "???" };
    const p2 = match.player2 || { name: "???" };
    const votes1 = match.votes1 || 0;
    const votes2 = match.votes2 || 0;
    const total = votes1 + votes2;
    const pct1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
    const pct2 = total > 0 ? Math.round((votes2 / total) * 100) : 50;
    const isFinished = match.finished;
    const wId = match.winner?.id || match.winner_id;
    const p1WinClass = (isFinished && wId === p1.id) ? "winner" : "";
    const p2WinClass = (isFinished && wId === p2.id) ? "winner" : "";
    let canVote = false;
    if (isRoundActive && !isFinished && window.Auth && window.Auth.canUserVote) {
      const check = await window.Auth.canUserVote(match.id);
      canVote = check.can;
    }
    return `
      <div class="bracket-match ${isFinished ? 'done' : ''} ${canVote ? 'can-vote' : ''}" id="match-${match.id}">
        <div class="player ${p1WinClass} ${canVote ? 'can-vote' : ''}" onclick="${canVote ? `RenderBracket.castVote('${match.id}', 1)` : ''}">
          <span class="player-name">${escapeHTML(p1.name)}</span>
          <span class="player-votes">${votes1} (${pct1}%)</span>
          <div class="player-bar" style="width: ${pct1}%"></div>
        </div>
        <div class="vs-line">VS</div>
        <div class="player ${p2WinClass} ${canVote ? 'can-vote' : ''}" onclick="${canVote ? `RenderBracket.castVote('${match.id}', 2)` : ''}">
          <span class="player-name">${escapeHTML(p2.name)}</span>
          <span class="player-votes">${votes2} (${pct2}%)</span>
          <div class="player-bar" style="width: ${pct2}%"></div>
        </div>
      </div>`;
  }

  async function castVote(matchId, playerIndex) {
    if (window.Auth && window.Auth.canUserVote) {
      const check = await window.Auth.canUserVote(matchId);
      if (!check.can) { alert(check.reason || "Вы уже голосовали!"); return; }
    }
    if (window.TH) {
      try { await window.TH.castVote(matchId, playerIndex); if (window.Auth && window.Auth.markVote) window.Auth.markVote(matchId); }
      catch (e) { alert("Ошибка: " + e.message); return; }
    } else {
      const db = DB.getDB();
      for (const t of (db.tournaments || [])) {
        if (t.rounds) { for (const r of t.rounds) { const m = (r.matches || []).find(x => x.id === matchId); if (m) { if (playerIndex === 1) m.votes1 = (m.votes1 || 0) + 1; else m.votes2 = (m.votes2 || 0) + 1; break; } } }
      }
      DB.saveDB(db);
      if (window.Auth && window.Auth.markVote) window.Auth.markVote(matchId);
    }
    const tid = getUrlParam("id");
    if (tid) await renderBracket(tid, document.getElementById("bracket-container"));
  }

  function animateVote(matchId, votes1, votes2) {
    const key = matchId;
    const prev = previousVotes.get(key);
    if (prev && (prev.votes1 !== votes1 || prev.votes2 !== votes2)) {
      const el = document.getElementById(`match-${matchId}`);
      if (el) { el.classList.add("vote-just-cast"); setTimeout(() => el.classList.remove("vote-just-cast"), 400); }
    }
    if (previousVotes.size > MAX_VOTES_CACHE) { const firstKey = previousVotes.keys().next().value; previousVotes.delete(firstKey); }
    previousVotes.set(key, { votes1, votes2 });
  }

  function subscribeToTournamentUpdates(tournamentId, container) {
    if (realtimeSubscribed || !window.TH) return;
    realtimeSubscribed = true;
    window.TH.subscribeToMatches(tournamentId, async () => {
      const t = await loadTournament(tournamentId);
      if (t) await renderBracket(t, container);
    });
  }

  async function renderBracket(tournamentOrId, container) {
    if (!container) return;
    let tournament = null;
    if (typeof tournamentOrId === "string") { tournament = await loadTournament(tournamentOrId); subscribeToTournamentUpdates(tournamentOrId, container); }
    else tournament = tournamentOrId;
    if (!tournament) { container.innerHTML = "<p style='color:var(--red);text-align:center;'>Турнир не найден</p>"; return; }
    const activeRound = tournament.currentRound || 0;
    let html = '';
    for (let idx = 0; idx < (tournament.rounds || []).length; idx++) {
      const round = tournament.rounds[idx];
      const isActive = idx === activeRound && tournament.status === "active";
      const isPast = idx < activeRound || tournament.status === "finished";
      const isFuture = idx > activeRound && tournament.status === "active";
      const roundTitle = round.name || `Раунд ${idx + 1}`;
      const matchesHtml = [];
      for (const m of (round.matches || [])) {
        animateVote(m.id, m.votes1 || 0, m.votes2 || 0);
        matchesHtml.push(await renderMatch(m, isActive));
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
      footer = `
        <section class="champion-card">
          <h2>🏆 Чемпион</h2>
          <span class="champion-crown">👑</span>
          <div class="champion-avatar"><img src="${escapeHTML(w.image || '')}" alt="${escapeHTML(w.name || '')}" onerror="this.style.display='none'"></div>
          <p class="champ-name">${escapeHTML(w.name || w.title || "Победитель")}</p>
        </section>`;
    }
    container.innerHTML = `<div class="bracket-grid">${html}</div>${footer}`;
  }

  window.RenderBracket = { renderBracket, animateVote, castVote };

  document.addEventListener("DOMContentLoaded", () => {
    let attempts = 0;
    const checkInit = setInterval(() => {
      if (window.TH && window.TH.isReady) {
        clearInterval(checkInit);
        const id = getUrlParam("id");
        if (id) renderBracket(id, document.getElementById("bracket-container"));
      }
      attempts++;
      if (attempts > 30) clearInterval(checkInit);
    }, 100);
  });
})();