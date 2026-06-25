/* ============================================================
   Tournament Hub Bracket Renderer (Supabase + Realtime)
   ============================================================ */

(function () {
  'use strict';

  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // Храним предыдущие голоса для анимации
  let previousVotes = {};
  let realtimeSubscribed = false;

  /* ==========================================================
     ЗАГРУЗКА ТУРНИРА
     ========================================================== */

  async function loadTournament(tournamentId) {
    if (window.TH) {
      try {
        const { data } = await window.TH.getTournament(tournamentId);
        if (data) return normalizeTournament(data);
      } catch (e) {
        console.warn('Supabase tournament load failed');
      }
    }

    // Fallback
    return Bracket.getTournamentById(tournamentId);
  }

  function normalizeTournament(t) {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      createdAt: t.created_at,
      currentRound: t.current_round || 0,
      winner: t.winner_id ? { name: t.winner_id } : null,
      players: t.players || [],
      rounds: (t.rounds || []).map(r => ({
        id: r.id,
        name: r.name,
        isActive: r.is_active,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        matches: (r.matches || []).map(m => ({
          id: m.id,
          player1: m.player1,
          player2: m.player2,
          votes1: m.votes1 || 0,
          votes2: m.votes2 || 0,
          winner: m.winner,
          finished: m.finished,
          status: m.status
        }))
      })),
      config: t.config || {}
    };
  }

  /* ==========================================================
     REALTIME ПОДПИСКА
     ========================================================== */

  function subscribeToRealtime(tournamentId) {
    if (!window.TH || realtimeSubscribed) return;

    // Подписываемся на изменения матчей
    window.TH.subscribeToMatches(tournamentId, (payload) => {
      console.log('Match update:', payload);
      // Перерендериваем сетку
      renderBracket();
    });

    // Подписываемся на новые голоса
    window.TH.subscribeToVotes((payload) => {
      console.log('Vote update:', payload);
      renderBracket();
    });

    realtimeSubscribed = true;
  }

  /* ==========================================================
     РЕНДЕР МАТЧА
     ========================================================== */

  function renderMatch(match, isActive) {
    const p1 = match.player1;
    const p2 = match.player2;
    const votes1 = match.votes1 || 0;
    const votes2 = match.votes2 || 0;
    const total = votes1 + votes2;
    const pct1 = total ? Math.round(votes1 / total * 100) : 0;
    const pct2 = total ? Math.round(votes2 / total * 100) : 0;
    const winner = match.winner || null;
    const p1Win = winner && (winner.id ? winner.id === p1?.id : winner === p1);
    const p2Win = winner && (winner.id ? winner.id === p2?.id : winner === p2);

    // Проверяем, изменились ли голоса для анимации
    const prevKey = match.id;
    const prev = previousVotes[prevKey] || { v1: 0, v2: 0 };
    const v1Changed = prev.v1 !== votes1;
    const v2Changed = prev.v2 !== votes2;
    previousVotes[prevKey] = { v1: votes1, v2: votes2 };

    const v1AnimClass = v1Changed && votes1 > prev.v1 ? 'vote-just-cast' : '';
    const v2AnimClass = v2Changed && votes2 > prev.v2 ? 'vote-just-cast' : '';

    const canVote = isActive && p1 && p2 && !match.finished;

    // Асинхронная проверка голоса
    const voteBtn1 = canVote
      ? `onclick="handleVote('${match.id}', '${match.tournament_id || ''}', 1)"`
      : "disabled tabindex='-1'";
    const voteBtn2 = canVote
      ? `onclick="handleVote('${match.id}', '${match.tournament_id || ''}', 2)"`
      : "disabled tabindex='-1'";

    return `
      <div class="bracket-match ${match.finished ? "done" : ""}" id="match-${match.id}">
        <button class="player ${p1Win ? "winner" : ""} ${canVote ? "can-vote" : ""} ${v1AnimClass}" ${voteBtn1}>
          <span class="player-name">${p1 ? escapeHTML(p1.name || p1.title || "—") : "—"}</span>
          <span class="player-votes" id="votes-${match.id}-1">${votes1}</span>
          <span class="player-bar" style="width:${pct1}%"></span>
        </button>
        <div class="vs-line">${match.finished ? `${votes1}:${votes2}` : "VS"}</div>
        <button class="player ${p2Win ? "winner" : ""} ${canVote ? "can-vote" : ""} ${v2AnimClass}" ${voteBtn2}>
          <span class="player-name">${p2 ? escapeHTML(p2.name || p2.title || "—") : "—"}</span>
          <span class="player-votes" id="votes-${match.id}-2">${votes2}</span>
          <span class="player-bar" style="width:${pct2}%"></span>
        </button>
      </div>
    `;
  }

  /* ==========================================================
     ГОЛОСОВАНИЕ
     ========================================================== */

  window.handleVote = async function(matchId, tournamentId, playerNum) {
    const user = DB.getCurrentUser();
    if (!user) {
      toast("Войдите, чтобы голосовать");
      return;
    }

    try {
      // Проверяем, не голосовал ли уже
      const canVote = await Auth.canUserVote(matchId);
      if (!canVote) {
        toast("Вы уже голосовали в этом матче");
        return;
      }

      // Отправляем голос в Supabase
      const { error } = await window.TH.castVote(matchId, tournamentId, playerNum);

      if (error) {
        toast("Ошибка голосования: " + error.message);
        return;
      }

      // Анимация
      animateVote(matchId, playerNum);
      toast("✅ Голос засчитан!");

      // Перерендериваем
      renderBracket();

    } catch (e) {
      console.error('Vote error:', e);
      toast("Ошибка голосования");
    }
  };

  function animateVote(matchId, playerNum) {
    const matchEl = document.getElementById(`match-${matchId}`);
    if (!matchEl) return;

    const playerBtn = matchEl.querySelectorAll('.player')[playerNum - 1];
    if (playerBtn) {
      playerBtn.classList.add('vote-just-cast');
      setTimeout(() => playerBtn.classList.remove('vote-just-cast'), 500);
    }

    const votesEl = document.getElementById(`votes-${matchId}-${playerNum}`);
    if (votesEl) {
      votesEl.style.animation = 'none';
      votesEl.offsetHeight;
      votesEl.style.animation = 'count-up 0.3s ease';
    }
  }

  /* ==========================================================
     РЕНДЕР СЕТКИ
     ========================================================== */

  async function renderBracket() {
    const container = document.querySelector("#bracket-container");
    if (!container) return;

    const tournamentId = getUrlParam("id");
    if (!tournamentId) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🏆</span>
          <h3>Турнир не выбран</h3>
          <p>Выберите турнир на главной странице, чтобы увидеть сетку.</p>
          <a href="index.html">На главную</a>
        </div>
      `;
      return;
    }

    const tournament = await loadTournament(tournamentId);
    if (!tournament) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">❓</span>
          <h3>Турнир не найден</h3>
          <p>Проверьте ссылку или создайте новый турнир в админ-панели.</p>
          <a href="admin.html">В админку</a>
        </div>
      `;
      return;
    }

    // Подписываемся на realtime
    subscribeToRealtime(tournamentId);

    const header = document.querySelector("#bracket-header");
    if (header) {
      header.innerHTML = `<h1>${escapeHTML(tournament.title || tournament.name || "Турнир")}</h1><p>${escapeHTML(tournament.description || "")}</p>`;
    }

    const sub = document.querySelector("#bracket-sub");
    if (sub) {
      const statusText = tournament.status === "active"
        ? "🗳️ Голосуйте за участников!"
        : tournament.status === "finished"
        ? "🏆 Турнир завершён"
        : "✏️ Турнир в режиме черновика";
      sub.textContent = statusText;
    }

    const rounds = tournament.rounds || [];
    if (!rounds.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📋</span>
          <h3>Сетка ещё не создана</h3>
          <p>Запустите турнир из админ-панели, чтобы сгенерировать сетку.</p>
          <a href="admin.html">В админку</a>
        </div>
      `;
      return;
    }

    const activeRound = tournament.status === "active" ? (tournament.currentRound || 0) : -1;
    const html = rounds.map((round, idx) => {
      const isActive = idx === activeRound && tournament.status === "active";
      const isPast = idx < activeRound || tournament.status === "finished";
      const isFuture = idx > activeRound && tournament.status === "active";
      const roundTitle = round.name || `Раунд ${idx + 1}`;
      const matches = (round.matches || []).map((m, mi) => renderMatch(m, isActive)).join("");
      return `
        <section class="round-col ${isActive ? "active" : ""} ${isPast ? "past" : ""} ${isFuture ? "future" : ""}">
          <h2 class="round-title">${escapeHTML(roundTitle)}</h2>
          <div class="round-matches">${matches || "<p style='color:var(--text-3);text-align:center;padding:20px;'>Нет матчей</p>"}</div>
        </section>
      `;
    }).join("");

    let footer = "";
    if (tournament.status === "finished" && tournament.winner) {
      const w = tournament.winner;
      footer = `
        <section class="champion-card">
          <h2>🏆 Чемпион</h2>
          <span class="champion-crown">👑</span>
          <div class="champion-avatar">
            <img src="${escapeHTML(w.image || '')}" alt="${escapeHTML(w.name || '')}" onerror="this.style.display='none'">
          </div>
          <p class="champ-name">${escapeHTML(w.name || w.title || "Победитель")}</p>
        </section>
      `;
    }

    container.innerHTML = `<div class="bracket-grid">${html}</div>${footer}`;
  }

  window.RenderBracket = { renderBracket, animateVote };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", renderBracket);
  } else {
    renderBracket();
  }
})();
