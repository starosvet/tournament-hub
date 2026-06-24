/* Tournament Hub Admin Panel */
(function () {
  const LOG_KEY = "th_admin_log";
  const MAX_LOG = 100;

  /* ---------- UTILS ---------- */
  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function log(msg, type) {
    const el = document.getElementById("adminLog");
    const time = new Date().toLocaleTimeString("ru-RU");
    const entry = document.createElement("div");
    entry.className = "log-entry";
    const typeClass = type === "error" ? "error" : type === "warn" ? "warning" : "";
    entry.innerHTML = `<span class="time">[${time}]</span> <span class="${typeClass}">${escapeHTML(msg)}</span>`;
    if (el) {
      el.insertBefore(entry, el.firstChild);
      while (el.children.length > MAX_LOG) el.removeChild(el.lastChild);
    }
    // Also persist
    const logs = getLogs();
    logs.unshift({ time: Date.now(), msg, type });
    if (logs.length > MAX_LOG) logs.pop();
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  }

  function getLogs() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch (e) { return []; }
  }

  function toast(msg) {
    log(msg);
    if (typeof window.toast === "function" && window.toast !== toast) {
      window.toast(msg);
    } else {
      const existing = document.getElementById("th-toast");
      if (existing) existing.remove();
      const el = document.createElement("div");
      el.id = "th-toast";
      el.textContent = msg;
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:rgba(17,24,39,0.95);color:#fff;font:14px/1.4 system-ui,sans-serif;z-index:99999;max-width:min(92vw,680px);box-shadow:0 10px 30px rgba(0,0,0,.28);";
      document.body.appendChild(el);
      setTimeout(() => { if (el.isConnected) el.remove(); }, 2200);
    }
  }

  function getActiveTournament() {
    const db = DB.getDB();
    return db.activeTournamentId ? Tournament.getTournament(db.activeTournamentId) : null;
  }

  /* ---------- AUTH ---------- */
  function doLogin() {
    const pass = document.getElementById("adminPass").value;
    if (!pass) {
      document.getElementById("authStatus").innerHTML = "<span class='error'>Введите пароль</span>";
      return;
    }
    if (Auth.adminLogin(pass)) {
      localStorage.setItem("th_admin", "yes");
      document.getElementById("authStatus").innerHTML = "<span class='success'>✔ Вход выполнен</span>";
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      refreshAll();
      log("Админ вошёл в панель");
    } else {
      document.getElementById("authStatus").innerHTML = "<span class='error'>❌ Неверный пароль</span>";
      log("Неудачная попытка входа", "error");
    }
  }

  function checkAuth() {
    if (Auth.isAdmin()) {
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      refreshAll();
    }
  }

  /* ---------- TABS ---------- */
  function switchTab(name) {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + name));
    if (name === "users") renderUsers();
    if (name === "moderation") renderModeration();
    if (name === "settings") loadSettings();
  }

  /* ---------- TOURNAMENT CREATE ---------- */
  function doCreateTournament() {
    const name = document.getElementById("tName").value.trim();
    const desc = document.getElementById("tDesc").value.trim();
    const raw = document.getElementById("tData").value;

    if (!name) { toast("Введите название турнира"); return; }
    if (!raw.trim()) { toast("Введите список участников"); return; }

    const players = raw.split("\n").map(line => {
      line = line.trim();
      if (!line) return null;
      const parts = line.split("|").map(s => s.trim());
      return {
        id: parts[0] || line,
        name: parts[0] || line,
        image: parts[1] || "",
        type: "character",
        description: ""
      };
    }).filter(Boolean);

    if (players.length < 2) { toast("Минимум 2 участника"); return; }

    const result = Tournament.createTournament(name, desc, players);
    if (result.success) {
      toast("✅ Турнир создан: " + name);
      document.getElementById("tName").value = "";
      document.getElementById("tDesc").value = "";
      document.getElementById("tData").value = "";
      document.getElementById("tCreateStatus").innerHTML = "<span class='success'>Создано!</span>";
      log("Создан турнир: " + name);
      refreshAll();
    } else {
      document.getElementById("tCreateStatus").innerHTML = "<span class='error'>" + escapeHTML(result.error) + "</span>";
    }
  }

  /* ---------- TOURNAMENT MANAGE ---------- */
  function doStartTournament() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира. Создайте сначала."); return; }
    if (t.status !== "draft") { toast("Турнир уже запущен или завершён"); return; }

    const result = Tournament.startTournament(t.id);
    if (result.success) {
      toast("🚀 Турнир запущен!");
      log("Запущен турнир: " + t.title);
      refreshAll();
    } else {
      toast("❌ " + (result.error || "Ошибка"));
    }
  }

  function doAdvanceRound(force) {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (t.status !== "active") { toast("Турнир не активен"); return; }

    if (force && !confirm("Принудительно завершить раунд? Незавершённые матчи пройдёт верхний участник.")) return;

    // Используем engine.finalizeRound с force
    const result = finalizeRound(t, force);
    if (!result.ok) {
      toast("❌ " + result.err);
      return;
    }

    DB.updateDB(db => {
      const idx = (db.tournaments || []).findIndex(x => x.id === t.id);
      if (idx >= 0) db.tournaments[idx] = result.tournament;
    });

    if (result.finished) {
      toast("🏆 Турнир завершён! Победитель: " + (result.tournament.winner?.name || "?"));
      log("Турнир завершён: " + result.tournament.title + ", победитель: " + (result.tournament.winner?.name || "?"));
    } else {
      toast("⏭ Раунд завершён, следующий начался");
      log("Раунд завершён в турнире: " + result.tournament.title);
    }
    refreshAll();
  }

  function doResetVotes() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm("Сбросить ВСЕ голоса в турнире?")) return;

    resetVotes(t.id);
    toast("🔄 Голоса сброшены");
    log("Голоса сброшены: " + t.title);
    refreshAll();
  }

  function doUndoRound() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (t.currentRound <= 0) { toast("Нет предыдущего раунда для отката"); return; }
    if (!confirm("Откатить текущий раунд? Все матчи текущего раунда будут удалены, восстановится предыдущий.")) return;

    DB.updateDB(db => {
      const tourney = (db.tournaments || []).find(x => x.id === t.id);
      if (!tourney || !Array.isArray(tourney.rounds)) return;

      const prevRound = tourney.rounds[tourney.currentRound - 1];
      if (!prevRound) return;

      // Удаляем текущий раунд
      tourney.rounds[tourney.currentRound] = {
        id: tourney.currentRound,
        name: roundTitle(Math.pow(2, tourney.rounds.length - tourney.currentRound)),
        matches: [],
        isActive: false,
        startedAt: null,
        endedAt: null
      };

      // Восстанавливаем предыдущий
      prevRound.isActive = true;
      prevRound.endedAt = null;
      prevRound.matches.forEach(m => {
        m.winner = null;
        m.finished = false;
        m.status = "pending";
      });

      tourney.currentRound -= 1;
      tourney.status = "active";
      tourney.winner = null;
      tourney.completedAt = null;
    });

    toast("↩️ Раунд откачен");
    log("Откат раунда в: " + t.title);
    refreshAll();
  }

  function doDuplicateTournament() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира для дублирования"); return; }

    const newName = prompt("Название нового турнира:", t.title + " (копия)");
    if (!newName) return;

    const result = Tournament.createTournament(newName, t.description, t.players || []);
    if (result.success) {
      toast("📋 Турнир дублирован: " + newName);
      log("Дублирован турнир: " + newName + " из " + t.title);
      refreshAll();
    }
  }

  function doArchiveTournament() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }

    DB.updateDB(db => {
      const tourney = (db.tournaments || []).find(x => x.id === t.id);
      if (tourney) {
        tourney.status = "archived";
        tourney.archivedAt = new Date().toISOString();
      }
      if (db.activeTournamentId === t.id) db.activeTournamentId = null;
    });

    toast("📦 Турнир архивирован");
    log("Архивирован турнир: " + t.title);
    refreshAll();
  }

  function doDeleteActiveTournament() {
    const t = getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm("Точно удалить турнир \"" + t.title + "\"?")) return;

    Tournament.deleteTournament(t.id);
    toast("🗑 Турнир удалён");
    log("Удалён турнир: " + t.title);
    refreshAll();
  }

  /* ---------- PARTICIPANT EDITOR ---------- */
  let editingParticipants = [];

  function renderParticipantEditor() {
    const t = getActiveTournament();
    const container = document.getElementById("participantEditor");

    if (!t || t.status !== "draft") {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Редактор доступен только для черновиков. Создайте турнир и не запускайте его.</p>`;
      return;
    }

    editingParticipants = (t.players || []).map(p => ({ ...p }));
    refreshParticipantRows();
  }

  function refreshParticipantRows() {
    const container = document.getElementById("participantEditor");
    if (!editingParticipants.length) {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет участников</p>`;
      return;
    }

    container.innerHTML = editingParticipants.map((p, i) => `
      <div class="participant-row">
        <input type="text" value="${escapeHTML(p.name)}" onchange="Admin.updateParticipant(${i}, 'name', this.value)" placeholder="Имя"/>
        <input type="text" value="${escapeHTML(p.image)}" onchange="Admin.updateParticipant(${i}, 'image', this.value)" placeholder="URL изображения" style="flex:0.8;"/>
        <button onclick="Admin.removeParticipant(${i})" title="Удалить">×</button>
      </div>
    `).join("");
  }

  function updateParticipant(index, field, value) {
    if (editingParticipants[index]) {
      editingParticipants[index][field] = value.trim();
    }
  }

  function removeParticipant(index) {
    editingParticipants.splice(index, 1);
    refreshParticipantRows();
  }

  function addParticipantRow() {
    editingParticipants.push({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), name: "", image: "", type: "character", description: "" });
    refreshParticipantRows();
  }

  function saveParticipants() {
    const t = getActiveTournament();
    if (!t || t.status !== "draft") { toast("Нельзя редактировать запущенный турнир"); return; }

    const valid = editingParticipants.filter(p => p.name.trim());
    if (valid.length < 2) { toast("Минимум 2 участника с именем"); return; }

    DB.updateDB(db => {
      const tourney = (db.tournaments || []).find(x => x.id === t.id);
      if (tourney) tourney.players = valid;
    });

    document.getElementById("participantSaveStatus").innerHTML = "<span class='success'>✅ Сохранено (" + valid.length + " участников)</span>";
    log("Обновлены участники: " + t.title);
    refreshAll();
  }

  /* ---------- FORCE WIN ---------- */
  function renderForceWin() {
    const t = getActiveTournament();
    const container = document.getElementById("forceWinList");

    if (!t || t.status !== "active") {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет активного раунда</p>`;
      return;
    }

    const round = t.rounds?.[t.currentRound];
    if (!round) {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет текущего раунда</p>`;
      return;
    }

    const pending = (round.matches || []).filter(m => !m.finished);
    if (!pending.length) {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Все матчи завершены</p>`;
      return;
    }

    container.innerHTML = pending.map(m => `
      <div class="match-admin">
        <span style="flex:1;">${escapeHTML(m.player1?.name || "?")} <span class="score">${m.votes1 || 0}:${m.votes2 || 0}</span> ${escapeHTML(m.player2?.name || "?")}</span>
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', 1)">P1 Win</button>
        <button class="btn-warn" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', 2)">P2 Win</button>
      </div>
    `).join("");
  }

  function forceWin(matchId, playerNum) {
    const t = getActiveTournament();
    if (!t) return;

    DB.updateDB(db => {
      const tourney = (db.tournaments || []).find(x => x.id === t.id);
      if (!tourney || !Array.isArray(tourney.rounds)) return;

      for (const round of tourney.rounds) {
        const match = (round.matches || []).find(m => m.id === matchId);
        if (match) {
          match.winner = playerNum === 1 ? match.player1 : match.player2;
          match.finished = true;
          match.status = "done";
          break;
        }
      }
    });

    toast("🏁 Победитель назначен вручную");
    log("Force Win: match " + matchId + ", player " + playerNum);
    refreshAll();
  }

  /* ---------- USER MANAGEMENT ---------- */
  function renderUsers() {
    const db = DB.getDB();
    const tbody = document.querySelector("#usersTable tbody");
    if (!tbody) return;

    const users = db.users || [];
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);">Нет пользователей</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${escapeHTML(u.username)}</td>
        <td>${escapeHTML(u.displayName || u.username)}</td>
        <td>${u.authType || "guest"}</td>
        <td><span style="color:${u.role === "admin" ? "var(--accent)" : "var(--text-2)"};font-weight:${u.role === "admin" ? "700" : "400"};">${u.role || "user"}</span></td>
        <td>${u.votes || 0}</td>
        <td>${u.fandomName ? escapeHTML(u.fandomName) : "—"}</td>
        <td>
          <button class="btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="Admin.toggleAdmin('${u.id}')">${u.role === "admin" ? "Снять админку" : "Сделать админом"}</button>
        </td>
      </tr>
    `).join("");
  }

  function toggleAdmin(userId) {
    DB.updateDB(db => {
      const u = (db.users || []).find(x => x.id === userId);
      if (u) {
        u.role = u.role === "admin" ? "user" : "admin";
        toast(u.role === "admin" ? "👑 Админка выдана" : "👤 Админка снята");
        log("Роль изменена: " + u.username + " → " + u.role);
      }
    });
    renderUsers();
  }

  /* ---------- MODERATION ---------- */
  function renderModeration() {
    const db = DB.getDB();
    
    // Comments
    const comments = db.comments || [];
    const cList = document.getElementById("modCommentsList");
    if (!comments.length) {
      cList.innerHTML = `<p style="color:var(--text-3);">Нет комментариев</p>`;
    } else {
      cList.innerHTML = comments.slice(0, 50).map(c => `
        <div style="padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="font-size:13px;">${escapeHTML(c.username)}</strong>
            <span style="font-size:11px;color:var(--text-3);">${new Date(c.createdAt).toLocaleString("ru-RU")}</span>
          </div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">${escapeHTML(c.text)}</div>
          <button class="btn-danger danger" style="padding:4px 10px;font-size:11px;" onclick="Admin.deleteComment('${c.id}')">🗑 Удалить</button>
        </div>
      `).join("");
    }

    // Chat preview
    const chat = JSON.parse(localStorage.getItem("tournament_hub_chat") || "[]");
    const chatPreview = document.getElementById("modChatPreview");
    if (!chat.length) {
      chatPreview.innerHTML = `<p style="color:var(--text-3);">Нет сообщений</p>`;
    } else {
      chatPreview.innerHTML = chat.slice(-10).map(m => `
        <div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <strong style="color:var(--accent);">${escapeHTML(m.username)}</strong>: ${escapeHTML(m.text)}
        </div>
      `).join("");
    }
  }

  function deleteComment(id) {
    DB.updateDB(db => {
      db.comments = (db.comments || []).filter(c => c.id !== id);
    });
    toast("🗑 Комментарий удалён");
    log("Удалён комментарий: " + id);
    renderModeration();
  }

  function doClearChat() {
    if (!confirm("Очистить ВЕСЬ чат?")) return;
    localStorage.removeItem("tournament_hub_chat");
    toast("💬 Чат очищен");
    log("Чат очищен");
    renderModeration();
  }

  /* ---------- SETTINGS ---------- */
  function loadSettings() {
    const db = DB.getDB();
    const s = db.settings || {};
    document.getElementById("settingSiteName").value = s.siteName || "";
    document.getElementById("settingDesc").value = s.description || s.siteDesc || "";
    document.getElementById("settingLogo").value = s.siteLogo || "";
    document.getElementById("settingTheme").value = s.theme || "amber";
    renderFandomAdmins();
  }

  function saveSiteSettings() {
    const name = document.getElementById("settingSiteName").value.trim();
    const desc = document.getElementById("settingDesc").value.trim();
    const logo = document.getElementById("settingLogo").value.trim();
    const theme = document.getElementById("settingTheme").value;

    DB.updateDB(db => {
      db.settings = db.settings || {};
      if (name) db.settings.siteName = name;
      if (desc) { db.settings.description = desc; db.settings.siteDesc = desc; }
      db.settings.siteLogo = logo;
      db.settings.theme = theme;
      db.settings.accent = theme;
    });

    document.getElementById("settingsStatus").innerHTML = "<span class='success'>✅ Настройки сохранены</span>";
    log("Настройки сайта обновлены");
    
    // Обновляем логотип на странице
    const logoEl = document.getElementById("siteLogoLink");
    if (logoEl) {
      const db2 = DB.getDB();
      logoEl.textContent = (db2.settings?.siteLogo || "🏆") + " " + (db2.settings?.siteName || "Tournament Hub");
    }
  }

  function renderFandomAdmins() {
    const db = DB.getDB();
    const admins = db.settings?.fandomAdmins || [];
    const container = document.getElementById("fandomAdminsList");
    if (!admins.length) {
      container.innerHTML = `<span style="color:var(--text-3);font-size:13px;">Нет админов Fandom</span>`;
      return;
    }
    container.innerHTML = admins.map(a => `
      <span class="fandom-admin-tag">${escapeHTML(a)} <button onclick="Admin.removeFandomAdmin('${escapeHTML(a)}')">×</button></span>
    `).join("");
  }

  function addFandomAdmin() {
    const name = document.getElementById("newFandomAdmin").value.trim();
    if (!name) return;

    DB.updateDB(db => {
      db.settings = db.settings || {};
      db.settings.fandomAdmins = db.settings.fandomAdmins || [];
      if (!db.settings.fandomAdmins.includes(name)) {
        db.settings.fandomAdmins.push(name);
      }
    });

    document.getElementById("newFandomAdmin").value = "";
    renderFandomAdmins();
    log("Добавлен Fandom-админ: " + name);
  }

  function removeFandomAdmin(name) {
    DB.updateDB(db => {
      if (db.settings?.fandomAdmins) {
        db.settings.fandomAdmins = db.settings.fandomAdmins.filter(a => a !== name);
      }
    });
    renderFandomAdmins();
    log("Удалён Fandom-админ: " + name);
  }

  /* ---------- IMPORT / EXPORT ---------- */
  function doExport() {
    if (typeof Export !== "undefined" && Export.downloadBackup) {
      Export.downloadBackup();
      toast("📥 Экспортировано");
      log("Экспорт данных");
    } else {
      const db = DB.getDB();
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tournament-hub-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);
      toast("📥 Экспортировано (fallback)");
    }
  }

  function doImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof Export !== "undefined" && Export.importBackup) {
      Export.importBackup(file).then(ok => {
        if (ok) {
          toast("📤 Импорт завершён");
          log("Импорт данных");
          refreshAll();
        } else {
          toast("❌ Ошибка импорта");
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = JSON.parse(e.target.result);
          DB.saveDB(data);
          toast("📤 Импорт завершён (fallback)");
          log("Импорт данных (fallback)");
          refreshAll();
        } catch (err) {
          toast("❌ Ошибка импорта: " + err.message);
        }
      };
      reader.readAsText(file);
    }
  }

  function doResetAll() {
    if (!confirm("ВЫ УВЕРЕНЫ? Это удалит ВСЕ данные безвозвратно!")) return;
    if (!prompt('Введите "DELETE" для подтверждения:') === "DELETE") return;

    localStorage.clear();
    toast("💥 Все данные удалены. Перезагрузка...");
    log("ПОЛНЫЙ СБРОС ДАННЫХ", "error");
    setTimeout(() => location.reload(), 1500);
  }

  /* ---------- REFRESH ---------- */
  function refreshAll() {
    refreshActiveTournament();
    refreshTournamentList();
    renderParticipantEditor();
    renderForceWin();
    renderUsers();
    renderModeration();
    loadSettings();
    renderLog();
  }

  function refreshActiveTournament() {
    const t = getActiveTournament();
    const el = document.getElementById("activeTournamentInfo");
    if (!t) {
      el.innerHTML = "Нет активного турнира. Создайте новый выше.";
      return;
    }
    const roundsCount = Array.isArray(t.rounds) ? t.rounds.length : 0;
    const playersCount = Array.isArray(t.players) ? t.players.length : 0;
    el.innerHTML = `<b>${escapeHTML(t.title)}</b> (${t.status}) — ${playersCount} участников, ${roundsCount} раундов, текущий раунд: ${(t.currentRound || 0) + 1}`;
  }

  function refreshTournamentList() {
    const list = Tournament.listTournaments();
    const el = document.getElementById("tournamentList");
    if (!list.length) {
      el.innerHTML = "Нет турниров";
      return;
    }
    el.innerHTML = list.map(t => `
      <div style="margin-bottom:8px;padding:10px;background:var(--bg);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <b>${escapeHTML(t.title)}</b> <span style="color:var(--text-3);font-size:12px;">${t.status}</span>
          <div style="font-size:12px;color:var(--text-3);">${(t.players || []).length} участников</div>
        </div>
        <div style="display:flex;gap:6px;">
          <a href="bracket.html?id=${encodeURIComponent(t.id)}" target="_blank" class="btn-secondary" style="padding:6px 12px;font-size:12px;">Сетка</a>
          <button class="btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="Admin.setActive('${t.id}')">Активировать</button>
        </div>
      </div>
    `).join("");
  }

  function setActive(id) {
    DB.updateDB(db => { db.activeTournamentId = id; });
    toast("✅ Турнир активирован");
    refreshAll();
  }

  function renderLog() {
    const el = document.getElementById("adminLog");
    if (!el) return;
    const logs = getLogs();
    if (!logs.length) {
      el.innerHTML = `<div class="log-entry"><span class="time">[--:--:--]</span> Лог пуст</div>`;
      return;
    }
    el.innerHTML = logs.map(l => {
      const time = new Date(l.time).toLocaleTimeString("ru-RU");
      const typeClass = l.type === "error" ? "error" : l.type === "warn" ? "warning" : "";
      return `<div class="log-entry"><span class="time">[${time}]</span> <span class="${typeClass}">${escapeHTML(l.msg)}</span></div>`;
    }).join("");
  }

  function clearLog() {
    localStorage.removeItem(LOG_KEY);
    renderLog();
  }

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", function() {
    checkAuth();
    renderLog();
  });

  /* ---------- EXPORT ---------- */
  window.Admin = {
    doLogin,
    switchTab,
    doCreateTournament,
    doStartTournament,
    doAdvanceRound,
    doResetVotes,
    doUndoRound,
    doDuplicateTournament,
    doArchiveTournament,
    doDeleteActiveTournament,
    updateParticipant,
    removeParticipant,
    addParticipantRow,
    saveParticipants,
    forceWin,
    toggleAdmin,
    deleteComment,
    doClearChat,
    saveSiteSettings,
    addFandomAdmin,
    removeFandomAdmin,
    doExport,
    doImport,
    doResetAll,
    setActive,
    clearLog
  };

})();
