// Подключаем Supabase (CDN, без npm)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ЗАМЕНИ на свои значения из Dashboard → Settings → API
const SUPABASE_URL = 'https://ТВОЙ-ПРОЕКТ.supabase.co'
const SUPABASE_KEY = 'eyJ...твой-anon-ключ...'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- Auth helpers ---

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function isAdmin() {
  const { data } = await supabase.auth.getUser()
  return data.user?.app_metadata?.role === 'admin'
}

// --- Fingerprint для гостей ---

export function getFingerprint() {
  let fp = localStorage.getItem('th_fp')
  if (!fp) {
    fp = crypto.randomUUID()
    localStorage.setItem('th_fp', fp)
  }
  return fp
}
