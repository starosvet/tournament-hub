/* ============================================================
   Tournament Hub Authentication (Supabase)
   Заменяет старый auth.js — полная интеграция с Supabase Auth
   ============================================================ */

(function () {
  'use strict';

  const ADMIN_PASSWORD = "NecroZeroCode"; // Для аварийного доступа

  /* ==========================================================
     УТИЛИТЫ
     ========================================================== */

  function hash(str) {
    let out = 5381;
    for (let i = 0; i < str.length; i++) {
      out = ((out << 5) + out) + str.charCodeAt(i);
      out |= 0;
    }
    return String(out);
  }

  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ==========================================================
     SUPABASE AUTH
     ========================================================== */

  async function register(username, password, email) {
    if (!username || !username.trim()) {
      return { success: false, error: "Введите никнейм" };
    }
    if (!password || password.length < 6) {
      return { success: false, error: "Пароль минимум 6 символов" };
    }
    if (!email || !email.includes('@')) {
      return { success: false, error: "Введите корректный email" };
    }

    try {
      const { data, error } = await window.TH.signUp(email, password, {
        username: username.trim(),
        display_name: username.trim(),
        role: 'user'
      });

      if (error) {
        // Переводим типичные ошибки Supabase
        if (error.message.includes('already registered')) {
          return { success: false, error: "Пользователь с таким email уже существует" };
        }
        return { success: false, error: error.message };
      }

      // Сохраняем локально для совместимости
      if (data?.user) {
        const user = {
          id: data.user.id,
          email: data.user.email,
          username: username.trim(),
          displayName: username.trim(),
          role: 'user',
          votes: 0,
          authType: 'supabase'
        };
        DB.setCurrentUser(user);
        return { success: true, user };
      }

      return { success: false, error: "Ошибка регистрации" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function login(email, password) {
    if (!email || !password) {
      return { success: false, error: "Введите email и пароль" };
    }

    try {
      const { data, error } = await window.TH.signIn(email, password);

      if (error) {
        return { success: false, error: "Неверный email или пароль" };
      }

      if (data?.user) {
        // Получаем профиль из Supabase
        const profile = await window.TH.getProfile();
        const user = {
          id: data.user.id,
          email: data.user.email,
          username: profile?.username || data.user.email,
          displayName: profile?.display_name || profile?.username || data.user.email,
          role: profile?.role || 'user',
          votes: profile?.votes_count || 0,
          authType: 'supabase'
        };
        DB.setCurrentUser(user);

        // Проверяем админку
        if (user.role === 'admin') {
          localStorage.setItem("th_admin", "yes");
        }

        return { success: true, user };
      }

      return { success: false, error: "Ошибка входа" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function logout() {
    try {
      await window.TH.signOut();
    } catch (e) {
      console.warn('Supabase logout error', e);
    }

    DB.setCurrentUser(null);
    localStorage.removeItem("th_admin");
    localStorage.removeItem("th_fandom_pending");

    // Перезагружаем страницу для очистки состояния
    location.reload();
  }

  function isAdmin() {
    return localStorage.getItem("th_admin") === "yes";
  }

  function adminLogin(password) {
    if (password !== ADMIN_PASSWORD) return false;
    localStorage.setItem("th_admin", "yes");
    return true;
  }

  /* ==========================================================
     ГОЛОСОВАНИЕ (Supabase)
     ========================================================== */

  async function canUserVote(matchId) {
    const user = DB.getCurrentUser();
    if (!user) return false;

    try {
      const hasVoted = await window.TH.hasVoted(matchId);
      return !hasVoted;
    } catch (e) {
      // Fallback на localStorage
      const key = "vote_" + matchId + "_" + user.id;
      return !localStorage.getItem(key);
    }
  }

  async function markVote(matchId, tournamentId, playerNumber) {
    const user = DB.getCurrentUser();
    if (!user) return;

    try {
      const { error } = await window.TH.castVote(matchId, tournamentId, playerNumber);
      if (!error) {
        // Обновляем локальный счётчик голосов пользователя
        user.votes = (user.votes || 0) + 1;
        DB.setCurrentUser(user);
      }
    } catch (e) {
      // Fallback
      const key = "vote_" + matchId + "_" + user.id;
      localStorage.setItem(key, "true");
      user.votes = (user.votes || 0) + 1;
      DB.setCurrentUser(user);
    }
  }

  /* ==========================================================
     НАВИГАЦИЯ / UI
     ========================================================== */

  function renderNavUser() {
    const box = document.getElementById("navUser") || document.getElementById("user-area");
    if (!box) return;

    const user = DB.getCurrentUser();
    if (user) {
      box.innerHTML = `
        <span style="color:var(--text-3);font-size:13px;">${escapeHTML(user.displayName || user.username)}</span>
        <button type="button" class="btn-secondary" style="margin-left:10px;padding:8px 12px;" onclick="Auth.logout();">Выйти</button>
      `;
    } else {
      box.innerHTML = `<a href="login.html" style="color:var(--text-3);font-size:13px;">Войти</a>`;
    }
  }

  /* ==========================================================
     FANDOM AUTH (сохраняем совместимость)
     ========================================================== */

  function checkFandomAutoAdmin() {
    // Проверяем Fandom-админов из Supabase settings
    const user = DB.getCurrentUser();
    if (!user || !user.fandomName) return;

    // Загружаем из Supabase
    window.TH.getSiteSettings().then(({ data }) => {
      if (data?.fandom_admins?.includes(user.fandomName)) {
        localStorage.setItem("th_admin", "yes");
        user.role = "admin";
        DB.setCurrentUser(user);
      }
    });
  }

  /* ==========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================== */

  async function initAuth() {
    // Проверяем текущую сессию Supabase
    if (window.TH) {
      const session = await window.TH.getSession();
      if (session) {
        await DB.syncSupabaseUser();
        const user = DB.getCurrentUser();
        if (user && user.role === 'admin') {
          localStorage.setItem("th_admin", "yes");
        }
      }
    }

    renderNavUser();
    checkFandomAutoAdmin();
  }

  /* ==========================================================
     ЭКСПОРТ
     ========================================================== */

  window.Auth = {
    register,
    login,
    logout,
    isAdmin,
    adminLogin,
    canUserVote,
    markVote,
    renderNavUser,
    checkFandomAutoAdmin,
    initAuth
  };

  window.escapeHTML = escapeHTML;
  window.escapeHtml = escapeHTML;
  window.loginAdmin = adminLogin;
  window.initAuth = initAuth;

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

})();
