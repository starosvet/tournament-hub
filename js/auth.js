const ADMIN_PASSWORD = "change-password";

function loginAdmin(pass) {
  if (pass === ADMIN_PASSWORD) {
    localStorage.setItem("admin", "true");
    return true;
  }
  return false;
}

function isAdmin() {
  return localStorage.getItem("admin") === "true";
}

function logoutAdmin() {
  localStorage.removeItem("admin");
}

function generateVerifyCode() {
  return "TH" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startFandomVerify(fandomName) {
  const code = generateVerifyCode();
  const db = getDB();
  
  const existing = db.users.find(u => u.fandomName.toLowerCase() === fandomName.toLowerCase());
  if (existing) {
    return { success: false, error: "Этот ник уже верифицирован" };
  }
  
  const verifyData = {
    fandomName: fandomName,
    code: code,
    createdAt: new Date(),
    expiresAt: Date.now() + 3600000
  };
  
  localStorage.setItem("pendingVerify", JSON.stringify(verifyData));
  
  return {
    success: true,
    code: code,
    instruction: `Отредактируйте свою страницу участника на Fandom, добавив код: ${code}. Затем нажмите "Проверить".`
  };
}

async function checkFandomVerify(fandomName, wikiDomain) {
  const pending = JSON.parse(localStorage.getItem("pendingVerify") || "null");
  if (!pending) return { success: false, error: "Нет активной верификации" };
  if (pending.fandomName.toLowerCase() !== fandomName.toLowerCase()) {
    return { success: false, error: "Ник не совпадает" };
  }
  if (Date.now() > pending.expiresAt) {
    localStorage.removeItem("pendingVerify");
    return { success: false, error: "Код истёк. Начните заново." };
  }
  
  try {
    const apiUrl = `https://${wikiDomain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=10&format=json&origin=*`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!data.query || !data.query.usercontribs) {
      return { success: false, error: "Не удалось получить данные с Fandom" };
    }
    
    const contribs = data.query.usercontribs;
    const found = contribs.some(c => c.comment && c.comment.includes(pending.code));
    
    if (!found) {
      return { success: false, error: "Код не найден в последних правках. Убедитесь, что вы сделали правку с кодом в описании." };
    }
    
    const db = getDB();
    const user = {
      id: "fandom_" + fandomName.toLowerCase(),
      fandomName: fandomName,
      status: "verified",
      verifiedAt: new Date(),
      votes: {},
      createdAt: new Date()
    };
    
    db.users.push(user);
    saveDB(db);
    setCurrentUser(user.id);
    localStorage.removeItem("pendingVerify");
    
    return { success: true, user: user };
    
  } catch (e) {
    return { success: false, error: "Ошибка запроса к Fandom: " + e.message };
  }
}

function logoutUser() {
  setCurrentUser(null);
}
