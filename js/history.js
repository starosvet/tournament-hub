// js/history.js — история матчей

function showHistory() {
  const db = getDB();
  
  let allLogs = [];
  
  if (db.active && db.active.logs) {
    allLogs = [...db.active.logs];
  }
  
  if (db.pastTournaments) {
    db.pastTournaments.forEach(t => {
      if (t.logs) allLogs = allLogs.concat(t.logs);
    });
  }
  
  allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (allLogs.length === 0) {
    history.innerHTML = '<div class="card">История пуста. Создайте турнир и проведите матчи.</div>';
    return;
  }
  
  let html = '<div class="history-grid">';
  
  allLogs.forEach(x => {
    const date = new Date(x.date).toLocaleString('ru-RU');
    html += `
      <div class="history-card">
        <div class="match-title">
          <a href="${x.match.a.url}" target="_blank">${x.match.a.name}</a>
          <span style="color:#64748b"> vs </span>
          <a href="${x.match.b.url}" target="_blank">${x.match.b.name}</a>
        </div>
        <div class="winner">🏆 Победитель: ${x.winner}</div>
        <div class="date">📅 ${date} · ${x.roundName || ''}</div>
        <div style="margin-top:8px; color:#64748b; font-size:13px;">
          Счёт: ${x.match.votesA} : ${x.match.votesB}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  history.innerHTML = html;
}
