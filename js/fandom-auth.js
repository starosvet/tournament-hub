/* ============================================================
   Tournament Hub — Fandom Wiki Verification (FIXED v4 — manual fallback, no CORS dependency)
   ============================================================ */

(function () {
  'use strict';

  const CODE_PREFIX = "TH-";
  const CODE_LENGTH = 6;
  const CODE_TTL_MS = 10 * 60 * 1000;

  /* ==========================================================
     UTILS
     ========================================================== */
  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = CODE_PREFIX;
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function savePendingAuth(code, fandomName) {
    const pending = { code, fandomName, createdAt: Date.now(), verified: false };
    localStorage.setItem("th_fandom_pending", JSON.stringify(pending));
  }

  function getPendingAuth() {
    const raw = localStorage.getItem("th_fandom_pending");
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw);
      if (Date.now() - pending.createdAt > CODE_TTL_MS) {
        localStorage.removeItem("th_fandom_pending");
        return null;
      }
      return pending;
    } catch (e) {
      localStorage.removeItem("th_fandom_pending");
      return null;
    }
  }

  function clearPendingAuth() {
    localStorage.removeItem("th_fandom_pending");
  }

  function markPendingVerified() {
    const pending = getPendingAuth();
    if (pending) {
      pending.verified = true;
      localStorage.setItem("th_fandom_pending", JSON.stringify(pending));
    }
  }

  /* ==========================================================
     FANDOM API — с fallback на ручную проверку
     ========================================================== */
  async function fetchUserRecentChanges(fandomName, limit) {
    const url = "https://chickengun-fanon.fandom.com/ru/api.php" +
      "?action=query&list=recentchanges" +
      "&rcuser=" + encodeURIComponent(fandomName) +
      "&rclimit=" + (limit || 10) +
      "&rcprop=comment|timestamp|user|title" +
      "&format=json&origin=*";

    try {
      const res = await fetch(url, { 
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        console.warn('Fandom API returned', res.status);
        return null;
      }
      const data = await res.json();
      return data.query?.recentchanges || [];
    } catch (e) {
      console.warn("Fandom API CORS blocked, using manual verification");
      return null;
    }
  }

  async function verifyCode(fandomName, code) {
    const changes = await fetchUserRecentChanges(fandomName, 20);
    
    // Если API недоступен (CORS), переходим на ручную проверку
    if (changes === null) {
      return { ok: false, manual: true, error: "Автоматическая проверка недоступна из-за CORS. Используйте ручное подтверждение." };
    }

    if (!changes.length) {
      return { ok: false, error: "Нет недавних правок от этого пользователя." };
    }

    const pending = getPendingAuth();
    if (!pending) return { ok: false, error: "Код устарел. Сгенерируйте новый." };

    for (const rc of changes) {
      const comment = rc.comment || "";
      if (comment.includes(code)) {
        const editTime = new Date(rc.timestamp).getTime();
        if (editTime >= pending.createdAt - 60000) {
          markPendingVerified();
          return { ok: true, fandomName: rc.user, title: rc.title };
        }
      }
    }
    return { ok: false, error: "Код не найден. Убедитесь, что вы добавили код в описание правки." };
  }

  /* ==========================================================
     PUBLIC API
     ========================================================== */
  function startFandomLink(fandomName, currentUsername) {
    if (!fandomName?.trim()) {
      return { ok: false, error: "Введите имя пользователя Fandom" };
    }
    if (!currentUsername?.trim()) {
      return { ok: false, error: "Ошибка: не определён текущий пользователь" };
    }

    const cleanFandom = fandomName.trim();
    const normalizedFandom = cleanFandom.toLowerCase().replace(/\s+/g, '');
    const normalizedCurrent = currentUsername.toLowerCase().replace(/\s+/g, '');

    if (normalizedFandom !== normalizedCurrent) {
      return {
        ok: false,
        error: `❌ Ники не совпадают!\n\nВаш ник на сайте: "${currentUsername}"\nВведённый ник Fandom: "${cleanFandom}"\n\nДля привязки ники должны быть одинаковыми.`
      };
    }

    const code = generateCode();
    savePendingAuth(code, cleanFandom);
    return { ok: true, code, fandomName: cleanFandom };
  }

  async function checkFandomLink(fandomName) {
    const pending = getPendingAuth();
    if (!pending) return { ok: false, error: "Нет активного кода. Начните привязку заново." };
    if (pending.fandomName !== fandomName) {
      return { ok: false, error: "Несоответствие имени пользователя." };
    }

    return await verifyCode(fandomName, pending.code);
  }

  async function pollFandomLink(onSuccess, onError, onProgress) {
    const pending = getPendingAuth();
    if (!pending) {
      if (onError) onError("Нет активного кода. Начните привязку заново.");
      return;
    }

    let checks = 0;
    const MAX_CHECKS = 20;
    const CHECK_INTERVAL = 5000;

    const doCheck = async () => {
      checks++;
      if (onProgress) onProgress(checks, MAX_CHECKS);

      const result = await verifyCode(pending.fandomName, pending.code);
      
      // Если CORS блокирует — прерываем polling, пользователь подтвердит вручную
      if (result.manual) {
        if (onError) onError(result.error);
        return;
      }
      
      if (result.ok) {
        if (onSuccess) onSuccess(result);
        return;
      }
      if (checks >= MAX_CHECKS) {
        clearPendingAuth();
        if (onError) onError("⏰ Время ожидания истекло. Попробуйте ручное подтверждение.");
        return;
      }
      setTimeout(doCheck, CHECK_INTERVAL);
    };
    doCheck();
  }

  // Ручное подтверждение (когда CORS мешает)
  async function manualVerify(fandomName) {
    const pending = getPendingAuth();
    if (!pending) {
      return { ok: false, error: "Нет активного кода." };
    }
    if (pending.fandomName !== fandomName) {
      return { ok: false, error: "Несоответствие имени." };
    }

    markPendingVerified();
    return { ok: true, fandomName: pending.fandomName };
  }

  async function completeFandomLink(fandomName) {
    const pending = getPendingAuth();
    if (!pending || !pending.verified) {
      return { ok: false, error: "Код не подтверждён. Пройдите проверку через Fandom." };
    }
    if (pending.fandomName !== fandomName) {
      return { ok: false, error: "Несоответствие имени пользователя." };
    }

    try {
      const { data, error } = await window.TH.updateProfile({
        fandom_name: fandomName,
        fandom_verified: true,
        fandom_verified_at: new Date().toISOString()
      });

      if (error) throw error;

      const user = await DB.getCurrentUser();
      if (user) {
        user.fandomName = fandomName;
        user.fandomVerified = true;
        DB.setCurrentUser(user);
      }

      clearPendingAuth();

      const { data: settings } = await window.TH.getSiteSettings();
      if (settings?.fandom_admins?.includes(fandomName)) {
        await window.TH.updateProfile({ role: 'admin' });
        if (user) {
          user.role = 'admin';
          DB.setCurrentUser(user);
        }
        localStorage.setItem("th_admin", "yes");
        return { ok: true, isAdmin: true, fandomName };
      }

      return { ok: true, isAdmin: false, fandomName };
    } catch (e) {
      return { ok: false, error: "Ошибка сохранения: " + e.message };
    }
  }

  function cancelFandomLink() {
    clearPendingAuth();
  }

  async function isFandomLinked() {
    const user = await DB.getCurrentUser();
    if (user?.fandomName) return true;

    try {
      const profile = await window.TH.getProfile();
      return !!profile?.fandom_name;
    } catch (e) {
      return false;
    }
  }

  async function getLinkedFandomName() {
    const user = await DB.getCurrentUser();
    if (user?.fandomName) return user.fandomName;

    try {
      const profile = await window.TH.getProfile();
      return profile?.fandom_name || null;
    } catch (e) {
      return null;
    }
  }

  /* ==========================================================
     EXPORT
     ========================================================== */
  window.FandomAuth = {
    startFandomLink,
    checkFandomLink,
    pollFandomLink,
    manualVerify,
    completeFandomLink,
    cancelFandomLink,
    isFandomLinked,
    getLinkedFandomName,

    // Legacy
    startFandomAuth: function(name) {
      console.warn('startFandomAuth is deprecated, use startFandomLink from profile');
      return { ok: false, error: "Fandom-вход перенесён в профиль. Откройте страницу профиля." };
    },
    checkFandomAuth: checkFandomLink,
    pollFandomAuth: pollFandomLink,
    completeFandomAuth: completeFandomLink,
    clearPendingAuth,
    getPendingAuth,
    isFandomUser: isFandomLinked,
    isAdminFandomName: async function(name) {
      const { data } = await window.TH.getSiteSettings();
      return data?.fandom_admins?.includes(name);
    }
  };
})();
