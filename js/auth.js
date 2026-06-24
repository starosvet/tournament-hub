/*!
 * Tournament Hub
 * Authentication
 */

(function () {

  const ADMIN_PASSWORD = "admin123";

  function hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
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
    if (password !== ADMIN_PASSWORD) {
      return false;
    }
    localStorage.setItem("th_admin", "yes");
    return true;
  }

  function canUserVote(id) {
    const user = DB.getCurrentUser();
    const key = "vote_" + id;
    if (user) {
      return !localStorage.getItem(key + "_" + user.id);
    }
    return !localStorage.getItem(key);
  }

  function markVote(id) {
    const user = DB.getCurrentUser();
    const key = "vote_" + id;
    localStorage.setItem(user ? key + "_" + user.id : key, "true");
    if (user) {
      user.votes = (user.votes || 0) + 1;
      DB.updateDB(db => {
        const u = db.users.find(x => x.id === user.id);
        if (u) u.votes = user.votes;
      });
    }
  }

  function renderNavUser() {
    const box = document.getElementById("navUser") || document.getElementById("user-area");
    if (!box) return;

    const user = DB.getCurrentUser();

    if (user) {
      box.innerHTML = `
        <span>${escapeHTML(user.displayName || user.username)}</span>
        <a href="#" onclick="Auth.logout();location.reload();return false;">Выйти</a>
      `;
    } else {
      box.innerHTML = `<a href="login.html">Войти</a>`;
    }
  }

  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function checkFandomAutoAdmin() {
    const user = DB.getCurrentUser();
    if (user && user.fandomName === "Melanthe Weber") {
      localStorage.setItem("th_admin", "yes");
    }
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
    checkFandomAutoAdmin
  };

})();
