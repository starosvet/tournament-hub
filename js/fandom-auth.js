/* ============================================================
   Tournament Hub — Fandom Wiki Authentication (FIXED)
   ============================================================ */

(function () {
  'use strict';

  const FANDOM_API_BASE = "https://chickengun-fanon.fandom.com/ru/api.php";
  const CODE_PREFIX = "TH-";
  const CODE_LENGTH = 6;
  const CODE_TTL_MS = 10 * 60 * 1000;
  const CHECK_INTERVAL = 3000;
  const MAX_CHECKS = 40;

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

  async function fetchUserRecentChanges(fandomName, limit) {
    const url = FANDOM_API_BASE + "?action=query&list=recentchanges" +
      "&rcuser=" + encodeURIComponent(fandomName) +
      "&rclimit=" + (limit || 10) +
      "&rcprop=comment|timestamp|user|title" +
      "&format=json&origin=*";

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.query?.recentchanges || [];
    } catch (e) {
      console.error("Fandom API error:", e);
      return null;
    }
  }

  async function verifyCode(fandomName, code) {
    const changes = await fetchUserRecentChanges(fandomName, 20);
    if (!changes) return { ok: false, error: "Ошибка связи с Fandom" };

    const pending = getPendingAuth();
    if (!pending) return { ok: false, error: "Код устарел. Сгенерируйте новый." };

    for (const rc of changes) {
      const comment = rc.comment || "";
      const regex = new RegExp("(^|\\s)" + code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)");
      if (regex.test(comment)) {
        const editTime = new Date(rc.timestamp).getTime();
        if (editTime >= pending.createdAt - 60000) {
          markPendingVerified();
          return { ok: true, fandomName: rc.user, title: rc.title };
        }
      }
    }
    return { ok: false, error: "Код не найден. Убедитесь, что вы добавили код в описание правки." };
  }

  function startFandomAuth(fandomName) {
    if (!fandomName?.trim()) return { ok: false, error: "Введите имя пользователя Fandom" };
    const cleanName = fandomName.trim();
    const code = generateCode();
    savePendingAuth(code, cleanName);
    return { ok: true, code, fandomName: cleanName };
  }

  async function checkFandomAuth(fandomName, code) {
    return await verifyCode(fandomName, code);
  }

  async function pollFandomAuth(onSuccess, onError, onProgress) {
    const pending = getPendingAuth();
    if (!pending) {
      if (onError) onError("Нет активного кода. Начните авторизацию заново.");
      return;
    }

    let checks = 0;
    const doCheck = async () => {
      checks++;
      if (onProgress) onProgress(checks, MAX_CHECKS);

      const result = await verifyCode(pending.fandomName, pending.code);
      if (result.ok) {
        if (onSuccess) onSuccess(result);
        return;
      }
      if (checks >= MAX_CHECKS) {
        clearPendingAuth();
        if (onError) onError("Время ожидания истекло. Код больше не действителен.");
        return;
      }
      setTimeout(doCheck, CHECK_INTERVAL);
    };
    doCheck();
  }

  function isAdminFandomName(fandomName) {
    const db = DB.getDB();
    const admins = db.settings?.fandomAdmins || [];
    return admins.includes(fandomName);
  }

  // FIX: создаём пользователя в Supabase profiles, а не только в localStorage
  async function completeFandomAuth(fandomName, isAdmin) {
    const pending = getPendingAuth();
    if (!pending || !pending.verified) {
      return { ok: false, error: "Код не подтверждён. Пройдите проверку через Fandom." };
    }
    if (pending.fandomName !== fandomName) {
      return { ok: false, error: "Несоответствие имени пользователя." };
    }

    const shouldBeAdmin = isAdmin || isAdminFandomName(fandomName);

    // FIX: создаём/обновляем пользователя в Supabase
    try {
      // Создаём анонимного пользователя в Supabase для Fandom-юзера
      const email = fandomName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@fandom.local';
      const password = 'fandom_' + Date.now();

      const { data: signUpData, error: signUpError } = await window.TH.signUp(email, password, {
        username: fandomName,
        display_name: fandomName,
        role: shouldBeAdmin ? 'admin' : 'user',
        fandom_name: fandomName
      });

      if (signUpError && !signUpError.message?.includes('already registered')) {
        return { ok: false, error: signUpError.message };
      }

      // Если уже существует — входим
      const { data: signInData, error: signInError } = await window.TH.signIn(email, password);
      if (signInError && !signUpData?.user) {
        return { ok: false, error: signInError.message };
      }

      const user = {
        id: signUpData?.user?.id || signInData?.user?.id,
        email: email,
        username: fandomName,
        displayName: fandomName,
        role: shouldBeAdmin ? 'admin' : 'user',
        votes: 0,
        authType: 'fandom',
        fandomName: fandomName
      };

      DB.setCurrentUser(user);
      clearPendingAuth();

      if (shouldBeAdmin) localStorage.setItem("th_admin", "yes");

      return { ok: true, user };
    } catch (e) {
      // Fallback на старый метод
      const db = DB.getDB();
      let user = db.users?.find(u => u.fandomName === fandomName);

      if (!user) {
        user = {
          id: crypto.randomUUID ? crypto.randomUUID() : ("fandom_" + Date.now()),
          username: fandomName,
          password: null,
          created: Date.now(),
          votes: 0,
          role: shouldBeAdmin ? "admin" : "user",
          authType: "fandom",
          displayName: fandomName,
          fandomName: fandomName
        };
        db.users = db.users || [];
        db.users.push(user);
        DB.saveDB(db);
      } else {
        user.authType = "fandom";
        user.fandomName = fandomName;
        if (shouldBeAdmin) user.role = "admin";
        DB.saveDB(db);
      }

      DB.setCurrentUser(user);
      clearPendingAuth();
      if (shouldBeAdmin) localStorage.setItem("th_admin", "yes");

      return { ok: true, user };
    }
  }

  function isFandomUser() {
    const user = DB.getCurrentUser();
    return user && user.authType === "fandom";
  }

  window.FandomAuth = {
    startFandomAuth,
    checkFandomAuth,
    pollFandomAuth,
    completeFandomAuth,
    isFandomUser,
    getPendingAuth,
    clearPendingAuth,
    isAdminFandomName
  };
})();
