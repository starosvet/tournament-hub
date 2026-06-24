/* Tournament Hub — Supabase Client */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ═══════════════════════════════════════
// КОНФИГ (замени на свои значения!)
// ═══════════════════════════════════════
const SUPABASE_URL = 'https://fpabooteqfahhzobcpnh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ═══════════════════════════════════════
// КЭШ (оптимизация: не гоним повторные запросы)
// ═══════════════════════════════════════
const cache = new Map()
const CACHE_TTL = 30000 // 30 секунд

function getCache(key) {
  const item = cache.get(key)
  if (!item) return null
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return item.data
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() })
}

function clearCache(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key)
  }
}

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function isAdmin() {
  const { data } = await supabase.auth.getUser()
  return data.user?.app_metadata?.role === 'admin'
}

// Для быстрой синхронной проверки в UI (из сессии)
export function isAdminSync() {
  // Читаем из localStorage кэша сессии (supabase хранит там)
  try {
    const session = JSON.parse(localStorage.getItem('sb-' + SUPABASE_URL.replace('https://', '').replace('.supabase.co', '') + '-auth-token') || '{}')
    return session?.user?.app_metadata?.role === 'admin'
  } catch { return false }
}

// Fingerprint для гостей (антинакрутка без регистрации)
export function getFingerprint() {
  let fp = localStorage.getItem('th_fp')
  if (!fp) {
    fp = crypto.randomUUID()
    localStorage.setItem('th_fp', fp)
  }
  return fp
}

// ═══════════════════════════════════════
// SETTINGS (кэшируем — редко меняются)
// ═══════════════════════════════════════

export async function getSettings() {
  const cached = getCache('settings')
  if (cached) return cached

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single()

  if (error) {
    // Fallback на дефолт
    return {
      site_name: 'Tournament Hub',
      description: 'Турниры для вашей вики',
      site_logo: '🏆',
      theme: 'amber',
      fandom_admins: []
    }
  }

  setCache('settings', data)
  return data
}

// ═══════════════════════════════════════
// TOURNAMENTS (пагинация + кэш)
// ═══════════════════════════════════════

export async function listTournaments(limit = 20, offset = 0) {
  const cacheKey = `tournaments_${limit}_${offset}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase
    .from('tournaments')
    .select('id, title, description, status, current_round, created_at, completed_at, winner_id, players(count)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('listTournaments:', error)
    return []
  }

  setCache(cacheKey, data)
  return data
}

export async function getTournament(id) {
  const cacheKey = `tournament_${id}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      *,
      players(*),
      rounds(
        *,
        matches(
          *,
          player1:player1_id(id, name, image, type),
          player2:player2_id(id, name, image, type),
          winner:winner_id(id, name, image)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('getTournament:', error)
    return null
  }

  setCache(cacheKey, data)
  return data
}

export async function getActiveTournament() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return getTournament(data.id)
}

// ═══════════════════════════════════════
// VOTES (через RPC — безопасно)
// ═══════════════════════════════════════

export async function vote(matchId, playerNum) {
  const fp = getFingerprint()
  const { data, error } = await supabase.rpc('vote', {
    p_match_id: matchId,
    p_player_num: playerNum,
    p_fingerprint: fp
  })

  if (error) {
    console.error('vote:', error)
    return { success: false, error: error.message }
  }

  clearCache('tournament_') // Инвалидируем кэш
  return { success: data === true }
}

// ═══════════════════════════════════════
// COMMENTS (пагинация — не грузим всё)
// ═══════════════════════════════════════

export async function listComments(tournamentId, limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, username, text, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('listComments:', error)
    return []
  }
  return data
}

export async function addComment(tournamentId, text) {
  const user = await getUser()
  if (!user) return { success: false, error: 'Не авторизован' }

  const { error } = await supabase.from('comments').insert({
    tournament_id: tournamentId,
    user_id: user.id,
    username: user.user_metadata?.username || user.email?.split('@')[0] || 'Аноним',
    text: text.trim().slice(0, 1000) // Лимит 1000 символов
  })

  if (error) {
    console.error('addComment:', error)
    return { success: false, error: error.message }
  }

  clearCache('comments_')
  return { success: true }
}

// ═══════════════════════════════════════
// CHAT (последние 200 сообщений)
// ═══════════════════════════════════════

export async function listChatMessages(limit = 200) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, username, text, created_at')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('listChat:', error)
    return []
  }
  return data
}

