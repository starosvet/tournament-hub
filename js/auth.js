/* ============================================================
   Tournament Hub Authentication (FIXED v6 — closed IIFE, safe init, no leaks)
   ============================================================ */

(function () {
  'use strict';

  const ADMIN_PASSWORD = "admin123";

  function hash(str) {
    let out = 5381;
    for (let i = 0; i < str.length; i++) {
      out = ((out << 5) + out) + str.charCodeAt(i);
      out |= 0;
    }
    return String(out);
  }

  /* ==========================================================
     SUPABASE AUTH
     ========================================================== */
  async function register(username, password, email) {
    if (!username?.trim()) return { success: false, error: "Введите никнейм" };
    if (!password || password.length < 6) return { success: false, error: "Пароль минимум 6 символов" };
    if (!email?.includes('@')) return { success: false, error: "Введите корректный email" };

    try {
      const { data, error } = await window.TH.signUp(email, password, {
        username: username.trim(),
        display_name: username.trim(),
        role: 'user'
      });

      if (error) {
        if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
          return { success: false, error: "Пользователь с таким email уже существует" };
        }
        return { success: false, error: error.message };
      }

      if (data?.user) {
        // Создаём/обновляем профиль
        await window.TH.upsertProfile({
          username: username.trim(),
          display_name: username.trim(),
          role: 'user'
        });

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
    if (!email || !password) return { success: false, error: "Введите email и пароль" };

    try {
      const { data, error } = await window.TH.signIn(email, password);
      if (error) return { success: false, error: "Неверный email или пароль" };

      if (data?.user) {
        await DB.syncSupabaseUser();
        const user = await DB.getCurrentUser();
        if (user) {
          if (user.role === 'admin') localStorage.setItem("th_admin", "yes");
          return { success: true, user };
        }
      }
      return { success: false, error: "Ошибка входа" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function logout() {
    try { await window.TH.signOut(); } catch (e) { console.warn('Supabase logout error', e); }
    DB.setCurrentUser(null);
    localStorage.removeItem("th_admin");
    localStorage.removeItem("th_fandom_pending");
    // Чистим только наши ключи, не всё подряд
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('th_') || key === 'tournament_hub_db')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    location.reload();
  }

  async function isAdmin() {
    if (localStorage.getItem("th_admin") === "yes") return true;

    if (window.TH) {
      try {
        const profile = await window.TH.getProfile();
        if (profile?.role === 'admin') {
          localStorage.setItem("th_admin", "yes");
          return true;
        }
      } catch (e) {
        console.warn('Supabase admin check failed', e);
      }
    }
    return false;
  }

  // FIX: isAdminSync теперь делает async проверку если флаг не установлен
  function isAdminSync() {
    const cached = localStorage.getItem("th_admin") === "yes";
    if (cached) return true;

    if (window.TH && !window._adminCheckPending) {
      window._adminCheckPending = true;
      isAdmin().then(result => {
        window._adminCheckPending = false;
        if (result) {
          const navAdmin = document.getElementById("navAdmin");
          if (navAdmin) navAdmin.classList.remove("hidden");
          renderNavUser();
        }
      }).catch(() => { window._adminCheckPending = false; });
    }
    return false;
  }

  function adminLogin(password) {
    if (password !== ADMIN_PASSWORD) return false;
    localStorage.setItem("th_admin", "yes");
    return true;
  }

  /* ==========================================================
     VOTING
     ========================================================== */
  async function canUserVote(matchId) {
    const user = await DB.getCurrentUser();
    if (!user) return false;
    try {
      return !(await window.TH.hasVoted(matchId));
    } catch (e) {
      const key = "vote_" + matchId + "_" + user.id;
      return !localStorage.getItem(key);
    }
  }

  async function markVote(matchId, tournamentId, playerNumber) {
    const user = await DB.getCurrentUser();
    if (!user) return;
    try {
      const { error } = await window.TH.castVote(matchId, tournamentId, playerNumber);
      if (!error) {
        user.votes = (user.votes || 0) + 1;
        DB.setCurrentUser(user);
      }
    } catch (e) {
      const key = "vote_" + matchId + "_" + user.id;
      localStorage.setItem(key, "true");
      user.votes = (user.votes || 0) + 1;
      DB.setCurrentUser(user);
    }
  }

  /* ==========================================================
     UI
     ========================================================== */
  function renderNavUser() {
    const box = document.getElementById("navUser");
    if (!box) return;

    DB.getCurrentUser().then(user => {
      if (user) {
        const avatar = user.avatar ? `<img src="${escapeHTML(user.avatar)}" class="avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:8px;">` : '';
        box.innerHTML = `
          ${avatar}
          <span style="color:var(--text-3);font-size:13px;">${escapeHTML(user.displayName || user.username)}</span>
          <button type="button" class="btn-secondary" style="margin-left:10px;padding:8px 12px;" onclick="Auth.logout();">Выйти</button>
        `;
      } else {
        box.innerHTML = `<a href="login.html" style="color:var(--text-3);font-size:13px;">Войти</a>`;
      }
    }).catch(e => {
      console.warn('renderNavUser error', e);
      box.innerHTML = `<a href="login.html" style="color:var(--text-3);font-size:13px;">Войти</a>`;
    });
  }

  /* ==========================================================
     FANDOM AUTH
     ========================================================== */
  function checkFandomAutoAdmin() {
    DB.getCurrentUser().then(user => {
      if (!user?.fandomName) return;
      window.TH.getSiteSettings().then(({ data }) => {
        if (data?.fandom_admins?.includes(user.fandomName)) {
          localStorage.setItem("th_admin", "yes");
          user.role = "admin";
          DB.setCurrentUser(user);
        }
      }).catch(() => {});
    }).catch(() => {});
  }

  async function unlinkFandom() {
    try {
      await window.TH.updateProfile({
        fandom_name: null,
        fandom_verified: false,
        fandom_verified_at: null
      });
      const user = await DB.getCurrentUser();
      if (user) {
        user.fandomName = null;
        user.fandomVerified = false;
        DB.setCurrentUser(user);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* ==========================================================
     EXPORT
     ========================================================== */
  window.Auth = {
    register, login, logout, isAdmin, isAdminSync, adminLogin,
    canUserVote, markVote, renderNavUser, checkFandomAutoAdmin, unlinkFandom
  };

})();  // ← FIX: ЗАКРЫВАЮЩАЯ }) ДЛЯ IIFE!
