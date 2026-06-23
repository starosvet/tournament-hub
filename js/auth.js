// js/auth.js — авторизация v3 (Fandom fix + скрытый админ)

const ADMIN_PASS = "change-password"; // СМЕНИ СРАЗУ ПОСЛЕ УСТАНОВКИ!

// ===== АДМИН =====
function loginAdmin(pass) {
  if (pass === ADMIN_PASS) {
    localStorage.setItem("th_admin", "yes");
    return true;
  }
  return false;
}

function isAdmin() {
  return localStorage.getItem("th_admin") === "yes";
}

function logoutAdmin() {
  localStorage.removeItem("th_admin");
}

// ===== FANDOM AUTH v3 (рабочая версия) =====
function generateCode() {
  return "TH" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startFandomVerify(fandomName) {
  if (!fandomName || fandomName.length < 2) {
    return { ok: false, err: "Слишком короткий ник" };
  }
  
  let db = getDB();
  let existing = db.users.find(u => u.fandomName && u.fandomName.toLowerCase() === fandomName.toLowerCase());
  if (existing) return { ok: false, err: "Этот ник уже зарегистрирован" };

  let code = generateCode();
  localStorage.setItem("th_pending", JSON.stringify({
    fandomName: fandomName,
    code: code,
    expires: Date.now() + 3600000 // 1 час
  }));

  return { ok: true, code: code };
}

// НОВАЯ рабочая проверка через Special:Contributions
async function checkFandomVerify(fandomName, wikiDomain) {
  let pending = JSON.parse(localStorage.getItem("th_pending") || "null");
  if (!pending) return { ok: false, err: "Нет активной верификации. Начните заново." };
  if (pending.fandomName.toLowerCase() !== fandomName.toLowerCase()) {
    return { ok: false, err: "Ник не совпадает с начатым" };
  }
  if (Date.now() > pending.expires) {
    localStorage.removeItem("th_pending");
    return { ok: false, err: "Код истёк (1 час). Начните заново." };
  }

  // Формируем URL вики (убираем https:// если ввели)
  let domain = wikiDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Пробуем MediaWiki API — проверяем правки пользователя
  let apiUrl = `https://${domain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=50&ucprop=comment|timestamp&format=json&origin=*`;
  
  try {
    let res = await fetch(apiUrl);
    let data = await res.json();
    
    let found = false;
    
    // Проверяем комментарии в правках
    if (data.query && data.query.usercontribs) {
      found = data.query.usercontribs.some(c => 
        c.comment && c.comment.includes(pending.code)
      );
    }
    
    // Если не нашли в комментариях — проверяем через профиль (резервный метод)
    if (!found) {
      // Проверяем существование пользователя
      let userApi = `https://${domain}/api.php?action=query&list=users&ususers=${encodeURIComponent(fandomName)}&usprop=editcount|registration|gender&format=json&origin=*`;
      let userRes = await fetch(userApi);
      let userData = await userRes.json();
      
      if (userData.query && userData.query.users && userData.query.users[0]) {
        let userInfo = userData.query.users[0];
        
        // Если пользователь существует и имеет правки — "мягкая" проверка
        // (т.к. Fandom блокирует CORS на профили, делаем упрощённую)
        if (userInfo.userid !== undefined && userInfo.editcount > 0) {
          // Для надёжности: если код вставлен в профиль, его не проверить напрямую через API
          // Но если пользователь существует и активен — можно сделать "доверительную" верификацию
          // ИЛИ требовать правку с кодом
          found = false; // Строгий режим: требуем правку
        }
      }
    }
    
    if (!found) {
      return { 
        ok: false, 
        err: `Код ${pending.code} не найден в правках. Сделайте правку на вики с этим кодом в комментарии и попробуйте снова.` 
      };
    }

    // Успех! Создаём пользователя
    let db = getDB();
    let userId = "u_" + fandomName.toLowerCase().replace(/[^a-z0-9а-яё]/g, "_") + "_" + Date.now().toString(36);
    
    let user = {
      id: userId,
      fandomName: fandomName,
      displayName: fandomName,
      status: "verified",
      wikiDomain: domain,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      authType: "fandom"
    };
    
    db.users.push(user);
    saveDB(db);
    setCurrentUser(userId);
    localStorage.removeItem("th_pending");

    return { ok: true, user: user };

  } catch (e) {
    return { ok: false, err: "Ошибка сети: " + e.message + ". Проверьте правильность адреса вики." };
  }
}

// ===== ГОСТЕВОЙ ВХОД (без Fandom) =====
function registerGuest(username) {
  if (!username || username.length < 2 || username.length > 20) {
    return { ok: false, err: "Ник от 2 до 20 символов" };
  }
  if (!/^[a-zA-Z0-9а-яА-ЯёЁ_\-]+$/.test(username)) {
    return { ok: false, err: "Только буквы, цифры, _ и -" };
  }
  
  let db = getDB();
  let existing = db.users.find(u => u.displayName && u.displayName.toLowerCase() === username.toLowerCase());
  if (existing) return { ok: false, err: "Этот ник занят" };
  
  let userId = "g_" + username.toLowerCase().replace(/[^a-z0-9а-яё]/g, "_") + "_" + Date.now().toString(36);
  
  let user = {
    id: userId,
    fandomName: null,
    displayName: username,
    status: "guest",
    wikiDomain: null,
    verifiedAt: null,
    createdAt: new Date().toISOString(),
    authType: "guest"
  };
  
  db.users.push(user);
  saveDB(db);
  setCurrentUser(userId);
  
  return { ok: true, user: user };
}

// ===== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ =====
function getCurrentUser() {
  let uid = localStorage.getItem("th_user_id");
  if (!uid) return null;
  let db = getDB();
  return db.users.find(u => u.id === uid) || null;
}

function setCurrentUser(userId) {
  if (userId) localStorage.setItem("th_user_id", userId);
  else localStorage.removeItem("th_user_id");
}

function logoutUser() {
  setCurrentUser(null);
}

// ===== РЕНДЕР =====
function renderAdminLink() {
  let link = document.getElementById('navAdmin');
  if (link) {
    if (isAdmin()) {
      link.classList.remove('hidden');
    } else {
      link.classList.add('hidden');
    }
  }
}

function renderNavUser(db) {
  let el = document.getElementById("navUser");
  if (!el) return;
  let user = getCurrentUser();
  if (user) {
    let name = user.displayName || user.fandomName || "Пользователь";
    let avatar = user.fandomName 
      ? `https://api.fandom.com/user-avatar/${encodeURIComponent(user.fandomName)}/small`
      : '';
    el.innerHTML = `
      <span class="nav-user-info">
        ${avatar ? `<img src="${avatar}" class="avatar" onerror="this.style.display='none'">` : '<span>👤</span>'}
        <span>${escapeHtml(name)}</span>
      </span>
      <a href="#" onclick="logoutUser();location.reload();return false;">Выйти</a>
    `;
  } else {
    el.innerHTML = '<a href="login.html">🔐 Войти</a>';
  }
}

function escapeHtml(text) {
  let div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
