// js/render.js — рендер главной страницы

function loadPage() {
  let db = getDB();
  renderTop(db);
  renderCurrentRound(db);
}

function renderTop(db) {
  let html = "";
  let list = [...db.players].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  
  if (list.length === 0) {
    html = '<div class="card">Пока нет участников. Импортируйте в админке.</div>';
  } else {
    list.slice(0, 10).forEach(p => {
      html += `
        <div class="card">
          <div class="player-row">
            <img src="${getWikiImage(p.url)}" alt="" onerror="this.style.display='none'">
            <div>
              <a href="${p.url}" target="_blank">${p.name}</a>
              <div class="wins">🏆 Побед: ${p.wins || 0}</div>
            </div>
          </div>
        </div>
      `;
    });
  }
  
  leaderboard.innerHTML = html;
}

function renderCurrentRound(db) {
  if (!db.active || db.active.status !== 'active') {
    round.innerHTML = '<div class="card">Нет активного турнира. Создайте в админке.</div>';
    return;
  }
  
  const tournament = db.active;
  const currentRound = tournament.rounds[tournament.currentRound];
  
  if (!currentRound) {
    round.innerHTML = '<div class="card">Турнир завершён!</div>';
    return;
  }
  
  let html = `<div class="round-header">
    <h3>${currentRound.name}</h3>
    ${currentRound.startedAt ? `<div class="timer-main" id="mainTimer">${formatTime(getTimeLeft(currentRound.startedAt, 24))}</div>` : ''}
  </div>`;
  
  currentRound.matches.forEach((m, i) => {
    const canVote = !m.done && !m.a.isBye && !m.b.isBye && !localStorage.getItem(`vote_${tournament.id}_${tournament.currentRound}_${i}`);
    
    html += `
      <div class="match">
        <div class="match-side ${m.done && m.winner?.id === m.a.id ? 'winner' : ''}">
          <img src="${getWikiImage(m.a.url)}" alt="" onerror="this.style.display='none'">
          <a href="${m.a.url}" target="_blank">${m.a.name}</a>
        </div>
        
        <div class="match-center">
          ${!m.done ? `
            <button onclick="voteCurrent(${i}, 0)" ${!canVote ? 'disabled class="voted"' : ''}>
              ${canVote ? 'Голосовать' : '✓'} ${m.votesA}
            </button>
            <span class="vs">VS</span>
            <button onclick="voteCurrent(${i}, 1)" ${!canVote ? 'disabled class="voted"' : ''}>
              ${canVote ? 'Голосовать' : '✓'} ${m.votesB}
            </button>
          ` : `
            <div class="final-result">
              <span class="${m.winner?.id === m.a.id ? 'winner-text' : ''}">${m.votesA}</span>
              <span class="vs">:</span>
              <span class="${m.winner?.id === m.b.id ? 'winner-text' : ''}">${m.votesB}</span>
            </div>
            <div class="match-winner">🏆 ${m.winner?.name || '?'}</div>
          `}
        </div>
        
        <div class="match-side ${m.done && m.winner?.id === m.b.id ? 'winner' : ''}">
          <img src="${getWikiImage(m.b.url)}" alt="" onerror="this.style.display='none'">
          <a href="${m.b.url}" target="_blank">${m.b.name}</a>
        </div>
      </div>
    `;
  });
  
  round.innerHTML = html;
  
  if (currentRound.startedAt) {
    startMainTimer();
  }
}

function startMainTimer() {
  const timerEl = document.getElementById('mainTimer');
  if (!timerEl) return;
  
  const update = () => {
    const db = getDB();
    if (!db.active || db.active.status !== 'active') return;
    const currentRound = db.active.rounds[db.active.currentRound];
    if (!currentRound || !currentRound.startedAt) return;
    
    const left = getTimeLeft(currentRound.startedAt, 24);
    timerEl.textContent = formatTime(left);
    
    if (left > 0) {
      requestAnimationFrame(update);
    } else {
      timerEl.textContent = "00:00:00";
      timerEl.style.color = "#22c55e";
    }
  };
  update();
}

function voteCurrent(matchIdx, side) {
  let db = getDB();
  if (!db.active || db.active.status !== 'active') return;
  
  const result = voteMatch(db.active, db.active.currentRound, matchIdx, side);
  
  if (result.success) {
    saveDB(db);
    loadPage();
    showToast("✅ Голос засчитан!");
  } else {
    showToast("❌ " + result.error);
  }
}

function getWikiImage(url) {
  if (!url || url === "#") return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const name = url.split('/').pop() || '?';
  return `https://via.placeholder.com/50x50/2a3142/fff?text=${encodeURIComponent(name[0].toUpperCase())}`;
}

function formatTime(ms) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
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
