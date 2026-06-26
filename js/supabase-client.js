/* ============================================================
   Tournament Hub — Supabase Client (FIXED v17 — Optimized)
   ============================================================ */
(function () {
  'use strict';
  let realtimeChannels = [];
  let initDone = false;
  let supabaseInstance = null;

  // ========== CACHE ==========
  const Cache = {
    _data: new Map(),
    _ttl: 30000, // 30 секунд для турниров
    _ttlLong: 300000, // 5 минут для списка

    get(key) {
      const item = this._data.get(key);
      if (!item) return null;
      if (Date.now() - item.ts > item.ttl) {
        this._data.delete(key);
        return null;
      }
      return item.value;
    },

    set(key, value, ttl) {
      this._data.set(key, { value, ts: Date.now(), ttl: ttl || this._ttl });
    },

    invalidate(key) {
      if (key) this._data.delete(key);
      else this._data.clear();
    },

    invalidateTournament(id) {
      this._data.delete('tournament:' + id);
      this._data.delete('tournaments:list');
    }
  };

  function init() {
    if (initDone) return true;
    if (window._supabase) { supabaseInstance = window._supabase; initDone = true; window.TH = window.TH || {}; window.TH.isReady = true; return true; }
    if (typeof window.supabase === 'undefined') { console.error('❌ Supabase SDK not found'); return false; }
    const cfg = window._supabaseConfig || {};
    const url = cfg.url || 'https://fpabooteqfahhzobcpnh.supabase.co';
    const key = cfg.key || '';
    if (!key) { console.error('❌ Supabase key missing'); return false; }
    supabaseInstance = window.supabase.createClient(url, key, cfg.options || {});
    window._supabase = supabaseInstance;
    initDone = true;
    if (!window.TH) window.TH = {};
    window.TH.isReady = true;
    console.log('✅ Supabase client initialized (v17)');
    return true;
  }

  function getClient() { if (!initDone) init(); return supabaseInstance; }

  // ========== AUTH ==========
  async function signUp(email, password, metadata) {
    const client = getClient();
    return await client.auth.signUp({ email, password, options: { data: metadata || {} } });
  }

  async function signIn(email, password) {
    const client = getClient();
    return await client.auth.signInWithPassword({ email, password });
  }

  async function signInWithProvider(provider) {
    const client = getClient();
    const redirectUrl = window.location.origin + '/login.html';
    return await client.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl } });
  }

  async function signOut() {
    const client = getClient();
    unsubscribeAll();
    Cache.invalidate();
    return await client.auth.signOut();
  }

  async function getSession() {
    const client = getClient();
    const { data } = await client.auth.getSession();
    return data?.session || null;
  }

  async function getCurrentUser() {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return {
      id: user.id, email: user.email,
      username: profile?.username || user.user_metadata?.username || 'User',
      displayName: profile?.display_name || user.user_metadata?.display_name || 'User',
      role: profile?.role || user.user_metadata?.role || 'user',
      fandomName: profile?.fandom_name || null,
      fandomVerified: profile?.fandom_verified || false,
      avatar: profile?.avatar_url || ''
    };
  }

  async function updateProfile(profileData) {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Пользователь не авторизован");
    const { data, error } = await client.from('profiles').update(profileData).eq('id', user.id).select().single();
    if (error) throw error;
    return data;
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    return client.auth.onAuthStateChange(async (event, session) => { await callback(event, session); });
  }

  // ========== TOURNAMENTS (OPTIMIZED) ==========
  async function getTournaments() {
    const cached = Cache.get('tournaments:list');
    if (cached) return { data: cached, error: null };

    const client = getClient();
    const { data, error } = await client.from('tournaments')
      .select('*, players(count)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) return { data: null, error };
    if (!data || !data.length) return { data: [], error: null };

    // players(count) возвращает объект, извлекаем count
    const tournamentsWithCount = data.map(t => ({
      ...t,
      player_count: t.players?.[0]?.count || 0,
      players_count: t.players?.[0]?.count || 0
    }));

    Cache.set('tournaments:list', tournamentsWithCount, Cache._ttlLong);
    return { data: tournamentsWithCount, error: null };
  }

  async function getTournament(id) {
    const cacheKey = 'tournament:' + id;
    const cached = Cache.get(cacheKey);
    if (cached) return { data: cached, error: null };

    const client = getClient();

    // ✅ ОДИН запрос вместо 7
    const { data: tournament, error: tError } = await client.from('tournaments')
      .select(`
        *,
        players(*),
        rounds(*,
          matches(*,
            player1:players!matches_player1_id_fkey(*),
            player2:players!matches_player2_id_fkey(*)
          ),
          groups(*, group_players(*))
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (tError || !tournament) return { data: null, error: tError || new Error('Турнир не найден') };

    // Построение playerMap для быстрого доступа
    const playerMap = {};
    (tournament.players || []).forEach(p => { playerMap[p.id] = p; });

    // Расчёт standings
    let playerScores;
    if (window.SwissEngine) {
      const flatMatches = [];
      (tournament.rounds || []).forEach(r => {
        (r.matches || []).forEach(m => flatMatches.push(m));
      });
      playerScores = window.SwissEngine.calculateStandings(tournament.players || [], flatMatches);
    } else {
      playerScores = {};
      for (const p of tournament.players || []) playerScores[p.id] = { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 };
      for (const r of tournament.rounds || []) {
        for (const m of r.matches || []) {
          if (!m.finished) continue;
          const v1 = m.votes1 || 0, v2 = m.votes2 || 0;
          if (v1 > v2) { if (m.player1_id) { playerScores[m.player1_id].wins++; playerScores[m.player1_id].points += 1; } if (m.player2_id) playerScores[m.player2_id].losses++; }
          else if (v2 > v1) { if (m.player2_id) { playerScores[m.player2_id].wins++; playerScores[m.player2_id].points += 1; } if (m.player1_id) playerScores[m.player1_id].losses++; }
          else if (v1 === v2 && v1 > 0) { if (m.player1_id) { playerScores[m.player1_id].draws++; playerScores[m.player1_id].points += 0.5; } if (m.player2_id) { playerScores[m.player2_id].draws++; playerScores[m.player2_id].points += 0.5; } }
        }
      }
      for (const p of tournament.players || []) {
        let b = 0;
        for (const r of tournament.rounds || []) {
          for (const m of r.matches || []) {
            if (!m.finished) continue;
            let oid = null;
            if (m.player1_id === p.id) oid = m.player2_id;
            else if (m.player2_id === p.id) oid = m.player1_id;
            if (oid) b += playerScores[oid]?.points || 0;
          }
        }
        playerScores[p.id].buchholz = b;
      }
    }

    tournament.players = (tournament.players || []).map(p => ({
      ...p,
      score: playerScores[p.id] || { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 }
    })).sort((a, b) => {
      const ptsDiff = (b.score?.points || 0) - (a.score?.points || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const buchDiff = (b.score?.buchholz || 0) - (a.score?.buchholz || 0);
      if (buchDiff !== 0) return buchDiff;
      return (b.score?.wins || 0) - (a.score?.wins || 0);
    });

    // Обработка rounds
    tournament.rounds = (tournament.rounds || []).map(r => {
      const roundMatches = (r.matches || []).map(m => {
        const v1 = m.votes1 || 0;
        const v2 = m.votes2 || 0;
        let winnerObj = null;
        if (m.finished && m.winner_id) winnerObj = playerMap[m.winner_id] || null;
        return {
          ...m,
          player1: m.player1_id ? playerMap[m.player1_id] || m.player1 : null,
          player2: m.player2_id ? playerMap[m.player2_id] || m.player2 : null,
          winner: winnerObj,
          votes1: v1, votes2: v2,
          finished: m.finished || false,
          isDraw: m.finished && v1 === v2 && v1 > 0,
          isBye: m.isBye || (!m.player2_id && m.player1_id)
        };
      });

      return {
        ...r,
        isActive: r.is_active,
        startedAt: r.started_at,
        groups: r.groups || [],
        matches: roundMatches
      };
    });

    tournament.currentRound = tournament.current_round || 0;
    tournament.totalRounds = tournament.total_rounds || 10;
    tournament.standings = tournament.players;
    tournament.groups = [];
    (tournament.rounds || []).forEach(r => {
      if (r.groups) tournament.groups.push(...r.groups);
    });

    if (tournament.status === 'finished' && tournament.players.length > 0) {
      tournament.winner = tournament.players[0];
    }

    Cache.set(cacheKey, tournament);
    return { data: tournament, error: null };
  }

  async function createTournament(tournamentData) {
    const client = getClient();
    const { title, description, status, total_rounds, groups_per_round, players_per_group, days_per_group, break_days, top_cut } = tournamentData || {};
    const result = await client.from('tournaments').insert({ 
      title, description, status, 
      total_rounds: total_rounds || 10,
      current_round: 0,
      groups_per_round: groups_per_round || 1,
      players_per_group: players_per_group || 8,
      days_per_group: days_per_group || 1,
      break_days: break_days || 1,
      top_cut: top_cut || 50
    }).select().single();
    
    Cache.invalidate('tournaments:list');
    return result;
  }

  async function updateTournament(id, updates) {
    const client = getClient();
    Cache.invalidateTournament(id);
    return await client.from('tournaments').update(updates).eq('id', id).select().single();
  }

  async function deleteTournament(id) {
    const client = getClient();
    await client.from('votes').delete().eq('tournament_id', id);
    await client.from('matches').delete().eq('tournament_id', id);
    await client.from('group_players').delete().eq('tournament_id', id);
    await client.from('groups').delete().eq('tournament_id', id);
    await client.from('rounds').delete().eq('tournament_id', id);
    await client.from('players').delete().eq('tournament_id', id);
    await client.from('comments').delete().eq('tournament_id', id);
    const result = await client.from('tournaments').delete().eq('id', id);
    Cache.invalidateTournament(id);
    return result;
  }

  // ========== PLAYERS ==========
  async function getPlayers(tournamentId) {
    const client = getClient();
    return await client.from('players').select('*').eq('tournament_id', tournamentId);
  }

  async function createPlayers(playersArray) {
    const client = getClient();
    const result = await client.from('players').insert(playersArray).select();
    if (playersArray.length > 0) {
      Cache.invalidateTournament(playersArray[0].tournament_id);
    }
    return result;
  }

  // ========== MATCHES ==========
  async function getMatches(roundId) {
    const client = getClient();
    return await client.from('matches').select('*').eq('round_id', roundId);
  }

  async function updateMatch(id, updates) {
    const client = getClient();
    const result = await client.from('matches').update(updates).eq('id', id).select().single();
    // Инвалидируем кэш турниров, содержащих этот матч
    Cache.invalidate();
    return result;
  }

  // ========== VOTING ==========
  async function castVote(matchId, playerIndex) {
    const client = getClient();
    const user = await getCurrentUser();

    if (user) {
      const { data: existing } = await client.from('votes')
        .select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
      if (existing) throw new Error("Вы уже голосовали в этом матче!");
    } else {
      if (localStorage.getItem('th_voted_match_' + matchId)) throw new Error("Вы уже голосовали!");
    }

    const { data: matchData } = await client.from('matches').select('tournament_id,group_id').eq('id', matchId).single();
    const tournamentId = matchData?.tournament_id;
    
    if (matchData?.group_id) {
      const { data: groupData } = await client.from('groups').select('status').eq('id', matchData.group_id).single();
      if (groupData && groupData.status !== 'open' && groupData.status !== 'voting') {
        throw new Error("Голосование в этой группе закрыто!");
      }
    }

    const { error } = await client.from('votes').insert({
      match_id: matchId,
      tournament_id: tournamentId,
      user_id: user ? user.id : null,
      player_index: playerIndex
    });

    if (error) throw error;
    if (!user) localStorage.setItem('th_voted_match_' + matchId, 'true');

    // ✅ Инвалидируем кэш турнира
    Cache.invalidateTournament(tournamentId);

    return { success: true };
  }

  async function hasVoted(matchId) {
    const client = getClient();
    const user = await getCurrentUser();
    if (!user) return !!localStorage.getItem('th_voted_match_' + matchId);
    const { data } = await client.from('votes')
      .select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    return !!data;
  }

  // ========== COMMENTS ==========
  async function getComments(tournamentId) {
    const client = getClient();
    return await client.from('comments').select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: false });
  }

  async function addComment(tournamentId, text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('comments').insert({
      tournament_id: tournamentId, user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Гость', text
    }).select().single();
  }

  async function deleteComment(id) {
    const client = getClient();
    return await client.from('comments').delete().eq('id', id);
  }

  // ========== CHAT ==========
  async function getChatMessages(limit) {
    const client = getClient();
    return await client.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(limit || 100);
  }

  async function sendChatMessage(text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('chat_messages').insert({
      user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Аноним', text
    });
  }

  // ========== SETTINGS & ADMIN ==========
  async function getSiteSettings() {
    const client = getClient();
    return await client.from('site_settings').select('*').eq('id', 'global').maybeSingle();
  }

  async function updateSiteSettings(settings) {
    const client = getClient();
    return await client.from('site_settings').upsert({ id: 'global', ...settings }).select().single();
  }

  async function getAllUsers() {
    const client = getClient();
    return await client.from('profiles').select('*').order('username', { ascending: true });
  }

  async function setUserRole(userId, role) {
    const client = getClient();
    return await client.from('profiles').update({ role }).eq('id', userId);
  }

  async function getAdminLogs(limit) {
    const client = getClient();
    return await client.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(limit || 100);
  }

  async function logAction(action, details) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('admin_logs').insert({ user_id: user?.id || null, action, details: details || {} });
  }

  async function getSiteStats() {
    try {
      const client = getClient();
      const { data: tournaments } = await client.from('tournaments').select('id', { count: 'exact', head: true });
      const { data: users } = await client.from('profiles').select('id', { count: 'exact', head: true });
      const { data: matches } = await client.from('matches').select('id', { count: 'exact', head: true });
      return { data: { tournaments: tournaments?.length || 0, users: users?.length || 0, matches: matches?.length || 0 } };
    } catch (e) { return { data: { tournaments: 0, users: 0, matches: 0 } }; }
  }

  // ========== REALTIME ==========
  function subscribeToChat(callback) {
    const client = getClient();
    const channel = client.channel('public-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => callback(payload.new))
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, callback) {
    const client = getClient();
    const channel = client.channel('matches-' + tournamentId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'tournament_id=eq.' + tournamentId }, payload => {
        Cache.invalidateTournament(tournamentId);
        callback(payload.new);
      })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function unsubscribeAll() {
    const client = getClient();
    realtimeChannels.forEach(ch => { try { client.removeChannel(ch); } catch(e) {} });
    realtimeChannels = [];
  }

  async function isAdmin() {
    const user = JSON.parse(localStorage.getItem('th_user') || 'null');
    if (user?.role === 'admin' || localStorage.getItem('th_admin') === 'yes') return true;
    try { const u = await getCurrentUser(); return u?.role === 'admin'; } catch(e) { return false; }
  }

  // ========== DELEGATE TO SwissEngine ==========
  function generateSwissPairs(players, previousMatches) {
    if (window.SwissEngine) return window.SwissEngine.generateSwissPairs(players, previousMatches);
    console.error('SwissEngine not loaded!');
    return [];
  }

  function calculateStandings(allPlayers, allMatches) {
    if (window.SwissEngine) return window.SwissEngine.calculateStandings(allPlayers, allMatches);
    const scores = {};
    for (const p of allPlayers) scores[p.id] = { wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0 };
    for (const m of allMatches) {
      if (!m.finished) continue;
      const v1 = m.votes1 || 0, v2 = m.votes2 || 0;
      if (v1 > v2) { if (m.player1_id) { scores[m.player1_id].wins++; scores[m.player1_id].points += 1; } if (m.player2_id) scores[m.player2_id].losses++; }
      else if (v2 > v1) { if (m.player2_id) { scores[m.player2_id].wins++; scores[m.player2_id].points += 1; } if (m.player1_id) scores[m.player1_id].losses++; }
      else if (v1 === v2 && v1 > 0) { if (m.player1_id) { scores[m.player1_id].draws++; scores[m.player1_id].points += 0.5; } if (m.player2_id) { scores[m.player2_id].draws++; scores[m.player2_id].points += 0.5; } }
    }
    for (const p of allPlayers) {
      let b = 0;
      for (const m of allMatches) {
        if (!m.finished) continue;
        let oid = null;
        if (m.player1_id === p.id) oid = m.player2_id;
        else if (m.player2_id === p.id) oid = m.player1_id;
        if (oid) b += scores[oid]?.points || 0;
      }
      scores[p.id].buchholz = b;
    }
    return scores;
  }

  function calculateBuchholz(playerId, allMatches, playerScores) {
    if (window.SwissEngine) return window.SwissEngine.calculateBuchholz(playerId, allMatches, playerScores);
    let b = 0;
    for (const m of allMatches) {
      if (!m.finished) continue;
      let oid = null;
      if (m.player1_id === playerId) oid = m.player2_id;
      else if (m.player2_id === playerId) oid = m.player1_id;
      if (oid) b += playerScores[oid]?.points || 0;
    }
    return b;
  }

  async function getProfile() {
    return await getCurrentUser();
  }

  // ✅ Экспортируем Cache для использования в других модулях
  window.TH = {
    init, getClient, isReady: false, getProfile,
    signUp, signIn, signInWithProvider, signOut, getSession, getCurrentUser, updateProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers, getMatches, updateMatch,
    castVote, hasVoted, getComments, addComment, deleteComment,
    getChatMessages, sendChatMessage, getSiteSettings, updateSiteSettings, getSiteStats,
    subscribeToChat, subscribeToMatches, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction,
    generateSwissPairs, calculateStandings, calculateBuchholz,
    Cache // ✅ доступ к кэшу
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }
})();
