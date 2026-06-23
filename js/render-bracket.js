// js/render-bracket.js — отрисовка страницы сетки

function renderBracketPage() {
  const db = getDB();
  const tournament = db.active;
  
  if (!tournament) {
    bracket.innerHTML = '<div class="card">Нет активного турнира. Создайте в админке.</div>';
    return;
  }
  
  let html = `<div class="tournament-header">
    <h2>${tournament.status === 'completed' ? '📁 Архив турнира' : '🔥 Текущий турнир'}</h2>
    <div class="tournament-status">${tournament.status === 'completed' ? '✅ Завершён' : '🔥 Идёт голосование'}</div>
  </div>`;
  
  html += '<div class="bracket-container">';
  
  tournament.rounds.forEach((round, rIdx) => {
    const isCurrent = rIdx === tournament.currentRound && tournament.status === 'active';
    const isPast = rIdx < tournament.currentRound || tournament.status === 'completed';
    
    html += `<div class="bracket-round ${isCurrent ? 'active' : ''} ${isPast ? 'completed' : ''}">
      <div class="round-title">${round.name}</div>`;
    
    round.matches.forEach((match, mIdx) => {
      const winnerA = match.done && match.winner?.id === match.a.id;
      const winnerB = match.done && match.winner?.id === match.b.id;
      const canVote = isCurrent && !match.done && !match.a.isBye && !match.b.isBye && !localStorage.getItem(`vote_${tournament.id}_${rIdx}_${mIdx}`);
      
      html += `
        <div class="bracket-match ${match.done ? 'finished' : ''} ${isCurrent && !match.done ? 'votable' : ''}">
          <div class="match-player ${winnerA ? 'winner' : ''} ${match.a.isBye ? 'bye' : ''}">
            <img src="${getWikiImage(match.a.url)}" alt="" onerror="this.style.display='none'">
            <a href="${match.a.url}" target="_blank">${match.a.name}</a>
            <span class="votes">${match.votesA}</span>
          </div>
          
          <div class="match-vs">
            ${isCurrent && !match.done && !match.a.isBye && !match.b.isBye ? `
              <div class="vote-buttons">
                <button onclick="handleVote(${rIdx}, ${mIdx}, 0)" ${!canVote ? 'disabled' : ''}>
                  ${canVote ? '▲ ' + match.votesA : '✓ ' + match.votesA}
                </button>
                <span class="vs-text">VS</span>
                <button onclick="handleVote(${rIdx}, ${mIdx}, 1)" ${!canVote ? 'disabled' : ''}>
                  ${canVote ? '▲ ' + match.votesB : '✓ ' + match.votesB}
                </button>
              </div>
              ${round.startedAt ? `<div class="timer">${formatTime(getTimeLeft(round.startedAt, 24))}</div>` : ''}
            ` : `
              <span class="vs-text">VS</span>
              ${match.done ? `<div class="final-score">${match.votesA} : ${match.votesB}</div>` : ''}
            `}
          </div>
          
          <div class="match-player ${winnerB ? 'winner' : ''} ${match.b.isBye ? 'bye' : ''}">
            <img src="${getWikiImage(match.b.url)}" alt="" onerror="this.style.display='none'">
            <a href="${match.b.url}" target="_blank">${match.b.name}</a>
            <span class="votes">${match.votesB}</span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  html += '</div>';
  
  if (tournament.status === 'active') {
    html += `<div class="admin-controls">
      <button onclick="adminFinalizeRound()" class="admin-btn">⏭️ Завершить текущий раунд</button>
      <p style="color:#64748b; font-size:13px; margin-top:10px;">Или дождитесь окончания таймера (24 часа с начала раунда)</p>
    </div>`;
  }
  
  if (tournament.winner) {
    html += `<div class="champion-card">
      <h3>👑 Победитель турнира</h3>
      <div class="champion">
        <img src="${getWikiImage(tournament.winner.url)}" alt="" onerror="this.style.display='none'">
        <a href="${tournament.winner.url}" target="_blank">${tournament.winner.name}</a>
      </div>
      <div style="margin-top:15px; color:#94a3b8; font-size:14px;">
        🏆 Побед: ${tournament.winner.wins || 0}
      </div>
    </div>`;
  }
  
  bracket.innerHTML = html;
  startBracketTimers();
}

function getWikiImage(url) {
  if (!url || url === "#") return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const name = url.split('/').pop() || '?';
  return `https://via.placeholder.com/44x44/2a3142/fff?text=${encodeURIComponent(name[0].toUpperCase())}`;
}

function formatTime(ms) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function startBracketTimers() {
  const timers = document.querySelectorAll('.timer');
  timers.forEach(t => {
    const update = () => {
      const text = t.textContent;
      if (!text || !text.includes(':')) return;
      let [h, m, s] = text.split(':').map(Number);
      let totalMs = h * 3600000 + m * 60000 + s * 1000 - 1000;
      if (totalMs <= 0) {
        t.textContent = "00:00:00";
        t.style.color = "#22c55e";
        return;
      }
      t.textContent = formatTime(totalMs);
      setTimeout(update, 1000);
    };
    setTimeout(update, 1000);
  });
}

function handleVote(rIdx, mIdx, side) {
  const db = getDB();
  const result = voteMatch(db.active, rIdx, mIdx, side);
  
  if (result.success) {
    saveDB(db);
    renderBracketPage();
    showToast("✅ Голос засчитан!");
  } else {
    showToast("❌ " + result.error);
  }
}

function adminFinalizeRound() {
  if (!isAdmin()) {
    showToast("❌ Только администратор");
    return;
  }
  
  const db = getDB();
  if (!db.active || db.active.status !== 'active') {
    showToast("Нет активного турнира");
    return;
  }
  
  const current = db.active.rounds[db.active.currentRound];
  if (!current.startedAt) {
    showToast("❌ Раунд ещё не начался");
    return;
  }
  
  db.active = finalizeRound(db.active);
  saveDB(db);
  
  if (db.active.status === 'completed') {
    showToast("🏆 Турнир завершён! Победитель: " + db.active.winner.name);
  } else {
    const nextName = db.active.rounds[db.active.currentRound]?.name || 'следующий раунд';
    showToast("🔄 Раунд завершён! Следующий: " + nextName);
  }
  
  renderBracketPage();
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
