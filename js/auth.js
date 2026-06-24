/* Tournament Hub Authentication */
(function () {
  const ADMIN_PASSWORD = "admin123";

  function hash(str) {
    let out = 0;
    for (let i = 0; i < str.length; i++) {
      out = ((out << 5) - out) + str.charCodeAt(i);
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

  function register(username, password) {
    if (!username || !password) {
      return { success: false, error: "Заполни все поля" };
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

  // Вспомогательная: получить tournamentId по matchId
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

  // Ключ голоса: vote_<tournamentId>_<matchId>[_<userId>]
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

  // Очистка старых ключей голосования (миграция)
  function migrateOldVotes() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("vote_") && !k.includes("_")) {
        // Старый формат: vote_<matchId> без tournamentId
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
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

  function checkFandomAutoAdmin() {
    const user = DB.getCurrentUser();
    if (user && user.fandomName === "Melanthe Weber") {
      localStorage.setItem("th_admin", "yes");
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
    // Вспомогательные для внешнего использования
    getTournamentIdByMatch,
    buildVoteKey,
    migrateOldVotes
  };

  window.escapeHTML = escapeHTML;
  window.escapeHtml = escapeHTML; // legacy admin code uses this spelling
  window.loginAdmin = loginAdmin;
  window.initAuth = initAuth;
})();