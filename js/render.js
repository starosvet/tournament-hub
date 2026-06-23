// js/render.js — рендер главной страницы

function loadPage() {
  let db = getDB();
  renderNavUser(db);
  renderHero(db);
  renderLeaderboard(db);
  renderRecent(db);
}

function renderNavUser(db) {
  let el = document.getElementById("navUser");
  if (!el) return;
  let user = getCurrentUser();
  if (user) {
    el.innerHTML = '<span style="color:#94a3b8">👤 ' + user.fandomName + '</span>' +
      '<a href="#" onclick="logoutUser();location.reload()" style="color:#ef4444;margin-left:12px;font-size:13px">Выйти</a>';
  } else {
    el.innerHTML = '<a href="login.html" style="color:#3b82f6">🔐 Войти</a>';
  }
}

function renderHero(db) {
  let el = document.getElementById("hero");
  if (!el) return;
  
  let t = getActiveTournament(db);
  if (!t) {
    el.innerHTML = '<div class="hero-empty"><h2>🏆 Добро пожаловать в Tournament Hub</h2>' +
      '<p>Создайте турнир в админ-панели, чтобы начать голосование!</p>' +
      '<a href="admin.html" class="btn-primary">⚙️ Открыть админку</a></div>';
    return;
  }
  
  let status = t.status === "active" ? "🔥 Активен" : "✅ Завершён";
  let round = t.rounds[t.currentRound];
  let timer = "";
  if (round && round.startedAt && t.status === "active") {
    let left = getTimeLeft(round.startedAt, t.config.voteDurationHours || 24);
    timer = '<div class="hero-timer">⏱️ ' + formatDuration(left) + '</div>';
  }
  
  el.innerHTML = '<div class="hero-tournament" onclick="location.href=\'bracket.html\'">' +
    '<div class="hero-status">' + status + '</div>' +
    '<h2>' + t.name + '</h2>' +
    '<p>' + (t.description || '') + '</p>' +
    '<div class="hero-meta">' +
    '<span>🎯 Раунд ' + (t.currentRound + 1) + ' / ' + t.rounds.length + '</span>' +
    '<span>⚔️ ' + t.rounds[0].matches.length + ' матчей</span>' +
    '</div>' + timer + '</div>';
}

function renderLeaderboard(db) {
  let el = document.getElementById("leaderboard");
  if (!el) return;
  
  if (!db.players.length) {
    el.innerHTML = '<div class="card">Нет участников</div>';
    return;
  }
  
  let sorted = [...db.players].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 10);
  
  let html = '<h2 class="section-title">🏆 Топ участников</h2>';
  sorted.forEach((p, i) => {
    let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
    html += '<div class="lb-row">' +
      '<span class="lb-medal">' + medal + '</span>' +
      '<img src="https://via.placeholder.com/40x40/1e293b/94a3b8?text=' + encodeURIComponent(p.name[0]) + '" onerror="this.style.display=\'none\'">' +
      '<div class="lb-name"><a href="' + p.url + '" target="_blank">' + p.name + '</a>' +
      '<span class="lb-wins">' + (p.wins || 0) + ' побед</span></div></div>';
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
    html += '<div class="recent-match">' +
      '<span class="' + (wa ? 'win' : '') + '">' + m.a.name + '</span>' +
      '<span class="recent-score">' + m.votesA + ' : ' + m.votesB + '</span>' +
      '<span class="' + (wb ? 'win' : '') + '">' + m.b.name + '</span>' +
      '<span class="recent-round">' + m.roundName + '</span></div>';
  });
  el.innerHTML = html;
}

function toast(msg) {
  let existing = document.querySelector('.toast');
  if (existing) existing.remove();
  let t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}
