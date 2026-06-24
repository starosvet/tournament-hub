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

function renderEloBoard() {
    let el = document.getElementById("eloBoard");
    if (!el) return;
    el.innerHTML = renderEloLeaderboard();
}
