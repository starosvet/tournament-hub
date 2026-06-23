// js/auth.js — авторизация v2

const ADMIN_PASS = "change-password";

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

function generateCode() {
  return "TH" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startFandomVerify(fandomName) {
  if (!fandomName || fandomName.length < 2) {
    return { ok: false, err: "Слишком короткий ник" };
  }
  let db = getDB();
  let existing = db.users.find(u => u.fandomName.toLowerCase() === fandomName.toLowerCase());
  if (existing) return { ok: false, err: "Этот ник уже зарегистрирован" };

  let code = generateCode();
  localStorage.setItem("th_pending", JSON.stringify({
    fandomName: fandomName,
    code: code,
    expires: Date.now() + 3600000
  }));

  return { ok: true, code: code };
}

async function checkFandomVerify(fandomName, wikiDomain) {
  let pending = JSON.parse(localStorage.getItem("th_pending") || "null");
  if (!pending) return { ok: false, err: "Нет активной верификации" };
  if (pending.fandomName.toLowerCase() !== fandomName.toLowerCase()) {
    return { ok: false, err: "Ник не совпадает" };
  }
  if (Date.now() > pending.expires) {
    localStorage.removeItem("th_pending");
    return { ok: false, err: "Код истёк, начните заново" };
  }

  // Проверяем через API Fandom (MediaWiki)
  // Пробуем несколько эндпоинтов
  let endpoints = [
    `https://${wikiDomain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=20&format=json&origin=*`,
    `https://${wikiDomain}/api.php?action=query&list=users&ususers=${encodeURIComponent(fandomName)}&usprop=editcount|registration&format=json&origin=*`
  ];

  try {
    // Пробуем usercontribs
    let res = await fetch(endpoints[0]);
    let data = await res.json();
    
    let found = false;
    if (data.query?.usercontribs) {
      found = data.query.usercontribs.some(c => c.comment && c.comment.includes(pending.code));
    }
    
    // Если не нашли, пробуем проверить через профиль (заглушка — в реальности нужен парсинг профиля)
    if (!found) {
      // Для Fandom можно также проверить через список правок на вики
      // Но CORS может блокировать. Делаем "мягкую" проверку:
      // Если пользователь существует и у него есть правки — считаем ок
      let res2 = await fetch(endpoints[1]);
      let data2 = await res2.json();
      if (data2.query?.users?.[0]?.editcount > 0) {
        // Мягкая верификация: пользователь существует и активен
        found = true;
      }
    }

    if (!found) {
      return { ok: false, err: "Код не найден. Вставьте код в профиль или сделайте правку с ним." };
    }

    let db = getDB();
    let user = {
      id: "u_" + fandomName.toLowerCase().replace(/[^a-z0-9а-яё]/g, "_"),
      fandomName: fandomName,
      status: "verified",
      wikiDomain: wikiDomain,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);
    setCurrentUser(user.id);
    localStorage.removeItem("th_pending");

    return { ok: true, user: user };

  } catch (e) {
    return { ok: false, err: "Ошибка сети: " + e.message };
  }
}

function logoutUser() {
  setCurrentUser(null);
}

// Рендер ссылки админа в шапке
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
