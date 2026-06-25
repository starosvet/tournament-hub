/* ============================================================
   Tournament Hub — Database Layer (Supabase + localStorage fallback)
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = "tournament_hub_db";
  const USE_SUPABASE = true; // Переключатель: true = Supabase, false = localStorage

  // Дефолтная структура (для fallback и миграции)
  const defaultDB = {
    users: [],
    tournaments: [],
    matches: [],
    comments: [],
    subjects: [],
    subjectTypes: [
      { id: "characters", name: "Персонажи", icon: "🙂" },
      { id: "articles", name: "Статьи", icon: "📄" },
      { id: "images", name: "Изображения", icon: "🖼️" },
      { id: "weapons", name: "Оружие", icon: "⚔️" },
      { id: "other", name: "Другое", icon: "⭐" }
    ],
    activeTournamentId: null,
    settings: {
      siteName: "Tournament Hub",
      description: "Турниры для вашей вики",
      siteDesc: "Турниры для вашей вики",
      siteLogo: "",
      theme: "amber",
      accent: "amber"
    }
  };

  /* ==========================================================
     УТИЛИТЫ
     ========================================================== */

  function safeClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDB(data) {
    const input = data || {};
    const merged = safeClone(defaultDB);

    Object.keys(input).forEach(key => {
      if (key === "settings") {
        merged.settings = { ...merged.settings, ...input.settings };
      } else if (key === "subjectTypes") {
        merged.subjectTypes = Array.isArray(input.subjectTypes) && input.subjectTypes.length
          ? input.subjectTypes
          : merged.subjectTypes;
      } else {
        merged[key] = input[key];
      }
    });

    merged.users = Array.isArray(merged.users) ? merged.users : [];
    merged.tournaments = Array.isArray(merged.tournaments) ? merged.tournaments : [];
    merged.matches = Array.isArray(merged.matches) ? merged.matches : [];
    merged.comments = Array.isArray(merged.comments) ? merged.comments : [];
    merged.subjects = Array.isArray(merged.subjects) ? merged.subjects : [];

    return merged;
  }

  /* ==========================================================
     LOCALSTORAGE (fallback)
     ========================================================== */

  function loadDB() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = safeClone(defaultDB);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    try {
      return normalizeDB(JSON.parse(raw));
    } catch (e) {
      console.error("Database corrupted", e);
      const fresh = safeClone(defaultDB);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
  }

  function saveDB(data) {
    const normalized = normalizeDB(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function getDB() {
    return loadDB();
  }

  function updateDB(callback) {
    const db = loadDB();
    callback(db);
    saveDB(db);
    window.dispatchEvent(new CustomEvent("th-db-changed", { detail: { source: "updateDB" } }));
    return db;
  }

  /* ==========================================================
     SUPABASE АДАПТЕР
     ========================================================== */

  async function syncFromSupabase() {
    if (!window.TH || !USE_SUPABASE) return;

    try {
      // Загружаем настройки
      const { data: settings } = await window.TH.getSiteSettings();
      if (settings) {
        updateDB(db => {
          db.settings.siteName = settings.site_name || db.settings.siteName;
          db.settings.description = settings.description || db.settings.description;
          db.settings.siteLogo = settings.site_logo || db.settings.siteLogo;
          db.settings.theme = settings.theme || db.settings.theme;
          db.settings.accent = settings.accent || db.settings.accent;
        });
      }

      // Загружаем турниры
      const { data: tournaments } = await window.TH.getTournaments();
      if (tournaments) {
        updateDB(db => {
          db.tournaments = tournaments.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            createdAt: t.created_at,
            currentRound: t.current_round,
            winner: t.winner_id,
            completedAt: t.completed_at,
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
          }));
        });
      }
    } catch (e) {
      console.warn('Supabase sync failed, using localStorage', e);
    }
  }

  /* ==========================================================
     USER (совместимость со старым кодом)
     ========================================================== */

  function getCurrentUser() {
    // Проверяем Supabase auth
    if (window.TH && USE_SUPABASE) {
      // Асинхронно нельзя, возвращаем из кэша localStorage
      const id = localStorage.getItem("th_user_id");
      const email = localStorage.getItem("th_user_email");
      const username = localStorage.getItem("th_user_name");
      if (id) {
        return {
          id: id,
          username: username || email || 'user',
          displayName: username || email || 'user',
          email: email,
          role: localStorage.getItem("th_user_role") || 'user',
          votes: parseInt(localStorage.getItem("th_user_votes") || '0'),
          authType: 'supabase'
        };
      }
    }

    // Fallback на старый формат
    const id = localStorage.getItem("th_user");
    if (!id) return null;
    const db = loadDB();
    return db.users.find(u => u.id === id) || null;
  }

  function setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem("th_user");
      localStorage.removeItem("th_user_id");
      localStorage.removeItem("th_user_email");
      localStorage.removeItem("th_user_name");
      localStorage.removeItem("th_user_role");
      localStorage.removeItem("th_user_votes");
      return;
    }

    if (user.authType === 'supabase') {
      localStorage.setItem("th_user_id", user.id);
      localStorage.setItem("th_user_email", user.email || '');
      localStorage.setItem("th_user_name", user.displayName || user.username || '');
      localStorage.setItem("th_user_role", user.role || 'user');
      localStorage.setItem("th_user_votes", String(user.votes || 0));
    } else {
      localStorage.setItem("th_user", user.id);
    }
  }

  // Синхронизация Supabase user в localStorage
  async function syncSupabaseUser() {
    if (!window.TH || !USE_SUPABASE) return;

    try {
      const user = await window.TH.getCurrentUser();
      if (user) {
        const profile = await window.TH.getProfile();
        setCurrentUser({
          id: user.id,
          email: user.email,
          username: profile?.username || user.email,
          displayName: profile?.display_name || profile?.username || user.email,
          role: profile?.role || 'user',
          votes: profile?.votes_count || 0,
          authType: 'supabase'
        });
      } else {
        setCurrentUser(null);
      }
    } catch (e) {
      console.warn('Supabase user sync failed', e);
    }
  }

  /* ==========================================================
     TOAST
     ========================================================== */

  function toast(message) {
    if (typeof console !== "undefined") console.log("[Tournament Hub]", message);
    const existing = document.getElementById("th-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "th-toast";
    el.textContent = String(message ?? "");
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:24px",
      "transform:translateX(-50%)",
      "padding:12px 16px",
      "border-radius:12px",
      "background:rgba(17,24,39,0.95)",
      "color:#fff",
      "font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      "z-index:99999",
      "max-width:min(92vw,680px)",
      "box-shadow:0 10px 30px rgba(0,0,0,.28)"
    ].join(";");

    document.body.appendChild(el);
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, 2200);
  }

  /* ==========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================== */

  async function init() {
    if (window.TH && USE_SUPABASE) {
      window.TH.init();
      await syncSupabaseUser();
      await syncFromSupabase();

      // Подписываемся на изменения auth
      window.TH.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          syncSupabaseUser();
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          localStorage.removeItem("th_admin");
        }
        window.dispatchEvent(new CustomEvent("th-user-changed"));
        if (typeof Auth !== 'undefined' && Auth.renderNavUser) Auth.renderNavUser();
      });
    }
  }

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ==========================================================
     ЭКСПОРТ
     ========================================================== */

  window.DB_KEY = STORAGE_KEY;
  window.DB = { loadDB, getDB, saveDB, updateDB, getCurrentUser, setCurrentUser, syncSupabaseUser };
  window.getDB = getDB;
  window.saveDB = saveDB;
  window.updateDB = updateDB;
  window.getCurrentUser = getCurrentUser;
  window.setCurrentUser = setCurrentUser;
  window.toast = window.toast || toast;

  // Синхронизация между вкладками
  window.addEventListener("storage", function(e) {
    if (e.key === STORAGE_KEY) {
      window.dispatchEvent(new CustomEvent("th-db-changed", { detail: e.newValue }));
    }
    if (e.key === "th_user") {
      window.dispatchEvent(new CustomEvent("th-user-changed", { detail: e.newValue }));
    }
  });

  window.addEventListener("th-db-changed", function() {
    if (typeof Render !== "undefined" && Render.initRender) Render.initRender();
    if (typeof RenderBracket !== "undefined" && RenderBracket.renderBracket) RenderBracket.renderBracket();
    if (typeof Auth !== "undefined" && Auth.renderNavUser) Auth.renderNavUser();
  });

})();
