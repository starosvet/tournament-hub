/*!
 * Tournament Hub
 * Bracket renderer
 */

(function () {

  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function renderBracket() {
    const container = document.querySelector("#bracket-container");
    if (!container) return;

    const tournamentId = getUrlParam("id");
    if (!tournamentId) {
      container.innerHTML = `<div class="hero-empty"><h2>Турнир не выбран</h2><p>Выберите турнир на <a href="index.html">главной</a></p></div>`;
      return;
    }

    const tournament = Tournament.getTournament(tournamentId);
    if (!tournament) {
      container.innerHTML = `<div class="hero-empty"><h2>Турнир не найден</h2></div>`;
      return;
    }

    // Заголовок
    const header = document.querySelector("#bracket-header");
    if (header) {
      header.innerHTML = `
        <h1>${escapeHTML(tournament.title)}</h1>
        <span class="badge status-${escapeHTML(tournament.status)}">${escapeHTML(tournament.status)}</span>
      `;
    }

    const sub = document.querySelector("#bracket-sub");
    if (sub) {
      sub.textContent = tournament.description || "";
    }

    // Получаем все матчи турнира
    const db = DB.getDB();
    const allMatches = (db.matches || []).filter(m => m.tournamentId === tournamentId);
    
    if (!allMatches.length && tournament.status === "draft") {
      container.innerHTML = `
        <div class="hero-empty">
          <h2>Турнир ещё не начался</h2>
          <p>Администратор должен запустить турнир</p>
        </div>
      `;
      return;
    }

    // Группируем по раундам
    const rounds = {};
    allMatches.forEach(m => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    const roundNames = ["1/64", "1/32", "1/16", "1/8", "1/4", "1/2", "Финал"];
    const maxRound = Math.max(...Object.keys(rounds).map(Number), 0);
    const currentRound = tournament.status === "active" ? maxRound : (tournament.rounds || 1);

    let html = '<div class="bracket-grid">';

    Object.keys(rounds).sort((a,b) => a-b).forEach(r => {
      const rNum = parseInt(r);
      const isActive = rNum === currentRound && tournament.status === "active";
      const isPast = rNum < currentRound || tournament.status === "finished";
      const cls = isActive ? "round-col active" : (isPast ? "round-col past" : "round-col future");
      const rName = roundNames[Math.min(rNum - 1, roundNames.length - 1)] || `Раунд ${rNum}`;

      html += `<div class="${cls}"><div class="round-title">${rName}</div>`;

      rounds[r].forEach((m, mi) => {
        const totalVotes = (m.votes1 || 0) + (m.votes2 || 0);
        const pct1 = totalVotes > 0 ? Math.round((m.votes1 || 0) / totalVotes * 100) : 0;
        const pct2 = totalVotes > 0 ? Math.round((m.votes2 || 0) / totalVotes * 100) : 0;
        const isDone = m.finished || m.status === "done";
        const canVote = isActive && !isDone && m.player1 && m.player2 && Auth.canUserVote(m.id);

        const p1Name = m.player1 ? escapeHTML(m.player1.name || m.player1) : "—";
        const p2Name = m.player2 ? escapeHTML(m.player2.name || m.player2) : "—";
        const p1Img = m.player1?.image || "";
        const p2Img = m.player2?.image || "";

        const p1Win = isDone && m.winner && (m.winner.id === m.player1?.id || m.winner === m.player1);
        const p2Win = isDone && m.winner && (m.winner.id === m.player2?.id || m.winner === m.player2);

        html += `<div class="bracket-match ${canVote ? 'canvote' : ''} ${isDone ? 'done' : ''}">`;

        // Игрок 1
        html += `<div class="bm-player ${p1Win ? 'winner' : ''} ${!m.player1 ? 'bye' : ''}">`;
        if (p1Img) html += `<img src="${escapeHTML(p1Img)}" alt="">`;
        html += `<div class="bm-info">
          <span class="bm-name">${p1Name}</span>
          <div class="bm-bar"><div class="bm-fill" style="width:${pct1}%"></div></div>
        </div>
        <span class="bm-score">${m.votes1 || 0}</span>
        </div>`;

        // VS / Голосование
        html += `<div class="bm-vs">`;
        if (canVote) {
          html += `<button class="vote-btn vote-a" onclick="Bracket.vote('${m.id}', 1)">▲</button>`;
          html += `<span class="vs-divider">VS</span>`;
          html += `<button class="vote-btn vote-b" onclick="Bracket.vote('${m.id}', 2)">▲</button>`;
        } else if (isDone) {
          html += `<span class="vs-voted">${m.votes1 || 0} : ${m.votes2 || 0}</span>`;
        } else {
          html += `<span class="vs-locked">VS</span>`;
        }
        html += `</div>`;

        // Игрок 2
        html += `<div class="bm-player ${p2Win ? 'winner' : ''} ${!m.player2 ? 'bye' : ''}">`;
        if (p2Img) html += `<img src="${escapeHTML(p2Img)}" alt="">`;
        html += `<div class="bm-info">
          <span class="bm-name">${p2Name}</span>
          <div class="bm-bar"><div class="bm-fill bm-fill-b" style="width:${pct2}%"></div></div>
        </div>
        <span class="bm-score">${m.votes2 || 0}</span>
        </div>`;

        html += `</div>`; // bracket-match
      });

      html += `</div>`; // round-col
    });

    html += `</div>`; // bracket-grid

    // Чемпион
    if (tournament.status === "finished") {
      const finalMatches = allMatches.filter(m => m.round === maxRound);
      const champion = finalMatches[0]?.winner;
      if (champion) {
        const cName = escapeHTML(champion.name || champion);
        const cImg = champion.image || "";
        html += `
          <div class="champion">
            <h3>🏆 Чемпион</h3>
            <div class="champion-avatar">
              ${cImg ? `<img src="${escapeHTML(cImg)}" alt="">` : ''}
            </div>
            <div class="champ-name">${cName}</div>
          </div>
        `;
      }
    }

    container.innerHTML = html;
  }

  window.RenderBracket = {
    renderBracket
  };

  document.addEventListener("DOMContentLoaded", renderBracket);

})();
