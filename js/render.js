/* Tournament Hub Main renderer */
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

  function renderSiteName() {
    const elements = document.querySelectorAll("[data-site-name]");
    if (!elements.length) return;
    const db = DB.getDB();
    const name = db.settings?.siteName || "Tournament Hub";
    elements.forEach(el => { el.textContent = name; });
  }

  function renderDescription() {
    const el = document.querySelector("#site-description");
    if (!el) return;
    const db = DB.getDB();
    el.textContent = db.settings?.description || "";
  }

  function renderTournamentList(container) {
    if (!container) return;
    const tournaments = Tournament.listTournaments();

    if (!tournaments.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Турниров пока нет</h3>
          <p>Создайте первый турнир в панели управления.</p>
          <p><a href="admin.html">⚙️ Управление</a></p>
        </div>
      `;
      return;
    }

    container.innerHTML = tournaments.map(t => {
      const roundsCount = Array.isArray(t.rounds) ? t.rounds.length : 0;
      const playersCount = Array.isArray(t.players) ? t.players.length : 0;
      return `
        <article class="tournament-card">
          <div class="tournament-badge">${escapeHTML(t.status)}</div>
          <h3>${escapeHTML(t.title || "Без названия")}</h3>
          <p>${escapeHTML(t.description || "")}</p>
          <div class="tournament-meta">
            <span>${new Date(t.createdAt).toLocaleDateString("ru-RU")}</span>
            <span>${playersCount} участников</span>
            <span>${roundsCount} раундов</span>
          </div>
          <a class="btn-secondary" href="bracket.html?id=${encodeURIComponent(t.id)}">Открыть сетку</a>
        </article>
      `;
    }).join("");
  }

  // ИСПРАВЛЕНО: считаем матчи из tournament.rounds[].matches, а не db.matches
  function renderStats() {
    const el = document.querySelector("#stats");
    if (!el) return;
    const db = DB.getDB();

    let totalMatches = 0;
    (db.tournaments || []).forEach(t => {
      (t.rounds || []).forEach(r => {
        totalMatches += (r.matches || []).length;
      });
    });

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><strong>${(db.tournaments || []).length}</strong><span>Турниры</span></div>
        <div class="stat-card"><strong>${(db.users || []).length}</strong><span>Пользователи</span></div>
        <div class="stat-card"><strong>${totalMatches}</strong><span>Матчи</span></div>
      </div>
    `;
  }

  function initRender() {
    renderSiteName();
    renderDescription();
    renderStats();
    renderTournamentList(document.querySelector("#tournament-list"));
    if (window.Auth && Auth.renderNavUser) Auth.renderNavUser();
  }

  window.Render = { initRender, renderTournamentList, renderStats };
  window.escapeHTML = window.escapeHTML || escapeHTML;
  document.addEventListener("DOMContentLoaded", initRender);
})();