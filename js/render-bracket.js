// js/render-bracket.js — рендер сетки

function renderBracketPage() {
  let db = getDB();
  let t = getActiveTournament(db);
  let el = document.getElementById("bracket");
  
  if (!el) return;
  if (!t) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:60px"><h2>Нет активного турнира</h2><p>Создайте турнир в админке</p></div>';
    return;
  }
  
  let status = t.status === "active" ? "🔥 Активен" : "✅ Завершён";
  let html = `
    <div class="bracket-header">
      <h1>${t.name}</h1>
      <span class="badge">${status}</span>
    </div>
    <div class="bracket-sub">${t.description || ''}</div>`;
  
  // Текущий раунд
  let round = t.rounds[t.currentRound];
  if (round && t.status === "active") {
    html += renderRound(round, t);
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
      let canVote = idx === t.currentRound && t.status === "active" && !m.done && !m.a.isBye && !m.b.isBye 
        && !localStorage.getItem(`vote_${t.id}_${idx}_${mi}`);
      
      html += `<div class="bracket-match ${m.done ? 'done' : ''} ${canVote ? 'canvote' : ''}">
        <div class="bm-player ${wa ? 'winner' : ''} ${m.a.isBye ? 'bye' : ''}">
          <img src="${wikiImg(m.a.url)}" onerror="this.style.display='none'">
          <span>${m.a.name}</span>
          <b>${m.votesA}</b>
        </div>
        <div class="bm-vs">`;
      
      if (canVote) {
        html += `<button onclick="doVote(${idx},${mi},0)">▲ ${m.votesA}</button>
          <span>VS</span>
          <button onclick="doVote(${idx},${mi},1)">▲ ${m.votesB}</button>`;
      } else if (m.done) {
        html += `<span class="final-sc">${m.votesA} : ${m.votesB}</span>`;
      } else {
        html += `<span>VS</span>`;
      }
      
      html += `</div>
        <div class="bm-player ${wb ? 'winner' : ''} ${m.b.isBye ? 'bye' : ''}">
          <img src="${wikiImg(m.b.url)}" onerror="this.style.display='none'">
          <span>${m.b.name}</span>
          <b>${m.votesB}</b>
        </div>
      </div>`;
    });
    
    html += '</div>';
  });
  html += '</div>';
  
  // Победитель
  if (t.winner) {
    html += `<div class="champion">
      <h3>👑 Победитель турнира</h3>
      <img src="${wikiImg(t.winner.url)}" onerror="this.style.display='none'">
      <div class="champ-name">${t.winner.name}</div>
      <div class="champ-wins">${t.winner.wins || 0} побед</div>
    </div>`;
  }
  
  // Админ-кнопка
  if (isAdmin() && t.status === "active") {
    html += `<div style="text-align:center;margin-top:30px">
      <button onclick="adminNextRound()" class="btn-admin">⏭️ Завершить раунд</button>
    </div>`;
  }
  
  el.innerHTML = html;
  startTimers(t);
}

function renderRound(round, tournament) {
  if (!round.startedAt) return '';
  let left = getTimeLeft(round.startedAt, tournament.config.voteDurationHours);
  return `<div class="round-info">⏱️ До конца раунда: <span class="timer" data-left="${left}">${formatDuration(left)}</span></div>`;
}

function startTimers(tournament) {
  document.querySelectorAll('.timer').forEach(el => {
    let tick = () => {
      let left = parseInt(el.dataset.left) - 1000;
      if (left <= 0) { el.textContent = "00:00:00"; el.style.color = "#22c55e"; return; }
      el.dataset.left = left;
      el.textContent = formatDuration(left);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function doVote(rIdx, mIdx, side) {
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

function wikiImg(url) {
  if (!url || url === "#") return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  let n = (url.split('/').pop() || '?')[0].toUpperCase();
  return `https://via.placeholder.com/40x40/1e293b/94a3b8?text=${encodeURIComponent(n)}`;
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
