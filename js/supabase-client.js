/* ============================================================
   Tournament Hub — Supabase Client (FIXED v12 — Shikimori Edition)
   ============================================================ */
(function () {
  'use strict';
  let realtimeChannels = [];
  let initDone = false;
  let supabaseInstance = null;

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
    console.log('✅ Supabase client initialized');
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
      id: user.id,
      email: user.email,
      username: profile?.username || user.user_metadata?.username || 'User',
      displayName: profile?.display_name || user.user_metadata?.display_name || 'User',
      role: profile?.role || user.user_metadata?.role || 'user',
      fandomName: profile?.fandom_name || null,
      fandomVerified: profile?.fandom_verified || false,
      avatar: profile?.avatar || ''
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

  // ========== TOURNAMENTS (with full nested data) ==========
  async function getTournaments() {
    const client = getClient();
    return await client.from('tournaments').select('*').order('created_at', { ascending: false });
  }

  async function getTournament(id) {
    const client = getClient();
    // Fetch tournament with all related data
    const { data: tournament, error: tError } = await client
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (tError || !tournament) return { data: null, error: tError };

    // Fetch rounds
    const { data: rounds } = await client
      .from('rounds')
      .select('*')
      .eq('tournament_id', id)
      .order('round_number', { ascending: true });

    // Fetch all matches for this tournament
    const { data: allMatches } = await client
      .from('matches')
      .select('*')
      .eq('tournament_id', id);

    // Fetch all players for this tournament
    const { data: allPlayers } = await client
      .from('players')
      .select('*')
      .eq('tournament_id', id);

    // Build nested structure
    const playerMap = {};
    (allPlayers || []).forEach(p => { playerMap[p.id] = p; });

    tournament.rounds = (rounds || []).map(r => {
      const roundMatches = (allMatches || []).filter(m => m.round_id === r.id);
      return {
        ...r,
        isActive: r.is_active,
        startedAt: r.started_at,
        matches: roundMatches.map(m => ({
          ...m,
          player1: m.player1_id ? playerMap[m.player1_id] : null,
          player2: m.player2_id ? playerMap[m.player2_id] : null,
          winner: m.winner_id ? playerMap[m.winner_id] : null,
          votes1: m.votes1 || 0,
          votes2: m.votes2 || 0,
          finished: m.finished || false
        }))
      };
    });

    tournament.players = allPlayers || [];
    tournament.currentRound = tournament.current_round || 0;

    return { data: tournament, error: null };
  }

  async function createTournament(tournamentData) {
    const client = getClient();
    const { title, description, status } = tournamentData || {};
    return await client.from('tournaments').insert({ title, description, status }).select().single();
  }

  async function updateTournament(id, updates) {
    const client = getClient();
    return await client.from('tournaments').update(updates).eq('id', id).select().single();
  }

  async function deleteTournament(id) {
    const client = getClient();
    // Delete in correct order: matches -> rounds -> players -> tournament
    await client.from('matches').delete().eq('tournament_id', id);
    await client.from('rounds').delete().eq('tournament_id', id);
    await client.from('players').delete().eq('tournament_id', id);
    await client.from('votes').delete().eq('tournament_id', id);
    await client.from('comments').delete().eq('tournament_id', id);
    return await client.from('tournaments').delete().eq('id', id);
  }

  // ========== PLAYERS ==========
  async function getPlayers(tournamentId) {
    const client = getClient();
    return await client.from('players').select('*').eq('tournament_id', tournamentId);
  }

  async function createPlayers(playersArray) {
    const client = getClient();
    return await client.from('players').insert(playersArray).select();
  }

  // ========== MATCHES ==========
  async function getMatches(roundId) {
    const client = getClient();
    return await client.from('matches').select('*').eq('round_id', roundId);
  }

  async function updateMatch(id, updates) {
    const client = getClient();
    return await client.from('matches').update(updates).eq('id', id).select().single();
  }

  // ========== VOTING ==========
  async function castVote(matchId, playerIndex) {
    const client = getClient();
    const user = await getCurrentUser();

    // Check if already voted
    if (user) {
      const { data: existing } = await client.from('votes')
        .select('id')
        .eq('match_id', matchId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) throw new Error("Вы уже голосовали в этом матче!");
    } else {
      // For guests, check localStorage
      const voted = JSON.parse(localStorage.getItem('th_voted_matches') || '[]');
      if (voted.includes(matchId)) throw new Error("Вы уже голосовали!");
    }

    // Insert vote
    const { error } = await client.from('votes').insert({
      match_id: matchId,
      user_id: user ? user.id : null,
      player_index: playerIndex,
      is_guest: !user
    });

    if (error) throw error;

    // Update match vote count
    const { data: match } = await client.from('matches').select('votes1,votes2').eq('id', matchId).single();
    const updates = playerIndex === 1 
      ? { votes1: (match.votes1 || 0) + 1 }
      : { votes2: (match.votes2 || 0) + 1 };
    await client.from('matches').update(updates).eq('id', matchId);

    // Mark as voted locally
    if (!user) {
      const voted = JSON.parse(localStorage.getItem('th_voted_matches') || '[]');
      voted.push(matchId);
      localStorage.setItem('th_voted_matches', JSON.stringify(voted));
    }

    return { success: true };
  }

  async function hasVoted(matchId) {
    const client = getClient();
    const user = await getCurrentUser();
    if (!user) {
      const voted = JSON.parse(localStorage.getItem('th_voted_matches') || '[]');
      return voted.includes(matchId);
    }
    const { data } = await client.from('votes')
      .select('id')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .maybeSingle();
    return !!data;
  }

  // ========== COMMENTS ==========
  async function getComments(tournamentId) {
    const client = getClient();
    return await client.from('comments')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });
  }

  async function addComment(tournamentId, text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('comments').insert({
      tournament_id: tournamentId,
      user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Гость',
      text: text
    }).select().single();
  }

  async function deleteComment(id) {
    const client = getClient();
    return await client.from('comments').delete().eq('id', id);
  }

  // ========== CHAT ==========
  async function getChatMessages(limit) {
    const client = getClient();
    return await client.from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit || 100);
  }

  async function sendChatMessage(text) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('chat_messages').insert({
      user_id: user?.id || null,
      author_name: user?.displayName || user?.username || 'Аноним',
      text: text
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
    return await client.from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit || 100);
  }

  async function logAction(action, details) {
    const client = getClient();
    const user = await getCurrentUser();
    return await client.from('admin_logs').insert({
      user_id: user?.id || null,
      action,
      details: details || {}
    });
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

  // ========== REALTIME ==========
  function subscribeToChat(callback) {
    const client = getClient();
    const channel = client.channel('public-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => { callback(payload.new); })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, callback) {
    const client = getClient();
    const channel = client.channel('matches-' + tournamentId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'tournament_id=eq.' + tournamentId }, payload => { callback(payload.new); })
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

  window.TH = {
    init, getClient, isReady: false,
    signUp, signIn, signInWithProvider, signOut, getSession, getCurrentUser, updateProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers, getMatches, updateMatch,
    castVote, hasVoted, getComments, addComment, deleteComment,
    getChatMessages, sendChatMessage, getSiteSettings, updateSiteSettings, getSiteStats,
    subscribeToChat, subscribeToMatches, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }
})();
