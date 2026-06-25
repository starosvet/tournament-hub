/* ============================================================
   OAuth Init — MUST be loaded synchronously BEFORE all other scripts
   ============================================================ */
(function() {
  'use strict';
  const SUPABASE_URL = 'https://fpabooteqfahhzobcpnh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwYWJvb3RlcWZhaGh6b2JjcG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjgwOTIsImV4cCI6MjA5NzkwNDA5Mn0.cc1oG5-73US61LI9uDaPwuQsOjLkIAPxDcfGQvVY9Ac';

  if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase library not loaded!');
    return;
  }

  window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  console.log('✅ Supabase initialized via oauth-init.js');
})();
