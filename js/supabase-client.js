/* ============================================================
   SUPABASE CLIENT – исправлен isAdmin, голосование
   ============================================================ */
(function () {
  'use strict';
  let supabaseInstance = null;
  let initDone = false;

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
    window.TH = window.TH || {};
    window.TH.isReady = true;
    console.log('✅ Supabase client initialized');
    return true;
  }

  function getClient() { if (!initDone) init(); return supabaseInstance; }

  // === AUTH (как в прошлой версии) ===
  async function signUp(email, password, metadata) { ... }
  async function signIn(email, password) { ... }
  async function signInWithProvider(provider) { ... }
  async function signOut() { ... }

  // === Получение текущего пользователя с ролью ===
  async function getCurrentUser() {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return {
      id: user.id,
      email: user.email,
      username: profile?.username || user.user_metadata?.username || 'User',
      displayName: profile?.display_name || user.user_metadata?.display_name || 'User',
      role: profile?.role || user.user_metadata?.role || 'user',
      fandomName: profile?.fandom_name || null,
      fandomVerified: profile?.fandom_verified || false,
      avatar: profile?.avatar_url || '',
      votes: profile?.votes_count || 0
    };
  }

  // === Проверка админа (использует роль из профиля) ===
  async function isAdmin() {
    const user = await getCurrentUser();
    return user?.role === 'admin';
  }

  // === Голосование с проверкой авторизации ===
  async function castVote(matchId, playerIndex) {
    const client = getClient();
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Только авторизованные пользователи могут голосовать.");
    }

    // Проверяем, не голосовал ли уже
    const { data: existing } = await client.from('votes')
      .select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    if (existing) throw new Error("Вы уже голосовали!");

    // Получаем tournament_id
    const { data: matchData } = await client.from('matches').select('tournament_id').eq('id', matchId).single();
    const tournamentId = matchData?.tournament_id;

    const { error } = await client.from('votes').insert({
      match_id: matchId,
      tournament_id: tournamentId,
      user_id: user.id,
      player_index: playerIndex
    });
    if (error) throw error;

    // Обновляем счёт в матче (триггер в БД сделает это автоматически, но для надежности обновим явно)
    const { data: match } = await client.from('matches').select('votes1,votes2').eq('id', matchId).single();
    const updates = playerIndex === 1 ? { votes1: (match.votes1 || 0) + 1 } : { votes2: (match.votes2 || 0) + 1 };
    await client.from('matches').update(updates).eq('id', matchId);

    return { success: true };
  }

  // ===== TOURNAMENTS =====
  async function getTournaments() {
    const client = getClient();
    return await client.from('tournaments').select('*').order('created_at', { ascending: false });
  }

  async function getTournament(id) {
    const client = getClient();
    const { data: tournament, error: tError } = await client.from('tournaments').select('*').eq('id', id).maybeSingle();
    if (tError || !tournament) return { data: null, error: tError };

    const { data: allPlayers } = await client.from('players').select('*').eq('tournament_id', id);
    const { data: rounds } = await client.from('rounds').select('*').eq('tournament_id', id).order('round_number', { ascending: true });
    const { data: allMatches } = await client.from('matches').select('*').eq('tournament_id', id);

    const playerMap = {};
    (allPlayers || []).forEach(p => { playerMap[p.id] = p; });

    // Calculate scores
    const scores = {};
    (allPlayers || []).forEach(p => { scores[p.id] = { wins: 0, losses: 0, points: 0 }; });
    (allMatches || []).forEach(m => {
      if (m.finished && m.winner_id) {
        if (!scores[m.winner_id]) scores[m.winner_id] = { wins: 0, losses: 0, points: 0 };
        scores[m.winner_id].wins++;
        scores[m.winner_id].points += 1;
        const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        if (loserId) {
          if (!scores[loserId]) scores[loserId] = { wins: 0, losses: 0, points: 0 };
          scores[loserId].losses++;
        }
      }
    });

    tournament.players = (allPlayers || []).map(p => ({
      ...p,
      score: scores[p.id] || { wins: 0, losses: 0, points: 0 }
    })).sort((a, b) => (b.score?.points || 0) - (a.score?.points || 0));

    tournament.rounds = (rounds || []).map(r => {
      const roundMatches = (allMatches || []).filter(m => m.round_id === r.id);
      return {
        ...r,
        isActive: r.is_active,
        startedAt: r.started_at,
        group_count: r.group_count || 1,
        active_group_index: r.active_group_index || 0,
        matches: roundMatches.map(m => ({
          ...m,
          player1: m.player1_id ? playerMap[m.player1_id] : null,
          player2: m.player2_id ? playerMap[m.player2_id] : null,
          winner: m.winner_id ? playerMap[m.winner_id] : null,
          votes1: m.votes1 || 0,
          votes2: m.votes2 || 0,
          finished: m.finished || false,
          group_index: m.group_index || 0,
          match_order: m.match_order || 0
        }))
      };
    });

    tournament.currentRound = tournament.current_round || 0;
    tournament.totalRounds = tournament.total_rounds || 10;
    tournament.standings = tournament.players;
    tournament.group_count = tournament.group_count || Math.max(1, Math.floor((allPlayers || []).length / 4));
    tournament.pairing_mode = tournament.pairing_mode || 'swiss';
    tournament.rest_days_between_rounds = tournament.rest_days_between_rounds || 1;

    return { data: tournament, error: null };
  }

  async function createTournament(data) {
    const client = getClient();
    const { title, description, status, total_rounds, pairing_mode, group_count, round_duration_days, rest_days_between_rounds } = data || {};
    return await client.from('tournaments').insert({
      title, description, status,
      total_rounds: total_rounds || 10,
      pairing_mode: pairing_mode || 'swiss',
      group_count: group_count || 4,
      round_duration_days: round_duration_days || 1,
      rest_days_between_rounds: rest_days_between_rounds || 1,
      current_round: 0
    }).select().single();
  }

  async function updateTournament(id, updates) {
    const client = getClient();
    return await client.from('tournaments').update(updates).eq('id', id).select().single();
  }

  async function deleteTournament(id) {
    const client = getClient();
    await client.from('votes').delete().eq('tournament_id', id);
    await client.from('matches').delete().eq('tournament_id', id);
    await client.from('rounds').delete().eq('tournament_id', id);
    await client.from('players').delete().eq('tournament_id', id);
    await client.from('comments').delete().eq('tournament_id', id);
    return await client.from('tournaments').delete().eq('id', id);
  }

  // ===== PLAYERS =====
  async function getPlayers(tournamentId) {
    const client = getClient();
    return await client.from('players').select('*').eq('tournament_id', tournamentId);
  }
  async function createPlayers(playersArray) {
    const client = getClient();
    return await client.from('players').insert(playersArray).select();
  }

  // ===== MATCHES =====
  async function getMatches(roundId) {
    const client = getClient();
    return await client.from('matches').select('*').eq('round_id', roundId);
  }
  async function updateMatch(id, updates) {
    const client = getClient();
    return await client.from('matches').update(updates).eq('id', id).select().single();
  }

  // ===== VOTING =====
  async function castVote(matchId, playerIndex) {
    const client = getClient();
    const user = await getCurrentUser();
    if (!user) {
      const votedKey = 'th_voted_match_' + matchId;
      if (localStorage.getItem(votedKey)) throw new Error("Вы уже голосовали!");
      localStorage.setItem(votedKey, 'true');
      // Local update only
      const { data: match } = await client.from('matches').select('votes1,votes2').eq('id', matchId).single();
      const updates = playerIndex === 1 ? { votes1: (match.votes1 || 0) + 1 } : { votes2: (match.votes2 || 0) + 1 };
      await client.from('matches').update(updates).eq('id', matchId);
      return { success: true };
    }

    const { data: existing } = await client.from('votes')
      .select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    if (existing) throw new Error("Вы уже голосовали!");

    const { data: matchData } = await client.from('matches').select('tournament_id').eq('id', matchId).single();
    const tournamentId = matchData?.tournament_id;

    const { error } = await client.from('votes').insert({
      match_id: matchId,
      tournament_id: tournamentId,
      user_id: user.id,
      player_index: playerIndex
    });
    if (error) throw error;

    const { data: match } = await client.from('matches').select('votes1,votes2').eq('id', matchId).single();
    const updates = playerIndex === 1 ? { votes1: (match.votes1 || 0) + 1 } : { votes2: (match.votes2 || 0) + 1 };
    await client.from('matches').update(updates).eq('id', matchId);

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

  // ===== COMMENTS =====
  async function getComments(tournamentId) {
    const client = getClient();
    return await client.from('comments').select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: false });
  }
  async function addComment(tournamentId, text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('comments').insert({
      tournament_id: tournamentId,
      user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Гость',
      text
    }).select().single();
  }
  async function deleteComment(id) {
    const client = getClient();
    return await client.from('comments').delete().eq('id', id);
  }

  // ===== CHAT =====
  async function getChatMessages(limit) {
    const client = getClient();
    return await client.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(limit || 100);
  }
  async function sendChatMessage(text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('chat_messages').insert({
      user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Аноним',
      text
    });
  }

  // ===== NEWS =====
  async function getNews(limit) {
    const client = getClient();
    return await client.from('news').select('*').order('published_at', { ascending: false }).limit(limit || 10);
  }
  async function createNewsItem(data) {
    const client = getClient();
    return await client.from('news').insert(data).select().single();
  }
  async function deleteNewsItem(id) {
    const client = getClient();
    return await client.from('news').delete().eq('id', id);
  }

  // ===== SETTINGS & ADMIN =====
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
      const { data: tournaments } = await client.from('tournaments').select('id');
      const { data: users } = await client.from('profiles').select('id');
      const { data: matches } = await client.from('matches').select('id');
      return { data: { tournaments: (tournaments || []).length, users: (users || []).length, matches: (matches || []).length } };
    } catch (e) { return { data: { tournaments: 0, users: 0, matches: 0 } }; }
  }

  // ===== REALTIME =====
  let realtimeChannels = [];
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'tournament_id=eq.' + tournamentId }, payload => callback(payload.new))
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }
  function unsubscribeAll() {
    const client = getClient();
    realtimeChannels.forEach(ch => { try { client.removeChannel(ch); } catch(e) {} });
    realtimeChannels = [];
  }

  function isAdmin() {
    const user = JSON.parse(localStorage.getItem('th_user') || 'null');
    return user?.role === 'admin' || localStorage.getItem('th_admin') === 'yes';
  }

  // ===== EXPOSE =====
window.TH = {
    init, getClient, isReady: false,
    signUp, signIn, signInWithProvider, signOut, getCurrentUser, updateProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers, getMatches, updateMatch,
    castVote, hasVoted, getComments, addComment, deleteComment,
    getChatMessages, sendChatMessage,
    getNews, createNewsItem, deleteNewsItem,
    getSiteSettings, updateSiteSettings, getSiteStats,
    subscribeToChat, subscribeToMatches, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }
})();
