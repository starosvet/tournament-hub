// js/auth.js — авторизация v5 (роли + привязка админа к Fandom)

const ADMIN_FANDOM_NAME = "Melanthe Weber"; // ← ТВОЙ НИК НА FANDOM
const ADMIN_PASS_FALLBACK = "admin123";    // ← Резервный пароль

// ===== РОЛИ =====
const ROLES = {
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
};

// ===== ПРОВЕРКА АДМИНА =====
function isAdmin() {
    let user = getCurrentUser();
    // Привязка по Fandom-нику
    if (user && user.authType === 'fandom' && user.fandomName === ADMIN_FANDOM_NAME) {
        return true;
    }
    // Резерв: по флагу localStorage (для тестов или если Fandom не работает)
    if (localStorage.getItem("th_admin") === "yes") {
        return true;
    }
    return false;
}

function isModerator() {
    let user = getCurrentUser();
    if (!user) return false;
    if (isAdmin()) return true;
    return user.role === ROLES.MODERATOR;
}

function getUserRole() {
    if (isAdmin()) return ROLES.ADMIN;
    let user = getCurrentUser();
    return user?.role || ROLES.USER;
}

// ===== ЛОГИН АДМИНА (резервный) =====
function loginAdmin(pass) {
    if (pass === ADMIN_PASS_FALLBACK) {
        localStorage.setItem("th_admin", "yes");
        return { ok: true };
    }
    return { ok: false, err: "Неверный пароль администратора" };
}

function logoutAdmin() {
    localStorage.removeItem("th_admin");
}

// ===== FANDOM AUTH v5 =====
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
        expires: Date.now() + 3600000
    }));

    return { ok: true, code: code };
}

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
    const proxies = [
        '',
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?'
    ];

    let found = false;

    for (let proxy of proxies) {
        try {
            let apiUrl = proxy + encodeURIComponent(`https://${domain}/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomName)}&uclimit=50&ucprop=comment|timestamp&format=json`);
            let res = await fetch(apiUrl, { method: 'GET', headers: proxy ? {} : { 'Origin': '*' } });
            if (!res.ok) continue;
            let data = await res.json();
            if (data.contents) data = JSON.parse(data.contents);
            if (data.query && data.query.usercontribs) {
                found = data.query.usercontribs.some(c => c.comment && c.comment.includes(pending.code));
                if (found) break;
            }
        } catch (e) { continue; }
    }

    if (!found) {
        return { ok: false, err: `Код ${pending.code} не найден в правках вики. Сделайте правку с этим кодом в комментарии.` };
    }

    let db = getDB();
    let userId = "u_" + fandomName.toLowerCase().replace(/[^a-z0-9а-яё]/g, "_") + "_" + Date.now().toString(36);

    // Авто-админ для Melanthe Weber
    let isAdminUser = fandomName === ADMIN_FANDOM_NAME;
    let role = isAdminUser ? ROLES.ADMIN : ROLES.USER;

    let user = {
        id: userId,
        fandomName: fandomName,
        displayName: fandomName,
        status: "verified",
        wikiDomain: domain,
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        authType: "fandom",
        role: role,
        votes: [],
        lastVote: null,
        bio: "",
        avatar: ""
    };

    db.users.push(user);
    saveDB(db);
    setCurrentUser(userId);
    localStorage.removeItem("th_pending");

    if (isAdminUser) {
        localStorage.setItem("th_admin", "yes");
    }

    return { ok: true, user: user, isAdmin: isAdminUser };
}

// ===== ГОСТЕВОЙ ВХОД =====
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
        role: ROLES.USER,
        votes: [],
        lastVote: null,
        bio: "",
        avatar: ""
    };

    db.users.push(user);
    saveDB(db);
    setCurrentUser(userId);

    return { ok: true, user: user };
}

// ===== АНТИНАКРУТКА =====
function canUserVote(userId, tournamentId, roundIdx, matchIdx) {
    let db = getDB();
    let user = db.users.find(u => u.id === userId);
    if (!user) return false;
    
    if (user.authType === "guest") {
        let voteKey = `vote_${tournamentId}_${roundIdx}_${matchIdx}`;
        if (localStorage.getItem(voteKey)) return false;
        return true;
    }
    
    let alreadyVoted = user.votes.some(v => 
        v.tournamentId === tournamentId && v.roundIdx === roundIdx && v.matchIdx === matchIdx
    );
    if (alreadyVoted) return false;
    
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
    
    localStorage.setItem(`vote_${tournamentId}_${roundIdx}_${matchIdx}`, side === 0 ? "A" : "B");
}

// ===== ПОЛЬЗОВАТЕЛЬ =====
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
    logoutAdmin();
}

// ===== РЕНДЕР =====
function renderAdminLink() {
    let link = document.getElementById('navAdmin');
    if (link) {
        if (isAdmin()) {
            link.classList.remove('hidden');
            link.style.display = '';
            link.textContent = '⚙️ Управление';
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
        let roleBadge = user.role === ROLES.ADMIN ? '👑' : user.role === ROLES.MODERATOR ? '🛡️' : (isFandom ? '✓' : '👤');
        let profileLink = `<a href="profile.html?id=${user.id}" style="color:var(--text);text-decoration:none;font-weight:600;">${escapeHtml(name)}</a>`;
        
        el.innerHTML = `
            <span style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:12px;">${roleBadge}</span>
                ${profileLink}
                <a href="#" onclick="logoutUser();location.reload();return false;" style="color:var(--text-3);font-size:12px;text-decoration:none;">Выйти</a>
            </span>
        `;
    } else {
        el.innerHTML = '<a href="login.html" style="color:var(--blue);text-decoration:none;font-weight:600;">🔐 Войти</a>';
    }
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initAuth() {
    renderAdminLink();
    let db = getDB();
    renderNavUser(db);
}
