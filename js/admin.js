/* ============================================================
   ADMIN PANEL – Безопасная версия (только Supabase-роль)
   ============================================================ */
(function () {
  'use strict';

  let editingParticipants = [];

  async function getActiveTournament() {
    const { data } = await window.TH.getTournaments();
    return data?.find(t => t.status === 'active') || data?.[0] || null;
  }

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ===== LOGIN (только Supabase) =====
  async function doLogin() {
    let isSupabaseAdmin = false;
    try { isSupabaseAdmin = await window.TH.isAdmin(); } catch (e) {}
    if (isSupabaseAdmin) {
      localStorage.setItem("th_admin", "yes");
      document.getElementById("authStatus").innerHTML = "<span style='color:var(--green);'>✔ Вход выполнен</span>";
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      await refreshAll();
      try { await window.TH.logAction('admin_login', { method: 'supabase' }); } catch (e) {}
    } else {
      document.getElementById("authStatus").innerHTML = "<span style='color:var(--red);'>❌ У вас нет прав администратора</span>";
    }
  }

  async function checkAuth() {
    let isSupabaseAdmin = false;
    try { isSupabaseAdmin = await window.TH.isAdmin(); if (isSupabaseAdmin) localStorage.setItem("th_admin", "yes"); } catch (e) {}
    if (isSupabaseAdmin || localStorage.getItem("th_admin") === "yes") {
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      await refreshAll();
    }
  }

  async function switchTab(name) {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + name));
    if (name === "users") await renderUsers();
    if (name === "moderation") await renderModeration();
    if (name === "settings") await loadSettings();
    if (name === "manage") await renderManageTab();
  }

  // ===== CREATE TOURNAMENT =====
  async function doCreateTournament() {
    const name = document.getElementById("tName").value.trim();
    const desc = document.getElementById("tDesc").value.trim();
    const raw = document.getElementById("tData").value;
    const totalRounds = parseInt(document.getElementById("totalRounds")?.value) || 10;
    const groupCount = parseInt(document.getElementById("groupCount")?.value) || 4;
    const pairingMode = document.getElementById("pairingMode")?.value || 'swiss';
    const roundDuration = parseInt(document.getElementById("roundDuration")?.value) || 1;
    const restDays = parseInt(document.getElementById("restDays")?.value) || 1;

    if (!name) { toast("Введите название турнира"); return; }
    if (!raw.trim()) { toast("Введите список участников"); return; }

    const typeMap = {
      'персонаж': 'character', 'статья': 'article', 'арт': 'art',
      'оружие': 'weapon', 'локация': 'location', 'скин': 'skin',
      'босс': 'boss', 'другое': 'other'
    };

    const players = raw.split("\n").map(line => {
      line = line.trim();
      if (!line) return null;
      const parts = line.split("|").map(s => s.trim());
      const namePart = parts[0] || line;
      let playerType = 'character', playerName = namePart;
      const typeMatch = namePart.match(/^\[(.*?)\]\s*(.+)$/);
      if (typeMatch) { playerType = typeMap[typeMatch[1].toLowerCase()] || 'other'; playerName = typeMatch[2]; }
      return { name: playerName, image_url: parts[1] || "", type: playerType, description: parts[2] || "" };
    }).filter(Boolean);

    if (players.length < 2) { toast("Минимум 2 участника"); return; }
    if (groupCount > players.length / 2) { toast("Групп слишком много для такого количества участников"); return; }

    try {
      const { data: tournament, error } = await window.TH.createTournament({
        title: name, description: desc, status: 'draft',
        total_rounds: totalRounds,
        pairing_mode: pairingMode,
        group_count: groupCount,
        round_duration_days: roundDuration,
        rest_days_between_rounds: restDays
      });
      if (error) throw error;

      const playersWithTournament = players.map((p, i) => ({
        ...p, tournament_id: tournament.id, seed: i, elo: 1000
      }));
      const { error: playersError } = await window.TH.createPlayers(playersWithTournament);
      if (playersError) throw playersError;

      toast("✅ Турнир создан: " + name);
      document.getElementById("tName").value = "";
      document.getElementById("tDesc").value = "";
      document.getElementById("tData").value = "";
      document.getElementById("tCreateStatus").innerHTML = "<span style='color:var(--green);'>Создано!</span>";
      try { await window.TH.logAction('create_tournament', { title: name, id: tournament.id }); } catch (e) {}
      await refreshAll();
    } catch (e) {
      document.getElementById("tCreateStatus").innerHTML = "<span style='color:var(--red);'>" + escapeHTML(e.message) + "</span>";
    }
  }

  // ===== START TOURNAMENT =====
  async function doStartTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира. Создайте сначала."); return; }
    if (t.status !== "draft") { toast("Турнир уже запущен или завершён"); return; }

    try {
      const { data: players } = await window.TH.getPlayers(t.id);
      if (!players || players.length < 2) { toast("Недостаточно участников"); return; }

      const client = window.TH.getClient();
      const totalRounds = t.total_rounds || 10;
      const groupCount = t.group_count || Math.max(1, Math.floor(players.length / 4));
      const pairingMode = t.pairing_mode || 'swiss';

      // Generate initial rounds using engine
      const rounds = window.TournamentEngine.createInitialRounds(
        players,
        totalRounds,
        groupCount,
        pairingMode
      );

      // Insert rounds and matches
      for (const round of rounds) {
        const { data: roundData } = await client.from('rounds').insert({
          tournament_id: t.id,
          round_number: round.round_number,
          name: round.name,
          group_count: round.group_count,
          active_group_index: 0,
          is_active: round.round_number === 0,
          started_at: round.started_at,
          rest_day_after: round.rest_day_after || false
        }).select().single();

        const matches = round.matches.map(m => ({
          round_id: roundData.id,
          tournament_id: t.id,
          player1_id: m.player1_id,
          player2_id: m.player2_id,
          group_index: m.group_index,
          match_order: m.match_order,
          votes1: 0,
          votes2: 0,
          status: 'pending',
          finished: false
        }));
        if (matches.length) await client.from('matches').insert(matches);
      }

      await window.TH.updateTournament(t.id, { status: 'active', current_round: 0 });

      toast("🚀 Турнир запущен! " + totalRounds + " раундов, " + groupCount + " групп.");
      try { await window.TH.logAction('start_tournament', { id: t.id, title: t.title }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); console.error(e); }
  }

  // ===== ADVANCE ROUND =====
  async function doAdvanceRound(force) {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (t.status !== "active") { toast("Турнир не активен"); return; }
    if (force && !confirm("Принудительно завершить раунд?")) return;

    try {
      const client = window.TH.getClient();
      const { data: rounds } = await client.from('rounds')
        .select('*').eq('tournament_id', t.id).eq('is_active', true);

      const currentRound = rounds?.[0];
      if (!currentRound) { toast("Нет текущего раунда"); return; }

      const { data: matches } = await client.from('matches')
        .select('*').eq('round_id', currentRound.id);

      // Finish matches
      for (const match of (matches || [])) {
        if (!match.finished) {
          const winnerId = (match.votes1 || 0) >= (match.votes2 || 0) ? match.player1_id : match.player2_id;
          if (winnerId) {
            await client.from('matches').update({
              finished: true, winner_id: winnerId, status: 'done'
            }).eq('id', match.id);
          } else {
            await client.from('matches').update({
              finished: true, status: 'done'
            }).eq('id', match.id);
          }
        }
      }

      await client.from('rounds').update({
        is_active: false, ended_at: new Date().toISOString()
      }).eq('id', currentRound.id);

      // Check if all rounds done
      const totalRounds = t.total_rounds || 10;
      const nextRoundNum = (currentRound.round_number || 0) + 1;

      if (nextRoundNum >= totalRounds) {
        // Tournament finished
        const { data: allPlayers } = await client.from('players').select('*').eq('tournament_id', t.id);
        const { data: allMatches } = await client.from('matches').select('*').eq('tournament_id', t.id);
        const scores = window.TournamentEngine.calculateScores(allPlayers, allMatches);
        const winner = allPlayers?.sort((a, b) => (scores[b.id]?.points || 0) - (scores[a.id]?.points || 0))[0];
        await window.TH.updateTournament(t.id, {
          status: 'finished',
          completed_at: new Date().toISOString(),
          winner_id: winner?.id || null
        });
        toast("🏆 Турнир завершён! Победитель: " + (winner?.name || "?"));
      } else {
        // Activate next round
        const { data: nextRoundData } = await client.from('rounds')
          .select('*').eq('tournament_id', t.id).eq('round_number', nextRoundNum).single();

        if (nextRoundData) {
          await client.from('rounds').update({
            is_active: true,
            started_at: new Date().toISOString()
          }).eq('id', nextRoundData.id);

          await window.TH.updateTournament(t.id, { current_round: nextRoundNum });
          toast("⏭ Раунд " + (nextRoundNum + 1) + " начался!");
        } else {
          toast("⚠️ Следующий раунд не найден");
        }
      }

      try { await window.TH.logAction('advance_round', { tournament_id: t.id, round: currentRound.round_number }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); console.error(e); }
  }

  // ===== OTHER ADMIN FUNCTIONS =====
  async function doResetVotes() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm("Сбросить ВСЕ голоса в турнире?")) return;
    try {
      const client = window.TH.getClient();
      await client.from('votes').delete().eq('tournament_id', t.id);
      await client.from('matches').update({ votes1: 0, votes2: 0 }).eq('tournament_id', t.id);
      toast("🔄 Голоса сброшены");
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function doArchiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    await window.TH.updateTournament(t.id, { status: 'archived', archived_at: new Date().toISOString() });
    toast("📦 Турнир архивирован");
    await refreshAll();
  }

  async function doDeleteActiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm('Точно удалить турнир "' + t.title + '"?')) return;
    await window.TH.deleteTournament(t.id);
    toast("🗑 Турнир удалён");
    await refreshAll();
  }

  // ===== PARTICIPANT EDITOR =====
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
      </div>`).join("");
  }

  function updateParticipant(index, field, value) {
    if (editingParticipants[index]) editingParticipants[index][field] = value.trim();
  }
  function removeParticipant(index) { editingParticipants.splice(index, 1); refreshParticipantRows(); }
  function addParticipantRow() {
    editingParticipants.push({ id: Date.now().toString(), name: "", image_url: "", type: "character", description: "" });
    refreshParticipantRows();
  }

  async function saveParticipants() {
    const t = await getActiveTournament();
    if (!t || t.status !== "draft") { toast("Нельзя редактировать запущенный турнир"); return; }
    const valid = editingParticipants.filter(p => p.name.trim());
    if (valid.length < 2) { toast("Минимум 2 участника с именем"); return; }
    try {
      await window.TH.getClient().from('players').delete().eq('tournament_id', t.id);
      const toInsert = valid.map((p, i) => ({
        tournament_id: t.id,
        name: p.name,
        image_url: p.image_url || p.image || '',
        type: p.type || 'character',
        description: p.description || '',
        seed: i,
        elo: 1000
      }));
      await window.TH.createPlayers(toInsert);
      document.getElementById("participantSaveStatus").innerHTML = "<span style='color:var(--green);'>✅ Сохранено (" + valid.length + " участников)</span>";
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  // ===== FORCE WIN =====
  async function renderForceWin() {
    const t = await getActiveTournament();
    const container = document.getElementById("forceWinList");
    if (!t || t.status !== "active") {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет активного раунда</p>`;
      return;
    }

    const client = window.TH.getClient();
    const { data: rounds } = await client.from('rounds').select('*').eq('tournament_id', t.id).eq('is_active', true);
    const round = rounds?.[0];
    if (!round) { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет текущего раунда</p>`; return; }

    const { data: matches } = await client.from('matches')
      .select('*, player1:player1_id(*), player2:player2_id(*)')
      .eq('round_id', round.id).eq('finished', false);

    if (!matches || !matches.length) {
      container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Все матчи завершены</p>`;
      return;
    }

    container.innerHTML = matches.map(m => `
      <div class="match-admin" style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px;">
        <span style="flex:1;">${escapeHTML(m.player1?.name || "?")} <span style="color:var(--accent);">${m.votes1 || 0}:${m.votes2 || 0}</span> ${escapeHTML(m.player2?.name || "?")}</span>
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player1_id}', 1)">P1 Win</button>
        <button class="btn-warn" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player2_id}', 2)">P2 Win</button>
      </div>`).join("");
  }

  async function forceWin(matchId, playerId) {
    try {
      await window.TH.updateMatch(matchId, { winner_id: playerId, finished: true, status: 'done' });
      toast("🏁 Победитель назначен вручную");
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  // ===== RENDER MANAGE TAB =====
  async function renderManageTab() {
    await renderForceWin();
  }

  // ===== USERS =====
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
          <td><span style="color:${u.role === 'admin' ? 'var(--accent)' : 'var(--text-2)'};font-weight:${u.role === 'admin' ? '700' : '400'};">${u.role || 'user'}</span></td>
          <td>${u.votes_count || 0}</td>
          <td>${u.fandom_name ? escapeHTML(u.fandom_name) : '—'}</td>
          <td><button class="btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="Admin.toggleAdmin('${u.id}')">${u.role === 'admin' ? 'Снять админку' : 'Сделать админом'}</button></td>
        </tr>`).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);">Ошибка загрузки</td></tr>`; }
  }

  async function toggleAdmin(userId) {
    try {
      const { data: user } = await window.TH.getClient().from('profiles').select('role').eq('id', userId).single();
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      await window.TH.setUserRole(userId, newRole);
      toast(newRole === 'admin' ? "👑 Админка выдана" : "👤 Админка снята");
      await renderUsers();
    } catch (e) { toast("❌ " + e.message); }
  }

  // ===== MODERATION =====
  async function renderModeration() {
    try {
      const client = window.TH.getClient();
      const { data: comments } = await client.from('comments').select('*').order('created_at', { ascending: false }).limit(50);
      const cList = document.getElementById("modCommentsList");
      if (!comments || !comments.length) cList.innerHTML = `<p style="color:var(--text-3);">Нет комментариев</p>`;
      else cList.innerHTML = comments.map(c => `
        <div style="padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><strong style="font-size:13px;">${escapeHTML(c.username || c.author_name)}</strong><span style="font-size:11px;color:var(--text-3);">${new Date(c.created_at).toLocaleString("ru-RU")}</span></div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">${escapeHTML(c.text)}</div>
          <button class="btn-danger" style="padding:4px 10px;font-size:11px;" onclick="Admin.deleteComment('${c.id}')">🗑 Удалить</button>
        </div>`).join("");

      const { data: chat } = await window.TH.getChatMessages(10);
      const chatPreview = document.getElementById("modChatPreview");
      if (!chat || !chat.length) chatPreview.innerHTML = `<p style="color:var(--text-3);">Нет сообщений</p>`;
      else chatPreview.innerHTML = chat.slice(-10).map(m => `
        <div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;"><strong style="color:var(--accent);">${escapeHTML(m.author_name || m.username)}</strong>: ${escapeHTML(m.text)}</div>`).join("");
    } catch (e) { console.warn('Moderation render error', e); }
  }

  async function deleteComment(id) {
    try { await window.TH.deleteComment(id); toast("🗑 Комментарий удалён"); await renderModeration(); }
    catch (e) { toast("❌ " + e.message); }
  }

  async function doClearChat() {
    if (!confirm("Очистить ВЕСЬ чат?")) return;
    try {
      await window.TH.getClient().from('chat_messages').delete().neq('id', '0');
      toast("💬 Чат очищен");
      await renderModeration();
    } catch (e) { toast("❌ " + e.message); }
  }

  // ===== SETTINGS =====
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
    } catch (e) { console.warn('Settings load error', e); }
  }

  async function saveSiteSettings() {
    try {
      await window.TH.updateSiteSettings({
        site_name: document.getElementById("settingSiteName").value.trim(),
        description: document.getElementById("settingDesc").value.trim(),
        site_logo: document.getElementById("settingLogo").value.trim(),
        theme: document.getElementById("settingTheme").value
      });
      document.getElementById("settingsStatus").innerHTML = "<span style='color:var(--green);'>✅ Настройки сохранены</span>";
      const logoEl = document.getElementById("siteLogoLink");
      if (logoEl) {
        const { data } = await window.TH.getSiteSettings();
        logoEl.textContent = (data?.site_logo || "🏆") + " " + (data?.site_name || "Tournament Hub");
      }
    } catch (e) { toast("❌ " + e.message); }
  }

  async function renderFandomAdmins() {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = settings?.fandom_admins || [];
      const container = document.getElementById("fandomAdminsList");
      if (!admins.length) { container.innerHTML = `<span style="color:var(--text-3);font-size:13px;">Нет админов Fandom</span>`; return; }
      container.innerHTML = admins.map(a => `
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg);border-radius:8px;font-size:13px;">${escapeHTML(a)} <button onclick="Admin.removeFandomAdmin('${escapeHTML(a)}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;line-height:1;">×</button></span>`).join("");
    } catch (e) { console.warn('Fandom admins render error', e); }
  }

  async function addFandomAdmin() {
    const name = document.getElementById("newFandomAdmin").value.trim();
    if (!name) return;
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = settings?.fandom_admins || [];
      if (!admins.includes(name)) { admins.push(name); await window.TH.updateSiteSettings({ fandom_admins: admins }); }
      document.getElementById("newFandomAdmin").value = "";
      await renderFandomAdmins();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function removeFandomAdmin(name) {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = (settings?.fandom_admins || []).filter(a => a !== name);
      await window.TH.updateSiteSettings({ fandom_admins: admins });
      await renderFandomAdmins();
    } catch (e) { toast("❌ " + e.message); }
  }

  // ===== EXPORT / IMPORT =====
  async function doExport() {
    try {
      const { data: tournaments } = await window.TH.getTournaments();
      const { data: users } = await window.TH.getAllUsers();
      const { data: settings } = await window.TH.getSiteSettings();
      const backup = { version: 3, exportedAt: new Date().toISOString(), data: { tournaments, users, settings } };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "tournament-hub-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click(); URL.revokeObjectURL(url);
      toast("📥 Экспортировано");
    } catch (e) { toast("❌ " + e.message); }
  }

  async function doImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup || !backup.data) { toast("❌ Неверный формат бэкапа"); return; }
        if (backup.data.settings) await window.TH.updateSiteSettings(backup.data.settings);
        toast("📤 Импорт завершён");
        await refreshAll();
      } catch (err) { toast("❌ Ошибка импорта: " + err.message); }
    };
    reader.readAsText(file);
  }

  function doResetAll() {
    if (!confirm("ВЫ УВЕРЕНЫ? Это удалит ВСЕ локальные данные!")) return;
    if (prompt('Введите "DELETE" для подтверждения:') !== "DELETE") return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('th_') || key === 'tournament_hub_db')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    toast("💥 Данные удалены. Перезагрузка...");
    setTimeout(() => location.reload(), 1500);
  }

  // ===== REFRESH =====
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
    if (!t) { el.innerHTML = "Нет активного турнира. Создайте новый выше."; return; }
    const { data: players } = await window.TH.getPlayers(t.id);
    const client = window.TH.getClient();
    const { data: rounds } = await client.from('rounds').select('*').eq('tournament_id', t.id);
    const totalRounds = t.total_rounds || 10;
    el.innerHTML = `<b>${escapeHTML(t.title)}</b> (${t.status}) — ${(players || []).length} участников, ${(rounds || []).length}/${totalRounds} раундов, групп: ${t.group_count || '?'}`;
  }

  async function refreshTournamentList() {
    try {
      const { data: tournaments } = await window.TH.getTournaments();
      const el = document.getElementById("tournamentList");
      if (!tournaments || !tournaments.length) { el.innerHTML = "Нет турниров"; return; }
      el.innerHTML = tournaments.map(t => `
        <div style="margin-bottom:8px;padding:10px;background:var(--bg);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div><b>${escapeHTML(t.title)}</b> <span style="color:var(--text-3);font-size:12px;">${t.status}</span></div>
          <div style="display:flex;gap:6px;">
            <a href="bracket.html?id=${encodeURIComponent(t.id)}" target="_blank" class="btn-secondary" style="padding:6px 12px;font-size:12px;">Сетка</a>
            <button class="btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="Admin.setActive('${t.id}')">Активировать</button>
          </div>
        </div>`).join("");
    } catch (e) { console.warn('Tournament list error', e); }
  }

  async function setActive(id) {
    localStorage.setItem('th_active_tournament', id);
    try { await window.TH.updateSiteSettings({ active_tournament_id: id }); } catch (e) {}
    toast("✅ Турнир активирован");
    await refreshAll();
  }

  async function renderLog() {
    const el = document.getElementById("adminLog");
    if (!el) return;
    try {
      const { data: logs } = await window.TH.getAdminLogs(100);
      if (!logs || !logs.length) { el.innerHTML = `<div style="padding:4px 0;"><span style="color:var(--text-3);">[--:--:--]</span> Лог пуст</div>`; return; }
      el.innerHTML = logs.map(l => {
        const time = new Date(l.created_at).toLocaleTimeString("ru-RU");
        let details = '';
        try { details = typeof l.details === 'string' ? l.details : JSON.stringify(l.details); if (details.length > 200) details = details.substring(0, 200) + '...'; } catch(e) { details = ''; }
        return `<div style="padding:4px 0;"><span style="color:var(--text-3);">[${time}]</span> ${escapeHTML(l.action)}${details ? ': ' + escapeHTML(details) : ''}</div>`;
      }).join("");
    } catch (e) { el.innerHTML = `<div style="padding:4px 0;"><span style="color:var(--text-3);">[--:--:--]</span> Ошибка загрузки лога</div>`; }
  }

  function clearLog() {
    const el = document.getElementById("adminLog");
    if (el) el.innerHTML = `<div style="padding:4px 0;"><span style="color:var(--text-3);">[--:--:--]</span> Лог очищен</div>`;
  }

  // ===== NEWS MANAGEMENT =====
  async function renderNewsAdmin() {
    try {
      const { data: news } = await window.TH.getNews(50);
      const container = document.getElementById("newsList");
      if (!container) return;
      if (!news || !news.length) { container.innerHTML = '<p style="color:var(--text-3);">Нет новостей</p>'; return; }
      container.innerHTML = news.map(n => `
        <div style="padding:12px;background:var(--bg);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <div><strong>${escapeHTML(n.title)}</strong> <span style="color:var(--text-3);font-size:12px;">${new Date(n.published_at).toLocaleDateString('ru-RU')}</span></div>
          <button class="btn-danger" style="padding:4px 10px;font-size:11px;" onclick="Admin.deleteNews('${n.id}')">🗑</button>
        </div>`).join('');
    } catch (e) { console.warn('News render error', e); }
  }

  async function createNews() {
    const title = document.getElementById("newsTitle").value.trim();
    const content = document.getElementById("newsContent").value.trim();
    const image = document.getElementById("newsImage").value.trim();
    if (!title || !content) { toast("Заполните заголовок и содержание"); return; }
    try {
      await window.TH.createNewsItem({ title, content, image_url: image || null, published_at: new Date().toISOString() });
      toast("✅ Новость создана");
      document.getElementById("newsTitle").value = "";
      document.getElementById("newsContent").value = "";
      document.getElementById("newsImage").value = "";
      await renderNewsAdmin();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function deleteNews(id) {
    if (!confirm("Удалить новость?")) return;
    try { await window.TH.deleteNewsItem(id); toast("🗑 Новость удалена"); await renderNewsAdmin(); }
    catch (e) { toast("❌ " + e.message); }
  }

  // ===== INIT =====
  document.addEventListener("DOMContentLoaded", function() {
    checkAuth();
    // Expose news functions
    window.Admin = window.Admin || {};
    window.Admin.createNews = createNews;
    window.Admin.deleteNews = deleteNews;
    window.Admin.renderNewsAdmin = renderNewsAdmin;
  });

  // ===== EXPOSE =====
  window.Admin = {
    doLogin, switchTab,
    doCreateTournament, doStartTournament, doAdvanceRound,
    doResetVotes, doArchiveTournament, doDeleteActiveTournament,
    updateParticipant, removeParticipant, addParticipantRow, saveParticipants,
    forceWin, toggleAdmin, deleteComment, doClearChat,
    saveSiteSettings, addFandomAdmin, removeFandomAdmin,
    doExport, doImport, doResetAll, setActive, clearLog,
    renderNewsAdmin, createNews, deleteNews,
    renderParticipantEditor, renderForceWin, renderUsers, renderModeration, loadSettings
  };
})();
