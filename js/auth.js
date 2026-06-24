/* Tournament Hub Authentication */
(function () {
  const ADMIN_PASSWORD = "admin123";

  // ИСПРАВЛЕНО: более стойкий hash (djb2 вместо простой суммы)
  function hash(str) {
    let out = 5381;
    for (let i = 0; i < str.length; i++) {
      out = ((out << 5) + out) + str.charCodeAt(i); // out * 33 + c
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

  // ИСПРАВЛЕНО: валидация пароля
  function validatePassword(password) {
    if (!password || password.length < 3) {
      return { ok: false, error: "Пароль должен быть минимум 3 символа" };
    }
    return { ok: true };
  }

  function register(username, password) {
    if (!username || !username.trim()) {
      return { success: false, error: "Введите никнейм" };
    }
    const passCheck = validatePassword(password);
    if (!passCheck.ok) {
      return { success: false, error: passCheck.error };
    }

    const db = DB.getDB();
    if (db.users.some(u => u.username === username)) {
      return { success: false, error: "Пользователь существует" };
    }

    const user = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      username,
      password: hash(password),
      created: Date.now(),
      votes: 0,
      role: "user",
      authType: "guest",
      displayName: username
    };

    db.users.push(user);
    DB.saveDB(db);
    DB.setCurrentUser(user);
    return { success: true, user };
  }

  function login(username, password) {
    const db = DB.getDB();
    const user = db.users.find(u => u.username === username && u.password === hash(password));
    if (!user) {
      return { success: false, error: "Неверный логин или пароль" };
    }
    DB.setCurrentUser(user);
    return { success: true, user };
  }

  function logout() {
    DB.setCurrentUser(null);
    localStorage.removeItem("th_admin");
  }

  function isAdmin() {
    return localStorage.getItem("th_admin") === "yes";
  }

  function adminLogin(password) {
    if (password !== ADMIN_PASSWORD) return false;
    localStorage.setItem("th_admin", "yes");
    return true;
  }

  function loginAdmin(password) {
    const ok = adminLogin(password);
    return ok ? { ok: true, err: "" } : { ok: false, err: "Неверный пароль администратора" };
  }

  /* ---------- ГОЛОСОВАНИЕ С ПРИВЯЗКОЙ К ТУРНИРУ ---------- */

  function getTournamentIdByMatch(matchId) {
    const db = DB.getDB();
    for (const t of (db.tournaments || [])) {
      if (!Array.isArray(t.rounds)) continue;
      for (const round of t.rounds) {
        const found = (round.matches || []).find(m => m.id === matchId);
        if (found) return t.id;
      }
    }
    return null;
  }

  function buildVoteKey(matchId) {
    const tournamentId = getTournamentIdByMatch(matchId);
    const base = tournamentId ? ("vote_" + tournamentId + "_" + matchId) : ("vote_" + matchId);
    return base;
  }

  function canUserVote(matchId) {
    const user = DB.getCurrentUser();
    const key = buildVoteKey(matchId);
    return user ? !localStorage.getItem(key + "_" + user.id) : !localStorage.getItem(key);
  }

  function markVote(matchId) {
    const user = DB.getCurrentUser();
    const key = buildVoteKey(matchId);
    localStorage.setItem(user ? key + "_" + user.id : key, "true");
    if (user) {
      user.votes = (user.votes || 0) + 1;
      DB.updateDB(db => {
        const u = db.users.find(x => x.id === user.id);
        if (u) u.votes = user.votes;
      });
    }
  }

  // Миграция старых ключей голосования
  function migrateOldVotes() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vote_") && !k.includes("_")) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  }

  // ИСПРАВЛЕНО: админы из DB.settings.fandomAdmins
  function checkFandomAutoAdmin() {
    const user = DB.getCurrentUser();
    if (!user || !user.fandomName) return;

    const db = DB.getDB();
    const admins = db.settings?.fandomAdmins || [];
    if (admins.includes(user.fandomName)) {
      localStorage.setItem("th_admin", "yes");
      user.role = "admin";
      DB.updateDB(db => {
        const u = db.users.find(x => x.id === user.id);
        if (u) u.role = "admin";
      });
    }
  }

  function renderNavUser() {
    const box = document.getElementById("navUser") || document.getElementById("user-area");
    if (!box) return;

    const user = DB.getCurrentUser();
    if (user) {
      box.innerHTML = `
        <span style="color:var(--text-3);font-size:13px;">${escapeHTML(user.displayName || user.username)}</span>
        <button type="button" class="btn-secondary" style="margin-left:10px;padding:8px 12px;" onclick="Auth.logout(); location.reload();">Выйти</button>
      `;
    } else {
      box.innerHTML = `<a href="login.html" style="color:var(--text-3);font-size:13px;">Войти</a>`;
    }
  }

  function initAuth() {
    migrateOldVotes();
    checkFandomAutoAdmin();
    renderNavUser();
  }

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
    initAuth,
    getTournamentIdByMatch,
    buildVoteKey,
    migrateOldVotes
  };

  window.escapeHTML = escapeHTML;
  window.escapeHtml = escapeHTML;
  window.loginAdmin = loginAdmin;
  window.initAuth = initAuth;
})();