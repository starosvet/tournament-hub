// js/render-bracket.js — рендер сетки v3 (Shikimori-style + защита)

function renderBracketPage() {
  let db = getDB();
  let t = getActiveTournament(db);
  let el = document.getElementById("bracket");
  
  if (!el) return;
  if (!t) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:60px"><h2>🏆 Нет активного турнира</h2><p>Создайте турнир в панели управления</p></div>';
    return;
  }
  
  let status = t.status === "active" ? "🔥 Активен" : "✅ Завершён";
  let statusClass = t.status === "active" ? "status-active" : "status-completed";
  
  let html = `
    <div class="bracket-header">
      <div>
        <h1>${t.name}</h1>
        <div class="bracket-sub">${t.description || ''}</div>
      </div>
      <span class="badge ${statusClass}">${status}</span>
    </div>`;
  
  // Текущий раунд — таймер и инфо
  let round = t.rounds[t.currentRound];
  if (round && t.status === "active") {
    html += renderRoundInfo(round, t);
  }
  
  // Все раунды (сетка)
  html += '<div class="bracket-grid">';
  t.rounds.forEach((r, idx) => {
    let cls = idx === t.currentRound && t.status === "active" ? "round-col active" : 
              idx < t.currentRound || t.status === "completed" ? "round-col past" : "round-col future";
    html += `<div class="${cls}">
      <div class="round-title">${r.name}</div>`;
    
    r.matches.forEach((m, mi) => {
      let wa = m.done && m.winner?.id === m.a.id;
      let wb = m.done && m.winner?.id === m.b.id;
      let user = getCurrentUser();
      let voteKey = `vote_${t.id}_${idx}_${mi}`;
      let hasVoted = localStorage.getItem(voteKey);
      let canVote = idx === t.currentRound && t.status === "active" && !m.done && !m.a.isBye && !m.b.isBye 
        && user && !hasVoted;
      
      // Проценты для визуализации
      let total = m.votesA + m.votesB;
      let pctA = total > 0 ? Math.round(m.votesA / total * 100) : 0;
      let pctB = total > 0 ? Math.round(m.votesB / total * 100) : 0;
      
      html += `<div class="bracket-match ${m.done ? 'done' : ''} ${canVote ? 'canvote' : ''} ${!user ? 'need-login' : ''}">
        <div class="bm-player ${wa ? 'winner' : ''} ${m.a.isBye ? 'bye' : ''}">
          <img src="${wikiImg(m.a.url)}" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect fill=%22%231e293b%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2225%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2214%22>${m.a.name[0]}</text></svg>'">
          <div class="bm-info">
            <span class="bm-name">${m.a.name}</span>
            ${!m.a.isBye ? `<div class="bm-bar"><div class="bm-fill" style="width:${pctA}%"></div></div>` : ''}
          </div>
          <b class="bm-score">${m.votesA}${total > 0 ? ` <small>(${pctA}%)</small>` : ''}</b>
        </div>
        <div class="bm-vs">`;
      
      if (canVote) {
        html += `<button class="vote-btn vote-a" onclick="doVote(${idx},${mi},0)" title="Голосовать за ${m.a.name}">▲</button>
          <span class="vs-divider">VS</span>
          <button class="vote-btn vote-b" onclick="doVote(${idx},${mi},1)" title="Голосовать за ${m.b.name}">▲</button>`;
      } else if (m.done) {
        html += `<span class="final-sc">${m.votesA} : ${m.votesB}</span>`;
      } else if (!user) {
        html += `<span class="vs-locked" title="Войдите, чтобы голосовать">🔒 VS</span>`;
      } else if (hasVoted) {
        html += `<span class="vs-voted" title="Вы уже проголосовали">✓ VS</span>`;
      } else {
        html += `<span>VS</span>`;
      }
      
      html += `</div>
        <div class="bm-player ${wb ? 'winner' : ''} ${m.b.isBye ? 'bye' : ''}">
          <img src="${wikiImg(m.b.url)}" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect fill=%22%231e293b%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2225%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2214%22>${m.b.name[0]}</text></svg>'">
          <div class="bm-info">
            <span class="bm-name">${m.b.name}</span>
            ${!m.b.isBye ? `<div class="bm-bar"><div class="bm-fill bm-fill-b" style="width:${pctB}%"></div></div>` : ''}
          </div>
          <b class="bm-score">${m.votesB}${total > 0 ? ` <small>(${pctB}%)</small>` : ''}</b>
        </div>
      </div>`;
    });
    
    html += '</div>';
  });
  html += '</div>';
  
  // Победитель
  if (t.winner) {
    html += `<div class="champion">
      <div class="champion-glow"></div>
      <h3>👑 Победитель турнира</h3>
      <div class="champion-avatar">
        <img src="${wikiImg(t.winner.url)}" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect fill=%22%231e293b%22 width=%22120%22 height=%22120%22/><text x=%2260%22 y=%2275%22 text-anchor=%22middle%22 fill=%22%23fbbf24%22 font-size=%2248%22>👑</text></svg>'">
      </div>
      <div class="champ-name">${t.winner.name}</div>
      <div class="champ-wins">${t.winner.wins || 0} побед в турнире</div>
    </div>`;
  }
  
  // Админ-кнопка — СКРЫТАЯ, только для админа
  if (isAdmin() && t.status === "active") {
    html += `<div class="admin-panel-float">
      <div class="admin-panel-title">⚙️ Панель администратора</div>
      <div class="admin-panel-btns">
        <button onclick="adminNextRound()" class="btn-admin">⏭️ Завершить раунд досрочно</button>
        <button onclick="resetTournament()" class="btn-danger">🔄 Сбросить турнир</button>
      </div>
      <div class="admin-panel-hint">Только администратор видит эту панель</div>
    </div>`;
  }
  
  el.innerHTML = html;
  startTimers(t);
}

