/* ============================================================
   Tournament Hub Main Renderer (FIXED v4 — proper init, no duplicates, safe calls)
   ============================================================ */

(function () {
  'use strict';

  let initDone = false;

  /* ==========================================================
     НАСТРОЙКИ САЙТА
     ========================================================== */
  async function loadSiteSettings() {
    if (window.TH) {
      try {
        const { data } = await window.TH.getSiteSettings();
        if (data) return {
          siteName: data.site_name || 'Tournament Hub',
          description: data.description || '',
          siteLogo: data.site_logo || '🏆',
          theme: data.theme || 'amber',
          accent: data.accent || 'amber'
        };
      } catch (e) {
        console.warn('Supabase settings failed, using localStorage');
      }
    }

    const db = DB.getDB();
    return {
      siteName: db.settings?.siteName || 'Tournament Hub',
      description: db.settings?.description || '',
      siteLogo: db.settings?.siteLogo || '🏆',
      theme: db.settings?.theme || 'amber',
      accent: db.settings?.accent || 'amber'
    };
  }

  function applySettings(settings) {
    const logoEl = document.getElementById("siteLogoLink");
    if (logoEl) {
      logoEl.textContent = (settings.siteLogo || "🏆") + " " + (settings.siteName || "Tournament Hub");
    }

    const titleEl = document.querySelector('title[data-site-name]');
    if (titleEl) titleEl.textContent = settings.siteName || 'Tournament Hub';

    const descEl = document.querySelector("#site-description");
    if (descEl) descEl.textContent = settings.description || '';

    const footerText = document.getElementById('footerText');
    if (footerText) {
      footerText.textContent = '© ' + new Date().getFullYear() + ' ' + (settings.siteName || 'Tournament Hub');
    }
  }

  /* ==========================================================
     ТУРНИРЫ
     ========================================================== */
  async function getTournamentsData() {
    if (!window.TH) return [];

    try {
      const { data } = await window.TH.getTournaments();
      if (data) return data.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        createdAt: t.created_at,
        currentRound: t.current_round,
        winner: t.winner_id,
        players: t.players || [],
        rounds: t.rounds || [],
        config: t.config || {}
      }));
    } catch (e) {
      console.warn('Supabase tournaments failed', e);
    }

    const db = DB.getDB();
    return (db.tournaments || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function renderTournamentList(container) {
    if (!container) return;

    getTournamentsData().then(tournaments => {
      if (!tournaments || !tournaments.length) {
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-state-icon">🏆</span>
            <h3>Турниров пока нет</h3>
            <p>Создайте первый турнир в панели управления.</p>
            <a href="admin.html">⚙️ Перейти в управление</a>
          </div>
        `;
        return;
      }

      container.innerHTML = tournaments.map((t, i) => {
        const roundsCount = Array.isArray(t.rounds) ? t.rounds.length : 0;
        const playersCount = Array.isArray(t.players) ? t.players.length : 0;
        const statusClass = t.status === "active" ? "status-active" : t.status === "finished" ? "status-completed" : "";
        const statusText = t.status === "active" ? "Активен" : t.status === "finished" ? "Завершён" : "Черновик";
        const createdDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString("ru-RU") : '—';

        return `
          <article class="tournament-card stagger-${Math.min(i + 1, 5)}">
            <div class="tournament-badge ${statusClass}">${escapeHTML(statusText)}</div>
            <h3>${escapeHTML(t.title || "Без названия")}</h3>
            <p>${escapeHTML(t.description || "")}</p>
            <div class="tournament-meta">
              <span>📅 ${createdDate}</span>
              <span>👥 ${playersCount} участников</span>
              <span>🎯 ${roundsCount} раундов</span>
            </div>
            <a class="btn-secondary" href="bracket.html?id=${encodeURIComponent(t.id)}">Открыть сетку →</a>
          </article>
        `;
      }).join("");
    }).catch(e => {
      console.error('renderTournamentList error:', e);
      container.innerHTML = `<p style="color:var(--red);">Ошибка загрузки турниров</p>`;
    });
  }

  /* ==========================================================
     СТАТИСТИКА
     ========================================================== */
  async function getStats() {
    if (!window.TH) {
      const db = DB.getDB();
      return {
        tournaments: (db.tournaments || []).length,
        users: (db.users || []).length,
        matches: 0
      };
    }

    try {
      const { data: tournaments } = await window.TH.getTournaments();
      const { data: users } = await window.TH.getAllUsers();

      let totalMatches = 0;
      (tournaments || []).forEach(t => {
        (t.rounds || []).forEach(r => {
          totalMatches += (r.matches || []).length;
        });
      });

      return {
        tournaments: (tournaments || []).length,
        users: (users || []).length,
        matches: totalMatches
      };
    } catch (e) {
      console.warn('Supabase stats failed, using cache');
      const db = DB.getDB();
      let totalMatches = 0;
      (db.tournaments || []).forEach(t => {
        (t.rounds || []).forEach(r => {
          totalMatches += (r.matches || []).length;
        });
      });
      return {
        tournaments: (db.tournaments || []).length,
        users: (db.users || []).length,
        matches: totalMatches
      };
    }
  }

  function renderStats() {
    const el = document.querySelector("#stats");
    if (!el) return;

    getStats().then(stats => {
      el.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <strong>${stats.tournaments}</strong>
            <span>Турниры</span>
          </div>
          <div class="stat-card">
            <strong>${stats.users}</strong>
            <span>Пользователи</span>
          </div>
          <div class="stat-card">
            <strong>${stats.matches}</strong>
            <span>Матчи</span>
          </div>
        </div>
      `;
    }).catch(e => {
      console.error('renderStats error:', e);
    });
  }

  /* ==========================================================
     ГЛАВНАЯ ИНИЦИАЛИЗАЦИЯ
     ========================================================== */
  async function initRender() {
    if (initDone) return;
    initDone = true;

    // FIX: ждём window.TH
    let attempts = 0;
    while (!window.TH && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    const settings = await loadSiteSettings();
    applySettings(settings);
    renderStats();
    renderTournamentList(document.querySelector("#tournament-list"));

    if (window.Auth && Auth.renderNavUser) Auth.renderNavUser();
  }

  window.Render = { initRender, renderTournamentList, renderStats };

  // FIX: запускаем при DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(initRender, 200);
    });
  } else {
    setTimeout(initRender, 200);
  }
})();
