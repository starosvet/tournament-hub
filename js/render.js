// js/render.js — рендер главной страницы

function loadPage() {
  const db = getDB();
  renderHeader(db);
  renderActiveTournament(db);
  renderTopPlayers(db);
  renderRecentMatches(db);
}

function renderHeader(db) {
  const user = getCurrentUser();
  const userBlock = document.getElementById("userBlock");
  if (userBlock) {
    if (user) {
      userBlock.innerHTML = `
        <span style="color:#94a3b8">👤 ${user.fandomName}</span>
        <span style="color:${user.status === 'autoconfirmed' ? '#22c55e' : '#3b82f6'}; font-size:12px; margin-left:8px;">
          ${user.status === 'autoconfirmed' ? '✓ Автоподтверждён' : '✓ Верифицирован'}
        </span>
        <a href="#" onclick="logoutUser(); location.reload();" style="color:#ef4444; margin-left:15px; font-size:13px;">Выйти</a>
      `;
    } else {
      userBlock.innerHTML = `<a href="login.html" style="color:#3b82f6;">🔐 Войти через Fandom</a>`;
    }
  }
}

function renderActiveTournament(db) {
  const container = document.getElementById("activeTournament");
  if (!container) return;
  
  const tournament = db.active;
  
  if (!tournament) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:40px;">
        <h3>📭 Нет активного турнира</h3>
        <p style="color:#64748b">Создайте турнир в админке!</p>
      </div>
    `;
    return;
  }
  
  const statusText = {
    "active": "🔥 Идёт голосование",
    "completed": "✅ Завершён"
  };
  
  let html = `
    <div class="tournament-card" onclick="location.href='bracket.html'">
      <div class="tournament-card-header">
        <h3>🏆 ${tournament.name}</h3>
        <span class="tournament-badge ${tournament.status}">${statusText[tournament.status] || tournament.status}</span>
      </div>
      <p style="color:#94a3b8; margin:10px 0;">${tournament.description || ''}</p>
      <div class="tournament-meta">
        <span>📅 Раунд ${tournament.currentRound + 1} из ${tournament.config?.totalRounds || '?'}</span>
        <span>👥 ${tournament.rounds[0]?.matches?.length * 2 || '?'} участников</span>
      </div>
  `;
  
  if (tournament.status === "active") {
    const round = tournament.rounds[tournament.currentRound];
    if (round && round.startedAt) {
      html += `<div class="timer-large">⏱️ До конца раунда: ${formatTime(getTimeLeft(round.startedAt, tournament.config?.voteDurationHours || 24))}</div>`;
    }
  }
  
  html += `</div>`;
  container.innerHTML = html;
}

function renderTopPlayers(db) {
  const container = document.getElementById("topPlayers");
  if (!container) return;
  
  const tournament = db.active;
  if (!tournament || !tournament.rounds.length) {
    container.innerHTML = '<div class="card">Топ будет доступен после начала турнира</div>';
    return;
  }
  
  // Считаем победы из завершённых матчей
  const wins = {};
  tournament.rounds.forEach(r => {
    r.matches.forEach(m => {
      if (m.done && m.winner) {
        wins[m.winner.id] = (wins[m.winner.id] || 0) + 1;
      }
    });
  });
  
  let list = db.players.map(p => ({
    ...p,
    winCount: wins[p.id] || 0
  })).sort((a, b) => b.winCount - a.winCount);
  
  let html = '<h2>🔥 Топ участников</h2>';
  
  list.slice(0, 10).forEach((p, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<span style="color:#64748b">${idx + 1}</span>`;
    
    html += `
      <div class="leaderboard-row">
        <div class="lb-rank">${medal}</div>
        <img src="${getWikiImage(p.url)}" alt="" onerror="this.style.display='none'">
        <div class="lb-info">
          <a href="${p.url}" target="_blank">${p.name}</a>
          <div class="lb-stats">🏆 Побед: ${p.winCount}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function renderRecentMatches(db) {
  const container = document.getElementById("recentMatches");
  if (!container) return;
  
  const tournament = db.active;
  if (!tournament || !tournament.rounds.length) {
    container.innerHTML = '';
    return;
  }
  
  let allMatches = [];
  tournament.rounds.forEach(r => {
    r.matches.forEach(m => {
      if (m.done) allMatches.push({...m, roundName: r.name});
    });
  });
  
  const recent = allMatches.slice(-6).reverse();
  
  if (!recent.length) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<h2>⚔️ Последние матчи</h2>';
  
  recent.forEach(m => {
    html += `
      <div class="match-mini">
        <div class="match-mini-side ${m.winner?.id === m.a.id ? 'winner' : ''}">
          <span>${m.a.name}</span>
          <span class="mini-votes">${m.votesA}</span>
        </div>
        <span class="mini-vs">VS</span>
        <div class="match-mini-side ${m.winner?.id === m.b.id ? 'winner' : ''}">
          <span>${m.b.name}</span>
          <span class="mini-votes">${m.votesB}</span>
        </div>
        <div class="mini-round">${m.roundName}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function getWikiImage(url) {
  if (!url || url === "#") return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const name = url.split('/').pop() || '?';
  return `https://via.placeholder.com/44x44/2a3142/fff?text=${encodeURIComponent(name[0].toUpperCase())}`;
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    setTimeout(() => t.remove(), 300);
  }, 2500);
}
