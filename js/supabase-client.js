/* ============================================================
   Tournament Hub — Supabase Client (FIXED v10 — persistent sessions, correct paths)
   ============================================================ */
(function () {
  'use strict';

  let realtimeChannels = [];
  let initDone = false;
  let supabaseInstance = null;

  function getBasePath() {
    const path = window.location.pathname;
    const match = path.match(/^(.+?)\/(?:index\.html|[^/]+\.html)?$/);
    if (match) {
      const base = match[1];
      if (base && base !== '') return base;
    }
    return window._supabaseConfig?.basePath || '';
  }

  function getBaseUrl() {
    let url = window.location.origin + getBasePath();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  function init() {
    if (initDone) return true;
    if (window._supabase) {
      supabaseInstance = window._supabase;
      initDone = true;
      return true;
    }

    if (typeof window.supabase === 'undefined') {
      console.error('❌ Supabase SDK library not found in window global scope!');
      return false;
    }

    const cfg = window._supabaseConfig || {};
    const url = cfg.url || 'https://fpabooteqfahhzobcpnh.supabase.co';
    const key = cfg.key || '';

    if (!key) {
      console.error('❌ Supabase Anonymous Key is missing inside configuration.');
      return false;
    }

    supabaseInstance = window.supabase.createClient(url, key, cfg.options || {});
    window._supabase = supabaseInstance;
    initDone = true;
    console.log('✅ Supabase client initialized context');
    return true;
  }

  function getClient() {
    if (!initDone) init();
    return supabaseInstance;
  }

  // --- АУТЕНТИФИКАЦИЯ И ПРОФИЛИ ---
  async function signUp(email, password, metadata) {
    const client = getClient();
    return await client.auth.signUp({
      email,
      password,
      options: { data: metadata || {} }
    });
  }

  async function signIn(email, password) {
    const client = getClient();
    return await client.auth.signInWithPassword({ email, password });
  }

  async function signInWithProvider(provider) {
    const client = getClient();
    const redirectUrl = getBaseUrl() + '/login.html';
    return await client.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: redirectUrl }
    });
  }

  async function signOut() {
    const client = getClient();
    unsubscribeAll();
    return await client.auth.signOut();
  }

  async function getSession() {
    const client = getClient();
    const { data, error } = await client.auth.getSession();
    return data?.session || null;
  }

  async function getProfile(userId) {
    const client = getClient();
    if (!userId) {
      const session = await getSession();
      if (!session?.user) return null;
      userId = session.user.id;
    }
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data;
  }

  async function getCurrentUser() {
    const client = getClient();
    const { data } = await client.auth.getUser();
    if (!data?.user) return null;
    
    const profile = await getProfile(data.user.id);
    return {
      id: data.user.id,
      email: data.user.email,
      username: profile?.username || data.user.user_metadata?.username || 'User',
      displayName: profile?.display_name || data.user.user_metadata?.display_name || 'User',
      role: profile?.role || data.user.user_metadata?.role || 'user',
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

  async function upsertProfile(profileData) {
    const client = getClient();
    const { data, error } = await client.from('profiles').upsert(profileData).select().single();
    if (error) throw error;
    return data;
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    return client.auth.onAuthStateChange(async (event, session) => {
      await callback(event, session);
    });
  }

  // --- ТУРНИРЫ ---
  async function getTournaments() {
    const client = getClient();
    return await client.from('tournaments').select('*').order('created_at', { ascending: false });
  }

  async function getTournament(id) {
    const client = getClient();
    return await client.from('tournaments').select('*, rounds(*, matches(*))').eq('id', id).maybeSingle();
  }

  async function createTournament(title, description, status, config) {
    const client = getClient();
    return await client.from('tournaments').insert({ title, description, status, config }).select().single();
  }

  async function updateTournament(id, updates) {
    const client = getClient();
    return await client.from('tournaments').update(updates).eq('id', id).select().single();
  }

  async function deleteTournament(id) {
    const client = getClient();
    return await client.from('tournaments').delete().eq('id', id);
  }

  // --- УЧАСТНИКИ И МАТЧИ ---
  async function getPlayers(tournamentId) {
    const client = getClient();
    return await client.from('players').select('*').eq('tournament_id', tournamentId);
  }

  async function createPlayers(playersArray) {
    const client = getClient();
    return await client.from('players').insert(playersArray).select();
  }

  async function getMatches(roundId) {
    const client = getClient();
    return await client.from('matches').select('*').eq('round_id', roundId);
  }

  async function updateMatch(id, updates) {
    const client = getClient();
    return await client.from('matches').update(updates).eq('id', id).select().single();
  }

  // --- ГОЛОСОВАНИЕ ---
  async function castVote(matchId, playerIndex) {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    return await client.from('votes').insert({
      match_id: matchId,
      user_id: user ? user.id : null,
      player_index: playerIndex,
      is_guest: !user
    });
  }

  async function hasVoted(matchId) {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return false;
    const { data } = await client.from('votes').select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    return !!data;
  }

  // --- КОММЕНТАРИИ ---
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
      text: text
    }).select().single();
  }

  async function deleteComment(id) {
    const client = getClient();
    return await client.from('comments').delete().eq('id', id);
  }

  // --- ЧАТ ---
  async function getChatMessages(limit = 100) {
    const client = getClient();
    return await client.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(limit);
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

  // --- СИСТЕМНЫЕ НАСТРОЙКИ И АДМИНКА ---
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

  async function getAdminLogs(limit = 100) {
    const client = getClient();
    return await client.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(limit);
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

  // --- REALTIME ШИНЫ (РЕАКТИВНОСТЬ) ---
  function subscribeToChat(callback) {
    const client = getClient();
    const channel = client.channel('public-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        callback(payload.new);
      })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToComments(tournamentId, callback) {
    const client = getClient();
    const channel = client.channel(`comments-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `tournament_id=eq.${tournamentId}` }, payload => {
        callback(payload);
      })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, callback) {
    const client = getClient();
    const channel = client.channel(`matches-${tournamentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, payload => {
        callback(payload.new);
      })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToVotes(callback) {
    const client = getClient();
    const channel = client.channel('global-votes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, payload => {
        callback(payload.new);
      })
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function unsubscribeAll() {
    const client = getClient();
    realtimeChannels.forEach(ch => {
      try { client.removeChannel(ch); } catch(e) {}
    });
    realtimeChannels = [];
  }

  function isAdmin() {
    const user = JSON.parse(localStorage.getItem('th_user') || 'null');
    return user?.role === 'admin' || localStorage.getItem('th_admin') === 'yes';
  }

  // Экспорт API в глобальную область видимости
  window.TH = {
    init, getClient, getBasePath, getBaseUrl,
    signUp, signIn, signInWithProvider, signOut, getSession, getProfile, getCurrentUser, updateProfile, upsertProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers, getMatches, updateMatch,
    castVote, hasVoted, getComments, addComment, deleteComment,
    getChatMessages, sendChatMessage, getSiteSettings, updateSiteSettings,
    subscribeToChat, subscribeToComments, subscribeToMatches, subscribeToVotes, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }
})();
