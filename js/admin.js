// js/admin.js — панель администратора

function enter() {
  let p = password.value;
  if (loginAdmin(p)) {
    login.style.display = "none";
    panel.style.display = "block";
    showStats();
  } else {
    alert("Неверный пароль");
  }
}

function importPlayers() {
  let lines = importBox.value.split("\n").filter(x => x.trim());
  if (lines.length === 0) {
    alert("Введите хотя бы одного участника");
    return;
  }
  
  let db = getDB();
  
  db.players = lines.map((x, idx) => {
    let parts = x.split("|").map(s => s.trim());
    let name = parts[0];
    let url = parts[1] || "#";
    return {
      id: "p_" + idx + "_" + name,
      name: name,
      url: url,
      wins: 0
    };
  });
  
  saveDB(db);
  alert("✅ Импортировано " + db.players.length + " участников");
  showStats();
}

function newTournament() {
  const db = getDB();
  
  if (db.players.length < 2) {
    alert("❌ Нужно минимум 2 участника! Импортируйте список.");
    return;
  }
  
  if (db.active && db.active.status === 'active') {
    if (!confirm("Уже есть активный турнир. Создать новый? Старый будет перезаписан.")) return;
  }
  
  db.active = createBracket(db.players);
  db.active.rounds[0].startedAt = new Date();
  
  saveDB(db);
  alert("✅ Турнир создан! Всего раундов: " + db.active.rounds.length + "\nПерейдите на страницу Сетки.");
  showStats();
}

function nextRound() {
  const db = getDB();
  if (!db.active || db.active.status !== 'active') {
    alert("❌ Нет активного турнира");
    return;
  }
  
  const current = db.active.rounds[db.active.currentRound];
  if (!current.startedAt) {
    alert("❌ Текущий раунд ещё не начался");
    return;
  }
  
  db.active = finalizeRound(db.active);
  saveDB(db);
  
  if (db.active.status === 'completed') {
    alert("🏆 Турнир завершён!\nПобедитель: " + db.active.winner.name);
  } else {
    const nextName = db.active.rounds[db.active.currentRound]?.name || 'следующий раунд';
    alert("🔄 Раунд завершён!\nСледующий этап: " + nextName);
  }
  
  showStats();
}

function clearDB() {
  if (!confirm("⚠️ ВСЕ ДАННЫЕ БУДУТ УДАЛЕНЫ!\nУчастники, турниры, голоса — всё.\nПродолжить?")) return;
  localStorage.clear();
  location.reload();
}

function showStats() {
  const db = getDB();
  let html = `
    <div class="stat-card">👥 Участников: <b>${db.players.length}</b></div>
    <div class="stat-card">🏆 Завершённых турниров: <b>${(db.pastTournaments || []).length}</b></div>
  `;
  
  if (db.active) {
    const status = db.active.status === 'active' ? '🔥 Активен' : '✅ Завершён';
    const current = db.active.status === 'active' 
      ? (db.active.rounds[db.active.currentRound]?.name || '—') 
      : '—';
    const totalRounds = db.active.rounds.length;
    
    html += `
      <div class="stat-card">📊 Текущий турнир: <b>${status}</b></div>
      <div class="stat-card">🎯 Этап: <b>${current}</b> (всего ${totalRounds} раундов)</div>
    `;
    
    if (db.active.winner) {
      html += `<div class="stat-card">👑 Последний победитель: <b>${db.active.winner.name}</b></div>`;
    }
  } else {
    html += `<div class="stat-card">📊 Нет активного турнира</div>`;
  }
  
  stats.innerHTML = html;
}
