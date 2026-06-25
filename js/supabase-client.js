/* ============================================================
   Tournament Hub — Supabase Client (FIXED v8 — OAuth works, correct paths, safe getProfile)
   ============================================================ */

(function () {
  'use strict';

  let realtimeChannels = [];
  let initDone = false;

  /* ==========================================================
     URL HELPERS
     ========================================================== */
  function getBasePath() {
    // FIX: автоопределение basePath вместо хардкода
    const path = window.location.pathname;
    // Если мы в /tournament-hub/ или /tournament-hub/page.html
    const match = path.match(/^(.+?)\/(?:index\.html|[^/]+\.html)?$/);
    if (match) {
      const base = match[1];
      // Проверяем, что это не корневой путь
      if (base && base !== '') return base;
    }
    // Fallback на конфиг или корень
    return window._supabaseConfig?.basePath || '';
  }

  function getBaseUrl() {
    return window.location.origin + getBasePath();
  }

  /* ==========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================== */
  function init() {
    if (initDone) return true;
    if (window._supabase) {
      console.log('✅ Using existing Supabase client');
      initDone = true;
      return true;
    }

    if (typeof window.supabase === 'undefined') {
      console.error('❌ Supabase library not loaded!');
      return false;
    }

    const cfg = window._supabaseConfig || {};
    const url = cfg.url || 'https://fpabooteqfahhzobcpnh.supabase.co';
    const key = cfg.key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac';

    // FIX: detectSessionInUrl: true — критично для OAuth!
    const options = cfg.options || {
      auth: { 
        autoRefreshToken: true, 
        persistSession: true, 
        detectSessionInUrl: true  // ← FIX: было false!
      },
      realtime: { params: { eventsPerSecond: 10 } }
    };

    window._supabase = window.supabase.createClient(url, key, options);
    initDone = true;
    console.log('✅ Supabase initialized, basePath:', getBasePath());

    // FIX: вызываем DB._init() ПОСЛЕ создания клиента
    if (window.DB && window.DB._init) {
      setTimeout(() => window.DB._init(), 100);
    }

    return true;
  }

  function getClient() {
    if (!initDone) init();
    return window._supabase;
  }

  /* ==========================================================
     AUTH
     ========================================================== */
  async function signUp(email, password, metadata) {
    const { data, error } = await getClient().auth.signUp({
      email, password,
      options: { data: metadata }
    });
    return { data, error };
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signInWithProvider(provider) {
    // FIX: правильный redirectTo с автоопределением пути
    const redirectTo = getBaseUrl() + '/login.html';
    console.log('🔐 OAuth redirectTo:', redirectTo);

    const { data, error } = await getClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    return { data, error };
  }

  async function signOut() {
    unsubscribeAll();
    const { error } = await getClient().auth.signOut();
    return { error };
  }

  async function getCurrentUser() {
    const { data: { session } } = await getClient().auth.getSession();
    return session?.user || null;
  }

  async function getSession() {
    const { data: { session } } = await getClient().auth.getSession();
    return session;
  }

  async function getProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await getClient()
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('getProfile error:', error);
      return null;
    }
    return data;
  }

  async function updateProfile(updates) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Not authenticated') };
    const { data, error } = await getClient()
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    return { data, error };
  }

  async function upsertProfile(updates) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Not authenticated'), data: null };

    const existing = await getProfile();

    if (existing) {
      const { data, error } = await getClient()
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single();
      return { data, error };
    } else {
      const { data, error } = await getClient()
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          ...updates,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      return { data, error };
    }
  }

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange((event, session) => callback(event, session));
  }

  /* ==========================================================
     TOURNAMENTS
     ========================================================== */
  async function getTournaments(status) {
    let query = getClient().from('tournaments').select(`
      *,
      players:players(*),
      rounds:rounds(*, matches:matches(*, player1:player1_id(*), player2:player2_id(*), winner:winner_id(*)))
    `).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    return { data, error };
  }

  async function getTournament(id) {
    const { data, error } = await getClient().from('tournaments').select(`
      *,
      players:players(*),
      rounds:rounds(*, matches:matches(*, player1:player1_id(*), player2:player2_id(*), winner:winner_id(*)))
    `).eq('id', id).single();
    return { data, error };
  }

  async function createTournament(tournament) {
    const { data, error } = await getClient().from('tournaments').insert(tournament).select().single();
    return { data, error };
  }

  async function updateTournament(id, updates) {
    const { data, error } = await getClient().from('tournaments').update(updates).eq('id', id).select().single();
    return { data, error };
  }

  async function deleteTournament(id) {
    const { error } = await getClient().from('tournaments').delete().eq('id', id);
    return { error };
  }

  /* ==========================================================
     PLAYERS
     ========================================================== */
  async function getPlayers(tournamentId) {
    const { data, error } = await getClient().from('players').select('*').eq('tournament_id', tournamentId).order('seed', { ascending: true });
    return { data, error };
  }

  async function createPlayers(players) {
    const { data, error } = await getClient().from('players').insert(players).select();
    return { data, error };
  }

  /* ==========================================================
     MATCHES
     ========================================================== */
  async function getMatches(tournamentId, roundId) {
    let query = getClient().from('matches').select('*, player1:player1_id(*), player2:player2_id(*), winner:winner_id(*)').order('match_order', { ascending: true });
    if (tournamentId) query = query.eq('tournament_id', tournamentId);
    if (roundId) query = query.eq('round_id', roundId);
    const { data, error } = await query;
    return { data, error };
  }

  async function updateMatch(id, updates) {
    const { data, error } = await getClient().from('matches').update(updates).eq('id', id).select().single();
    return { data, error };
  }

  /* ==========================================================
     VOTES
     ========================================================== */
  async function castVote(matchId, tournamentId, playerNumber) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };
    const { data, error } = await getClient().from('votes').insert({
      match_id: matchId, tournament_id: tournamentId, user_id: user.id, player_number: playerNumber
    }).select().single();
    return { data, error };
  }

  async function hasVoted(matchId) {
    const user = await getCurrentUser();
    if (!user) return false;
    const { data } = await getClient().from('votes').select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    return !!data;
  }

  /* ==========================================================
     COMMENTS
     ========================================================== */
  async function getComments(tournamentId) {
    const { data, error } = await getClient().from('comments').select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: false });
    return { data, error };
  }

  async function addComment(tournamentId, text) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };
    const profile = await getProfile();
    const { data, error } = await getClient().from('comments').insert({
      tournament_id: tournamentId, user_id: user.id,
      username: profile?.display_name || profile?.username || 'Аноним',
      text: text.trim()
    }).select().single();
    return { data, error };
  }

  async function deleteComment(id) {
    const { error } = await getClient().from('comments').delete().eq('id', id);
    return { error };
  }

  /* ==========================================================
     CHAT
     ========================================================== */
  async function getChatMessages(limit) {
    const { data, error } = await getClient().from('chat_messages').select('*').order('created_at', { ascending: true }).limit(limit || 200);
    return { data, error };
  }

  async function sendChatMessage(text) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };
    const profile = await getProfile();
    const { data, error } = await getClient().from('chat_messages').insert({
      user_id: user.id, username: profile?.display_name || profile?.username || 'Аноним', text: text.trim()
    }).select().single();
    return { data, error };
  }

  /* ==========================================================
     SETTINGS
     ========================================================== */
  async function getSiteSettings() {
    const { data, error } = await getClient().from('site_settings').select('*').eq('id', 1).maybeSingle();
    return { data, error };
  }

  async function updateSiteSettings(updates) {
    const { data, error } = await getClient().from('site_settings').update(updates).eq('id', 1).select().single();
    return { data, error };
  }

  /* ==========================================================
     REALTIME
     ========================================================== */
  function subscribeToVotes(callback) {
    const channel = getClient().channel('votes-channel').on('postgres_changes', {
      event: '*', schema: 'public', table: 'votes'
    }, (payload) => callback(payload)).subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, callback) {
    const channel = getClient().channel('matches-' + tournamentId).on('postgres_changes', {
      event: '*', schema: 'public', table: 'matches', filter: 'tournament_id=eq.' + tournamentId
    }, (payload) => callback(payload)).subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToChat(callback) {
    const channel = getClient().channel('chat-channel').on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages'
    }, (payload) => callback(payload.new)).subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToComments(tournamentId, callback) {
    const channel = getClient().channel('comments-' + tournamentId).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'comments', filter: 'tournament_id=eq.' + tournamentId
    }, (payload) => callback(payload.new)).subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function unsubscribeAll() {
    realtimeChannels.forEach(ch => { try { getClient().removeChannel(ch); } catch(e) {} });
    realtimeChannels = [];
  }

  /* ==========================================================
     ADMIN
     ========================================================== */
  async function isAdmin() {
    const profile = await getProfile();
    return profile?.role === 'admin';
  }

  async function getAllUsers() {
    const { data, error } = await getClient().from('profiles').select('*').order('created_at', { ascending: false });
    return { data, error };
  }

  async function setUserRole(userId, role) {
    const { data, error } = await getClient().from('profiles').update({ role }).eq('id', userId).select().single();
    return { data, error };
  }

  async function getAdminLogs(limit) {
    const { data, error } = await getClient().from('admin_logs').select('*').order('created_at', { ascending: false }).limit(limit || 100);
    return { data, error };
  }

  async function logAction(action, details) {
    const user = await getCurrentUser();
    const { error } = await getClient().from('admin_logs').insert({ user_id: user?.id, action, details: details || {} });
    return { error };
  }

  /* ==========================================================
     EXPORT
     ========================================================== */
  window.TH = {
    init, getClient,
    getBasePath, getBaseUrl,
    signUp, signIn, signInWithProvider, signOut,
    getCurrentUser, getSession, getProfile, updateProfile, upsertProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers,
    getMatches, updateMatch,
    castVote, hasVoted,
    getComments, addComment, deleteComment,
    getChatMessages, sendChatMessage,
    getSiteSettings, updateSiteSettings,
    subscribeToVotes, subscribeToMatches, subscribeToChat, subscribeToComments, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction
  };

  // FIX: auto-init при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }

})();
