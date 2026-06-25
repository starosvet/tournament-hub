/* ============================================================
   OAuth Init — Конфигурация Supabase (FIXED v6 — unified config, no conflicts)
   Загружается синхронно ПЕРВЫМ, до всех остальных скриптов
   ============================================================ */
(function() {
  'use strict';

  const SUPABASE_URL = 'https://fpabooteqfahhzobcpnh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac';

  // FIX: basePath определяется динамически в supabase-client.js,
  // здесь оставляем пустым — supabase-client.js разберётся сам
  const BASE_PATH = '';

  if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded!');
    return;
  }

  window._supabaseConfig = {
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY,
    basePath: BASE_PATH,
    options: {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true  // ← FIX: включено! Supabase сам обработает OAuth callback
      },
      realtime: { params: { eventsPerSecond: 10 } }
    }
  };

  console.log('✅ Supabase config ready');

  // FIX: больше не создаём клиент здесь — это делает supabase-client.js
  // чтобы избежать race condition и дублирования
})();