function renderRoundInfo(round, tournament) {
  if (!round.startedAt) return '';
  let left = getTimeLeft(round.startedAt, tournament.config.voteDurationHours);
  let total = tournament.rounds.length;
  let current = tournament.currentRound + 1;
  
  return `<div class="round-info">
    <div class="round-info-header">
      <span>📍 Текущий этап: <b>${round.name}</b></span>
      <span class="round-progress">${current} / ${total}</span>
    </div>
    <div class="round-timer-row">
      <span class="timer-icon">⏱️</span>
      <span class="timer" data-left="${left}">${formatDuration(left)}</span>
      <span class="timer-label">до автоматического завершения</span>
    </div>
  </div>`;
}

function startTimers(tournament) {
  document.querySelectorAll('.timer').forEach(el => {
    let tick = () => {
      let left = parseInt(el.dataset.left) - 1000;
      if (left <= 0) { 
        el.textContent = "00:00:00"; 
        el.style.color = "#22c55e"; 
        el.parentElement.querySelector('.timer-label').textContent = "ожидайте завершения...";
        return; 
      }
      el.dataset.left = left;
      el.textContent = formatDuration(left);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function doVote(rIdx, mIdx, side) {
  // ПРОВЕРКА: только залогиненные
  let user = getCurrentUser();
  if (!user) {
    toast("❌ Войдите, чтобы голосовать");
    setTimeout(() => location.href = 'login.html', 1000);
    return;
  }
  
  let db = getDB();
  let t = getActiveTournament(db);
  if (!t) return;
  
  let res = voteInMatch(t, rIdx, mIdx, side);
  if (res.ok) {
    saveDB(db);
    renderBracketPage();
    toast("✅ Голос засчитан!");
  } else {
    toast("❌ " + res.err);
  }
}

function adminNextRound() {
  if (!isAdmin()) { toast("❌ Только админ"); return; }
  if (!confirm("Завершить раунд досрочно? Это действие нельзя отменить.")) return;
  
  let db = getDB();
  let t = getActiveTournament(db);
  if (!t || t.status !== "active") { toast("Нет активного турнира"); return; }
  
  let idx = db.tournaments.findIndex(x => x.id === t.id);
  db.tournaments[idx] = finalizeRound(t, db.players);
  saveDB(db);
  
  let updated = getActiveTournament(db);
  if (updated.status === "completed") {
    toast("🏆 Турнир завершён! Победитель: " + updated.winner.name);
  } else {
    toast("🔄 Раунд завершён! Следующий: " + updated.rounds[updated.currentRound].name);
  }
  renderBracketPage();
}

function resetTournament() {
  if (!isAdmin()) return;
  if (!confirm("Сбросить ВЕСЬ турнир? Все данные будут потеряны!")) return;
  
  let db = getDB();
  let t = getActiveTournament(db);
  if (!t) return;
  
  // Удаляем голоса
  resetVotes(t.id);
  
  // Удаляем турнир
  db.tournaments = db.tournaments.filter(x => x.id !== t.id);
  db.activeTournamentId = null;
  
  // Сбрасываем wins
  db.players.forEach(p => p.wins = 0);
  
  saveDB(db);
  toast("🗑️ Турнир сброшен");
  setTimeout(() => location.reload(), 500);
}

function wikiImg(url) {
  if (!url || url === "#") return '';
  // Если это прямая ссылка на изображение
  if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return url;
  // Если это ссылка на вики-страницу, пытаемся получить превью
  return '';
}

function toast(msg) {
  let existing = document.querySelector('.toast');
  if (existing) existing.remove();
  let t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; setTimeout(() => t.remove(), 300); }, 2500);
}
