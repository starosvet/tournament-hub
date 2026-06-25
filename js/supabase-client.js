/* ============================================================
   Tournament Hub — Supabase Client
   Единая точка входа для всех операций с Supabase
   ============================================================ */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // КОНФИГУРАЦИЯ — ЗАМЕНИТЕ НА СВОИ ДАННЫЕ ИЗ SUPABASE
  // ═══════════════════════════════════════════════════════════
  const SUPABASE_URL = 'https://fpabooteqfahhzobcpnh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac';

  // Глобальный клиент
  let supabase = null;
  let realtimeChannels = [];
  let voteCallbacks = [];
  let chatCallbacks = [];
  let matchCallbacks = [];

  /* ==========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================== */

  function init() {
    if (typeof window.supabase === 'undefined') {
      console.error('❌ Supabase library not loaded! Add: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
      return false;
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    window._supabase = supabase;
    console.log('✅ Supabase initialized');
    return true;
  }

  function getClient() {
    if (!supabase) init();
    return supabase;
  }

  /* ==========================================================
     AUTH — АВТОРИЗАЦИЯ
     ========================================================== */

  async function signUp(email, password, metadata) {
    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    return { data, error };
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  }

  async function signInWithProvider(provider) {
    const { data, error } = await getClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/login.html'
      }
    });
    return { data, error };
  }

  async function signOut() {
    // Отписываемся от realtime перед выходом
    unsubscribeAll();
    const { error } = await getClient().auth.signOut();
    return { error };
  }

  async function getCurrentUser() {
    const { data: { user } } = await getClient().auth.getUser();
    return user;
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
      .single();

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

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }

  /* ==========================================================
     TOURNAMENTS — ТУРНИРЫ
     ========================================================== */

  async function getTournaments(status) {
    let query = getClient()
      .from('tournaments')
      .select(`
        *,
        players:players(*),
        rounds:rounds(*, matches:matches(*, player1:player1_id(*), player2:player2_id(*), winner:winner_id(*)))
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    return { data, error };
  }

  async function getTournament(id) {
    const { data, error } = await getClient()
      .from('tournaments')
      .select(`
        *,
        players:players(*),
        rounds:rounds(*, matches:matches(*, player1:player1_id(*), player2:player2_id(*), winner:winner_id(*)))
      `)
      .eq('id', id)
      .single();

    return { data, error };
  }

  async function createTournament(tournament) {
    const { data, error } = await getClient()
      .from('tournaments')
      .insert(tournament)
      .select()
      .single();

    return { data, error };
  }

  async function updateTournament(id, updates) {
    const { data, error } = await getClient()
      .from('tournaments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  async function deleteTournament(id) {
    const { error } = await getClient()
      .from('tournaments')
      .delete()
      .eq('id', id);

    return { error };
  }

  /* ==========================================================
     PLAYERS — УЧАСТНИКИ
     ========================================================== */

  async function getPlayers(tournamentId) {
    const { data, error } = await getClient()
      .from('players')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('seed', { ascending: true });

    return { data, error };
  }

  async function createPlayers(players) {
    const { data, error } = await getClient()
      .from('players')
      .insert(players)
      .select();

    return { data, error };
  }

  async function updatePlayer(id, updates) {
    const { data, error } = await getClient()
      .from('players')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  /* ==========================================================
     MATCHES — МАТЧИ
     ========================================================== */

  async function getMatches(tournamentId, roundId) {
    let query = getClient()
      .from('matches')
      .select(`
        *,
        player1:player1_id(*),
        player2:player2_id(*),
        winner:winner_id(*)
      `)
      .order('match_order', { ascending: true });

    if (tournamentId) query = query.eq('tournament_id', tournamentId);
    if (roundId) query = query.eq('round_id', roundId);

    const { data, error } = await query;
    return { data, error };
  }

  async function updateMatch(id, updates) {
    const { data, error } = await getClient()
      .from('matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  /* ==========================================================
     VOTES — ГОЛОСОВАНИЕ
     ========================================================== */

  async function castVote(matchId, tournamentId, playerNumber) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };

    const { data, error } = await getClient()
      .from('votes')
      .insert({
        match_id: matchId,
        tournament_id: tournamentId,
        user_id: user.id,
        player_number: playerNumber
      })
      .select()
      .single();

    return { data, error };
  }

  async function hasVoted(matchId) {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data, error } = await getClient()
      .from('votes')
      .select('id')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .maybeSingle();

    return !!data;
  }

  async function getVoteCounts(matchId) {
    const { data, error } = await getClient()
      .rpc('count_match_votes', { match_uuid: matchId });

    return { data, error };
  }

  /* ==========================================================
     COMMENTS — КОММЕНТАРИИ
     ========================================================== */

  async function getComments(tournamentId) {
    const { data, error } = await getClient()
      .from('comments')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false });

    return { data, error };
  }

  async function addComment(tournamentId, text) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };

    const profile = await getProfile();

    const { data, error } = await getClient()
      .from('comments')
      .insert({
        tournament_id: tournamentId,
        user_id: user.id,
        username: profile?.display_name || profile?.username || 'Аноним',
        text: text.trim()
      })
      .select()
      .single();

    return { data, error };
  }

  async function deleteComment(id) {
    const { error } = await getClient()
      .from('comments')
      .delete()
      .eq('id', id);

    return { error };
  }

  /* ==========================================================
     CHAT — ОБЩИЙ ЧАТ
     ========================================================== */

  async function getChatMessages(limit = 200) {
    const { data, error } = await getClient()
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(limit);

    return { data, error };
  }

  async function sendChatMessage(text) {
    const user = await getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };

    const profile = await getProfile();

    const { data, error } = await getClient()
      .from('chat_messages')
      .insert({
        user_id: user.id,
        username: profile?.display_name || profile?.username || 'Аноним',
        text: text.trim()
      })
      .select()
      .single();

    return { data, error };
  }

  /* ==========================================================
     SETTINGS — НАСТРОЙКИ САЙТА
     ========================================================== */

  async function getSiteSettings() {
    const { data, error } = await getClient()
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .single();

    return { data, error };
  }

  async function updateSiteSettings(updates) {
    const { data, error } = await getClient()
      .from('site_settings')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    return { data, error };
  }

  /* ==========================================================
     REALTIME — МГНОВЕННЫЕ ОБНОВЛЕНИЯ
     ========================================================== */

  function subscribeToVotes(callback) {
    voteCallbacks.push(callback);

    const channel = getClient()
      .channel('votes-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'votes'
      }, (payload) => {
        voteCallbacks.forEach(cb => cb(payload));
      })
      .subscribe();

    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToMatches(tournamentId, callback) {
    matchCallbacks.push(callback);

    const channel = getClient()
      .channel('matches-' + tournamentId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: 'tournament_id=eq.' + tournamentId
      }, (payload) => {
        matchCallbacks.forEach(cb => cb(payload));
      })
      .subscribe();

    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToChat(callback) {
    chatCallbacks.push(callback);

    const channel = getClient()
      .channel('chat-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        chatCallbacks.forEach(cb => cb(payload.new));
      })
      .subscribe();

    realtimeChannels.push(channel);
    return channel;
  }

  function subscribeToTournament(tournamentId, callback) {
    const channel = getClient()
      .channel('tournament-' + tournamentId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tournaments',
        filter: 'id=eq.' + tournamentId
      }, (payload) => {
        callback(payload.new);
      })
      .subscribe();

    realtimeChannels.push(channel);
    return channel;
  }

  function unsubscribeAll() {
    realtimeChannels.forEach(ch => {
      try { getClient().removeChannel(ch); } catch(e) {}
    });
    realtimeChannels = [];
    voteCallbacks = [];
    chatCallbacks = [];
    matchCallbacks = [];
  }

  /* ==========================================================
     STORAGE — ХРАНИЛИЩЕ ФАЙЛОВ
     ========================================================== */

  async function uploadAvatar(file, userId) {
    const fileExt = file.name.split('.').pop();
    const fileName = userId + '_' + Date.now() + '.' + fileExt;

    const { data, error } = await getClient()
      .storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) return { error };

    const { data: { publicUrl } } = getClient()
      .storage
      .from('avatars')
      .getPublicUrl(fileName);

    return { url: publicUrl, error: null };
  }

  async function uploadPlayerImage(file, tournamentId) {
    const fileExt = file.name.split('.').pop();
    const fileName = tournamentId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + fileExt;

    const { data, error } = await getClient()
      .storage
      .from('players')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) return { error };

    const { data: { publicUrl } } = getClient()
      .storage
      .from('players')
      .getPublicUrl(fileName);

    return { url: publicUrl, error: null };
  }

  /* ==========================================================
     ADMIN — АДМИНИСТРАТОРСКИЕ ФУНКЦИИ
     ========================================================== */

  async function isAdmin() {
    const profile = await getProfile();
    return profile?.role === 'admin';
  }

  async function getAllUsers() {
    const { data, error } = await getClient()
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    return { data, error };
  }

  async function setUserRole(userId, role) {
    const { data, error } = await getClient()
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  }

  async function getAdminLogs(limit = 100) {
    const { data, error } = await getClient()
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data, error };
  }

  async function logAction(action, details = {}) {
    const user = await getCurrentUser();

    const { error } = await getClient()
      .from('admin_logs')
      .insert({
        user_id: user?.id,
        action,
        details
      });

    return { error };
  }

  /* ==========================================================
     ELO — РЕЙТИНГОВАЯ СИСТЕМА
     ========================================================== */

  async function getEloRatings(tournamentId) {
    const { data, error } = await getClient()
      .from('elo_ratings')
      .select('*, player:player_id(*)')
      .eq('tournament_id', tournamentId)
      .order('rating', { ascending: false });

    return { data, error };
  }

  /* ==========================================================
     OFFLINE / КЭШИРОВАНИЕ
     ========================================================== */

  function cacheSet(key, value, ttlMinutes = 5) {
    const item = {
      value,
      expires: Date.now() + ttlMinutes * 60000
    };
    localStorage.setItem('th_cache_' + key, JSON.stringify(item));
  }

  function cacheGet(key) {
    const raw = localStorage.getItem('th_cache_' + key);
    if (!raw) return null;
    try {
      const item = JSON.parse(raw);
      if (item.expires < Date.now()) {
        localStorage.removeItem('th_cache_' + key);
        return null;
      }
      return item.value;
    } catch (e) {
      return null;
    }
  }

  function cacheClear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith('th_cache_'))
      .forEach(k => localStorage.removeItem(k));
  }

  /* ==========================================================
     ЭКСПОРТ
     ========================================================== */

  window.TH = {
    // Init
    init,
    getClient,

    // Auth
    signUp,
    signIn,
    signInWithProvider,
    signOut,
    getCurrentUser,
    getSession,
    getProfile,
    updateProfile,
    onAuthStateChange,

    // Tournaments
    getTournaments,
    getTournament,
    createTournament,
    updateTournament,
    deleteTournament,

    // Players
    getPlayers,
    createPlayers,
    updatePlayer,

    // Matches
    getMatches,
    updateMatch,

    // Votes
    castVote,
    hasVoted,
    getVoteCounts,

    // Comments
    getComments,
    addComment,
    deleteComment,

    // Chat
    getChatMessages,
    sendChatMessage,

    // Settings
    getSiteSettings,
    updateSiteSettings,

    // Realtime
    subscribeToVotes,
    subscribeToMatches,
    subscribeToChat,
    subscribeToTournament,
    unsubscribeAll,

    // Storage
    uploadAvatar,
    uploadPlayerImage,

    // Admin
    isAdmin,
    getAllUsers,
    setUserRole,
    getAdminLogs,
    logAction,

    // ELO
    getEloRatings,

    // Cache
    cacheSet,
    cacheGet,
    cacheClear
  };

})();
