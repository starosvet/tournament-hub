/* ============================================================
   Tournament Hub Admin Panel (FIXED v9 — TRUE Shikimori Swiss)
   ============================================================ */
(function () {
  'use strict';
  const MAX_LOG = 100;

  function escapeHTML(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function getActiveTournament() {
    const { data } = await window.TH.getTournaments();
    return data?.find(t => t.status === 'active') || data?.[0] || null;
  }

  async function doLogin() {
    const pass = document.getElementById("adminPass").value;
    if (!pass) { document.getElementById("authStatus").innerHTML = "<span style='color:var(--red);'>Введите пароль</span>"; return; }
    let isSupabaseAdmin = false;
    try { isSupabaseAdmin = await window.TH.isAdmin(); } catch (e) { console.warn('Admin check failed', e); }
    if (isSupabaseAdmin || pass === "admin123") {
      localStorage.setItem("th_admin", "yes");
      document.getElementById("authStatus").innerHTML = "<span style='color:var(--green);'>✔ Вход выполнен</span>";
      document.getElementById("authPanel").classList.add("hidden");
      document.getElementById("adminControls").classList.remove("hidden");
      await refreshAll();
      try { await window.TH.logAction('admin_login', { method: isSupabaseAdmin ? 'supabase' : 'password' }); } catch (e) {}
    } else {
      document.getElementById("authStatus").innerHTML = "<span style='color:var(--red);'>❌ Неверный пароль</span>";
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
  }

  // ===== SHIKIMORI SWISS: Generate pairs by score + Buchholz =====
  function generateSwissPairs(players, previousMatches) {
    // Sort by: points DESC, buchholz DESC, wins DESC
    const sorted = [...players].sort((a, b) => {
      const ptsA = a.score?.points || 0;
      const ptsB = b.score?.points || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      const buchA = a.score?.buchholz || 0;
      const buchB = b.score?.buchholz || 0;
      if (buchB !== buchA) return buchB - buchA;
      return (b.score?.wins || 0) - (a.score?.wins || 0);
    });

    // Track played pairs
    const playedWith = {};
    (previousMatches || []).forEach(m => {
      if (m.player1_id && m.player2_id) {
        playedWith[m.player1_id] = playedWith[m.player1_id] || new Set();
        playedWith[m.player2_id] = playedWith[m.player2_id] || new Set();
        playedWith[m.player1_id].add(m.player2_id);
        playedWith[m.player2_id].add(m.player1_id);
      }
    });

    const pairs = [];
    const used = new Set();

    for (const p1 of sorted) {
      if (used.has(p1.id)) continue;
      let bestOpponent = null;
      let bestScore = -Infinity;

      for (const p2 of sorted) {
        if (p1.id === p2.id || used.has(p2.id)) continue;
        const alreadyPlayed = playedWith[p1.id]?.has(p2.id);
        const ptsDiff = Math.abs((p1.score?.points || 0) - (p2.score?.points || 0));
        const buchDiff = Math.abs((p1.score?.buchholz || 0) - (p2.score?.buchholz || 0));

        // Priority: same points > close buchholz > never played
        let score = 10000 - ptsDiff * 1000 - buchDiff * 10;
        if (alreadyPlayed) score -= 50000; // Heavy penalty for rematch

        if (score > bestScore) { bestScore = score; bestOpponent = p2; }
      }

      if (bestOpponent) {
        pairs.push([p1, bestOpponent]);
        used.add(p1.id);
        used.add(bestOpponent.id);
      } else {
        // BYE: free win
        pairs.push([p1, null]);
        used.add(p1.id);
      }
    }

    return pairs;
  }

  async function doCreateTournament() {
    const name = document.getElementById("tName").value.trim();
    const desc = document.getElementById("tDesc").value.trim();
    const raw = document.getElementById("tData").value;
    const totalRounds = parseInt(document.getElementById("totalRounds")?.value) || 10;

    if (!name) { toast("Введите название турнира"); return; }
    if (!raw.trim()) { toast("Введите список участников"); return; }

    const typeMap = {
      'персонаж': 'character', 'персонажи': 'character', 'char': 'character',
      'статья': 'article', 'статьи': 'article', 'article': 'article',
      'арт': 'art', 'арты': 'art', 'art': 'art', 'изображение': 'art', 'image': 'art',
      'оружие': 'weapon', 'weapon': 'weapon', 'оружия': 'weapon',
      'локация': 'location', 'локации': 'location', 'location': 'location',
      'скин': 'skin', 'скины': 'skin', 'skin': 'skin',
      'машина': 'vehicle', 'машины': 'vehicle', 'vehicle': 'vehicle',
      'босс': 'boss', 'боссы': 'boss', 'boss': 'boss',
      'другое': 'other', 'other': 'other'
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

    try {
      const { data: tournament, error } = await window.TH.createTournament({ 
        title: name, description: desc, status: 'draft', total_rounds: totalRounds 
      });
      if (error) {
        if (error.message?.includes('total_rounds')) {
          throw new Error("В БД отсутствует колонка 'total_rounds'. Выполните SQL-скрипт!");
        }
        throw error;
      }

      const playersWithTournament = players.map((p, i) => ({ 
        ...p, tournament_id: tournament.id, seed: i, elo: 1000,
        score_wins: 0, score_losses: 0, score_points: 0, score_buchholz: 0
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
      const msg = e.message || String(e);
      document.getElementById("tCreateStatus").innerHTML = "<span style='color:var(--red);'>" + escapeHTML(msg) + "</span>";
      if (msg.includes('column') || msg.includes('schema')) {
        document.getElementById("tCreateStatus").innerHTML += "<br><span style='color:var(--accent);font-size:12px;'>⚠️ Нужно выполнить SQL-скрипт в Supabase!</span>";
      }
    }
  }

  async function doStartTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира. Создайте сначала."); return; }
    if (t.status !== "draft") { toast("Турнир уже запущен или завершён"); return; }

    try {
      const { data: players } = await window.TH.getPlayers(t.id);
      if (!players || players.length < 2) { toast("Недостаточно участников"); return; }

      const client = window.TH.getClient();
      const totalRounds = t.total_rounds || 10;

      const { data: roundData } = await client.from('rounds').insert({
        tournament_id: t.id, round_number: 0, name: "Раунд 1", 
        is_active: true, started_at: new Date().toISOString()
      }).select().single();

      // Round 1: RANDOM pairs (Shikimori style)
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const matches = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        matches.push({
          round_id: roundData.id, tournament_id: t.id,
          player1_id: shuffled[i]?.id || null,
          player2_id: shuffled[i + 1]?.id || null,
          match_order: Math.floor(i / 2),
          status: 'pending', votes1: 0, votes2: 0
        });
      }

      if (matches.length) await client.from('matches').insert(matches);
      await window.TH.updateTournament(t.id, { status: 'active', current_round: 0 });

      toast("🚀 Турнир запущен! Раунд 1 создан (случайные пары)");
      try { await window.TH.logAction('start_tournament', { id: t.id, title: t.title }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); console.error(e); }
  }

  async function doAdvanceRound(force) {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (t.status !== "active") { toast("Турнир не активен"); return; }
    if (force && !confirm("Принудительно завершить раунд?")) return;

    try {
      const client = window.TH.getClient();

      // Get current round
      const { data: rounds } = await client.from('rounds')
        .select('*').eq('tournament_id', t.id).eq('is_active', true);
      const currentRound = rounds?.[0];
      if (!currentRound) { toast("Нет текущего раунда"); return; }

      // Get all matches of this round
      const { data: matches } = await client.from('matches')
        .select('*').eq('round_id', currentRound.id);

      // Finish unfinished matches based on votes (Shikimori: 1/0/0.5)
      for (const match of (matches || [])) {
        if (!match.finished) {
          const v1 = match.votes1 || 0;
          const v2 = match.votes2 || 0;
          let winnerId = null;

          if (v1 > v2) winnerId = match.player1_id;
          else if (v2 > v1) winnerId = match.player2_id;
          // If draw (v1 === v2), no winner — both get 0.5 later in standings calc

          await client.from('matches').update({ 
            finished: true, 
            winner_id: winnerId, 
            status: 'done' 
          }).eq('id', match.id);
        }
      }

      // Close current round
      await client.from('rounds').update({ 
        is_active: false, ended_at: new Date().toISOString() 
      }).eq('id', currentRound.id);

      const totalRounds = t.total_rounds || 10;
      const nextRoundNum = (currentRound.round_number || 0) + 1;

      if (nextRoundNum >= totalRounds) {
        // TOURNAMENT FINISHED — calculate final standings with Buchholz
        const { data: allPlayers } = await client.from('players').select('*').eq('tournament_id', t.id);
        const { data: allMatches } = await client.from('matches').select('*').eq('tournament_id', t.id);

        // Use TH.calculateStandings for consistency
        const playerScores = window.TH.calculateStandings(allPlayers || [], allMatches || []);

        // Save final scores to DB
        for (const p of (allPlayers || [])) {
          const s = playerScores[p.id] || { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 };
          await client.from('players').update({
            score_wins: s.wins,
            score_losses: s.losses,
            score_points: s.points,
            score_buchholz: s.buchholz
          }).eq('id', p.id);
        }

        // Sort to find winner
        const sortedPlayers = [...(allPlayers || [])].sort((a, b) => {
          const sa = playerScores[a.id] || {};
          const sb = playerScores[b.id] || {};
          if ((sb.points || 0) !== (sa.points || 0)) return (sb.points || 0) - (sa.points || 0);
          if ((sb.buchholz || 0) !== (sa.buchholz || 0)) return (sb.buchholz || 0) - (sa.buchholz || 0);
          return (sb.wins || 0) - (sa.wins || 0);
        });

        const winner = sortedPlayers[0];

        await window.TH.updateTournament(t.id, { 
          status: 'finished', completed_at: new Date().toISOString(),
          winner_id: winner?.id || null
        });
        toast("🏆 Турнир завершён! Победитель: " + (winner?.name || "?"));
      } else {
        // NEXT ROUND — Swiss pairing
        const { data: allPlayers } = await client.from('players').select('*').eq('tournament_id', t.id);
        const { data: allMatches } = await client.from('matches').select('*').eq('tournament_id', t.id);

        // Calculate current standings
        const playerScores = window.TH.calculateStandings(allPlayers || [], allMatches || []);

        // Save current scores
        for (const p of (allPlayers || [])) {
          const s = playerScores[p.id] || { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 };
          await client.from('players').update({
            score_wins: s.wins,
            score_losses: s.losses,
            score_points: s.points,
            score_buchholz: s.buchholz
          }).eq('id', p.id);
        }

        // Prepare players with scores for pairing
        const playersWithScores = (allPlayers || []).map(p => ({
          ...p, score: playerScores[p.id] || { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 }
        }));

        // Generate Swiss pairs (no rematches!)
        const pairs = generateSwissPairs(playersWithScores, allMatches || []);

        // Create new round
        const { data: newRound } = await client.from('rounds').insert({
          tournament_id: t.id, round_number: nextRoundNum,
          name: "Раунд " + (nextRoundNum + 1), is_active: true,
          started_at: new Date().toISOString()
        }).select().single();

        // Create matches from pairs
        const newMatches = pairs.map((pair, idx) => ({
          round_id: newRound.id, tournament_id: t.id,
          player1_id: pair[0]?.id || null,
          player2_id: pair[1]?.id || null,
          match_order: idx, status: 'pending', votes1: 0, votes2: 0
        }));

        if (newMatches.length) await client.from('matches').insert(newMatches);
        await window.TH.updateTournament(t.id, { current_round: nextRoundNum });
        toast("⏭ Раунд " + (nextRoundNum + 1) + " начался! Пары по швейцарской системе");
      }

      try { await window.TH.logAction('advance_round', { tournament_id: t.id, round: currentRound.round_number }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); console.error(e); }
  }

  async function doResetVotes() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm("Сбросить ВСЕ голоса в турнире?")) return;
    try {
      const client = window.TH.getClient();
      await client.from('votes').delete().eq('tournament_id', t.id);
      await client.from('matches').update({ votes1: 0, votes2: 0, finished: false, winner_id: null, status: 'pending' }).eq('tournament_id', t.id);
      toast("🔄 Голоса сброшены");
      try { await window.TH.logAction('reset_votes', { tournament_id: t.id }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function doArchiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    await window.TH.updateTournament(t.id, { status: 'archived', archived_at: new Date().toISOString() });
    toast("📦 Турнир архивирован");
    try { await window.TH.logAction('archive_tournament', { id: t.id }); } catch (e) {}
    await refreshAll();
  }

  async function doDeleteActiveTournament() {
    const t = await getActiveTournament();
    if (!t) { toast("Нет активного турнира"); return; }
    if (!confirm('Точно удалить турнир "' + t.title + '"?')) return;
    await window.TH.deleteTournament(t.id);
    toast("🗑 Турнир удалён");
    try { await window.TH.logAction('delete_tournament', { id: t.id, title: t.title }); } catch (e) {}
    await refreshAll();
  }

  let editingParticipants = [];
  async function renderParticipantEditor() {
    const t = await getActiveTournament();
    const container = document.getElementById("participantEditor");
    if (!t || t.status !== "draft") { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Редактор доступен только для черновиков.</p>`; return; }
    const { data: players } = await window.TH.getPlayers(t.id);
    editingParticipants = (players || []).map(p => ({ ...p }));
    refreshParticipantRows();
  }

  function refreshParticipantRows() {
    const container = document.getElementById("participantEditor");
    if (!editingParticipants.length) { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет участников</p>`; return; }
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
        tournament_id: t.id, name: p.name, image_url: p.image_url || p.image || '', 
        type: p.type || 'character', description: p.description || '', seed: i, elo: 1000,
        score_wins: 0, score_losses: 0, score_points: 0, score_buchholz: 0
      }));
      await window.TH.createPlayers(toInsert);
      document.getElementById("participantSaveStatus").innerHTML = "<span style='color:var(--green);'>✅ Сохранено (" + valid.length + " участников)</span>";
      try { await window.TH.logAction('update_players', { tournament_id: t.id, count: valid.length }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function renderForceWin() {
    const t = await getActiveTournament();
    const container = document.getElementById("forceWinList");
    if (!t || t.status !== "active") { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет активного раунда</p>`; return; }

    const client = window.TH.getClient();
    const { data: rounds } = await client.from('rounds').select('*').eq('tournament_id', t.id).eq('is_active', true);
    const round = rounds?.[0];
    if (!round) { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Нет текущего раунда</p>`; return; }

    const { data: matches } = await client.from('matches')
      .select('*, player1:player1_id(*), player2:player2_id(*)')
      .eq('round_id', round.id).eq('finished', false);

    if (!matches || !matches.length) { container.innerHTML = `<p style="color:var(--text-3);font-size:13px;">Все матчи завершены</p>`; return; }

    container.innerHTML = matches.map(m => `
      <div class="match-admin" style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg);border-radius:10px;margin-bottom:8px;">
        <span style="flex:1;">${escapeHTML(m.player1?.name || "?")} <span style="color:var(--accent);">${m.votes1 || 0}:${m.votes2 || 0}</span> ${escapeHTML(m.player2?.name || "?")}</span>
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player1_id}', 1)">P1 Win</button>
        <button class="btn-warn" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceWin('${m.id}', '${m.player2_id}', 2)">P2 Win</button>
        <button class="btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="Admin.forceDraw('${m.id}')">Ничья</button>
      </div>`).join("");
  }

  async function forceWin(matchId, playerId, playerNum) {
    try {
      await window.TH.updateMatch(matchId, { winner_id: playerId, finished: true, status: 'done' });
      toast("🏁 Победитель назначен вручную");
      try { await window.TH.logAction('force_win', { match_id: matchId, player_num: playerNum }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function forceDraw(matchId) {
    try {
      await window.TH.updateMatch(matchId, { finished: true, status: 'done', winner_id: null });
      toast("⚖️ Ничья назначена (оба получат 0.5 очка)");
      try { await window.TH.logAction('force_draw', { match_id: matchId }); } catch (e) {}
      await refreshAll();
    } catch (e) { toast("❌ " + e.message); }
  }

  async function renderUsers() {
    const tbody = document.querySelector("#usersTable tbody");
    if (!tbody) return;
    try {
      const { data: users } = await window.TH.getAllUsers();
      if (!users || !users.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);">Нет пользователей</td></tr>`; return; }
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${escapeHTML(u.username)}</td>
          <td>${escapeHTML(u.display_name || u.username)}</td>
          <td>${u.authType || 'supabase'}</td>
          <td><span style="color:${u.role === "admin" ? "var(--accent)" : "var(--text-2)"};font-weight:${u.role === "admin" ? "700" : "400"};">${u.role || "user"}</span></td>
          <td>${u.votes_count || 0}</td>
          <td>${u.fandom_name ? escapeHTML(u.fandom_name) : "—"}</td>
          <td><button class="btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="Admin.toggleAdmin('${u.id}')">${u.role === "admin" ? "Снять админку" : "Сделать админом"}</button></td>
        </tr>`).join("");
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);">Ошибка загрузки</td></tr>`; }
  }

  async function toggleAdmin(userId) {
    try {
      const { data: user } = await window.TH.getClient().from('profiles').select('role').eq('id', userId).single();
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      await window.TH.setUserRole(userId, newRole);
      toast(newRole === 'admin' ? "👑 Админка выдана" : "👤 Админка снята");
      try { await window.TH.logAction('change_role', { user_id: userId, new_role: newRole }); } catch (e) {}
      await renderUsers();
    } catch (e) { toast("❌ " + e.message); }
  }

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
      try { await window.TH.logAction('clear_chat'); } catch (e) {} 
      await renderModeration(); 
    } catch (e) { toast("❌ " + e.message); }
  }

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
      try { await window.TH.logAction('update_settings'); } catch (e) {}
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
      try { await window.TH.logAction('add_fandom_admin', { name }); } catch (e) {}
    } catch (e) { toast("❌ " + e.message); }
  }

  async function removeFandomAdmin(name) {
    try {
      const { data: settings } = await window.TH.getSiteSettings();
      const admins = (settings?.fandom_admins || []).filter(a => a !== name);
      await window.TH.updateSiteSettings({ fandom_admins: admins });
      await renderFandomAdmins();
      try { await window.TH.logAction('remove_fandom_admin', { name }); } catch (e) {}
    } catch (e) { toast("❌ " + e.message); }
  }

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
      try { await window.TH.logAction('export_data'); } catch (e) {}
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
        try { await window.TH.logAction('import_data'); } catch (e) {}
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
    el.innerHTML = `<b>${escapeHTML(t.title)}</b> (${t.status}) — ${(players || []).length} участников, ${(rounds || []).length}/${totalRounds} раундов, текущий: ${(t.current_round || 0) + 1}`;
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
    if (window.DB) window.DB.updateDB(db => { db.activeTournamentId = id; });
    try { await window.TH.updateSiteSettings({ active_tournament_id: id }); } catch (e) {}
    toast("✅ Турнир активирован");
    await refreshAll();
  }

  async function renderLog() {
    const el = document.getElementById("adminLog");
    if (!el) return;
    try {
      const { data: logs } = await window.TH.getAdminLogs(MAX_LOG);
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

  document.addEventListener("DOMContentLoaded", function() { checkAuth(); });

  window.Admin = {
    doLogin, switchTab, doCreateTournament, doStartTournament, doAdvanceRound,
    doResetVotes, doArchiveTournament, doDeleteActiveTournament,
    updateParticipant, removeParticipant, addParticipantRow, saveParticipants,
    forceWin, forceDraw, toggleAdmin, deleteComment, doClearChat, saveSiteSettings,
    addFandomAdmin, removeFandomAdmin, doExport, doImport, doResetAll, setActive, clearLog
  };
})();
