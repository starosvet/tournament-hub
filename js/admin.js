/* ============================================================
   Tournament Hub Admin Panel (Supabase)
   ============================================================ */

(function () {
  'use strict';

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

  async function toast(msg) {
    // Лог в Supabase
    try {
      await window.TH.logAction('toast', { message: msg });
    } catch(e) {}

    const existing = document.getElementById("th-toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "th-toast";
    el.textContent = msg;
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:rgba(17,24,39,0.95);color:#fff;font:14px/1.4 system-ui,sans-serif;z-index:99999;max-width:min(92vw,680px);box-shadow:0 10px 30px rgba(0,0,0,.28);";
    document.body.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 2200);
  }

  async function getActiveTournament() {
    const { data } = await window.TH.getTournaments();
    return data?.find(t => t.status === 'active') || data?.[0] || null;
  }

  /* ---------- AUTH ---------- */
  async function doLogin() {
    const pass = document.getElementById("adminPass").value;
    if (!pass) {
      document.getElementById("authStatus").innerHTML = "<span class='error'>Введите пароль</span>";
      return;
    }

    // Проверяем Supabase admin
    const isAdmin = await window.TH.isAdmin();
    if (isAdmin || pass === "admin123") {
      localStorage.setItem("th_admin", "yes");
      document.getElementById("authStatus").innerHTML = "<span class='success'>✔ Вход выполнен</span>";
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      await refreshAll();
      await window.TH.logAction('admin_login', { method: isAdmin ? 'supabase' : 'password' });
    } else {
      document.getElementById("authStatus").innerHTML = "<span class='error'>❌ Неверный пароль</span>";
    }
  }

  async function checkAuth() {
    const isAdmin = await window.TH.isAdmin();
    if (isAdmin || localStorage.getItem("th_admin") === "yes") {
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      await refreshAll();
    }
  }

  /* ---------- TABS ---------- */
  async function switchTab(name) {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + name));
    if (name === "users") await renderUsers();
    if (name === "moderation") await renderModeration();
    if (name === "settings") await loadSettings();
  }

  /* ---------- TOURNAMENT CREATE ---------- */
  async function doCreateTournament() {
    const name = document.getElementById("tName").value.trim();
    const desc = document.getElementById("tDesc").value.trim();
    const raw = document.getElementById("tData").value;

    if (!name) { toast("Введите название турнира"); return; }
    if (!raw.trim()) { toast("Введите список участников"); return; }

    const players = raw.split("
").map(line => {
      line = line.trim();
      if (!line) return null;
      const parts = line.split("|").map(s => s.trim());
      return {
        name: parts[0] || line,
        image_url: parts[1] || "",
        type: "character",
        description: ""
      };
    }).filter(Boolean);

    if (players.length < 2) { toast("Минимум 2 участника"); return; }

    try {
      // Создаём турнир
      const { data: tournament, error } = await window.TH.createTournament({
        title: name,
        description: desc,
        status: 'draft'
      });

      if (error) throw error;

      // Создаём игроков
      const playersWithTournament = players.map((p, i) => ({
        ...p,
        tournament_id: tournament.id,
        seed: i
      }));

      const { error: playersError } = await window.TH.createPlayers(playersWithTournament);
      if (playersError) throw playersError;

      toast("✅ Турнир создан: " + name);
      document.getElementById("tName").value = "";
      document.getElementById("tDesc").value = "";
      document.getElementById("tData").value = "";
      document.getElementById("tCreateStatus").innerHTML = "<span class='success'>Создано!</span>";
      await window.TH.logAction('create_tournament', { title: name, id: tournament.id });
      await refreshAll();
    } catch (e) {
      document.getElementById("tCreateStatus").innerHTML = "<span class='error'>" + escapeHTML(e.message) + "</span>";
    }
  }

  /* ---------- TOURNAMENT MANAGE ---------- */
  async function doStartTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира. Создайте сначала."); return; }
    if (t.status !== "draft") { toast("Турнир уже запущен или завершён"); return; }

    try {
      // Генерируем сетку через engine.js
      const bracket = createBracket(t.players);

      // Создаём раунды и матчи в Supabase
      for (let i = 0; i < bracket.rounds.length; i++) {
        const round = bracket.rounds[i];
        const { data: roundData } = await window.TH.getClient()
          .from('rounds')
          .insert({
            tournament_id: t.id,
            round_number: i,
            name: round.name,
            is_active: i === 0,
            started_at: i === 0 ? new Date().toISOString() : null
          })
          .select()
          .single();

        // Создаём матчи
        if (round.matches && round.matches.length) {
          const matches = round.matches.map((m, idx) => ({
            round_id: roundData.id,
            tournament_id: t.id,
            player1_id: m.player1?.id || null,
            player2_id: m.player2?.id || null,
            match_order: idx,
            status: 'pending'
          }));

          await window.TH.getClient().from('matches').insert(matches);
        }
      }

      // Обновляем статус турнира
      await window.TH.updateTournament(t.id, {
        status: 'active',
        current_round: 0
      });

      toast("🚀 Турнир запущен!");
      await window.TH.logAction('start_tournament', { id: t.id, title: t.title });
      await refreshAll();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function doAdvanceRound(force) {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (t.status !== "active") { toast("Турнир не активен"); return; }

    if (force && !confirm("Принудительно завершить раунд?")) return;

    try {
      // Получаем текущий раунд
      const { data: rounds } = await window.TH.getClient()
        .from('rounds')
        .select('*, matches:matches(*)')
        .eq('tournament_id', t.id)
        .eq('round_number', t.current_round);

      const currentRound = rounds?.[0];
      if (!currentRound) { toast("Нет текущего раунда"); return; }

      // Определяем победителей
      const winners = [];
      for (const match of (currentRound.matches || [])) {
        if (match.finished && match.winner_id) {
          const { data: winner } = await window.TH.getClient()
            .from('players')
            .select('*')
            .eq('id', match.winner_id)
            .single();
          if (winner) winners.push(winner);
        } else if (force && match.player1_id) {
          const { data: p1 } = await window.TH.getClient()
            .from('players')
            .select('*')
            .eq('id', match.player1_id)
            .single();
          if (p1) winners.push(p1);

          // Помечаем матч как завершённый
          await window.TH.getClient()
            .from('matches')
            .update({ finished: true, winner_id: match.player1_id, status: 'done' })
            .eq('id', match.id);
        }
      }

      // Завершаем текущий раунд
      await window.TH.getClient()
        .from('rounds')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', currentRound.id);

      if (winners.length < 2) {
        // Финал
        await window.TH.updateTournament(t.id, {
          status: 'finished',
          completed_at: new Date().toISOString(),
          winner_id: winners[0]?.id || null
        });
        toast("🏆 Турнир завершён! Победитель: " + (winners[0]?.name || "?"));
      } else {
        // Создаём следующий раунд
        const { data: newRound } = await window.TH.getClient()
          .from('rounds')
          .insert({
            tournament_id: t.id,
            round_number: t.current_round + 1,
            name: roundTitle(winners.length * 2),
            is_active: true,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        // Создаём матчи
        const newMatches = [];
        for (let i = 0; i < winners.length; i += 2) {
          newMatches.push({
            round_id: newRound.id,
            tournament_id: t.id,
            player1_id: winners[i]?.id || null,
            player2_id: winners[i + 1]?.id || null,
            match_order: Math.floor(i / 2),
            status: 'pending'
          });
        }
        await window.TH.getClient().from('matches').insert(newMatches);

        await window.TH.updateTournament(t.id, {
          current_round: t.current_round + 1
        });

        toast("⏭ Раунд завершён, следующий начался");
      }

      await window.TH.logAction('advance_round', { tournament_id: t.id, round: t.current_round });
      await refreshAll();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function doResetVotes() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm("Сбросить ВСЕ голоса в турнире?")) return;

    try {
      // Удаляем все голоса турнира
      await window.TH.getClient()
        .from('votes')
        .delete()
        .eq('tournament_id', t.id);

      // Сбрасываем счётчики матчей
      await window.TH.getClient()
        .from('matches')
        .update({ votes1: 0, votes2: 0 })
        .eq('tournament_id', t.id);

      toast("🔄 Голоса сброшены");
      await window.TH.logAction('reset_votes', { tournament_id: t.id });
      await refreshAll();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function doArchiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }

    await window.TH.updateTournament(t.id, {
      status: 'archived',
      archived_at: new Date().toISOString()
    });

    toast("📦 Турнир архивирован");
    await window.TH.logAction('archive_tournament', { id: t.id });
    await refreshAll();
  }

  async function doDeleteActiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm('Точно удалить турнир "' + t.title + '"?')) return;

    await window.TH.deleteTournament(t.id);
    toast("🗑 Турнир удалён");
    await window.TH.logAction('delete_tournament', { id: t.id, title: t.title });
    await refreshAll();
  }

  /* ---------- PARTICIPANT EDITOR ---------- */
  let editingParticipants = [];

  async function renderParticipantEditor() {
    const t = await getActiveTournament();
    const container = document.getElementById("participantEditor");

    if (!t || t.status !== "draft") {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Редактор доступен только для черновиков.</p>`;
      return;
    }

    const { data: players } = await window.TH.getPlayers(t.id);
    editingParticipants = (players || []).map(p => ({ ...p }));
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
        <input type="text" value="${escapeHTML(p.image_url || p.image || '')}" onchange="Admin.updateParticipant(${i}, 'image_url', this.value)" placeholder="URL изображения" style="flex:0.8;"/>
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
    editingParticipants.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      name: "",
      image_url: "",
      type: "character",
      description: ""
    });
    refreshParticipantRows();
  }

  async function saveParticipants() {
    const t = await getActiveTournament();
    if (!t || t.status !== "draft") { toast("Нельзя редактировать запущенный турнир"); return; }

    const valid = editingParticipants.filter(p => p.name.trim());
    if (valid.length < 2) { toast("Минимум 2 участника с именем"); return; }

    try {
      // Удаляем старых и создаём новых
      await window.TH.getClient()
        .from('players')
        .delete()
        .eq('tournament_id', t.id);

      const toInsert = valid.map((p, i) => ({
        tournament_id: t.id,
        name: p.name,
        image_url: p.image_url || p.image || '',
        type: p.type || 'character',
        description: p.description || '',
        seed: i
      }));

      await window.TH.createPlayers(toInsert);

      document.getElementById("participantSaveStatus").innerHTML = "<span class='success'>✅ Сохранено (" + valid.length + " участников)</span>";
      await window.TH.logAction('update_players', { tournament_id: t.id, count: valid.length });
      await refreshAll();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  /* ---------- FORCE WIN ---------- */
  async function renderForceWin() {
    const t = await getActiveTournament();
    const container = document.getElementById("forceWinList");

    if (!t || t.status !== "active") {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет активного раунда</p>`;
      return;
    }

    const { data: rounds } = await window.TH.getClient()
      .from('rounds')
      .select('*, matches:matches(*, player1:player1_id(*), player2:player2_id(*))')
      .eq('tournament_id', t.id)
      .eq('is_active', true);

    const round = rounds?.[0];
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
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player1_id}', 1)">P1 Win</button>
        <button class="btn-warn" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player2_id}', 2)">P2 Win</button>
      </div>
    `).join("");
  }

  async function forceWin(matchId, playerId, playerNum) {
    try {
      await window.TH.updateMatch(matchId, {
        winner_id: playerId,
        finished: true,
        status: 'done'
      });

      toast("🏁 Победитель назначен вручную");
      await window.TH.logAction('force_win', { match_id: matchId, player_num: playerNum });
      await refreshAll();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  /* ---------- USER MANAGEMENT ---------- */
  async function renderUsers() {
    const tbody = document.querySelector("#usersTable tbody");
    if (!tbody) return;

    try {
      const { data: users } = await window.TH.getAllUsers();

      if (!users || !users.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);">Нет пользователей</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${escapeHTML(u.username)}</td>
          <td>${escapeHTML(u.display_name || u.username)}</td>
          <td>${u.authType || 'supabase'}</td>
          <td><span style="color:${u.role === "admin" ? "var(--accent)" : "var(--text-2)"};font-weight:${u.role === "admin" ? "700" : "400"};">${u.role || "user"}</span></td>
          <td>${u.votes_count || 0}</td>
          <td>${u.fandom_name ? escapeHTML(u.fandom_name) : "—"}</td>
          <td>
            <button class="btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="Admin.toggleAdmin('${u.id}')">${u.role === "admin" ? "Снять админку" : "Сделать админом"}</button>
          </td>
        </tr>
      `).join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);">Ошибка загрузки</td></tr>`;
    }
  }

  async function toggleAdmin(userId) {
    try {
      const { data: user } = await window.TH.getClient()
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      const newRole = user.role === 'admin' ? 'user' : 'admin';
      await window.TH.setUserRole(userId, newRole);

      toast(newRole === 'admin' ? "👑 Админка выдана" : "👤 Админка снята");
      await window.TH.logAction('change_role', { user_id: userId, new_role: newRole });
      await renderUsers();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  /* ---------- MODERATION ---------- */
  async function renderModeration() {
    try {
      // Комментарии
      const { data: comments } = await window.TH.getClient()
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      const cList = document.getElementById("modCommentsList");
      if (!comments || !comments.length) {
        cList.innerHTML = `<p style="color:var(--text-3);">Нет комментариев</p>`;
      } else {
        cList.innerHTML = comments.map(c => `
          <div style="padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="font-size:13px;">${escapeHTML(c.username)}</strong>
              <span style="font-size:11px;color:var(--text-3);">${new Date(c.created_at).toLocaleString("ru-RU")}</span>
            </div>
            <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">${escapeHTML(c.text)}</div>
            <button class="btn-danger danger" style="padding:4px 10px;font-size:11px;" onclick="Admin.deleteComment('${c.id}')">🗑 Удалить</button>
          </div>
        `).join("");
      }

      // Чат
      const { data: chat } = await window.TH.getChatMessages(10);
      const chatPreview = document.getElementById("modChatPreview");
      if (!chat || !chat.length) {
        chatPreview.innerHTML = `<p style="color:var(--text-3);">Нет сообщений</p>`;
      } else {
        chatPreview.innerHTML = chat.slice(-10).map(m => `
          <div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
            <strong style="color:var(--accent);">${escapeHTML(m.username)}</strong>: ${escapeHTML(m.text)}
          </div>
        `).join("");
      }
    } catch (e) {
      console.warn('Moderation render error', e);
    }
  }

  async function deleteComment(id) {
    try {
      await window.TH.deleteComment(id);
      toast("🗑 Комментарий удалён");
      await renderModeration();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function doClearChat() {
    if (!confirm("Очистить ВЕСЬ чат?")) return;
    try {
      await window.TH.getClient().from('chat_messages').delete().neq('id', '0');
      toast("💬 Чат очищен");
      await window.TH.logAction('clear_chat');
      await renderModeration();
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  /* ---------- SETTINGS ---------- */
  async function loadSettings() {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      if (settings) {
        document.getElementById("settingSiteName").value = settings.site_name || "";
        document.getElementById("settingDesc").value = settings.description || "";
        document.getElementById("settingLogo").value = settings.site_logo || "";
        document.getElementById("settingTheme").value = settings.theme || "amber";
      }
      await renderFandomAdmins();
    } catch (e) {
      console.warn('Settings load error', e);
    }
  }

  async function saveSiteSettings() {
    try {
      await window.TH.updateSiteSettings({
        site_name: document.getElementById("settingSiteName").value.trim(),
        description: document.getElementById("settingDesc").value.trim(),
        site_logo: document.getElementById("settingLogo").value.trim(),
        theme: document.getElementById("settingTheme").value
      });

      document.getElementById("settingsStatus").innerHTML = "<span class='success'>✅ Настройки сохранены</span>";
      await window.TH.logAction('update_settings');

      const logoEl = document.getElementById("siteLogoLink");
      if (logoEl) {
        const { data } = await window.TH.getSiteSettings();
        logoEl.textContent = (data?.site_logo || "🏆") + " " + (data?.site_name || "Tournament Hub");
      }
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function renderFandomAdmins() {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = settings?.fandom_admins || [];
      const container = document.getElementById("fandomAdminsList");

      if (!admins.length) {
        container.innerHTML = `<span style="color:var(--text-3);font-size:13px;">Нет админов Fandom</span>`;
        return;
      }

      container.innerHTML = admins.map(a => `
        <span class="fandom-admin-tag">${escapeHTML(a)} <button onclick="Admin.removeFandomAdmin('${escapeHTML(a)}')">×</button></span>
      `).join("");
    } catch (e) {
      console.warn('Fandom admins render error', e);
    }
  }

  async function addFandomAdmin() {
    const name = document.getElementById("newFandomAdmin").value.trim();
    if (!name) return;

    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = settings?.fandom_admins || [];
      if (!admins.includes(name)) {
        admins.push(name);
        await window.TH.updateSiteSettings({ fandom_admins: admins });
      }
      document.getElementById("newFandomAdmin").value = "";
      await renderFandomAdmins();
      await window.TH.logAction('add_fandom_admin', { name });
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function removeFandomAdmin(name) {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = (settings?.fandom_admins || []).filter(a => a !== name);
      await window.TH.updateSiteSettings({ fandom_admins: admins });
      await renderFandomAdmins();
      await window.TH.logAction('remove_fandom_admin', { name });
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  /* ---------- IMPORT / EXPORT ---------- */
  async function doExport() {
    try {
      const { data: tournaments } = await window.TH.getTournaments();
      const { data: users } = await window.TH.getAllUsers();
      const { data: settings } = await window.TH.getSiteSettings();

      const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        data: {
          tournaments,
          users,
          settings
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tournament-hub-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);

      toast("📥 Экспортировано из Supabase");
      await window.TH.logAction('export_data');
    } catch (e) {
      toast("❌ " + e.message);
    }
  }

  async function doImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup || !backup.data) {
          toast("❌ Неверный формат бэкапа");
          return;
        }

        // Импорт настроек
        if (backup.data.settings) {
          await window.TH.updateSiteSettings(backup.data.settings);
        }

        toast("📤 Импорт завершён (настройки обновлены)");
        await window.TH.logAction('import_data');
        await refreshAll();
      } catch (err) {
        toast("❌ Ошибка импорта: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function doResetAll() {
    if (!confirm("ВЫ УВЕРЕНЫ? Это удалит ВСЕ локальные данные!")) return;
    if (prompt('Введите "DELETE" для подтверждения:') !== "DELETE") return;

    localStorage.clear();
    toast("💥 Локальные данные удалены. Перезагрузка...");
    setTimeout(() => location.reload(), 1500);
  }

  /* ---------- REFRESH ---------- */
  async function refreshAll() {
    await refreshActiveTournament();
    await refreshTournamentList();
    await renderParticipantEditor();
    await renderForceWin();
    await renderUsers();
    await renderModeration();
    await loadSettings();
    await renderLog();
  }

  async function refreshActiveTournament() {
    const t = await getActiveTournament();
    const el = document.getElementById("activeTournamentInfo");
    if (!t) {
      el.innerHTML = "Нет активного турнира. Создайте новый выше.";
      return;
    }

    const { data: players } = await window.TH.getPlayers(t.id);
    const { data: rounds } = await window.TH.getClient()
      .from('rounds')
      .select('*')
      .eq('tournament_id', t.id);

    el.innerHTML = `<b>${escapeHTML(t.title)}</b> (${t.status}) — ${(players || []).length} участников, ${(rounds || []).length} раундов, текущий раунд: ${(t.current_round || 0) + 1}`;
  }

  async function refreshTournamentList() {
    try {
      const { data: tournaments } = await window.TH.getTournaments();
      const el = document.getElementById("tournamentList");

      if (!tournaments || !tournaments.length) {
        el.innerHTML = "Нет турниров";
        return;
      }

      el.innerHTML = tournaments.map(t => `
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
    } catch (e) {
      console.warn('Tournament list error', e);
    }
  }

  function setActive(id) {
    localStorage.setItem('th_active_tournament', id);
    toast("✅ Турнир активирован (локально)");
    refreshAll();
  }

  async function renderLog() {
    const el = document.getElementById("adminLog");
    if (!el) return;

    try {
      const { data: logs } = await window.TH.getAdminLogs(MAX_LOG);

      if (!logs || !logs.length) {
        el.innerHTML = `<div class="log-entry"><span class="time">[--:--:--]</span> Лог пуст</div>`;
        return;
      }

      el.innerHTML = logs.map(l => {
        const time = new Date(l.created_at).toLocaleTimeString("ru-RU");
        return `<div class="log-entry"><span class="time">[${time}]</span> ${escapeHTML(l.action)}: ${escapeHTML(JSON.stringify(l.details))}</div>`;
      }).join("");
    } catch (e) {
      el.innerHTML = `<div class="log-entry"><span class="time">[--:--:--]</span> Ошибка загрузки лога</div>`;
    }
  }

  function clearLog() {
    // Лог в Supabase не удаляем, просто очищаем отображение
    const el = document.getElementById("adminLog");
    if (el) el.innerHTML = `<div class="log-entry"><span class="time">[--:--:--]</span> Лог очищен</div>`;
  }

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", function() {
    checkAuth();
  });

  /* ---------- EXPORT ---------- */
  window.Admin = {
    doLogin,
    switchTab,
    doCreateTournament,
    doStartTournament,
    doAdvanceRound,
    doResetVotes,
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
