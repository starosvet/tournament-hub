/* ============================================================
   Tournament Hub — Data Bridge Layer (FIXED v9 — multi-page sync & storage)
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = "tournament_hub_data";
  const USER_KEY = "tournament_hub_user";

  let defaultDB = {
    tournaments: [],
    players: [],
    settings: {
      siteName: "Tournament Hub",
      allowGuestVotes: true,
      theme: "dark"
    }
  };

  function escapeHTML(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getDB() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : defaultDB;
    } catch (e) {
      console.warn("Ошибка чтения локальной БД, сброс на дефолт:", e);
      return defaultDB;
    }
  }

  function saveDB(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Критическая ошибка записи локальной БД:", e);
    }
  }

  async function getCurrentUser() {
    try {
      const localUser = localStorage.getItem(USER_KEY);
      return localUser ? JSON.parse(localUser) : null;
    } catch (e) {
      return null;
    }
  }

  async function setCurrentUser(userObj) {
    try {
      if (userObj) {
        localStorage.setItem(USER_KEY, JSON.stringify(userObj));
        localStorage.setItem("th_user", JSON.stringify({ role: userObj.role || 'user' }));
      } else {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem("th_user");
      }
    } catch (e) {
      console.error("Ошибка сохранения состояния пользователя:", e);
    }
  }

  function clearAllLocalData() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("th_admin");
    localStorage.removeItem("th_voted_matches");
    localStorage.removeItem("th_supabase_auth");
  }

  // --- СИНХРОНИЗАЦИЯ С СЕРВЕРОМ SUPABASE ---
  async function syncWithSupabase() {
    if (!window.TH || typeof window.TH.getClient !== 'function') return;

    try {
      // 1. Синхронизируем текущего пользователя
      const serverUser = await window.TH.getCurrentUser();
      if (serverUser) {
        await setCurrentUser(serverUser);
      } else {
        await setCurrentUser(null);
      }

      // 2. Выкачиваем актуальные турниры
      const { data: tournaments, error: tErr } = await window.TH.getTournaments();
      if (!tErr && tournaments) {
        let dbData = getDB();
        dbData.tournaments = tournaments;
        saveDB(dbData);
      }
    } catch (e) {
      console.warn("Supabase синхронизация недоступна, работаем в автономном режиме кэша:", e);
    }
  }

  // Автоматический запуск синхронизации при готовности ядра
  document.addEventListener("DOMContentLoaded", function () {
    let checkTicks = 0;
    const bridgeInit = setInterval(async () => {
      if (window.TH && typeof window.TH.onAuthStateChange === 'function') {
        clearInterval(bridgeInit);
        
        // Подписываемся на динамические изменения сессии
        window.TH.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            const freshUser = await window.TH.getCurrentUser();
            await setCurrentUser(freshUser);
          } else {
            await setCurrentUser(null);
          }
          if (window.Auth && typeof window.Auth.renderNavUser === 'function') {
            window.Auth.renderNavUser();
          }
        });

        await syncWithSupabase();
        if (window.Auth && typeof window.Auth.renderNavUser === 'function') {
          window.Auth.renderNavUser();
        }
      }
      checkTicks++;
      if (checkTicks > 40) clearInterval(bridgeInit);
    }, 50);
  });

  // Экспорт модуля в глобальное окно браузера
  window.DB = {
    getDB,
    saveDB,
    getCurrentUser,
    setCurrentUser,
    clearAllLocalData,
    syncWithSupabase,
    escapeHTML
  };
})();
