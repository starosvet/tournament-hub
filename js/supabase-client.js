/* ============================================================
   Tournament Hub — Supabase Client (OPTIMIZED v10 — perfect sync & safe init)
   ============================================================ */

(function () {
  'use strict';

  let realtimeChannels = [];
  let initDone = false;

  function getBasePath() {
    const path = window.location.pathname;
    const match = path.match(/^(.+?)\\/(?:index\\.html|[^/]+\\.html)?$/);
    if (match) {
      const base = match[1];
      if (base && base !== '') return base;
    }
    return window._supabaseConfig?.basePath || '';
  }

  function getBaseUrl() {
    return window.location.origin + getBasePath();
  }

  async function init() {
    if (initDone) return true;
    if (window._supabase) {
      initDone = true;
      window.TH.isReady = true;
      return true;
    }

    if (typeof window.supabase === 'undefined') {
      console.error('❌ Supabase library not loaded!');
      return false;
    }

    const cfg = window._supabaseConfig || {};
    const url = cfg.url || 'https://fpabooteqfahhzobcpnh.supabase.co';
    const key = cfg.key || '';

    try {
      window._supabase = window.supabase.createClient(url, key, cfg.options);
      
      // Гарантируем проверку сессии перед тем, как сказать системе "готово"
      await window._supabase.auth.getSession();
      
      initDone = true;
      window.TH.isReady = true; // Критический флаг готовности для HTML страниц
      console.log('✅ Supabase client successfully initialized');
      return true;
    } catch (e) {
      console.error('❌ Supabase initialization failed:', e);
      return false;
    }
  }

  function getClient() {
    if (!window._supabase) {
      const cfg = window._supabaseConfig || {};
      window._supabase = window.supabase.createClient(cfg.url, cfg.key, cfg.options);
    }
    return window._supabase;
  }

  async function signUp(email, password, metadata) {
    return await getClient().auth.signUp({
      email, password, options: { data: metadata, redirectTo: getBaseUrl() + '/login.html' }
    });
  }

  async function signIn(email, password) {
    return await getClient().auth.signInWithPassword({ email, password });
  }

  async function signInWithProvider(provider) {
    return await getClient().auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: getBaseUrl() + '/login.html' }
    });
  }

  async function signOut() {
    window.TH.unsubscribeAll();
    return await getClient().auth.signOut();
  }

  async function getSession() {
    const { data } = await getClient().auth.getSession();
    return data?.session || null;
  }

  async function getCurrentUser() {
    const { data } = await getClient().auth.getUser();
    if (!data?.user) return null;
    const profile = await getProfile();
    return {
      id: data.user.id,
      email: data.user.email,
      username: profile?.username || data.user.user_metadata?.username || 'User',
      displayName: profile?.display_name || data.user.user_metadata?.display_name || 'User',
      role: profile?.role || 'user',
      fandomName: profile?.fandom_name || null,
      fandomVerified: profile?.fandom_verified || false
    };
  }

  async function getProfile() {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) return null;
    const { data } = await getClient().from('profiles').select('*').eq('id', user.id).maybeSingle();
    return data;
  }

  async function updateProfile(updates) {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) return { error: new Error('No user') };
    return await getClient().from('profiles').update(updates).eq('id', user.id);
  }

  async function upsertProfile(profile) {
    return await getClient().from('profiles').upsert(profile);
  }

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange(callback);
  }

  async function getTournaments() {
    return await getClient().from('tournaments').select('*').order('created_at', { ascending: false });
  }

  async function getTournament(id) {
    return await getClient().from('tournaments').select('*').eq('id', id).maybeSingle();
  }

  async function createTournament(t) {
    return await getClient().from('tournaments').insert(t).select().single();
  }

  async function updateTournament(id, updates) {
    return await getClient().from('tournaments').update(updates).eq('id', id);
  }

  async function deleteTournament(id) {
    return await getClient().from('tournaments').delete().eq('id', id);
  }

  async function getPlayers() {
    return await getClient().from('players').select('*').order('elo', { ascending: false });
  }

  async function createPlayers(playersArray) {
    return await getClient().from('players').upsert(playersArray);
  }

  async function getMatches(tournamentId) {
    return await getClient().from('matches').select('*').eq('tournament_id', tournamentId);
  }

  async function updateMatch(id, updates) {
    return await getClient().from('matches').update(updates).eq('id', id);
  }

  async function castVote(matchId, playerIndex) {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) return { error: new Error('Auth required') };
    return await getClient().from('votes').insert({ match_id: matchId, user_id: user.id, player_index: playerIndex });
  }

  async function hasVoted(matchId) {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) return false;
    const { data } = await getClient().from('votes').select('id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
    return !!data;
  }

  async function getComments(tournamentId) {
    return await getClient().from('comments').select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: false });
  }

  async function addComment(tournamentId, text) {
    return await getClient().from('comments').insert({ tournament_id: tournamentId, text }).select().single();
  }

  async function deleteComment(id) {
    return await getClient().from('comments').delete().eq('id', id);
  }

  async function getChatMessages(limit) {
    return await getClient().from('chat').select('*').order('created_at', { ascending: false }).limit(limit || 100);
  }

  async function sendChatMessage(text) {
    return await getClient().from('chat').insert({ text });
  }

  async function getSiteSettings() {
    return await getClient().from('site_settings').select('*').limit(1).maybeSingle();
  }

  async function updateSiteSettings(updates) {
    return await getClient().from('site_settings').update(updates).eq('id', 1);
  }

  function subscribeToVotes(matchId, onChanges) {
    const channel = getClient().channel(`votes-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `match_id=eq.${matchId}` }, onChanges)
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, onChanges) {
    const channel = getClient().channel(`matches-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, onChanges)
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToChat(onChanges) {
    const channel = getClient().channel('global-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, onChanges)
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToComments(tournamentId, onChanges) {
    const channel = getClient().channel(`comments-${tournamentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `tournament_id=eq.${tournamentId}` }, onChanges)
      .subscribe();
    realtimeChannels.push(channel);
    return channel;
  }

  function unsubscribeAll() {
    realtimeChannels.forEach(ch => getClient().removeChannel(ch));
    realtimeChannels = [];
  }

  async function isAdmin() {
    const user = await getCurrentUser();
    return user?.role === 'admin';
  }

  async function getAllUsers() {
    return await getClient().from('profiles').select('*').order('username');
  }

  async function setUserRole(userId, role) {
    return await getClient().from('profiles').update({ role }).eq('id', userId);
  }

  async function getAdminLogs(limit) {
    return await getClient().from('admin_logs').select('*').order('created_at', { ascending: false }).limit(limit || 100);
  }

  async function logAction(action, details) {
    const user = await getCurrentUser();
    return await getClient().from('admin_logs').insert({ user_id: user?.id, action, details: details || {} });
  }

  window.TH = {
    init, getClient, getBasePath, getBaseUrl,
    signUp, signIn, signInWithProvider, signOut,
    getCurrentUser, getSession, getProfile, updateProfile, upsertProfile, onAuthStateChange,
    getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
    getPlayers, createPlayers, getMatches, updateMatch, castVote, hasVoted,
    getComments, addComment, deleteComment, getChatMessages, sendChatMessage,
    getSiteSettings, updateSiteSettings, subscribeToVotes, subscribeToMatches, subscribeToChat, subscribeToComments, unsubscribeAll,
    isAdmin, getAllUsers, setUserRole, getAdminLogs, logAction,
    isReady: false
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 20));
  } else {
    setTimeout(init, 20);
  }
})();
