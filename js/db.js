/* ============================================================
   Tournament Hub — Database Layer (FIXED v10 — persistent auth, no loops)
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = "tournament_hub_db";

  const defaultDB = {
    users: [], tournaments: [], matches: [], comments: [], subjects: [],
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

    return merged;
  }

  /* ==========================================================
     LOCALSTORAGE
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
    return db;
  }

  /* ==========================================================
     SUPABASE SYNC
     ========================================================== */
  async function syncFromSupabase() {
    if (!window.TH) return false;

    try {
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
          const active = tournaments.find(t => t.status === 'active');
          if (active) db.activeTournamentId = active.id;
        });
      }
      return true;
    } catch (e) {
      console.warn('Supabase sync failed, using cached localStorage', e);
      return false;
    }
  }

  /* ==========================================================
     USER — FIXED: always check Supabase session first
     ========================================================== */
  async function getCurrentUser() {
    // Сначала проверяем Supabase сессию
    if (window.TH) {
      try {
        const session = await window.TH.getSession();
        if (session?.user) {
          let profile = null;
          try {
            profile = await window.TH.getProfile();
          } catch (e) {
            // Профиля может не быть — нормально
          }

          const meta = session.user.user_metadata || {};
          const emailName = session.user.email?.split('@')[0] || 'user';

          const user = {
            id: session.user.id,
            username: profile?.username || meta.username || meta.name || emailName,
            displayName: profile?.display_name || meta.display_name || meta.name || meta.username || emailName,
            email: session.user.email,
            role: profile?.role || meta.role || localStorage.getItem("th_user_role") || 'user',
            votes: profile?.votes_count || parseInt(localStorage.getItem("th_user_votes") || '0'),
            authType: meta.provider === 'google' ? 'google' : 'supabase',
            avatar: profile?.avatar_url || meta.avatar_url || meta.picture || '',
            fandomName: profile?.fandom_name || meta.fandom_name || null,
            fandomVerified: profile?.fandom_verified || meta.fandom_verified || false
          };

          // Сохраняем в localStorage для fallback
          setCurrentUser(user);
          return user;
        }
      } catch (e) {
        console.warn('Supabase getSession failed, trying cache', e);
      }
    }

    // Fallback на localStorage
    const id = localStorage.getItem("th_user_id");
    if (id) {
      return {
        id: id,
        username: localStorage.getItem("th_user_name") || 'user',
        displayName: localStorage.getItem("th_user_name") || 'user',
        email: localStorage.getItem("th_user_email") || '',
        role: localStorage.getItem("th_user_role") || 'user',
        votes: parseInt(localStorage.getItem("th_user_votes") || '0'),
        authType: 'supabase',
        avatar: '',
        fandomName: null,
        fandomVerified: false
      };
    }

    return null;
  }

  function setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem("th_user_id");
      localStorage.removeItem("th_user_email");
      localStorage.removeItem("th_user_name");
      localStorage.removeItem("th_user_role");
      localStorage.removeItem("th_user_votes");
      return;
    }

    localStorage.setItem("th_user_id", user.id);
    localStorage.setItem("th_user_email", user.email || '');
    localStorage.setItem("th_user_name", user.displayName || user.username || '');
    localStorage.setItem("th_user_role", user.role || 'user');
    localStorage.setItem("th_user_votes", String(user.votes || 0));
  }

  async function syncSupabaseUser() {
    if (!window.TH) return;

    try {
      const session = await window.TH.getSession();
      if (!session?.user) {
        setCurrentUser(null);
        return;
      }

      const meta = session.user.user_metadata || {};
      const emailName = session.user.email?.split('@')[0] || 'user';

      const { data: profile, error: upsertError } = await window.TH.upsertProfile({
        username: meta.username || meta.name || emailName,
        display_name: meta.display_name || meta.name || meta.username || emailName,
        avatar_url: meta.avatar_url || meta.picture || '',
        role: meta.role || 'user'
      });

      if (upsertError) {
        console.warn('Profile upsert failed:', upsertError);
      }

      const baseUser = {
        id: session.user.id,
        email: session.user.email,
        username: profile?.username || meta.username || meta.name || emailName,
        displayName: profile?.display_name || meta.display_name || meta.name || meta.username || emailName,
        role: profile?.role || meta.role || 'user',
        votes: profile?.votes_count || 0,
        authType: meta.provider === 'google' ? 'google' : 'supabase',
        avatar: profile?.avatar_url || meta.avatar_url || meta.picture || '',
        fandomName: profile?.fandom_name || meta.fandom_name || null,
        fandomVerified: profile?.fandom_verified || meta.fandom_verified || false
      };

      setCurrentUser(baseUser);

      if (baseUser.role === 'admin') localStorage.setItem("th_admin", "yes");

      cleanupLegacyData();
    } catch (e) {
      console.warn('Supabase user sync failed', e);
    }
  }

  /* ==========================================================
     MIGRATION
     ========================================================== */
  async function migrateToSupabase() {
    if (!window.TH) {
      return { success: false, error: "Supabase не доступен" };
    }

    const db = loadDB();
    const results = { tournaments: 0, users: 0, errors: [] };

    try {
      if (db.settings) {
        await window.TH.updateSiteSettings({
          site_name: db.settings.siteName,
          description: db.settings.description,
          site_logo: db.settings.siteLogo,
          theme: db.settings.theme,
          accent: db.settings.accent
        });
      }

      for (const t of (db.tournaments || [])) {
        try {
          if (!t.title) continue;

          const { data: newTournament } = await window.TH.createTournament({
            title: t.title,
            description: t.description || '',
            status: t.status === 'active' ? 'draft' : t.status,
            current_round: t.currentRound || 0
          });

          if (newTournament) {
            results.tournaments++;

            if (t.players?.length) {
              const players = t.players.map((p, i) => ({
                tournament_id: newTournament.id,
                name: p.name || p.title || 'Без имени',
                image_url: p.image || p.image_url || '',
                type: p.type || 'character',
                description: p.description || '',
                seed: i
              }));
              await window.TH.createPlayers(players);
            }
          }
        } catch (e) {
          results.errors.push(`Турнир "${t.title}": ${e.message}`);
        }
      }

      updateDB(db => {
        db._migratedToSupabase = new Date().toISOString();
        db._migrationResults = results;
      });

      return { success: true, results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function hasLegacyData() {
    const db = loadDB();
    return (db.tournaments?.length > 0 && !db._migratedToSupabase) ||
           (db.users?.some(u => u.authType === 'local' || u.authType === 'fandom'));
  }

  function getMigrationStatus() {
    const db = loadDB();
    return {
      migrated: !!db._migratedToSupabase,
      date: db._migratedToSupabase || null,
      results: db._migrationResults || null,
      legacyTournaments: (db.tournaments || []).length,
      legacyUsers: (db.users || []).length
    };
  }

  /* ==========================================================
     CLEANUP
     ========================================================== */
  function cleanupLegacyData() {
    const keysToKeep = [
      'th_user_id', 'th_user_email', 'th_user_name', 'th_user_role', 'th_user_votes',
      'th_admin', 'th_fandom_pending', 'tournament_hub_db', 'th_supabase_auth'
    ];

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('th_') && !keysToKeep.includes(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    updateDB(db => {
      db.users = [];
    });
  }

  function clearAllLocalData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('th_') || key === 'tournament_hub_db')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  /* ==========================================================
     TOAST
     ========================================================== */
  function toast(message) {
    const existing = document.getElementById("th-toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "th-toast";
    el.textContent = String(message ?? "");
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:rgba(17,24,39,0.95);color:#fff;font:14px/1.4 system-ui,sans-serif;z-index:99999;max-width:min(92vw,680px);box-shadow:0 10px 30px rgba(0,0,0,.28);";
    document.body.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 2200);
  }

  /* ==========================================================
     INIT
     ========================================================== */
  async function init() {
    if (!window.TH) {
      console.warn('DB.init: window.TH not ready, retrying...');
      setTimeout(init, 500);
      return;
    }

    window.TH.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await syncSupabaseUser();
        cleanupLegacyData();
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        localStorage.removeItem("th_admin");
      }
      if (typeof Auth !== 'undefined' && Auth.renderNavUser) Auth.renderNavUser();
    });

    await syncSupabaseUser();
    await syncFromSupabase();
    console.log('✅ DB initialized');
  }

  /* ==========================================================
     EXPORT
     ========================================================== */
  window.DB_KEY = STORAGE_KEY;
  window.DB = {
    loadDB, getDB, saveDB, updateDB,
    getCurrentUser, setCurrentUser, syncSupabaseUser,
    migrateToSupabase, hasLegacyData, getMigrationStatus,
    cleanupLegacyData, clearAllLocalData
  };
  window.getDB = getDB;
  window.saveDB = saveDB;
  window.updateDB = updateDB;
  window.getCurrentUser = getCurrentUser;
  window.setCurrentUser = setCurrentUser;
  window.toast = toast;

  window.DB._init = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (window.TH) init();
      }, 300);
    });
  } else {
    setTimeout(() => {
      if (window.TH) init();
    }, 300);
  }

})();
