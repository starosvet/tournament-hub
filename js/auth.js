/* Tournament Hub — Auth via Supabase */
import { supabase, getUser, isAdminSync, toast } from './supabase.js'

// ═══════════════════════════════════════
// EMAIL/PASS AUTH
// ═══════════════════════════════════════

export async function register(email, password, username) {
  if (!email?.trim() || !password || password.length < 6) {
    return { success: false, error: 'Email и пароль (мин. 6 символов) обязательны' }
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: username?.trim() || email.split('@')[0] }
    }
  })

  if (error) return { success: false, error: error.message }

  return { success: true, user: data.user }
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  })

  if (error) return { success: false, error: error.message }

  return { success: true, user: data.user }
}

export async function logout() {
  await supabase.auth.signOut()
  localStorage.removeItem('th_admin')
  localStorage.removeItem('th_fp') // Очищаем fingerprint гостя
}

// ═══════════════════════════════════════
// FANDOM AUTH (упрощённый — через Edge Function)
// =======================================
// Пока Edge Function не настроена, делаем через обычный вход
// с фиктивным email. Позже заменим на нормальную интеграцию.
// ═══════════════════════════════════════

const FANDOM_CODE_KEY = 'th_fandom_pending'

export function startFandomAuth(fandomName) {
  if (!fandomName?.trim()) {
    return { ok: false, error: 'Введите имя пользователя Fandom' }
  }

  const code = 'TH-' + Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('')

  const pending = {
    code,
    fandomName: fandomName.trim(),
    createdAt: Date.now()
  }

  localStorage.setItem(FANDOM_CODE_KEY, JSON.stringify(pending))
  return { ok: true, code, fandomName: pending.fandomName }
}

export function getPendingFandomAuth() {
  const raw = localStorage.getItem(FANDOM_CODE_KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (Date.now() - p.createdAt > 10 * 60 * 1000) { // 10 минут
      localStorage.removeItem(FANDOM_CODE_KEY)
      return null
    }
    return p
  } catch {
    localStorage.removeItem(FANDOM_CODE_KEY)
    return null
  }
}

export function clearPendingFandomAuth() {
  localStorage.removeItem(FANDOM_CODE_KEY)
}

// Проверка кода через Fandom API (как раньше, но упрощённо)
export async function verifyFandomCode(fandomName, code) {
  const url = `https://chickengun-fanon.fandom.com/ru/api.php?action=query&list=recentchanges&rcuser=${encodeURIComponent(fandomName)}&rclimit=20&rcprop=comment|timestamp|user&format=json&origin=*`

  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, error: 'Ошибка связи с Fandom' }
    const data = await res.json()
    const changes = data.query?.recentchanges || []

    const regex = new RegExp(`(^|\\s)${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)

    for (const rc of changes) {
      if (regex.test(rc.comment || '')) {
        return { ok: true, fandomName: rc.user }
      }
    }

    return { ok: false, error: 'Код не найден в правках' }
  } catch (e) {
    return { ok: false, error: 'Ошибка сети' }
  }
}

// Завершение Fandom-авторизации — создаём пользователя в Supabase
export async function completeFandomAuth(fandomName) {
  const email = `fandom_${fandomName.replace(/\s+/g, '_').toLowerCase()}@tournament.local`
  const password = crypto.randomUUID()

  // Регистрируем (если уже есть — signUp вернёт ошибку, тогда логинимся)
  let { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: fandomName,
        fandom_name: fandomName,
        auth_type: 'fandom'
      }
    }
  })

  // Если пользователь уже существует — логинимся
  if (error?.message?.includes('already registered') || error?.code === 'user_already_exists') {
    // Пробуем получить сохранённый пароль
    const savedPass = localStorage.getItem('th_fandom_pass_' + fandomName)
    if (savedPass) {
      const loginRes = await supabase.auth.signInWithPassword({ email, password: savedPass })
      data = loginRes.data
      error = loginRes.error
    } else {
      // Нет сохранённого пароля — нельзя войти
      return { ok: false, error: 'Аккаунт существует, но пароль утерян. Обратитесь к админу.' }
    }
  }

  if (error) return { ok: false, error: error.message }

  // Сохраняем пароль для будущих входов
  localStorage.setItem('th_fandom_pass_' + fandomName, password)

  // Проверяем админство (из настроек)
  const { data: settings } = await supabase.from('settings').select('fandom_admins').single()
  const isAdmin = settings?.fandom_admins?.includes(fandomName)

  if (isAdmin) {
    // Обновляем метаданные (нужно через admin API, пока вручную в Dashboard)
    // Либо делаем RPC-вызов, если настроили
    localStorage.setItem('th_admin', 'yes')
  }

  clearPendingFandomAuth()
  return { ok: true, user: data.user, isAdmin }
}

// ═══════════════════════════════════════
// NAV UI
// ═══════════════════════════════════════

export async function renderNavUser() {
  const box = document.getElementById('navUser') || document.getElementById('user-area')
  if (!box) return

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const name = user.user_metadata?.username || user.email?.split('@')[0] || 'Пользователь'
    const adminBadge = isAdminSync() ? ' <span style="color:var(--accent);font-size:11px;">👑</span>' : ''

    box.innerHTML = `
      <span style="color:var(--text-3);font-size:13px;">${escapeHTML(name)}${adminBadge}</span>
      <button type="button" class="btn-secondary" style="margin-left:10px;padding:8px 12px;font-size:12px;" onclick="Auth.logout().then(()=>location.reload())">Выйти</button>
    `
  } else {
    box.innerHTML = `<a href="login.html" style="color:var(--text-3);font-size:13px;">Войти</a>`
  }
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════

export function initAuth() {
  renderNavUser()

  // Слушаем изменения сессии
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      renderNavUser()
      // Показываем админ-ссылку если нужно
      const navAdmin = document.getElementById('navAdmin')
      if (navAdmin && isAdminSync()) navAdmin.classList.remove('hidden')
    }
    if (event === 'SIGNED_OUT') {
      renderNavUser()
      const navAdmin = document.getElementById('navAdmin')
      if (navAdmin) navAdmin.classList.add('hidden')
    }
  })
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function escapeHTML(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ═══════════════════════════════════════
// LEGACY COMPAT (чтобы старый код не ломался)
// ═══════════════════════════════════════

export const Auth = {
  register,
  login,
  logout,
  isAdmin: isAdminSync,
  renderNavUser,
  initAuth,
  // Fandom
  startFandomAuth,
  getPendingFandomAuth,
  clearPendingFandomAuth,
  verifyFandomCode,
  completeFandomAuth
}

// Глобальная доступность для onclick в HTML
window.Auth = Auth
