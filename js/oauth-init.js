/* ============================================================
   OAuth Init — ЕДИНСТВЕННАЯ инициализация Supabase (FIXED v3)
   Загружается синхронно ПЕРВЫМ, до всех остальных скриптов
   ============================================================ */
(function() {
  'use strict';
  
  const SUPABASE_URL = 'https://fpabooteqfahhzobcpnh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac';

  if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded!');
    return;
  }

  // FIX: НЕ создаём клиент здесь — доверяем supabase-client.js
  // Вместо этого просто сохраняем конфиг для единой инициализации
  window._supabaseConfig = {
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY,
    options: {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true  // Supabase сам обработает OAuth
      },
      realtime: { params: { eventsPerSecond: 10 } }
    }
  };
  
  console.log('✅ Supabase config ready');
})();
