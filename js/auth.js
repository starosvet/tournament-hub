// js/auth.js — авторизация

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
  
  try {
    let url = `https://${wikiDomain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=10&format=json&origin=*`;
    let res = await fetch(url);
    let data = await res.json();
    
    if (!data.query?.usercontribs) {
      return { ok: false, err: "Не удалось получить данные с Fandom" };
    }
    
    let found = data.query.usercontribs.some(c => c.comment && c.comment.includes(pending.code));
    if (!found) {
      return { ok: false, err: "Код не найден в последних правках" };
    }
    
    let db = getDB();
    let user = {
      id: "u_" + fandomName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      fandomName: fandomName,
      status: "verified",
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