export async function sendChatMessage(text) {
  const user = await getUser()
  if (!user) return { success: false, error: 'Не авторизован' }

  const { error } = await supabase.from('chat_messages').insert({
    user_id: user.id,
    username: user.user_metadata?.username || user.email?.split('@')[0] || 'Аноним',
    text: text.trim().slice(0, 500) // Лимит 500 символов
  })

  if (error) {
    console.error('sendChat:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ═══════════════════════════════════════
// STATS (агрегаты — считаем на сервере)
// ═══════════════════════════════════════

export async function getStats() {
  const { data: tourneys, error: e1 } = await supabase
    .from('tournaments')
    .select('id', { count: 'exact', head: true })

  const { data: users, error: e2 } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })

  const { data: matchesCount, error: e3 } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })

  return {
    tournaments: tourneys?.length ?? 0,
    users: users?.length ?? 0,
    matches: matchesCount?.length ?? 0
  }
}

// ═══════════════════════════════════════
// REALTIME ПОДПИСКИ
// ═══════════════════════════════════════

export function subscribeToMatch(matchId, callback) {
  return supabase
    .channel('match-' + matchId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'matches',
      filter: 'id=eq.' + matchId
    }, (payload) => callback(payload.new))
    .subscribe()
}

export function subscribeToChat(callback) {
  return supabase
    .channel('chat')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages'
    }, (payload) => callback(payload.new))
    .subscribe()
}

export function subscribeToComments(tournamentId, callback) {
  return supabase
    .channel('comments-' + tournamentId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: 'tournament_id=eq.' + tournamentId
    }, (payload) => callback(payload.new))
    .subscribe()
}

// ═══════════════════════════════════════
// ADMIN: CRUD операции (требуют admin-роль в RLS)
// ═══════════════════════════════════════

export async function createTournament(title, description, playersRaw) {
  // playersRaw = массив строк "Имя | URL" или объектов
  const players = playersRaw.map(p => {
    if (typeof p === 'string') {
      const parts = p.split('|').map(s => s.trim())
      return { name: parts[0], image: parts[1] || '', type: 'character', description: '' }
    }
    return p
  }).filter(p => p.name)

  if (players.length < 2) return { success: false, error: 'Минимум 2 участника' }

  // 1. Создаём турнир
  const { data: tourney, error: err1 } = await supabase
    .from('tournaments')
    .insert({ title: title.trim(), description: description.trim(), status: 'draft' })
    .select()
    .single()

  if (err1) return { success: false, error: err1.message }

  // 2. Добавляем игроков
  const { error: err2 } = await supabase
    .from('players')
    .insert(players.map(p => ({
      tournament_id: tourney.id,
      name: p.name,
      image: p.image,
      type: p.type || 'character',
      description: p.description || ''
    })))

  if (err2) return { success: false, error: err2.message }

  clearCache('tournaments_')
  return { success: true, tournament: tourney }
}

export async function deleteTournament(id) {
  // Каскадное удаление сработает автоматически (on delete cascade)
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  clearCache('tournament_')
  clearCache('tournaments_')
  return { success: !error, error: error?.message }
}

export async function updateTournament(id, updates) {
  const { error } = await supabase.from('tournaments').update(updates).eq('id', id)
  clearCache('tournament_' + id)
  return { success: !error, error: error?.message }
}

// ═══════════════════════════════════════
// TOAST (универсальное уведомление)
// ═══════════════════════════════════════

export function toast(msg, duration = 2200) {
  const existing = document.getElementById('th-toast')
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.id = 'th-toast'
  el.textContent = msg
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:24px',
    'transform:translateX(-50%)',
    'padding:12px 16px',
    'border-radius:12px',
    'background:rgba(17,24,39,0.95)',
    'color:#fff',
    'font:14px/1.4 system-ui,sans-serif',
    'z-index:99999',
    'max-width:min(92vw,680px)',
    'box-shadow:0 10px 30px rgba(0,0,0,.28)'
  ].join(';')

  document.body.appendChild(el)
  setTimeout(() => { if (el.isConnected) el.remove() }, duration)
}

// ═══════════════════════════════════════
// INIT: синхронизация сессии
// ═══════════════════════════════════════

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    clearCache('')
    // Обновляем UI если есть колбэк
    if (typeof window.onAuthChange === 'function') {
      window.onAuthChange(session?.user || null)
    }
  }
  if (event === 'SIGNED_OUT') {
    clearCache('')
    localStorage.removeItem('th_admin')
  }
})
