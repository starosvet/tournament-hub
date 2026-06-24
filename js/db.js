/* Tournament Hub Local database layer */
(function () {
  const STORAGE_KEY = "tournament_hub_db";

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
    merged.subjectTypes = Array.isArray(merged.subjectTypes) && merged.subjectTypes.length
      ? merged.subjectTypes
      : safeClone(defaultDB.subjectTypes);

    return merged;
  }

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
    // 🔧 FIX: синхронизация внутри текущей вкладки
    window.dispatchEvent(new CustomEvent("th-db-changed", { detail: { source: "updateDB" } }));
    return db;
  }

  function getCurrentUser() {
    const id = localStorage.getItem("th_user");
    if (!id) return null;
    const db = loadDB();
    return db.users.find(u => u.id === id) || null;
  }

  function setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem("th_user");
      return;
    }
    localStorage.setItem("th_user", user.id);
  }

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

  window.DB_KEY = STORAGE_KEY;
  window.DB = { loadDB, getDB, saveDB, updateDB, getCurrentUser, setCurrentUser };

  window.getDB = getDB;
  window.saveDB = saveDB;
  window.updateDB = updateDB;
  window.getCurrentUser = getCurrentUser;
  window.setCurrentUser = setCurrentUser;
  window.toast = window.toast || toast;

  (function initStorageSync() {
    if (typeof window === "undefined") return;

    window.addEventListener("storage", function(e) {
      if (e.key === STORAGE_KEY) {
        window.dispatchEvent(new CustomEvent("th-db-changed", { detail: e.newValue }));
      }
      if (e.key === "th_user") {
        window.dispatchEvent(new CustomEvent("th-user-changed", { detail: e.newValue }));
      }
      if (e.key === "th_admin") {
        window.dispatchEvent(new CustomEvent("th-admin-changed", { detail: e.newValue }));
      }
    });
  })();

  window.addEventListener("th-db-changed", function() {
    if (typeof Render !== "undefined" && Render.initRender) Render.initRender();
    if (typeof RenderBracket !== "undefined" && RenderBracket.renderBracket) RenderBracket.renderBracket();
    if (typeof Auth !== "undefined" && Auth.renderNavUser) Auth.renderNavUser();
  });
})();
