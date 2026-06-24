/*!
 * Tournament Hub
 * Main renderer
 */

(function () {

  function escapeHTML(text) {
    if (text === null || text === undefined) {
      return "";
    }
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderSiteName() {
    const elements = document.querySelectorAll("[data-site-name]");
    if (!elements.length) return;

    const db = DB.getDB();
    const name = db.settings?.siteName || "Tournament Hub";

    elements.forEach(el => {
      el.textContent = name;
    });
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
        <div class="hero-empty">
          <h2>Турниров пока нет</h2>
          <p>Создайте первый турнир в панели управления</p>
          <a href="admin.html" class="btn-primary">⚙️ Управление</a>
        </div>
      `;
      return;
    }

    container.innerHTML = tournaments
      .map(t => `
        <div class="hero-tournament" onclick="location.href='bracket.html?id=${escapeHTML(t.id)}'">
          <span class="hero-status status-${escapeHTML(t.status)}">${escapeHTML(t.status)}</span>
          <h2>${escapeHTML(t.title)}</h2>
          <p>${escapeHTML(t.description || "")}</p>
          <div class="hero-meta">
            <span>📅 ${new Date(t.createdAt).toLocaleDateString("ru-RU")}</span>
            <span>👥 ${t.players?.length || 0} участников</span>
            <span>🏆 ${t.rounds || 0} раундов</span>
          </div>
        </div>
      `)
      .join("");
  }

  function renderStats() {
    const el = document.querySelector("#stats");
    if (!el) return;

    const db = DB.getDB();

    el.innerHTML = `
      <div class="stat-badge">🏆 Турниры: ${db.tournaments.length}</div>
      <div class="stat-badge">👤 Игроки: ${db.users.length}</div>
      <div class="stat-badge">⚔️ Матчи: ${db.matches.length}</div>
    `;
  }

  function initRender() {
    renderSiteName();
    renderDescription();
    renderStats();

    const list = document.querySelector("#tournament-list");
    renderTournamentList(list);

    if (window.Auth && Auth.renderNavUser) {
      Auth.renderNavUser();
    }
  }

  window.Render = {
    initRender,
    renderTournamentList,
    renderStats
  };

  document.addEventListener("DOMContentLoaded", initRender);

})();
