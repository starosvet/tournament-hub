/* Tournament Hub — Fandom Wiki Authentication */
(function () {

  const FANDOM_API_BASE = "https://chickengun-fanon.fandom.com/ru/api.php";
  const CODE_PREFIX = "TH-";
  const CODE_LENGTH = 6;
  const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут на ввод кода
  const CHECK_INTERVAL = 3000; // проверять каждые 3 сек
  const MAX_CHECKS = 40; // макс 40 попыток = 2 минуты

  /* ---------- helpers ---------- */

  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = CODE_PREFIX;
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function savePendingAuth(code, fandomName) {
    const pending = {
      code: code,
      fandomName: fandomName,
      createdAt: Date.now()
    };
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

  /* ---------- API ---------- */

  // Получаем recentchanges с фильтром по пользователю
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

  // Проверяем, есть ли правка с нашим кодом
  async function verifyCode(fandomName, code) {
    const changes = await fetchUserRecentChanges(fandomName, 20);
    if (!changes) return { ok: false, error: "Ошибка связи с Fandom" };

    const pending = getPendingAuth();
    if (!pending) return { ok: false, error: "Код устарел. Сгенерируйте новый." };

    // Ищем правку с кодом в комментарии
    for (const rc of changes) {
      const comment = rc.comment || "";
      if (comment.includes(code)) {
        // Проверяем, что правка свежая (не старше 15 минут от создания кода)
        const editTime = new Date(rc.timestamp).getTime();
        if (editTime >= pending.createdAt - 60000) { // ±1 минута погрешность
          return { ok: true, fandomName: rc.user, title: rc.title };
        }
      }
    }

    return { ok: false, error: "Код не найден. Убедитесь, что вы добавили код в описание правки." };
  }

  /* ---------- публичный API ---------- */

  // Начать процесс авторизации
  function startFandomAuth(fandomName) {
    if (!fandomName || !fandomName.trim()) {
      return { ok: false, error: "Введите имя пользователя Fandom" };
    }

    const cleanName = fandomName.trim();
    const code = generateCode();
    savePendingAuth(code, cleanName);

    return {
      ok: true,
      code: code,
      fandomName: cleanName,
      message: "Добавьте код " + code + " в описание любой правки в вашем профиле на вики"
    };
  }

  // Проверить код (одиночный вызов)
  async function checkFandomAuth(fandomName, code) {
    return await verifyCode(fandomName, code);
  }

  // Автопроверка с интервалом
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
        clearPendingAuth();
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

  // Завершить авторизацию — создать/обновить пользователя
  function completeFandomAuth(fandomName, isAdmin) {
    const db = DB.getDB();

    // Ищем существующего пользователя по fandomName
    let user = db.users.find(u => u.fandomName === fandomName);

    if (!user) {
      // Создаём нового
      user = {
        id: crypto.randomUUID ? crypto.randomUUID() : ("fandom_" + Date.now()),
        username: fandomName,
        password: null, // нет пароля для Fandom-юзеров
        created: Date.now(),
        votes: 0,
        role: isAdmin ? "admin" : "user",
        authType: "fandom",
        displayName: fandomName,
        fandomName: fandomName
      };
      db.users.push(user);
      DB.saveDB(db);
    } else {
      // Обновляем существующего
      user.authType = "fandom";
      user.fandomName = fandomName;
      DB.saveDB(db);
    }

    DB.setCurrentUser(user);

    if (isAdmin) {
      localStorage.setItem("th_admin", "yes");
    }

    return { ok: true, user };
  }

  // Проверить, авторизован ли текущий пользователь через Fandom
  function isFandomUser() {
    const user = DB.getCurrentUser();
    return user && user.authType === "fandom";
  }

  /* ---------- экспорт ---------- */

  window.FandomAuth = {
    startFandomAuth,
    checkFandomAuth,
    pollFandomAuth,
    completeFandomAuth,
    isFandomUser,
    getPendingAuth,
    clearPendingAuth
  };

})();