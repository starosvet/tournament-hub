// js/auth.js — авторизация v4 (рабочая Fandom + скрытый админ + защита)

const ADMIN_PASS = "admin123"; // ← СМЕНИ ЭТОТ ПАРОЛЬ СРАЗУ!

// ===== АДМИН =====
function loginAdmin(pass) {
    if (pass === ADMIN_PASS) {
        localStorage.setItem("th_admin", "yes");
        return { ok: true };
    }
    return { ok: false, err: "Неверный пароль администратора" };
}

function isAdmin() {
    return localStorage.getItem("th_admin") === "yes";
}

function logoutAdmin() {
    localStorage.removeItem("th_admin");
}

// ===== FANDOM AUTH v4 (через прокси-страницу на вики) =====
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

// Проверка через CORS-прокси (для GitHub Pages)
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

    let domain = wikiDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Пробуем несколько CORS-прокси
    const proxies = [
        '', // прямой запрос (если Same Origin)
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?'
    ];

    let found = false;
    let lastErr = "";

    for (let proxy of proxies) {
        try {
            let apiUrl = proxy + encodeURIComponent(`https://${domain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=50&ucprop=comment|timestamp&format=json`);
            
            let res = await fetch(apiUrl, { 
                method: 'GET',
                headers: proxy ? {} : { 'Origin': '*' }
            });
            
            if (!res.ok) continue;
            
            let data = await res.json();
            
            // AllOrigins оборачивает ответ
            if (data.contents) data = JSON.parse(data.contents);

            if (data.query && data.query.usercontribs) {
                found = data.query.usercontribs.some(c => 
                    c.comment && c.comment.includes(pending.code)
                );
                if (found) break;
            }
        } catch (e) {
            lastErr = e.message;
            continue;
        }
    }

    // Резерв: проверяем существование пользователя + "доверительная" верификация
    if (!found) {
        try {
            let userApi = `https://api.allorigins.win/raw?url=` + 
                encodeURIComponent(`https://${domain}/api.php?action=query&list=users&ususers=${encodeURIComponent(fandomName)}&usprop=editcount|registration&format=json`);
            
            let res = await fetch(userApi);
            let data = await res.json();
            if (data.contents) data = JSON.parse(data.contents);
            
            if (data.query && data.query.users && data.query.users[0]) {
                let u = data.query.users[0];
                // Если пользователь реальный и активен — принимаем (упрощённо)
                if (u.userid !== undefined && u.editcount > 0) {
                    // Но код всё равно должен быть в правках — строгий режим
                    return {
                        ok: false,
                        err: `Код ${pending.code} не найден в правках. Сделайте правку с этим кодом в комментарии и нажмите "Проверить" снова.`
                    };
                }
            }
        } catch (e) {}
    }

    if (!found) {
        return {
            ok: false,
            err: `Код ${pending.code} не найден в правках вики. Убедитесь, что вы сделали правку с этим кодом в комментарии.`
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
        authType: "fandom",
        votes: [], // массив {tournamentId, roundIdx, matchIdx, side}
        lastVote: null
    };

    db.users.push(user);
    saveDB(db);
    setCurrentUser(userId);
    localStorage.removeItem("th_pending");

    return { ok: true, user: user };
}

// ===== ГОСТЕВОЙ ВХОД (с ограничениями) =====
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
        authType: "guest",
        votes: [],
        lastVote: null
    };

    db.users.push(user);
    saveDB(db);
    setCurrentUser(userId);

    return { ok: true, user: user };
}

// ===== АНТИНАКРУТКА: проверка голосов =====
function canUserVote(userId, tournamentId, roundIdx, matchIdx) {
    let db = getDB();
    let user = db.users.find(u => u.id === userId);
    if (!user) return false;
    
    // Гости могут голосовать, но с ограничениями
    if (user.authType === "guest") {
        // Проверяем, не голосовал ли уже в этом матче
        let voteKey = `vote_${tournamentId}_${roundIdx}_${matchIdx}`;
        if (localStorage.getItem(voteKey)) return false;
        return true;
    }
    
    // Fandom-пользователи: проверяем в базе
    let alreadyVoted = user.votes.some(v => 
        v.tournamentId === tournamentId && 
        v.roundIdx === roundIdx && 
        v.matchIdx === matchIdx
    );
    if (alreadyVoted) return false;
    
    // Анти-спам: минимум 5 секунд между голосами
    if (user.lastVote && Date.now() - new Date(user.lastVote).getTime() < 5000) return false;
    
    return true;
}

function recordVote(userId, tournamentId, roundIdx, matchIdx, side) {
    let db = getDB();
    let user = db.users.find(u => u.id === userId);
    if (!user) return;
    
    user.votes.push({
        tournamentId, roundIdx, matchIdx, side,
        time: new Date().toISOString()
    });
    user.lastVote = new Date().toISOString();
    saveDB(db);
    
    // Также сохраняем в localStorage для быстрой проверки
    localStorage.setItem(`vote_${tournamentId}_${roundIdx}_${matchIdx}`, side === 0 ? "A" : "B");
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
            link.style.display = '';
        } else {
            link.classList.add('hidden');
            link.style.display = 'none';
        }
    }
}

function renderNavUser(db) {
    let el = document.getElementById("navUser");
    if (!el) return;
    let user = getCurrentUser();
    if (user) {
        let name = user.displayName || user.fandomName || "Пользователь";
        let isFandom = user.authType === "fandom";
        let badge = isFandom ? '✓' : '👤';
        el.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;">
                <span style="color:${isFandom ? '#22c55e' : '#94a3b8'};font-size:12px;">${badge}</span>
                <span>${escapeHtml(name)}</span>
                <a href="#" onclick="logoutUser();location.reload();return false;" style="color:#64748b;font-size:12px;">Выйти</a>
            </span>
        `;
    } else {
        el.innerHTML = '<a href="login.html" style="color:#3b82f6;">🔐 Войти</a>';
    }
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
function initAuth() {
    renderAdminLink();
    let db = getDB();
    renderNavUser(db);
}
