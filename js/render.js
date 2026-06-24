// js/render.js — рендер главной страницы v3 (фикс)

function loadPage() {
    let db = getDB();
    updateSiteBranding();
    renderNavUser(db);
    renderAdminLink();
    renderHero(db);
    renderLeaderboard(db);
    renderRecent(db);
    renderEloBoard();
}

function updateSiteBranding() {
    let db = getDB();
    let name = db.settings?.siteName || 'Tournament Hub';
    let logo = db.settings?.siteLogo || '🏆';
    document.title = name;
    let logoLink = document.getElementById('siteLogoLink');
    if (logoLink) logoLink.textContent = logo + ' ' + name;
    let ft = document.getElementById('footerText');
    if (ft) ft.textContent = '© ' + new Date().getFullYear() + ' ' + name;
}

function renderNavUser(db) {
    let el = document.getElementById("navUser");
    if (!el) return;
    let user = getCurrentUser();
    if (user) {
        let name = user.displayName || user.fandomName || "Пользователь";
        let isFandom = user.authType === "fandom";
        let badge = isFandom ? '<span style="color:var(--green);font-size:12px;">✓</span>' : '<span style="color:var(--text-3);font-size:12px;">👤</span>';
        el.innerHTML = `
            <span style="display:flex;align-items:center;gap:10px;">
                ${badge}
                <a href="profile.html?id=${user.id}" style="color:var(--text);text-decoration:none;font-weight:600;">${escapeHtml(name)}</a>
                <a href="#" onclick="logoutUser();location.reload();return false;" style="color:var(--text-3);font-size:12px;text-decoration:none;">Выйти</a>
            </span>
        `;
    } else {
        el.innerHTML = '<a href="login.html" style="color:var(--blue);text-decoration:none;font-weight:600;">🔐 Войти</a>';
    }
}

function renderHero(db) {
    let el = document.getElementById("hero");
    if (!el) return;

    let t = getActiveTournament(db);
    if (!t) {
        el.innerHTML = `
            <div class="hero-empty">
                <h2>🏆 Добро пожаловать!</h2>
                <p>${db.settings?.siteDesc || 'Создайте турнир в админ-панели, чтобы начать голосование!'}</p>
                ${isAdmin() ? '<a href="admin.html" class="btn-admin">⚙️ Открыть управление</a>' : ''}
            </div>
        `;
        return;
    }

    let statusClass = t.status === "active" ? "status-active" : "status-completed";
    let statusText = t.status === "active" ? "🔥 Активен" : "✅ Завершён";
    let round = t.rounds[t.currentRound];
    let timer = "";
    
    if (round && round.startedAt && t.status === "active") {
        let left = getTimeLeft(round.startedAt, t.config?.voteDurationHours || 24);
        timer = `<div class="hero-timer">⏱ ${formatDuration(left)}</div>`;
    }

    el.innerHTML = `
        <div class="hero-tournament" onclick="location.href='bracket.html'">
            <span class="hero-status ${statusClass}">${statusText}</span>
            <h2>${t.name}</h2>
            <p style="color:var(--text-2);">${t.description || ''}</p>
            <div class="hero-meta">
                <span>🎯 Раунд ${t.currentRound + 1} / ${t.rounds.length}</span>
                <span>⚔️ ${t.rounds[0].matches.length} матчей</span>
                <span>📅 ${formatDate(t.createdAt)}</span>
            </div>
            ${timer}
        </div>
    `;
}

function renderLeaderboard(db) {
    let el = document.getElementById("leaderboard");
    if (!el) return;

    if (!db.subjects.length) {
        el.innerHTML = '';
        return;
    }

    let sorted = [...db.subjects].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 10);

    let html = '<h2 class="section-title">🏆 Топ субъектов по победам</h2>';
    sorted.forEach((s, i) => {
        let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        let typeIcon = getSubjectTypeIcon(s.typeId);
        let img = s.url !== '#' && s.url ? 
            `<img src="${s.url}" alt="" onerror="this.style.display='none'">` :
            `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--bg-4),var(--border-2));display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:20px;">${typeIcon}</div>`;
        
        html += `
            <div class="lb-row" style="animation: fadeInUp 0.5s ease ${i * 0.1}s both;">
                <div class="lb-medal">${medal}</div>
                ${img}
                <div class="lb-name">
                    <span style="font-weight:600;color:var(--text);">${escapeHtml(s.name)}</span>
                    <div style="font-size:12px;color:var(--text-3);">${escapeHtml(s.type || 'Субъект')}</div>
                </div>
                <div class="lb-wins">${s.wins || 0} побед</div>
            </div>
        `;
    });
    el.innerHTML = html;
}

function renderRecent(db) {
    let el = document.getElementById("recent");
    if (!el) return;

    let t = getActiveTournament(db);
    if (!t || !t.rounds) { el.innerHTML = ''; return; }

    let done = [];
    t.rounds.forEach(r => {
        r.matches.forEach(m => { if (m.done) done.push({...m, roundName: r.name}); });
    });

    let recent = done.slice(-5).reverse();
    if (!recent.length) { el.innerHTML = ''; return; }

    let html = '<h2 class="section-title">⚔️ Последние матчи</h2>';
    recent.forEach(m => {
        let wa = m.winner && m.winner.id === m.a.id;
        let wb = m.winner && m.winner.id === m.b.id;
        html += `
            <div class="recent-match" style="animation: fadeInUp 0.5s ease ${0}s both;">
                <span class="${wa ? 'win' : ''}">${m.a.name}</span>
                <span class="recent-score">${m.votesA} : ${m.votesB}</span>
                <span class="${wb ? 'win' : ''}">${m.b.name}</span>
                <span class="recent-round">${m.roundName}</span>
            </div>
        `;
    });
    el.innerHTML = html;
}

function renderEloBoard() {
    let el = document.getElementById("eloBoard");
    if (!el) return;
    el.innerHTML = renderEloLeaderboard();
}

function toast(msg) {
    let existing = document.querySelector('.toast');
    if (existing) existing.remove();
    let t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
