/* Tournament Hub Bracket renderer */
(function () {
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

    return `
      <div class="bracket-match ${match.finished ? "done" : ""}">
        <button class="player ${p1Win ? "winner" : ""} ${isActive && p1 && p2 && !match.finished ? "can-vote" : ""}" ${isActive && p1 && p2 && !match.finished ? `onclick="Bracket.vote('${match.id}', 1)"` : "disabled"}>
          <span class="player-name">${p1 ? escapeHTML(p1.name || p1.title || "—") : "—"}</span>
          <span class="player-votes">${votes1}</span>
          <span class="player-bar" style="width:${pct1}%"></span>
        </button>
        <div class="vs-line">${match.finished ? `${votes1}:${votes2}` : "VS"}</div>
        <button class="player ${p2Win ? "winner" : ""} ${isActive && p1 && p2 && !match.finished ? "can-vote" : ""}" ${isActive && p1 && p2 && !match.finished ? `onclick="Bracket.vote('${match.id}', 2)"` : "disabled"}>
          <span class="player-name">${p2 ? escapeHTML(p2.name || p2.title || "—") : "—"}</span>
          <span class="player-votes">${votes2}</span>
          <span class="player-bar" style="width:${pct2}%"></span>
        </button>
      </div>
    `;
  }

  function renderBracket() {
    const container = document.querySelector("#bracket-container");
    if (!container) return;

    const tournamentId = getUrlParam("id");
    if (!tournamentId) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Турнир не выбран</h3>
          <p>Выберите турнир на главной странице.</p>
        </div>
      `;
      return;
    }

    const tournament = Bracket.getTournament(tournamentId);
    if (!tournament) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Турнир не найден</h3>
          <p>Проверь ссылку или создай новый турнир.</p>
        </div>
      `;
      return;
    }

    const header = document.querySelector("#bracket-header");
    if (header) {
      header.innerHTML = `<h1>${escapeHTML(tournament.title || tournament.name || "Турнир")}</h1><p>${escapeHTML(tournament.description || "")}</p>`;
    }

    const sub = document.querySelector("#bracket-sub");
    if (sub) {
      sub.textContent = tournament.status === "active" ? "Голосуйте за участников!" : tournament.status === "finished" ? "Турнир завершён" : "Турнир в режиме черновика";
    }

    const rounds = tournament.rounds || [];
    if (!rounds.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Сетка ещё не создана</h3>
          <p>Запусти турнир из админки.</p>
        </div>
      `;
      return;
    }

    const activeRound = tournament.status === "active" ? (tournament.currentRound || 0) : -1;
    const html = rounds.map((round, idx) => {
      const isActive = idx === activeRound && tournament.status === "active";
      const roundTitle = round.name || `Раунд ${idx + 1}`;
      const matches = (round.matches || []).map(m => renderMatch(m, isActive)).join("");
      return `
        <section class="round-col ${isActive ? "active" : ""}">
          <h2>${escapeHTML(roundTitle)}</h2>
          <div class="round-matches">${matches || "<p>Нет матчей</p>"}</div>
        </section>
      `;
    }).join("");

    let footer = "";
    if (tournament.status === "finished" && tournament.winner) {
      const w = tournament.winner;
      footer = `
        <section class="champion-card">
          <h2>🏆 Чемпион</h2>
          <p style="font-size:1.5em;font-weight:700;color:var(--accent);">${escapeHTML(w.name || w.title || "Победитель")}</p>
        </section>
      `;
    }

    container.innerHTML = `<div class="bracket-grid">${html}</div>${footer}`;
  }

  window.RenderBracket = { renderBracket };
  document.addEventListener("DOMContentLoaded", renderBracket);
})();
